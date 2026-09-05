import AnalysisProfiles from './components/AnalysisProfiles';
import CodeExplorer from './components/CodeExplorer';
import CodeScopes from './components/CodeScopes';
import IngestionDetails, { NewCode } from './components/IngestionDetails';
import AuthProviderSettings from './components/AuthProviderSettings';
import { useWorkspaceData } from './useWorkspaceData';
import Issues from './components/Issues';
import Projects from './components/Projects';
import Evolution from './components/Evolution';
import Collaboration from './components/Collaboration';
import Portfolio from './components/Portfolio';
import Rules from './components/Rules';
import CiTokens from './components/CiTokens';
import DevOpsIntegrations from './components/DevOpsIntegrations';
import UsersAccess from './components/UsersAccess';
import AuditLog from './components/AuditLog';
import QualityGates from './components/QualityGates';
import PlatformSettingsPanel from './components/PlatformSettings';
import Notifications from './components/Notifications';
import { useEffect, useMemo, useRef, useState } from "react";
import VulnerabilitiesTab from "./components/Vulnerabilities";
import ProjectHeader from "./components/ProjectHeader";
import { QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch as request, apiJson } from './api';
import { createSessionQueryClient } from './query-client';

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? "http://127.0.0.1:8000/api" : "/api");
const LOCAL_STORAGE_GATE_LIBRARY_KEY = "sast-quality-gates-v1";
const LOCAL_STORAGE_SESSION_KEY = "sast-platform-session-v1";
const LOCAL_STORAGE_NAV_KEY = "sast-nav-v1";

import type { ApiConnectionState, ScopeMode, AppTab as ExistingAppTab, AdminPrimaryTab, AdminSection,  ProjectMeta, ProjectIntegrationRecord, LocalUserRole, SessionUser, ProjectSummary } from './types';
type AppTab = ExistingAppTab | 'code';

