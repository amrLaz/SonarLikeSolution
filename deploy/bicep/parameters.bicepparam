// ─────────────────────────────────────────────────────────────────────────────
// Parameter file for SAST Platform – adjust before first deployment.
//
// Deploy with:
//   az deployment group create \
//     --resource-group rg-sast-prod \
//     --template-file deploy/bicep/main.bicep \
//     --parameters deploy/bicep/parameters.bicepparam \
//     --parameters postgresAdminPassword='<secret>'
//
// Never commit postgresAdminPassword here – pass it at deploy time or store it
// in an Azure DevOps secret variable.
// ─────────────────────────────────────────────────────────────────────────────

using './main.bicep'

param projectName           = 'sast'
param environment           = 'prod'
param location              = 'westeurope'

// Must be globally unique and alphanumeric only (3-50 chars)
param acrName               = 'upcoopsastacr'

param postgresAdminLogin    = 'sast_admin'
// postgresAdminPassword → provided at deploy time, never stored here
param postgresDbName        = 'sast_platform'

param appServicePlanSku     = 'B1'
