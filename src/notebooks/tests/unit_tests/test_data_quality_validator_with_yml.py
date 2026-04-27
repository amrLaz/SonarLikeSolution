# COMMAND ----------
# TODO: Migrate unit tests from Nutter to unittest for better integration with CI/CD pipelines.
# Ensure test setup, assertions, and teardown are adapted accordingly.

from runtime.nutterfixture import NutterFixture
from pyspark.sql import SparkSession
from pyspark.sql.types import StructType, StructField, StringType
from src.notebooks.utils.data_quality.data_quality_validator import DataQualityValidator


class TestDataQualityValidatorWithYamlContent(NutterFixture):
    def __init__(self):
        super().__init__()
        self.spark = SparkSession.builder.getOrCreate()
        self.validator = None
        self.validation_results = None

    def before_all(self):
        data = [
            {"column1": "value1", "column2": "value2"},
            {"column1": "value3", "column2": "value4"},
            {"column1": None, "column2": "value6"},
        ]

        schema = StructType([StructField("column1", StringType(), True), StructField("column2", StringType(), True)])

        self.mock_df = self.spark.createDataFrame(data, schema)

        self.yaml_content = """
        - criticality: error
          check:
            function: is_not_null
            arguments:
              col_names:
              - column1
        - criticality: error
          check:
            function: is_not_null_and_not_empty
            arguments:
              col_name: column1
        """

        # Initialize the DataQualityValidator with the DataFrame and YAML content
        self.validator = DataQualityValidator(self.mock_df, self.yaml_content)

    def run_execute_expectations(self):
        self.validation_results = self.validator.validate()

    def assertion_execute_expectations(self):
        assert self.validation_results.count() > 0

    def after_all(self):
        pass


# Run the test fixture
test_fixture_yml = TestDataQualityValidatorWithYamlContent()
result = test_fixture_yml.execute_tests()
print(result.to_string())
