# Non-secret variables for the production environment.
# postgres_admin_password is provided at apply time via TF_VAR_postgres_admin_password.
# azure_openai_endpoint and azure_openai_api_key are also provided via TF_VAR_* — never commit.

project             = "sast"
program             = "DevSecOps"
env                 = "prod"
location            = "westeurope"
resource_group_name = "up-france-odi-sast-prod-rg"

# ACR: shared registry "upgroup" in fd-devops — referenced as data source, not managed here

webapp_sku = "B1"

postgres_admin_login = "sast_admin"
postgres_db_name     = "sast_platform"
postgres_storage_gb  = 32

# developer_ip = "x.x.x.x"   # uncomment for direct DB access from your workstation

# AI — non-secret overrides (sensitive values via TF_VAR_* at apply time):
azure_openai_deployment  = "gpt-4o-mini"
azure_openai_api_version = "2024-02-15-preview"
# azure_openai_endpoint = ...  → TF_VAR_azure_openai_endpoint
# azure_openai_api_key  = ...  → TF_VAR_azure_openai_api_key
# anthropic_api_key     = ...  → TF_VAR_anthropic_api_key (optional)
