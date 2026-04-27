# Databricks notebook source
from src.notebooks.common.referentials import Referentials
import os

# COMMAND ----------

print("Hello, World!")

# COMMAND ----------

dir_name = os.path.dirname("__file__")
ref = Referentials(spark, dir_name)

# COMMAND ----------

# DBTITLE 1, Referential Response Codes
display(ref.response_codes_mapping)

# COMMAND ----------

# DBTITLE 1, Referential Countries
display(ref.countries_mapping)

# COMMAND ----------

# DBTITLE 1, Referential Currencies
display(ref.currencies_mapping)

display(distributor_settings)
