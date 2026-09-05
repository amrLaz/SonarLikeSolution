// ─────────────────────────────────────────────────────────────────────────────
// SAST Platform – Azure infrastructure
//
// Resources deployed:
//   • Azure Container Registry (Basic)
//   • App Service Plan (B1, Linux)
//   • Web App (container) – FastAPI + React SPA
//   • PostgreSQL Flexible Server 16 (Burstable B1ms, 32 GB)
//   • PostgreSQL database "sast_platform"
//
// Estimated cost: ~35 €/month (West Europe)
// Bump appServicePlanSku to "B2" if > 5 pipelines run simultaneously.
// ─────────────────────────────────────────────────────────────────────────────

@description('Short name used to derive all resource names (lowercase, no spaces).')
param projectName string = 'sast'

@description('Azure region. Default: resource group location.')
param location string = resourceGroup().location

@description('Environment label appended to resource names.')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'prod'

@description('Name for the Container Registry (globally unique, alphanumeric).')
param acrName string

@description('PostgreSQL administrator login name.')
param postgresAdminLogin string = 'sast_admin'

@description('PostgreSQL administrator password (stored as secure param, never logged).')
@secure()
param postgresAdminPassword string

@description('PostgreSQL database name.')
param postgresDbName string = 'sast_platform'

@description('App Service Plan SKU. B1 suits ≤5 concurrent pipelines; B2 for more.')
@allowed(['B1', 'B2', 'B3'])
param appServicePlanSku string = 'B1'

// ─── Derived names ────────────────────────────────────────────────────────────

var planName   = '${projectName}-plan-${environment}'
var webAppName = '${projectName}-app-${environment}'
var pgServer   = '${projectName}-pg-${environment}'
var imageRef   = '${acrName}.azurecr.io/${projectName}-platform:latest'

// ─── Container Registry ───────────────────────────────────────────────────────

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false  // we use managed identity, not admin credentials
  }
}

// ─── App Service Plan (Linux) ─────────────────────────────────────────────────

resource plan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: planName
  location: location
  kind: 'linux'
  sku: {
    name: appServicePlanSku
    tier: 'Basic'
  }
  properties: {
    reserved: true  // required for Linux
  }
}

// ─── Web App (container) ──────────────────────────────────────────────────────

resource webApp 'Microsoft.Web/sites@2023-01-01' = {
  name: webAppName
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    siteConfig: {
      linuxFxVersion: 'DOCKER|${imageRef}'
      alwaysOn: false  // B1 supports always-on; set true in prod if needed
      appSettings: [
        // Tell App Service which port uvicorn listens on
        { name: 'WEBSITES_PORT', value: '8000' }
        // PostgreSQL connection
        { name: 'POSTGRES_HOST', value: postgres.properties.fullyQualifiedDomainName }
        { name: 'POSTGRES_PORT', value: '5432' }
        { name: 'POSTGRES_USER', value: postgresAdminLogin }
        { name: 'POSTGRES_PASSWORD', value: postgresAdminPassword }
        { name: 'POSTGRES_DB', value: postgresDbName }
        // Docker registry (ACR via managed identity – no password needed)
        { name: 'DOCKER_REGISTRY_SERVER_URL', value: 'https://${acrName}.azurecr.io' }
        { name: 'DOCKER_ENABLE_CI', value: 'true' }
        // Uvicorn workers (B1 = 1 vCPU → 2 workers is the sweet spot)
        { name: 'UVICORN_WORKERS', value: '2' }
      ]
    }
    httpsOnly: true
  }
}

// Grant the Web App managed identity the AcrPull role on the registry
resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, webApp.id, '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '7f951dda-4ed3-4680-a7ca-43fe172d538d'  // AcrPull
    )
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ─── PostgreSQL Flexible Server ───────────────────────────────────────────────

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: pgServer
  location: location
  sku: {
    name: 'Standard_B1ms'  // 1 vCPU, 2 GB – burstable, cheapest option
    tier: 'Burstable'
  }
  properties: {
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    version: '16'
    storage: { storageSizeGB: 32 }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: { mode: 'Disabled' }
    // Public access with firewall rules below (simplest setup)
    // Switch to 'PrivateAccess' + VNet injection for production hardening
    network: { publicNetworkAccess: 'Enabled' }
  }
}

resource db 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: postgres
  name: postgresDbName
  properties: {
    charset: 'utf8'
    collation: 'en_US.utf8'
  }
}

// Allow Azure services (including App Service) to reach PostgreSQL
resource pgFirewallAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// ─── Outputs ─────────────────────────────────────────────────────────────────
// After deployment, update PLATFORM_API_URL in your Variable Group to webAppUrl.

output webAppUrl string       = 'https://${webApp.properties.defaultHostName}'
output acrLoginServer string  = acr.properties.loginServer
output postgresFqdn string    = postgres.properties.fullyQualifiedDomainName
output webAppName string      = webApp.name
