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
# Sert à la fois le backend FastAPI et le frontend React (build multi-stage).
# L'image est gérée par GitHub Actions après le premier apply.

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

    application_stack {
      docker_image_name   = "sast-platform:latest"
      docker_registry_url = "https://${data.azurerm_container_registry.main.login_server}"
    }
  }

  app_settings = merge(
    {
      POSTGRES_HOST                = azurerm_postgresql_flexible_server.sast.fqdn
      POSTGRES_PORT                = "5432"
      POSTGRES_USER                = var.postgres_admin_login
      POSTGRES_PASSWORD            = var.postgres_admin_password
      POSTGRES_DB                  = var.postgres_db_name
      PLATFORM_ADMIN_EMAIL         = var.platform_admin_email
      PLATFORM_ADMIN_PASSWORD      = var.platform_admin_password
      P0_REQUIRE_COMPLETE_MAPPINGS = tostring(var.p0_require_complete_mappings)
      UVICORN_WORKERS              = "2"
      WEBSITES_PORT                = "8000"
    },
    local.ai_app_settings
  )

  tags       = local.common_tags
  depends_on = [azurerm_postgresql_flexible_server.sast]

  # L'image est mise à jour par GitHub Actions — Terraform ne l'écrase pas.
  lifecycle {
    ignore_changes = [site_config[0].application_stack]
  }
}

# ─── AcrPull permission pour l'identité managée du Web App ────────────────────

data "azurerm_role_definition" "acr_pull" {
  name = "AcrPull"
}

resource "azurerm_role_assignment" "app_acr_pull" {
  scope              = data.azurerm_container_registry.main.id
  role_definition_id = data.azurerm_role_definition.acr_pull.id
  principal_id       = azurerm_linux_web_app.sast.identity[0].principal_id
}
