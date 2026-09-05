import os
from typing import Dict
from .dynamic import Dynamic
from pyspark.sql import SparkSession


def _load_dot_env(env_file_path: str, prefix: str) -> Dict[str, str]:
    env_vars = []
    with open(env_file_path) as f:
        for line in f:
            if line.startswith("#") or not line.strip() or not line.startswith(prefix):
                continue
            key, value = line.strip().split("=", 1)
            env_vars.append({"name": key.replace(prefix, ""), "value": value})
    return {s["name"]: s["value"] for s in env_vars}


def load_conf(
    spark: SparkSession,
    scope: str = None,
    prefix: str = "ADB__",
    from_env: bool = False,
):
    if not from_env:
        secrets = get_db_utils(spark).secrets.list(scope)
        sec = {s.key.replace("-", "_"): get_db_utils(spark).secrets.get(scope, s.key) for s in secrets}
        return Dynamic(**sec)
    else:
        dot_env_path: str = os.path.join(os.getcwd(), ".env")
        if not os.path.exists(dot_env_path):
            raise Exception(f"No .env file founded at this location {os.getcwd()}")
        res = _load_dot_env(dot_env_path, prefix)
        return Dynamic(**res)


def get_db_utils(spark: SparkSession):
    dbutils = None
    if spark.conf.get("spark.databricks.service.client.enabled") == "true":
        from pyspark.dbutils import DBUtils

        dbutils = DBUtils(spark)
    else:
        import IPython

        dbutils = IPython.get_ipython().user_ns["dbutils"]

    return dbutils


if __name__ == "__main__":
    conf = load_conf(SparkSession.builder.getOrCreate(), from_env=True)
    print(conf)
