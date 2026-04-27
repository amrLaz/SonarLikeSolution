from runtime.nutterfixture import NutterFixture
from pyspark.sql import SparkSession
from pyspark.sql.types import (
    StructType,
    StructField,
    StringType,
    LongType,
    BinaryType,
    TimestampType,
    MapType,
)
from pyspark.sql.utils import AnalysisException
import os


class TestIngestEf1tTransactions(NutterFixture):
    def before_all(self):
        self.spark = SparkSession.builder.appName("TestIngestEf1tTransactions").getOrCreate()
        self.environments = ["inte", "uat"]

    def run_ingestion_notebook(self):
        ingestion_notebook_path = os.path.abspath(
            os.path.join(os.getcwd(), "../../../notebooks/src/ingestion/ingest_ef1t_transactions_to_bronze")
        )

        for env in self.environments:
            try:
                dbutils.notebook.run(ingestion_notebook_path, 600, {"env": env, "slot": ""})
            except Exception as e:
                print(f"Error running ingestion notebook for {env}: {str(e)}")

    def assertion_ingestion_notebook(self):
        expected_schema = StructType(
            [
                StructField("body", BinaryType(), True),
                StructField("partition", StringType(), True),
                StructField("offset", StringType(), True),
                StructField("sequenceNumber", LongType(), True),
                StructField("enqueuedTime", TimestampType(), True),
                StructField("publisher", StringType(), True),
                StructField("partitionKey", StringType(), True),
                StructField("properties", MapType(StringType(), StringType(), True), True),
                StructField("systemProperties", MapType(StringType(), StringType(), True), True),
                StructField("_ingestion_time", StringType(), True),
            ]
        )

        for env in self.environments:
            table_name = f"upcoop_benefits_fabrik_{env}.bronze_ef1t.ef1t_transactions"

            try:
                delta_table_schema = self.spark.table(table_name).schema
                assert (
                    delta_table_schema == expected_schema
                ), f"Schema mismatch in {env}: {delta_table_schema} != {expected_schema}"
                print(f"Schema assertion passed for {env}")
            except AnalysisException:
                print(f"Table {table_name} does not exist in {env}")

    def after_all(self):
        pass


# Run the test fixture
test_fixture = TestIngestEf1tTransactions()
result = test_fixture.execute_tests()
print(result.to_string())
