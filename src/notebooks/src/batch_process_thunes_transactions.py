# Databricks notebook source
# DBTITLE 1, Import Libraries
from src.notebooks.common import AppGlobals, load_conf
from src.notebooks.common.referentials import Referentials
from src.notebooks.data_processor.batch.thunes_processor import ThunesProcessor
from src.notebooks.common.schema import thunes_schema
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
dir_name = os.path.dirname("__file__")


app_globals = AppGlobals(env, slot)
conf = load_conf(spark, app_globals.secret_scope)
referentials = Referentials(spark, dir_name)

product_df = referentials.distributors_settings.filter(
    (referentials.distributors_settings.environment == env) & (referentials.distributors_settings.status == "Active")
)

staging_path = f"abfss://{app_globals.landing_container}@upfrbenefits{env}sa.dfs.core.windows.net/thunes{slot}/DF20/"

checkpoint_path = (
    f"abfss://{app_globals.checkpoint_container}@upfrbenefits{env}sa.dfs.core.windows.net/RED{slot}/{env}/cadhoc_thunes"
)


# COMMAND ----------

# DBTITLE 1, Event hub configuration
eh_connection_string = conf.thunes_eventhubs_connectionString
writer_event_hub_conf = {
    "eventhubs.connectionString": sc._jvm.org.apache.spark.eventhubs.EventHubsUtils.encrypt(eh_connection_string),
    "maxEventsPerTrigger": 10000,
}


# COMMAND ----------

# DBTITLE 1, autoload binary files from adls staging area
config = {
    "schema": thunes_schema,
    "staging_path": staging_path,
    "checkpoint_path": checkpoint_path,
    "writer_event_hub_conf": writer_event_hub_conf,
    "cloudFiles_options": {
        "cloudFiles.format": "xml",
        "rowTag": "CRO",
        "mode": "FAILFAST",
    },
}

# COMMAND ----------


thunes_processor = ThunesProcessor(spark=spark, config=config, product_df=product_df, env=env)

# COMMAND ----------

thunes_processor.start()
