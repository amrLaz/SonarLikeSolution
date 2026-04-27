# COMMAND ----------
# TODO: Migrate unit tests from Nutter to unittest for better integration with CI/CD pipelines.
# Ensure test setup, assertions, and teardown are adapted accordingly.

from runtime.nutterfixture import NutterFixture
from pyspark.sql import SparkSession
from pyspark.sql.types import StructType, StructField, StringType
from pyspark.sql import functions as F
from src.notebooks.utils.data_quality.data_quality_validator import DataQualityValidator
from src.notebooks.tests.utils.utils_common import get_mock_data_path


# COMMAND ----------
class TestDataQualityValidatorWithPath(NutterFixture):
    def __init__(self):
        super().__init__()
        self.spark = SparkSession.builder.getOrCreate()
        self.validator = None
        self.validation_results = None
        self.metric_results = None
        self.config_path = get_mock_data_path("mock_data/checks.yml")

    def before_all(self):
        # Simple mock data with two columns for testing
        data = [
            {"column1": "value1", "column2": "value2"},
            {"column1": None, "column2": "value4"},
            {"column1": None, "column2": None},
        ]

        schema = StructType([StructField("column1", StringType(), True), StructField("column2", StringType(), True)])

        self.mock_df = self.spark.createDataFrame(data, schema)

        # Initialize the DataQualityValidator with the DataFrame and YAML file
        self.validator = DataQualityValidator(self.mock_df, self.config_path)

    def run_execute_expectations(self):
        # Execute validation
        self.validation_results = self.validator.validate()

    def assertion_execute_expectations(self):
        # Assert the validation results DataFrame is not empty
        assert self.validation_results.count() > 0, "Validation results should not be empty."

        # Assert the validation results contain specific columns
        expected_columns = ["_errors", "_warnings", "column1", "column2"]
        actual_columns = set(self.validation_results.columns)
        for col in expected_columns:
            assert col in actual_columns, f"Expected column '{col}' is missing in the validation results."

        # Assert that the `_errors` column contains expected violations
        errors_collected = self.validation_results.select(F.explode(F.col("_errors"))).collect()
        assert len(errors_collected) > 0, "No errors were collected, but some were expected."

        # Assert that specific rows are flagged with errors or warnings
        error_rows = self.validation_results.filter(F.size(F.col("_errors")) > 0).count()
        assert error_rows > 0, "At least one row should have errors flagged."

    def run_generate_metrics(self):
        self.metric_results = self.validator.generate_metrics(self.validation_results, "mock_data")

    def assertion_generate_metrics(self):
        expected_data = [
            ("mock_data", "column1", 2, 3, 66.67, ["col_column1_is_null:Column column1 is null"]),
            ("mock_data", "column2", 1, 3, 33.33, ["col_column2_is_null:Column column2 is null"]),
        ]
        expected_columns = [
            "table_name",
            "column",
            "unexpected_count",
            "element_count",
            "unexpected_percent",
            "violated_checks",
        ]

        expected_df = self.spark.createDataFrame(expected_data, schema=expected_columns)

        metric_results_normalized = self.metric_results.drop("timestamp")

        assert (
            metric_results_normalized.collect() == expected_df.collect()
        ), "Generated metrics do not match the expected results."

    def after_all(self):
        pass


# COMMAND ----------
test_fixture = TestDataQualityValidatorWithPath()
result = test_fixture.execute_tests()
print(result.to_string())
