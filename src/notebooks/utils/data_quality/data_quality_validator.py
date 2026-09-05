from databricks.labs.dqx.engine import DQEngine
from databricks.sdk import WorkspaceClient
from pyspark.sql import *
from pyspark.sql import functions as F
import yaml
import os


class DataQualityValidator:
    def __init__(self, input_df: DataFrame, yaml_input: str):
        self.input_df = input_df
        self.yaml_input = yaml_input
        self.dq_engine = DQEngine(WorkspaceClient())

    def validate(self) -> DataFrame:
        """
        Validate the input dataframe against the rules defined in the YAML input.

        :return: A dataframe containing both valid and invalid data with `_warning` and `_errors` columns.
        """
        if self.is_yaml_content(self.yaml_input):
            # If YAML content, parse it
            try:
                checks = yaml.safe_load(self.yaml_input)
                # Check if the parsed content is a list (because the checks should be a list of check definitions)
                if not isinstance(checks, list):
                    raise ValueError("YAML content must be a list of checks.")
            except yaml.YAMLError as e:
                raise ValueError(f"Failed to parse YAML content: {e}")
        else:
            # Treat as file path and load from workspace
            checks = self.dq_engine.load_checks_from_workspace_file(self.yaml_input)

        # Apply the checks to the dataframe
        valid_and_quarantined_df = self.dq_engine.apply_checks_by_metadata(self.input_df, checks)
        return valid_and_quarantined_df

    def is_yaml_content(self, yaml_input: str) -> bool:
        """
        Determine whether the input is YAML content or a file path.

        :param yaml_input: YAML content or file path as a string.
        :return: True if input is YAML content, False if it's a file path.
        """
        return not os.path.exists(yaml_input) and "\n" in yaml_input

    def generate_metrics(self, validated_df: DataFrame, table_name: str) -> DataFrame:
        """
        Generate metrics based on the validation results for each violated column.

        :param validated_df: The dataframe containing validation results, including `_errors` and `_warnings`.
        :param table_name: The name of the table being validated.
        :return: A DataFrame with metrics such as violated checks, unexpected counts, and percentages for each column.
        """
        total_count = validated_df.count()
        exploded_df = validated_df.select(F.explode(F.col("_errors")).alias("error_key", "error_value"))
        total_count_column = F.lit(total_count)

        metrics = (
            exploded_df.groupBy("error_key")
            .agg(
                F.count("*").alias("unexpected_count"),
                F.collect_set(F.concat(F.col("error_key"), F.lit(":"), F.col("error_value"))).alias("violated_checks"),
            )
            .withColumn(
                "unexpected_percent",
                F.when(total_count_column > 0, (F.col("unexpected_count") / total_count_column) * 100).otherwise(0),
            )
            .withColumn("unexpected_percent", F.round(F.col("unexpected_percent"), 2))  # Round to 2 decimal places
            .withColumn("element_count", total_count_column)
            .withColumn("table_name", F.lit(table_name))
            .withColumn("timestamp", F.current_timestamp())
        )

        metrics = metrics.select(
            "table_name",
            F.split("error_key", "_").getItem(1).alias("column"),
            "unexpected_count",
            "element_count",
            "unexpected_percent",
            "violated_checks",
            "timestamp",
        )

        return metrics

    def persist_metrics(self, env: str, metrics_df: DataFrame):
        """
        Processes the validation results and writes them to a Delta table.
        Creates the schema if it does not exist.

        :param env: The environment (e.g., 'dev', 'prod') used for naming the catalog.
        :param metrics_df: The DataFrame containing metrics to be persisted.
        """
        catalog_name = f"upcoop_benefits_fabrik_{env}"
        schema_name = "metrics"
        delta_table_name = "data_quality_metrics"

        try:
            # Ensure the schema exists
            if not spark.catalog.databaseExists(f"{catalog_name}.{schema_name}"):
                spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog_name}.{schema_name}")

            # Write the metrics DataFrame to the Delta table
            metrics_df.write.format("delta").mode("append").saveAsTable(
                f"{catalog_name}.{schema_name}.{delta_table_name}"
            )
            print(f"Metrics successfully persisted to {catalog_name}.{schema_name}.{delta_table_name}.")

        except Exception as e:
            # Log or handle exceptions if the persistence fails
            print(f"Error persisting metrics: {e}")
            raise
