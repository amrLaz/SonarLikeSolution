# Databricks notebook source
# DBTITLE 1, Import Libraries
from src.notebooks.common import AppGlobals, load_conf, DeltaTables
import pyspark.sql.functions as fn
from src.notebooks.common.schema import Ef1tSchema
from pyspark.sql import DataFrame
import datetime
import json
import src.notebooks.utils.functions as cf
from src.notebooks.common.enums import OperationType
from src.notebooks.common.referentials import Referentials
import os


# COMMAND ----------

# DBTITLE 1, Configuration
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
delta_tables: DeltaTables = DeltaTables(spark, f"upfrdatalake{env}sa", app_globals)
referentials = Referentials(spark, dir_name)

# load product filters
product_df = referentials.distributors_settings.filter(
    (referentials.distributors_settings.environment == env) & (referentials.distributors_settings.status == "Active")
)


checkpoint_path = f"abfss://{app_globals.checkpoint_container}@upfrbenefits{env}sa.dfs.core.windows.net/RED{slot}/{env}/cadhoc_ef1t_account_balance"


# COMMAND ----------

# DBTITLE 1, Event hub configuration
startTime = (
    (datetime.datetime.now() - datetime.timedelta(days=2))
    .replace(hour=0, minute=0, second=0, microsecond=0)
    .strftime("%Y-%m-%dT%H:%M:%S.%fZ")
)
starting_position = json.dumps({"offset": None, "seqNo": -1, "enqueuedTime": startTime, "isInclusive": True})
# starting_position = json.dumps({"offset": -1, "seqNo": -1, "enqueuedTime": None, "isInclusive": True})

eh_connection_string = conf.EH_EF1T_connection_string_temp if env == "dev" else conf.EF1T_eventhubs_connectionString
reader_event_hub_conf = {
    "eventhubs.connectionString": sc._jvm.org.apache.spark.eventhubs.EventHubsUtils.encrypt(eh_connection_string),
    "maxEventsPerTrigger": 1000,
    "eventhubs.startingPosition": starting_position,
}

writeConfigBalance = {
    "spark.cosmos.accountEndpoint": conf.benefits_cosmos_account_endpoint,
    "spark.cosmos.accountKey": conf.benefits_cosmos_account_primary_key,
    "spark.cosmos.database": conf.benefits_cadhoc_cosmos_db_name,
    "spark.cosmos.write.strategy": "ItemOverwrite",
    "spark.cosmos.container": "Balances",
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
    .filter(fn.col("cast.notification.message.contextData.operationType") == OperationType.BALANCE_NOTIFICATION.value)
    .join(
        product_df.alias("product"),
        (
            (fn.col("cast.notification.message.productRef") == fn.col("product.product_reference"))
            & (fn.col("cast.notification.distributorRef") == fn.col("product.distributor_reference"))
        ),
    )
    .withColumn("_source", fn.lit("EF1T"))
    .withColumn("_ingestionDate", fn.current_timestamp())
    # aliasing
    .select(
        fn.col("cast.notification.distributorRef").alias("issuer_ref"),
        fn.col("cast.notification.message.productRef").alias("product_ref"),
        fn.col("cast.notification.message.funderContractRef").alias("funder_contract_ref"),
        fn.col("cast.notification.message.messageId").alias("message_id"),
        fn.col("cast.notification.message.messageDate").cast("double").alias("message_date"),
        fn.col("cast.notification.message.beneficiaryServiceRef").alias("account"),
        fn.col("cast.notification.message.contextData.operationDateTime").alias("operation_date"),
        (
            (
                fn.col("cast.notification.message.contextData.accountBalance.amount")
                * fn.pow(10, -fn.col("cast.notification.message.contextData.accountBalance.exponent"))
            ).cast("decimal(6, 2)")
        )
        .cast("double")
        .alias("account_balance"),
        fn.col("cast.notification.message.contextData.accountBalance.currency").alias("currency"),
        fn.col("enqueuedTime").alias("enqueued_time"),
        fn.col("_ingestionDate").alias("_ingestion_date"),
        fn.col("_source"),
        fn.col("cast.notification.message.beneficiaryServiceRef").alias("id"),
        fn.col("cast.notification.message.beneficiaryServiceRef").alias("partitionKey"),
    )
)


# COMMAND ----------

# DBTITLE 1, ForeachBatch


def process_batch(batch_df, epoch_id):

    main_df = cf.deduplicate_on_timestamp(df=batch_df, id_col="account", timestamp_col="message_date")

    ef1t_data = (
        main_df.withColumn("id", fn.col("account"))
        # .withColumn("message_date", fn.col("message_date").cast("double"))
        .alias("ef1t_data")
    )

    ids = ef1t_data.select("id").distinct().rdd.flatMap(lambda x: x).collect()

    df = (
        spark.read.format("cosmos.oltp")
        .options(**writeConfigBalance)
        .option("spark.cosmos.read.inferSchema.enabled", "true")
        .load()
    )
    cosmos_data = df.filter(df.id.isin(ids)).alias("cosmos_data")
    results = ef1t_data.join(cosmos_data, ef1t_data.id == cosmos_data.id, "left").filter(
        "cosmos_data._source == 'DF17' or ef1t_data.message_date > cosmos_data.message_date or cosmos_data.id is null"
    )
    (results.select("ef1t_data.*").write.format("cosmos.oltp").options(**writeConfigBalance).mode("APPEND").save())


# COMMAND ----------

# DBTITLE 1, Write to Cosmos
output_cosmos = (
    input_stream_df.writeStream.foreachBatch(process_batch)
    .option("checkpointLocation", checkpoint_path)
    # .option("asyncProgressTrackingEnabled", "true")
    # .trigger(availableNow = True)
    .queryName(f"{env}_cadhoc_account_balance_stream")
    .start()
)
