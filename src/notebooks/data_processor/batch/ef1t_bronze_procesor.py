from pyspark.sql import SparkSession, DataFrame
from pyspark.sql import functions as F


class Ef1tBronzeProcessor:
    def __init__(self, spark: SparkSession, eventhub_config: dict, checkpoint_path: str, env: str):
        """
        Initializes the stream processor with Spark, Event Hub config, checkpoint path, and environment.
        """
        self.spark = spark
        self.eventhub_config = eventhub_config
        self.checkpoint_path = checkpoint_path
        self.env = env

    def read_stream(self) -> DataFrame:
        """
        Reads streaming data from Event Hub.
        """
        return self.spark.readStream.format("eventhubs").options(**self.eventhub_config).load()

    def process_batch(self, batch_df: DataFrame, epoch_id: int):
        """
        Processes each batch of data.
        """
        catalog_name = f"upcoop_benefits_fabrik_{self.env}"
        schema_name = "bronze_ef1t"
        delta_table_name = "ef1t_transactions"

        try:
            batch_df = batch_df.withColumn("_ingestion_time", F.date_format(F.current_timestamp(), "yyyy-MM-dd HH:mm"))
            self.spark.sql(f"CREATE DATABASE IF NOT EXISTS {catalog_name}")
            self.spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog_name}.{schema_name}")
            batch_df.write.format("delta").mode("append").saveAsTable(
                f"{catalog_name}.{schema_name}.{delta_table_name}"
            )
        except Exception as e:
            print(f"Error persisting data: {e}")
            raise

    def build(self):
        """
        Writes the stream using `foreachBatch`.
        """
        input_stream_df = self.read_stream()
        return (
            input_stream_df.writeStream.foreachBatch(self.process_batch)
            .option("checkpointLocation", self.checkpoint_path)
            .queryName(f"{self.env}_bronze_ef1t_transactions")
            .trigger(availableNow=True)
            .start()
        )
