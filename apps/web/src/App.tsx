import { useEffect, useMemo, useRef, useState } from "react";
import {
  analysisGateClass,
  analysisGateLabel,
  completenessLabel,
  findingCategory,
  findingCategoryLabel,
  formatMetric,
  gateLabel,
  measurementStateLabel,
  scopedMetrics,
  metricPoint
} from "./metric-display";
import type { FindingCategory } from "./metric-display";
import VulnerabilitiesTab from "./components/Vulnerabilities";
import ProjectHeader from "./components/ProjectHeader";
import { ProjectManager } from "./components/ProjectManager";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? "http://127.0.0.1:8000/api" : "/api");
const LOCAL_STORAGE_GATE_LIBRARY_KEY = "sast-quality-gates-v1";
const LOCAL_STORAGE_SESSION_KEY = "sast-platform-session-v1";
const LOCAL_STORAGE_NAV_KEY = "sast-nav-v1";
const DEFAULT_TOKEN_TTL_DAYS = 90;
const CI_TOKEN_SCOPES = ["analysis:read", "analysis:write", "integration:write"] as const;

type ApiConnectionState = "connected" | "disconnected" | "checking";
type ScopeMode = "overall" | "new-code";
type AppTab = "projects" | "issues" | "vulnerabilities" | "rules" | "quality-gates" | "evolution" | "administration";
type AdminPrimaryTab = "configuration" | "security" | "projects";
type AdminSection =
  | "general-settings"
  | "analysis-scope"
  | "data-retention"
  | "devops-integrations"
  | "notifications"
  | "access-management"
  | "pat-management"
  | "audit-log"
  | "project-links"
  | "project-management";
type IssueSeverityFilter = "all" | "blocker" | "high" | "medium" | "low" | "info";
type IssueTypeFilter = "all" | FindingCategory;

