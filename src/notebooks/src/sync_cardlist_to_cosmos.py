# Databricks notebook source
# COMMAND ----------
# DBTITLE 1, Import Libraries
from src.notebooks.common import AppGlobals, load_conf, DeltaTables


# COMMAND ----------
# DBTITLE 1, Configuration
# env widget
envs = ["test", "dev", "inte", "uat", "pprod", "prod"]
dbutils.widgets.dropdown("env", envs[1], envs, "Environment")
env: str = dbutils.widgets.get("env")

# issuer_ref widget
issuer_refs = ["UPFRANCE", "FRACADHOC", "CDJFRANCEMCO", "CDJFRANCE", "UPCOHESIA", "RMUPFRANCEI"]
dbutils.widgets.dropdown("issuer_ref", issuer_refs[0], issuer_refs, "Issuer Ref")
issuer_ref: str = dbutils.widgets.get("issuer_ref")


app_globals = AppGlobals(env)
conf = load_conf(spark, app_globals.secret_scope)
delta_tables: DeltaTables = DeltaTables(spark, f"upfrmoveup{env}sa", app_globals)


# Data Staging Repo
data_staging_repo = f"abfss://bronze@upfrdatalake{env}sa.dfs.core.windows.net/Move-Up/DF11/UPFRANCE/"


# COMMAND ----------
# DBTITLE 1, Display Card table
# display(spark.read.table(f"{app_globals.bazop_events_table_name}"))
print(app_globals.benefits_bronze_cards_headers_table_name)
# COMMAND ----------

print(app_globals.benefits_bronze_cards_table_name)

# COMMAND ----------

display(delta_tables.get_delta_table_location("bronze", "cards", app_globals.benefits_bronze_cards_table_name))

# COMMAND ----------
display(delta_tables.get_check_point_location("bronze", "cards", app_globals.benefits_bronze_cards_table_name, "chkpt"))