const TABS: Array<{ id: AppTab; label: string }> = [
  { id: "projects", label: "Projects" },
  { id: "issues", label: "Issues" },
  { id: "code", label: "Code" },
  { id: "vulnerabilities", label: "Vulnerabilities & IOCs" },
  { id: "rules", label: "Rules" },
  { id: "quality-gates", label: "Quality Gates" },
  { id: "evolution", label: "Evolution" },
  { id: "collaboration", label: "Collaboration" },
  { id: "portfolio", label: "Portefeuille" },
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


export function App() {
  const [session, setSession] = useState<{ user: SessionUser | null; revision: number }>(() => {
    try {
      const user = JSON.parse(localStorage.getItem(LOCAL_STORAGE_SESSION_KEY) ?? 'null') as SessionUser | null;
      return { user: user?.token ? user : null, revision: 0 };
    } catch { return { user: null, revision: 0 }; }
  });
  return <SessionApp key={session.revision} initialUser={session.user}
    onSessionChange={user => setSession(current => ({ user, revision: current.revision + 1 }))} />;
}

type SessionProps = { initialUser: SessionUser | null; onSessionChange: (user: SessionUser | null) => void };

function SessionApp(props: SessionProps) {
  // A new identity gets a new component tree and cache, including all form drafts.
  const [client] = useState(createSessionQueryClient);
  useEffect(() => () => { void client.cancelQueries(); }, [client]);
  return <QueryClientProvider client={client}><Workspace {...props} /></QueryClientProvider>;
}

function Workspace({ initialUser, onSessionChange }: SessionProps) {
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
  const independentScope = activeTab === 'collaboration' || activeTab === 'portfolio';
  const [projectSearch, setProjectSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [selectedAnalysisId, setSelectedAnalysisId] = useState("");
  const [actionError, setError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "project" | "branch"; project: string; branch?: string } | null>(null);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = showDeleteModal ? deleteDialogRef.current : null;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    // ponytail: native modal dialogs keep the background inert without a focus-trap dependency.
    dialog.showModal();
    return () => {
      dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [showDeleteModal]);




  const [adminForm, setAdminForm] = useState({
    project_key: "",
    repoProvider: "github" as "github" | "azure-devops" | "other",
    repoUrl: "",
    pipelineProvider: "azure-devops" as "azure-devops" | "github-actions" | "other",
    pipelineUrl: ""
  });

  const sessionUser = initialUser;
  const [authScreen, setAuthScreen] = useState<'sign-in' | 'app' | 'sign-out'>(initialUser ? 'app' : 'sign-in');

  const [signInForm, setSignInForm] = useState({
    email: "",
    password: "",
    remember_me: true
  });
  const [signInError, setSignInError] = useState<string | null>(null);
  const signInEmailRef = useRef<HTMLInputElement | null>(null);
  const signInPasswordRef = useRef<HTMLInputElement | null>(null);

  const releaseName = useMemo(() => "Bootstrap 0.3", []);

  const queryClient = useQueryClient();
  const signedIn = !!sessionUser?.token;
  const [linkedAnalysisId] = useState(() => new URLSearchParams(window.location.search).get('analysis_id') ?? '');
  const [linkedFindingId] = useState(() => new URLSearchParams(window.location.search).get('finding_id') ?? '');
  useEffect(() => {
    if (linkedFindingId) setActiveTab('collaboration');
    else if (new URLSearchParams(window.location.search).get('tab') === 'portfolio') setActiveTab('portfolio');
  }, [linkedFindingId]);
  const linkedAnalysis = useQuery({ queryKey: ['analysis-link', linkedAnalysisId], enabled: signedIn && !!linkedAnalysisId,
    queryFn: ({ signal }) => apiJson<import('./types').AnalysisRecord>(`${API_BASE}/v1/analyses/${encodeURIComponent(linkedAnalysisId)}`, sessionUser?.token, { signal }) });
  const linkedSelectionApplied = useRef(false);
  useEffect(() => {
    if (!linkedAnalysis.data || linkedSelectionApplied.current) return;
    linkedSelectionApplied.current = true;
    setSelectedProject(linkedAnalysis.data.project_key); setSelectedBranch(linkedAnalysis.data.branch);
    setSelectedAnalysisId(linkedAnalysis.data.analysis_id); setActiveTab('issues');
    window.history.replaceState({}, '', window.location.pathname);
  }, [linkedAnalysis.data]);
  const [branchPage, setBranchPage] = useState({ project: '', cursor: '' });
  const branchCursor = branchPage.project === selectedProject ? branchPage.cursor : '';
  const [projectCursor, setProjectCursor] = useState('');
  const [historyPage, setHistoryPage] = useState({ project: '', branch: '', cursor: '' });
  const historyCursor = historyPage.project === selectedProject && historyPage.branch === selectedBranch ? historyPage.cursor : '';
  const { meQuery, analysesQuery, summaryQuery, selectedSummaryQuery, branchesQuery, selectedBranchQuery, defaultGateQuery, integrationsQuery, providersQuery, gatesQuery, assignmentsQuery, devOpsQuery } = useWorkspaceData(sessionUser?.token, activeTab === 'code' ? 'projects' : activeTab, activeAdminSection, selectedProject, selectedBranch, historyCursor, projectCursor, branchCursor);
  const canAccessAdministration = !meQuery.isError && meQuery.data?.permissions?.is_admin === true;
  const apiFetch = (url: string, init?: RequestInit) => request(url, sessionUser?.token, init);

  const analyses = useMemo(() => {
    const page = analysesQuery.data?.items ?? [];
    const linked = linkedAnalysis.data;
    return linked && linked.project_key === selectedProject && linked.branch === selectedBranch && !historyCursor && !page.some(item => item.analysis_id === linked.analysis_id)
      ? [linked, ...page] : page;
  }, [analysesQuery.data, linkedAnalysis.data, selectedProject, selectedBranch, historyCursor]);
  const projectMeta = useMemo<Record<string, ProjectMeta>>(() => Object.fromEntries((integrationsQuery.data ?? []).map(item => [item.project_key, {
    repoProvider: item.repo_provider, repoUrl: item.repo_url, pipelineProvider: item.pipeline_provider,
    pipelineUrl: item.pipeline_url, updatedAt: item.updated_at,
  }])), [integrationsQuery.data]);
  const authProviders = providersQuery.data ?? [];
  const entraProvider = authProviders.find(provider => provider.provider_id === 'azure-ad') ?? null;
  const gateLibrary = useMemo(() => (gatesQuery.data ?? (defaultGateQuery.data ? [defaultGateQuery.data] : []))
    .map(g => ({ ...g, projectCount: g.project_count ?? 0, builtIn: g.is_default ?? g.gate_id === defaultGateQuery.data?.gate_id })), [gatesQuery.data, defaultGateQuery.data]);
  const gateAssignments = assignmentsQuery.data ?? {};
  const azureDevOpsConfigs = devOpsQuery.data ?? [];
  const loading = summaryQuery.isFetching || analysesQuery.isFetching || defaultGateQuery.isFetching || integrationsQuery.isFetching;
  const dashboardError = linkedAnalysis.error ?? summaryQuery.error ?? analysesQuery.error ?? defaultGateQuery.error ?? integrationsQuery.error;
  const apiStatus: ApiConnectionState = dashboardError ? 'disconnected' : loading ? 'checking' : 'connected';
  const error = actionError ?? meQuery.error?.message ?? dashboardError?.message ?? (signedIn ? providersQuery.error?.message : null);
  const adminReadError = devOpsQuery.error?.message;
  const loadGates = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['gates'] }), queryClient.invalidateQueries({ queryKey: ['gate-assignments'] }),
  ]);
  const loadDashboard = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['analyses'] }), queryClient.invalidateQueries({ queryKey: ['gates'] }),
    queryClient.invalidateQueries({ queryKey: ['integrations'] }), queryClient.invalidateQueries({ queryKey: ['projects'] }),
    queryClient.invalidateQueries({ queryKey: ['vulnerabilities'] }),
  ]);
  const visibleTabs = useMemo(() => {
    return canAccessAdministration ? TABS : TABS.filter((tab) => tab.id !== "administration");
  }, [canAccessAdministration]);

  const summaries = useMemo<ProjectSummary[]>(() => ([...new Map([...(summaryQuery.data?.projects ?? []), ...(selectedSummaryQuery.data?.projects ?? [])].map(item => [item.project_key, item])).values()]).filter(item => item.latest).map(item => ({
    projectKey: item.project_key, latest: item.latest,
    history: item.project_key === selectedProject ? analyses : [item.latest],
    passCount: item.pass_count, failCount: item.fail_count, unknownCount: item.unknown_count,
    legacyCount: item.legacy_count, totalCount: item.total_count, branches: item.project_key === selectedProject ? [...new Map([...(branchesQuery.data?.items ?? []), ...(selectedBranchQuery.data?.items ?? [])].map(branch => [branch.name, branch])).values()] : item.branches,
  })), [summaryQuery.data, selectedSummaryQuery.data, branchesQuery.data, selectedBranchQuery.data, analyses, selectedProject]);

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
    window.localStorage.removeItem(LOCAL_STORAGE_GATE_LIBRARY_KEY);
    const queryParams = new URLSearchParams(window.location.search);
    const fragmentParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const entraSession = fragmentParams.get("entra_session") ?? queryParams.get("entra_session");
    const entraError = fragmentParams.get("entra_error") ?? queryParams.get("entra_error");
    queryParams.delete('entra_session'); queryParams.delete('entra_error');
    window.history.replaceState({}, "", window.location.pathname + (queryParams.size ? `?${queryParams}` : ""));

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
        onSessionChange(nextSession);
        window.localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(nextSession));
        setAuthScreen("app");
      } catch {
        setSignInError("Failed to read Azure AD session. Please try again.");
      }
      return;
    }

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
    return selectedProjectAnalyses.find((analysis) => analysis.analysis_id === selectedAnalysisId) ?? null;
  }, [selectedAnalysisId, selectedProjectAnalyses]);

  useEffect(() => {
    if (linkedAnalysisId && !linkedAnalysis.isError && !linkedSelectionApplied.current) return;
    if (!selectedProjectAnalyses.some((analysis) => analysis.analysis_id === selectedAnalysisId)) {
      setSelectedAnalysisId(selectedProjectAnalyses[0]?.analysis_id ?? "");
    }
  }, [selectedAnalysisId, selectedProjectAnalyses]);



  const normalizeErrorMessage = (err: unknown, fallback = "Unknown error") => {
    if (err instanceof Error && err.message) {
      return err.message;
    }
    if (typeof err === "string" && err.trim()) {
      return err;
    }
    return fallback;
  };

  const downloadExport = async (url: string, filename: string) => {
    try {
      const response = await apiFetch(url);
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

  useEffect(() => {
    window.localStorage.setItem(
      LOCAL_STORAGE_NAV_KEY,
      JSON.stringify({ tab: activeTab, adminTab: activeAdminTab, adminSection: activeAdminSection })
    );
  }, [activeTab, activeAdminTab, activeAdminSection]);

  useEffect(() => {
    if (!meQuery.isPending && !canAccessAdministration && activeTab === "administration") {
      setActiveTab("projects");
    }
  }, [activeTab, canAccessAdministration, meQuery.isPending]);

  const initializedProjectSelection = useRef(false);
  const hydratedProject = useRef('');
  useEffect(() => {
    if (!summaryQuery.data) return;
    if (!initializedProjectSelection.current) {
      initializedProjectSelection.current = true;
      if (!selectedProject) setSelectedProject(summaryQuery.data.projects[0]?.project_key ?? '');
    }
  }, [summaryQuery.data, selectedProject]);

  useEffect(() => {
    if (!adminForm.project_key) {
      return;
    }
    if (!integrationsQuery.data || hydratedProject.current === adminForm.project_key) return;
    hydratedProject.current = adminForm.project_key;
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




  const deleteMutation = useMutation({
    mutationFn: (target: NonNullable<typeof deleteTarget>) => {
      const url = target.type === "project"
        ? `${API_BASE}/v1/analyses/projects/${encodeURIComponent(target.project)}`
        : `${API_BASE}/v1/analyses/projects/${encodeURIComponent(target.project)}/branches/${encodeURIComponent(target.branch ?? "")}`;
      return apiFetch(url, { method: "DELETE" });
    },
    onSuccess: async () => {
      setShowDeleteModal(false);
      setDeleteTarget(null);
      await loadDashboard();
      await queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
    onError: (err: Error) => setError(err.message),
  });
  const deletingAnalyses = deleteMutation.isPending;
  const deleteAnalyses = () => { if (deleteTarget && !deletingAnalyses) deleteMutation.mutate(deleteTarget); };

  const projectMutation = useMutation({
    mutationFn: (form: typeof adminForm) =>
      apiFetch(`${API_BASE}/v1/integrations/projects/${encodeURIComponent(form.project_key)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_provider: form.repoProvider,
          repo_url: form.repoUrl.trim(),
          pipeline_provider: form.pipelineProvider,
          pipeline_url: form.pipelineUrl.trim()
        })
      }),
    onMutate: () => { setError(null); setAdminMessage(null); },
    onSuccess: async (_, form) => {
      await queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setAdminMessage(`Links saved for ${form.project_key}.`);
    },
    onError: (err: Error) => setError(err.message),
  });
  const savingProjectMeta = projectMutation.isPending;
  const saveProjectMeta = () => { if (adminForm.project_key && !savingProjectMeta) projectMutation.mutate(adminForm); };

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
      onSessionChange(nextSession);
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
    onSessionChange(null);
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
                {meQuery.data?.full_name ?? sessionUser.full_name} · {meQuery.data?.role ?? sessionUser.access_role}
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
        {!independentScope && <div className="workspace-context">
          <span>{selectedProject || "All projects"}</span>
          {selectedProject && selectedBranch && <code>{selectedBranch}</code>}
        </div>}
      </header>

      {!independentScope && <section className="global-tools">
        {activeTab !== 'code' && <div className="scope-toggle">
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
        </div>}
        <button type="button" onClick={() => void loadDashboard()} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </section>}


      {!independentScope && activeTab !== 'code' && scopeMode === "new-code" && <NewCode analysisId={selectedAnalysisId} token={sessionUser?.token} />}
      {!independentScope && loading && <p className="feedback" role="status">Loading analysis data…</p>}
      {!independentScope && error && <p className="feedback error" role="alert">Failed to load data: {error}. Previously loaded results may be out of date.</p>}
      {adminMessage && <p className="feedback" role="status">{adminMessage}</p>}

      {!independentScope && <div className="action-row" aria-label="Project pages">
        <span>Projets : page de 50 maximum, plus le projet sélectionné s’il est hors page.</span>
        {projectCursor && <button type="button" onClick={() => { setSelectedProject(''); setProjectCursor(''); }}>Première page de projets</button>}
        {summaryQuery.data?.next_cursor && <button type="button" onClick={() => { setSelectedProject(''); setProjectCursor(summaryQuery.data!.next_cursor!); }}>Projets suivants</button>}
      </div>}
      {!independentScope && selectedProject && <div className="action-row" aria-label="Branch pages">
        <span>Branches : 50 par page, plus la branche sélectionnée si elle est hors page.</span>
        {branchCursor && <button type="button" onClick={() => setBranchPage({ project: selectedProject, cursor: '' })}>Première page de branches</button>}
        {branchesQuery.data?.next && <button type="button" onClick={() => setBranchPage({ project: selectedProject, cursor: branchesQuery.data!.next! })}>Branches suivantes</button>}
        {branchesQuery.error && <p role="alert">{branchesQuery.error.message}</p>}
      </div>}
      {selectedProject && ['projects', 'issues', 'vulnerabilities', 'evolution', 'code'].includes(activeTab) && <div className="action-row" aria-label="Analysis history pages">
        <span>Historique : {analyses.length} analyses sur cette page (50 par page ; un lien direct peut ajouter son analyse).</span>
        {historyCursor && <button type="button" onClick={() => setHistoryPage({ project: selectedProject, branch: selectedBranch, cursor: '' })}>Première page</button>}
        {analysesQuery.data?.next && <button type="button" disabled={analysesQuery.isFetching} onClick={() => setHistoryPage({ project: selectedProject, branch: selectedBranch, cursor: analysesQuery.data!.next! })}>Analyses précédentes</button>}
      </div>}
      {activeTab === "projects" && scopeMode === "overall" && (
        <Projects summaries={summaries} filteredSummaries={filteredSummaries} selectedSummary={selectedSummary}
          selectedProject={selectedProject} selectedBranch={selectedBranch} setSelectedProject={setSelectedProject}
          setSelectedBranch={setSelectedBranch} setProjectSearch={setProjectSearch} loading={loading} error={error} downloadExport={downloadExport} />
      )}
      {activeTab === "projects" && selectedProject && <IngestionDetails project={selectedProject} analysisId={selectedAnalysisId} token={sessionUser?.token} />}
      {activeTab === 'code' && <>
        <ProjectHeader selectedSummary={selectedSummary} allSummaries={summaries} onProjectChange={project => { setSelectedProject(project); setSelectedBranch(''); }} onBranchChange={setSelectedBranch} selectedBranch={selectedBranch} selectedAnalysisId={selectedAnalysisId} onAnalysisChange={setSelectedAnalysisId} />
        <CodeExplorer key={selectedAnalysisId} api={API_BASE} token={sessionUser?.token} analysisId={selectedAnalysisId} />
        <CodeScopes key={selectedProject} api={API_BASE} token={sessionUser?.token} project={selectedProject} admin={canAccessAdministration} />
      </>}
      {activeTab === "issues" && scopeMode === "overall" && <Issues
        authToken={sessionUser?.token} isAdmin={canAccessAdministration} selectedProject={selectedProject} selectedBranch={selectedBranch}
        selectedAnalysisId={selectedAnalysisId} selectedSummary={selectedSummary} summaries={summaries}
        setSelectedProject={setSelectedProject} setSelectedBranch={setSelectedBranch} setSelectedAnalysisId={setSelectedAnalysisId}
        projectMeta={projectMeta} />}

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

      {activeTab === "rules" && <AnalysisProfiles key={selectedProject} api={API_BASE} token={sessionUser?.token} project={selectedProject} admin={canAccessAdministration} />}
      {activeTab === "rules" && <Rules apiBase={API_BASE} authToken={sessionUser?.token} selectedProject={selectedProject} onProjectChange={(project) => { setSelectedProject(project); setSelectedBranch(""); }} summaries={summaries} canSuppressRules={false} />}

      {activeTab === "quality-gates" && <>
        {(gatesQuery.error ?? assignmentsQuery.error) && <p className="feedback error" role="alert">
          {(gatesQuery.error ?? assignmentsQuery.error)?.message}
          <button type="button" onClick={() => void loadGates()}>Retry quality gates</button>
        </p>}
        {(gatesQuery.isLoading || assignmentsQuery.isLoading) && <p role="status">Loading quality gates and assignments…</p>}
        {gatesQuery.data !== undefined && assignmentsQuery.data !== undefined && <QualityGates gateLibrary={gateLibrary} gateAssignments={gateAssignments} summaries={summaries} scopeMode={scopeMode}
          canAccessAdministration={canAccessAdministration && !gatesQuery.isError && !assignmentsQuery.isError} apiBase={API_BASE} apiFetch={apiFetch} />}
      </>}

      {activeTab === "evolution" && scopeMode === "overall" && (
        <Evolution summaries={summaries} selectedSummary={selectedSummary} selectedProject={selectedProject} selectedBranch={selectedBranch}
          setSelectedProject={setSelectedProject} setSelectedBranch={setSelectedBranch} selectedProjectAnalyses={selectedProjectAnalyses} />
      )}
      {activeTab === 'collaboration' && <Collaboration authToken={sessionUser?.token} isAdmin={canAccessAdministration} summaries={summaries} initialFindingId={linkedFindingId} />}
      {activeTab === 'portfolio' && <Portfolio apiBase={API_BASE} authToken={sessionUser?.token} isAdmin={canAccessAdministration} />}
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
              {adminReadError && <p className="feedback error" role="alert">{adminReadError}</p>}
              {(activeAdminSection === "general-settings" || activeAdminSection === "analysis-scope" || activeAdminSection === "data-retention") && (
                <PlatformSettingsPanel authToken={sessionUser?.token} activeSection={activeAdminSection} />
              )}

              {activeAdminSection === "access-management" && (
                <>
                  <AuthProviderSettings authToken={sessionUser?.token} />
                  <UsersAccess apiBase={API_BASE} authToken={sessionUser?.token} />
                </>
              )}

              {activeAdminSection === "pat-management" && <CiTokens authToken={sessionUser?.token} />}

              {activeAdminSection === "audit-log" && <AuditLog authToken={sessionUser?.token} />}
              {activeAdminSection === "notifications" && <Notifications authToken={sessionUser?.token} />}

              {activeAdminSection === "devops-integrations" && <DevOpsIntegrations authToken={sessionUser?.token} />}

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

              {showDeleteModal && deleteTarget && (
                  <dialog className="config-modal" ref={deleteDialogRef} aria-label="Confirm deletion" onCancel={(event) => { event.preventDefault(); if (!deletingAnalyses) setShowDeleteModal(false); }}>
                    <header className="config-modal-header">
                      <h3>Confirm deletion</h3>
                      <button type="button" onClick={() => setShowDeleteModal(false)} disabled={deletingAnalyses}>Cancel</button>
                    </header>
                    <div style={{ padding: "16px" }}>
                      {deleteMutation.error && <p className="feedback error" role="alert">{deleteMutation.error.message}</p>}
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
