resource "azurerm_storage_account" "reports" {
  name                            = "ci${substr(sha256(azurerm_resource_group.sast.id), 0, 18)}"
  resource_group_name             = azurerm_resource_group.sast.name
  location                        = azurerm_resource_group.sast.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  shared_access_key_enabled       = false
  tags                            = local.common_tags

  blob_properties {
    delete_retention_policy {
      days = 7
    }
  }
}

resource "azurerm_storage_container" "reports" {
  name                  = "reports"
  storage_account_id    = azurerm_storage_account.reports.id
  container_access_type = "private"
}

resource "azurerm_role_assignment" "app_reports" {
  scope                = azurerm_storage_account.reports.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_linux_web_app.sast.identity[0].principal_id
}
