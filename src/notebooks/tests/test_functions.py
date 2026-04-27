import unittest
from pyspark.sql import SparkSession
from pyspark.sql.types import StringType, StructField, StructType

# Import the function you want to test
from utils.functions import add_Currency


class TestAddCurrency(unittest.TestCase):
    def setUp(self):
        # Create a SparkSession for testing
        self.spark = SparkSession.builder.getOrCreate()

    def tearDown(self):
        # Stop the SparkSession after testing
        self.spark.stop()

    def test_add_Currency(self):
        # Define the test data
        schema = StructType(
            [
                StructField("currency_iso_code", StringType(), True),
                StructField("value", StringType(), True),
            ]
        )
        data = [("USD", "100"), ("EUR", "200"), ("GBP", "300")]
        df = self.spark.createDataFrame(data, schema)

        # Call the function to be tested
        ref = None  # Replace with your actual Referentials object
        result = add_Currency(df, ref)

        # Define the expected result
        expected_schema = StructType(
            [
                StructField("currency_iso_code", StringType(), True),
                StructField("value", StringType(), True),
                StructField("currency", StringType(), True),
            ]
        )
        expected_data = [
            ("USD", "100", "USD"),
            ("EUR", "200", "EUR"),
            ("GBP", "300", "GBP"),
        ]
        expected_df = self.spark.createDataFrame(expected_data, expected_schema)

        # Compare the actual result with the expected result
        self.assertEqual(result.collect(), expected_df.collect())


if __name__ == "__main__":
    unittest.main()
