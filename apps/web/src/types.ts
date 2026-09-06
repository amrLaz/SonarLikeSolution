import type { FindingCategory } from './metric-display';

export type ScopeMode = 'overall' | 'new-code';
export type AppTab = 'projects' | 'issues' | 'rules' | 'quality-gates' | 'administration';
export type AdminPrimaryTab = 'configuration' | 'security' | 'projects';
export type AdminSection =
  | 'general-settings'
  | 'analysis-scope'
  | 'data-retention'
  | 'devops-integrations'
  | 'notifications'
  | 'access-management'
  | 'pat-management'
  | 'audit-log'
  | 'project-links'
  | 'project-management';
export type IssueSeverityFilter = 'all' | 'blocker' | 'high' | 'medium' | 'low' | 'info';
export type IssueTypeFilter = 'all' | FindingCategory;

export type QualityGate = {
  gate_id: string;
  name: string;
  min_maintainability_score: number;
  min_security_score: number;
  min_reliability_score?: number;
  max_bugs?: number;
  max_vulnerabilities: number;
  max_security_hotspots: number;
  max_code_smells: number;
};

export type AnalysisMetrics = {
  maintainability_score?: number | null;
  security_score?: number | null;
  reliability_score?: number | null;
  code_smells?: number | null;
  vulnerabilities?: number | null;
  security_hotspots?: number | null;
  bugs?: number | null;
  coverage?: number | null;
  duplication?: number | null;
  dependency_vulnerabilities?: number | null;
  affected_files?: Record<string, FindingIssue[] | { severity?: string; issues?: number }>;
};

export type FindingIssue = {
  line: number;
  end_line?: number;
  rule?: string;
  rule_id?: string;
  message: string;
  severity: string;
  category?: FindingCategory;
  tool?: string;
};

export type MeasurementState = 'measured' | 'absent' | 'failed' | 'not_measured';
export type TechnicalState = 'success' | 'failed' | 'incomplete';

export type Measurement = {
  state: MeasurementState;
  value: number | null;
  tool?: string | null;
  tool_version?: string | null;
};

export type ToolExecution = {
  tool: string;
  version?: string | null;
  status: 'success' | 'failed' | 'absent' | 'not_measured';
  error_code?: string | null;
};

export type GateConditionSnapshot = {
  scope?: 'global' | 'new_code';
  provenance?: string | null;
  metric: string;
  operator: string;
  threshold: number;
  value: number | null;
  state: MeasurementState | 'not_applicable';
  tool?: string | null;
  tool_version?: string | null;
  result: 'pass' | 'fail' | 'unknown' | 'not_applicable';
  baseline_id?: string | null;
  base_sha?: string | null;
  head_sha?: string | null;
  numerator?: number | null;
  denominator?: number | null;
  reason?: string | null;
};

export type GateSnapshot = {
  metrics?: Record<string, number | null>;
  gate_id: string;
  gate_name: string;
  profile_id: string;
  profile_version: string;
  formula_version: string;
  technical_state?: TechnicalState;
  conditions: GateConditionSnapshot[];
  security_review?: SecurityReviewSnapshot;
  configuration?: { state: string; expected_hash: string; effective_hash: string; reason?: string | null };
  remediation?: {
    state: string;
    estimated_seconds: number | null;
    modeled_findings: number;
    unmodeled_findings: number;
    model: string;
    profile_id: string;
    profile_version: string;
    documentation_sources: string[];
    scope: string;
  };
};

export type SecurityReviewSnapshot = {
  scope: 'global' | 'new_code';
  state: string;
  result: 'pass' | 'fail' | 'unknown' | 'not_applicable';
  value: number | null;
  numerator: number;
  denominator: number;
  threshold: number | null;
  reason: string | null;
  captured_at: string;
  applied_exception_decision_ids: string[];
  reviewed_decision_ids: string[];
  decisions?: { finding_id: string; decision_id: string; version: number; state: string; hotspot_review: string; reason: string | null; expires_at: string | null; branch: string }[];
};

export type AnalysisRecord = {
  analysis_id: string;
  project_key: string;
  commit_sha: string;
  branch: string;
  ci_provider: 'azure-devops' | 'github-actions' | 'local';
  status: 'queued' | 'running' | 'completed' | 'failed';
  quality_gate: 'pass' | 'fail' | 'unknown';
  metrics: AnalysisMetrics;
  gate_failures: string[];
  created_at: string;
  profile_id?: string | null;
  profile_version?: string | null;
  formula_version?: string | null;
  tool_executions?: ToolExecution[];
  measurements?: Record<string, Measurement>;
  completeness?: 'complete' | 'incomplete';
  technical_state?: TechnicalState;
  gate_snapshot?: GateSnapshot | null;
};

export type ProjectMeta = {
  repoProvider: 'github' | 'azure-devops' | 'other';
  repoUrl: string;
  pipelineProvider: 'azure-devops' | 'github-actions' | 'other';
  pipelineUrl: string;
  updatedAt?: string;
};

