# Databricks notebook source
# COMMAND ----------
# DBTITLE 1, Import libraries

import os
import src.notebooks.utils.functions as cf
from pyspark.sql import DataFrame
from pyspark.sql.types import StructType, StructField, StringType, IntegerType
from pyspark.sql.types import ArrayType
import pyspark.sql.functions as fn
from src.notebooks.common import AppGlobals, load_conf


# COMMAND ----------
# DBTITLE 1, Load configuration

envs = ["test", "inte", "uat", "pprod", "prod"]
dbutils.widgets.dropdown("env", envs[0], envs, "Environment")

operations_file = "mocked_operations.csv"
events_file = "mocked_events.csv"
env: str = dbutils.widgets.get("env")
dir_name = os.path.dirname("__file__")

app_globals = AppGlobals(env)
conf = load_conf(spark, app_globals.secret_scope)


# COMMAND ----------
# DBTITLE 1, Load mocked data

# from pyspark.sql import SparkSession, DataFrame
# from src.notebooks.utils.functions import read_csv_file
# from pyspark.sql.types import TimestampType
# from pyspark.sql.types import StructField, StructType, StringType, IntegerType, ArrayType
# from pyspark.sql import SparkSession


operations_path = "file:" + os.path.abspath(os.path.join(dir_name, f"../mappings/{operations_file}"))
events_path = "file:" + os.path.abspath(os.path.join(dir_name, f"../mappings/{events_file}"))

operations_df: DataFrame = cf.read_csv_file(spark, operations_path, header=True, delimiter=";", infer_schema=False)
events_df: DataFrame = cf.read_csv_file(spark, events_path, header=True, delimiter=";", infer_schema=False)

# COMMAND ----------

voucher_schema = ArrayType(
    StructType(
        [
            StructField("externalReference", StringType(), nullable=True),
            StructField(
                "amountImpact",
                StructType(
                    [
                        StructField("amount", IntegerType(), nullable=True),
                        StructField("exponent", IntegerType(), nullable=True),
                        StructField("currency", StringType(), nullable=True),
                    ]
                ),
                nullable=True,
            ),
            StructField("voucherReason", StringType(), nullable=True),
        ]
    )
)


# COMMAND ----------


# COMMAND ----------

# events_df = events_df.withColumn("voucheeers", fn.from_json(fn.col("voucher_impacts"), struct_vouchers))
operations_df = (
    operations_df.withColumn("vouchers_impact", fn.from_json(fn.col("voucher_impacts"), voucher_schema))
    # .withColumn("vouchers_impact", fn.expr("transform(vouchers_impact, x -> struct(x.externalReference as externalReference, struct(x.amountImpact.amount as amount, x.amountImpact.exponent as exponent, cast(x.amountImpact.currency as int) as currency) as amountImpact))"))
    .withColumn("partitionKey", fn.col("account"))
    .withColumn("id", fn.sha2(fn.col("transaction_id"), 256))
    .withColumn("_action_date", fn.col("operation_date").cast("timestamp").cast("double"))
    .withColumn("_source", fn.lit("EXPRESS_ROUTE"))
    .select(
        fn.col("processor").cast("string"),
        fn.col("issuer_ref").cast("string"),
        fn.col("product_ref").cast("string"),
        fn.col("account").cast("string"),
        fn.col("operation_date").cast("timestamp"),
        fn.col("operation_nature").cast("string"),
        fn.col("operation_type").cast("string"),
        fn.col("operation_status").cast("string"),
        fn.col("operation_message").cast("string"),
        fn.col("original_amount").cast("double"),
        fn.col("actual_amount").cast("double"),
        fn.col("currency_iso_code").cast("string"),
        fn.col("currency").cast("string"),
        fn.col("transaction_id").alias("operation_reference").cast("string"),
        fn.col("response_code").cast("string"),
        fn.col("response_message").alias("response_message").cast("string"),
        fn.col("card_scheme_code").alias("card_scheme_code").cast("string"),
        fn.col("pan").cast("string"),
        fn.col("card_id").cast("string"),
        fn.col("acceptation_channel").cast("string"),
        fn.col("payment_method").cast("string"),
        fn.col("xpay_flag").cast("boolean"),
        fn.col("wallet_id").cast("integer"),
        fn.col("merchant_name").alias("merchant_name").cast("string"),
        fn.col("merchant_category_code").alias("merchant_category_code").cast("string"),
        fn.col("merchant_id").cast("string"),
        fn.col("country_code").alias("country_code").cast("string"),
        fn.col("country").alias("country").cast("string"),
        fn.col("zip_code").alias("zip_code").cast("string"),
        fn.col("city").cast("string"),
        fn.col("vouchers_impact"),
        # add id, partitionKey, _action_date, _source
        fn.col("id"),
        fn.col("partitionKey"),
        fn.col("_action_date"),
        fn.col("_source"),
    )
)
display(operations_df)
# COMMAND ----------

