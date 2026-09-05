# ─── PostgreSQL Flexible Server 16 ───────────────────────────────────────────
# Burstable B1ms: 1 vCPU, 2 GB RAM, 32 GB storage.
# Suitable for a SAST platform with ≤ 20 concurrent analyses.
# Upgrade to D2ds_v4 (General Purpose) if response times degrade under load.

resource "azurerm_postgresql_flexible_server" "sast" {
  name                   = "${local.prefix}-pg"
  resource_group_name    = azurerm_resource_group.sast.name
  location               = azurerm_resource_group.sast.location
  version                = "16"
  administrator_login    = var.postgres_admin_login
  administrator_password = var.postgres_admin_password
  sku_name               = "B_Standard_B1ms"

  storage_mb                   = var.postgres_storage_gb * 1024
  auto_grow_enabled            = true
  backup_retention_days        = 7
  geo_redundant_backup_enabled = false

  tags = local.common_tags

  lifecycle {
    ignore_changes = [
      # Password rotations are done outside Terraform to avoid plan drift
      administrator_password,
      zone,
    ]
  }
}

resource "azurerm_postgresql_flexible_server_database" "app" {
  name      = var.postgres_db_name
  server_id = azurerm_postgresql_flexible_server.sast.id
  charset   = "utf8"
  collation = "en_US.utf8"
}

# Allow all Azure-originated IPs (App Service outbound IPs are dynamic).
# Switch to private networking (VNet integration) for enhanced security.
resource "azurerm_postgresql_flexible_server_firewall_rule" "azure_services" {
  name      = "AllowAzureServices"
  server_id = azurerm_postgresql_flexible_server.sast.id

  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "developer" {
  count     = var.developer_ip != "" ? 1 : 0
  name      = "DeveloperAccess"
  server_id = azurerm_postgresql_flexible_server.sast.id

  start_ip_address = var.developer_ip
  end_ip_address   = var.developer_ip
}
