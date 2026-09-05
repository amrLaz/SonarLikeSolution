# Databricks notebook source
# DBTITLE 1, Import Libraries
from src.notebooks.common import AppGlobals, load_conf, DeltaTables
import pyspark.sql.functions as fn
from pyspark.sql import Row
from datetime import datetime
import re


# COMMAND ----------

spark.conf.set("spark.databricks.sql.nativeXmlDataSourcePreview.enabled", True)

# COMMAND ----------

# DBTITLE 1, Configuration
# env widget
envs = ["test", "dev", "inte", "uat", "pprod","rec", "prod"]
dbutils.widgets.dropdown("env", envs[1], envs, "Environment")
env: str = dbutils.widgets.get("env")

# issuer_ref widget
issuer_refs = ["UPFRANCE", "FRACADHOC", "CDJFRANCEMCO", "CDJFRANCE", "UPCOHESIA", "RMUPFRANCEI"]
dbutils.widgets.dropdown("issuer_ref", issuer_refs[0], issuer_refs, "Issuer Ref")
issuer_ref: str = dbutils.widgets.get("issuer_ref")


app_globals = AppGlobals(env)
conf = load_conf(spark, app_globals.secret_scope)
delta_tables: DeltaTables = (
    DeltaTables(spark, f"upfrdatalake{env}sa", app_globals)
    if env != "inte"
    else DeltaTables(spark, f"upfrdatalake{env}s", app_globals)
)


# File
xml_row_tag = "BeneficiaryAccountBalance"

# Data Staging Repo
volume = "df17_staging"
data_staging_repo = (
    f"/Volumes/{app_globals.benefits_catalog_name}/{app_globals.benefits_bronze_database_name}/{volume}/{issuer_ref}/"
)

chkpt = delta_tables.get_check_point_location(
    app_globals.bronze_container,
    "BeneficiaryAccountBalance",
    app_globals.benefits_bronze_beneficiaryaccountbalance_table_name,
    "stream_df17_BeneficiaryAccountBalance",
)
chkpt_headers = delta_tables.get_check_point_location(
    app_globals.bronze_container,
    "BeneficiaryAccountBalance",
    app_globals.benefits_bronze_beneficiaryaccountbalance_headers_table_name,
    "stream_df17_BeneficiaryAccountBalance_headers",
)


# COMMAND ----------

beneficiaryaccountbalance_bronze = delta_tables.beneficiaryaccountbalance_bronze_delta_table
beneficiaryaccountbalance_headers_bronze = delta_tables.beneficiaryaccountbalance_headers_bronze_delta_table

# COMMAND ----------

# DBTITLE 1, Ingest Beneficiary Account Balance files into Bronze using Autoloader
input_stream = (
    spark.readStream.format("cloudFiles")
    .option("cloudFiles.format", "xml")
    .option("rowTag", xml_row_tag)
    .option("cloudFiles.includeExistingFiles", "false")
    .option("cloudFiles.maxFilesPerTrigger", 1)
    .option("cloudFiles.inferColumnTypes", "true")
    .option("cloudFiles.schemaLocation", chkpt + "/autoloaderSchema")
    .option("cloudFiles.schemaEvolutionMode", "rescue")
    .load(data_staging_repo)
    .withColumn("_sourceFile", fn.input_file_name())
    .withColumn("_ingestionDate", fn.current_timestamp())
)
# display(input_stream)
output_stream = (
    input_stream.writeStream.trigger(availableNow=True)
    .option("checkpointLocation", chkpt)
    .option("queryName", f"{env}_{delta_tables._domain}_stream_df17_accoutBalance")
    .option("mergeSchema", "true")
    .toTable(app_globals.benefits_bronze_beneficiaryaccountbalance_table_name)
)


# COMMAND ----------

# DBTITLE 1, headers processing functions


def get_distributorRef_from_string(input_string):
    regex = r"distributorRef=\"(.*?)\""
    match = re.search(regex, input_string)

    if match:
        output = match.group(1)
    else:
        output = ""
    return output


def get_fileDate_from_string(input_string):
    regex = r"fileDate=\"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2})\""
    match = re.search(regex, input_string)

    if match:
        output = match.group(1)
    else:
        output = ""
    return output


def get_fileId_from_string(input_string):
    regex = r"fileId=\"(\d+)\""
    match = re.search(regex, input_string)

    if match:
        output = match.group(1)
    else:
        output = ""
    return output


def get_interfaceVersion_from_string(input_string):
    regex = r"interfaceVersion=\"(\d+)\""
    match = re.search(regex, input_string)

    if match:
        output = match.group(1)
    else:
        output = ""
    return output


def get_nbrItems_from_string(input_string):
    regex = r"nbrItems=\"(\d+)\""
    match = re.search(regex, input_string)

    if match:
        output = match.group(1)
    else:
        output = ""
    return output


# COMMAND ----------

# DBTITLE 1, Transformation ForEachFile


def extract_header(df, batch_id):
    for file in df.collect():
        file_path = file.path
        text = dbutils.fs.head(file_path, 200)
        fileId = get_fileId_from_string(text)
        distributorRef = get_distributorRef_from_string(text)
        fileDate = get_fileDate_from_string(text)
        interfaceVersion = get_interfaceVersion_from_string(text)
        nbrItems = get_nbrItems_from_string(text)
        row_values = Row(
            fileId=fileId,
            fileDate=fileDate,
            distributorRef=distributorRef,
            interfaceVersion=interfaceVersion,
            nbrItems=nbrItems,
            _sourceFile=file._sourceFile,
            _ingestionDate=datetime.now(),
        )
        df_to_sink = spark.createDataFrame([row_values])
        df_to_sink = df_to_sink.select(
            fn.col("fileDate").cast("Timestamp"),
            fn.col("fileId").cast("Integer"),
            fn.col("distributorRef").cast("String"),
            fn.col("interfaceVersion").cast("Integer"),
            fn.col("nbrItems").cast("Integer"),
            fn.col("_sourceFile"),
            fn.col("_ingestionDate"),
        )
        df_to_sink.write.format("delta").mode("append").saveAsTable(
            app_globals.benefits_bronze_beneficiaryaccountbalance_headers_table_name
        )
    return True


# COMMAND ----------

# DBTITLE 1, Ingest Beneficiary Account Balance Headers info into Bronze using Autoloader

input_stream = (
    spark.readStream.format("cloudFiles")
    .option("cloudFiles.format", "binaryfile")
    .option("cloudFiles.maxFilesPerTrigger", 1)
    .option("cloudFiles.includeExistingFiles", "false")
    .load(data_staging_repo)
    .drop("content")
    .withColumn("_sourceFile", fn.input_file_name())
)
# display(input_stream)
output_stream = (
    input_stream.writeStream.trigger(availableNow=True)
    .option("checkpointLocation", chkpt_headers)
    .option("queryName", f"{env}_{delta_tables._domain}_stream_df17_accountbalance_headers")
    .option("mergeSchema", "true")
    .foreachBatch(extract_header)
    .start()
)
