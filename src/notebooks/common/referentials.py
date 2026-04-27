from src.notebooks.utils.functions import read_csv_file
from dataclasses import dataclass
from pyspark.sql import DataFrame, SparkSession
from functools import cached_property
import os


@dataclass(init=False)
class Referentials:
    """
    Class representing referential data in a Spark session.
    """

    _spark: SparkSession
    dir_name: str

    def __init__(self, spark: SparkSession, dir_name: str) -> None:
        """
        Initializes the Referentials object.

        Args:
            spark (SparkSession): The Spark session.
            dir_name (str): The directory name.
        """
        self._spark = spark
        self.dir_name = dir_name

    @cached_property
    def countries_mapping(self) -> DataFrame:
        """
        Returns the countries mapping DataFrame.

        Returns:
            DataFrame: The countries mapping DataFrame.
        """
        complete_path: str = "file:" + os.path.abspath(os.path.join(self.dir_name, "../mappings/countries.csv"))
        return read_csv_file(spark=self._spark, file_path=complete_path, header=True, delimiter=";")

    @cached_property
    def currencies_mapping(self) -> DataFrame:
        """
        Returns the currencies mapping DataFrame.

        Returns:
            DataFrame: The currencies mapping DataFrame.
        """
        complete_path: str = "file:" + os.path.abspath(os.path.join(self.dir_name, "../mappings/currencies.csv"))
        return read_csv_file(spark=self._spark, file_path=complete_path, header=True, delimiter=";")

    @cached_property
    def response_codes_mapping(self) -> DataFrame:
        """
        Returns the response codes mapping DataFrame.

        Returns:
            DataFrame: The response codes mapping DataFrame.
        """
        complete_path: str = "file:" + os.path.abspath(os.path.join(self.dir_name, "../mappings/response_codes.csv"))
        return read_csv_file(spark=self._spark, file_path=complete_path, header=True, delimiter=",")

    @cached_property
    def payment_methods_mapping(self) -> DataFrame:
        """
        Returns the payment methods mapping DataFrame.

        Returns:
            DataFrame: The payment methods mapping DataFrame.
        """
        complete_path: str = "file:" + os.path.abspath(os.path.join(self.dir_name, "../mappings/payment_methods.csv"))
        return read_csv_file(spark=self._spark, file_path=complete_path, header=True, delimiter=";")

    @cached_property
    def operation_natures_mapping(self) -> DataFrame:
        """
        Returns the operation natures mapping DataFrame.

        Returns:
            DataFrame: The operation natures mapping DataFrame.
        """
        complete_path: str = "file:" + os.path.abspath(os.path.join(self.dir_name, "../mappings/operation_natures.csv"))
        return read_csv_file(spark=self._spark, file_path=complete_path, header=True, delimiter=";")

    @cached_property
    def distributors_settings(self) -> DataFrame:
        """
        Returns the distributors settings as DataFrame.

        """
        complete_path: str = "file:" + os.path.abspath(
            os.path.join(self.dir_name, "../mappings/distributors_settings.csv")
        )
        return read_csv_file(spark=self._spark, file_path=complete_path, header=True, delimiter=",")
