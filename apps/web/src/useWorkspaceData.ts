import { useQuery } from '@tanstack/react-query';
import { apiJson, apiPage } from './api';
import type { DashboardSummary } from './types';
import type { AnalysisRecord, GateLibraryItem, ProjectIntegrationRecord, AuthProvider, SessionUser, LocalUserRole, AzureDevOpsOrganizationConfig, AppTab, AdminSection } from './types';
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api');

export function useWorkspaceData(
  authToken: string | undefined,
  activeTab: AppTab,
  activeAdminSection: AdminSection,
  project = '',
  branch = '',
  cursor = '',
  projectCursor = '',
  branchCursor = '',
  favoritesOnly = false,
) {
  const signedIn = !!authToken;
  const meQuery = useQuery({
    queryKey: ['me'],
    enabled: signedIn,
    queryFn: ({ signal }) => apiJson<{ email: string; full_name: string; role: LocalUserRole; permissions: SessionUser['permissions'] }>(`${API_BASE}/v1/auth/me`, authToken, { signal }),
  });

  const canAccessAdministration = !meQuery.isError && meQuery.data?.permissions?.is_admin === true;
  const adminActive = canAccessAdministration && activeTab === 'administration';
  const analysesQuery = useQuery({
    queryKey: ['analyses', project, branch, cursor],
    enabled: signedIn && !!project,
    queryFn: ({ signal }) => apiPage<AnalysisRecord>(`${API_BASE}/v1/insights/analyses?${new URLSearchParams({ project_key: project, branch, cursor })}`, authToken, { signal }),
  });
  const summaryQuery = useQuery({
    queryKey: ['analyses', 'summary', projectCursor, activeTab === 'projects' && favoritesOnly],
    enabled: signedIn,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ cursor: projectCursor });
      if (activeTab === 'projects' && favoritesOnly) params.set('favorites_only', 'true');
      return apiJson<DashboardSummary>(`${API_BASE}/v1/insights/summary?${params}`, authToken, { signal });
    },
  });

  const selectedSummaryQuery = useQuery({
    queryKey: ['analyses', 'summary-project', project],
    enabled: signedIn && !!project,
    queryFn: ({ signal }) => apiJson<DashboardSummary>(`${API_BASE}/v1/insights/summary?project_key=${encodeURIComponent(project)}`, authToken, { signal }),
  });

  const branchesQuery = useQuery({
    queryKey: ['branches', project, branchCursor],
    enabled: signedIn && !!project,
    queryFn: ({ signal }) =>
      apiPage<{ name: string; count: number; latest: AnalysisRecord }>(`${API_BASE}/v1/insights/branches?${new URLSearchParams({ project_key: project, cursor: branchCursor })}`, authToken, {
        signal,
      }),
  });
  const selectedBranchQuery = useQuery({
    queryKey: ['branches', project, 'selected', branch],
    enabled: signedIn && !!project && !!branch,
    queryFn: ({ signal }) =>
      apiPage<{ name: string; count: number; latest: AnalysisRecord }>(`${API_BASE}/v1/insights/branches?${new URLSearchParams({ project_key: project, branch })}`, authToken, { signal }),
  });

  const defaultGateQuery = useQuery({
    queryKey: ['gates', 'default'],
    enabled: signedIn,
    queryFn: ({ signal }) => apiJson<GateLibraryItem>(`${API_BASE}/v1/gates/default`, authToken, { signal }),
  });

  const integrationsQuery = useQuery({
    queryKey: ['integrations'],
    enabled: signedIn,
    queryFn: ({ signal }) => apiJson<ProjectIntegrationRecord[]>(`${API_BASE}/v1/integrations/projects`, authToken, { signal }),
  });

  const providersQuery = useQuery({
    queryKey: ['providers'],
    queryFn: ({ signal }) => apiJson<AuthProvider[]>(`${API_BASE}/v1/integrations/providers`, authToken, { signal }),
  });

  const gatesQuery = useQuery({
    queryKey: ['gates', 'library'],
    enabled: signedIn && activeTab === 'quality-gates',
    queryFn: ({ signal }) => apiJson<GateLibraryItem[]>(`${API_BASE}/v1/gates`, authToken, { signal }),
  });

  const assignmentsQuery = useQuery({
    queryKey: ['gate-assignments'],
    enabled: signedIn && activeTab === 'quality-gates',
    queryFn: ({ signal }) => apiJson<Record<string, string>>(`${API_BASE}/v1/gates/assignments`, authToken, { signal }),
  });

  const devOpsQuery = useQuery({
    queryKey: ['devops'],
    enabled: adminActive && activeAdminSection === 'project-links',
    queryFn: ({ signal }) => apiJson<AzureDevOpsOrganizationConfig[]>(`${API_BASE}/v1/integrations/azure-devops/configs`, authToken, { signal }),
  });

  return {
    meQuery,
    analysesQuery,
    summaryQuery,
    selectedSummaryQuery,
    branchesQuery,
    selectedBranchQuery,
    defaultGateQuery,
    integrationsQuery,
    providersQuery,
    gatesQuery,
    assignmentsQuery,
    devOpsQuery,
  };
}
