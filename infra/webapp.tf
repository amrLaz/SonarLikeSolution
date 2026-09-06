# ─── App Service Plan ─────────────────────────────────────────────────────────

resource "azurerm_service_plan" "sast" {
  name                = "${local.prefix}-asp"
  resource_group_name = azurerm_resource_group.sast.name
  location            = azurerm_resource_group.sast.location
  os_type             = "Linux"
  sku_name            = var.webapp_sku
  tags                = local.common_tags
}

# ─── Linux Web App (Docker container) ────────────────────────────────────────
# Sert ASP.NET Core 10 et React dans une image construite par Azure DevOps.

resource "azurerm_linux_web_app" "sast" {
  name                = "${local.prefix}-app"
  resource_group_name = azurerm_resource_group.sast.name
  location            = azurerm_resource_group.sast.location
  service_plan_id     = azurerm_service_plan.sast.id
  https_only          = true

  identity {
    type = "SystemAssigned"
  }

  site_config {
    container_registry_use_managed_identity = true
    health_check_path                       = "/api/v1/health"
    health_check_eviction_time_in_min       = 2

    application_stack {
      docker_image_name   = "sast-platform:latest"
      docker_registry_url = "https://${data.azurerm_container_registry.main.login_server}"
    }
  }

  app_settings = {
    ConnectionStrings__CodeInsights    = format("Host=%s;Database=\"%s\";Username=\"%s\";Password=\"%s\";SSL Mode=Require", azurerm_postgresql_flexible_server.sast.fqdn, replace(var.postgres_db_name, "\"", "\"\""), replace(var.postgres_admin_login, "\"", "\"\""), replace(var.postgres_admin_password, "\"", "\"\""))
    Bootstrap__AdminEmail              = var.platform_admin_email
    Bootstrap__AdminPassword           = "@Microsoft.KeyVault(VaultName=${azurerm_key_vault.sast.name};SecretName=bootstrap-admin-password)"
    Bootstrap__RequireCompleteMappings = tostring(var.p0_require_complete_mappings)
    Authentication__SigningKey         = "@Microsoft.KeyVault(VaultName=${azurerm_key_vault.sast.name};SecretName=authentication-signing-key)"
    WEBSITES_PORT                      = "8000"
    Ingestion__BlobServiceUri          = azurerm_storage_account.reports.primary_blob_endpoint
    Ingestion__Container               = azurerm_storage_container.reports.name
    Ingestion__PlatformUrl             = "https://${local.prefix}-app.azurewebsites.net"
  }

  tags       = local.common_tags
  depends_on = [azurerm_postgresql_flexible_server_database.app, azurerm_key_vault_secret.authentication_signing_key, azurerm_key_vault_secret.bootstrap_admin_password]

  # Azure DevOps sélectionne le tag d'image à déployer.
  lifecycle {
    ignore_changes = [site_config[0].application_stack]
  }
}

# ─── AcrPull permission pour l'identité managée du Web App ────────────────────

resource "azurerm_role_assignment" "app_acr_pull" {
  scope                = data.azurerm_container_registry.main.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_linux_web_app.sast.identity[0].principal_id
}
