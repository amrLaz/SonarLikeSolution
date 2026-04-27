import unittest
from unittest.mock import patch
from pyspark.sql import SparkSession
from pyspark.sql.types import StructType, StructField, StringType, TimestampType
from datetime import datetime
import os
from src.notebooks.data_processor.batch.ef1t_bronze_procesor import Ef1tBronzeProcessor


class TestEf1tBronzeProcessor(unittest.TestCase):
    @classmethod
    def setUpClass(self):
        self.spark = SparkSession.builder.appName("mocking spark writeStream test").getOrCreate()
        self.eventhub_config = {"eventhubs.connectionString": "fake-connection-string"}
        self.checkpoint_path = "/tmp/checkpoint"
        self.processor = Ef1tBronzeProcessor(self.spark, self.eventhub_config, self.checkpoint_path, "test")

    @patch("pyspark.sql.streaming.DataStreamReader.load")
    def test_read_stream(self, mock_load):
        schema = StructType(
            [StructField("body", StringType(), True), StructField("_ingestionDate", TimestampType(), True)]
        )
        fake_df = self.spark.createDataFrame(
            [('{"message": "test1"}', datetime.now()), ('{"message": "test2"}', datetime.now())], schema=schema
        )

        mock_load.return_value = fake_df

        input_stream_df = self.processor.read_stream()

        self.assertEqual(input_stream_df.schema, fake_df.schema)
        rows = input_stream_df.collect()
        self.assertListEqual([row["body"] for row in rows], ['{"message": "test1"}', '{"message": "test2"}'])

    @classmethod
    def tearDownClass(self):
        if "DATABRICKS_RUNTIME_VERSION" not in os.environ:
            self.spark.stop()


if __name__ == "__main__":
    unittest.main(argv=["first-arg-is-ignored"], exit=False)
