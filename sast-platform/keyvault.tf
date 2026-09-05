# ─── Key Vault ────────────────────────────────────────────────────────────────
# Stocke les secrets AI (Azure OpenAI, Anthropic) et les expose à l'App Service
# via Key Vault References (@Microsoft.KeyVault) — jamais en clair dans app_settings.

resource "azurerm_key_vault" "sast" {
  # KV names: 3-24 chars, alphanumeric + hyphens, globally unique.
  name                       = "up-fr-odi-sast-prod-kv"
  resource_group_name        = azurerm_resource_group.sast.name
  location                   = azurerm_resource_group.sast.location
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  enable_rbac_authorization  = true
  soft_delete_retention_days = 7
  purge_protection_enabled   = false
  tags                       = local.common_tags
}

# Donne au principal Terraform (CI/CD ou opérateur) le droit d'écrire les secrets.
resource "azurerm_role_assignment" "kv_admin" {
  scope                = azurerm_key_vault.sast.id
  role_definition_name = "Key Vault Administrator"
  principal_id         = data.azurerm_client_config.current.object_id
}

# Donne à l'identité managée de l'App Service le droit de lire les secrets.
resource "azurerm_role_assignment" "app_kv_secrets_user" {
  scope                = azurerm_key_vault.sast.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_linux_web_app.sast.identity[0].principal_id
}

# ─── Secrets AI ────────────────────────────────────────────────────────────────

resource "azurerm_key_vault_secret" "azure_openai_endpoint" {
  name         = "azure-openai-endpoint"
  value        = var.azure_openai_endpoint
  key_vault_id = azurerm_key_vault.sast.id
  depends_on   = [azurerm_role_assignment.kv_admin]
}

resource "azurerm_key_vault_secret" "azure_openai_api_key" {
  name         = "azure-openai-api-key"
  value        = var.azure_openai_api_key
  key_vault_id = azurerm_key_vault.sast.id
  depends_on   = [azurerm_role_assignment.kv_admin]
}

resource "azurerm_key_vault_secret" "azure_openai_deployment" {
  name         = "azure-openai-deployment"
  value        = var.azure_openai_deployment
  key_vault_id = azurerm_key_vault.sast.id
  depends_on   = [azurerm_role_assignment.kv_admin]
}

resource "azurerm_key_vault_secret" "azure_openai_api_version" {
  name         = "azure-openai-api-version"
  value        = var.azure_openai_api_version
  key_vault_id = azurerm_key_vault.sast.id
  depends_on   = [azurerm_role_assignment.kv_admin]
}

resource "azurerm_key_vault_secret" "anthropic_api_key" {
  count        = var.anthropic_api_key != "" ? 1 : 0
  name         = "anthropic-api-key"
  value        = var.anthropic_api_key
  key_vault_id = azurerm_key_vault.sast.id
  depends_on   = [azurerm_role_assignment.kv_admin]
}

# ─── App settings fragment injecté dans webapp.tf ─────────────────────────────

locals {
  ai_app_settings = merge(
    {
      AZURE_OPENAI_ENDPOINT    = "@Microsoft.KeyVault(VaultName=${azurerm_key_vault.sast.name};SecretName=azure-openai-endpoint)"
      AZURE_OPENAI_API_KEY     = "@Microsoft.KeyVault(VaultName=${azurerm_key_vault.sast.name};SecretName=azure-openai-api-key)"
      AZURE_OPENAI_DEPLOYMENT  = "@Microsoft.KeyVault(VaultName=${azurerm_key_vault.sast.name};SecretName=azure-openai-deployment)"
      AZURE_OPENAI_API_VERSION = "@Microsoft.KeyVault(VaultName=${azurerm_key_vault.sast.name};SecretName=azure-openai-api-version)"
    },
    var.anthropic_api_key != "" ? {
      ANTHROPIC_API_KEY = "@Microsoft.KeyVault(VaultName=${azurerm_key_vault.sast.name};SecretName=anthropic-api-key)"
    } : {}
  )
}
