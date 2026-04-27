# Databricks notebook source
# DBTITLE 1, Import Libraries
from src.notebooks.common import AppGlobals, load_conf, DeltaTables
import pyspark.sql.functions as fn


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
delta_tables: DeltaTables = (
    DeltaTables(spark, f"upfrdatalake{env}sa", app_globals)
    if env != "inte"
    else DeltaTables(spark, f"upfrdatalake{env}s", app_globals)
)


beneficiaryaccountbalance_silver = delta_tables.beneficiaryaccountbalance_silver_delta_table
beneficiaryaccountbalance_bronze = delta_tables.beneficiaryaccountbalance_bronze_delta_table
beneficiaryaccountbalance_headers_bronze = delta_tables.beneficiaryaccountbalance_headers_bronze_delta_table

# COMMAND ----------


def df_transform(input_df):
    # Transform
    main_df = (
        input_df
        # .withColumn('BeneficiaryAccountBalance_account', fn.explode(fn.col('Account')))
        # .withColumn('CardList_exploded', fn.explode(fn.col('CardList')))
        .withColumn("_curationDate", fn.current_timestamp()).select(
            fn.col("fileDate").alias("fileDate"),
            fn.col("fileId").alias("fileId").cast("String"),
            fn.col("distributorRef").alias("distributorRef"),
            fn.col("_funderContractRef").alias("funderContractRef"),
            fn.col("_beneficiaryServiceRef").alias("beneficiaryServiceRef"),
            # fn.col('Account._accountCategory').alias('accountCategory'),
            (fn.col("Account.AccountBalance.amount") * fn.pow(10, -fn.col("Account.AccountBalance.exponent"))).alias(
                "accountBalance"
            ),
            fn.col("Account.AccountBalance.currency").alias("accountBalanceCurrency").cast("Integer"),
            (fn.col("Account.realBalance.amount") * fn.pow(10, -fn.col("Account.realBalance.exponent"))).alias(
                "realBalance"
            ),
            fn.col("Account.realBalance.currency").alias("realBalanceCurrency").cast("Integer"),
            fn.col("Account.accountStatus").alias("accountStatus"),
            fn.col("Account.closedDate").alias("accountClosedDate"),
            fn.col("Account.creationDate").alias("accountCreationDate"),
            fn.col("Account.reloadableFlag").alias("accountReloadableFlag"),
            fn.col("Account.timeZone").alias("accountTimeZone"),
            fn.col("CardList"),
            fn.col("Account.VoucherList"),
            fn.col("_sourceFile"),
            fn.col("_ingestionDate"),
            fn.col("_curationDate"),
        )
    )

    return main_df


# COMMAND ----------

# DBTITLE 1, Truncate the silver table
spark.sql(f"TRUNCATE TABLE {app_globals.benefits_silver_beneficiaryaccountbalance_table_name}")

# COMMAND ----------

# DBTITLE 1, input df - merge account balance and headers
bronze_accountbalance = beneficiaryaccountbalance_bronze.toDF()
bronze_headers = beneficiaryaccountbalance_headers_bronze.toDF()
input_df = (
    bronze_accountbalance.join(
        bronze_headers, bronze_accountbalance["_sourceFile"] == bronze_headers["_sourceFile"], "left"
    )
    .drop(bronze_headers["_sourceFile"])
    .drop(bronze_headers["_ingestionDate"])
)
# .drop(fn.col('df11_header._ingestionDate')).drop(fn.col('df11_header._sourceFile'))


# display(bronze_headers)
# display(input_df)

# COMMAND ----------

# s = spark.sql("select * from upcoop_benefits_fabrik_inte.benefits_silver.beneficiaryaccountbalance")

# COMMAND ----------

# DBTITLE 1, Foreach product, insert data from the latest file into the silver table
for product in ["UPFRANCE", "CDJFRANCE", "CDJFRANCEMCO", "FRACADHOC", "RMUPFRANCEI"]:
    # fetch the latest fileDate for the product
    latest_filedate = spark.sql(
        f"SELECT max(fileDate) from {app_globals.benefits_bronze_beneficiaryaccountbalance_headers_table_name} where distributorRef == '{product}'"
    ).collect()[0][0]
    print(f"processing product : {product}")
    print(f"featching latest file (fileDate : {latest_filedate})")

    df = input_df.filter(fn.col("distributorRef") == product).filter(fn.col("fileDate") == latest_filedate)
    print(f"Number of input rows  : {df.count()}")

    # transform
    output_data = df_transform(df)
    if output_data.count() > 0:
        print(f"Number of sink rows  : {output_data.count()}")

        # sink
        o_result = (
            output_data.write.mode("append")
            .option("failOnDataLoss", "true")
            .option("MergeSchema", "true")
            .format("delta")
            .saveAsTable(app_globals.benefits_silver_beneficiaryaccountbalance_table_name)
        )
