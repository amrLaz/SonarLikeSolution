ALTER TABLE projects ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS analysis_profile_id VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS analysis_profile_version VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects (organization_id);

ALTER TABLE platform_users ADD COLUMN IF NOT EXISTS entra_tenant_id VARCHAR(64);
ALTER TABLE platform_users ADD COLUMN IF NOT EXISTS entra_object_id VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_user_entra
    ON platform_users (entra_tenant_id, entra_object_id)
    WHERE entra_tenant_id IS NOT NULL AND entra_object_id IS NOT NULL;

ALTER TABLE platform_api_tokens ADD COLUMN IF NOT EXISTS scopes TEXT NOT NULL DEFAULT '[]';

ALTER TABLE analysis_records ADD COLUMN IF NOT EXISTS measurements TEXT NOT NULL DEFAULT '{}';
ALTER TABLE analysis_records ADD COLUMN IF NOT EXISTS tool_executions TEXT NOT NULL DEFAULT '[]';
ALTER TABLE analysis_records ADD COLUMN IF NOT EXISTS completeness VARCHAR(50) NOT NULL DEFAULT 'legacy_unverified';
ALTER TABLE analysis_records ADD COLUMN IF NOT EXISTS profile_id VARCHAR(100) NOT NULL DEFAULT 'legacy';
ALTER TABLE analysis_records ADD COLUMN IF NOT EXISTS profile_version VARCHAR(50) NOT NULL DEFAULT '0';
ALTER TABLE analysis_records ADD COLUMN IF NOT EXISTS formula_version VARCHAR(50) NOT NULL DEFAULT '0';
ALTER TABLE analysis_records ADD COLUMN IF NOT EXISTS gate_snapshot TEXT NOT NULL DEFAULT '{}';
ALTER TABLE analysis_records ALTER COLUMN maintainability_score DROP NOT NULL;
ALTER TABLE analysis_records ALTER COLUMN security_score DROP NOT NULL;
ALTER TABLE analysis_records ALTER COLUMN reliability_score DROP NOT NULL;
ALTER TABLE analysis_records ALTER COLUMN code_smells DROP NOT NULL;
ALTER TABLE analysis_records ALTER COLUMN vulnerabilities DROP NOT NULL;
ALTER TABLE analysis_records ALTER COLUMN security_hotspots DROP NOT NULL;
ALTER TABLE analysis_records ALTER COLUMN bugs DROP NOT NULL;
ALTER TABLE analysis_records ALTER COLUMN coverage DROP NOT NULL;
ALTER TABLE analysis_records ALTER COLUMN duplication DROP NOT NULL;
ALTER TABLE analysis_records ALTER COLUMN dependency_vulnerabilities DROP NOT NULL;
