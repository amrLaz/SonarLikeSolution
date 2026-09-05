# Databricks notebook source
# DBTITLE 1, Import libraries
import json
from src.notebooks.common import AppGlobals, load_conf
from src.notebooks.common.enums import (
    OperationType,
    OperationNature,
    OperationStatus,
)
from src.notebooks.common.referentials import Referentials
from src.notebooks.common.schema import Ef1tSchema
import pyspark.sql.functions as fn
import src.notebooks.utils.functions as cf
import os
from pyspark.sql import DataFrame
import datetime


# COMMAND ----------

# DBTITLE 1, Load configuration
# env widget
envs = ["test", "dev", "inte", "uat", "pprod", "prod"]
dbutils.widgets.dropdown("env", envs[1], envs, "Environment")
# slot widget
dbutils.widgets.text("slot", "", "Slot")

env: str = dbutils.widgets.get("env")
slot: str = dbutils.widgets.get("slot")
dir_name = os.path.dirname("__file__")

app_globals = AppGlobals(env, slot)
conf = load_conf(spark, app_globals.secret_scope)
referentials = Referentials(spark, dir_name)

# load product filters
product_df = referentials.distributors_settings.filter(
    (referentials.distributors_settings.environment == env) & (referentials.distributors_settings.status == "Active")
)


checkpoint_path = f"abfss://{app_globals.checkpoint_container}@upfrbenefits{env}sa.dfs.core.windows.net/RED{slot}/{env}/cadhoc_ef1t_transactions"


# COMMAND ----------

# DBTITLE 1, Event hub configuration
startTime = (
    (datetime.datetime.now() - datetime.timedelta(days=2))
    .replace(hour=0, minute=0, second=0, microsecond=0)
    .strftime("%Y-%m-%dT%H:%M:%S.%fZ")
)

starting_position = json.dumps({"offset": None, "seqNo": -1, "enqueuedTime": startTime, "isInclusive": True})
# starting_position = json.dumps({"offset": -1, "seqNo": -1, "enqueuedTime": None, "isInclusive": True})

eh_connection_string = conf.EF1T_eventhubs_connectionString
reader_event_hub_conf = {
    "eventhubs.connectionString": sc._jvm.org.apache.spark.eventhubs.EventHubsUtils.encrypt(eh_connection_string),
    "maxEventsPerTrigger": 1000,
    "eventhubs.startingPosition": starting_position,
}

writeConfigOperations = {
    "spark.cosmos.accountEndpoint": conf.benefits_cosmos_account_endpoint,
    "spark.cosmos.accountKey": conf.benefits_cosmos_account_primary_key,
    "spark.cosmos.database": conf.benefits_cadhoc_cosmos_db_name,
    "spark.cosmos.write.strategy": "ItemAppend",
    "spark.cosmos.container": "Operations",
}

writeConfigEvents = {
    "spark.cosmos.accountEndpoint": conf.benefits_cosmos_account_endpoint,
    "spark.cosmos.accountKey": conf.benefits_cosmos_account_primary_key,
    "spark.cosmos.database": conf.benefits_cadhoc_cosmos_db_name,
    "spark.cosmos.write.strategy": "ItemAppend",
    "spark.cosmos.container": "Events",
}

# COMMAND ----------

