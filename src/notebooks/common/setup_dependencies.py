# Databricks notebook source
# DBTITLE 1,Setup Packages
# MAGIC %sh
# MAGIC pip install --upgrade pip
# MAGIC PAT_AZ_PACKAGES=tpq77hcvieu7qlkhhkkcshptli4amooys4duiuvozlnnzus2wdpq
# MAGIC INDEX_URL=https://$PAT_AZ_PACKAGES@pkgs.dev.azure.com/up-group/_packaging/packages/pypi/simple
# MAGIC pip install azure-cosmos==4.2.0
# MAGIC pip install azure-servicebus==7.6.0
# MAGIC pip install azure-eventhub==5.7.0
# MAGIC pip install azure-storage-blob==12.11.0
# MAGIC pip install pyspark~=3.3.1
# MAGIC pip install delta-spark~=2.2.0
