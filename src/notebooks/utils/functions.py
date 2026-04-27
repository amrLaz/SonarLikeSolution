from pyspark.sql import DataFrame
import pyspark.sql.functions as fn


def read_csv_file(
    spark,
    file_path,
    infer_schema=True,
    header=True,
    delimiter=",",
    null_value="",
    empty_value="",
) -> DataFrame:
    """
    Reads a CSV file and returns a DataFrame.

    Args:
        spark (SparkSession): The SparkSession object.
        file_path (str): The path to the CSV file.
        infer_schema (bool): Whether to infer the schema from the data. Default is True.
        header (bool): Whether the CSV file has a header. Default is True.
        delimiter (str): The delimiter used in the CSV file. Default is ",".
        null_value (str): The value to be treated as null. Default is "".
        empty_value (str): The value to be treated as empty. Default is "".

    Returns:
        DataFrame: The DataFrame containing the data from the CSV file.
    """
    df = (
        spark.read.option("header", header)
        .option("inferSchema", infer_schema)
        .option("delimiter", delimiter)
        .option("nullValue", null_value)
        .option("emptyValue", empty_value)
        .csv(file_path)
    )
    return df


def deduplicate_on_timestamp(df, id_col, timestamp_col):
    """
    Deduplicates a DataFrame based on the latest timestamp for a given ID column.

    Args:
    - df (DataFrame): The input DataFrame.
    - id_col (str): The column name to deduplicate on.
    - timestamp_col (str): The timestamp column used for ordering.

    Returns:
    DataFrame: Deduplicated DataFrame.
    """
    from pyspark.sql.window import Window
    from pyspark.sql.functions import row_number, desc

    # Define a window spec
    window_spec = Window.partitionBy(id_col).orderBy(desc(timestamp_col))

    # Use row_number to assign a unique number to each row in the window
    df_with_rownum = df.withColumn("row_num", row_number().over(window_spec))

    # Filter rows where row_num is 1 (latest timestamp)
    deduplicated_df = df_with_rownum.filter(df_with_rownum.row_num == 1).drop("row_num")

    return deduplicated_df


def add_Currency(df: DataFrame, ref: DataFrame) -> DataFrame:
    """
    Adds currency information to a DataFrame based on a reference DataFrame.

    Args:
        df (DataFrame): The DataFrame to which currency information will be added.
        ref (DataFrame): The reference DataFrame containing currency mapping.

    Returns:
        DataFrame: The updated DataFrame with currency information.

    """
    return df.join(
        ref.currencies_mapping,
        df.currency_iso_code == ref.currencies_mapping.Number,
        "left",
    ).select(df["*"], ref.currencies_mapping["Code"].alias("currency"))


def add_Country(df, ref):
    """
    Adds a 'country' column to the DataFrame by joining it with the 'countries_mapping' DataFrame.

    Args:
        df (pyspark.sql.DataFrame): The input DataFrame.
        ref (pyspark.sql.DataFrame): The reference DataFrame containing the 'countries_mapping' data.

    Returns:
        pyspark.sql.DataFrame: The DataFrame with the 'country' column added.
    """
    return df.join(ref.countries_mapping, df.country_code == ref.countries_mapping.Numeric, "left").select(
        df["*"], ref.countries_mapping["Country"].alias("country")
    )


def add_Response_Message(df, ref):
    return df.join(
        ref.response_codes_mapping,
        df.response_code == ref.response_codes_mapping.response_code,
        "left",
    ).select(df["*"], ref.response_codes_mapping["response_message"])


def add_payment_method(df, ref):
    return df.join(
        ref.payment_methods_mapping,
        fn.substring(df.posEntryMode, -3, 2) == ref.payment_methods_mapping.code,
        "left",
    ).select(
        df["*"],
        fn.coalesce(ref.payment_methods_mapping["payment_method"], fn.lit("UNKNOWN")).alias("payment_method"),
    )


def add_operation_nature(df, ref):
    return df.join(
        ref.operation_natures_mapping,
        df.operationNature == ref.operation_natures_mapping.operationNature,
        "left",
    ).select(
        df["*"],
        fn.coalesce(ref.operation_natures_mapping["operation_nature"], fn.lit("UNKNOWN")).alias("operation_nature"),
    )


def add_cosmos_fields(df):
    """
    Adds additional technical fields to the given DataFrame for Cosmos DB.

    Args:
        df (pyspark.sql.DataFrame): The input DataFrame.

    Returns:
        pyspark.sql.DataFrame: The DataFrame with additional fields added.
    """
    return (
        df.withColumn("partitionKey", fn.col("account"))
        .withColumn("id", fn.sha2(fn.col("transaction_id"), 256))
        .withColumn("_action_date", fn.col("messageDate").cast("double"))
        .withColumn("_source", fn.lit("EXPRESS_ROUTE").cast("string"))
    )


def write_to_cosmos(dataframe: DataFrame, writeConfig: dict):
    """
    Writes the given dataframe to Cosmos DB using the specified write configuration.

    Parameters:
    - dataframe (DataFrame): The dataframe to be written to Cosmos DB.
    - writeConfig (dict): The write configuration options for Cosmos DB.

    Returns:
    None
    """
    dataframe.write.format("cosmos.oltp").options(**writeConfig).mode("APPEND").save()


def apply_scaling_factor(col_name, currency_exponent_col):
    return (
        (fn.col(col_name) * fn.pow(10, -fn.col(currency_exponent_col)))
        .cast("decimal(6, 2)")
        .cast("double")
        .alias(col_name)
    )