# DBTITLE 1, Read from Event Hub
input_stream_df: DataFrame = (
    spark.readStream.format("eventhubs")
    .options(**reader_event_hub_conf)
    .load()
    .withColumn("body", fn.col("body").cast("string"))
    .withColumn("_ingestionDate", fn.current_timestamp())
    .withColumn("cast", fn.from_json(fn.col("body"), Ef1tSchema))
    # filter on (operationType = AUTHORIZATION and operationNature = PURCHASE and codeRetour = 00) or (operationType = BALANCE_NOTIFICATION and operationNature = LOAD)or (operationType = BALANCE_NOTIFICATION and operationNature = UNLOAD)
    .filter(
        (fn.col("cast.notification.message.contextData.operationType") == OperationType.AUTHORIZATION.value)
        & (fn.col("cast.notification.message.contextData.operationNature") == "PURCHASE")
        # & (fn.col("cast.notification.message.contextData.codeRetour") == "00")
        | (fn.col("cast.notification.message.contextData.operationType") == "BALANCE_NOTIFICATION")
        & (fn.col("cast.notification.message.contextData.operationNature") == "LOAD")
        | (fn.col("cast.notification.message.contextData.operationType") == "BALANCE_NOTIFICATION")
        & (fn.col("cast.notification.message.contextData.operationNature") == "UNLOAD")
    )
)
# Filter only on distributor/product settings set in ../mappings/distributors_settings.csv
input_stream_df = input_stream_df.join(
    product_df.alias("product"),
    (
        (fn.col("cast.notification.message.productRef") == fn.col("product.product_reference"))
        & (fn.col("cast.notification.distributorRef") == fn.col("product.distributor_reference"))
    ),
)


# COMMAND ----------


def safe_col(df: DataFrame, col_path: str):
    """
    Safely access a nested column path. If it doesn't exist, returns a null literal.
    """
    try:
        df.select(col_path)
        return fn.col(col_path)
    except Exception:
        return fn.lit(None)


# COMMAND ----------

# DBTITLE 1, Format EF1T Transactions


