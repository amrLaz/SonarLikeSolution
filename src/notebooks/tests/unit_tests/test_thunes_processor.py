# COMMAND ----------
# TODO: Migrate unit tests from Nutter to unittest for better integration with CI/CD pipelines.
# Ensure test setup, assertions, and teardown are adapted accordingly.
from runtime.nutterfixture import NutterFixture
from pyspark.sql import SparkSession
from pyspark.sql.types import StructType, StructField, StringType
from unittest.mock import MagicMock
from src.notebooks.data_processor.batch.thunes_processor import ThunesProcessor
from src.notebooks.common.schema import thunes_schema
import json
from src.notebooks.tests.utils.utils_common import get_mock_data_path, mock_transaction_payload


class TestThunesProcessor(NutterFixture):
    def before_all(self):
        self.spark = SparkSession.builder.appName("ThunesProcessorApp").getOrCreate()

        self.schema_struct = thunes_schema
        self.file_path = "file:" + get_mock_data_path("mock_data/mock_thunes.xml")

        self.config = {
            "schema": self.schema_struct,
            "staging_path": self.file_path,
            "cloudFiles_options": {
                "cloudFiles.format": "xml",
                "rowTag": "CRO",
                "mode": "FAILFAST",
            },
        }

        product_data = [("RMUPFRANCE", "FRACADHOCCE")]
        product_schema = StructType(
            [
                StructField("distributor_reference", StringType()),
                StructField("product_reference", StringType()),
            ]
        )
        product_df = self.spark.createDataFrame(product_data, product_schema)

        self.thunes_processor = ThunesProcessor(self.spark, self.config, product_df)

    def run_fetch_stream(self):
        self.df = self.thunes_processor.fetch_stream()

    def assertion_fetch_stream(self):
        assert self.df.isStreaming, "Expected a streaming DataFrame"
        actual_fields = set(f.name for f in self.df.schema.fields)
        expected_fields = set(f.name for f in self.schema_struct.fields)
        assert expected_fields <= actual_fields, f"Missing fields: {expected_fields - actual_fields}"

    def run_transform(self):
        input_data = [mock_transaction_payload()]
        input_df = self.spark.read.json(self.spark.sparkContext.parallelize([json.dumps(row) for row in input_data]))
        self.transformed_df = self.thunes_processor.transform(input_df)

    def assertion_transform(self):
        assert self.transformed_df.count() == 1
        assert "body" in self.transformed_df.collect()[0].asDict()

    def run_transform_and_write_to_eventhubs(self):
        dummy_input_df = self.spark.createDataFrame([], schema=StructType([]))

        # Mock the Event Hubs writer operations
        mock_eventhub_writer_operations = MagicMock()
        mock_eventhub_writer_operations.format.return_value = mock_eventhub_writer_operations
        mock_eventhub_writer_operations.options.return_value = mock_eventhub_writer_operations
        mock_eventhub_writer_operations.save = MagicMock()

        # Mock the transformed streaming DataFrame
        mock_transformed_streaming_dataframe = MagicMock()
        mock_transformed_streaming_dataframe.write = mock_eventhub_writer_operations

        # Mock the transform() method to return the mocked streaming DataFrame
        self.thunes_processor.transform = MagicMock(return_value=mock_transformed_streaming_dataframe)
        self.thunes_processor.config["writer_event_hub_conf"] = {"some": "conf"}

        # Save mocks for assertion
        self.thunes_processor.transform_and_write_to_eventhubs(dummy_input_df, 1)
        self.mock_eventhub_writer_operations = mock_eventhub_writer_operations

    def assertion_transform_and_write_to_eventhubs(self):
        self.mock_eventhub_writer_operations.format.assert_called_with("eventhubs")
        self.mock_eventhub_writer_operations.options.assert_called_with(
            **self.thunes_processor.config["writer_event_hub_conf"]
        )
        self.mock_eventhub_writer_operations.save.assert_called_once()

    def after_all(self):
        pass


# COMMAND ----------
# Execute the tests
result = TestThunesProcessor().execute_tests()
print(result.to_string())
