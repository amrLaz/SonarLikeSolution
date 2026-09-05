from pyspark.sql import SparkSession


def get_dbutils(spark: SparkSession):
    try:
        from pyspark.dbutils import DBUtils

        dbutils = DBUtils(spark)
    except ImportError:
        import IPython

        print("Fallback to dbutils from user_ns")

        dbutils = IPython.get_ipython().user_ns["dbutils"]
    return dbutils


def run_notebook_with_retry(notebook, timeout, args={}, max_retries=3):
    num_retries = 0
    while True:
        try:
            return dbutils.notebook.run(notebook, timeout, args)
        except Exception as e:
            if num_retries > max_retries:
                raise e
            else:
                print("Retrying error", e)
                num_retries += 1