def format_ef1t_transactions(input_df: DataFrame) -> DataFrame:
    transform_df = (
        input_df.select(
            fn.lit("EWL").cast("string").alias("processor"),
            fn.col("cast.notification.distributorRef").cast("string").alias("issuer_ref"),
            fn.col("cast.notification.message.productRef").cast("string").alias("product_ref"),
            fn.col("cast.notification.message.funderContractRef").cast("string").alias("funder_contract_ref"),
            fn.col("cast.notification.message.beneficiaryServiceRef").cast("string").alias("account"),
            fn.col("cast.notification.message.contextData.operationDateTime")
            .cast("timestamp")
            .alias("operationDateTime"),
            fn.substring(fn.col("operationDateTime").cast("string"), 1, 19).alias("operationDateTimeISO"),
            fn.regexp_replace(
                fn.substring("cast.notification.message.contextData.dateTransaction", 1, 19), "T", " "
            ).alias("dateTransaction"),
            fn.col("cast.notification.message.messageDate").cast("timestamp").alias("messageDate"),
            fn.col("cast.notification.message.contextData.operationType").cast("string").alias("operationType"),
            fn.col("cast.notification.message.contextData.operationNature").cast("string").alias("operationNature"),
            ############################################################
            ############ operation_type ############
            # When operationNature = PURCHASE Then PURCHASE else
            #      operationNature = LOAD     Then LOAD
            #      operationNature = UNLOAD     Then UNLOAD
            fn.when(
                fn.col("cast.notification.message.contextData.operationNature") == OperationNature.PURCHASE.value,
                "PURCHASE",
            )
            .when(
                fn.col("cast.notification.message.contextData.operationNature") == OperationNature.LOAD.value,
                "LOAD",
            )
            .when(
                fn.col("cast.notification.message.contextData.operationNature") == OperationNature.UNLOAD.value,
                "UNLOAD",
            )
            .cast("string")
            .alias("operation_type"),
            ################################################
            ############ operation_status ############
            # When operationNature = PURCHASE   and codeRetour in 00, 10    then PENDING
            # When operationNature = LOAD or UNLOAD then COMPLETED
            # Otherwise UNKNOWN
            fn.when(
                (fn.col("cast.notification.message.contextData.operationNature") == OperationNature.PURCHASE.value)
                & (fn.col("cast.notification.message.contextData.codeRetour").isin("00", "10")),
                OperationStatus.PENDING.value,
            )
            # fn.when(fn.col("cast.notification.message.contextData.operationNature") == OperationNature.PURCHASE.value, OperationStatus.PENDING.value)
            .when(
                (fn.col("cast.notification.message.contextData.operationNature") == OperationNature.PURCHASE.value)
                & (~fn.col("cast.notification.message.contextData.codeRetour").isin("00", "10")),
                OperationStatus.DECLINED.value,
            )
            .when(
                fn.col("cast.notification.message.contextData.operationNature") == OperationNature.LOAD.value,
                OperationStatus.COMPLETED.value,
            )
            .when(
                fn.col("cast.notification.message.contextData.operationNature") == OperationNature.UNLOAD.value,
                OperationStatus.COMPLETED.value,
            )
            .otherwise(OperationStatus.UNKNOWN.value)
            .cast("string")
            .alias("operation_status"),
            fn.col("cast.notification.message.contextData.reason").cast("string").alias("reason"),
            fn.col("cast.notification.message.contextData.operationAmount.currency").alias("currency_iso_code"),
            fn.col("cast.notification.message.contextData.authorizationReference")
            .cast("string")
            .alias("authorizationReference"),
            fn.col("cast.notification.message.contextData.operationId").cast("string").alias("operationId"),
            ############ response_code ############
            fn.when(
                fn.col("cast.notification.message.contextData.operationNature") == OperationNature.LOAD.value, "SUCCESS"
            )
            .when(
                fn.col("cast.notification.message.contextData.operationNature") == OperationNature.UNLOAD.value,
                "SUCCESS",
            )
            .otherwise(
                fn.concat(
                    fn.coalesce(
                        fn.col("cast.notification.message.contextData.codeRetour"),
                        fn.lit("XX"),
                    ),
                    fn.coalesce(
                        fn.col("cast.notification.message.contextData.codeRaisonDetaillee"),
                        fn.lit("00"),
                    ),
                )
            )
            .cast("string")
            .alias("response_code"),
            ################################################
            fn.col("cast.notification.message.contextData.cardSchemeCode").cast("string").alias("card_scheme_code"),
            fn.col("cast.notification.message.contextData.truncatedPAN").cast("string").alias("pan"),
            fn.col("cast.notification.message.contextData.cardId").cast("string").alias("card_id"),
            fn.upper(fn.col("cast.notification.message.contextData.canalAcceptationValue"))
            .cast("string")
            .alias("acceptation_channel"),
            fn.when(
                fn.col("cast.notification.message.contextData.xpay.tokenWalletId").isNotNull(),
                True,
            )
            .otherwise(False)
            .cast("boolean")
            .alias("xpay_flag"),
            fn.col("cast.notification.message.contextData.idAcceptation").cast("string").alias("idAcceptation"),
            fn.col("cast.notification.message.contextData.idTerminal").cast("string").alias("idTerminal"),
            fn.col("cast.notification.message.contextData.xpay.tokenWalletId").cast("string").alias("wallet_id"),
            fn.col("cast.notification.message.contextData.nomMarchand").cast("string").alias("merchant_name"),
            fn.col("cast.notification.message.contextData.codeMCC").cast("string").alias("merchant_category_code"),
            fn.col("cast.notification.message.contextData.idMarchand").cast("string").alias("merchant_id"),
            fn.col("cast.notification.message.contextData.countryCode").cast("string").alias("country_code"),
            fn.col("cast.notification.message.contextData.codepostalMarchand").cast("string").alias("zip_code"),
            fn.col("cast.notification.message.contextData.villeMarchand").cast("string").alias("city"),
            fn.col("cast.notification.message.contextData.voucherImpacts.voucherImpact").alias("voucher_impacts"),
            fn.col("cast.notification.message.contextData.posEntryMode").cast("string").alias("posEntryMode"),
            ############ transaction_id ############
            fn.when(
                fn.col("operationNature") == OperationNature.PURCHASE.value,
                fn.col("authorizationReference"),
            )
            .when(
                fn.col("operationNature") == OperationNature.LOAD.value,
                fn.concat(
                    fn.lit("LOAD"),
                    fn.lit("-"),
                    fn.col("account"),
                    fn.lit("-"),
                    fn.col("funder_contract_ref"),
                    fn.lit("-"),
                    fn.col("issuer_ref"),
                    fn.lit("-"),
                    fn.col("operationId"),
                ),
            )
            .when(
                fn.col("operationNature") == OperationNature.UNLOAD.value,
                fn.concat(
                    fn.lit("UNLOAD"),
                    fn.lit("-"),
                    fn.col("account"),
                    fn.lit("-"),
                    fn.col("funder_contract_ref"),
                    fn.lit("-"),
                    fn.col("issuer_ref"),
                    fn.lit("-"),
                    fn.col("operationId"),
                ),
            )
            .cast("string")
            .alias("transaction_id"),
            (
                safe_col(
                    input_df,
                    "cast.notification.message.contextData.paymentComplement.complementAmount.amount",
                )
                / fn.pow(
                    10,
                    safe_col(
                        input_df,
                        "cast.notification.message.contextData.paymentComplement.complementAmount.exponent",
                    ),
                )
            ).alias("supplement_amount"),
            fn.when(
                safe_col(
                    input_df,
                    "cast.notification.message.contextData.paymentComplement.complementAmount.amount",
                ).isNotNull(),
                True,
            )
            .otherwise(False)
            .alias("supplement_amount_flag"),
            (
                (
                    (fn.col("cast.notification.message.contextData.operationAmount.amount"))
                    * fn.pow(
                        10,
                        -(fn.col("cast.notification.message.contextData.operationAmount.exponent")),
                    )
                ).cast("decimal(6, 2)")
            )
            .cast("double")
            .alias("operationAmount_casted"),
            (
                (
                    (fn.col("cast.notification.message.contextData.amount.amount"))
                    * fn.pow(
                        10,
                        -(fn.col("cast.notification.message.contextData.amount.exponent")),
                    )
                ).cast("decimal(6, 2)")
            )
            .cast("double")
            .alias("amount_casted"),
            (
                fn.when(
                    fn.col("operation_status") == OperationStatus.DECLINED.value, fn.col("amount_casted")
                ).otherwise(fn.col("operationAmount_casted") + fn.coalesce(fn.col("supplement_amount"), fn.lit(0.0)))
            ).alias("operationAmount"),
        )
        .transform(cf.add_Currency, referentials)
        .transform(cf.add_Country, referentials)
        .transform(cf.add_Response_Message, referentials)
        .transform(cf.add_payment_method, referentials)
        .transform(cf.add_operation_nature, referentials)
        .transform(cf.add_cosmos_fields)
    )
    return transform_df


