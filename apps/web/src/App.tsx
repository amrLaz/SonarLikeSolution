import { useEffect, useMemo, useRef, useState } from "react";
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

type ApiConnectionState = "connected" | "disconnected" | "checking";
type ScopeMode = "overall" | "new-code";
type AppTab = "projects" | "issues" | "vulnerabilities" | "rules" | "quality-gates" | "evolution" | "administration";
type AdminPrimaryTab = "configuration" | "security" | "projects";
type AdminSection =
  | "general-settings"
  | "analysis-scope"
  | "devops-integrations"
  | "access-management"
  | "pat-management"
  | "project-links"
  | "project-management"
  | "analysis-workbench";
type IssueSeverityFilter = "all" | "blocker" | "high" | "medium" | "low" | "info";
type IssueTypeFilter = "all" | "vulnerability" | "code_smell" | "bug" | "hotspot";

type QualityGate = {
  gate_id: string;
  name: string;
  min_maintainability_score: number;
  min_security_score: number;
  max_vulnerabilities: number;
  max_security_hotspots: number;
  max_code_smells: number;
};

type AnalysisMetrics = {
  maintainability_score: number;
  security_score: number;
  reliability_score: number;
  code_smells: number;
  vulnerabilities: number;
  security_hotspots: number;
  bugs: number;
  coverage: number;
  dependency_vulnerabilities?: number;
  affected_files?: Record<string, FindingIssue[]>;
};

type FindingIssue = {
  line: number;
  end_line?: number;
  rule: string;
  message: string;
  severity: string;
};

type AnalysisRecord = {
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

type LocalGroup = {
  group_id: string;
  name: string;
  description: string;
  default_role: LocalUserRole;
};

type SessionUser = {
  full_name: string;
  email: string;
  access_role: LocalUserRole;
};

type ProjectSummary = {
  projectKey: string;
  latest: AnalysisRecord;
  history: AnalysisRecord[];
  passCount: number;
  failCount: number;
};

type RuleCard = {
  key: string;
  title: string;
  category: "Reliability" | "Maintainability" | "Security";
  severity: "Low" | "Medium" | "High";
  language: string;
  status: "pass" | "fail";
  detail: string;
};

type GateLibraryItem = QualityGate & {
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
};

type PlatformSettings = {
  instance_name: string;
  report_max_size_mb: string;
  global_source_exclusions: string;
  source_file_exclusions: string;
};

const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  instance_name: "Upcoop SonarLike Platform",
  report_max_size_mb: "450",
  global_source_exclusions: "**/__tests__/**,**/*.snap",
  source_file_exclusions: "**/*.generated.*,**/coverage/**",
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
    { id: "devops-integrations", label: "DevOps Platform Integrations" }
  ],
  security: [
    { id: "access-management", label: "Authentication" },
    { id: "pat-management", label: "PAT Management" }
  ],
  projects: [
    { id: "project-management", label: "Projects & Branches" },
    { id: "project-links", label: "Project Links" },
    { id: "analysis-workbench", label: "Analysis Workbench" }
  ]
};

