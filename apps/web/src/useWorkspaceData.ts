import { useQuery } from '@tanstack/react-query';
import { apiJson } from './api';
import type { AnalysisRecord, GateLibraryItem, ProjectIntegrationRecord, AuthProvider, SessionUser, LocalUserRole, AzureDevOpsOrganizationConfig, AppTab, AdminSection } from './types';
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api');

export function useWorkspaceData(authToken: string | undefined, activeTab: AppTab, activeAdminSection: AdminSection) {
  const signedIn = !!authToken;
  const meQuery = useQuery({
    queryKey: ['me'], enabled: signedIn,
    queryFn: ({ signal }) => apiJson<{ email: string; full_name: string; role: LocalUserRole; permissions: SessionUser['permissions'] }>(`${API_BASE}/v1/auth/me`, authToken, { signal }),
  });

  const canAccessAdministration = !meQuery.isError && meQuery.data?.permissions?.is_admin === true;
  const adminActive = canAccessAdministration && activeTab === 'administration';
  const analysesQuery = useQuery({
    queryKey: ['analyses'], enabled: signedIn,
    queryFn: ({ signal }) => apiJson<AnalysisRecord[]>(`${API_BASE}/v1/analyses`, authToken, { signal }),
  });

  const defaultGateQuery = useQuery({
    queryKey: ['gates', 'default'], enabled: signedIn,
    queryFn: ({ signal }) => apiJson<GateLibraryItem>(`${API_BASE}/v1/gates/default`, authToken, { signal }),
  });

  const integrationsQuery = useQuery({
    queryKey: ['integrations'], enabled: signedIn,
    queryFn: ({ signal }) => apiJson<ProjectIntegrationRecord[]>(`${API_BASE}/v1/integrations/projects`, authToken, { signal }),
  });

  const providersQuery = useQuery({
    queryKey: ['providers'],
    queryFn: ({ signal }) => apiJson<AuthProvider[]>(`${API_BASE}/v1/integrations/providers`, authToken, { signal }),
  });

  const gatesQuery = useQuery({
    queryKey: ['gates', 'library'], enabled: signedIn && activeTab === 'quality-gates',
    queryFn: ({ signal }) => apiJson<GateLibraryItem[]>(`${API_BASE}/v1/gates`, authToken, { signal }),
  });

  const assignmentsQuery = useQuery({
    queryKey: ['gate-assignments'], enabled: signedIn && activeTab === 'quality-gates',
    queryFn: ({ signal }) => apiJson<Record<string, string>>(`${API_BASE}/v1/gates/assignments`, authToken, { signal }),
  });

  const devOpsQuery = useQuery({
    queryKey: ['devops'], enabled: adminActive && activeAdminSection === 'project-links',
    queryFn: ({ signal }) => apiJson<AzureDevOpsOrganizationConfig[]>(`${API_BASE}/v1/integrations/azure-devops/configs`, authToken, { signal }),
  });

  return { meQuery, analysesQuery, defaultGateQuery, integrationsQuery, providersQuery, gatesQuery, assignmentsQuery, devOpsQuery };
}
