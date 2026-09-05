from pyspark.sql import SparkSession, DataFrame
from pyspark.sql.types import StringType
import src.notebooks.utils.functions as cf
import pyspark.sql.functions as fn


class ThunesProcessor:
    def __init__(self, spark: SparkSession, config: dict, product_df: DataFrame, env: str):
        self.spark = spark
        self.config = config
        self.product_df = product_df
        self.env = env
        self.push_columns = [
            "AccountReference",
            "CorrelationId",
            "PaymentAuthorizationReference",
            "ProductReference",
            "Provider",
            "Source",
            "Amount",
            "EventType",
            "Timestamp",
            "PaymentDate",
            "RequestRegulationDate",
        ]

    def fetch_stream(self):
        reader = self.spark.readStream.format("cloudFiles")
        for k, v in self.config.get("cloudFiles_options", {}).items():
            reader = reader.option(k, v)
        return reader.schema(self.config["schema"]).load(self.config["staging_path"])

    def transform(self, df: DataFrame) -> DataFrame:
        id_acceptation_value = "LIMONETIK" if self.env == "prod" else "RMLIMONETIK"
        return (
            df.withColumn("BeneficiaryAccountOperation", fn.explode("BeneficiaryAccountOperation"))
            .withColumn("Card", fn.col("BeneficiaryAccountOperation.Card"))
            .withColumn("FirstPresentment", fn.col("Card.FirstPresentment"))
            .alias("df20")
            .join(
                self.product_df.alias("product"),
                (
                    (fn.col("BeneficiaryAccountOperation._productRef") == fn.col("product.product_reference"))
                    & (fn.col("_distributorRef") == fn.col("product.distributor_reference"))
                ),
            )
            .select("df20.*")
            .filter(fn.col("FirstPresentment._transactionType") == "20")
            .filter(fn.col("FirstPresentment.clearingStatus") == 1)
            .filter(fn.col("FirstPresentment.clearingReason") == "REFUND_REQUIRED")
            .filter(fn.col("FirstPresentment.idAcceptation") == id_acceptation_value)
            .filter(fn.col("FirstPresentment._cardSchemeCode") == "PRI")
            .filter(
                (fn.col("FirstPresentment.complementAmount").isNull())
                | ((fn.col("FirstPresentment.complementAmount.amount") == 0))
            )
            .select(
                fn.col("BeneficiaryAccountOperation._beneficiaryServiceRef").alias("AccountReference"),
                cf.apply_scaling_factor(
                    "FirstPresentment.reconciliationAmount.amount", "FirstPresentment.reconciliationAmount.exponent"
                ).alias("Amount"),
                fn.sha2(
                    fn.concat(
                        fn.col("BeneficiaryAccountOperation._productRef"),
                        fn.lit("-"),
                        fn.col("_distributorRef"),
                        fn.lit("-"),
                        fn.col("FirstPresentment._idOperation"),
                    ),
                    256,
                ).alias("CorrelationId"),
                fn.col("FirstPresentment.authorizationReference").alias("PaymentAuthorizationReference"),
                fn.col("BeneficiaryAccountOperation._productRef").alias("ProductReference"),
                fn.lit("Thunes").alias("Provider"),
                fn.lit("Benefits").alias("Source"),
                fn.lit("BenfitsRegulationEvent").alias("EventType"),
                fn.current_timestamp().alias("Timestamp"),
                fn.col("FirstPresentment.dateTransaction").alias("PaymentDate"),
                fn.col("FirstPresentment.transmissionDateAndTime").alias("RequestRegulationDate"),
            )
            .dropDuplicates(["CorrelationId"])
            .select(fn.to_json(fn.struct(*self.push_columns)).cast(StringType()).alias("body"))
        )

    def transform_and_write_to_eventhubs(self, df: DataFrame, epoch_id: int):
        transformed_df = self.transform(df)
        transformed_df.write.format("eventhubs").options(**self.config["writer_event_hub_conf"]).save()

    def start(self):
        return (
            self.fetch_stream()
            .writeStream.foreachBatch(self.transform_and_write_to_eventhubs)
            .queryName("thunes_transactions")
            .option("checkpointLocation", self.config["checkpoint_path"])
            .trigger(availableNow=True)
            .start()
        )