events_df = (
    events_df.withColumn("vouchers_impact", fn.from_json(fn.col("voucher_impacts"), voucher_schema))
    # .withColumn("vouchers_impact", fn.expr("transform(vouchers_impact, x -> struct(x.externalReference as externalReference, struct(x.amountImpact.amount as amount, x.amountImpact.exponent as exponent, cast(x.amountImpact.currency as int) as currency) as amountImpact))"))
    .withColumn("partitionKey", fn.col("account"))
    .withColumn("id", fn.sha2(fn.col("transaction_id"), 256))
    .withColumn("_action_date", fn.col("event_date").cast("timestamp").cast("double"))
    .withColumn("_source", fn.lit("EXPRESS_ROUTE"))
    .select(
        fn.col("sequence").cast("integer"),
        fn.column("processor").cast("string"),
        fn.col("issuer_ref").cast("string"),
        fn.col("product_ref").cast("string"),
        fn.col("source").cast("string"),
        fn.col("transaction_id").alias("event_reference").cast("string"),
        fn.col("linked_operation_reference").alias("operation_id").cast("string"),
        fn.col("direction").cast("string"),
        fn.col("event_date").cast("timestamp"),
        fn.col("event_processing_date").cast("timestamp"),
        fn.col("event_type").cast("string"),
        fn.col("event_status").cast("string"),
        fn.col("event_amount").cast("double"),
        fn.col("currency_iso_code").cast("string"),
        fn.col("currency").cast("string"),
        fn.col("account_impact_flag").cast("boolean"),
        fn.col("impact_amount").cast("double"),
        fn.col("impact_currency_iso_code").cast("string"),
        fn.col("impact_currency").cast("string"),
        fn.col("response_code").cast("string"),
        fn.col("response_message").cast("string"),
        fn.col("additional_info").cast("string"),
        fn.col("settlement_date").cast("timestamp"),
        fn.col("settlement_amount").cast("double"),
        fn.col("settlement_currency_iso_code").cast("string"),
        fn.col("settlement_currency").cast("string"),
        fn.col("acquirer_reference_number").cast("string"),
        fn.col("merchant_name").cast("string"),
        fn.col("merchant_id").cast("string"),
        fn.col("acquirer_id").cast("string"),
        fn.col("terminal_id").cast("string"),
        fn.col("country_code").cast("string"),
        fn.col("country").cast("string"),
        fn.col("zip_code").cast("string"),
        fn.col("city").cast("string"),
        fn.col("pos_entry_mode").alias("pan_entry_mode").cast("string"),
        fn.col("terminal_attendance"),
        fn.col("card_holder_presence"),
        fn.col("card_presence"),
        fn.col("d_secure_flag"),
        fn.col("vouchers_impact"),
        # add id, partitionKey, _action_date, _source
        fn.col("id"),
        fn.col("partitionKey"),
        fn.col("_action_date"),
        fn.col("_source"),
    )
)
display(events_df)

# COMMAND ----------
# DBTITLE 1, write to cosmos

# cosmos config
writeConfigOperations = {
    "spark.cosmos.accountEndpoint": conf.benefits_cosmos_account_endpoint,
    "spark.cosmos.accountKey": conf.benefits_cosmos_account_primary_key,
    "spark.cosmos.database": conf.benefits_cadhoc_cosmos_db_name,
    "spark.cosmos.write.strategy": "ItemOverwrite",
    "spark.cosmos.container": "Operations",
}

writeConfigEvents = {
    "spark.cosmos.accountEndpoint": conf.benefits_cosmos_account_endpoint,
    "spark.cosmos.accountKey": conf.benefits_cosmos_account_primary_key,
    "spark.cosmos.database": conf.benefits_cadhoc_cosmos_db_name,
    "spark.cosmos.write.strategy": "ItemOverwrite",
    "spark.cosmos.container": "Events",
}

# write to cosmos

cf.write_to_cosmos(operations_df, writeConfigOperations)
cf.write_to_cosmos(events_df, writeConfigEvents)