export type ProjectIntegrationRecord = {
  project_key: string;
  repo_provider: 'github' | 'azure-devops' | 'other';
  repo_url: string;
  pipeline_provider: 'azure-devops' | 'github-actions' | 'other';
  pipeline_url: string;
  updated_at: string;
};

export type AuthProvider = {
  provider_id: 'saml' | 'github' | 'azure-devops' | 'gitlab' | 'azure-ad';
  display_name: string;
  category: string;
  connection_url: string;
  enabled: boolean;
  status: 'ready' | 'validated' | 'disabled';
  last_tested_at: string;
  config?: {
    tenant_id?: string;
    client_id?: string;
    client_secret_configured?: boolean;
    redirect_uri?: string;
    scopes?: string;
  };
};

export type LocalUserRole = 'admin' | 'regular' | 'default';
export type LocalUserType = 'internal' | 'contractor' | 'service-account' | 'auditor';

export type LocalUser = {
  user_id: string;
  full_name: string;
  email: string;
  password: string;
  user_type: LocalUserType;
  access_role: LocalUserRole;
  group_ids: string[];
  status: 'active' | 'disabled';
};

export type PlatformUser = {
  user_id: string;
  email: string;
  full_name: string;
  role: LocalUserRole;
  auth_provider: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  grants: Array<{ scope_type: 'organization' | 'project'; scope_id: string }>;
};

export type OrganizationCatalogItem = {
  id: string;
  key: string;
  name: string;
};

export type ProjectCatalogItem = {
  id: string;
  key: string;
  name: string;
  organization_id?: string | null;
  analysis_profile_id?: string | null;
  analysis_profile_version?: string | null;
  permissions: { read: boolean; manage: boolean };
};

export type SessionUser = {
  full_name: string;
  email: string;
  access_role: LocalUserRole;
  token?: string; // HMAC-signed session token returned by the backend
  permissions?: {
    is_admin: boolean;
    project_keys: string[];
  };
};

export type ProjectSummary = {
  projectKey: string;
  latest: AnalysisRecord;
  history: AnalysisRecord[];
  passCount: number;
  failCount: number;
  unknownCount: number;
  totalCount?: number;
  issueCounts: Partial<Record<IssueSeverityFilter, number>>;
  branches?: { name: string; count: number; latest: AnalysisRecord }[];
};

export type DashboardSummary = {
  next_cursor?: string | null;
  projects: {
    project_key: string;
    total_count: number;
    pass_count: number;
    fail_count: number;
    unknown_count: number;
    latest: AnalysisRecord;
    branches_truncated?: boolean;
    issue_counts: Partial<Record<IssueSeverityFilter, number>>;
    branches: { name: string; count: number; latest: AnalysisRecord }[];
  }[];
};

export type RuleCard = {
  key?: string;
  rule_id: string;
  title: string;
  category: string;
  severity: string;
  language: string;
  occurrences: number;
  file_count: number;
  project_count: number;
  projects: string[];
  status: 'active' | 'suppressed';
};

export type GateLibraryItem = QualityGate & {
  project_count?: number;
  is_default?: boolean;
  projectCount: number;
  builtIn?: boolean;
};

export type PlatformTokenHistoryItem = {
  token_id: string;
  token_name: string;
  token_preview: string;
  created_at: string;
  expires_at: string;
  is_current: boolean;
  revoked: boolean;
  scopes: string[];
  project_keys: string[];
};

export type NotificationChannel = {
  id: string;
  name: string;
  channel_type: 'webhook' | 'email';
  config: Record<string, string | boolean>;
  enabled: boolean;
  on_fail: boolean;
  on_pass: boolean;
  created_at: string;
  updated_at: string;
};

export type AuditLogEntry = {
  id: string;
  actor_email: string;
  actor_role: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  resource_label: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

export type PlatformSettings = {
  instance_name: string;
  report_max_size_mb: string;
  global_source_exclusions: string;
  source_file_exclusions: string;
  retention_keep_days: string;
  retention_keep_failed_days: string;
  retention_max_per_branch: string;
  retention_auto_cleanup: string;
  retention_protected_branches: string;
  audit_log_retention_days: string;
};

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  instance_name: 'CodeInsights',
  report_max_size_mb: '450',
  global_source_exclusions: '**/__tests__/**,**/*.snap',
  source_file_exclusions: '**/*.generated.*,**/coverage/**',
  retention_keep_days: '90',
  retention_keep_failed_days: '30',
  retention_max_per_branch: '50',
  retention_auto_cleanup: 'true',
  retention_protected_branches: 'master,main,develop',
  audit_log_retention_days: '365',
};

export type DevOpsProviderTab = 'github' | 'bitbucket' | 'azure-devops' | 'gitlab';

export type AzureDevOpsOrganizationConfig = {
  config_id: string;
  config_name: string;
  organization_url: string;
  pat_configured: boolean;
  status: 'ready' | 'validated' | 'error';
  last_tested_at: string;
  last_error: string;
  quality_gate_enabled: boolean;
  repo_import_enabled: boolean;
  created_at: string;
  updated_at: string;
};