type QualityGate = {
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

type AnalysisMetrics = {
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

type FindingIssue = {
  line: number;
  end_line?: number;
  rule?: string;
  rule_id?: string;
  message: string;
  severity: string;
  category?: FindingCategory;
  tool?: string;
};

type MeasurementState = "measured" | "absent" | "failed" | "not_measured";
type TechnicalState = "success" | "failed" | "incomplete" | "legacy_unverified";

type Measurement = {
  state: MeasurementState;
  value: number | null;
  tool?: string | null;
  tool_version?: string | null;
};

type ToolExecution = {
  tool: string;
  version?: string | null;
  status: "success" | "failed" | "absent" | "not_measured";
  error_code?: string | null;
};

type GateConditionSnapshot = {
  metric: string;
  operator: string;
  threshold: number;
  value: number | null;
  state: MeasurementState;
  tool?: string | null;
  tool_version?: string | null;
  result: "pass" | "fail" | "unknown";
};

type GateSnapshot = {
  gate_id: string;
  gate_name: string;
  profile_id: string;
  profile_version: string;
  formula_version: string;
  technical_state?: TechnicalState;
  conditions: GateConditionSnapshot[];
};

export type AnalysisRecord = {
  analysis_id: string;
  project_key: string;
  commit_sha: string;
  branch: string;
  ci_provider: "azure-devops" | "github-actions" | "local";
  status: "queued" | "running" | "completed" | "failed";
  quality_gate: "pass" | "fail" | "unknown";
  metrics: AnalysisMetrics;
  gate_failures: string[];
  created_at: string;
  profile_id?: string | null;
  profile_version?: string | null;
  formula_version?: string | null;
  tool_executions?: ToolExecution[];
  measurements?: Record<string, Measurement>;
  completeness?: "complete" | "incomplete" | "legacy_unverified";
  technical_state?: TechnicalState;
  gate_snapshot?: GateSnapshot | null;
};

type ProjectMeta = {
  repoProvider: "github" | "azure-devops" | "other";
  repoUrl: string;
  pipelineProvider: "azure-devops" | "github-actions" | "other";
  pipelineUrl: string;
  updatedAt?: string;
};

type ProjectIntegrationRecord = {
  project_key: string;
  repo_provider: "github" | "azure-devops" | "other";
  repo_url: string;
  pipeline_provider: "azure-devops" | "github-actions" | "other";
  pipeline_url: string;
  updated_at: string;
};

type AuthProvider = {
  provider_id: "saml" | "github" | "azure-devops" | "gitlab" | "azure-ad";
  display_name: string;
  category: string;
  connection_url: string;
  enabled: boolean;
  status: "ready" | "validated" | "disabled";
  last_tested_at: string;
  config?: {
    tenant_id?: string;
    client_id?: string;
    client_secret_configured?: boolean;
    redirect_uri?: string;
    scopes?: string;
  };
};

type LocalUserRole = "admin" | "regular" | "default";
type LocalUserType = "internal" | "contractor" | "service-account" | "auditor";

type LocalUser = {
  user_id: string;
  full_name: string;
  email: string;
  password: string;
  user_type: LocalUserType;
  access_role: LocalUserRole;
  group_ids: string[];
  status: "active" | "disabled";
};

type PlatformUser = {
  user_id: string;
  email: string;
  full_name: string;
  role: LocalUserRole;
  auth_provider: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  grants: Array<{ scope_type: "organization" | "project"; scope_id: string }>;
};

type OrganizationCatalogItem = {
  id: string;
  key: string;
  name: string;
};

type ProjectCatalogItem = {
  id: string;
  key: string;
  name: string;
  organization_id?: string | null;
  analysis_profile_id?: string | null;
  analysis_profile_version?: string | null;
  permissions: { read: boolean; manage: boolean };
};

type SessionUser = {
  full_name: string;
  email: string;
  access_role: LocalUserRole;
  token?: string;  // HMAC-signed session token returned by the backend
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
  unverifiedCount: number;
};

type RuleCard = {
  rule_id: string;
  title: string;
  category: string;
  severity: string;
  language: string;
  occurrences: number;
  file_count: number;
  project_count: number;
  projects: string[];
  status: "active" | "suppressed";
};

type GateLibraryItem = QualityGate & {
  project_count?: number;
  is_default?: boolean;
  projectCount: number;
  builtIn?: boolean;
};

type PlatformTokenHistoryItem = {
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

type NotificationChannel = {
  id: string;
  name: string;
  channel_type: "webhook" | "email";
  config: Record<string, string | boolean>;
  enabled: boolean;
  on_fail: boolean;
  on_pass: boolean;
  created_at: string;
  updated_at: string;
};

type AuditLogEntry = {
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

type PlatformSettings = {
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

const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  instance_name: "CodeInsights",
  report_max_size_mb: "450",
  global_source_exclusions: "**/__tests__/**,**/*.snap",
  source_file_exclusions: "**/*.generated.*,**/coverage/**",
  retention_keep_days: "90",
  retention_keep_failed_days: "30",
  retention_max_per_branch: "50",
  retention_auto_cleanup: "true",
  retention_protected_branches: "master,main,develop",
  audit_log_retention_days: "365",
};

type DevOpsProviderTab = "github" | "bitbucket" | "azure-devops" | "gitlab";

type AzureDevOpsOrganizationConfig = {
  config_id: string;
  config_name: string;
  organization_url: string;
  pat_configured: boolean;
  status: "ready" | "validated" | "error";
  last_tested_at: string;
  last_error: string;
  quality_gate_enabled: boolean;
  repo_import_enabled: boolean;
  created_at: string;
  updated_at: string;
};

const TABS: Array<{ id: AppTab; label: string }> = [
  { id: "projects", label: "Projects" },
  { id: "issues", label: "Issues" },
  { id: "vulnerabilities", label: "Vulnerabilities & IOCs" },
  { id: "rules", label: "Rules" },
  { id: "quality-gates", label: "Quality Gates" },
  { id: "evolution", label: "Evolution" },
  { id: "administration", label: "Administration" }
];

const ADMIN_PRIMARY_TABS: Array<{ id: AdminPrimaryTab; label: string }> = [
  { id: "configuration", label: "Configuration" },
  { id: "security", label: "Security" },
  { id: "projects", label: "Projects" }
];

const ADMIN_NAV_BY_TAB: Record<AdminPrimaryTab, Array<{ id: AdminSection; label: string }>> = {
  configuration: [
    { id: "general-settings", label: "General" },
    { id: "analysis-scope", label: "Analysis Scope" },
    { id: "data-retention", label: "Data Retention" },
    { id: "devops-integrations", label: "DevOps Platform Integrations" },
    { id: "notifications", label: "Notifications" }
  ],
  security: [
    { id: "access-management", label: "Authentication" },
    { id: "pat-management", label: "PAT Management" },
    { id: "audit-log", label: "Audit Log" }
  ],
  projects: [
    { id: "project-management", label: "Projects & Branches" },
    { id: "project-links", label: "Project Links" }
  ]
};


const METRIC_FIELDS = [
  ["security_score", "Security", "/100"],
  ["maintainability_score", "Maintainability", "/100"],
  ["reliability_score", "Reliability", "/100"],
  ["coverage", "Coverage", "%"],
  ["duplication", "Duplications", "%"],
  ["vulnerabilities", "Vulnerabilities", ""],
  ["security_hotspots", "Hotspots", ""],
  ["code_smells", "Code Smells", ""],
  ["bugs", "Bugs", ""],
  ["dependency_vulnerabilities", "SCA Dep. Vulns", ""]
] as const;

function MetricGrid({ metrics }: { metrics: AnalysisMetrics }) {
  return <dl className="metric-grid">{METRIC_FIELDS.map(([key, label, unit]) => (
    <div className={`metric-card${typeof metrics[key] === "number" && Number.isFinite(metrics[key]) ? "" : " is-unavailable"}`} key={key}><dt>{label}</dt><dd>{formatMetric(metrics[key], unit)}</dd></div>
  ))}</dl>;
}

function AnalysisEvidence({ analysis }: { analysis: AnalysisRecord }) {
  const measurements = Object.entries(analysis.measurements ?? {});
  const conditions = analysis.gate_snapshot?.conditions ?? [];
  const completeness = analysis.completeness ?? "legacy_unverified";
  const technicalState = analysis.technical_state ?? analysis.gate_snapshot?.technical_state ?? "legacy_unverified";
  const technicalStateLabel: Record<TechnicalState, string> = {
    success: "Réussi",
    failed: "Échec",
    incomplete: "Incomplet",
    legacy_unverified: "Historique non vérifié"
  };

  return (
    <section className="analysis-evidence" aria-label="Mesures et verdict reproductible">
      <div className="analysis-evidence-heading">
        <h4>Preuves de calcul</h4>
        <span className={`status-pill completeness-${completeness}`}>Complétude : {completenessLabel(completeness)}</span>
        <span className={`status-pill technical-${technicalState}`}>État technique : {technicalStateLabel[technicalState]}</span>
      </div>
      <p className="scope-note">
        Profil <code>{analysis.profile_id ?? "Non disponible"}</code> · version <code>{analysis.profile_version ?? "Non disponible"}</code> · formule{" "}
        <code>{analysis.formula_version ?? "Non disponible"}</code>
      </p>

      {measurements.length > 0 ? (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="État des mesures">
          <table>
            <caption>Mesures reçues pour cette analyse</caption>
            <thead>
              <tr>
                <th>Mesure</th>
                <th>État</th>
                <th>Valeur</th>
                <th>Outil</th>
              </tr>
            </thead>
            <tbody>
              {measurements.map(([dimension, measurement]) => (
                <tr key={dimension}>
                  <th scope="row"><code>{dimension}</code></th>
                  <td><span className={`status-pill measurement-${measurement.state}`}>{measurementStateLabel(measurement.state)}</span></td>
                  <td>{measurement.state === "measured" ? formatMetric(measurement.value) : "Non disponible"}</td>
                  <td>
                    {measurement.tool ? (
                      <><code>{measurement.tool}</code>{measurement.tool_version ? ` ${measurement.tool_version}` : ""}</>
                    ) : "Non disponible"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="feedback">Cette analyse historique ne fournit pas l’état détaillé des mesures.</p>
      )}

      {conditions.length > 0 ? (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Conditions du Quality Gate">
          <table>
            <caption>{analysis.gate_snapshot?.gate_name ?? "Quality Gate"} — instantané appliqué</caption>
            <thead>
              <tr>
                <th>Mesure</th>
                <th>Condition</th>
                <th>Valeur</th>
                <th>Provenance</th>
                <th>Résultat</th>
              </tr>
            </thead>
            <tbody>
              {conditions.map((condition, index) => (
                <tr key={`${condition.metric}:${index}`}>
                  <th scope="row"><code>{condition.metric}</code></th>
                  <td><code>{condition.operator} {condition.threshold}</code></td>
                  <td>{condition.state === "measured" ? formatMetric(condition.value) : measurementStateLabel(condition.state)}</td>
                  <td>
                    {condition.tool ? (
                      <><code>{condition.tool}</code>{condition.tool_version ? ` ${condition.tool_version}` : ""}</>
                    ) : "Non disponible"}
                  </td>
                  <td><span className={`status-pill ${condition.result}`}>{gateLabel(condition.result)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="feedback">Aucun instantané structuré du Quality Gate n’est disponible pour cette analyse.</p>
      )}

      {!!analysis.tool_executions?.length && (
        <p className="scope-note">
          Outils :{" "}
          {analysis.tool_executions
            .map((execution) => `${execution.tool}${execution.version ? ` ${execution.version}` : ""} (${execution.status}${execution.error_code ? `, ${execution.error_code}` : ""})`)
            .join(" · ")}
        </p>
      )}
    </section>
  );
}

const parseGateLibrary = (): GateLibraryItem[] => {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_GATE_LIBRARY_KEY);
    if (!raw) {
      return [];
    }
    return JSON.parse(raw) as GateLibraryItem[];
  } catch {
    return [];
  }
};

const buildFileUrl = (
  repoUrl: string,
  provider: string,
  commitSha: string,
  filePath: string
): string => {
  if (!repoUrl) return "#";
  const base = repoUrl.replace(/\/$/, "");
  if (provider === "github") {
    return `${base}/blob/${commitSha || "HEAD"}/${filePath}`;
  }
  if (provider === "azure-devops") {
    return `${base}?path=/${filePath}&version=GC${commitSha || "main"}`;
  }
  return base;
};

export function App() {
  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(LOCAL_STORAGE_NAV_KEY) ?? "{}");
      return (saved.tab as AppTab) ?? "projects";
    } catch { return "projects"; }
  });
  const [activeAdminTab, setActiveAdminTab] = useState<AdminPrimaryTab>(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(LOCAL_STORAGE_NAV_KEY) ?? "{}");
      return (saved.adminTab as AdminPrimaryTab) ?? "configuration";
    } catch { return "configuration"; }
  });
  const [activeAdminSection, setActiveAdminSection] = useState<AdminSection>(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(LOCAL_STORAGE_NAV_KEY) ?? "{}");
      return (saved.adminSection as AdminSection) ?? "general-settings";
    } catch { return "general-settings"; }
  });
  const [scopeMode, setScopeMode] = useState<ScopeMode>("overall");
  const [projectSearch, setProjectSearch] = useState("");
  const [ruleSearch, setRuleSearch] = useState("");
  const [rules, setRules] = useState<RuleCard[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [issuesError, setIssuesError] = useState<string | null>(null);
  const [ruleFilterCategory, setRuleFilterCategory] = useState<string>("all");
  const [ruleFilterSeverity, setRuleFilterSeverity] = useState<string>("all");
  const [ruleFilterStatus, setRuleFilterStatus] = useState<string>("all");
  const [ruleFilterLanguage, setRuleFilterLanguage] = useState<string>("all");
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [selectedAnalysisId, setSelectedAnalysisId] = useState("");
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [detailAnalyses, setDetailAnalyses] = useState<AnalysisRecord[]>([]);
  const [gate, setGate] = useState<QualityGate | null>(null);
  const [projectMeta, setProjectMeta] = useState<Record<string, ProjectMeta>>({});
  const [authProviders, setAuthProviders] = useState<AuthProvider[]>([]);
  const [entraProvider, setEntraProvider] = useState<AuthProvider | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiConnectionState>("checking");
  const [issueSeverityFilter, setIssueSeverityFilter] = useState<IssueSeverityFilter>("all");
  const [issueTypeFilter, setIssueTypeFilter] = useState<IssueTypeFilter>("all");
  const [issueRuleFilter, setIssueRuleFilter] = useState("");
  const [issueFileFilter, setIssueFileFilter] = useState("");
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [gateLibrary, setGateLibrary] = useState<GateLibraryItem[]>([]);
  const [gateAssignments, setGateAssignments] = useState<Record<string, string>>({});
  const [savingGateAssignment, setSavingGateAssignment] = useState<string | null>(null);
  const [selectedGateId, setSelectedGateId] = useState("default");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingGate, setSavingGate] = useState(false);
  const [savingProjectMeta, setSavingProjectMeta] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "project" | "branch"; project: string; branch?: string } | null>(null);
  const [deletingAnalyses, setDeletingAnalyses] = useState(false);
  const [savingAuthProvider, setSavingAuthProvider] = useState(false);
  const [testingAuthProvider, setTestingAuthProvider] = useState(false);
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(DEFAULT_PLATFORM_SETTINGS);
  const [savingPlatformSettings, setSavingPlatformSettings] = useState(false);
  const [cleanupStatus, setCleanupStatus] = useState<{ last_cleanup_at: string; last_cleanup_deleted: number } | null>(null);
  const [runningCleanup, setRunningCleanup] = useState(false);
  const [platformTokenConfigured, setPlatformTokenConfigured] = useState<boolean | null>(null);
  const [platformTokenExpired, setPlatformTokenExpired] = useState(false);
  const [platformTokenExpiresAt, setPlatformTokenExpiresAt] = useState<string | null>(null);
  const [platformTokenName, setPlatformTokenName] = useState("Azure DevOps CI token");
  const [platformTokenInput, setPlatformTokenInput] = useState("");
  const [platformTokenTtlDays, setPlatformTokenTtlDays] = useState<number>(DEFAULT_TOKEN_TTL_DAYS);
  const [platformTokenProjectKeys, setPlatformTokenProjectKeys] = useState<string[]>([]);
  const [platformTokenHistory, setPlatformTokenHistory] = useState<PlatformTokenHistoryItem[]>([]);
  const [generatingPlatformToken, setGeneratingPlatformToken] = useState(false);
  const [revokingPlatformTokenId, setRevokingPlatformTokenId] = useState<string | null>(null);
  const [generatedPlatformToken, setGeneratedPlatformToken] = useState<string | null>(null);
  const [platformTokenError, setPlatformTokenError] = useState<string | null>(null);
  const [devOpsProviderTab, setDevOpsProviderTab] = useState<DevOpsProviderTab>("azure-devops");
  const [azureDevOpsConfigs, setAzureDevOpsConfigs] = useState<AzureDevOpsOrganizationConfig[]>([]);
  const [devOpsConfigModalOpen, setDevOpsConfigModalOpen] = useState(false);
  const configDialogRef = useRef<HTMLDialogElement>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = devOpsConfigModalOpen ? configDialogRef.current : showDeleteModal ? deleteDialogRef.current : null;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    // ponytail: native modal dialogs keep the background inert without a focus-trap dependency.
    dialog.showModal();
    return () => {
      dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [devOpsConfigModalOpen, showDeleteModal]);
  const [editingAzureDevOpsConfigId, setEditingAzureDevOpsConfigId] = useState<string | null>(null);
  const [savingAzureDevOpsConfig, setSavingAzureDevOpsConfig] = useState(false);
  const [testingAzureDevOpsConfigId, setTestingAzureDevOpsConfigId] = useState<string | null>(null);
  const [deletingAzureDevOpsConfigId, setDeletingAzureDevOpsConfigId] = useState<string | null>(null);

  const [azureDevOpsConfigForm, setAzureDevOpsConfigForm] = useState({
    config_name: "",
    organization_url: "https://dev.azure.com/your-organization",
    personal_access_token: "",
    repo_import_enabled: false,
    quality_gate_enabled: false
  });

  const [notifChannels, setNotifChannels] = useState<NotificationChannel[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifTestingId, setNotifTestingId] = useState<string | null>(null);
  const [notifMessage, setNotifMessage] = useState<string | null>(null);
  const [showNotifForm, setShowNotifForm] = useState(false);
  const [notifForm, setNotifForm] = useState({
    name: "",
    channel_type: "webhook" as "webhook" | "email",
    url: "",
    to_email: "",
    smtp_host: "",
    smtp_port: "587",
    smtp_user: "",
    smtp_password: "",
    smtp_from: "",
    on_fail: true,
    on_pass: false,
  });

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLogTotal, setAuditLogTotal] = useState(0);
  const [auditLogOffset, setAuditLogOffset] = useState(0);
  const [auditLogActionFilter, setAuditLogActionFilter] = useState("");
  const [auditLogActorFilter, setAuditLogActorFilter] = useState("");
  const [auditLogLoading, setAuditLogLoading] = useState(false);

  const [gateForm, setGateForm] = useState({
    name: "Default Gate",
    min_maintainability_score: 80,
    min_security_score: 85,
    min_reliability_score: 50,
    max_vulnerabilities: 0,
    max_security_hotspots: 2,
    max_bugs: 10,
    max_code_smells: 25
  });

  const [adminForm, setAdminForm] = useState({
    project_key: "",
    repoProvider: "github" as "github" | "azure-devops" | "other",
    repoUrl: "",
    pipelineProvider: "azure-devops" as "azure-devops" | "github-actions" | "other",
    pipelineUrl: ""
  });

  const [authForm, setAuthForm] = useState({
    provider_id: "github" as AuthProvider["provider_id"],
    connection_url: "https://github.com",
    tenant_id: "",
    client_id: "",
    client_secret: "",
    redirect_uri: "",
    scopes: "openid profile email",
  });

  const [sessionUser, setSessionUser] = useState<SessionUser | null>(() => {
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as SessionUser;
    } catch {
      return null;
    }
  });

  const [authScreen, setAuthScreen] = useState<"sign-in" | "app" | "sign-out">(() => {
    try {
      return window.localStorage.getItem(LOCAL_STORAGE_SESSION_KEY) ? "app" : "sign-in";
    } catch {
      return "sign-in";
    }
  });

  const [signInForm, setSignInForm] = useState({
    email: "",
    password: "",
    remember_me: true
  });
  const [signInError, setSignInError] = useState<string | null>(null);
  const signInEmailRef = useRef<HTMLInputElement | null>(null);
  const signInPasswordRef = useRef<HTMLInputElement | null>(null);

  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [projectCatalog, setProjectCatalog] = useState<ProjectCatalogItem[]>([]);
  const [organizationCatalog, setOrganizationCatalog] = useState<OrganizationCatalogItem[]>([]);
  const [accessCatalogLoading, setAccessCatalogLoading] = useState(false);
  const [grantForm, setGrantForm] = useState({ user_id: "", organization_ids: [] as string[], project_keys: [] as string[] });
  const [savingGrants, setSavingGrants] = useState(false);

  // Keep localUsers as alias so existing code that hasn't been updated yet still compiles
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const localUsers: LocalUser[] = [];

  const [newLocalUser, setNewLocalUser] = useState({
    full_name: "",
    email: "",
    password: "",
    user_type: "internal" as LocalUserType,
    access_role: "default" as LocalUserRole
  });

  const [passwordForm, setPasswordForm] = useState({
    user_id: "",
    password: ""
  });

  const releaseName = useMemo(() => "Bootstrap 0.3", []);

  const canAccessAdministration = sessionUser?.permissions?.is_admin === true;
  const canSuppressRules = canAccessAdministration;
  const canDeleteData = canAccessAdministration;
  const visibleTabs = useMemo(() => {
    return canAccessAdministration ? TABS : TABS.filter((tab) => tab.id !== "administration");
  }, [canAccessAdministration]);

  const activeLocalUsers = useMemo(() => {
    return Array.isArray(platformUsers) ? platformUsers.filter((u) => u.is_active).length : 0;
  }, [platformUsers]);

  const roleCapabilities: Record<LocalUserRole, string> = {
    admin: "Manage configuration, users, explicit grants, integrations, and quality gates.",
    regular: "View explicitly assigned projects and their results in read-only mode.",
    default: "View projects, issues, and dashboards in read-only mode."
  };

  const loadPlatformUsers = () => {
    setUsersLoading(true);
    apiFetch(`${API_BASE}/v1/auth/users`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((data: unknown) => {
        if (Array.isArray(data)) setPlatformUsers(data as PlatformUser[]);
      })
      .catch(() => { /* admin only — silently ignore if not authorised */ })
      .finally(() => setUsersLoading(false));
  };

  const loadAccessCatalog = () => {
    setAccessCatalogLoading(true);
    Promise.all([
      apiFetch(`${API_BASE}/v1/projects`),
      apiFetch(`${API_BASE}/v1/projects/organizations/catalog`)
    ])
      .then(async ([projectsResponse, organizationsResponse]) => {
        if (!projectsResponse.ok) throw new Error(`Projects API returned ${projectsResponse.status}`);
        if (!organizationsResponse.ok) throw new Error(`Organizations API returned ${organizationsResponse.status}`);
        const [projects, organizations] = await Promise.all([
          projectsResponse.json() as Promise<ProjectCatalogItem[]>,
          organizationsResponse.json() as Promise<OrganizationCatalogItem[]>
        ]);
        setProjectCatalog(projects);
        setOrganizationCatalog(organizations);
      })
      .catch((err: Error) => setAdminMessage(err.message))
      .finally(() => setAccessCatalogLoading(false));
  };

  const editUserGrants = (userId: string) => {
    const user = platformUsers.find((item) => item.user_id === userId);
    setGrantForm({
      user_id: userId,
      organization_ids: user?.grants.filter((grant) => grant.scope_type === "organization").map((grant) => grant.scope_id) ?? [],
      project_keys: user?.grants.filter((grant) => grant.scope_type === "project").map((grant) => grant.scope_id) ?? []
    });
  };

  const saveUserGrants = async () => {
    if (!grantForm.user_id) {
      setAdminMessage("Select a user before saving access grants.");
      return;
    }
    setSavingGrants(true);
    setAdminMessage(null);
    try {
      const response = await apiFetch(`${API_BASE}/v1/auth/users/${encodeURIComponent(grantForm.user_id)}/grants`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_ids: grantForm.organization_ids, project_keys: grantForm.project_keys })
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, `Grant update failed with ${response.status}`));
      const saved = (await response.json()) as { organization_ids: string[]; project_keys: string[] };
      setPlatformUsers((current) => current.map((user) =>
        user.user_id === grantForm.user_id
          ? {
              ...user,
              grants: [
                ...saved.organization_ids.map((scope_id) => ({ scope_type: "organization" as const, scope_id })),
                ...saved.project_keys.map((scope_id) => ({ scope_type: "project" as const, scope_id }))
              ]
            }
          : user
      ));
      setGrantForm((current) => ({ ...current, organization_ids: saved.organization_ids, project_keys: saved.project_keys }));
      setAdminMessage("Explicit access grants updated.");
    } catch (err) {
      setAdminMessage(normalizeErrorMessage(err));
    } finally {
      setSavingGrants(false);
    }
  };

  const loadAuditLogs = (offset = 0, action = auditLogActionFilter, actor = auditLogActorFilter) => {
    setAuditLogLoading(true);
    const params = new URLSearchParams({ limit: "50", offset: String(offset) });
    if (action) params.set("action", action);
    if (actor) params.set("actor", actor);
    apiFetch(`${API_BASE}/v1/audit-logs?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<{ total: number; entries: AuditLogEntry[] }>;
      })
      .then(({ total, entries }) => {
        if (offset === 0) setAuditLogs(entries);
        else setAuditLogs((prev) => [...prev, ...entries]);
        setAuditLogTotal(total);
        setAuditLogOffset(offset);
      })
      .catch(() => { /* admin only */ })
      .finally(() => setAuditLogLoading(false));
  };

  const loadNotifChannels = () => {
    setNotifLoading(true);
    apiFetch(`${API_BASE}/v1/notifications/channels`)
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((data: unknown) => { if (Array.isArray(data)) setNotifChannels(data as NotificationChannel[]); })
      .catch(() => {})
      .finally(() => setNotifLoading(false));
  };

  const saveNotifChannel = () => {
    const { channel_type, name, url, to_email, smtp_host, smtp_port, smtp_user, smtp_password, smtp_from, on_fail, on_pass } = notifForm;
    if (!name.trim()) { setNotifMessage("Name is required."); return; }
    const config: Record<string, string> = channel_type === "webhook"
      ? { url }
      : { to_email, smtp_host, smtp_port, smtp_user, smtp_password, smtp_from };
    apiFetch(`${API_BASE}/v1/notifications/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), channel_type, config, on_fail, on_pass, enabled: true }),
    })
      .then((r) => { if (!r.ok) return r.json().then((e) => { throw new Error((e as {detail?: string}).detail ?? "Error"); }); return r.json(); })
      .then(() => {
        setShowNotifForm(false);
        setNotifForm({ name: "", channel_type: "webhook", url: "", to_email: "", smtp_host: "", smtp_port: "587", smtp_user: "", smtp_password: "", smtp_from: "", on_fail: true, on_pass: false });
        setNotifMessage("Channel created.");
        loadNotifChannels();
      })
      .catch((e: Error) => setNotifMessage(e.message));
  };

  const deleteNotifChannel = (id: string) => {
    apiFetch(`${API_BASE}/v1/notifications/channels/${id}`, { method: "DELETE" })
      .then(() => { setNotifMessage("Channel deleted."); loadNotifChannels(); })
      .catch(() => setNotifMessage("Delete failed."));
  };

  const testNotifChannel = (id: string) => {
    setNotifTestingId(id);
    setNotifMessage(null);
    apiFetch(`${API_BASE}/v1/notifications/channels/${id}/test`, { method: "POST" })
      .then((r) => r.json().then((body: { message?: string; detail?: string }) => {
        setNotifMessage(r.ok ? (body.message ?? "Test sent.") : `Test failed: ${body.detail ?? "unknown error"}`);
      }))
      .catch(() => setNotifMessage("Test request failed."))
      .finally(() => setNotifTestingId(null));
  };

  const toggleNotifChannel = (id: string, enabled: boolean) => {
    apiFetch(`${API_BASE}/v1/notifications/channels/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    })
      .then(() => loadNotifChannels())
      .catch(() => {});
  };

  const addLocalUser = () => {
    const fullName = newLocalUser.full_name.trim();
    const email = newLocalUser.email.trim().toLowerCase();
    const password = newLocalUser.password.trim();
    if (!fullName || !email || !password) {
      setAdminMessage("User full name, email and password are required.");
      return;
    }
    if (password.length < 8) {
      setAdminMessage("Password must be at least 8 characters.");
      return;
    }
    apiFetch(`${API_BASE}/v1/auth/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, full_name: fullName, role: newLocalUser.access_role, password }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((e) => { throw new Error((e as {detail?: string}).detail ?? "Error"); });
        setNewLocalUser({ full_name: "", email: "", password: "", user_type: "internal", access_role: "default" });
        setAdminMessage(`User ${fullName} created.`);
        loadPlatformUsers();
      })
      .catch((e: Error) => setAdminMessage(e.message));
  };

  const updateUserPassword = () => {
    const userId = passwordForm.user_id;
    const newPassword = passwordForm.password.trim();
    if (!userId || !newPassword) {
      setAdminMessage("Select a user and provide a new password.");
      return;
    }
    if (newPassword.length < 8) {
      setAdminMessage("Password must be at least 8 characters.");
      return;
    }
    apiFetch(`${API_BASE}/v1/auth/users/${encodeURIComponent(userId)}/password`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_password: newPassword }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((e) => { throw new Error((e as {detail?: string}).detail ?? "Error"); });
        const target = platformUsers.find((u) => u.user_id === userId);
        setPasswordForm({ user_id: "", password: "" });
        setAdminMessage(`Password updated for ${target?.full_name ?? "selected user"}.`);
      })
      .catch((e: Error) => setAdminMessage(e.message));
  };

  const setUserRole = (userId: string, role: LocalUserRole) => {
    apiFetch(`${API_BASE}/v1/auth/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    })
      .then((r) => { if (!r.ok) throw new Error("Failed"); })
      .then(() => setPlatformUsers((prev) => prev.map((u) => u.user_id === userId ? { ...u, role } : u)))
      .catch(() => setAdminMessage("Failed to update role."));
  };

  const toggleUserStatus = (userId: string) => {
    const user = platformUsers.find((u) => u.user_id === userId);
    if (!user) return;
    const is_active = !user.is_active;
    apiFetch(`${API_BASE}/v1/auth/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active }),
    })
      .then((r) => { if (!r.ok) throw new Error("Failed"); })
      .then(() => setPlatformUsers((prev) => prev.map((u) => u.user_id === userId ? { ...u, is_active } : u)))
      .catch(() => setAdminMessage("Failed to update status."));
    // keep original closing paren structure intact below
  };

  const removeLocalUser = (userId: string) => {
    apiFetch(`${API_BASE}/v1/auth/users/${encodeURIComponent(userId)}`, { method: "DELETE" })
      .then((r) => { if (!r.ok) return r.json().then((e) => { throw new Error((e as {detail?: string}).detail ?? "Error"); }); })
      .then(() => { setPlatformUsers((prev) => prev.filter((u) => u.user_id !== userId)); setAdminMessage("User deleted."); })
      .catch((e: Error) => setAdminMessage(e.message));
  };

  const summaries = useMemo<ProjectSummary[]>(() => {
    const grouped = new Map<string, AnalysisRecord[]>();
    for (const analysis of analyses) {
      const existing = grouped.get(analysis.project_key) ?? [];
      existing.push(analysis);
      grouped.set(analysis.project_key, existing);
    }

    return Array.from(grouped.entries())
      .map(([projectKey, history]) => {
        const sorted = [...history].sort((left, right) =>
          right.created_at.localeCompare(left.created_at)
        );
        return {
          projectKey,
          latest: sorted[0],
          history: sorted,
          passCount: sorted.filter((analysis) => analysis.completeness !== "legacy_unverified" && analysis.completeness != null && analysis.quality_gate === "pass").length,
          failCount: sorted.filter((analysis) => analysis.completeness !== "legacy_unverified" && analysis.completeness != null && analysis.quality_gate === "fail").length,
          unverifiedCount: sorted.filter((analysis) => analysis.completeness === "legacy_unverified" || analysis.completeness == null).length
        };
      })
      .sort((left, right) => left.projectKey.localeCompare(right.projectKey));
  }, [analyses]);

  const filteredSummaries = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();
    if (!query) {
      return summaries;
    }
    return summaries.filter((summary) => summary.projectKey.toLowerCase().includes(query));
  }, [projectSearch, summaries]);

  const selectedSummary = useMemo(() => {
    return summaries.find((summary) => summary.projectKey === selectedProject) ?? null;
  }, [selectedProject, summaries]);

  // Handle Entra OIDC callback params and pre-fetch Entra provider status for sign-in page
  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const fragmentParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const entraSession = fragmentParams.get("entra_session") ?? queryParams.get("entra_session");
    const entraError = fragmentParams.get("entra_error") ?? queryParams.get("entra_error");
    window.history.replaceState({}, "", window.location.pathname);

    if (entraError) {
      setSignInError(`Azure AD sign-in failed: ${decodeURIComponent(entraError)}`);
      return;
    }

    if (entraSession) {
      try {
        const decoded = JSON.parse(atob(entraSession.replace(/-/g, "+").replace(/_/g, "/"))) as {
          full_name: string;
          email: string;
          access_role: "admin" | "regular" | "default";
          token?: string;
          permissions?: SessionUser["permissions"];
        };
        const nextSession: SessionUser = {
          full_name: decoded.full_name ?? "Entra User",
          email: decoded.email ?? "",
          access_role: decoded.access_role ?? "default",
          token: decoded.token,
          permissions: decoded.permissions
        };
        setSessionUser(nextSession);
        window.localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(nextSession));
        setAuthScreen("app");
      } catch {
        setSignInError("Failed to read Azure AD session. Please try again.");
      }
      return;
    }

    // Pre-fetch azure-ad provider to know whether to show the SSO button
    fetch(`${API_BASE}/v1/integrations/providers`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((providers: AuthProvider[]) => {
        const azureAd = providers.find((p) => p.provider_id === "azure-ad") ?? null;
        setEntraProvider(azureAd);
      })
      .catch(() => { /* sign-in still works without SSO */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-initialize selected branch when project changes
  useEffect(() => {
    if (selectedSummary && !selectedBranch) {
      const defaultBranch = selectedSummary.latest.branch || "master";
      setSelectedBranch(defaultBranch);
    }
  }, [selectedSummary, selectedBranch]);

  // Filter analyses by selected project and branch
  const selectedProjectAnalyses = useMemo(() => {
    if (!selectedSummary || !selectedBranch) return [];
    return selectedSummary.history.filter((analysis) => analysis.branch === selectedBranch);
  }, [selectedSummary, selectedBranch]);

  const selectedAnalysis = useMemo(() => {
    const detailed = detailAnalyses.find((analysis) => analysis.analysis_id === selectedAnalysisId);
    return detailed ?? selectedProjectAnalyses.find((analysis) => analysis.analysis_id === selectedAnalysisId) ?? null;
  }, [detailAnalyses, selectedAnalysisId, selectedProjectAnalyses]);

  useEffect(() => {
    if (!selectedProjectAnalyses.some((analysis) => analysis.analysis_id === selectedAnalysisId)) {
      setSelectedAnalysisId(selectedProjectAnalyses[0]?.analysis_id ?? "");
    }
  }, [selectedAnalysisId, selectedProjectAnalyses]);

  const allIssueDetails = useMemo(() => {
    if (!selectedAnalysis) return [];
    const affectedFiles = selectedAnalysis.metrics.affected_files ?? {};
    const meta = projectMeta[selectedAnalysis.project_key];

    return Object.entries(affectedFiles).flatMap(([filePath, fileData]) => {
      // Legacy summary objects contain counts only: they must remain summaries.
      if (!Array.isArray(fileData)) return [];
      return fileData.map((issue, index) => {
        const rule = issue.rule_id ?? issue.rule ?? "Non disponible";
        return {
          id: `${selectedAnalysis.analysis_id}:${filePath}:${issue.line}:${rule}:${index}`,
          project_key: selectedAnalysis.project_key,
          file_path: filePath,
          line: issue.line,
          end_line: issue.end_line,
          rule,
          message: issue.message,
          severity: String(issue.severity).toUpperCase(),
          category: findingCategory(issue.category),
          tool: issue.tool?.trim() || "Non disponible",
          commit_sha: selectedAnalysis.commit_sha ?? "",
          branch: selectedAnalysis.branch,
          repo_url: meta?.repoUrl ?? "",
          repo_provider: meta?.repoProvider ?? "other"
        };
      });
    });
  }, [selectedAnalysis, projectMeta]);

  const filteredIssueDetails = useMemo(() => {
    const severityMap: Record<string, IssueSeverityFilter> = {
      CRITICAL: "blocker",
      ERROR: "blocker",
      BLOCKER: "blocker",
      HIGH: "high",
      WARNING: "medium",
      MEDIUM: "medium",
      LOW: "low",
      INFO: "info",
      CONVENTION: "low"
    };
    return allIssueDetails.filter((issue) => {
      if (issueSeverityFilter !== "all") {
        const mapped = severityMap[issue.severity] ?? "low";
        if (mapped !== issueSeverityFilter) return false;
      }
      if (issueTypeFilter !== "all" && issue.category !== issueTypeFilter) return false;
      if (issueRuleFilter.trim()) {
        if (!issue.rule.toLowerCase().includes(issueRuleFilter.trim().toLowerCase())) return false;
      }
      if (issueFileFilter.trim()) {
        if (!issue.file_path.toLowerCase().includes(issueFileFilter.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [allIssueDetails, issueSeverityFilter, issueTypeFilter, issueRuleFilter, issueFileFilter]);

  const filteredRules = useMemo(() => {
    const q = ruleSearch.trim().toLowerCase();
    return rules.filter((r) => {
      if (q && !r.title.toLowerCase().includes(q) && !r.rule_id.toLowerCase().includes(q)) return false;
      if (ruleFilterCategory !== "all" && r.category.toLowerCase() !== ruleFilterCategory) return false;
      if (ruleFilterSeverity !== "all" && r.severity.toLowerCase() !== ruleFilterSeverity) return false;
      if (ruleFilterStatus !== "all" && r.status !== ruleFilterStatus) return false;
      if (ruleFilterLanguage !== "all" && r.language.toLowerCase() !== ruleFilterLanguage.toLowerCase()) return false;
      return true;
    });
  }, [rules, ruleSearch, ruleFilterCategory, ruleFilterSeverity, ruleFilterStatus, ruleFilterLanguage]);

  const selectedRule = useMemo(
    () => filteredRules.find((r) => r.rule_id === selectedRuleId) ?? filteredRules[0] ?? null,
    [filteredRules, selectedRuleId]
  );

  const selectedGate = useMemo(
    () => gateLibrary.find((gateItem) => gateItem.gate_id === selectedGateId) ?? null,
    [gateLibrary, selectedGateId]
  );

  const selectedAuthProvider = useMemo(
    () => authProviders.find((provider) => provider.provider_id === authForm.provider_id) ?? null,
    [authForm.provider_id, authProviders]
  );

  const apiFetch = (url: string, init?: RequestInit): Promise<Response> => {
    const token = sessionUser?.token;
    const headers = new Headers(init?.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(url, {
      ...init,
      headers,
    }).then((res) => {
      // 401 on a read-only GET just means unauthenticated — let callers handle it.
      // Never throw here; throwing would crash data-loading effects and blank the UI.
      return res;
    });
  };

  const normalizeErrorMessage = (err: unknown, fallback = "Unknown error") => {
    if (err instanceof Error && err.message) {
      return err.message;
    }
    if (typeof err === "string" && err.trim()) {
      return err;
    }
    return fallback;
  };

  const parseApiDetail = (detail: unknown): string | null => {
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }

    if (Array.isArray(detail)) {
      const parts = detail
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }
          if (!item || typeof item !== "object") {
            return String(item);
          }

          const validationItem = item as { loc?: unknown; msg?: unknown; detail?: unknown };
          const loc = Array.isArray(validationItem.loc)
            ? validationItem.loc.map((segment) => String(segment)).join(".")
            : null;
          const msg =
            typeof validationItem.msg === "string"
              ? validationItem.msg
              : typeof validationItem.detail === "string"
                ? validationItem.detail
                : null;

          if (loc && msg) {
            return `${loc}: ${msg}`;
          }
          if (msg) {
            return msg;
          }

          try {
            return JSON.stringify(item);
          } catch {
            return "Invalid API error payload";
          }
        })
        .filter((part) => typeof part === "string" && part.trim().length > 0);

      return parts.length > 0 ? parts.join("; ") : null;
    }

    if (detail && typeof detail === "object") {
      try {
        return JSON.stringify(detail);
      } catch {
        return "Invalid API error payload";
      }
    }

    return null;
  };

  const getApiErrorMessage = async (response: Response, fallback: string) => {
    try {
      const payload = (await response.json()) as { detail?: unknown; message?: unknown };
      const detail = parseApiDetail(payload.detail ?? payload.message);
      return detail ?? fallback;
    } catch {
      return fallback;
    }
  };

  const downloadExport = async (url: string, filename: string) => {
    try {
      const response = await apiFetch(url);
      if (!response.ok) throw new Error(await getApiErrorMessage(response, `Export failed with ${response.status}`));
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(normalizeErrorMessage(err));
    }
  };

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);

    try {
      const [analysesResponse, gateResponse, integrationsResponse, providersResponse] = await Promise.all([
        apiFetch(`${API_BASE}/v1/analyses`),
        apiFetch(`${API_BASE}/v1/gates/default`),
        apiFetch(`${API_BASE}/v1/integrations/projects`),
        apiFetch(`${API_BASE}/v1/integrations/providers`)
      ]);

      if (!analysesResponse.ok) {
        throw new Error(`Analyses API returned ${analysesResponse.status}`);
      }
      if (!gateResponse.ok) {
        throw new Error(`Gate API returned ${gateResponse.status}`);
      }
      if (!integrationsResponse.ok) {
        throw new Error(`Integrations API returned ${integrationsResponse.status}`);
      }
      if (!providersResponse.ok) {
        throw new Error(`Providers API returned ${providersResponse.status}`);
      }

      const analysesPayload = (await analysesResponse.json()) as AnalysisRecord[];
      const gatePayload = (await gateResponse.json()) as QualityGate;
      const integrationsPayload = (await integrationsResponse.json()) as ProjectIntegrationRecord[];
      const providersPayload = (await providersResponse.json()) as AuthProvider[];
      setAnalyses(analysesPayload);
      setGate(gatePayload);
      setProjectMeta(
        Object.fromEntries(
          integrationsPayload.map((item) => [
            item.project_key,
            {
              repoProvider: item.repo_provider,
              repoUrl: item.repo_url,
              pipelineProvider: item.pipeline_provider,
              pipelineUrl: item.pipeline_url,
              updatedAt: item.updated_at
            }
          ])
        )
      );
      setAuthProviders(providersPayload);
      if (providersPayload.length > 0) {
        const preferredProvider =
          providersPayload.find((provider) => provider.provider_id === authForm.provider_id) ??
          providersPayload[0];
        setAuthForm(current => ({ ...current,
          provider_id: preferredProvider.provider_id,
          connection_url: preferredProvider.connection_url
        }));
      }
      setGateLibrary((current) => {
        const defaults: GateLibraryItem[] = [{
          ...gatePayload,
          projectCount: new Set(analysesPayload.map((analysis) => analysis.project_key)).size,
          builtIn: true
        }];

        if (current.length === 0) {
          return defaults;
        }

        return current.map((item) =>
          item.gate_id === "default"
            ? {
                ...item,
                ...gatePayload,
                projectCount: new Set(analysesPayload.map((analysis) => analysis.project_key)).size,
                builtIn: item.builtIn ?? true
              }
            : item
        );
      });
      setApiStatus("connected");
      setGateForm({
        name: gatePayload.name,
        min_maintainability_score: gatePayload.min_maintainability_score,
        min_security_score: gatePayload.min_security_score,
        min_reliability_score: gatePayload.min_reliability_score ?? 50,
        max_bugs: gatePayload.max_bugs ?? 0,
        max_vulnerabilities: gatePayload.max_vulnerabilities,
        max_security_hotspots: gatePayload.max_security_hotspots,
        max_code_smells: gatePayload.max_code_smells
      });
      if (!analysesPayload.some((analysis) => analysis.project_key === selectedProject)) {
        setSelectedProject(analysesPayload[0]?.project_key ?? "");
        setSelectedBranch("");
      }
    } catch (err) {
      const message = normalizeErrorMessage(err);
      setApiStatus("disconnected");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setGateLibrary(parseGateLibrary());
  }, []);

  useEffect(() => {
    if (authScreen !== "app") {
      return;
    }

    void loadDashboard();
    Promise.all([
      apiFetch(`${API_BASE}/v1/platform/token/status`).then((res) => res.json()),
      apiFetch(`${API_BASE}/v1/platform/token/history`).then((res) => res.json()),
      apiFetch(`${API_BASE}/v1/integrations/azure-devops/configs`).then((res) => res.json()),
      apiFetch(`${API_BASE}/v1/platform/settings`).then((res) => res.json()),
      apiFetch(`${API_BASE}/v1/platform/cleanup/status`).then((res) => res.json()).catch(() => null),
    ])
      .then(
        ([
          statusData,
          historyData,
          azureDevOpsConfigData,
          settingsData,
          cleanupData,
        ]: [
          { configured: boolean; expired: boolean; expires_at: string | null },
          PlatformTokenHistoryItem[],
          AzureDevOpsOrganizationConfig[],
          PlatformSettings,
          { last_cleanup_at: string; last_cleanup_deleted: number } | null,
        ]) => {
          setPlatformTokenConfigured(statusData.configured);
          setPlatformTokenExpired(statusData.expired);
          setPlatformTokenExpiresAt(statusData.expires_at);
          setPlatformTokenHistory(historyData);
          setAzureDevOpsConfigs(azureDevOpsConfigData);
          setPlatformSettings({ ...DEFAULT_PLATFORM_SETTINGS, ...settingsData });
          if (cleanupData) setCleanupStatus(cleanupData);
        }
      )
      .catch(() => {
        setPlatformTokenConfigured(false);
        setPlatformTokenExpired(false);
        setPlatformTokenExpiresAt(null);
        setPlatformTokenHistory([]);
        setAzureDevOpsConfigs([]);
        setPlatformSettings(DEFAULT_PLATFORM_SETTINGS);
      });
  }, [authScreen]);

  useEffect(() => {
    window.localStorage.setItem(LOCAL_STORAGE_GATE_LIBRARY_KEY, JSON.stringify(gateLibrary));
  }, [gateLibrary]);

  useEffect(() => {
    window.localStorage.setItem(
      LOCAL_STORAGE_NAV_KEY,
      JSON.stringify({ tab: activeTab, adminTab: activeAdminTab, adminSection: activeAdminSection })
    );
  }, [activeTab, activeAdminTab, activeAdminSection]);

  useEffect(() => {
    if (activeTab !== "rules") return;
    const controller = new AbortController();
    setRulesLoading(true);
    setRulesError(null);
    setRules([]);
    const url = selectedProject
      ? `${API_BASE}/v1/rules?project_key=${encodeURIComponent(selectedProject)}`
      : `${API_BASE}/v1/rules`;
    apiFetch(url, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error(`Rules API returned ${r.status}`); return r.json(); })
      .then((data: RuleCard[]) => { if (!controller.signal.aborted) setRules(data); })
      .catch((err: Error) => { if (!controller.signal.aborted) setRulesError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setRulesLoading(false); });
    return () => controller.abort();
  }, [activeTab, selectedProject]);

  // Issues tab: lazy-load full analyses (with affected_files) for the selected project.
  useEffect(() => {
    if (activeTab !== "issues") return;
    setDetailAnalyses([]);
    setIssuesError(null);
    if (!selectedProject) { setIssuesLoading(false); return; }
    const controller = new AbortController();
    setIssuesLoading(true);
    const url = `${API_BASE}/v1/analyses?project_key=${encodeURIComponent(selectedProject)}`;
    apiFetch(url, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error(`Issues API returned ${r.status}`); return r.json(); })
      .then((data: AnalysisRecord[]) => { if (!controller.signal.aborted) setDetailAnalyses(data); })
      .catch((err: Error) => { if (!controller.signal.aborted) setIssuesError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setIssuesLoading(false); });
    return () => controller.abort();
  }, [activeTab, selectedProject]);

  useEffect(() => {
    if (authScreen === "app" && !sessionUser) {
      setAuthScreen("sign-in");
    }
  }, [authScreen, sessionUser]);

  useEffect(() => {
    if (authScreen !== "app" || !sessionUser?.token) return;
    const controller = new AbortController();
    apiFetch(`${API_BASE}/v1/auth/me`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Session API returned ${response.status}`);
        return response.json();
      })
      .then((data: { email: string; full_name: string; role: LocalUserRole; permissions: SessionUser["permissions"] }) => {
        if (controller.signal.aborted) return;
        setSessionUser((current) => {
          if (!current) return current;
          const refreshed = {
            ...current,
            email: data.email,
            full_name: data.full_name,
            access_role: data.role,
            permissions: data.permissions
          };
          if (window.localStorage.getItem(LOCAL_STORAGE_SESSION_KEY)) {
            window.localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(refreshed));
          }
          return refreshed;
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSessionUser((current) => (current ? { ...current, permissions: undefined } : current));
        }
      });
    return () => controller.abort();
  // apiFetch intentionally follows the active session token.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authScreen, sessionUser?.token]);

  useEffect(() => {
    if (!canAccessAdministration && activeTab === "administration") {
      setActiveTab("projects");
    }
  }, [activeTab, canAccessAdministration]);

  // Load explicit access catalogs only where they are edited or assigned.
  useEffect(() => {
    if (!canAccessAdministration || !sessionUser?.token) return;
    if (activeAdminSection === "access-management") loadPlatformUsers();
    if (activeAdminSection === "access-management" || activeAdminSection === "pat-management") loadAccessCatalog();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAdminSection, canAccessAdministration, sessionUser?.token]);

  // Load notification channels when the notifications section becomes active
  useEffect(() => {
    if (activeAdminSection !== "notifications" || !canAccessAdministration || !sessionUser?.token) return;
    loadNotifChannels();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAdminSection, canAccessAdministration, sessionUser?.token]);

  // Load gates from API when Quality Gates tab becomes active
  useEffect(() => {
    if (activeTab !== "quality-gates") return;
    loadGates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Load audit logs when the audit-log section becomes active
  useEffect(() => {
    if (activeAdminSection !== "audit-log" || !canAccessAdministration || !sessionUser?.token) return;
    loadAuditLogs(0, "", "");
    setAuditLogActionFilter("");
    setAuditLogActorFilter("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAdminSection, canAccessAdministration, sessionUser?.token]);

  useEffect(() => {
    if (!adminForm.project_key) {
      return;
    }
    const meta = projectMeta[adminForm.project_key] ?? {
      repoProvider: "github",
      repoUrl: "",
      pipelineProvider: "azure-devops",
      pipelineUrl: ""
    };
    setAdminForm((current) => ({
      ...current,
      repoProvider: meta.repoProvider,
      repoUrl: meta.repoUrl,
      pipelineProvider: meta.pipelineProvider,
      pipelineUrl: meta.pipelineUrl
    }));
  }, [adminForm.project_key, projectMeta]);

  useEffect(() => {
    if (!selectedAuthProvider) {
      return;
    }

    setAuthForm({
      provider_id: selectedAuthProvider.provider_id,
      connection_url: selectedAuthProvider.connection_url,
      tenant_id: selectedAuthProvider.config?.tenant_id ?? "",
      client_id: selectedAuthProvider.config?.client_id ?? "",
      client_secret: "",
      redirect_uri: selectedAuthProvider.config?.redirect_uri ?? "",
      scopes: selectedAuthProvider.config?.scopes ?? "openid profile email",
    });
  }, [selectedAuthProvider]);

  useEffect(() => {
    if (!selectedGate) {
      return;
    }

    setGateForm({
      name: selectedGate.name,
      min_maintainability_score: selectedGate.min_maintainability_score,
      min_security_score: selectedGate.min_security_score,
      min_reliability_score: selectedGate.min_reliability_score ?? 50,
      max_vulnerabilities: selectedGate.max_vulnerabilities,
      max_security_hotspots: selectedGate.max_security_hotspots,
      max_bugs: selectedGate.max_bugs ?? 10,
      max_code_smells: selectedGate.max_code_smells
    });
  }, [selectedGate]);

  const saveGate = async () => {
    if (!canAccessAdministration) return;
    setSavingGate(true);
    setGateMessage(null);
    setError(null);

    try {
      const response = await apiFetch(`${API_BASE}/v1/gates/default`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gateForm)
      });

      if (!response.ok) {
        throw new Error(`Gate update failed with ${response.status}`);
      }

      const payload = (await response.json()) as QualityGate;
      setGate(payload);
      setGateLibrary((current) =>
        current.map((item) =>
          item.gate_id === selectedGateId
            ? {
                ...item,
                ...payload,
                projectCount: item.projectCount
              }
            : item
        )
      );
      setGateMessage("Quality gate saved.");
      await loadDashboard();
    } catch (err) {
      const message = normalizeErrorMessage(err);
      setError(message);
      setGateMessage(null);
    } finally {
      setSavingGate(false);
    }
  };

  const deleteAnalyses = async () => {
    if (!deleteTarget) return;
    setDeletingAnalyses(true);
    try {
      const url = deleteTarget.type === "project"
        ? `${API_BASE}/v1/analyses/projects/${encodeURIComponent(deleteTarget.project)}`
        : `${API_BASE}/v1/analyses/projects/${encodeURIComponent(deleteTarget.project)}/branches/${encodeURIComponent(deleteTarget.branch ?? "")}`;
      const response = await apiFetch(url, { method: "DELETE" });
      if (!response.ok) throw new Error(`Delete failed with ${response.status}`);
      setShowDeleteModal(false);
      setDeleteTarget(null);
      await loadDashboard();
    } catch (err) {
      setError(normalizeErrorMessage(err));
    } finally {
      setDeletingAnalyses(false);
    }
  };

  const saveProjectMeta = async () => {
    if (!adminForm.project_key) {
      return;
    }
    setSavingProjectMeta(true);
    setError(null);
    try {
      const response = await apiFetch(`${API_BASE}/v1/integrations/projects/${adminForm.project_key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_provider: adminForm.repoProvider,
          repo_url: adminForm.repoUrl.trim(),
          pipeline_provider: adminForm.pipelineProvider,
          pipeline_url: adminForm.pipelineUrl.trim()
        })
      });

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(response, `Integration update failed with ${response.status}`)
        );
      }

      const saved = (await response.json()) as ProjectIntegrationRecord;
      setProjectMeta((current) => ({
        ...current,
        [saved.project_key]: {
          repoProvider: saved.repo_provider,
          repoUrl: saved.repo_url,
          pipelineProvider: saved.pipeline_provider,
          pipelineUrl: saved.pipeline_url,
          updatedAt: saved.updated_at
        }
      }));
      setAdminMessage(`Links saved for ${adminForm.project_key}.`);
    } catch (err) {
      const message = normalizeErrorMessage(err);
      setError(message);
      setAdminMessage(null);
    } finally {
      setSavingProjectMeta(false);
    }
  };

  const saveAuthProvider = async () => {
    setSavingAuthProvider(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { connection_url: authForm.connection_url.trim() };
      if (authForm.provider_id === "azure-ad") {
        const oidcConfig: Record<string, string> = {
          tenant_id: authForm.tenant_id.trim(),
          client_id: authForm.client_id.trim(),
          redirect_uri: authForm.redirect_uri.trim(),
          scopes: authForm.scopes.trim(),
        };
        if (authForm.client_secret.trim()) {
          oidcConfig.client_secret = authForm.client_secret.trim();
        }
        body.config_json = oidcConfig;
      }
      const response = await apiFetch(`${API_BASE}/v1/integrations/providers/${authForm.provider_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, `Provider update failed with ${response.status}`));
      }

      const saved = (await response.json()) as AuthProvider;
      setAuthProviders((current) =>
        current.map((provider) =>
          provider.provider_id === saved.provider_id ? saved : provider
        )
      );
      setAdminMessage(`${saved.display_name} settings saved.`);
    } catch (err) {
      const message = normalizeErrorMessage(err);
      setError(message);
      setAdminMessage(null);
    } finally {
      setSavingAuthProvider(false);
    }
  };

  const savePlatformSettings = async (updates: Partial<PlatformSettings>, successMessage: string) => {
    setSavingPlatformSettings(true);
    setError(null);
    try {
      const response = await apiFetch(`${API_BASE}/v1/platform/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, `Settings update failed with ${response.status}`));
      }

      const saved = (await response.json()) as PlatformSettings;
      setPlatformSettings(saved);
      setAdminMessage(successMessage);
    } catch (err) {
      const message = normalizeErrorMessage(err);
      setError(message);
      setAdminMessage(null);
    } finally {
      setSavingPlatformSettings(false);
    }
  };

  const testAuthProvider = async () => {
    setTestingAuthProvider(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { connection_url: authForm.connection_url.trim() };
      if (authForm.provider_id === "azure-ad") {
        const oidcConfig: Record<string, string> = {
          tenant_id: authForm.tenant_id.trim(),
          client_id: authForm.client_id.trim(),
          redirect_uri: authForm.redirect_uri.trim(),
          scopes: authForm.scopes.trim(),
        };
        if (authForm.client_secret.trim()) {
          oidcConfig.client_secret = authForm.client_secret.trim();
        }
        body.config_json = oidcConfig;
      }
      const saveResponse = await apiFetch(`${API_BASE}/v1/integrations/providers/${authForm.provider_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!saveResponse.ok) {
        throw new Error(
          await getApiErrorMessage(saveResponse, `Provider update failed with ${saveResponse.status}`)
        );
      }

      const response = await apiFetch(`${API_BASE}/v1/integrations/providers/${authForm.provider_id}/test`, {
        method: "POST"
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, `Provider test failed with ${response.status}`));
      }

      const saved = (await response.json()) as AuthProvider;
      setAuthProviders((current) =>
        current.map((provider) =>
          provider.provider_id === saved.provider_id ? saved : provider
        )
      );
      setAdminMessage(`${saved.display_name} configuration validated.`);
    } catch (err) {
      const message = normalizeErrorMessage(err);
      setError(message);
      setAdminMessage(null);
    } finally {
      setTestingAuthProvider(false);
    }
  };

  const disableAuthProvider = async () => {
    setSavingAuthProvider(true);
    setError(null);
    try {
      const response = await apiFetch(`${API_BASE}/v1/integrations/providers/${authForm.provider_id}/disable`, {
        method: "POST"
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, `Provider disable failed with ${response.status}`));
      }

      const saved = (await response.json()) as AuthProvider;
      setAuthProviders((current) =>
        current.map((provider) =>
          provider.provider_id === saved.provider_id ? saved : provider
        )
      );
      setAdminMessage(`${saved.display_name} disabled.`);
    } catch (err) {
      const message = normalizeErrorMessage(err);
      setError(message);
      setAdminMessage(null);
    } finally {
      setSavingAuthProvider(false);
    }
  };

  const generatePlatformToken = async (mode: "new" | "rotate") => {
    if (platformTokenProjectKeys.length === 0) {
      setPlatformTokenError("Select at least one project for this token.");
      return;
    }
    if (mode === "new") {
      const confirmed = window.confirm("Generate this independent CI/CD token for the selected projects?");
      if (!confirmed) {
        return;
      }
    }

    setGeneratingPlatformToken(true);
    setPlatformTokenError(null);
    setGeneratedPlatformToken(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (mode === "rotate") {
        const currentToken = platformTokenInput.trim();
        if (!currentToken) {
          throw new Error("Current token is required to rotate.");
        }
        headers["X-Current-Platform-Token"] = currentToken;
      }

      const response = await apiFetch(`${API_BASE}/v1/platform/token/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          token_name: platformTokenName.trim(),
          ttl_days: platformTokenTtlDays,
          require_current_token: mode === "rotate",
          project_keys: platformTokenProjectKeys,
          scopes: CI_TOKEN_SCOPES
        })
      });
      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(response, `Token generation failed with ${response.status}`)
        );
      }
      const data = (await response.json()) as {
        token: string;
        generated_at: string;
        expires_at: string | null;
      };
      setGeneratedPlatformToken(data.token);
      setPlatformTokenConfigured(true);
      setPlatformTokenExpired(false);
      setPlatformTokenExpiresAt(data.expires_at);
      const historyResponse = await apiFetch(`${API_BASE}/v1/platform/token/history`);
      if (historyResponse.ok) {
        setPlatformTokenHistory((await historyResponse.json()) as PlatformTokenHistoryItem[]);
      }
      if (mode === "rotate") {
        setPlatformTokenInput("");
      }
    } catch (err) {
      setPlatformTokenError(normalizeErrorMessage(err));
    } finally {
      setGeneratingPlatformToken(false);
    }
  };

  const revokePlatformToken = async (tokenId: string) => {
    if (!window.confirm("Revoke this CI/CD token? Pipelines using it will immediately lose access.")) return;
    setRevokingPlatformTokenId(tokenId);
    setPlatformTokenError(null);
    try {
      const response = await apiFetch(`${API_BASE}/v1/platform/token/${encodeURIComponent(tokenId)}/revoke`, { method: "POST" });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, `Token revocation failed with ${response.status}`));
      const [historyResponse, statusResponse] = await Promise.all([
        apiFetch(`${API_BASE}/v1/platform/token/history`),
        apiFetch(`${API_BASE}/v1/platform/token/status`)
      ]);
      if (!historyResponse.ok) throw new Error(`Token history returned ${historyResponse.status}`);
      if (!statusResponse.ok) throw new Error(`Token status returned ${statusResponse.status}`);
      setPlatformTokenHistory((await historyResponse.json()) as PlatformTokenHistoryItem[]);
      const status = (await statusResponse.json()) as { configured: boolean; expired: boolean; expires_at: string | null };
      setPlatformTokenConfigured(status.configured);
      setPlatformTokenExpired(status.expired);
      setPlatformTokenExpiresAt(status.expires_at);
      setAdminMessage("CI/CD token revoked.");
    } catch (err) {
      setPlatformTokenError(normalizeErrorMessage(err));
    } finally {
      setRevokingPlatformTokenId(null);
    }
  };

  const presetGitHubRepo = () => {
    const slug = adminForm.project_key || "org/repository";
    setAdminForm((current) => ({
      ...current,
      repoProvider: "github",
      repoUrl: `https://github.com/${slug.includes("/") ? slug : `upcoop/${slug}`}`
    }));
    setAdminMessage("GitHub repository preset applied.");
  };

  const presetAzurePipeline = () => {
    const organization = "up-group";
    const project = "Up.France.ODI";
    setAdminForm((current) => ({
      ...current,
      pipelineProvider: "azure-devops",
      pipelineUrl: `https://dev.azure.com/${organization}/${project}/_build`
    }));
    setAdminMessage("Azure DevOps pipeline preset applied.");
  };

  const openCreateAzureDevOpsConfigModal = () => {
    setEditingAzureDevOpsConfigId(null);
    setAzureDevOpsConfigForm({
      config_name: "",
      organization_url: "https://dev.azure.com/your-organization",
      personal_access_token: "",
      repo_import_enabled: false,
      quality_gate_enabled: false
    });
    setDevOpsConfigModalOpen(true);
  };

  const openEditAzureDevOpsConfigModal = (config: AzureDevOpsOrganizationConfig) => {
    setEditingAzureDevOpsConfigId(config.config_id);
    setAzureDevOpsConfigForm({
      config_name: config.config_name,
      organization_url: config.organization_url,
      personal_access_token: "",
      repo_import_enabled: config.repo_import_enabled,
      quality_gate_enabled: config.quality_gate_enabled
    });
    setDevOpsConfigModalOpen(true);
  };

  const loadAzureDevOpsConfigs = async () => {
    const response = await apiFetch(`${API_BASE}/v1/integrations/azure-devops/configs`);
    if (!response.ok) {
      throw new Error(`Azure DevOps configs API returned ${response.status}`);
    }
    setAzureDevOpsConfigs((await response.json()) as AzureDevOpsOrganizationConfig[]);
  };

  const saveAzureDevOpsConfig = async () => {
    setSavingAzureDevOpsConfig(true);
    setError(null);
    try {
      const endpoint = editingAzureDevOpsConfigId
        ? `${API_BASE}/v1/integrations/azure-devops/configs/${editingAzureDevOpsConfigId}`
        : `${API_BASE}/v1/integrations/azure-devops/configs`;
      const method = editingAzureDevOpsConfigId ? "PUT" : "POST";

      const response = await apiFetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(azureDevOpsConfigForm)
      });

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(response, `Azure DevOps configuration save failed with ${response.status}`)
        );
      }

      await loadAzureDevOpsConfigs();
      setDevOpsConfigModalOpen(false);
      setAdminMessage(
        editingAzureDevOpsConfigId
          ? "Azure DevOps configuration updated."
          : "Azure DevOps configuration created."
      );
    } catch (err) {
      setError(normalizeErrorMessage(err));
      setAdminMessage(null);
    } finally {
      setSavingAzureDevOpsConfig(false);
    }
  };

  const testAzureDevOpsConfig = async (configId: string) => {
    setTestingAzureDevOpsConfigId(configId);
    setError(null);
    try {
      const response = await apiFetch(`${API_BASE}/v1/integrations/azure-devops/configs/${configId}/test`, {
        method: "POST"
      });
      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(response, `Azure DevOps configuration test failed with ${response.status}`)
        );
      }
      await loadAzureDevOpsConfigs();
      setAdminMessage("Azure DevOps configuration checked.");
    } catch (err) {
      setError(normalizeErrorMessage(err));
      setAdminMessage(null);
      await loadAzureDevOpsConfigs();
    } finally {
      setTestingAzureDevOpsConfigId(null);
    }
  };

  const deleteAzureDevOpsConfig = async (config: AzureDevOpsOrganizationConfig) => {
    const confirmed = window.confirm(`Delete Azure DevOps configuration \"${config.config_name}\"?`);
    if (!confirmed) {
      return;
    }

    setDeletingAzureDevOpsConfigId(config.config_id);
    setError(null);
    try {
      const response = await apiFetch(`${API_BASE}/v1/integrations/azure-devops/configs/${config.config_id}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(response, `Azure DevOps configuration delete failed with ${response.status}`)
        );
      }
      await loadAzureDevOpsConfigs();
      setAdminMessage("Azure DevOps configuration deleted.");
    } catch (err) {
      setError(normalizeErrorMessage(err));
      setAdminMessage(null);
    } finally {
      setDeletingAzureDevOpsConfigId(null);
    }
  };

  const loadGates = () => {
    apiFetch(`${API_BASE}/v1/gates`)
      .then((r) => r.json())
      .then((data: unknown) => {
        if (!Array.isArray(data)) return;
        setGateLibrary((data as GateLibraryItem[]).map((g) => ({ ...g, projectCount: g.project_count ?? 0, builtIn: g.is_default })));
        const def = (data as GateLibraryItem[]).find((g) => g.is_default);
        if (def) setSelectedGateId((id) => id === "default" ? def.gate_id : id);
      })
      .catch(() => {});
    apiFetch(`${API_BASE}/v1/gates/assignments`)
      .then((r) => r.json())
      .then((data: unknown) => { if (data && typeof data === "object") setGateAssignments(data as Record<string, string>); })
      .catch(() => {});
  };

  const createGate = () => {
    if (!canAccessAdministration) return;
    const newName = `Custom Gate ${gateLibrary.length + 1}`;
    apiFetch(`${API_BASE}/v1/gates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, min_maintainability_score: 80, min_security_score: 85, min_reliability_score: 50, max_vulnerabilities: 0, max_security_hotspots: 2, max_code_smells: 25, max_bugs: 0 }),
    })
      .then((r) => { if (!r.ok) throw new Error("Create failed"); return r.json(); })
      .then((g: GateLibraryItem) => {
        setGateLibrary((cur) => [...cur, { ...g, projectCount: 0 }]);
        setSelectedGateId(g.gate_id);
        setGateForm({ name: g.name, min_maintainability_score: g.min_maintainability_score, min_security_score: g.min_security_score, min_reliability_score: g.min_reliability_score ?? 50, max_vulnerabilities: g.max_vulnerabilities, max_security_hotspots: g.max_security_hotspots, max_bugs: g.max_bugs ?? 0, max_code_smells: g.max_code_smells });
        setGateMessage(`Created ${g.name}.`);
      })
      .catch(() => setGateMessage("Failed to create gate."));
  };

  const saveSelectedGate = async () => {
    if (!canAccessAdministration) return;
    setSavingGate(true);
    try {
      const r = await apiFetch(`${API_BASE}/v1/gates/${selectedGateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: gateForm.name, min_maintainability_score: gateForm.min_maintainability_score, min_security_score: gateForm.min_security_score, min_reliability_score: gateForm.min_reliability_score, max_vulnerabilities: gateForm.max_vulnerabilities, max_security_hotspots: gateForm.max_security_hotspots, max_code_smells: gateForm.max_code_smells, max_bugs: gateForm.max_bugs }),
      });
      if (!r.ok) throw new Error("Save failed");
      const g = await r.json() as GateLibraryItem;
      setGateLibrary((cur) => cur.map((item) => item.gate_id === selectedGateId ? { ...item, ...g } : item));
      setGateMessage(`Saved ${g.name}.`);
    } catch {
      setGateMessage("Failed to save gate.");
    } finally {
      setSavingGate(false);
    }
  };

  const deleteSelectedGate = () => {
    if (!canAccessAdministration) return;
    const gate = gateLibrary.find((g) => g.gate_id === selectedGateId);
    if (!gate || gate.builtIn) return;
    if (!window.confirm(`Delete gate "${gate.name}"? Projects using it will revert to the default gate.`)) return;
    apiFetch(`${API_BASE}/v1/gates/${selectedGateId}`, { method: "DELETE" })
      .then((response) => {
        if (!response.ok) throw new Error("Delete failed");
        setGateLibrary((cur) => cur.filter((g) => g.gate_id !== selectedGateId));
        const def = gateLibrary.find((g) => g.builtIn);
        setSelectedGateId(def?.gate_id ?? "default");
        setGateMessage(`Gate deleted.`);
        loadGates();
      })
      .catch(() => setGateMessage("Delete failed."));
  };

  const assignGate = (project_key: string, gate_id: string) => {
    if (!canAccessAdministration) return;
    setSavingGateAssignment(project_key);
    const def = gateLibrary.find((g) => g.builtIn);
    const isDefault = gate_id === (def?.gate_id ?? "default");
    const req = isDefault
      ? apiFetch(`${API_BASE}/v1/gates/assignments/${encodeURIComponent(project_key)}`, { method: "DELETE" })
      : apiFetch(`${API_BASE}/v1/gates/assignments/${encodeURIComponent(project_key)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gate_id }),
        });
    req
      .then((response) => { if (!response.ok) throw new Error("Assignment failed"); setGateAssignments((prev) => isDefault
        ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== project_key))
        : { ...prev, [project_key]: gate_id }
      ); })
      .catch(() => setGateMessage("Failed to update project gate assignment."))
      .finally(() => setSavingGateAssignment(null));
  };

  const suppressRule = (ruleId: string) => {
    apiFetch(`${API_BASE}/v1/rules/${encodeURIComponent(ruleId)}/suppress`, { method: "POST" })
      .then(() => setRules((prev) => prev.map((r) => r.rule_id === ruleId ? { ...r, status: "suppressed" } : r)))
      .catch(() => {});
  };

  const unsuppressRule = (ruleId: string) => {
    apiFetch(`${API_BASE}/v1/rules/${encodeURIComponent(ruleId)}/suppress`, { method: "DELETE" })
      .then(() => setRules((prev) => prev.map((r) => r.rule_id === ruleId ? { ...r, status: "active" } : r)))
      .catch(() => {});
  };

  const updateGateField = (field: keyof typeof gateForm, value: string) => {
    setGateForm((current) => ({
      ...current,
      [field]: field === "name" ? value : Number(value)
    }));
  };

  const handleSignIn = async () => {
    setSignInError(null);
    const email = (signInEmailRef.current?.value ?? signInForm.email).trim().toLowerCase();
    const password = (signInPasswordRef.current?.value ?? signInForm.password).trim();

    if (!email || !password) {
      setSignInError("Email and password are required.");
      return;
    }

    try {
      const resp = await fetch(`${API_BASE}/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        setSignInError((err as { detail?: string }).detail ?? "Invalid credentials.");
        return;
      }
      const data = await resp.json() as { token: string; user: { email: string; full_name: string; role: string; permissions?: SessionUser["permissions"] } };
      const nextSession: SessionUser = {
        full_name: data.user.full_name,
        email: data.user.email,
        access_role: data.user.role as LocalUserRole,
        token: data.token,
        permissions: data.user.permissions
      };
      setSessionUser(nextSession);
      if (signInForm.remember_me) {
        window.localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(nextSession));
      } else {
        window.localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
      }
      setSignInForm((current) => ({ ...current, password: "" }));
      setAdminMessage(null);
      setAuthScreen("app");
    } catch {
      setSignInError("Connection error — please try again.");
    }
  };

  const handleEntraSignIn = async () => {
    setSignInError(null);
    try {
      const response = await fetch(`${API_BASE}/v1/auth/entra/login`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to get authorization URL");
      const data = (await response.json()) as { auth_url: string };
      window.location.href = data.auth_url;
    } catch {
      setSignInError("Failed to initiate Azure AD sign-in. Check the Entra configuration in Administration.");
    }
  };

  const openSignOutPage = () => {
    setAuthScreen("sign-out");
  };

  const cancelSignOut = () => {
    setAuthScreen("app");
  };

  const confirmSignOut = () => {
    window.localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
    window.localStorage.removeItem(LOCAL_STORAGE_NAV_KEY);
    setActiveTab("projects");
    setSessionUser(null);
    setSignInForm({ email: "", password: "", remember_me: true });
    setSignInError(null);
    setAuthScreen("sign-in");
    setAdminMessage("Session closed.");
  };

  if (authScreen === "sign-in") {
    return (
      <main className="auth-page">
        <section className="auth-shell">
          <div className="logo">CodeInsights</div>
          <h1>Sign In</h1>
          <p>Sign in with your organizational account or a local platform account.</p>
          {entraProvider?.enabled && (
            <div className="auth-card sign-card sso-card">
              <p className="sso-label">Single Sign-On</p>
              <button type="button" className="sso-btn" onClick={() => void handleEntraSignIn()}>
                <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                </svg>
                Sign in with Microsoft / Entra ID
              </button>
            </div>
          )}
          <form className="auth-card sign-card" onSubmit={(event) => { event.preventDefault(); void handleSignIn(); }}>
            <p className="sso-label">Local account</p>
            <div className="form-grid compact">
              <label>
                Email
                <input
                  ref={signInEmailRef}
                  value={signInForm.email}
                  onChange={(event) =>
                    setSignInForm((current) => ({ ...current, email: event.target.value }))
                  }
                  type="email"
                  placeholder="name@organization.com"
                  autoComplete="username"
                />
              </label>
              <label>
                Password
                <input
                  ref={signInPasswordRef}
                  type="password"
                  value={signInForm.password}
                  onChange={(event) =>
                    setSignInForm((current) => ({ ...current, password: event.target.value }))
                  }
                  placeholder="Enter password"
                  autoComplete="current-password"
                />
              </label>
            </div>
            <label className="signin-remember">
              <input
                type="checkbox"
                checked={signInForm.remember_me}
                onChange={(event) =>
                  setSignInForm((current) => ({ ...current, remember_me: event.target.checked }))
                }
              />
              Keep me signed in on this browser
            </label>
            {signInError && <p className="feedback error" role="alert">{signInError}</p>}
            <div className="action-row">
              <button type="submit" className="primary">Sign in</button>
            </div>
          </form>
        </section>
      </main>
    );
  }

  if (authScreen === "sign-out") {
    return (
      <main className="auth-page">
        <section className="auth-shell">
          <div className="logo">CodeInsights</div>
          <h1>Sign Out</h1>
          <p>Choose whether to close your current platform session.</p>
          <div className="auth-card sign-card">
            <p>
              Signed in as <strong>{sessionUser?.full_name ?? "Unknown user"}</strong>
              {sessionUser?.email ? ` (${sessionUser.email})` : ""}
            </p>
            <div className="action-row">
              <button type="button" className="danger" onClick={confirmSignOut}>
                Confirm sign out
              </button>
              <button type="button" onClick={cancelSignOut}>
                Back to platform
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-page">
      <a className="skip-link" href="#workspace-content">Skip to content</a>
      <header className="topbar">
        <div className="brand-area"><div className="logo">Upcoop</div><span className="brand-caption">CodeInsights</span></div>
        <nav className="main-tabs" aria-label="Main tabs">
          {visibleTabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              className={activeTab === tab.id ? "main-tab active" : "main-tab"}
              aria-current={activeTab === tab.id ? "page" : undefined}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="status-area">
          {sessionUser && (
            <>
              <span className="user-pill" title={sessionUser.email}>
                {sessionUser.full_name} · {sessionUser.access_role}
              </span>
              <button type="button" className="signout-btn" onClick={openSignOutPage}>
                Sign out
              </button>
            </>
          )}
          <span className={`api-pill ${apiStatus}`} role="status" aria-label={`API ${apiStatus}`}>API · {apiStatus}</span>
        </div>
      </header>

      <header className="workspace-header" id="workspace-content" tabIndex={-1}>
        <div className="workspace-heading">
          <h1>{visibleTabs.find((tab) => tab.id === activeTab)?.label}</h1>
          <p>Quality, security and analysis results</p>
        </div>
        <div className="workspace-context">
          <span>{selectedProject || "All projects"}</span>
          {selectedProject && selectedBranch && <code>{selectedBranch}</code>}
        </div>
      </header>

      <section className="global-tools">
        <div className="scope-toggle">
          <button
            type="button"
            aria-pressed={scopeMode === "overall"}
            className={scopeMode === "overall" ? "active" : ""}
            onClick={() => setScopeMode("overall")}
          >
            Overall
          </button>
          <button
            type="button"
            aria-pressed={scopeMode === "new-code"}
            className={scopeMode === "new-code" ? "active" : ""}
            onClick={() => setScopeMode("new-code")}
          >
            New Code
          </button>
        </div>
        <button type="button" onClick={() => void loadDashboard()} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </section>


      {scopeMode === "new-code" && <section className="panel empty-state" role="status"><h2>New Code — Non disponible</h2><p>Le calcul réel nécessite une branche de référence et un diff Git. Aucun résultat ni verdict n’est calculé pour ce périmètre.</p><button type="button" onClick={() => setScopeMode("overall")}>Revenir à Overall</button></section>}
      {loading && <p className="feedback" role="status">Loading analysis data…</p>}
      {error && <p className="feedback error" role="alert">Failed to load data: {error}. Previously loaded results may be out of date.</p>}
      {gateMessage && <p className="feedback" role="status">{gateMessage}</p>}
      {adminMessage && <p className="feedback" role="status">{adminMessage}</p>}

      {activeTab === "projects" && scopeMode === "overall" && (
        <section className="content-grid">
          <aside className="left-filters">
            <h3>Filters</h3>
            <p className="project-count-scope">Latest analysis per project, across branches.</p>
            <p>Projects: {filteredSummaries.length}</p>
            <p>Passed: {filteredSummaries.filter((item) => item.latest.completeness != null && item.latest.completeness !== "legacy_unverified" && item.latest.quality_gate === "pass").length}</p>
            <p>Failed: {filteredSummaries.filter((item) => item.latest.completeness != null && item.latest.completeness !== "legacy_unverified" && item.latest.quality_gate === "fail").length}</p>
            <p>Unknown / historique: {filteredSummaries.filter((item) => item.latest.completeness == null || item.latest.completeness === "legacy_unverified" || item.latest.quality_gate === "unknown").length}</p>
            <div className="action-row">
              <button type="button" onClick={() => { setProjectSearch(""); setSelectedProject(""); setSelectedBranch(""); }}>All projects</button>
              <button type="button" onClick={() => setProjectSearch("api")}>Focus API</button>
            </div>
          </aside>
          <div className="project-list">
            {/* Always visible dropdowns */}
            <div className="project-context-selectors">
              <div style={{ flex: 1 }}>
                <label htmlFor="dashboard-project">PROJECT</label>
                <select
                  id="dashboard-project"
                  aria-label="Project"
              value={selectedProject}
                  onChange={(e) => {
                    setSelectedProject(e.target.value);
                    setSelectedBranch("");
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "4px",
                    border: "1px solid var(--border)",
                    fontSize: "14px",
                    width: "100%",
                    backgroundColor: "var(--bg-lighter)"
                  }}
                >
                  <option value="">-- Select a project --</option>
                  {filteredSummaries.map((summary) => (
                    <option key={summary.projectKey} value={summary.projectKey}>{summary.projectKey}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1 }}>
                <label htmlFor="dashboard-branch">BRANCH</label>
                {selectedProject && selectedSummary ? (() => {
                  const branchMap = new Map<string, AnalysisRecord[]>();
                  for (const analysis of selectedSummary.history) {
                    const branch = analysis.branch || "master";
                    const existing = branchMap.get(branch) ?? [];
                    existing.push(analysis);
                    branchMap.set(branch, existing);
                  }
                  const branches = Array.from(branchMap.keys()).sort();
                  const activeBranch = selectedBranch || (branches.length > 0 ? branches[0] : "");

                  return (
                    <select
                      id="dashboard-branch"
                      value={activeBranch}
                      onChange={(e) => setSelectedBranch(e.target.value)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "4px",
                        border: "1px solid var(--border)",
                        fontSize: "14px",
                        width: "100%",
                        backgroundColor: "var(--bg-lighter)"
                      }}
                    >
                      {branches.map((branch) => (
                        <option key={branch} value={branch}>{branch}</option>
                      ))}
                    </select>
                  );
                })() : (
                  <select
                    id="dashboard-branch"
                    disabled
                    style={{
                      padding: "10px 12px",
                      borderRadius: "4px",
                      border: "1px solid var(--border)",
                      fontSize: "14px",
                      width: "100%",
                      backgroundColor: "var(--bg-light)"
                    }}
                  >
                    <option>Select a project first</option>
                  </select>
                )}
              </div>
            </div>

            {selectedProject && selectedSummary ? (
              <>
                {(() => {
                  const branchMap = new Map<string, AnalysisRecord[]>();
                  for (const analysis of selectedSummary.history) {
                    const branch = analysis.branch || "master";
                    const existing = branchMap.get(branch) ?? [];
                    existing.push(analysis);
                    branchMap.set(branch, existing);
                  }
                  const branches = Array.from(branchMap.entries())
                    .map(([branchName, analyses]) => {
                      const sorted = [...analyses].sort((a, b) =>
                        b.created_at.localeCompare(a.created_at)
                      );
                      return {
                        name: branchName,
                        latest: sorted[0],
                        count: analyses.length
                      };
                    })
                    .sort((a, b) => b.latest.created_at.localeCompare(a.latest.created_at));

                  const activeBranch = selectedBranch || (branches.length > 0 ? branches[0].name : null);
                  const detailedBranch = branches.find((b) => b.name === activeBranch);

                  return branches.length === 0 ? (
                    <p style={{ opacity: 0.7 }}>No branches found for this project</p>
                  ) : (
                    <>
                      {detailedBranch && (
                        <div className="analysis-detail">
                          <h3 style={{ margin: "0 0 16px 0" }}>Metrics for {activeBranch}</h3>
                          <div className="analysis-context">
                            <p><strong>Quality Gate:</strong> <span className={`status-pill ${analysisGateClass(detailedBranch.latest.quality_gate, detailedBranch.latest.completeness)}`}>{analysisGateLabel(detailedBranch.latest.quality_gate, detailedBranch.latest.completeness)}</span></p>
                            <p><strong>Analysis:</strong> {detailedBranch.latest.status}</p>
                            <p><strong>Commit:</strong> <code>{detailedBranch.latest.commit_sha || "Non disponible"}</code></p>
                            <p><strong>Last:</strong> {new Date(detailedBranch.latest.created_at).toLocaleString()}</p>
                          </div>
                          {!!detailedBranch.latest.gate_failures?.length && <div className="feedback error"><strong>Gate failures</strong><ul>{detailedBranch.latest.gate_failures.map((failure, index) => <li key={index}>{failure}</li>)}</ul></div>}
                          <MetricGrid metrics={scopedMetrics(detailedBranch.latest.metrics, scopeMode)} />
                          <AnalysisEvidence analysis={detailedBranch.latest} />
                          <div style={{ marginTop: "16px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={() => void downloadExport(
                                `${API_BASE}/v1/analyses/${detailedBranch.latest.analysis_id}/export/pdf`,
                                `${detailedBranch.latest.project_key}-${detailedBranch.latest.analysis_id}.pdf`
                              )}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: "6px",
                                padding: "8px 16px", backgroundColor: "var(--primary)", color: "var(--bg-lighter)",
                                borderRadius: "6px", fontSize: "13px", fontWeight: "600"
                              }}
                            >
                              ↓ Export PDF
                            </button>
                            <button
                              type="button"
                              onClick={() => void downloadExport(
                                `${API_BASE}/v1/analyses/${detailedBranch.latest.analysis_id}/export/csv`,
                                `${detailedBranch.latest.project_key}-${detailedBranch.latest.analysis_id}.csv`
                              )}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: "6px",
                                padding: "8px 16px", backgroundColor: "var(--bg-lighter)", color: "var(--primary)",
                                border: "1.5px solid var(--primary)", borderRadius: "6px",
                                fontSize: "13px", fontWeight: "600"
                              }}
                            >
                              ↓ Export CSV (latest)
                            </button>
                            <button
                              type="button"
                              onClick={() => void downloadExport(
                                `${API_BASE}/v1/analyses/export/csv?project_key=${encodeURIComponent(selectedProject)}`,
                                `${selectedProject}-history.csv`
                              )}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: "6px",
                                padding: "8px 16px", backgroundColor: "var(--bg-lighter)", color: "var(--text-secondary)",
                                border: "1.5px solid var(--border)", borderRadius: "6px",
                                fontSize: "13px", fontWeight: "600"
                              }}
                            >
                              ↓ Export all history (CSV)
                            </button>
                          </div>
                        </div>
                      )}

                      <h4 style={{ marginTop: "24px", marginBottom: "12px" }}>All branches</h4>
                      {branches.map((branch) => (
                        <article className={`branch-card ${selectedBranch === branch.name ? "selected" : ""}`} key={branch.name}>
                          <div className="analysis-context">
                            <button type="button" aria-pressed={selectedBranch === branch.name} onClick={() => setSelectedBranch(branch.name)}>{branch.name}</button>
                            <span className={`status-pill ${analysisGateClass(branch.latest.quality_gate, branch.latest.completeness)}`}>{analysisGateLabel(branch.latest.quality_gate, branch.latest.completeness)}</span>
                            <span>Analysis: {branch.latest.status}</span>
                            <span>{branch.count} analyses · {new Date(branch.latest.created_at).toLocaleString()}</span>
                            <code>{branch.latest.commit_sha || "Non disponible"}</code>
                          </div>
                          <MetricGrid metrics={scopedMetrics(branch.latest.metrics, scopeMode)} />
                        </article>
                      ))}
                    </>
                  );
                })()}
              </>
            ) : (
              <section className="project-overview">
                <h2>All Projects</h2>
                {!loading && !filteredSummaries.length && <p className="empty-state" role="status">{error ? "Analysis data could not be loaded. Use Refresh to retry." : summaries.length ? "No projects match the current filters." : "No analyses available yet."}</p>}
                <div className="project-overview-grid">
                  {filteredSummaries.map((summary) => (
                    <button key={summary.projectKey} type="button" className="project-overview-card" onClick={() => { setSelectedProject(summary.projectKey); setSelectedBranch(""); }}>
                      <strong>{summary.projectKey}</strong>
                      <span>Analysis history</span>
                      <span className="project-overview-counts"><span>Passed: {summary.passCount}</span><span>Failed: {summary.failCount}</span><span>Unknown: {summary.history.length - summary.passCount - summary.failCount - summary.unverifiedCount}</span><span>Historique: {summary.unverifiedCount}</span></span>
                      <span>Last: {new Date(summary.latest.created_at).toLocaleDateString()}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        </section>
      )}

      {activeTab === "issues" && scopeMode === "overall" && (
        <section className="two-pane-screen issues-screen">
          <p className="hint" style={{ gridColumn: "1 / -1" }}>Issues et Vulnerabilities &amp; IOCs utilisent la même analyse sélectionnée. Les compteurs et la liste ci-dessous portent uniquement sur ses findings détaillés ; un ancien résumé par fichier ne crée aucune issue artificielle.</p>
          {/* ── Project Header ──────────────────────────────── */}
          <div style={{ gridColumn: "1 / -1" }}>
            <ProjectHeader
              selectedSummary={selectedSummary}
              allSummaries={summaries}
              onProjectChange={(projectKey) => {
                setSelectedProject(projectKey);
                setSelectedBranch("");
              }}
              onBranchChange={setSelectedBranch}
              selectedBranch={selectedBranch}
              selectedAnalysisId={selectedAnalysisId}
              onAnalysisChange={setSelectedAnalysisId}
            />
          </div>

          {/* ── Left sidebar filters ──────────────────────────────── */}
          <aside className="issues-sidebar">
            <h3>Filters</h3>

            <div className="issue-filter-group">
              <p className="issue-filter-label">Catégorie</p>
              {(["all", "secret", "dependency", "code", "ioc", "unknown"] as IssueTypeFilter[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={issueTypeFilter === t}
                  className={`issue-filter-btn${issueTypeFilter === t ? " active" : ""}`}
                  onClick={() => setIssueTypeFilter(t)}
                >
                  {t === "all" ? "Toutes" : findingCategoryLabel(t)}
                </button>
              ))}
            </div>

            <div className="issue-filter-group">
              <p className="issue-filter-label">Severity</p>
              {(["all", "blocker", "high", "medium", "low", "info"] as IssueSeverityFilter[]).map((sev) => (
                <button
                  key={sev}
                  type="button"
                  aria-pressed={issueSeverityFilter === sev}
                  className={`issue-filter-btn${issueSeverityFilter === sev ? " active" : ""}`}
                  onClick={() => setIssueSeverityFilter(sev)}
                >
                  {sev === "all" ? "All severities" : sev.charAt(0).toUpperCase() + sev.slice(1)}
                </button>
              ))}
            </div>

            <div className="issue-filter-group">
              <p className="issue-filter-label">Rule</p>
              <input
                aria-label="Filter by rule"
                placeholder="Filter by rule…"
                value={issueRuleFilter}
                onChange={(e) => setIssueRuleFilter(e.target.value)}
              />
            </div>

            <div className="issue-filter-group">
              <p className="issue-filter-label">File</p>
              <input
                aria-label="Filter by file path"
                placeholder="Filter by file path…"
                value={issueFileFilter}
                onChange={(e) => setIssueFileFilter(e.target.value)}
              />
            </div>

            <button
              type="button"
              style={{ marginTop: "0.75rem", width: "100%" }}
              onClick={() => {
                setIssueSeverityFilter("all");
                setIssueTypeFilter("all");
                setIssueRuleFilter("");
                setIssueFileFilter("");
              }}
            >
              Reset filters
            </button>
          </aside>

          {/* ── Right issues list ─────────────────────────────────── */}
          <div className="issues-main">
            <header className="issues-toolbar">
              <h2 style={{ margin: 0 }}>Issues</h2>
              <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: "0.9rem" }}>
                {filteredIssueDetails.length} issue{filteredIssueDetails.length !== 1 ? "s" : ""}
                {allIssueDetails.length > 0 && filteredIssueDetails.length < allIssueDetails.length
                  ? ` (filtered from ${allIssueDetails.length})`
                  : ""}
              </p>
            </header>

            {issuesLoading ? <p className="feedback" role="status">Loading file findings…</p> : issuesError ? <p className="feedback error" role="alert">{issuesError}. Switch project or reopen Issues to retry.</p> : filteredIssueDetails.length === 0 ? (
              <div className="issues-empty">
                {allIssueDetails.length === 0
                  ? "No file findings available in the loaded analyses for this scope."
                  : "No issues match the current filters."}
              </div>
            ) : (
              <div className="issues-list">
                {filteredIssueDetails.map((issue) => {
                  const severityLower = issue.severity.toLowerCase();
                  const sevClass =
                    severityLower === "critical" || severityLower === "error" || severityLower === "blocker"
                      ? "sev-blocker"
                      : severityLower === "high"
                      ? "sev-high"
                      : severityLower === "warning" || severityLower === "medium"
                      ? "sev-medium"
                      : severityLower === "info" || severityLower === "convention"
                      ? "sev-info"
                      : "sev-low";
                  const shortFile = issue.file_path.split("/").slice(-2).join("/");
                  const lineLabel =
                    issue.end_line && issue.end_line !== issue.line
                      ? `L${issue.line}–${issue.end_line}`
                      : `L${issue.line}`;
                  const isExpanded = expandedIssueId === issue.id;

                  return (
                    <article key={issue.id} className={`issue-card ${isExpanded ? "expanded" : ""}`}>
                      <div className="issue-card-header">
                        <div className="issue-card-left">
                          <span className={`sev-badge ${sevClass}`}>{issue.severity}</span>
                        </div>
                        <div className="issue-card-body">
                          <p className="issue-message">{issue.message}</p>
                          <p className="issue-meta">
                            <span className="issue-rule">{findingCategoryLabel(issue.category)} · {issue.tool} · {issue.rule}</span>
                            <span className="issue-sep">·</span>
                            <code>{issue.branch} @ {issue.commit_sha.slice(0, 7) || "Non disponible"}</code>
                            <span className="issue-sep">·</span>
                            {issue.repo_url ? (
                              <a
                                href={buildFileUrl(issue.repo_url, issue.repo_provider, issue.commit_sha, issue.file_path)}
                                target="_blank"
                                rel="noreferrer"
                                className="issue-file-link"
                                title={issue.file_path}
                              >
                                <span className="issue-file">{shortFile}</span>
                                <span className="issue-file-colon">:</span>
                                <span className="issue-line">{lineLabel}</span>
                                <span className="issue-ext-icon">↗</span>
                              </a>
                            ) : (
                              <>
                                <span className="issue-file" title={issue.file_path}>{shortFile}</span>
                                <span className="issue-sep">·</span>
                                <span className="issue-line">{lineLabel}</span>
                              </>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="issue-expand-btn"
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? "Collapse file details" : "Expand file details"}
                          onClick={() => setExpandedIssueId(isExpanded ? null : issue.id)}
                          title={isExpanded ? "Collapse file details" : "Expand file details"}
                        >
                          {isExpanded ? "▾" : "▸"}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="issue-details">
                          <div className="issue-file-header">
                            <strong>File Details:</strong>
                            <code className="file-path">{issue.file_path}</code>
                            <span className="line-info">Lines {issue.line}{issue.end_line ? `-${issue.end_line}` : ""}</span>
                          </div>
                          <div className="issue-code-preview">
                            <pre>
                              <code>
                                {`// File: ${issue.file_path}
// Issue at line ${issue.line}${issue.end_line ? `-${issue.end_line}` : ""}
//
// ${issue.rule}: ${issue.message}
//
// This issue suggests:
${issue.message.split(".").map((s) => `// - ${s.trim()}`).join("\n")}
`}
                              </code>
                            </pre>
                          </div>
                          {issue.repo_url && (
                            <div className="issue-actions">
                              <a
                                href={buildFileUrl(issue.repo_url, issue.repo_provider, issue.commit_sha, issue.file_path)}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-open-repo"
                              >
                                🔗 View in Repository
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === "vulnerabilities" && scopeMode === "overall" && (
        <section className="vulnerabilities-screen">
          <ProjectHeader
            selectedSummary={selectedSummary}
            allSummaries={summaries}
            onProjectChange={(projectKey) => {
              setSelectedProject(projectKey);
              setSelectedBranch("");
            }}
            onBranchChange={setSelectedBranch}
            selectedBranch={selectedBranch}
            selectedAnalysisId={selectedAnalysisId}
            onAnalysisChange={setSelectedAnalysisId}
          />
          {selectedAnalysis ? (
            <VulnerabilitiesTab
              analysisId={selectedAnalysis.analysis_id}
              projectKey={selectedAnalysis.project_key}
              branch={selectedAnalysis.branch}
              commitSha={selectedAnalysis.commit_sha}
              authToken={sessionUser?.token}
              canManage={canAccessAdministration}
            />
          ) : (
            <p className="tab-empty-hint">Select a project, branch and analysis to view vulnerabilities and IOCs.</p>
          )}
        </section>
      )}

      {activeTab === "rules" && (
        <>
        <div className="tab-project-bar">
          <select
            aria-label="Project"
              value={selectedProject}
            onChange={(e) => { setSelectedProject(e.target.value); setSelectedBranch(""); }}
          >
            <option value="">— All projects —</option>
            {summaries.map((s) => (
              <option key={s.projectKey} value={s.projectKey}>{s.projectKey}</option>
            ))}
          </select>
        </div>
        <section className="two-pane-screen">
          <aside className="rules-sidebar">
            <h3>Filters</h3>

            <div className="filter-block">
              <label>Category</label>
              <select aria-label="Category" value={ruleFilterCategory} onChange={(e) => setRuleFilterCategory(e.target.value)}>
                <option value="all">All</option>
                <option value="security">Security</option>
                <option value="reliability">Reliability</option>
                <option value="maintainability">Maintainability</option>
              </select>
            </div>

            <div className="filter-block">
              <label>Severity</label>
              <select aria-label="Severity" value={ruleFilterSeverity} onChange={(e) => setRuleFilterSeverity(e.target.value)}>
                <option value="all">All</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div className="filter-block">
              <label>Status</label>
              <select aria-label="Status" value={ruleFilterStatus} onChange={(e) => setRuleFilterStatus(e.target.value)}>
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="suppressed">Suppressed</option>
              </select>
            </div>

            <div className="filter-block">
              <label>Language</label>
              <select aria-label="Language" value={ruleFilterLanguage} onChange={(e) => setRuleFilterLanguage(e.target.value)}>
                <option value="all">All</option>
                {[...new Set(rules.map((r) => r.language))].sort().map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              style={{ marginTop: "1rem", width: "100%" }}
              onClick={() => {
                setRuleFilterCategory("all");
                setRuleFilterSeverity("all");
                setRuleFilterStatus("all");
                setRuleFilterLanguage("all");
                setRuleSearch("");
              }}
            >
              Reset filters
            </button>
          </aside>

          <div className="rules-main">
            <header className="rules-toolbar">
              <input
                placeholder="Search rules by name or ID…"
                aria-label="Search rules by name or ID"
                value={ruleSearch}
                onChange={(e) => setRuleSearch(e.target.value)}
              />
              <p style={{ marginLeft: "auto", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                {rulesLoading ? "Loading…" : `${filteredRules.length} rule${filteredRules.length !== 1 ? "s" : ""}`}
              </p>
            </header>

            <div className="content-grid">
              <div className="rules-list">
                {rulesLoading && <p style={{ padding: "1rem", color: "var(--text-secondary)" }}>Loading rules…</p>}
                {rulesError && <p className="feedback error" role="alert">{rulesError}. Switch project or reopen Rules to retry.</p>}
                {!rulesLoading && !rulesError && filteredRules.length === 0 && (
                  <p style={{ padding: "1rem", color: "var(--text-secondary)" }}>No rules found.</p>
                )}
                {filteredRules.map((rule) => (
                  <article
                    key={rule.rule_id}
                    className={selectedRule?.rule_id === rule.rule_id ? "rule-card selected" : "rule-card"}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4 style={{ margin: 0, fontSize: "0.9rem", wordBreak: "break-word" }}><button type="button" className="rule-title-button" aria-pressed={selectedRule?.rule_id === rule.rule_id} onClick={() => setSelectedRuleId(rule.rule_id)}>{rule.title}</button></h4>
                      <p style={{ margin: "0.2rem 0 0", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                        {rule.category} · {rule.severity} · {rule.language}
                      </p>
                      <small style={{ color: "var(--text-secondary)" }}>
                        {rule.occurrences} occurrence{rule.occurrences !== 1 ? "s" : ""} in {rule.file_count} file{rule.file_count !== 1 ? "s" : ""}
                      </small>
                    </div>
                    <span className={rule.status === "suppressed" ? "chip chip-suppressed" : "chip chip-active"}>
                      {rule.status === "suppressed" ? "Suppressed" : "Active"}
                    </span>
                  </article>
                ))}
              </div>

              <aside className="panel">
                {selectedRule ? (
                  <>
                    <h3 style={{ wordBreak: "break-word", fontSize: "0.95rem" }}>{selectedRule.title}</h3>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                      {selectedRule.category} · {selectedRule.severity} · {selectedRule.language}
                    </p>
                    <code style={{ fontSize: "0.72rem", wordBreak: "break-all", display: "block", marginTop: "0.5rem", color: "var(--text-secondary)" }}>
                      {selectedRule.rule_id}
                    </code>

                    <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.82rem" }}>
                      <div><strong>{selectedRule.occurrences}</strong> occurrences</div>
                      <div><strong>{selectedRule.file_count}</strong> files affected</div>
                      <div><strong>{selectedRule.project_count}</strong> project{selectedRule.project_count !== 1 ? "s" : ""}:{" "}
                        {selectedRule.projects.join(", ")}
                      </div>
                    </div>

                    {canSuppressRules && (
                    <div className="action-row" style={{ marginTop: "1.25rem" }}>
                      {selectedRule.status === "active" ? (
                        <button
                          type="button"
                          onClick={() => suppressRule(selectedRule.rule_id)}
                          title="Mark as false positive — suppresses this rule globally"
                        >
                          Suppress (false positive)
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => unsuppressRule(selectedRule.rule_id)}
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                    )}
                    <p style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.75rem" }}>
                      {selectedRule.status === "suppressed"
                        ? "This rule is globally suppressed and will not count toward quality scores."
                        : canSuppressRules
                          ? "Suppressing marks all occurrences as false positives across all projects."
                          : "Contact an admin or analyst to suppress this rule."}
                    </p>
                  </>
                ) : (
                  <p style={{ color: "var(--text-secondary)" }}>Select a rule to see details.</p>
                )}
              </aside>
            </div>
          </div>
        </section>
        </>
      )}

      {activeTab === "quality-gates" && (
        <section className="two-pane-screen">
          <aside className="gates-sidebar">
            <div className="gates-head">
              <h3>Quality Gates</h3>
              <button type="button" onClick={createGate} disabled={!canAccessAdministration}>Create</button>
            </div>
            <ul>
              {gateLibrary.map((gateItem) => (
                <li key={gateItem.gate_id} className={selectedGateId === gateItem.gate_id ? "active" : ""}>
                  <button type="button" onClick={() => setSelectedGateId(gateItem.gate_id)}>
                    <span className="gate-name">{gateItem.name}</span>
                    <span className="gate-meta">
                      {gateItem.projectCount} project{gateItem.projectCount !== 1 ? "s" : ""}
                      {gateItem.builtIn && <span className="gate-default-badge">Default</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <div className="gates-main">
            <header className="gates-title-row">
              <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 0 }}>
                <input
                  className="gate-title-input"
                  readOnly={!canAccessAdministration}
                  aria-label="Quality gate name"
                  value={gateForm.name}
                  onChange={(event) => updateGateField("name", event.target.value)}
                  title={canAccessAdministration ? "Click to rename this gate" : "Read-only quality gate"}
                />
                {selectedGate?.builtIn && (
                  <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 7px", borderRadius: "4px", background: "var(--primary)", color: "var(--bg-lighter)", whiteSpace: "nowrap" }}>
                    Default
                  </span>
                )}
              </h2>
              <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                <button type="button" onClick={() => void saveSelectedGate()} disabled={savingGate || !canAccessAdministration || !selectedGate}>
                  {savingGate ? "Saving..." : "Save"}
                </button>
                {selectedGate && !selectedGate.builtIn && (
                  <button type="button" onClick={deleteSelectedGate} disabled={!canAccessAdministration}
                    style={{ background: "transparent", color: "var(--danger)", border: "1px solid currentColor" }}>
                    Delete
                  </button>
                )}
              </div>
            </header>
            <p className="hint">Conditions on Overall Code. {!canAccessAdministration && "Lecture seule : seul un administrateur peut modifier les Quality Gates et leurs affectations."}</p>
            <fieldset className="gate-conditions" disabled={!canAccessAdministration || !selectedGate}>
              <label>
                Min security score
                <input
                  type="number"
                  value={gateForm.min_security_score}
                  onChange={(event) => updateGateField("min_security_score", event.target.value)}
                />
              </label>
              <label>
                Min maintainability score
                <input
                  type="number"
                  value={gateForm.min_maintainability_score}
                  onChange={(event) => updateGateField("min_maintainability_score", event.target.value)}
                />
              </label>
              <label>
                Min reliability score
                <input
                  type="number"
                  value={gateForm.min_reliability_score}
                  onChange={(event) => updateGateField("min_reliability_score", event.target.value)}
                />
              </label>
              <label>
                Max vulnerabilities
                <input
                  type="number"
                  value={gateForm.max_vulnerabilities}
                  onChange={(event) => updateGateField("max_vulnerabilities", event.target.value)}
                />
              </label>
              <label>
                Max security hotspots
                <input
                  type="number"
                  value={gateForm.max_security_hotspots}
                  onChange={(event) => updateGateField("max_security_hotspots", event.target.value)}
                />
              </label>
              <label>
                Max bugs
                <input
                  type="number"
                  value={gateForm.max_bugs}
                  onChange={(event) => updateGateField("max_bugs", event.target.value)}
                />
              </label>
              <label>
                Max code smells
                <input
                  type="number"
                  value={gateForm.max_code_smells}
                  onChange={(event) => updateGateField("max_code_smells", event.target.value)}
                />
              </label>
            </fieldset>

            <h3>Project gate assignments</h3>
            <p className="hint">Change which gate evaluates each project. Unassigned projects use the default gate.</p>
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Project gate assignments">
              <table>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Assigned gate</th>
                    <th>Last result</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((s) => {
                    const assignedId = gateAssignments[s.projectKey] ?? (gateLibrary.find((g) => g.builtIn)?.gate_id ?? "default");
                    const isSaving = savingGateAssignment === s.projectKey;
                    return (
                      <tr key={s.projectKey}>
                        <td>{s.projectKey}</td>
                        <td>
                          <select
                            aria-label={`Assigned gate for ${s.projectKey}`}
                            value={assignedId}
                            disabled={isSaving || !canAccessAdministration}
                            onChange={(e) => assignGate(s.projectKey, e.target.value)}
                            style={{ fontSize: "0.85rem" }}
                          >
                            {gateLibrary.map((g) => (
                              <option key={g.gate_id} value={g.gate_id}>
                                {g.name}{g.builtIn ? " (default)" : ""}
                              </option>
                            ))}
                          </select>
                          {isSaving && <span style={{ marginLeft: "0.4rem", opacity: 0.6 }}>…</span>}
                        </td>
                        <td className={scopeMode === "overall" ? analysisGateClass(s.latest.quality_gate, s.latest.completeness) : "unknown"}>
                          {scopeMode === "overall" ? analysisGateLabel(s.latest.quality_gate, s.latest.completeness) : "Non disponible"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {activeTab === "evolution" && scopeMode === "overall" && (
        <section className="panel">
          <div className="tab-project-bar">
            <select
              aria-label="Project"
              value={selectedProject}
              onChange={(e) => { setSelectedProject(e.target.value); setSelectedBranch(""); }}
            >
              <option value="">— Select project —</option>
              {summaries.map((s) => (
                <option key={s.projectKey} value={s.projectKey}>{s.projectKey}</option>
              ))}
            </select>
            {selectedSummary && (
              <select aria-label="Branch" value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
                {[...new Set(selectedSummary.history.map((a) => a.branch))].map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            )}
          </div>

          {selectedSummary ? (
            <>
              <div style={{ marginBottom: "24px" }}>
                <h2 style={{ margin: "0 0 16px 0" }}>Metrics evolution — {selectedProject} · {selectedBranch || "all branches"}</h2>
              </div>

              {(() => {
                const history = [...selectedProjectAnalyses].sort((a, b) => a.created_at.localeCompare(b.created_at));
                return history.length === 0 ? <p className="empty-state">No analyses available for this branch.</p> : <>
                  <p className="hint">Valeurs publiées par analyse. Les mesures absentes interrompent les courbes ; les tableaux donnent les valeurs exactes.</p>
                  <div className="charts-grid">
                    {METRIC_FIELDS.map(([key, label, unit]) => {
                      const values = history.map(a => a.metrics[key]);
                      const maximum = unit ? 100 : Math.max(1, ...values.filter((v): v is number => typeof v === "number" && Number.isFinite(v)));
                      const points = values.map((value, index) => metricPoint(value, index, values.length, maximum));
                      return <article className="chart-card" key={key}>
                        <h3>{label} trend</h3>
                        <p className="hint">Scale: 0–{maximum}{unit === "%" ? "%" : ""}</p>
                        {points.some(Boolean) ? <svg viewBox="0 0 360 150" className="trend-chart" role="img" aria-label={label + " trend. Exact values in the table below."}>
                          {points.map((point, index) => point && <g key={index}>
                            {index > 0 && points[index - 1] && <line x1={points[index - 1]!.x} y1={points[index - 1]!.y} x2={point.x} y2={point.y} stroke="var(--primary)" strokeWidth="2" />}
                            <circle cx={point.x} cy={point.y} r="3" fill="var(--primary)" />
                          </g>)}
                        </svg> : <p className="empty-state">Non disponible</p>}
                      </article>;
                    })}
                  </div>
                  <div className="table-wrap" tabIndex={0} role="region" aria-label="Evolution values">
                    <table><caption>Metrics by analysis — {selectedProject} · {selectedBranch}</caption>
                      <thead><tr><th scope="col">Date</th><th scope="col">Commit</th><th scope="col">Analysis</th><th scope="col">Quality Gate</th>{METRIC_FIELDS.map(([key, label]) => <th scope="col" key={key}>{label}</th>)}</tr></thead>
                      <tbody>{history.map(analysis => <tr key={analysis.analysis_id}>
                        <th scope="row">{new Date(analysis.created_at).toLocaleString()}</th><td><code>{analysis.commit_sha || "Non disponible"}</code></td><td>{analysis.status}</td><td>{analysisGateLabel(analysis.quality_gate, analysis.completeness)}</td>
                        {METRIC_FIELDS.map(([key, , unit]) => <td key={key}>{formatMetric(analysis.metrics[key], unit)}</td>)}
                      </tr>)}</tbody>
                    </table>
                  </div>
                </>;
              })()}
            </>
          ) : (
            <p>No project selected.</p>
          )}
        </section>
      )}

      {activeTab === "administration" && canAccessAdministration && (
        <section className="admin-screen">
          <div className="admin-top-nav">
            {ADMIN_PRIMARY_TABS.map((tab) => (
              <button
                type="button"
                key={tab.id}
                className={activeAdminTab === tab.id ? "active" : ""}
                onClick={() => {
                  setActiveAdminTab(tab.id);
                  setActiveAdminSection(ADMIN_NAV_BY_TAB[tab.id][0].id);
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="admin-body">
            <aside className="admin-side-menu">
              {ADMIN_NAV_BY_TAB[activeAdminTab].map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={activeAdminSection === item.id ? "active" : ""}
                  onClick={() => setActiveAdminSection(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </aside>

            <section className="admin-content">
              {activeAdminSection === "general-settings" && (
                <>
                  <h2>General Settings</h2>
                  <p>Edit global settings for this Sonar-like instance.</p>
                  <div className="auth-card">
                    <h3>General</h3>
                    <div className="form-grid compact">
                      <label>
                        Instance name
                        <input
                          value={platformSettings.instance_name}
                          onChange={(e) =>
                            setPlatformSettings((current) => ({ ...current, instance_name: e.target.value }))
                          }
                        />
                      </label>
                      <label>
                        Report max size on DB (MB)
                        <input
                          value={platformSettings.report_max_size_mb}
                          onChange={(e) =>
                            setPlatformSettings((current) => ({ ...current, report_max_size_mb: e.target.value }))
                          }
                        />
                      </label>
                    </div>
                    <div className="action-row">
                      <button
                        type="button"
                        disabled={savingPlatformSettings}
                        onClick={() =>
                          void savePlatformSettings(
                            {
                              instance_name: platformSettings.instance_name,
                              report_max_size_mb: platformSettings.report_max_size_mb
                            },
                            "General settings saved."
                          )
                        }
                      >
                        {savingPlatformSettings ? "Saving…" : "Save general settings"}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {activeAdminSection === "analysis-scope" && (
                <>
                  <h2>Analysis Scope</h2>
                  <p>Define global source exclusions and analysis boundaries.</p>
                  <div className="form-grid compact">
                    <label>
                      Global Source File Exclusions
                      <input
                        value={platformSettings.global_source_exclusions}
                        onChange={(e) =>
                          setPlatformSettings((current) => ({ ...current, global_source_exclusions: e.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Source File Exclusions
                      <input
                        value={platformSettings.source_file_exclusions}
                        onChange={(e) =>
                          setPlatformSettings((current) => ({ ...current, source_file_exclusions: e.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <div className="action-row">
                    <button
                      type="button"
                      disabled={savingPlatformSettings}
                      onClick={() =>
                        void savePlatformSettings(
                          {
                            global_source_exclusions: platformSettings.global_source_exclusions,
                            source_file_exclusions: platformSettings.source_file_exclusions
                          },
                          "Scope policy saved."
                        )
                      }
                    >
                      {savingPlatformSettings ? "Saving…" : "Save scope"}
                    </button>
                    <button
                      type="button"
                      disabled={savingPlatformSettings}
                      onClick={() =>
                        void savePlatformSettings(
                          {
                            global_source_exclusions: DEFAULT_PLATFORM_SETTINGS.global_source_exclusions,
                            source_file_exclusions: DEFAULT_PLATFORM_SETTINGS.source_file_exclusions
                          },
                          "Default scope restored."
                        )
                      }
                    >
                      Restore defaults
                    </button>
                  </div>
                </>
              )}

              {activeAdminSection === "data-retention" && (
                <>
                  <h2>Data Retention</h2>
                  <p>Configure automatic cleanup of old analysis data to prevent database growth.</p>

                  <div className="auth-card">
                    <h3>Retention rules</h3>
                    <div className="form-grid compact">
                      <label>
                        Keep completed analyses (days)
                        <input
                          type="number"
                          min="7"
                          max="3650"
                          value={platformSettings.retention_keep_days}
                          onChange={(e) =>
                            setPlatformSettings((s) => ({ ...s, retention_keep_days: e.target.value }))
                          }
                        />
                      </label>
                      <label>
                        Keep failed analyses (days)
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={platformSettings.retention_keep_failed_days}
                          onChange={(e) =>
                            setPlatformSettings((s) => ({ ...s, retention_keep_failed_days: e.target.value }))
                          }
                        />
                      </label>
                      <label>
                        Max analyses kept per branch
                        <input
                          type="number"
                          min="1"
                          max="500"
                          value={platformSettings.retention_max_per_branch}
                          onChange={(e) =>
                            setPlatformSettings((s) => ({ ...s, retention_max_per_branch: e.target.value }))
                          }
                        />
                      </label>
                      <label>
                        Protected branches (never deleted, comma-separated)
                        <input
                          type="text"
                          placeholder="master,main,develop"
                          value={platformSettings.retention_protected_branches}
                          onChange={(e) =>
                            setPlatformSettings((s) => ({ ...s, retention_protected_branches: e.target.value }))
                          }
                        />
                      </label>
                    </div>
                    <div className="form-grid compact" style={{ marginTop: "0.75rem" }}>
                      <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
                        <input
                          type="checkbox"
                          checked={platformSettings.retention_auto_cleanup === "true"}
                          onChange={(e) =>
                            setPlatformSettings((s) => ({
                              ...s,
                              retention_auto_cleanup: e.target.checked ? "true" : "false",
                            }))
                          }
                        />
                        Auto-cleanup on startup (runs at most once per 24 h)
                      </label>
                    </div>
                    <div className="action-row">
                      <button
                        type="button"
                        disabled={savingPlatformSettings}
                        onClick={() =>
                          void savePlatformSettings(
                            {
                              retention_keep_days: platformSettings.retention_keep_days,
                              retention_keep_failed_days: platformSettings.retention_keep_failed_days,
                              retention_max_per_branch: platformSettings.retention_max_per_branch,
                              retention_auto_cleanup: platformSettings.retention_auto_cleanup,
                              retention_protected_branches: platformSettings.retention_protected_branches,
                              audit_log_retention_days: platformSettings.audit_log_retention_days,
                            },
                            "Retention policy saved."
                          )
                        }
                      >
                        {savingPlatformSettings ? "Saving…" : "Save retention policy"}
                      </button>
                    </div>
                  </div>

                  <div className="auth-card" style={{ marginTop: "1.5rem" }}>
                    <h3>Audit log retention</h3>
                    <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
                      Audit entries older than this threshold are deleted during cleanup. Minimum enforced server-side: 30 days.
                    </p>
                    <div className="form-grid compact">
                      <label>
                        Keep audit logs (days)
                        <input
                          type="number"
                          min="30"
                          max="3650"
                          value={platformSettings.audit_log_retention_days}
                          onChange={(e) =>
                            setPlatformSettings((s) => ({ ...s, audit_log_retention_days: e.target.value }))
                          }
                        />
                      </label>
                    </div>
                    <p style={{ fontSize: "0.8rem", opacity: 0.6, marginTop: "0.4rem" }}>
                      Default: 365 days (1 year). Recommended minimum for ISO 27001 / SOC 2: 90 days.
                    </p>
                  </div>

                  <div className="auth-card" style={{ marginTop: "1.5rem" }}>
                    <h3>Manual cleanup</h3>
                    {cleanupStatus?.last_cleanup_at ? (
                      <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1rem" }}>
                        Last cleanup: {new Date(cleanupStatus.last_cleanup_at).toLocaleString()} —{" "}
                        {cleanupStatus.last_cleanup_deleted} analyses deleted
                      </p>
                    ) : (
                      <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1rem" }}>
                        No cleanup has run yet.
                      </p>
                    )}
                    <div className="action-row">
                      <button
                        type="button"
                        disabled={runningCleanup}
                        onClick={() => {
                          setRunningCleanup(true);
                          apiFetch(`${API_BASE}/v1/platform/cleanup`, { method: "POST" })
                            .then((r) => r.json())
                            .then((result: { deleted_analyses: number; cleanup_at: string }) => {
                              setCleanupStatus({
                                last_cleanup_at: result.cleanup_at,
                                last_cleanup_deleted: result.deleted_analyses,
                              });
                              setAdminMessage(`Cleanup done: ${result.deleted_analyses} analyses deleted.`);
                            })
                            .catch(() => setAdminMessage("Cleanup failed."))
                            .finally(() => setRunningCleanup(false));
                        }}
                      >
                        {runningCleanup ? "Running…" : "Run cleanup now"}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {activeAdminSection === "access-management" && (
                <>
                  <h2>Authentication</h2>
                  <p>Delegate authentication and access control to SAML and DevOps providers.</p>
                  <div className="auth-tags">
                    {authProviders.map((provider) => (
                      <button
                        key={provider.provider_id}
                        type="button"
                        className={authForm.provider_id === provider.provider_id ? "active" : ""}
                        onClick={() => setAuthForm({
                          provider_id: provider.provider_id,
                          connection_url: provider.connection_url,
                          tenant_id: provider.config?.tenant_id ?? "",
                          client_id: provider.config?.client_id ?? "",
                          client_secret: "",
                          redirect_uri: provider.config?.redirect_uri ?? "",
                          scopes: provider.config?.scopes ?? "openid profile email",
                        })}
                      >
                        {provider.display_name}
                      </button>
                    ))}
                  </div>
                  <div className="auth-card">
                    <h3>{selectedAuthProvider?.display_name ?? "Provider"}</h3>
                    <p>
                      Status: {selectedAuthProvider?.status ?? "unknown"} • {selectedAuthProvider?.enabled ? "enabled" : "disabled"}
                    </p>
                    <div className="form-grid compact">
                      <label>
                        Connection URL
                        <input
                          value={authForm.connection_url}
                          onChange={(event) =>
                            setAuthForm((current) => ({
                              ...current,
                              connection_url: event.target.value
                            }))
                          }
                          placeholder="https://github.com or https://dev.azure.com/..."
                        />
                      </label>
                      {authForm.provider_id === "azure-ad" && (
                        <>
                          <label>
                            Tenant ID
                            <input
                              value={authForm.tenant_id}
                              onChange={(e) => setAuthForm((c) => ({ ...c, tenant_id: e.target.value }))}
                              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                            />
                          </label>
                          <label>
                            Client ID (App Registration)
                            <input
                              value={authForm.client_id}
                              onChange={(e) => setAuthForm((c) => ({ ...c, client_id: e.target.value }))}
                              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                            />
                          </label>
                          <label>
                            Client Secret
                            <input
                              type="password"
                              value={authForm.client_secret}
                              onChange={(e) => setAuthForm((c) => ({ ...c, client_secret: e.target.value }))}
                              placeholder={
                                selectedAuthProvider?.config?.client_secret_configured
                                  ? "••••••• (configured — leave blank to keep)"
                                  : "Paste client secret value"
                              }
                            />
                          </label>
                          <label>
                            Redirect URI
                            <input
                              value={authForm.redirect_uri}
                              onChange={(e) => setAuthForm((c) => ({ ...c, redirect_uri: e.target.value }))}
                              placeholder="https://your-platform.azurewebsites.net/auth/callback"
                            />
                          </label>
                          <label>
                            Scopes (space-separated)
                            <input
                              value={authForm.scopes}
                              onChange={(e) => setAuthForm((c) => ({ ...c, scopes: e.target.value }))}
                              placeholder="openid profile email"
                            />
                          </label>
                        </>
                      )}
                    </div>
                    <div className="action-row">
                      <button type="button" onClick={() => void testAuthProvider()} disabled={testingAuthProvider}>
                        {testingAuthProvider ? "Testing..." : "Test configuration"}
                      </button>
                      <button type="button" onClick={() => void saveAuthProvider()} disabled={savingAuthProvider}>
                        {savingAuthProvider ? "Saving..." : "Save"}
                      </button>
                      <button type="button" className="danger" onClick={() => void disableAuthProvider()} disabled={savingAuthProvider}>
                        Disable
                      </button>
                    </div>
                  </div>

                  <div className="iam-summary-row">
                    <div className="iam-summary-card">
                      <strong>{platformUsers.length}</strong>
                      <span>Platform users</span>
                    </div>
                    <div className="iam-summary-card">
                      <strong>{activeLocalUsers}</strong>
                      <span>Active users</span>
                    </div>
                  </div>

                  <div className="iam-grid">
                    <div className="auth-card iam-card">
                      <h3>Local Users</h3>
                      <p>Manage local identities, user type, and access role.</p>
                      <div className="form-grid compact">
                        <label>
                          Full name
                          <input
                            value={newLocalUser.full_name}
                            onChange={(event) =>
                              setNewLocalUser((current) => ({ ...current, full_name: event.target.value }))
                            }
                            placeholder="Jane Doe"
                          />
                        </label>
                        <label>
                          Email
                          <input
                            value={newLocalUser.email}
                            onChange={(event) =>
                              setNewLocalUser((current) => ({ ...current, email: event.target.value }))
                            }
                            placeholder="jane.doe@upcoop.local"
                          />
                        </label>
                        <label>
                          Password
                          <input
                            type="password"
                            value={newLocalUser.password}
                            onChange={(event) =>
                              setNewLocalUser((current) => ({ ...current, password: event.target.value }))
                            }
                            placeholder="At least 8 characters"
                          />
                        </label>
                        <label>
                          User type
                          <select
                            value={newLocalUser.user_type}
                            onChange={(event) =>
                              setNewLocalUser((current) => ({
                                ...current,
                                user_type: event.target.value as LocalUserType
                              }))
                            }
                          >
                            <option value="internal">Internal</option>
                            <option value="contractor">Contractor</option>
                            <option value="service-account">Service account</option>
                            <option value="auditor">Auditor</option>
                          </select>
                        </label>
                        <label>
                          Access role
                          <select
                            value={newLocalUser.access_role}
                            onChange={(event) =>
                              setNewLocalUser((current) => ({
                                ...current,
                                access_role: event.target.value as LocalUserRole
                              }))
                            }
                          >
                            <option value="admin">Admin</option>
                            <option value="regular">Regular user</option>
                            <option value="default">Default user</option>
                          </select>
                        </label>
                      </div>
                      <div className="action-row">
                        <button type="button" onClick={addLocalUser}>Add local user</button>
                      </div>

                      <div className="form-grid compact" style={{ marginTop: "0.75rem" }}>
                        <label>
                          User to update
                          <select
                            value={passwordForm.user_id}
                            onChange={(event) =>
                              setPasswordForm((current) => ({ ...current, user_id: event.target.value }))
                            }
                          >
                            <option value="">Select user</option>
                            {platformUsers.filter((u) => u.auth_provider === "local").map((user) => (
                              <option key={user.user_id} value={user.user_id}>
                                {user.full_name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          New password
                          <input
                            type="password"
                            value={passwordForm.password}
                            onChange={(event) =>
                              setPasswordForm((current) => ({ ...current, password: event.target.value }))
                            }
                            placeholder="Set or reset password"
                          />
                        </label>
                      </div>
                      <div className="action-row">
                        <button type="button" onClick={updateUserPassword}>Set/Reset password</button>
                      </div>

                      <div className="table-wrap">
                        {usersLoading && <p style={{ padding: "0.5rem", color: "var(--text-secondary)" }}>Loading users…</p>}
                        <table>
                          <thead>
                            <tr>
                              <th>User</th>
                              <th>Provider</th>
                              <th>Role</th>
                              <th>Status</th>
                              <th>Last login</th>
                              <th>Explicit access</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {platformUsers.map((user) => (
                              <tr key={user.user_id}>
                                <td>
                                  <strong>{user.full_name}</strong>
                                  <div className="iam-subtext">{user.email}</div>
                                </td>
                                <td>
                                  <span className="iam-chip type">{user.auth_provider}</span>
                                </td>
                                <td>
                                  <span className={`iam-chip role ${user.role}`}>{user.role}</span>
                                </td>
                                <td>
                                  <span className={`iam-chip status ${user.is_active ? "active" : "disabled"}`}>
                                    {user.is_active ? "active" : "disabled"}
                                  </span>
                                </td>
                                <td style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                                  {user.last_login_at
                                    ? new Date(user.last_login_at).toLocaleDateString()
                                    : "—"}
                                </td>
                                <td>
                                  <div className="iam-subtext">
                                    {user.role === "admin"
                                      ? "All projects (administrator)"
                                      : user.grants.length > 0
                                        ? user.grants.map((grant) => `${grant.scope_type}: ${grant.scope_id}`).join(" · ")
                                        : "No project access"}
                                  </div>
                                </td>
                                <td>
                                  <div className="iam-inline-actions">
                                    <button type="button" onClick={() => editUserGrants(user.user_id)}>Edit access</button>
                                    <button type="button" onClick={() => setUserRole(user.user_id, "admin")}>Admin</button>
                                    <button type="button" onClick={() => setUserRole(user.user_id, "regular")}>Regular</button>
                                    <button type="button" onClick={() => setUserRole(user.user_id, "default")}>Default</button>
                                    <button type="button" onClick={() => toggleUserStatus(user.user_id)}>
                                      {user.is_active ? "Disable" : "Enable"}
                                    </button>
                                    <button type="button" className="danger" onClick={() => removeLocalUser(user.user_id)}>
                                      Remove
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="auth-card iam-card">
                      <h3>Explicit organization and project access</h3>
                      <p>An organization grant includes its projects. A project grant is limited to that project. An empty selection leaves a non-administrator without project access.</p>
                      <div className="form-grid compact">
                        <label>
                          User
                          <select value={grantForm.user_id} onChange={(event) => editUserGrants(event.target.value)}>
                            <option value="">Select user</option>
                            {platformUsers.map((user) => (
                              <option key={user.user_id} value={user.user_id}>{user.full_name} · {user.email}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Organizations
                          <select
                            multiple
                            size={Math.min(6, Math.max(2, organizationCatalog.length))}
                            value={grantForm.organization_ids}
                            disabled={!grantForm.user_id || accessCatalogLoading}
                            onChange={(event) => setGrantForm((current) => ({
                              ...current,
                              organization_ids: Array.from(event.currentTarget.selectedOptions, (option) => option.value)
                            }))}
                          >
                            {organizationCatalog.map((organization) => (
                              <option key={organization.id} value={organization.id}>{organization.name} ({organization.key})</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Individual projects
                          <select
                            multiple
                            size={Math.min(8, Math.max(3, projectCatalog.length))}
                            value={grantForm.project_keys}
                            disabled={!grantForm.user_id || accessCatalogLoading}
                            onChange={(event) => setGrantForm((current) => ({
                              ...current,
                              project_keys: Array.from(event.currentTarget.selectedOptions, (option) => option.value)
                            }))}
                          >
                            {projectCatalog.map((project) => (
                              <option key={project.id} value={project.key}>{project.name} ({project.key})</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <p className="hint">Use Ctrl or Cmd to select several entries.</p>
                      <div className="action-row">
                        <button type="button" onClick={() => void saveUserGrants()} disabled={!grantForm.user_id || savingGrants || accessCatalogLoading}>
                          {savingGrants ? "Saving..." : "Save explicit access"}
                        </button>
                      </div>
                    </div>

                    <div className="auth-card iam-card">
                      <h3>Access Management Matrix</h3>
                      <p>Standard role capabilities for admin, regular user, and default user.</p>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Role</th>
                              <th>Permissions</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td><span className="iam-chip role admin">admin</span></td>
                              <td>{roleCapabilities.admin}</td>
                            </tr>
                            <tr>
                              <td><span className="iam-chip role regular">regular</span></td>
                              <td>{roleCapabilities.regular}</td>
                            </tr>
                            <tr>
                              <td><span className="iam-chip role default">default</span></td>
                              <td>{roleCapabilities.default}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeAdminSection === "pat-management" && (
                <>
                  <h2>PAT Management</h2>
                  <p>
                    Used by Azure Pipelines or GitHub Actions to authenticate against this platform.
                    {platformTokenConfigured === true && " A token is currently active."}
                    {platformTokenConfigured === false && " No token configured — generate one to enable CI authentication."}
                  </p>

                  <div className="auth-card">
                    <div className="form-grid compact">
                      <label>
                        Token name
                        <input
                          value={platformTokenName}
                          onChange={(event) => setPlatformTokenName(event.target.value)}
                          placeholder="Azure DevOps CI token"
                        />
                      </label>
                      <label>
                        Expiration (days)
                        <input
                          type="number"
                          min={1}
                          max={3650}
                          value={platformTokenTtlDays}
                          onChange={(event) => {
                            const parsed = Number(event.target.value);
                            setPlatformTokenTtlDays(Number.isFinite(parsed) ? parsed : DEFAULT_TOKEN_TTL_DAYS);
                          }}
                        />
                      </label>
                      <label>
                        Authorized projects (required)
                        <select
                          multiple
                          size={Math.min(8, Math.max(3, projectCatalog.length))}
                          value={platformTokenProjectKeys}
                          disabled={accessCatalogLoading}
                          onChange={(event) => setPlatformTokenProjectKeys(Array.from(event.currentTarget.selectedOptions, (option) => option.value))}
                        >
                          {projectCatalog.map((project) => (
                            <option key={project.id} value={project.key}>{project.name} ({project.key})</option>
                          ))}
                        </select>
                      </label>
                      <div>
                        <span className="issue-filter-label">Fixed scopes</span>
                        <p className="scope-note"><code>{CI_TOKEN_SCOPES.join(" · ")}</code></p>
                      </div>
                      {platformTokenConfigured && (
                        <label>
                          Current token (requis pour rotation)
                          <input
                            type="password"
                            value={platformTokenInput}
                            onChange={(event) => setPlatformTokenInput(event.target.value)}
                            placeholder="Coller le token actuel pour rotation sécurisée"
                            autoComplete="off"
                          />
                        </label>
                      )}
                    </div>

                    {platformTokenExpiresAt && (
                      <p style={{ fontSize: "0.85rem", color: platformTokenExpired ? "var(--danger)" : "var(--text-secondary)", margin: "0.5rem 0 0" }}>
                        {platformTokenExpired ? "⚠ Expiré le" : "Expire le"} {new Date(platformTokenExpiresAt).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div className="action-row">
                    <button
                      type="button"
                      onClick={() => void generatePlatformToken("new")}
                      disabled={generatingPlatformToken || platformTokenProjectKeys.length === 0 || accessCatalogLoading}
                    >
                      {generatingPlatformToken ? "Generating..." : "New token"}
                    </button>
                    {platformTokenConfigured && (
                      <button
                        type="button"
                        onClick={() => void generatePlatformToken("rotate")}
                        disabled={generatingPlatformToken || platformTokenProjectKeys.length === 0 || accessCatalogLoading}
                      >
                        {generatingPlatformToken ? "Rotating..." : "Rotate token"}
                      </button>
                    )}
                  </div>

                  {platformTokenError && (
                    <p style={{ color: "var(--danger)", marginTop: "0.75rem" }}>
                      {platformTokenError}
                    </p>
                  )}

                  {generatedPlatformToken && (
                    <div className="auth-card" style={{ marginTop: "1rem", background: "var(--bg-light)" }}>
                      <h4 style={{ marginBottom: "0.5rem" }}>Token generated — copy it now, it won't be shown again</h4>
                      <code style={{
                        display: "block",
                        padding: "0.75rem",
                        background: "var(--bg-lighter)",
                        borderRadius: "4px",
                        wordBreak: "break-all",
                        fontSize: "0.85rem",
                        letterSpacing: "0.04em"
                      }}>
                        {generatedPlatformToken}
                      </code>
                      <p style={{ marginTop: "0.75rem", fontSize: "0.85rem", opacity: 0.7 }}>
                        Set <strong>PLATFORM_API_TOKEN</strong> to this value in your Azure DevOps pipeline variables (as a secret).
                      </p>
                    </div>
                  )}

                  <div className="auth-card" style={{ marginTop: "1rem" }}>
                    <h4 style={{ marginBottom: "0.75rem" }}>Token history</h4>
                    {platformTokenHistory.length === 0 ? (
                      <p style={{ margin: 0, opacity: 0.7 }}>No tokens generated yet.</p>
                    ) : (
                      <div className="token-history-list">
                        {platformTokenHistory.map((item) => (
                          <article key={item.token_id} className="token-history-item">
                            <div>
                              <strong>{item.token_name}</strong>
                              <p>
                                Preview: {item.token_preview}
                                {item.is_current ? " • current" : ""}
                                {item.revoked ? " • revoked" : ""}
                              </p>
                              <p>Projects: {item.project_keys.length > 0 ? item.project_keys.join(", ") : "None"}</p>
                              <p>Scopes: {item.scopes.length > 0 ? item.scopes.join(", ") : "None"}</p>
                            </div>
                            <div>
                              <p>Created: {new Date(item.created_at).toLocaleString()}</p>
                              <p>Expires: {item.expires_at ? new Date(item.expires_at).toLocaleString() : "Never"}</p>
                              {!item.revoked && (
                                <button type="button" className="danger" onClick={() => void revokePlatformToken(item.token_id)} disabled={revokingPlatformTokenId === item.token_id}>
                                  {revokingPlatformTokenId === item.token_id ? "Revoking..." : "Revoke"}
                                </button>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {activeAdminSection === "audit-log" && (
                <>
                  <h2>Audit Log</h2>
                  <p>Immutable trace of every security-relevant action — role changes, rule suppressions, token rotations, settings updates.</p>

                  <div className="auth-card" style={{ marginBottom: "1rem" }}>
                    <div className="form-grid compact" style={{ alignItems: "flex-end" }}>
                      <label>
                        Filter by action
                        <select
                          value={auditLogActionFilter}
                          onChange={(e) => setAuditLogActionFilter(e.target.value)}
                        >
                          <option value="">All actions</option>
                          <option value="user.login">user.login</option>
                          <option value="user.login.sso">user.login.sso</option>
                          <option value="user.login.sso.first">user.login.sso.first (first SSO)</option>
                          <option value="user.create">user.create</option>
                          <option value="user.delete">user.delete</option>
                          <option value="user.role.change">user.role.change</option>
                          <option value="user.status.change">user.status.change</option>
                          <option value="user.grants.replace">user.grants.replace</option>
                          <option value="user.password.reset">user.password.reset</option>
                          <option value="rule.suppress">rule.suppress</option>
                          <option value="rule.unsuppress">rule.unsuppress</option>
                          <option value="token.generate">token.generate</option>
                          <option value="token.revoke">token.revoke</option>
                          <option value="settings.update">settings.update</option>
                          <option value="data.cleanup">data.cleanup</option>
                        </select>
                      </label>
                      <label>
                        Filter by actor
                        <input
                          placeholder="email..."
                          value={auditLogActorFilter}
                          onChange={(e) => setAuditLogActorFilter(e.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => loadAuditLogs(0, auditLogActionFilter, auditLogActorFilter)}
                        disabled={auditLogLoading}
                      >
                        {auditLogLoading ? "Loading..." : "Apply"}
                      </button>
                    </div>
                  </div>

                  <div className="auth-card" style={{ padding: 0, overflow: "hidden" }}>
                    {auditLogs.length === 0 && !auditLogLoading ? (
                      <p style={{ padding: "1.5rem", margin: 0, opacity: 0.7, textAlign: "center" }}>
                        No audit events yet — actions will appear here as users interact with the platform.
                      </p>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface2, rgba(0,0,0,0.05))" }}>
                              <th style={{ padding: "0.6rem 0.8rem", textAlign: "left", whiteSpace: "nowrap" }}>Date</th>
                              <th style={{ padding: "0.6rem 0.8rem", textAlign: "left" }}>Actor</th>
                              <th style={{ padding: "0.6rem 0.8rem", textAlign: "left" }}>Role</th>
                              <th style={{ padding: "0.6rem 0.8rem", textAlign: "left" }}>Action</th>
                              <th style={{ padding: "0.6rem 0.8rem", textAlign: "left" }}>Resource</th>
                              <th style={{ padding: "0.6rem 0.8rem", textAlign: "left" }}>Details</th>
                            </tr>
                          </thead>
                          <tbody>
                            {auditLogs.map((entry) => (
                              <tr key={entry.id} style={{ borderBottom: "1px solid var(--border)" }}>
                                <td style={{ padding: "0.5rem 0.8rem", whiteSpace: "nowrap", opacity: 0.75 }}>
                                  {new Date(entry.created_at).toLocaleString()}
                                </td>
                                <td style={{ padding: "0.5rem 0.8rem", fontFamily: "monospace" }}>
                                  {entry.actor_email}
                                </td>
                                <td style={{ padding: "0.5rem 0.8rem" }}>
                                  <span style={{
                                    padding: "0.1rem 0.4rem",
                                    borderRadius: "3px",
                                    fontSize: "0.75rem",
                                    fontWeight: 600,
                                    background: entry.actor_role === "admin" ? "var(--danger-light)" : "var(--warning-light)",
                                    color: entry.actor_role === "admin" ? "var(--danger)" : "var(--warning)",
                                  }}>
                                    {entry.actor_role}
                                  </span>
                                </td>
                                <td style={{ padding: "0.5rem 0.8rem", fontFamily: "monospace", fontWeight: 600 }}>
                                  {entry.action}
                                </td>
                                <td style={{ padding: "0.5rem 0.8rem", opacity: 0.85 }}>
                                  {entry.resource_label ?? entry.resource_id ?? entry.resource_type}
                                </td>
                                <td style={{ padding: "0.5rem 0.8rem", opacity: 0.7, maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {entry.details ? JSON.stringify(entry.details) : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {auditLogs.length < auditLogTotal && (
                      <div style={{ padding: "0.75rem", textAlign: "center", borderTop: "1px solid var(--border)" }}>
                        <button
                          type="button"
                          onClick={() => loadAuditLogs(auditLogOffset + 50, auditLogActionFilter, auditLogActorFilter)}
                          disabled={auditLogLoading}
                          style={{ fontSize: "0.85rem" }}
                        >
                          {auditLogLoading ? "Loading..." : `Load more (${auditLogs.length} / ${auditLogTotal})`}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}

              {activeAdminSection === "notifications" && (
                <>
                  <h2>Notifications</h2>
                  <p>Send alerts when a quality gate fails (or recovers). Supports generic webhooks (Teams, Slack, Power Automate…) and SMTP email.</p>

                  {notifMessage && (
                    <p style={{ padding: "0.6rem 0.8rem", borderRadius: "4px", marginBottom: "1rem",
                      background: notifMessage.toLowerCase().includes("fail") || notifMessage.toLowerCase().includes("error")
                        ? "var(--danger-light)" : "var(--success-light)",
                      color: notifMessage.toLowerCase().includes("fail") || notifMessage.toLowerCase().includes("error")
                        ? "var(--danger)" : "var(--success)" }}>
                      {notifMessage}
                    </p>
                  )}

                  <div className="action-row" style={{ marginBottom: "1rem" }}>
                    <button type="button" onClick={() => { setShowNotifForm((v) => !v); setNotifMessage(null); }}>
                      {showNotifForm ? "Cancel" : "+ Add channel"}
                    </button>
                  </div>

                  {showNotifForm && (
                    <div className="auth-card" style={{ marginBottom: "1.5rem" }}>
                      <h4 style={{ marginBottom: "1rem" }}>New notification channel</h4>
                      <div className="form-grid compact">
                        <label>Name<input value={notifForm.name} onChange={(e) => setNotifForm((f) => ({ ...f, name: e.target.value }))} placeholder="My Teams webhook" /></label>
                        <label>
                          Type
                          <select value={notifForm.channel_type} onChange={(e) => setNotifForm((f) => ({ ...f, channel_type: e.target.value as "webhook" | "email" }))}>
                            <option value="webhook">Webhook (Teams / Slack / generic HTTP POST)</option>
                            <option value="email">Email (SMTP)</option>
                          </select>
                        </label>
                      </div>

                      {notifForm.channel_type === "webhook" ? (
                        <div className="form-grid compact" style={{ marginTop: "0.75rem" }}>
                          <label>Webhook URL<input value={notifForm.url} onChange={(e) => setNotifForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://outlook.office.com/webhook/..." /></label>
                        </div>
                      ) : (
                        <div className="form-grid compact" style={{ marginTop: "0.75rem" }}>
                          <label>To (recipient email)<input value={notifForm.to_email} onChange={(e) => setNotifForm((f) => ({ ...f, to_email: e.target.value }))} placeholder="devops-team@company.com" /></label>
                          <label>SMTP host<input value={notifForm.smtp_host} onChange={(e) => setNotifForm((f) => ({ ...f, smtp_host: e.target.value }))} placeholder="smtp.office365.com" /></label>
                          <label>SMTP port<input type="number" value={notifForm.smtp_port} onChange={(e) => setNotifForm((f) => ({ ...f, smtp_port: e.target.value }))} /></label>
                          <label>SMTP user<input value={notifForm.smtp_user} onChange={(e) => setNotifForm((f) => ({ ...f, smtp_user: e.target.value }))} placeholder="noreply@company.com" /></label>
                          <label>SMTP password<input type="password" autoComplete="new-password" value={notifForm.smtp_password} onChange={(e) => setNotifForm((f) => ({ ...f, smtp_password: e.target.value }))} /></label>
                          <label>From address<input value={notifForm.smtp_from} onChange={(e) => setNotifForm((f) => ({ ...f, smtp_from: e.target.value }))} placeholder="sast-platform@company.com" /></label>
                        </div>
                      )}

                      <div className="form-grid compact" style={{ marginTop: "0.75rem" }}>
                        <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
                          <input type="checkbox" checked={notifForm.on_fail} onChange={(e) => setNotifForm((f) => ({ ...f, on_fail: e.target.checked }))} />
                          Notify when quality gate <strong>fails</strong>
                        </label>
                        <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
                          <input type="checkbox" checked={notifForm.on_pass} onChange={(e) => setNotifForm((f) => ({ ...f, on_pass: e.target.checked }))} />
                          Notify when quality gate <strong>passes</strong> (recovery alert)
                        </label>
                      </div>

                      <div className="action-row" style={{ marginTop: "1rem" }}>
                        <button type="button" onClick={saveNotifChannel}>Save channel</button>
                      </div>
                    </div>
                  )}

                  {notifLoading && <p style={{ opacity: 0.6 }}>Loading…</p>}

                  {!notifLoading && notifChannels.length === 0 && !showNotifForm && (
                    <div className="auth-card" style={{ textAlign: "center", padding: "2rem", opacity: 0.7 }}>
                      No notification channels configured yet. Add one above to start receiving alerts.
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {notifChannels.map((ch) => (
                      <div key={ch.id} className="auth-card" style={{ display: "flex", alignItems: "center", gap: "1rem", opacity: ch.enabled ? 1 : 0.55 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                            <strong>{ch.name}</strong>
                            <span style={{ fontSize: "0.75rem", padding: "0.1rem 0.4rem", borderRadius: "3px",
                              background: ch.channel_type === "webhook" ? "var(--warning-light)" : "var(--primary-light)",
                              color: ch.channel_type === "webhook" ? "var(--warning)" : "var(--primary)" }}>
                              {ch.channel_type}
                            </span>
                            {!ch.enabled && <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>disabled</span>}
                          </div>
                          <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>
                            {ch.on_fail && <span style={{ marginRight: "0.5rem" }}>🔴 on fail</span>}
                            {ch.on_pass && <span>🟢 on pass</span>}
                            {ch.channel_type === "webhook" && ch.config.url && (
                              <span style={{ marginLeft: "0.5rem", fontFamily: "monospace" }}>
                                {String(ch.config.url).slice(0, 60)}{String(ch.config.url).length > 60 ? "…" : ""}
                              </span>
                            )}
                            {ch.channel_type === "email" && ch.config.to_email && (
                              <span style={{ marginLeft: "0.5rem" }}>{String(ch.config.to_email)}</span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                          <button type="button" style={{ fontSize: "0.8rem" }}
                            onClick={() => toggleNotifChannel(ch.id, !ch.enabled)}>
                            {ch.enabled ? "Disable" : "Enable"}
                          </button>
                          <button type="button" style={{ fontSize: "0.8rem" }}
                            disabled={notifTestingId === ch.id}
                            onClick={() => testNotifChannel(ch.id)}>
                            {notifTestingId === ch.id ? "Testing…" : "Test"}
                          </button>
                          <button type="button" style={{ fontSize: "0.8rem", color: "var(--danger)" }}
                            onClick={() => { if (window.confirm(`Delete "${ch.name}"?`)) deleteNotifChannel(ch.id); }}>
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {activeAdminSection === "devops-integrations" && (
                <>
                  <h2>DevOps Platform Integrations</h2>
                  <p>Connect your platform to Azure DevOps at organization level, just like Sonar.</p>
                  <div className="auth-card" style={{ marginTop: "1rem" }}>
                    <p style={{ margin: 0, opacity: 0.85 }}>
                      <strong>Important:</strong> this integration enables ALM features in the platform (for example PR decoration,
                      repository import, and quality-gate feedback in Azure DevOps).
                    </p>
                    <p style={{ margin: "0.5rem 0 0", opacity: 0.75 }}>
                      Pipeline authentication is separate and must be configured in your CI service connection or pipeline secrets to
                      send analysis results.
                    </p>
                  </div>

                  <div className="devops-provider-tabs">
                    {[
                      ["github", "GitHub"],
                      ["bitbucket", "Bitbucket"],
                      ["azure-devops", "Azure DevOps"],
                      ["gitlab", "GitLab"]
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={devOpsProviderTab === id ? "active" : ""}
                        onClick={() => setDevOpsProviderTab(id as DevOpsProviderTab)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {devOpsProviderTab !== "azure-devops" ? (
                    <div className="auth-card" style={{ marginTop: "1rem" }}>
                      <p style={{ margin: 0, opacity: 0.75 }}>
                        {devOpsProviderTab} configuration UI is not implemented yet. Use Azure DevOps to connect your organization for now.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="action-row" style={{ marginTop: "1rem" }}>
                        <button type="button" onClick={openCreateAzureDevOpsConfigModal}>
                          Create configuration
                        </button>
                      </div>

                      <div className="azure-devops-config-list">
                        {azureDevOpsConfigs.length === 0 ? (
                          <div className="auth-card" style={{ marginTop: "1rem" }}>
                            <p style={{ margin: 0, opacity: 0.75 }}>
                              No Azure DevOps organization configured yet.
                            </p>
                          </div>
                        ) : (
                          azureDevOpsConfigs.map((config) => (
                            <article key={config.config_id} className="azure-devops-config-card">
                              <div className="azure-devops-config-header">
                                <div>
                                  <h3>{config.config_name}</h3>
                                  <p>{config.organization_url}</p>
                                </div>
                                <div className="action-row">
                                  <button type="button" onClick={() => openEditAzureDevOpsConfigModal(config)}>
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="danger"
                                    onClick={() => void deleteAzureDevOpsConfig(config)}
                                    disabled={deletingAzureDevOpsConfigId === config.config_id}
                                  >
                                    {deletingAzureDevOpsConfigId === config.config_id ? "Deleting..." : "Delete"}
                                  </button>
                                </div>
                              </div>

                              <div className="azure-devops-config-capabilities">
                                <p className={config.quality_gate_enabled ? "integration-check ok" : "integration-check ko"}>
                                  <span aria-hidden="true" />
                                  Quality Gate status reporting
                                </p>
                                <p className={config.repo_import_enabled ? "integration-check ok" : "integration-check ko"}>
                                  <span aria-hidden="true" />
                                  Import repositories from your DevOps Platform
                                </p>
                                <p className={config.pat_configured ? "integration-check ok" : "integration-check ko"}>
                                  <span aria-hidden="true" />
                                  Personal Access Token configured
                                </p>
                              </div>

                              <div className="azure-devops-config-meta">
                                <p>Status: <strong>{config.status}</strong></p>
                                <p>Last checked: {config.last_tested_at ? new Date(config.last_tested_at).toLocaleString() : "never"}</p>
                                {config.last_error && <p className="fail">Error: {config.last_error}</p>}
                              </div>

                              <div className="action-row">
                                <button
                                  type="button"
                                  onClick={() => void testAzureDevOpsConfig(config.config_id)}
                                  disabled={testingAzureDevOpsConfigId === config.config_id}
                                >
                                  {testingAzureDevOpsConfigId === config.config_id ? "Checking..." : "Check configuration"}
                                </button>
                              </div>
                            </article>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {activeAdminSection === "project-links" && (
                <>
                  <h2>Project Links</h2>
                  <p>Connect repository URLs and triggered pipeline URLs for each project.</p>
                  <div className="form-grid compact">
                    <label>
                      Project
                      <select
                        value={adminForm.project_key}
                        onChange={(event) =>
                          setAdminForm((current) => ({
                            ...current,
                            project_key: event.target.value
                          }))
                        }
                      >
                        <option value="">Select a project</option>
                        {filteredSummaries.map((summary) => (
                          <option key={summary.projectKey} value={summary.projectKey}>
                            {summary.projectKey}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Repository URL
                      <select
                        value={adminForm.repoProvider}
                        onChange={(event) =>
                          setAdminForm((current) => ({
                            ...current,
                            repoProvider: event.target.value as ProjectIntegrationRecord["repo_provider"]
                          }))
                        }
                      >
                        <option value="github">GitHub</option>
                        <option value="azure-devops">Azure Repos</option>
                        <option value="other">Other</option>
                      </select>
                      <input
                        placeholder="https://github.com/org/repo"
                        value={adminForm.repoUrl}
                        onChange={(event) =>
                          setAdminForm((current) => ({
                            ...current,
                            repoUrl: event.target.value
                          }))
                        }
                      />
                    </label>
                    <label>
                      Pipeline URL
                      <select
                        value={adminForm.pipelineProvider}
                        onChange={(event) =>
                          setAdminForm((current) => ({
                            ...current,
                            pipelineProvider: event.target.value as ProjectIntegrationRecord["pipeline_provider"]
                          }))
                        }
                      >
                        <option value="azure-devops">Azure DevOps</option>
                        <option value="github-actions">GitHub Actions</option>
                        <option value="other">Other</option>
                      </select>
                      <input
                        placeholder="https://dev.azure.com/..."
                        value={adminForm.pipelineUrl}
                        onChange={(event) =>
                          setAdminForm((current) => ({
                            ...current,
                            pipelineUrl: event.target.value
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="action-row">
                    <button type="button" onClick={presetGitHubRepo} disabled={!adminForm.project_key}>
                      Preset GitHub
                    </button>
                    <button type="button" onClick={presetAzurePipeline} disabled={!adminForm.project_key}>
                      Preset Azure DevOps
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveProjectMeta()}
                      disabled={!adminForm.project_key || savingProjectMeta}
                    >
                      {savingProjectMeta ? "Saving..." : "Save links"}
                    </button>
                    <button
                      type="button"
                      disabled={!adminForm.repoUrl}
                      onClick={() => window.open(adminForm.repoUrl, "_blank", "noopener,noreferrer")}
                    >
                      Open repo
                    </button>
                    <button
                      type="button"
                      disabled={!adminForm.pipelineUrl}
                      onClick={() => window.open(adminForm.pipelineUrl, "_blank", "noopener,noreferrer")}
                    >
                      Open pipeline
                    </button>
                  </div>

                  <div className="auth-card" style={{ marginTop: "1rem" }}>
                    <h4>Azure DevOps organization context</h4>
                    <p style={{ margin: 0, opacity: 0.75 }}>
                      {azureDevOpsConfigs.length > 0
                        ? `Current organization configuration: ${azureDevOpsConfigs[0].config_name}`
                        : "No Azure DevOps organization configured yet. Go to Configuration > DevOps Platform Integrations first."}
                    </p>
                  </div>
                </>
              )}

              {activeAdminSection === "project-management" && (
                <>
                  <h2>Projects &amp; Branches Management</h2>

                  <div className="auth-card" style={{ marginBottom: "2rem" }}>
                    <h3>Delete analyses by project or branch</h3>
                    <p style={{ marginTop: 0, opacity: 0.8 }}>
                      Permanently delete all analyses for a project or specific branch. This action cannot be undone.
                    </p>

                    <div className="form-grid compact">
                      <label>
                        Select Project
                        <select
                          value={deleteTarget?.project ?? ""}
                          onChange={(e) => {
                            setDeleteTarget(e.target.value ? { type: "project", project: e.target.value } : null);
                          }}
                        >
                          <option value="">-- Choose a project --</option>
                          {filteredSummaries.map((s) => (
                            <option key={s.projectKey} value={s.projectKey}>{s.projectKey}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {deleteTarget?.project && (
                      <div style={{ marginTop: "1rem", padding: "12px", backgroundColor: "var(--danger-light)", borderRadius: "4px", border: "1px solid var(--danger)" }}>
                        <p style={{ margin: "0 0 12px 0", fontWeight: "bold", color: "var(--danger)" }}>
                          ⚠️ Delete all analyses for project: <strong>{deleteTarget.project}</strong>
                        </p>
                        <button
                          type="button"
                          onClick={() => { setDeleteTarget({ type: "project", project: deleteTarget.project }); setShowDeleteModal(true); }}
                          style={{ backgroundColor: "var(--danger)", color: "white", border: "none", padding: "8px 16px", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}
                        >
                          Delete all analyses for this project
                        </button>
                      </div>
                    )}
                  </div>

                  {deleteTarget?.project && (() => {
                    const proj = summaries.find((s) => s.projectKey === deleteTarget.project);
                    const branches = proj ? Array.from(new Set(proj.history.map((a) => a.branch).filter(Boolean))) : [];
                    return proj && branches.length > 0 ? (
                      <div className="auth-card">
                        <h3>Delete analyses by branch</h3>
                        <p style={{ marginTop: 0, opacity: 0.8 }}>For project: <strong>{proj.projectKey}</strong></p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 220px), 1fr))", gap: "8px", marginTop: "12px" }}>
                          {branches.map((branch) => (
                            <div key={branch} style={{ padding: "12px", border: "1px solid var(--border)", borderRadius: "4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <p style={{ margin: "0 0 4px 0", fontWeight: "bold" }}>{branch}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => { setDeleteTarget({ type: "branch", project: proj.projectKey, branch }); setShowDeleteModal(true); }}
                                style={{ backgroundColor: "var(--danger)", color: "white", border: "none", padding: "6px 12px", borderRadius: "3px", cursor: "pointer", fontSize: "12px" }}
                              >
                                Delete
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}
                </>
              )}
            </section>
          </div>
        </section>
      )}

      {devOpsConfigModalOpen && (
          <dialog className="config-modal" ref={configDialogRef} aria-labelledby="config-dialog-title" onCancel={(event) => { event.preventDefault(); if (!savingAzureDevOpsConfig) setDevOpsConfigModalOpen(false); }}>
            <header className="config-modal-header">
              <h3 id="config-dialog-title">{editingAzureDevOpsConfigId ? "Edit the configuration" : "Create a configuration"}</h3>
              <button type="button" onClick={() => setDevOpsConfigModalOpen(false)}>Cancel</button>
            </header>
            <div className="form-grid compact">
              <label>
                Configuration name
                <input
                  value={azureDevOpsConfigForm.config_name}
                  onChange={(event) =>
                    setAzureDevOpsConfigForm((current) => ({ ...current, config_name: event.target.value }))
                  }
                  placeholder="up-group-azure-devops"
                />
              </label>
              <label>
                Azure DevOps URL
                <input
                  value={azureDevOpsConfigForm.organization_url}
                  onChange={(event) =>
                    setAzureDevOpsConfigForm((current) => ({ ...current, organization_url: event.target.value }))
                  }
                  placeholder="https://dev.azure.com/up-group"
                />
              </label>
              <label>
                Personal Access Token
                <input
                  type="password"
                  value={azureDevOpsConfigForm.personal_access_token}
                  onChange={(event) =>
                    setAzureDevOpsConfigForm((current) => ({
                      ...current,
                      personal_access_token: event.target.value
                    }))
                  }
                  placeholder={editingAzureDevOpsConfigId ? "Leave blank to keep current PAT" : "Paste Azure DevOps PAT"}
                  autoComplete="off"
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={azureDevOpsConfigForm.quality_gate_enabled}
                  onChange={(event) =>
                    setAzureDevOpsConfigForm((current) => ({
                      ...current,
                      quality_gate_enabled: event.target.checked
                    }))
                  }
                />
                Enable PR decoration &amp; quality gate reporting
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={azureDevOpsConfigForm.repo_import_enabled}
                  onChange={(event) =>
                    setAzureDevOpsConfigForm((current) => ({
                      ...current,
                      repo_import_enabled: event.target.checked
                    }))
                  }
                />
                Enable repository import
              </label>
            </div>
            <div className="action-row" style={{ marginTop: "1rem" }}>
              <button type="button" onClick={() => void saveAzureDevOpsConfig()} disabled={savingAzureDevOpsConfig}>
                {savingAzureDevOpsConfig ? "Saving..." : "Save configuration"}
              </button>
              <button type="button" onClick={() => setDevOpsConfigModalOpen(false)}>
                Cancel
              </button>
            </div>
          </dialog>
      )}


              {showDeleteModal && deleteTarget && (
                  <dialog className="config-modal" ref={deleteDialogRef} aria-label="Confirm deletion" onCancel={(event) => { event.preventDefault(); if (!deletingAnalyses) setShowDeleteModal(false); }}>
                    <header className="config-modal-header">
                      <h3>Confirm deletion</h3>
                      <button type="button" onClick={() => setShowDeleteModal(false)} disabled={deletingAnalyses}>Cancel</button>
                    </header>
                    <div style={{ padding: "16px" }}>
                      <p style={{ marginTop: 0, marginBottom: "12px" }}>
                        {deleteTarget.type === "project"
                          ? `Are you sure you want to delete all analyses for project "${deleteTarget.project}"? This cannot be undone.`
                          : `Are you sure you want to delete all analyses for "${deleteTarget.project}/${deleteTarget.branch}"? This cannot be undone.`}
                      </p>
                      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                        <button type="button" onClick={() => setShowDeleteModal(false)} disabled={deletingAnalyses}>Cancel</button>
                        <button
                          type="button"
                          onClick={() => void deleteAnalyses()}
                          disabled={deletingAnalyses}
                          style={{ backgroundColor: "var(--danger)", color: "white", border: "none", padding: "8px 16px", borderRadius: "4px", cursor: deletingAnalyses ? "not-allowed" : "pointer", fontWeight: "bold" }}
                        >
                          {deletingAnalyses ? "Deleting..." : "Yes, delete permanently"}
                        </button>
                      </div>
                    </div>
                  </dialog>
              )}
      <footer className="footer">Current release: {releaseName}</footer>
    </main>
  );
}
