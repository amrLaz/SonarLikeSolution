# Databricks notebook source
# DBTITLE 1, Import libraries
import json
from src.notebooks.common import AppGlobals, load_conf
import os
import datetime
from src.notebooks.data_processor.batch.ef1t_bronze_procesor import Ef1tBronzeProcessor


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

checkpoint_path = f"abfss://{app_globals.checkpoint_container}@upfrbenefits{env}sa.dfs.core.windows.net/RED{slot}/{env}/bronze_ef1t_transactions"


# COMMAND ----------

# dbutils.fs.rm(checkpoint_path, True)

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

# COMMAND ----------

# DBTITLE 1,Read from Event Hub and write to delta
processor = Ef1tBronzeProcessor(spark, reader_event_hub_conf, checkpoint_path, env)
output_cosmos = processor.build()
