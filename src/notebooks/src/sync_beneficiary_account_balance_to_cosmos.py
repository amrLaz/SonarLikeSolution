# Databricks notebook source
# DBTITLE 1, Import Libraries
from src.notebooks.common import AppGlobals, load_conf, DeltaTables
import pyspark.sql.functions as fn
from src.notebooks.common.referentials import Referentials
import os

# COMMAND ----------

# DBTITLE 1, Configuration
# env widget
envs = ["test", "dev", "inte", "uat", "pprod", "prod"]
dbutils.widgets.dropdown("env", envs[1], envs, "Environment")
env: str = dbutils.widgets.get("env")

dir_name = os.path.dirname("__file__")


app_globals = AppGlobals(env)
conf = load_conf(spark, app_globals.secret_scope)
delta_tables: DeltaTables = DeltaTables(spark, f"upfrdatalake{env}sa", app_globals)

referentials = Referentials(spark, dir_name)

# load product filters
product_df = referentials.distributors_settings.filter(
    (referentials.distributors_settings.environment == env) & (referentials.distributors_settings.status == "Active")
)


write_strategy = "ItemAppend"
writeConfigBalance = {
    "spark.cosmos.accountEndpoint": conf.benefits_cosmos_account_endpoint,
    "spark.cosmos.accountKey": conf.benefits_cosmos_account_primary_key,
    "spark.cosmos.database": conf.benefits_cadhoc_cosmos_db_name,
    "spark.cosmos.write.strategy": "ItemOverwrite",
    "spark.cosmos.container": "Balances",
    "spark.cosmos.write.bulk.enabled": "true",
    "spark.cosmos.throughputControl.enabled": "false",
}

# COMMAND ----------

# DBTITLE 1, Reading delta table
input_df = (
    spark.readStream.format("delta")
    .option("ignoreDeletes", "true")
    .table(app_globals.monetics_silver_beneficiaryaccountbalance_table_name)
    .withColumn("_source", fn.lit("DF17"))
    .withColumn("_ingestionDate", fn.current_timestamp())
    .filter(fn.col("distributorRef") == "UPFRANCE")
    .filter(fn.col("funderContractRef") == "GENERIQUECADEAU")
    # .join(
    #     product_df.alias("product"),
    #     (
    #         (fn.col("productRef") == fn.col("product.product_reference"))
    #         & (fn.col("distributorRef") == fn.col("product.distributor_reference"))
    #     )
    # )
    .select(
        fn.col("distributorRef").alias("issuer_ref"),
        fn.col("funderContractRef").alias("funder_contract_ref"),
        # fn.col("productRef").alias("product_ref"),
        fn.lit(None).alias("message_id"),
        fn.col("fileDate").cast("double").alias("message_date"),
        fn.col("beneficiaryServiceRef").alias("account"),
        fn.col("fileDate").alias("operation_date"),
        fn.col("accountBalance").alias("account_balance"),
        fn.col("accountBalanceCurrency").alias("currency"),
        fn.col("_ingestionDate").alias("_ingestion_date"),
        fn.col("_source"),
        fn.col("beneficiaryServiceRef").alias("id"),
        fn.col("beneficiaryServiceRef").alias("partitionKey"),
    )
)

# COMMAND ----------

# DBTITLE 1, for_each_batch write data to cosmos


def foreach_batch(df, epoch_id):
    df.write.format("cosmos.oltp").mode("append").options(**writeConfigBalance).save()


# COMMAND ----------

# DBTITLE 1, Stream to Cosmos
output_stream = (
    input_df.writeStream.foreachBatch(foreach_batch)
    .trigger(availableNow=True)
    .option("ignoreDeletes", "true")
    .outputMode("append")
    .start()
)