# COMMAND ----------

# display(input_stream_df)


# COMMAND ----------

# display(format_ef1t_transactions(input_stream_df))

# COMMAND ----------

# DBTITLE 1, Transform, Process


def transform_operations_df(input_df):
    ef1t_operations_df = input_df.select(
        fn.col("processor"),
        fn.col("issuer_ref"),
        fn.col("product_ref"),
        fn.col("account"),
        # when operationNature = PURCHASE Then operation_date == dateTransaction else operation_date == operationDateTime
        fn.when(
            fn.col("operationNature") == OperationNature.PURCHASE.value,
            fn.col("dateTransaction"),
        )
        .otherwise(fn.col("operationDateTimeISO"))
        .alias("operation_date"),
        fn.col("operation_nature"),
        fn.col("operation_type"),
        fn.col("operation_status"),
        fn.col("reason").alias("operation_message"),
        fn.col("operationAmount").alias("original_amount"),
        fn.col("operationAmount").alias("actual_amount"),
        fn.col("currency_iso_code").alias("currency_iso_code"),
        fn.col("currency").alias("currency"),
        fn.col("transaction_id").alias("operation_reference"),
        fn.col("response_code").alias("response_code"),
        fn.col("response_message").alias("response_message"),
        fn.col("card_scheme_code").alias("card_scheme_code"),
        fn.col("pan").alias("pan"),
        fn.col("card_id").alias("card_id"),
        fn.col("acceptation_channel").alias("acceptation_channel"),
        fn.col("payment_method").alias("payment_method"),
        fn.col("xpay_flag").alias("xpay_flag"),
        fn.col("wallet_id").alias("wallet_id"),
        fn.col("merchant_name").alias("merchant_name"),
        fn.col("merchant_category_code").alias("merchant_category_code"),
        fn.col("merchant_id").alias("merchant_id"),
        fn.col("country_code").alias("country_code"),
        fn.col("country").alias("country"),
        fn.col("zip_code").alias("zip_code"),
        fn.col("city").alias("city"),
        fn.col("voucher_impacts"),
        fn.col("supplement_amount_flag"),
        fn.col("operationAmount_casted").alias("base_amount"),
        fn.col("base_amount").alias("actual_base_amount"),
        fn.col("supplement_amount"),
        fn.col("supplement_amount").alias("actual_supplement_amount"),
        fn.col("partitionKey"),
        fn.col("id"),
        fn.col("_action_date"),
        fn.col("_source"),
    )

    return ef1t_operations_df


