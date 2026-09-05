# Databricks notebook source
# DBTITLE 1,imports
import pyspark.sql.functions as fn
import datetime
from src.notebooks.common import AppGlobals, load_conf
from src.notebooks.common.schema import Ef1tSchema
from src.notebooks.utils.metrics import LogAnalyticsRequest

# COMMAND ----------
# DBTITLE 1,Conf
env = "prod"
app_globals = AppGlobals(env)
conf = load_conf(spark, app_globals.secret_scope)

# COMMAND ----------
# DBTITLE 1,EventHubs Conf
startTime = (
    (datetime.datetime.now() - datetime.timedelta(days=2))
    .replace(hour=0, minute=0, second=0, microsecond=0)
    .strftime("%Y-%m-%dT%H:%M:%S.%fZ")
)

eh_connection_string = conf.EF1T_eventhubs_connectionString
reader_event_hub_conf = {
    "eventhubs.connectionString": sc._jvm.org.apache.spark.eventhubs.EventHubsUtils.encrypt(eh_connection_string),
    "maxEventsPerTrigger": 1000,
}

# COMMAND ----------
# DBTITLE 1, logAnalyticsInit
log_analytics = LogAnalyticsRequest(config=conf, environment=env)

# COMMAND ----------

ef1t_input_df = (
    spark.readStream.format("eventhubs")
    .options(**reader_event_hub_conf)
    .load()
    .withColumn("body", fn.col("body").cast("string"))
    .withColumn("cast", fn.from_json(fn.col("body"), Ef1tSchema))
    .filter(fn.col("cast.notification.message.contextData.operationNature") == "PURCHASE")
)

# COMMAND ----------

# display(ef1t_input_df)

# COMMAND ----------

main_df = ef1t_input_df.select(
    fn.col("cast.notification.distributorRef").cast("string").alias("issuer_ref"),
    fn.col("cast.notification.message.productRef").cast("string").alias("product_ref"),
    fn.col("cast.notification.message.beneficiaryServiceRef").cast("string").alias("account"),
    fn.col("cast.notification.message.contextData.operationType"),
    fn.col("cast.notification.message.contextData.operationNature"),
    fn.col("enqueuedTime"),
    fn.col("cast.notification.message.messageDate").alias("messageDate"),
    fn.col("cast.notification.message.contextData.operationDateTime").alias("operationDateTime"),
    (fn.col("messageDate").cast("long") - fn.col("operationDateTime").cast("long")).alias("delay_WL"),
    (fn.col("enqueuedTime").cast("long") - fn.col("messageDate").cast("long")).alias("delay_ESB"),
    fn.window(fn.col("enqueuedTime"), "10 minutes").alias("buckets"),
    fn.current_timestamp().alias("batch_date"),
)
# COMMAND ----------

# display(main_df)


# COMMAND ----------
# DBTITLE 1, foreachBatch
def foreach_batch_function(df, epoch_id):
    metrics_df = df
    metrics_df.persist()
    metrics_df = metrics_df.groupBy(
        fn.date_format(fn.col("batch_date"), "yyyy-MM-dd HH:mm:ss").alias("batch_date"),
        fn.col("operationType").alias("operation_type"),
        fn.col("operationNature").alias("operation_nature"),
    ).agg(
        fn.count("*").alias("count_events"),
        fn.round(fn.avg(fn.col("delay_WL")), 2).alias("avg_WL_delay"),
        fn.round(fn.avg(fn.col("delay_ESB")), 2).alias("avg_ESB_delay"),
        fn.round(fn.expr("percentile_approx(delay_WL, 0.95)"), 2).alias("95p_WL_delay"),
        fn.round(fn.expr("percentile_approx(delay_ESB, 0.95)"), 2).alias("95p_ESB_delay"),
        fn.round(fn.expr("percentile_approx(delay_WL, 1)"), 2).alias("max_WL_delay"),
        fn.round(fn.expr("percentile_approx(delay_ESB, 1)"), 2).alias("max_ESB_delay"),
        # 80p
        fn.round(fn.expr("percentile_approx(delay_WL, 0.8)"), 2).alias("80p_WL_delay"),
        fn.round(fn.expr("percentile_approx(delay_ESB, 0.8)"), 2).alias("80p_ESB_delay"),
        # 50p
        fn.round(fn.expr("percentile_approx(delay_WL, 0.5)"), 2).alias("50p_WL_delay"),
        fn.round(fn.expr("percentile_approx(delay_ESB, 0.5)"), 2).alias("50p_ESB_delay"),
        # std
        fn.round(fn.stddev(fn.col("delay_WL")), 2).alias("std_WL_delay"),
        fn.round(fn.stddev(fn.col("delay_ESB")), 2).alias("std_ESB_delay"),
    )
    lines = [row.asDict(True) for row in metrics_df.collect()]
    for line in lines:
        log_analytics.post_data(line)
    metrics_df.unpersist()


# COMMAND ----------
# DBTITLE 1, writeStream to deltatable called outout
query = (
    main_df.writeStream.foreachBatch(foreach_batch_function)
    # .outputMode("update")
    # Set microbatch interval to 1 minutes
    .trigger(processingTime="5 minutes").start()
)
