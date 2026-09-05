# Databricks notebook source
# DBTITLE 1, Import Libraries
from src.notebooks.common import AppGlobals, load_conf, DeltaTables
import pyspark.sql.functions as fn
import src.notebooks.utils.functions as cf
from src.notebooks.common.referentials import Referentials
import os

# COMMAND ----------

# DBTITLE 1, Widgets
# env widget
envs = ["test", "dev", "inte", "uat", "pprod", "prod"]
dbutils.widgets.dropdown("env", envs[1], envs, "Environment")
# slot widget
dbutils.widgets.text("slot", "", "Slot")

# COMMAND ----------

# DBTITLE 1, Configuration
env: str = dbutils.widgets.get("env")
slot: str = dbutils.widgets.get("slot")

app_globals = AppGlobals(env, slot)
conf = load_conf(spark, app_globals.secret_scope)
delta_tables: DeltaTables = DeltaTables(spark, f"upfrmoveup{env}sa", app_globals)
dir_name = os.path.dirname("__file__")
referentials = Referentials(spark, dir_name)

# load product filters
product_df = referentials.distributors_settings.filter(
    (referentials.distributors_settings.environment == env) & (referentials.distributors_settings.status == "Active")
)


writeConfigEvents = {
    "spark.cosmos.accountEndpoint": conf.benefits_cosmos_account_endpoint,
    "spark.cosmos.accountKey": conf.benefits_cosmos_account_primary_key,
    "spark.cosmos.database": conf.benefits_cadhoc_cosmos_db_name,
    "spark.cosmos.write.strategy": "ItemOverwrite",
    "spark.cosmos.container": "Events",
}

checkpoint_path = f"abfss://{app_globals.checkpoint_container}@upfrbenefits{env}sa.dfs.core.windows.net/RED{slot}/{env}/cadhoc_bazOP_events"

# dbutils.fs.rm(checkpoint_path, True)


# COMMAND ----------

# DBTITLE 1, ReadStream the operations table

input_stream = (
    spark.readStream.format("delta")
    .option("readChangeFeed", "true")
    # .option("startingVersion", "latest")
    .table(f"{app_globals.bazop_events_table_name}")
    .filter(fn.col("_change_type").isin("insert", "update_postimage"))
)

# COMMAND ----------

output_stream = input_stream.join(
    product_df.alias("product"),
    (
        (fn.col("product_ref") == fn.col("product.product_reference"))
        & (fn.col("issuer_ref") == fn.col("product.distributor_reference"))
    ),
).select(
    fn.col("sequence").cast("integer"),
    fn.column("processor").cast("string"),
    fn.col("issuer_ref").cast("string"),
    fn.col("product_ref").cast("string"),
    fn.col("source").cast("string"),
    fn.col("event_reference").cast("string"),
    fn.col("linked_operation_reference").cast("string").alias("operation_id"),
    fn.col("direction").cast("string"),
    fn.col("event_date").cast("timestamp"),
    fn.col("event_date").cast("string").alias("event_date_iso"),
    fn.col("event_processing_date").cast("timestamp"),
    fn.col("event_processing_date").cast("string").alias("event_processing_date_iso"),
    fn.col("event_type").cast("string"),
    fn.col("event_status").cast("string"),
    cf.apply_scaling_factor("event_amount", "currency_exponent"),
    fn.col("currency_iso_code").cast("string"),
    fn.col("currency").cast("string"),
    fn.col("account_impact_flag").cast("boolean"),
    cf.apply_scaling_factor("impact_amount", "impact_currency_exponent"),
    fn.col("impact_currency_iso_code").cast("string"),
    fn.col("impact_currency").cast("string"),
    fn.col("response_code").cast("string"),
    fn.col("response_message").cast("string"),
    fn.col("additional_info").cast("string"),
    fn.col("settlement_date"),
    cf.apply_scaling_factor("settlement_amount", "settlement_currency_exponent"),
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
    fn.col("pan_entry_mode").alias("pan_entry_mode"),
    fn.col("terminal_attendance").cast("string"),
    fn.col("card_holder_presence").cast("boolean"),
    fn.col("card_presence").cast("boolean"),
    fn.col("d_secure_flag").cast("boolean"),
    fn.col("vouchers_impacts").alias("voucher_impacts"),
    fn.col("account").alias("partitionKey").cast("string"),
    fn.col("supplement_amount_flag").cast("boolean").alias("supplement_amount_flag"),
    cf.apply_scaling_factor("base_amount", "base_currency_exponent"),
    cf.apply_scaling_factor("supplement_amount", "supplement_currency_exponent"),
    fn.sha2(fn.col("event_reference"), 256).alias("id"),
    fn.col("event_date").cast("double").alias("_action_date"),
    fn.lit("MOVEUP_BAZOP").alias("_source"),
    fn.col("_commit_timestamp"),
)

# COMMAND ----------


def process_batch(batch_df, epoch_id):

    main_df = cf.deduplicate_on_timestamp(df=batch_df, id_col="event_reference", timestamp_col="_commit_timestamp")
    main_df.write.format("cosmos.oltp").options(**writeConfigEvents).mode("APPEND").save()


# COMMAND ----------

# DBTITLE 1, WriteStream to Cosmos
output_cosmos = (
    output_stream.writeStream.foreachBatch(process_batch)
    .option("checkpointLocation", checkpoint_path)
    .queryName(f"{env}_cadhoc_bazop_events")
    .start()
)