# COMMAND ----------

# DBTITLE 1, Transform Events


def transform_events_df(input_df):
    ef1t_event_df = input_df.select(
        fn.lit(1).cast("integer").alias("sequence"),
        fn.column("processor"),
        fn.col("issuer_ref"),
        fn.col("product_ref"),
        fn.lit("EF1T").alias("source"),
        fn.col("transaction_id").alias("event_reference"),
        fn.col("transaction_id").alias("operation_id"),
        fn.col("operation_nature").alias("direction"),
        fn.col("operationDateTime").alias("event_date"),
        fn.col("operationDateTimeISO").alias("event_date_iso"),
        fn.col("messageDate").alias("event_processing_date"),
        fn.col("messageDate").cast("string").alias("event_processing_date_iso"),
        ############ event_type ############
        fn.when(fn.col("operationNature") == OperationNature.PURCHASE.value, "AUTHORIZATION")
        .when(fn.col("operationNature") == OperationNature.LOAD.value, "LOAD")
        .when(fn.col("operationNature") == OperationNature.UNLOAD.value, "UNLOAD")
        .otherwise(OperationNature.UNKNOWN.value)
        .cast("string")
        .alias("event_type"),
        ################################################################
        ############ event_status ############
        # event_status [ACCEPTED, DECLINED, null]
        fn.when(fn.col("operationNature") == OperationNature.LOAD.value, "ACCEPTED")
        .when(fn.col("operationNature") == OperationNature.UNLOAD.value, "ACCEPTED")
        .when(
            fn.col("operationNature") == OperationNature.PURCHASE.value,
            (
                fn.when(fn.col("response_code") == "00", "ACCEPTED")
                .when(fn.col("response_code") == "10", "ACCEPTED")
                .otherwise("DECLINED")
            ),
        )
        .cast("string")
        .alias("event_status"),
        ################################################################
        fn.col("operationAmount").alias("event_amount"),
        fn.col("currency_iso_code").cast("string").alias("currency_iso_code"),
        fn.col("currency").alias("currency"),
        ############ account_impact_flag ############
        # True if operationType LOAD/UNLOAD
        # True if operationType AUTHORIZATION and response_code = 00 or 10
        # False if operationType AUTHORIZATION and response_code != (00 or 10)
        fn.when(
            fn.col("operationType") == OperationType.AUTHORIZATION.value,
            (
                fn.when(fn.col("response_code") == "00", True)
                .when(fn.col("response_code") == "10", True)
                .otherwise(False)
            ),
        )
        .when(fn.col("operationType") == OperationType.BALANCE_NOTIFICATION.value, True)
        .cast("boolean")
        .alias("account_impact_flag"),
        ################################################################
        ############ impact_amount ############
        fn.when(
            fn.col("operationType") == OperationType.AUTHORIZATION.value,
            fn.when(fn.col("response_code") == "00", fn.col("operationAmount"))
            .when(fn.col("response_code") == "10", fn.col("operationAmount"))
            .otherwise(fn.lit(None)),
        )
        .when(
            fn.col("operationType") == OperationType.AUTHORIZATION.value,
            fn.col("operationAmount"),
        )
        .cast("double")
        .alias("impact_amount"),
        ################################################################
        ############ impact_currency_iso_code ############
        fn.when(
            fn.col("operationType") == OperationType.AUTHORIZATION.value,
            fn.col("currency_iso_code"),
        )
        .when(
            fn.col("operationType") == OperationType.AUTHORIZATION.value,
            fn.when(fn.col("response_code") == "00", fn.col("currency_iso_code")).when(
                fn.col("response_code") == "10", fn.col("currency_iso_code")
            ),
        )
        .otherwise(fn.lit(None))
        .cast("string")
        .alias("impact_currency_iso_code"),
        ################################################################
        ############ impact_currency ############
        fn.when(
            fn.col("operationType") == OperationType.AUTHORIZATION.value,
            fn.col("currency"),
        )
        .when(
            fn.col("operationType") == OperationType.AUTHORIZATION.value,
            fn.when(fn.col("response_code") == "00", fn.col("currency")).when(
                fn.col("response_code") == "10", fn.col("currency")
            ),
        )
        .otherwise(fn.lit(None))
        .cast("string")
        .alias("impact_currency"),
        ################################################################
        fn.col("response_code"),
        fn.col("response_message"),
        fn.col("reason").alias("additional_info"),
        fn.lit(None).cast("timestamp").alias("settlement_date"),
        fn.lit(None).cast("double").alias("settlement_amount"),
        fn.lit(None).cast("string").alias("settlement_currency_iso_code"),
        fn.lit(None).cast("string").alias("settlement_currency"),
        fn.lit(None).cast("string").alias("acquirer_reference_number"),
        fn.col("merchant_name").alias("merchant_name"),
        fn.col("merchant_id").alias("merchant_id"),
        fn.col("idAcceptation").alias("acquirer_id"),
        fn.col("idTerminal").alias("terminal_id"),
        fn.col("country_code").alias("country_code"),
        fn.col("country").alias("country"),
        fn.col("zip_code").alias("zip_code"),
        fn.col("city").alias("city"),
        fn.lit(None).cast("string").alias("pan_entry_mode"),
        fn.lit(None).cast("string").alias("terminal_attendance"),
        fn.lit(None).cast("string").alias("card_holder_presence"),
        fn.lit(None).cast("string").alias("card_presence"),
        fn.lit(None).cast("string").alias("d_secure_flag"),
        fn.col("voucher_impacts"),
        fn.col("supplement_amount_flag"),
        fn.col("operationAmount").alias("base_amount"),
        fn.col("supplement_amount"),
        fn.col("id"),
        fn.col("partitionKey"),
        fn.col("_action_date"),
        fn.col("_source"),
    )
    return ef1t_event_df


# COMMAND ----------


def process_batch(batch_df, epoch_id):
    """
    Process a batch of data and save the transformed data to Cosmos DB.

    Args:
        batch_df (DataFrame): The batch of data to be processed.
        epoch_id (int): The ID of the current epoch.

    Returns:
        None
    """

    operations_df = transform_operations_df(format_ef1t_transactions(batch_df))
    events_df = transform_events_df(format_ef1t_transactions(batch_df))

    cf.write_to_cosmos(dataframe=operations_df, writeConfig=writeConfigOperations)
    cf.write_to_cosmos(dataframe=events_df, writeConfig=writeConfigEvents)


# COMMAND ----------

# DBTITLE 1, Write to Cosmos DB
output_cosmos = (
    input_stream_df.writeStream.foreachBatch(process_batch)
    .option("checkpointLocation", checkpoint_path)
    .queryName(f"{env}_cadhoc_operations")
    .start()
)