const RULE_FILTER_GROUPS = [
  "Language",
  "Software quality",
  "Security Hotspots",
  "Severity",
  "Code attribute",
  "Tags",
  "Repository",
  "Status",
  "Available Since",
  "Security Category",
  "Template",
  "Quality Profile"
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

const toScopedMetrics = (analysis: AnalysisRecord, mode: ScopeMode): AnalysisMetrics => {
  const baseReliability =
    typeof analysis.metrics.reliability_score === "number"
      ? analysis.metrics.reliability_score
      : Math.max(0, analysis.metrics.maintainability_score - 4);
  const baseBugs = typeof analysis.metrics.bugs === "number" ? analysis.metrics.bugs : 0;
  const baseCoverage = typeof analysis.metrics.coverage === "number" ? analysis.metrics.coverage : 0;
  const baseAffectedFiles = analysis.metrics.affected_files ?? {};

  if (mode === "overall") {
    return {
      ...analysis.metrics,
      reliability_score: baseReliability,
      bugs: baseBugs,
      coverage: baseCoverage,
      affected_files: baseAffectedFiles
    };
  }

  const seed = hashString(`${analysis.analysis_id}:${analysis.commit_sha}`);
  const noise = (range: number) => (seed % (range * 2 + 1)) - range;

  return {
    maintainability_score: clamp(analysis.metrics.maintainability_score - 6 + noise(3), 0, 100),
    security_score: clamp(analysis.metrics.security_score - 7 + noise(2), 0, 100),
    reliability_score: clamp(baseReliability - 5 + noise(2), 0, 100),
    code_smells: Math.max(0, Math.round(analysis.metrics.code_smells * 0.4)),
    vulnerabilities: Math.max(0, Math.min(analysis.metrics.vulnerabilities, 1 + (seed % 2))),
    security_hotspots: Math.max(0, Math.min(analysis.metrics.security_hotspots, 2 + (seed % 2))),
    bugs: Math.max(0, Math.round(baseBugs * 0.5)),
    coverage: Math.max(0, baseCoverage - 10 + noise(5)),
    duplication: typeof analysis.metrics.duplication === "number" ? analysis.metrics.duplication : 0,
    affected_files: baseAffectedFiles
  };
};

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

const linePoints = (values: number[], width = 360, height = 130) => {
  if (values.length === 0) {
    return "";
  }
  if (values.length === 1) {
    const y = height - (values[0] / 100) * height;
    return `0,${y} ${width},${y}`;
  }
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - (value / 100) * height;
      return `${x},${y}`;
    })
    .join(" ");
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
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [gate, setGate] = useState<QualityGate | null>(null);
  const [projectMeta, setProjectMeta] = useState<Record<string, ProjectMeta>>({});
  const [authProviders, setAuthProviders] = useState<AuthProvider[]>([]);
  const [entraProvider, setEntraProvider] = useState<AuthProvider | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiConnectionState>("checking");
  const [issueSeverityFilter, setIssueSeverityFilter] = useState<IssueSeverityFilter>("all");
  const [issueTypeFilter, setIssueTypeFilter] = useState<IssueTypeFilter>("all");
  const [issueRuleFilter, setIssueRuleFilter] = useState("");
  const [issueFileFilter, setIssueFileFilter] = useState("");
  const [issueProjectFilter, setIssueProjectFilter] = useState("all");
  const [expandedRuleFilters, setExpandedRuleFilters] = useState<Record<string, boolean>>({});
  const [selectedRuleKey, setSelectedRuleKey] = useState("");
  const [ruleStatusOverrides, setRuleStatusOverrides] = useState<Record<string, RuleCard["status"]>>({});
  const [gateLibrary, setGateLibrary] = useState<GateLibraryItem[]>([]);
  const [selectedGateId, setSelectedGateId] = useState("default");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingGate, setSavingGate] = useState(false);
  const [runningAnalysis, setRunningAnalysis] = useState(false);
  const [savingProjectMeta, setSavingProjectMeta] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "project" | "branch"; project: string; branch?: string } | null>(null);
  const [deletingAnalyses, setDeletingAnalyses] = useState(false);
  const [savingAuthProvider, setSavingAuthProvider] = useState(false);
  const [testingAuthProvider, setTestingAuthProvider] = useState(false);
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(DEFAULT_PLATFORM_SETTINGS);
  const [savingPlatformSettings, setSavingPlatformSettings] = useState(false);
  const [platformTokenConfigured, setPlatformTokenConfigured] = useState<boolean | null>(null);
  const [platformTokenExpired, setPlatformTokenExpired] = useState(false);
  const [platformTokenExpiresAt, setPlatformTokenExpiresAt] = useState<string | null>(null);
  const [platformTokenName, setPlatformTokenName] = useState("Azure DevOps CI token");
  const [platformTokenInput, setPlatformTokenInput] = useState("");
  const [platformTokenTtlDays, setPlatformTokenTtlDays] = useState<number>(DEFAULT_TOKEN_TTL_DAYS);
  const [platformTokenHistory, setPlatformTokenHistory] = useState<PlatformTokenHistoryItem[]>([]);
  const [generatingPlatformToken, setGeneratingPlatformToken] = useState(false);
  const [generatedPlatformToken, setGeneratedPlatformToken] = useState<string | null>(null);
  const [platformTokenError, setPlatformTokenError] = useState<string | null>(null);
  const [devOpsProviderTab, setDevOpsProviderTab] = useState<DevOpsProviderTab>("azure-devops");
  const [azureDevOpsConfigs, setAzureDevOpsConfigs] = useState<AzureDevOpsOrganizationConfig[]>([]);
  const [devOpsConfigModalOpen, setDevOpsConfigModalOpen] = useState(false);
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

  const [gateForm, setGateForm] = useState({
    name: "Default Gate",
    min_maintainability_score: 80,
    min_security_score: 85,
    max_vulnerabilities: 0,
    max_security_hotspots: 2,
    max_code_smells: 25
  });

  const [analysisForm, setAnalysisForm] = useState({
    project_key: "ui-demo-project",
    commit_sha: "abc12345",
    branch: "main",
    simulated_quality_gate: "pass" as "pass" | "fail"
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

  const [localGroups, setLocalGroups] = useState<LocalGroup[]>([
    {
      group_id: "grp-platform-admins",
      name: "Platform Admins",
      description: "Full administrative control over projects and global settings.",
      default_role: "admin"
    },
    {
      group_id: "grp-dev-reviewers",
      name: "Dev Reviewers",
      description: "Can review findings, triage issues, and update quality gates.",
      default_role: "regular"
    },
    {
      group_id: "grp-observers",
      name: "Observers",
      description: "Read-only visibility on analyses and trends.",
      default_role: "default"
    }
  ]);

  const [localUsers, setLocalUsers] = useState<LocalUser[]>([
    {
      user_id: "usr-sarah-admin",
      full_name: "Amr Lazraq",
      email: "amr.lazraq@upcoop.local",
      password: "Admin@12345",
      user_type: "internal",
      access_role: "admin",
      group_ids: ["grp-platform-admins"],
      status: "active"
    },
    {
      user_id: "usr-amine-review",
      full_name: "Amine Benali",
      email: "amine.benali@upcoop.local",
      password: "Review@12345",
      user_type: "contractor",
      access_role: "regular",
      group_ids: ["grp-dev-reviewers"],
      status: "active"
    },
    {
      user_id: "usr-ci-bot",
      full_name: "CI Pipeline Bot",
      email: "ci-bot@upcoop.local",
      password: "Bot@12345",
      user_type: "service-account",
      access_role: "default",
      group_ids: ["grp-observers"],
      status: "active"
    }
  ]);

  const [newLocalUser, setNewLocalUser] = useState({
    full_name: "",
    email: "",
    password: "",
    user_type: "internal" as LocalUserType,
    access_role: "default" as LocalUserRole,
    group_id: ""
  });

  const [passwordForm, setPasswordForm] = useState({
    user_id: "",
    password: ""
  });

  const [newLocalGroup, setNewLocalGroup] = useState({
    name: "",
    description: "",
    default_role: "default" as LocalUserRole
  });

  const releaseName = useMemo(() => "Bootstrap 0.3", []);

  const canAccessAdministration = sessionUser?.access_role === "admin";
  const visibleTabs = useMemo(() => {
    return canAccessAdministration ? TABS : TABS.filter((tab) => tab.id !== "administration");
  }, [canAccessAdministration]);

  const localGroupById = useMemo(() => {
    return Object.fromEntries(localGroups.map((group) => [group.group_id, group]));
  }, [localGroups]);

  const groupMemberCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const group of localGroups) {
      counts[group.group_id] = 0;
    }
    for (const user of localUsers) {
      for (const groupId of user.group_ids) {
        counts[groupId] = (counts[groupId] ?? 0) + 1;
      }
    }
    return counts;
  }, [localGroups, localUsers]);

  const activeLocalUsers = useMemo(() => {
    return localUsers.filter((user) => user.status === "active").length;
  }, [localUsers]);

  const roleCapabilities: Record<LocalUserRole, string> = {
    admin: "Manage configuration, users, groups, integrations, and quality gates.",
    regular: "Review findings, manage project-level settings, and run analyses.",
    default: "View projects, issues, and dashboards in read-only mode."
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

    const newUser: LocalUser = {
      user_id: `usr-${Date.now()}`,
      full_name: fullName,
      email,
      password,
      user_type: newLocalUser.user_type,
      access_role: newLocalUser.access_role,
      group_ids: newLocalUser.group_id ? [newLocalUser.group_id] : [],
      status: "active"
    };

    setLocalUsers((current) => [newUser, ...current]);
    setNewLocalUser({
      full_name: "",
      email: "",
      password: "",
      user_type: "internal",
      access_role: "default",
      group_id: ""
    });
    setAdminMessage(`Local user ${fullName} added.`);
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

    setLocalUsers((current) =>
      current.map((user) => (user.user_id === userId ? { ...user, password: newPassword } : user))
    );
    const target = localUsers.find((user) => user.user_id === userId);
    setPasswordForm({ user_id: "", password: "" });
    setAdminMessage(`Password updated for ${target?.full_name ?? "selected user"}.`);
  };

  const addLocalGroup = () => {
    const name = newLocalGroup.name.trim();
    if (!name) {
      setAdminMessage("Group name is required.");
      return;
    }

    const group: LocalGroup = {
      group_id: `grp-${Date.now()}`,
      name,
      description: newLocalGroup.description.trim() || "No description provided.",
      default_role: newLocalGroup.default_role
    };
    setLocalGroups((current) => [group, ...current]);
    setNewLocalGroup({ name: "", description: "", default_role: "default" });
    setAdminMessage(`Group ${name} created.`);
  };

  const setUserRole = (userId: string, role: LocalUserRole) => {
    setLocalUsers((current) =>
      current.map((user) => (user.user_id === userId ? { ...user, access_role: role } : user))
    );
  };

  const toggleUserStatus = (userId: string) => {
    setLocalUsers((current) =>
      current.map((user) =>
        user.user_id === userId
          ? { ...user, status: user.status === "active" ? "disabled" : "active" }
          : user
      )
    );
  };

  const removeLocalUser = (userId: string) => {
    setLocalUsers((current) => current.filter((user) => user.user_id !== userId));
  };

  const removeLocalGroup = (groupId: string) => {
    setLocalGroups((current) => current.filter((group) => group.group_id !== groupId));
    setLocalUsers((current) =>
      current.map((user) => ({
        ...user,
        group_ids: user.group_ids.filter((id) => id !== groupId)
      }))
    );
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
          passCount: sorted.filter((analysis) => analysis.quality_gate === "pass").length,
          failCount: sorted.filter((analysis) => analysis.quality_gate === "fail").length
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
    return (
      summaries.find((summary) => summary.projectKey === selectedProject) ??
      filteredSummaries[0] ??
      null
    );
  }, [filteredSummaries, selectedProject, summaries]);

  // Handle Entra OIDC callback params and pre-fetch Entra provider status for sign-in page
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const entraSession = params.get("entra_session");
    const entraError = params.get("entra_error");
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
        };
        const nextSession: SessionUser = {
          full_name: decoded.full_name ?? "Entra User",
          email: decoded.email ?? "",
          access_role: decoded.access_role ?? "regular",
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

  // Get the latest analysis for the selected branch
  const selectedBranchLatestAnalysis = useMemo(() => {
    return selectedProjectAnalyses.length > 0 ? selectedProjectAnalyses[0] : null;
  }, [selectedProjectAnalyses]);

  const latestAnalysis = selectedBranchLatestAnalysis ?? analyses[0] ?? null;
  const latestScopedMetrics = latestAnalysis ? toScopedMetrics(latestAnalysis, scopeMode) : null;

  const overviewCards = latestScopedMetrics
    ? [
        { label: "Security", value: `${latestScopedMetrics.security_score}/100` },
        { label: "Reliability", value: `${latestScopedMetrics.reliability_score}/100` },
        { label: "Maintainability", value: `${latestScopedMetrics.maintainability_score}/100` },
        { label: "Hotspots", value: String(latestScopedMetrics.security_hotspots) },
        { label: "Coverage", value: `${clamp(latestScopedMetrics.coverage, 0, 100)}%` },
        { label: "Duplications", value: `${clamp(latestScopedMetrics.duplication ?? 0, 0, 100).toFixed(1)}%` }
      ]
    : [
        { label: "Security", value: "-" },
        { label: "Reliability", value: "-" },
        { label: "Maintainability", value: "-" },
        { label: "Hotspots", value: "-" },
        { label: "Coverage", value: "-" },
        { label: "Duplications", value: "-" }
      ];

  const issueRows = useMemo(() => {
    return filteredSummaries.map((summary) => {
      const metrics = toScopedMetrics(summary.latest, scopeMode);

      const details = Object.values(metrics.affected_files ?? {}).flat();
      const highCount = details.filter((item) => String(item.severity).toUpperCase() === "HIGH").length;
      const mediumCount = details.filter((item) => String(item.severity).toUpperCase() === "MEDIUM").length;
      const lowCount = details.filter((item) => {
        const severity = String(item.severity).toUpperCase();
        return severity === "LOW" || severity === "INFO";
      }).length;

      return {
        projectKey: summary.projectKey,
        blocker: metrics.vulnerabilities,
        high: highCount > 0 ? highCount : metrics.security_hotspots,
        medium: mediumCount > 0 ? mediumCount : Math.ceil(metrics.code_smells / 10),
        low: lowCount > 0 ? lowCount : metrics.maintainability_score < 80 ? 1 : 0
      };
    });
  }, [filteredSummaries, scopeMode]);

  const selectedIssueDetails = useMemo(() => {
    if (!selectedSummary || !selectedBranch) {
      return [] as Array<FindingIssue & { file_path: string; id: string }>;
    }

    // Find analysis for the selected branch
    const branchAnalysis = selectedProjectAnalyses.find(
      (analysis) => Object.keys(analysis.metrics.affected_files ?? {}).length > 0
    ) ?? selectedProjectAnalyses[0];

    if (!branchAnalysis) {
      return [];
    }

    const affectedFiles = branchAnalysis.metrics.affected_files ?? {};
    return Object.entries(affectedFiles).flatMap(([filePath, fileData]) => {
      // Handle both old format (array of issues) and new format (severity/issues object)
      if (Array.isArray(fileData)) {
        return fileData.map((issue, index) => ({
          id: `${filePath}:${issue.line}:${issue.rule}:${index}`,
          file_path: filePath,
          line: issue.line,
          end_line: issue.end_line,
          rule: issue.rule,
          message: issue.message,
          severity: String(issue.severity).toUpperCase()
        }));
      } else if (fileData && typeof fileData === 'object') {
        // New format: {severity: "high", issues: 1}
        const issues = fileData.issues || 0;
        return Array.from({length: issues}, (_, index) => ({
          id: `${filePath}:${index}`,
          file_path: filePath,
          line: 0,
          end_line: 0,
          rule: 'ISSUE',
          message: `${issues} issue(s) in file`,
          severity: String(fileData.severity ?? 'INFO').toUpperCase()
        }));
      }
      return [];
    });
  }, [selectedSummary, selectedBranch, selectedProjectAnalyses]);

  const allIssueDetails = useMemo(() => {
    return summaries.flatMap((summary) => {
      const analysisWithDetails =
        summary.history.find(
          (analysis) => Object.keys(analysis.metrics.affected_files ?? {}).length > 0
        ) ?? summary.latest;
      const affectedFiles = analysisWithDetails.metrics.affected_files ?? {};
      const meta = projectMeta[summary.projectKey];
      return Object.entries(affectedFiles).flatMap(([filePath, fileData]) => {
        // Handle both old format (array of issues) and new format (severity/issues object)
        if (Array.isArray(fileData)) {
          return fileData.map((issue, index) => ({
            id: `${summary.projectKey}:${filePath}:${issue.line}:${issue.rule}:${index}`,
            project_key: summary.projectKey,
            file_path: filePath,
            line: issue.line,
            end_line: issue.end_line,
            rule: issue.rule,
            message: issue.message,
            severity: String(issue.severity).toUpperCase(),
            commit_sha: analysisWithDetails.commit_sha ?? "",
            repo_url: meta?.repoUrl ?? "",
            repo_provider: meta?.repoProvider ?? "other"
          }));
        } else if (fileData && typeof fileData === 'object') {
          // New format: {severity: "high", issues: 1}
          const issues = fileData.issues || 0;
          return Array.from({length: issues}, (_, index) => ({
            id: `${summary.projectKey}:${filePath}:${index}`,
            project_key: summary.projectKey,
            file_path: filePath,
            line: 0,
            end_line: 0,
            rule: 'ISSUE',
            message: `${issues} issue(s) in file`,
            severity: String(fileData.severity ?? 'INFO').toUpperCase(),
            commit_sha: analysisWithDetails.commit_sha ?? "",
            repo_url: meta?.repoUrl ?? "",
            repo_provider: meta?.repoProvider ?? "other"
          }));
        }
        return [];
      });
    });
  }, [summaries, projectMeta]);

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
    const typeFromRule = (rule: string): IssueTypeFilter => {
      const r = rule.toLowerCase();
      if (r.includes("security") || r.includes("sql") || r.includes("xss") || r.includes("inject") || r.includes("hardcoded") || r.includes("auth")) return "vulnerability";
      if (r.includes("bug") || r.includes("error") || r.includes("exception") || r.includes("null") || r.includes("undefined")) return "bug";
      if (r.includes("hotspot") || r.includes("sensitive") || r.includes("crypto") || r.includes("hash")) return "hotspot";
      return "code_smell";
    };
    return allIssueDetails.filter((issue) => {
      if (issueProjectFilter !== "all" && issue.project_key !== issueProjectFilter) return false;
      if (issueSeverityFilter !== "all") {
        const mapped = severityMap[issue.severity] ?? "low";
        if (mapped !== issueSeverityFilter) return false;
      }
      if (issueTypeFilter !== "all") {
        if (typeFromRule(issue.rule) !== issueTypeFilter) return false;
      }
      if (issueRuleFilter.trim()) {
        if (!issue.rule.toLowerCase().includes(issueRuleFilter.trim().toLowerCase())) return false;
      }
      if (issueFileFilter.trim()) {
        if (!issue.file_path.toLowerCase().includes(issueFileFilter.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [allIssueDetails, issueProjectFilter, issueSeverityFilter, issueTypeFilter, issueRuleFilter, issueFileFilter]);

  const filteredIssueRows = useMemo(() => {
    if (issueSeverityFilter === "all") {
      return issueRows;
    }

    return issueRows.filter((row) => {
      if (issueSeverityFilter === "blocker") {
        return row.blocker > 0;
      }
      if (issueSeverityFilter === "high") {
        return row.high > 0;
      }
      if (issueSeverityFilter === "medium") {
        return row.medium > 0;
      }
      return row.low > 0;
    });
  }, [issueRows, issueSeverityFilter]);

  const rulesDataset = useMemo<RuleCard[]>(() => {
    const metrics = selectedSummary ? toScopedMetrics(selectedSummary.latest, scopeMode) : null;
    if (!metrics || !gate) {
      return [];
    }

    const base: RuleCard[] = [
      {
        key: "rule-1",
        title: '"important" should not be used on "keyframes"',
        category: "Reliability",
        severity: "Medium",
        language: "CSS",
        status: metrics.code_smells <= gate.max_code_smells ? "pass" : "fail",
        detail: `Code smells ${metrics.code_smells} (limit ${gate.max_code_smells})`
      },
      {
        key: "rule-2",
        title: '"#import" should not be used',
        category: "Maintainability",
        severity: "Medium",
        language: "C++",
        status: metrics.maintainability_score >= gate.min_maintainability_score ? "pass" : "fail",
        detail: `Maintainability ${metrics.maintainability_score} (min ${gate.min_maintainability_score})`
      },
      {
        key: "rule-3",
        title: '"#include" directives should be followed by either <filename> or "filename" sequences',
        category: "Reliability",
        severity: "Medium",
        language: "C",
        status: metrics.security_hotspots <= gate.max_security_hotspots ? "pass" : "fail",
        detail: `Hotspots ${metrics.security_hotspots} (max ${gate.max_security_hotspots})`
      },
      {
        key: "rule-4",
        title: "Security score minimum threshold",
        category: "Security",
        severity: "High",
        language: "Multi",
        status: metrics.security_score >= gate.min_security_score ? "pass" : "fail",
        detail: `Security ${metrics.security_score} (min ${gate.min_security_score})`
      },
      {
        key: "rule-5",
        title: "No blocker vulnerabilities allowed",
        category: "Security",
        severity: "High",
        language: "Multi",
        status: metrics.vulnerabilities <= gate.max_vulnerabilities ? "pass" : "fail",
        detail: `Vulnerabilities ${metrics.vulnerabilities} (max ${gate.max_vulnerabilities})`
      }
    ];

    return base;
  }, [gate, scopeMode, selectedSummary]);

  const filteredRules = useMemo(() => {
    const query = ruleSearch.trim().toLowerCase();
    const withOverrides = rulesDataset.map((rule) => ({
      ...rule,
      status: ruleStatusOverrides[rule.key] ?? rule.status
    }));

    if (!query) {
      return withOverrides;
    }
    return withOverrides.filter((rule) => rule.title.toLowerCase().includes(query));
  }, [ruleSearch, ruleStatusOverrides, rulesDataset]);

  const selectedRule = useMemo(
    () => filteredRules.find((rule) => rule.key === selectedRuleKey) ?? filteredRules[0] ?? null,
    [filteredRules, selectedRuleKey]
  );

  const selectedGate = useMemo(
    () => gateLibrary.find((gateItem) => gateItem.gate_id === selectedGateId) ?? null,
    [gateLibrary, selectedGateId]
  );

  const selectedAuthProvider = useMemo(
    () => authProviders.find((provider) => provider.provider_id === authForm.provider_id) ?? null,
    [authForm.provider_id, authProviders]
  );

  const evolutionSeries = useMemo(() => {
    if (!selectedSummary || !selectedBranch) {
      return { maintainability: [] as number[], security: [] as number[] };
    }

    // Filter history by selected branch only
    const branchHistory = selectedSummary.history.filter((analysis) => analysis.branch === selectedBranch);
    const ascending = [...branchHistory].sort((left, right) =>
      left.created_at.localeCompare(right.created_at)
    );
    return {
      maintainability: ascending.map((analysis) => toScopedMetrics(analysis, scopeMode).maintainability_score),
      security: ascending.map((analysis) => toScopedMetrics(analysis, scopeMode).security_score)
    };
  }, [scopeMode, selectedSummary, selectedBranch]);

  const apiFetch = (url: string, init?: RequestInit) => fetch(url, init);

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
        setAuthForm({
          provider_id: preferredProvider.provider_id,
          connection_url: preferredProvider.connection_url
        });
      }
      setGateLibrary((current) => {
        const defaults: GateLibraryItem[] = [
          {
            ...gatePayload,
            projectCount: analysesPayload.length,
            builtIn: true
          },
          {
            gate_id: "ai-code",
            name: "AI Code Gate",
            min_maintainability_score: 82,
            min_security_score: 90,
            max_vulnerabilities: 0,
            max_security_hotspots: 1,
            max_code_smells: 18,
            projectCount: 2,
            builtIn: true
          },
          {
            gate_id: "coverage",
            name: "UP - Code Coverage",
            min_maintainability_score: 78,
            min_security_score: 85,
            max_vulnerabilities: 0,
            max_security_hotspots: 2,
            max_code_smells: 25,
            projectCount: 3
          },
          {
            gate_id: "without-coverage",
            name: "UP - Without Coverage",
            min_maintainability_score: 76,
            min_security_score: 82,
            max_vulnerabilities: 1,
            max_security_hotspots: 3,
            max_code_smells: 30,
            projectCount: 1
          }
        ];

        if (current.length === 0) {
          return defaults;
        }

        return current.map((item) =>
          item.gate_id === "default"
            ? {
                ...item,
                ...gatePayload,
                projectCount: analysesPayload.length,
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
        max_vulnerabilities: gatePayload.max_vulnerabilities,
        max_security_hotspots: gatePayload.max_security_hotspots,
        max_code_smells: gatePayload.max_code_smells
      });
      if (!selectedProject && analysesPayload.length > 0) {
        setSelectedProject(analysesPayload[0].project_key);
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
    setExpandedRuleFilters(
      Object.fromEntries(RULE_FILTER_GROUPS.map((group, index) => [group, index < 3]))
    );
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
      apiFetch(`${API_BASE}/v1/platform/settings`).then((res) => res.json())
    ])
      .then(
        ([
          statusData,
          historyData,
          azureDevOpsConfigData,
          settingsData
        ]: [
          { configured: boolean; expired: boolean; expires_at: string | null },
          PlatformTokenHistoryItem[],
          AzureDevOpsOrganizationConfig[],
          PlatformSettings
        ]) => {
          setPlatformTokenConfigured(statusData.configured);
          setPlatformTokenExpired(statusData.expired);
          setPlatformTokenExpiresAt(statusData.expires_at);
          setPlatformTokenHistory(historyData);
          setAzureDevOpsConfigs(azureDevOpsConfigData);
          setPlatformSettings(settingsData);
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
    if (authScreen === "app" && !sessionUser) {
      setAuthScreen("sign-in");
    }
  }, [authScreen, sessionUser]);

  useEffect(() => {
    if (!canAccessAdministration && activeTab === "administration") {
      setActiveTab("projects");
    }
  }, [activeTab, canAccessAdministration]);

  useEffect(() => {
    if (!sessionUser) {
      return;
    }
    const matched = localUsers.find((user) => user.email.toLowerCase() === sessionUser.email.toLowerCase());
    if (!matched) {
      return;
    }
    if (matched.full_name === sessionUser.full_name && matched.access_role === sessionUser.access_role) {
      return;
    }

    const nextSession: SessionUser = {
      full_name: matched.full_name,
      email: matched.email,
      access_role: matched.access_role
    };
    setSessionUser(nextSession);
    window.localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(nextSession));
  }, [localUsers, sessionUser]);

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
      max_vulnerabilities: selectedGate.max_vulnerabilities,
      max_security_hotspots: selectedGate.max_security_hotspots,
      max_code_smells: selectedGate.max_code_smells
    });
  }, [selectedGate]);

  const saveGate = async () => {
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

  const runAnalysis = async () => {
    setRunningAnalysis(true);
    setRunMessage(null);
    setError(null);

    try {
      const response = await apiFetch(`${API_BASE}/v1/analyses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...analysisForm,
          ci_provider: "local",
          simulated_quality_gate: analysisForm.simulated_quality_gate
        })
      });

      if (!response.ok) {
        throw new Error(`Analysis creation failed with ${response.status}`);
      }

      const payload = (await response.json()) as AnalysisRecord;
      setRunMessage(
        `Analysis ${payload.project_key} completed with gate ${payload.quality_gate.toUpperCase()}.`
      );
      setSelectedProject(payload.project_key);
      await loadDashboard();
    } catch (err) {
      const message = normalizeErrorMessage(err);
      setError(message);
      setRunMessage(null);
    } finally {
      setRunningAnalysis(false);
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
    if (mode === "new") {
      const confirmed = window.confirm(
        platformTokenConfigured
          ? "Generate a new token? The previous token will no longer be shown in the UI and may need to be replaced in Azure DevOps."
          : "Generate a new CI/CD token now?"
      );
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
        headers["Authorization"] = `Bearer ${currentToken}`;
      }

      const response = await apiFetch(`${API_BASE}/v1/platform/token/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          token_name: platformTokenName.trim(),
          ttl_days: platformTokenTtlDays,
          require_current_token: mode === "rotate"
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

  const createGate = () => {
    const nextId = `custom-${Date.now()}`;
    const newGate: GateLibraryItem = {
      gate_id: nextId,
      name: `Custom Gate ${gateLibrary.length + 1}`,
      min_maintainability_score: 80,
      min_security_score: 85,
      max_vulnerabilities: 0,
      max_security_hotspots: 2,
      max_code_smells: 25,
      projectCount: 0
    };
    setGateLibrary((current) => [newGate, ...current]);
    setSelectedGateId(nextId);
    setGateMessage(`Created ${newGate.name}.`);
  };

  const saveSelectedGate = async () => {
    if (selectedGateId === "default") {
      await saveGate();
      return;
    }

    setGateLibrary((current) =>
      current.map((item) =>
        item.gate_id === selectedGateId
          ? {
              ...item,
              name: gateForm.name,
              min_maintainability_score: gateForm.min_maintainability_score,
              min_security_score: gateForm.min_security_score,
              max_vulnerabilities: gateForm.max_vulnerabilities,
              max_security_hotspots: gateForm.max_security_hotspots,
              max_code_smells: gateForm.max_code_smells
            }
          : item
      )
    );
    setGateMessage(`Saved ${gateForm.name}.`);
  };

  const toggleRuleFilter = (group: string) => {
    setExpandedRuleFilters((current) => ({
      ...current,
      [group]: !current[group]
    }));
  };

  const updateRuleStatus = (ruleKey: string, status: RuleCard["status"]) => {
    setRuleStatusOverrides((current) => ({
      ...current,
      [ruleKey]: status
    }));
  };

  const bulkMarkRules = (status: RuleCard["status"]) => {
    const nextEntries = Object.fromEntries(filteredRules.map((rule) => [rule.key, status]));
    setRuleStatusOverrides((current) => ({
      ...current,
      ...nextEntries
    }));
  };

  const updateGateField = (field: keyof typeof gateForm, value: string) => {
    setGateForm((current) => ({
      ...current,
      [field]: field === "name" ? value : Number(value)
    }));
  };

  const handleSignIn = () => {
    setSignInError(null);
    const email = (signInEmailRef.current?.value ?? signInForm.email).trim().toLowerCase();
    const password = (signInPasswordRef.current?.value ?? signInForm.password).trim();

    if (!email || !password) {
      setSignInError("Email and password are required.");
      return;
    }

    const matchedUser = localUsers.find(
      (user) => user.email.toLowerCase() === email && user.password === password && user.status === "active"
    );
    if (!matchedUser) {
      setSignInError("Invalid credentials or inactive local user.");
      return;
    }

    const nextSession: SessionUser = {
      full_name: matchedUser.full_name,
      email: matchedUser.email,
      access_role: matchedUser.access_role
    };
    setSessionUser(nextSession);
    if (signInForm.remember_me) {
      window.localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(nextSession));
    } else {
      window.localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
    }

    setSignInForm((current) => ({ ...current, password: "" }));
    setAdminMessage(`Welcome ${matchedUser.full_name}.`);
    setAuthScreen("app");
  };

  const handleEntraSignIn = async () => {
    setSignInError(null);
    try {
      const response = await fetch(`${API_BASE}/v1/auth/entra/login`);
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
          <div className="logo">Upcoop</div>
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
          <div className="auth-card sign-card">
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
                  placeholder="amr.lazraq@upcoop.local"
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
            {signInError && <p className="feedback error">{signInError}</p>}
            <div className="action-row">
              <button type="button" onClick={handleSignIn}>Sign in</button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (authScreen === "sign-out") {
    return (
      <main className="auth-page">
        <section className="auth-shell">
          <div className="logo">Upcoop</div>
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
      <header className="topbar">
        <div className="logo">Upcoop</div>
        <nav className="main-tabs" aria-label="Main tabs">
          {visibleTabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              className={activeTab === tab.id ? "main-tab active" : "main-tab"}
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
          <span className={`api-pill ${apiStatus}`}>{apiStatus}</span>
        </div>
      </header>

      <section className="global-tools">
        <input
          placeholder="Search projects"
          value={projectSearch}
          onChange={(event) => setProjectSearch(event.target.value)}
        />
        <div className="scope-toggle">
          <button
            type="button"
            className={scopeMode === "overall" ? "active" : ""}
            onClick={() => setScopeMode("overall")}
          >
            Overall
          </button>
          <button
            type="button"
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


      {error && <p className="feedback error">Failed to load data: {error}</p>}
      {gateMessage && <p className="feedback success">{gateMessage}</p>}
      {runMessage && <p className="feedback success">{runMessage}</p>}
      {adminMessage && <p className="feedback success">{adminMessage}</p>}

      {activeTab === "projects" && (
        <section className="content-grid">
          <aside className="left-filters">
            <h3>Filters</h3>
            <p>Projects: {filteredSummaries.length}</p>
            <p>Passed: {filteredSummaries.filter((item) => item.latest.quality_gate === "pass").length}</p>
            <p>Failed: {filteredSummaries.filter((item) => item.latest.quality_gate === "fail").length}</p>
            <div className="action-row">
              <button type="button" onClick={() => setProjectSearch("")}>All projects</button>
              <button type="button" onClick={() => setProjectSearch("api")}>Focus API</button>
            </div>
          </aside>
          <div className="project-list">
            {/* Always visible dropdowns */}
            <div style={{ display: "flex", gap: "16px", alignItems: "center", marginBottom: "24px" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: "14px", color: "#666", marginBottom: "6px" }}>PROJECT</label>
                <select
                  value={selectedProject}
                  onChange={(e) => {
                    setSelectedProject(e.target.value);
                    setSelectedBranch("");
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "4px",
                    border: "1px solid #ddd",
                    fontSize: "14px",
                    width: "100%",
                    backgroundColor: "#fff"
                  }}
                >
                  <option value="">-- Select a project --</option>
                  {filteredSummaries.map((summary) => (
                    <option key={summary.projectKey} value={summary.projectKey}>{summary.projectKey}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: "14px", color: "#666", marginBottom: "6px" }}>BRANCH</label>
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
                      value={activeBranch}
                      onChange={(e) => setSelectedBranch(e.target.value)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "4px",
                        border: "1px solid #ddd",
                        fontSize: "14px",
                        width: "100%",
                        backgroundColor: "#fff"
                      }}
                    >
                      {branches.map((branch) => (
                        <option key={branch} value={branch}>{branch}</option>
                      ))}
                    </select>
                  );
                })() : (
                  <select
                    disabled
                    style={{
                      padding: "10px 12px",
                      borderRadius: "4px",
                      border: "1px solid #ddd",
                      fontSize: "14px",
                      width: "100%",
                      backgroundColor: "#f5f5f5"
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
                        <div style={{ marginBottom: "32px", padding: "20px", border: "2px solid #0f766e", borderRadius: "8px", backgroundColor: "#f0fffe" }}>
                          <h3 style={{ margin: "0 0 16px 0" }}>Metrics for {activeBranch}</h3>
                          {(() => {
                            const scoped = toScopedMetrics(detailedBranch.latest, scopeMode);
                            return (
                              <>
                                <div style={{ marginBottom: "16px" }}>
                                  <p style={{ margin: "4px 0", fontSize: "14px" }}>
                                    <strong>Status:</strong> {detailedBranch.latest.quality_gate === "pass" ? "✓ Pass" : "✗ Fail"}
                                  </p>
                                  <p style={{ margin: "4px 0", fontSize: "14px" }}>
                                    <strong>Analyses:</strong> {detailedBranch.count}
                                  </p>
                                  <p style={{ margin: "4px 0", fontSize: "14px" }}>
                                    <strong>Last:</strong> {new Date(detailedBranch.latest.created_at).toLocaleString()}
                                  </p>
                                </div>

                                <div style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                                  gap: "10px"
                                }}>
                                  <div style={{
                                    padding: "12px",
                                    backgroundColor: scoped.security_score >= 85 ? "#e8f5e9" : scoped.security_score >= 70 ? "#fff3e0" : "#ffebee",
                                    borderRadius: "6px",
                                    border: "1px solid #ddd",
                                    textAlign: "center"
                                  }}>
                                    <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Security</div>
                                    <div style={{
                                      fontSize: "24px",
                                      fontWeight: "bold",
                                      color: scoped.security_score >= 85 ? "#2e7d32" : scoped.security_score >= 70 ? "#f57c00" : "#c62828"
                                    }}>
                                      {scoped.security_score}
                                    </div>
                                  </div>

                                  <div style={{
                                    padding: "12px",
                                    backgroundColor: scoped.maintainability_score >= 85 ? "#e8f5e9" : scoped.maintainability_score >= 70 ? "#fff3e0" : "#ffebee",
                                    borderRadius: "6px",
                                    border: "1px solid #ddd",
                                    textAlign: "center"
                                  }}>
                                    <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Maintainability</div>
                                    <div style={{
                                      fontSize: "24px",
                                      fontWeight: "bold",
                                      color: scoped.maintainability_score >= 85 ? "#2e7d32" : scoped.maintainability_score >= 70 ? "#f57c00" : "#c62828"
                                    }}>
                                      {scoped.maintainability_score}
                                    </div>
                                  </div>

                                  <div style={{
                                    padding: "12px",
                                    backgroundColor: scoped.reliability_score >= 85 ? "#e8f5e9" : scoped.reliability_score >= 70 ? "#fff3e0" : "#ffebee",
                                    borderRadius: "6px",
                                    border: "1px solid #ddd",
                                    textAlign: "center"
                                  }}>
                                    <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Reliability</div>
                                    <div style={{
                                      fontSize: "24px",
                                      fontWeight: "bold",
                                      color: scoped.reliability_score >= 85 ? "#2e7d32" : scoped.reliability_score >= 70 ? "#f57c00" : "#c62828"
                                    }}>
                                      {scoped.reliability_score}
                                    </div>
                                  </div>

                                  <div style={{
                                    padding: "12px",
                                    backgroundColor: scoped.coverage >= 70 ? "#e8f5e9" : scoped.coverage >= 50 ? "#fff3e0" : "#ffebee",
                                    borderRadius: "6px",
                                    border: "1px solid #ddd",
                                    textAlign: "center"
                                  }}>
                                    <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Coverage</div>
                                    <div style={{
                                      fontSize: "24px",
                                      fontWeight: "bold",
                                      color: scoped.coverage >= 70 ? "#2e7d32" : scoped.coverage >= 50 ? "#f57c00" : "#c62828"
                                    }}>
                                      {scoped.coverage}%
                                    </div>
                                  </div>

                                  <div style={{
                                    padding: "12px",
                                    backgroundColor: "#e3f2fd",
                                    borderRadius: "6px",
                                    border: "1px solid #ddd",
                                    textAlign: "center"
                                  }}>
                                    <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Duplication</div>
                                    <div style={{
                                      fontSize: "24px",
                                      fontWeight: "bold",
                                      color: "#1976d2"
                                    }}>
                                      {(scoped.duplication ?? 0).toFixed(1)}%
                                    </div>
                                  </div>

                                  <div style={{
                                    padding: "12px",
                                    backgroundColor: scoped.vulnerabilities === 0 ? "#e8f5e9" : scoped.vulnerabilities <= 2 ? "#fff3e0" : "#ffebee",
                                    borderRadius: "6px",
                                    border: "1px solid #ddd",
                                    textAlign: "center"
                                  }}>
                                    <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Vulnerabilities</div>
                                    <div style={{
                                      fontSize: "24px",
                                      fontWeight: "bold",
                                      color: scoped.vulnerabilities === 0 ? "#2e7d32" : scoped.vulnerabilities <= 2 ? "#f57c00" : "#c62828"
                                    }}>
                                      {scoped.vulnerabilities}
                                    </div>
                                  </div>

                                  <div style={{
                                    padding: "12px",
                                    backgroundColor: scoped.security_hotspots === 0 ? "#e8f5e9" : scoped.security_hotspots <= 3 ? "#fff3e0" : "#ffebee",
                                    borderRadius: "6px",
                                    border: "1px solid #ddd",
                                    textAlign: "center"
                                  }}>
                                    <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Hotspots</div>
                                    <div style={{
                                      fontSize: "24px",
                                      fontWeight: "bold",
                                      color: scoped.security_hotspots === 0 ? "#2e7d32" : scoped.security_hotspots <= 3 ? "#f57c00" : "#c62828"
                                    }}>
                                      {scoped.security_hotspots}
                                    </div>
                                  </div>

                                  <div style={{
                                    padding: "12px",
                                    backgroundColor: scoped.code_smells === 0 ? "#e8f5e9" : scoped.code_smells <= 100 ? "#fff3e0" : "#ffebee",
                                    borderRadius: "6px",
                                    border: "1px solid #ddd",
                                    textAlign: "center"
                                  }}>
                                    <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Code Smells</div>
                                    <div style={{
                                      fontSize: "24px",
                                      fontWeight: "bold",
                                      color: scoped.code_smells === 0 ? "#2e7d32" : scoped.code_smells <= 100 ? "#f57c00" : "#c62828"
                                    }}>
                                      {scoped.code_smells}
                                    </div>
                                  </div>

                                  <div style={{
                                    padding: "12px",
                                    backgroundColor: scoped.bugs === 0 ? "#e8f5e9" : scoped.bugs <= 2 ? "#fff3e0" : "#ffebee",
                                    borderRadius: "6px",
                                    border: "1px solid #ddd",
                                    textAlign: "center"
                                  }}>
                                    <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Bugs</div>
                                    <div style={{
                                      fontSize: "24px",
                                      fontWeight: "bold",
                                      color: scoped.bugs === 0 ? "#2e7d32" : scoped.bugs <= 2 ? "#f57c00" : "#c62828"
                                    }}>
                                      {scoped.bugs}
                                    </div>
                                  </div>

                                  {(scoped.dependency_vulnerabilities ?? 0) > 0 && (
                                    <div style={{
                                      padding: "12px",
                                      backgroundColor: "#f3e8ff",
                                      borderRadius: "6px",
                                      border: "1px solid #d8b4fe",
                                      textAlign: "center"
                                    }}>
                                      <div style={{ fontSize: "12px", color: "#7c3aed", marginBottom: "4px" }}>SCA Dep. Vulns</div>
                                      <div style={{ fontSize: "24px", fontWeight: "bold", color: "#6d28d9" }}>
                                        {scoped.dependency_vulnerabilities}
                                      </div>
                                      <div style={{ fontSize: "10px", color: "#9f67f0", marginTop: "2px" }}>not in score</div>
                                    </div>
                                  )}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}

                      <h4 style={{ marginTop: "24px", marginBottom: "12px" }}>All branches</h4>
                      {branches.map((branch) => {
                        const scoped = toScopedMetrics(branch.latest, scopeMode);
                        return (
                          <article
                            key={branch.name}
                            onClick={() => setSelectedBranch(branch.name)}
                            style={{
                              padding: "16px",
                              border: selectedBranch === branch.name ? "2px solid #0f766e" : "1px solid #ddd",
                              borderRadius: "8px",
                              marginBottom: "12px",
                              cursor: "pointer",
                              backgroundColor: selectedBranch === branch.name ? "#f0fffe" : "#fff",
                              transition: "all 0.2s"
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                              <div>
                                <h4 style={{ margin: "0 0 4px 0" }}>{branch.name}</h4>
                                <p style={{ margin: 0, fontSize: "12px", opacity: 0.7 }}>
                                  {branch.count} analyses • Last: {new Date(branch.latest.created_at).toLocaleString()}
                                </p>
                              </div>
                              <span
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  fontSize: "12px",
                                  fontWeight: "bold",
                                  backgroundColor:
                                    branch.latest.quality_gate === "pass" ? "#e8f5e9" : "#ffebee",
                                  color:
                                    branch.latest.quality_gate === "pass" ? "#2e7d32" : "#c62828"
                                }}
                              >
                                {branch.latest.quality_gate === "pass" ? "✓ Pass" : "✗ Fail"}
                              </span>
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                                gap: "8px"
                              }}
                            >
                              <div
                                style={{
                                  padding: "10px",
                                  backgroundColor:
                                    scoped.security_score >= 85
                                      ? "#e8f5e9"
                                      : scoped.security_score >= 70
                                        ? "#fff3e0"
                                        : "#ffebee",
                                  borderRadius: "6px",
                                  border: "1px solid #ddd",
                                  textAlign: "center"
                                }}
                              >
                                <div style={{ fontSize: "11px", color: "#666" }}>Security</div>
                                <div
                                  style={{
                                    fontSize: "18px",
                                    fontWeight: "bold",
                                    color:
                                      scoped.security_score >= 85
                                        ? "#2e7d32"
                                        : scoped.security_score >= 70
                                          ? "#f57c00"
                                          : "#c62828"
                                  }}
                                >
                                  {scoped.security_score}
                                </div>
                              </div>

                              <div
                                style={{
                                  padding: "10px",
                                  backgroundColor:
                                    scoped.maintainability_score >= 85
                                      ? "#e8f5e9"
                                      : scoped.maintainability_score >= 70
                                        ? "#fff3e0"
                                        : "#ffebee",
                                  borderRadius: "6px",
                                  border: "1px solid #ddd",
                                  textAlign: "center"
                                }}
                              >
                                <div style={{ fontSize: "11px", color: "#666" }}>Maintainability</div>
                                <div
                                  style={{
                                    fontSize: "18px",
                                    fontWeight: "bold",
                                    color:
                                      scoped.maintainability_score >= 85
                                        ? "#2e7d32"
                                        : scoped.maintainability_score >= 70
                                          ? "#f57c00"
                                          : "#c62828"
                                  }}
                                >
                                  {scoped.maintainability_score}
                                </div>
                              </div>

                              <div
                                style={{
                                  padding: "10px",
                                  backgroundColor:
                                    scoped.reliability_score >= 85
                                      ? "#e8f5e9"
                                      : scoped.reliability_score >= 70
                                        ? "#fff3e0"
                                        : "#ffebee",
                                  borderRadius: "6px",
                                  border: "1px solid #ddd",
                                  textAlign: "center"
                                }}
                              >
                                <div style={{ fontSize: "11px", color: "#666" }}>Reliability</div>
                                <div
                                  style={{
                                    fontSize: "18px",
                                    fontWeight: "bold",
                                    color:
                                      scoped.reliability_score >= 85
                                        ? "#2e7d32"
                                        : scoped.reliability_score >= 70
                                          ? "#f57c00"
                                          : "#c62828"
                                  }}
                                >
                                  {scoped.reliability_score}
                                </div>
                              </div>

                              <div
                                style={{
                                  padding: "10px",
                                  backgroundColor:
                                    scoped.coverage >= 70
                                      ? "#e8f5e9"
                                      : scoped.coverage >= 50
                                        ? "#fff3e0"
                                        : "#ffebee",
                                  borderRadius: "6px",
                                  border: "1px solid #ddd",
                                  textAlign: "center"
                                }}
                              >
                                <div style={{ fontSize: "11px", color: "#666" }}>Coverage</div>
                                <div
                                  style={{
                                    fontSize: "18px",
                                    fontWeight: "bold",
                                    color:
                                      scoped.coverage >= 70
                                        ? "#2e7d32"
                                        : scoped.coverage >= 50
                                          ? "#f57c00"
                                          : "#c62828"
                                  }}
                                >
                                  {scoped.coverage}%
                                </div>
                              </div>

                              <div
                                style={{
                                  padding: "10px",
                                  backgroundColor: "#e3f2fd",
                                  borderRadius: "6px",
                                  border: "1px solid #ddd",
                                  textAlign: "center"
                                }}
                              >
                                <div style={{ fontSize: "11px", color: "#666" }}>Duplications</div>
                                <div
                                  style={{
                                    fontSize: "18px",
                                    fontWeight: "bold",
                                    color: "#1976d2"
                                  }}
                                >
                                  {(scoped.duplication ?? 0).toFixed(1)}%
                                </div>
                              </div>

                              <div
                                style={{
                                  padding: "10px",
                                  backgroundColor:
                                    scoped.vulnerabilities === 0
                                      ? "#e8f5e9"
                                      : scoped.vulnerabilities <= 2
                                        ? "#fff3e0"
                                        : "#ffebee",
                                  borderRadius: "6px",
                                  border: "1px solid #ddd",
                                  textAlign: "center"
                                }}
                              >
                                <div style={{ fontSize: "11px", color: "#666" }}>Vulnerabilities</div>
                                <div
                                  style={{
                                    fontSize: "18px",
                                    fontWeight: "bold",
                                    color:
                                      scoped.vulnerabilities === 0
                                        ? "#2e7d32"
                                        : scoped.vulnerabilities <= 2
                                          ? "#f57c00"
                                          : "#c62828"
                                  }}
                                >
                                  {scoped.vulnerabilities}
                                </div>
                              </div>

                              <div
                                style={{
                                  padding: "10px",
                                  backgroundColor:
                                    scoped.security_hotspots === 0
                                      ? "#e8f5e9"
                                      : scoped.security_hotspots <= 3
                                        ? "#fff3e0"
                                        : "#ffebee",
                                  borderRadius: "6px",
                                  border: "1px solid #ddd",
                                  textAlign: "center"
                                }}
                              >
                                <div style={{ fontSize: "11px", color: "#666" }}>Hotspots</div>
                                <div
                                  style={{
                                    fontSize: "18px",
                                    fontWeight: "bold",
                                    color:
                                      scoped.security_hotspots === 0
                                        ? "#2e7d32"
                                        : scoped.security_hotspots <= 3
                                          ? "#f57c00"
                                          : "#c62828"
                                  }}
                                >
                                  {scoped.security_hotspots}
                                </div>
                              </div>

                              <div
                                style={{
                                  padding: "10px",
                                  backgroundColor:
                                    scoped.code_smells === 0
                                      ? "#e8f5e9"
                                      : scoped.code_smells <= 100
                                        ? "#fff3e0"
                                        : "#ffebee",
                                  borderRadius: "6px",
                                  border: "1px solid #ddd",
                                  textAlign: "center"
                                }}
                              >
                                <div style={{ fontSize: "11px", color: "#666" }}>Code Smells</div>
                                <div
                                  style={{
                                    fontSize: "18px",
                                    fontWeight: "bold",
                                    color:
                                      scoped.code_smells === 0
                                        ? "#2e7d32"
                                        : scoped.code_smells <= 100
                                          ? "#f57c00"
                                          : "#c62828"
                                  }}
                                >
                                  {scoped.code_smells}
                                </div>
                              </div>

                              <div
                                style={{
                                  padding: "10px",
                                  backgroundColor:
                                    scoped.bugs === 0
                                      ? "#e8f5e9"
                                      : scoped.bugs <= 2
                                        ? "#fff3e0"
                                        : "#ffebee",
                                  borderRadius: "6px",
                                  border: "1px solid #ddd",
                                  textAlign: "center"
                                }}
                              >
                                <div style={{ fontSize: "11px", color: "#666" }}>Bugs</div>
                                <div
                                  style={{
                                    fontSize: "18px",
                                    fontWeight: "bold",
                                    color:
                                      scoped.bugs === 0
                                        ? "#2e7d32"
                                        : scoped.bugs <= 2
                                          ? "#f57c00"
                                          : "#c62828"
                                  }}
                                >
                                  {scoped.bugs}
                                </div>
                              </div>

                              {(scoped.dependency_vulnerabilities ?? 0) > 0 && (
                                <div style={{
                                  padding: "8px",
                                  backgroundColor: "#f3e8ff",
                                  borderRadius: "6px",
                                  border: "1px solid #d8b4fe",
                                  textAlign: "center"
                                }}>
                                  <div style={{ fontSize: "11px", color: "#7c3aed" }}>SCA Deps</div>
                                  <div style={{ fontSize: "18px", fontWeight: "bold", color: "#6d28d9" }}>
                                    {scoped.dependency_vulnerabilities}
                                  </div>
                                </div>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </>
                  );
                })()}
              </>
            ) : (
              <div style={{ padding: "32px" }}><p style={{ textAlign: "center", marginBottom: "24px", color: "#666" }}>All Projects</p><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>{filteredSummaries.map((summary) => (<div key={summary.projectKey} onClick={() => setSelectedProject(summary.projectKey)} style={{ padding: "16px", border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer", backgroundColor: "#fff", transition: "all 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }} onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 8px rgba(0,0,0,0.15)"; }} onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)"; }}><h4 style={{ margin: "0 0 12px 0", color: "#333" }}>{summary.projectKey}</h4><div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#666", marginBottom: "8px" }}><span>✓ Passed: {summary.passCount}</span><span>✗ Failed: {summary.failCount}</span></div><p style={{ margin: "0", fontSize: "12px", color: "#999" }}>Last: {new Date(summary.latest.created_at).toLocaleDateString()}</p></div>))}</div></div>
            )}
          </div>
        </section>
      )}

      {activeTab === "issues" && (
        <section className="two-pane-screen issues-screen">
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
            />
          </div>

          {/* ── Left sidebar filters ──────────────────────────────── */}
          <aside className="issues-sidebar">
            <h3>Filters</h3>

            <div className="issue-filter-group">
              <p className="issue-filter-label">Project</p>
              <select
                value={issueProjectFilter}
                onChange={(e) => setIssueProjectFilter(e.target.value)}
              >
                <option value="all">All projects</option>
                {summaries.map((s) => (
                  <option key={s.projectKey} value={s.projectKey}>{s.projectKey}</option>
                ))}
              </select>
            </div>

            <div className="issue-filter-group">
              <p className="issue-filter-label">Type</p>
              {(["all", "vulnerability", "bug", "code_smell", "hotspot"] as IssueTypeFilter[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`issue-filter-btn${issueTypeFilter === t ? " active" : ""}`}
                  onClick={() => setIssueTypeFilter(t)}
                >
                  {t === "all" ? "All types" : t === "code_smell" ? "Code Smell" : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            <div className="issue-filter-group">
              <p className="issue-filter-label">Severity</p>
              {(["all", "blocker", "high", "medium", "low", "info"] as IssueSeverityFilter[]).map((sev) => (
                <button
                  key={sev}
                  type="button"
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
                placeholder="Filter by rule…"
                value={issueRuleFilter}
                onChange={(e) => setIssueRuleFilter(e.target.value)}
              />
            </div>

            <div className="issue-filter-group">
              <p className="issue-filter-label">File</p>
              <input
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
                setIssueProjectFilter("all");
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

            {filteredIssueDetails.length === 0 ? (
              <div className="issues-empty">
                {allIssueDetails.length === 0
                  ? "No findings in the database yet. Trigger a pipeline run to populate issues."
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
                            <span className="issue-rule">{issue.rule}</span>
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
                            {issueProjectFilter === "all" && (
                              <>
                                <span className="issue-sep">·</span>
                                <span
                                  className="issue-project-link"
                                  onClick={() => {
                                    setSelectedProject(issue.project_key);
                                    setIssueProjectFilter(issue.project_key);
                                  }}
                                >
                                  {issue.project_key}
                                </span>
                              </>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="issue-expand-btn"
                          onClick={() => setExpandedIssueId(isExpanded ? null : issue.id)}
                          title={isExpanded ? "Collapse file details" : "Expand file details"}
                        >
                          {isExpanded ? "▾" : "▸"}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="issue-details">
                          <div className="issue-file-header">
                            <strong>📄 File Details:</strong>
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

      {activeTab === "vulnerabilities" && selectedBranchLatestAnalysis && (
        <section className="vulnerabilities-screen">
          <VulnerabilitiesTab analysisId={selectedBranchLatestAnalysis.analysis_id} />
        </section>
      )}

      {activeTab === "rules" && (
        <section className="two-pane-screen">
          <aside className="rules-sidebar">
            <h3>Filters</h3>
            {RULE_FILTER_GROUPS.map((group) => (
              <div key={group}>
                <button
                  type="button"
                  className="accordion-row"
                  onClick={() => toggleRuleFilter(group)}
                >
                  <span>{group}</span>
                  <span>{expandedRuleFilters[group] ? "▾" : "▸"}</span>
                </button>
                {expandedRuleFilters[group] && (
                  <div className="action-row">
                    <button type="button" onClick={() => setRuleSearch(group)}>
                      Filter
                    </button>
                    <button type="button" onClick={() => setRuleSearch("")}>Reset</button>
                  </div>
                )}
              </div>
            ))}
          </aside>
          <div className="rules-main">
            <header className="rules-toolbar">
              <input
                placeholder="Search for rules..."
                value={ruleSearch}
                onChange={(event) => setRuleSearch(event.target.value)}
              />
              <div className="action-row">
                <button type="button" onClick={() => bulkMarkRules("pass")}>Mark compliant</button>
                <button type="button" onClick={() => bulkMarkRules("fail")}>Mark needs action</button>
              </div>
              <p>{filteredRules.length} rules</p>
            </header>
            <div className="content-grid">
              <div className="rules-list">
                {filteredRules.map((rule) => (
                  <article
                    key={rule.key}
                    className={selectedRule?.key === rule.key ? "rule-card selected" : "rule-card"}
                    onClick={() => setSelectedRuleKey(rule.key)}
                  >
                    <div>
                      <h4>{rule.title}</h4>
                      <p>
                        <span>{rule.category}</span> • <span>{rule.severity}</span> • <span>{rule.language}</span>
                      </p>
                      <small>{rule.detail}</small>
                    </div>
                    <span className={rule.status === "pass" ? "pass" : "fail"}>
                      {rule.status === "pass" ? "Compliant" : "Needs action"}
                    </span>
                  </article>
                ))}
              </div>
              <aside className="panel">
                {selectedRule ? (
                  <>
                    <h3>{selectedRule.title}</h3>
                    <p>
                      {selectedRule.category} • {selectedRule.severity} • {selectedRule.language}
                    </p>
                    <p>{selectedRule.detail}</p>
                    <div className="action-row">
                      <button type="button" onClick={() => updateRuleStatus(selectedRule.key, "pass")}>
                        Accept
                      </button>
                      <button type="button" onClick={() => updateRuleStatus(selectedRule.key, "fail")}>
                        Reopen
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAnalysisForm((current) => ({ ...current, project_key: selectedSummary?.projectKey ?? current.project_key }));
                          setActiveTab("administration");
                          setActiveAdminTab("projects");
                          setActiveAdminSection("project-links");
                        }}
                      >
                        Link to project
                      </button>
                    </div>
                  </>
                ) : (
                  <p>No rule selected.</p>
                )}
              </aside>
            </div>
          </div>
        </section>
      )}

      {activeTab === "quality-gates" && (
        <section className="two-pane-screen">
          <aside className="gates-sidebar">
            <div className="gates-head">
              <h3>Quality Gates</h3>
              <button type="button" onClick={createGate}>Create</button>
            </div>
            <ul>
              {gateLibrary.map((gateItem) => (
                <li key={gateItem.gate_id} className={selectedGateId === gateItem.gate_id ? "active" : ""}>
                  <button type="button" onClick={() => setSelectedGateId(gateItem.gate_id)}>
                    <span>{gateItem.name}</span>
                    <small>{gateItem.projectCount} projects</small>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <div className="gates-main">
            <header className="gates-title-row">
              <h2>{selectedGate?.name ?? gate?.name ?? "Default Gate"}</h2>
              <button type="button" onClick={() => void saveSelectedGate()} disabled={savingGate}>
                {savingGate ? "Saving..." : "Save"}
              </button>
            </header>
            <p className="hint">Conditions on {scopeMode === "new-code" ? "New Code" : "Overall Code"}</p>
            <div className="gate-conditions">
              <label>
                Gate name
                <input
                  value={gateForm.name}
                  onChange={(event) => updateGateField("name", event.target.value)}
                />
              </label>
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
                Max code smells
                <input
                  type="number"
                  value={gateForm.max_code_smells}
                  onChange={(event) => updateGateField("max_code_smells", event.target.value)}
                />
              </label>
            </div>

            <h3>Projects</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Gate</th>
                    <th>Reasons</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {analyses.slice(0, 8).map((analysis) => (
                    <tr key={analysis.analysis_id}>
                      <td>{analysis.project_key}</td>
                      <td className={analysis.quality_gate === "pass" ? "pass" : "fail"}>
                        {analysis.quality_gate}
                      </td>
                      <td>{analysis.gate_failures.length > 0 ? analysis.gate_failures.join("; ") : "-"}</td>
                      <td>
                        <div className="action-row">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProject(analysis.project_key);
                              setActiveTab("projects");
                            }}
                          >
                            Open project
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProject(analysis.project_key);
                              setActiveTab("evolution");
                            }}
                          >
                            Compare trend
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {activeTab === "evolution" && (
        <section className="panel">

          {selectedSummary ? (
            <>
              <div style={{ marginBottom: "24px" }}>
                <h2 style={{ margin: "0 0 16px 0" }}>Metrics evolution for {selectedProject} - {selectedBranch || "all branches"}</h2>
              </div>

              {(() => {
                const analyses = selectedProjectAnalyses.sort((a, b) => 
                  a.created_at.localeCompare(b.created_at)
                );
                
                const coverage = analyses.map(a => toScopedMetrics(a, scopeMode).coverage ?? 0);
                const duplication = analyses.map(a => toScopedMetrics(a, scopeMode).duplication ?? 0);
                const maintainability = analyses.map(a => toScopedMetrics(a, scopeMode).maintainability_score);
                const security = analyses.map(a => toScopedMetrics(a, scopeMode).security_score);
                const reliability = analyses.map(a => toScopedMetrics(a, scopeMode).reliability_score);
                const vulnerabilities = analyses.map(a => toScopedMetrics(a, scopeMode).vulnerabilities);
                const hotspots = analyses.map(a => toScopedMetrics(a, scopeMode).security_hotspots);
                const codeSmells = analyses.map(a => toScopedMetrics(a, scopeMode).code_smells);
                const bugs = analyses.map(a => toScopedMetrics(a, scopeMode).bugs);

                return (
                  <div className="charts-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "20px" }}>
                    <article className="chart-card" style={{ padding: "20px", border: "1px solid #ddd", borderRadius: "8px" }}>
                      <h3>Security trend</h3>
                      <svg viewBox="0 0 360 150" className="trend-chart" style={{ width: "100%", height: "150px" }}>
                        <polyline fill="none" stroke="#1d4ed8" strokeWidth="3" points={linePoints(security)} />
                      </svg>
                    </article>

                    <article className="chart-card" style={{ padding: "20px", border: "1px solid #ddd", borderRadius: "8px" }}>
                      <h3>Maintainability trend</h3>
                      <svg viewBox="0 0 360 150" className="trend-chart" style={{ width: "100%", height: "150px" }}>
                        <polyline fill="none" stroke="#0f766e" strokeWidth="3" points={linePoints(maintainability)} />
                      </svg>
                    </article>

                    <article className="chart-card" style={{ padding: "20px", border: "1px solid #ddd", borderRadius: "8px" }}>
                      <h3>Reliability trend</h3>
                      <svg viewBox="0 0 360 150" className="trend-chart" style={{ width: "100%", height: "150px" }}>
                        <polyline fill="none" stroke="#7c3aed" strokeWidth="3" points={linePoints(reliability)} />
                      </svg>
                    </article>

                    <article className="chart-card" style={{ padding: "20px", border: "1px solid #ddd", borderRadius: "8px" }}>
                      <h3>Coverage trend</h3>
                      <svg viewBox="0 0 360 150" className="trend-chart" style={{ width: "100%", height: "150px" }}>
                        <polyline fill="none" stroke="#16a34a" strokeWidth="3" points={linePoints(coverage)} />
                      </svg>
                    </article>

                    <article className="chart-card" style={{ padding: "20px", border: "1px solid #ddd", borderRadius: "8px" }}>
                      <h3>Duplication trend</h3>
                      <svg viewBox="0 0 360 150" className="trend-chart" style={{ width: "100%", height: "150px" }}>
                        <polyline fill="none" stroke="#2563eb" strokeWidth="3" points={linePoints(duplication)} />
                      </svg>
                    </article>

                    <article className="chart-card" style={{ padding: "20px", border: "1px solid #ddd", borderRadius: "8px" }}>
                      <h3>Vulnerabilities trend</h3>
                      <svg viewBox="0 0 360 150" className="trend-chart" style={{ width: "100%", height: "150px" }}>
                        <polyline fill="none" stroke="#dc2626" strokeWidth="3" points={linePoints(vulnerabilities)} />
                      </svg>
                    </article>

                    <article className="chart-card" style={{ padding: "20px", border: "1px solid #ddd", borderRadius: "8px" }}>
                      <h3>Security Hotspots trend</h3>
                      <svg viewBox="0 0 360 150" className="trend-chart" style={{ width: "100%", height: "150px" }}>
                        <polyline fill="none" stroke="#ea580c" strokeWidth="3" points={linePoints(hotspots)} />
                      </svg>
                    </article>

                    <article className="chart-card" style={{ padding: "20px", border: "1px solid #ddd", borderRadius: "8px" }}>
                      <h3>Code Smells trend</h3>
                      <svg viewBox="0 0 360 150" className="trend-chart" style={{ width: "100%", height: "150px" }}>
                        <polyline fill="none" stroke="#f97316" strokeWidth="3" points={linePoints(codeSmells)} />
                      </svg>
                    </article>

                    <article className="chart-card" style={{ padding: "20px", border: "1px solid #ddd", borderRadius: "8px" }}>
                      <h3>Bugs trend</h3>
                      <svg viewBox="0 0 360 150" className="trend-chart" style={{ width: "100%", height: "150px" }}>
                        <polyline fill="none" stroke="#be123c" strokeWidth="3" points={linePoints(bugs)} />
                      </svg>
                    </article>
                  </div>
                );
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
                      <strong>{localUsers.length}</strong>
                      <span>Local users</span>
                    </div>
                    <div className="iam-summary-card">
                      <strong>{activeLocalUsers}</strong>
                      <span>Active users</span>
                    </div>
                    <div className="iam-summary-card">
                      <strong>{localGroups.length}</strong>
                      <span>Groups</span>
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
                        <label>
                          Group
                          <select
                            value={newLocalUser.group_id}
                            onChange={(event) =>
                              setNewLocalUser((current) => ({ ...current, group_id: event.target.value }))
                            }
                          >
                            <option value="">No group</option>
                            {localGroups.map((group) => (
                              <option key={group.group_id} value={group.group_id}>
                                {group.name}
                              </option>
                            ))}
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
                            {localUsers.map((user) => (
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
                        <table>
                          <thead>
                            <tr>
                              <th>User</th>
                              <th>Type</th>
                              <th>Access</th>
                              <th>Groups</th>
                              <th>Status</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {localUsers.map((user) => (
                              <tr key={user.user_id}>
                                <td>
                                  <strong>{user.full_name}</strong>
                                  <div className="iam-subtext">{user.email}</div>
                                </td>
                                <td>
                                  <span className="iam-chip type">{user.user_type}</span>
                                </td>
                                <td>
                                  <span className={`iam-chip role ${user.access_role}`}>{user.access_role}</span>
                                </td>
                                <td>
                                  {user.group_ids.length > 0
                                    ? user.group_ids
                                        .map((groupId) => localGroupById[groupId]?.name ?? groupId)
                                        .join(", ")
                                    : "No group"}
                                </td>
                                <td>
                                  <span className={`iam-chip status ${user.status}`}>{user.status}</span>
                                </td>
                                <td>
                                  <div className="iam-inline-actions">
                                    <button type="button" onClick={() => setUserRole(user.user_id, "admin")}>Admin</button>
                                    <button type="button" onClick={() => setUserRole(user.user_id, "regular")}>Regular</button>
                                    <button type="button" onClick={() => setUserRole(user.user_id, "default")}>Default</button>
                                    <button type="button" onClick={() => toggleUserStatus(user.user_id)}>
                                      {user.status === "active" ? "Disable" : "Enable"}
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
                      <h3>Groups</h3>
                      <p>Assign default access policy per group and map users.</p>
                      <div className="form-grid compact">
                        <label>
                          Group name
                          <input
                            value={newLocalGroup.name}
                            onChange={(event) =>
                              setNewLocalGroup((current) => ({ ...current, name: event.target.value }))
                            }
                            placeholder="Security Champions"
                          />
                        </label>
                        <label>
                          Description
                          <input
                            value={newLocalGroup.description}
                            onChange={(event) =>
                              setNewLocalGroup((current) => ({ ...current, description: event.target.value }))
                            }
                            placeholder="Cross-team security reviewers"
                          />
                        </label>
                        <label>
                          Default role
                          <select
                            value={newLocalGroup.default_role}
                            onChange={(event) =>
                              setNewLocalGroup((current) => ({
                                ...current,
                                default_role: event.target.value as LocalUserRole
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
                        <button type="button" onClick={addLocalGroup}>Create group</button>
                      </div>

                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Group</th>
                              <th>Default role</th>
                              <th>Members</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {localGroups.map((group) => (
                              <tr key={group.group_id}>
                                <td>
                                  <strong>{group.name}</strong>
                                  <div className="iam-subtext">{group.description}</div>
                                </td>
                                <td>
                                  <span className={`iam-chip role ${group.default_role}`}>{group.default_role}</span>
                                </td>
                                <td>{groupMemberCount[group.group_id] ?? 0}</td>
                                <td>
                                  <button type="button" className="danger" onClick={() => removeLocalGroup(group.group_id)}>
                                    Delete group
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
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
                      disabled={generatingPlatformToken}
                    >
                      {generatingPlatformToken ? "Generating..." : "New token"}
                    </button>
                    {platformTokenConfigured && (
                      <button
                        type="button"
                        onClick={() => void generatePlatformToken("rotate")}
                        disabled={generatingPlatformToken}
                      >
                        {generatingPlatformToken ? "Rotating..." : "Rotate token"}
                      </button>
                    )}
                  </div>

                  {platformTokenError && (
                    <p style={{ color: "var(--color-fail, #e74c3c)", marginTop: "0.75rem" }}>
                      {platformTokenError}
                    </p>
                  )}

                  {generatedPlatformToken && (
                    <div className="auth-card" style={{ marginTop: "1rem", background: "var(--color-surface2, #1e2a1e)" }}>
                      <h4 style={{ marginBottom: "0.5rem" }}>Token generated — copy it now, it won't be shown again</h4>
                      <code style={{
                        display: "block",
                        padding: "0.75rem",
                        background: "var(--color-surface3, #111)",
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
                              </p>
                            </div>
                            <div>
                              <p>Created: {new Date(item.created_at).toLocaleString()}</p>
                              <p>Expires: {new Date(item.expires_at).toLocaleString()}</p>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
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

              {activeAdminSection === "analysis-workbench" && (
                <>
                  <h2>Analysis Workbench</h2>
                  <p>Run local or demo analyses against a selected project.</p>
                  <div className="form-grid compact">
                    <label>
                      Project key
                      <input
                        value={analysisForm.project_key}
                        onChange={(event) =>
                          setAnalysisForm((current) => ({ ...current, project_key: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Commit SHA
                      <input
                        value={analysisForm.commit_sha}
                        onChange={(event) =>
                          setAnalysisForm((current) => ({ ...current, commit_sha: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Branch
                      <input
                        value={analysisForm.branch}
                        onChange={(event) =>
                          setAnalysisForm((current) => ({ ...current, branch: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Demo outcome
                      <select
                        value={analysisForm.simulated_quality_gate}
                        onChange={(event) =>
                          setAnalysisForm((current) => ({
                            ...current,
                            simulated_quality_gate: event.target.value as "pass" | "fail"
                          }))
                        }
                      >
                        <option value="pass">Pass</option>
                        <option value="fail">Fail</option>
                      </select>
                    </label>
                  </div>
                  <div className="action-row">
                    <button type="button" onClick={() => void runAnalysis()} disabled={runningAnalysis}>
                      {runningAnalysis ? "Running..." : "Run analysis"}
                    </button>
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
                      <div style={{ marginTop: "1rem", padding: "12px", backgroundColor: "#ffe0e0", borderRadius: "4px", border: "1px solid #ff6b6b" }}>
                        <p style={{ margin: "0 0 12px 0", fontWeight: "bold", color: "#d32f2f" }}>
                          ⚠️ Delete all analyses for project: <strong>{deleteTarget.project}</strong>
                        </p>
                        <button
                          type="button"
                          onClick={() => { setDeleteTarget({ type: "project", project: deleteTarget.project }); setShowDeleteModal(true); }}
                          style={{ backgroundColor: "#d32f2f", color: "white", border: "none", padding: "8px 16px", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}
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
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "8px", marginTop: "12px" }}>
                          {branches.map((branch) => (
                            <div key={branch} style={{ padding: "12px", border: "1px solid #ddd", borderRadius: "4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <p style={{ margin: "0 0 4px 0", fontWeight: "bold" }}>{branch}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => { setDeleteTarget({ type: "branch", project: proj.projectKey, branch }); setShowDeleteModal(true); }}
                                style={{ backgroundColor: "#ff6b6b", color: "white", border: "none", padding: "6px 12px", borderRadius: "3px", cursor: "pointer", fontSize: "12px" }}
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
        <div className="modal-backdrop" role="presentation" onClick={() => setDevOpsConfigModalOpen(false)}>
          <section className="config-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header className="config-modal-header">
              <h3>{editingAzureDevOpsConfigId ? "Edit the configuration" : "Create a configuration"}</h3>
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
          </section>
        </div>
      )}


              {showDeleteModal && deleteTarget && (
                <div className="modal-backdrop" role="presentation" onClick={() => { if (!deletingAnalyses) setShowDeleteModal(false); }}>
                  <section className="config-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
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
                          style={{ backgroundColor: "#d32f2f", color: "white", border: "none", padding: "8px 16px", borderRadius: "4px", cursor: deletingAnalyses ? "not-allowed" : "pointer", fontWeight: "bold" }}
                        >
                          {deletingAnalyses ? "Deleting..." : "Yes, delete permanently"}
                        </button>
                      </div>
                    </div>
                  </section>
                </div>
              )}
      <footer className="footer">Current release: {releaseName}</footer>
    </main>
  );
}
