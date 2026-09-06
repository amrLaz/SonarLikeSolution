import InfoHint from './InfoHint';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch as authenticatedFetch, apiJson } from '../api';
import type { LocalUserRole, LocalUserType, PlatformUser, ProjectCatalogItem, OrganizationCatalogItem } from '../types';

export default function UsersAccess({ apiBase: API_BASE, authToken }: { apiBase: string; authToken?: string }) {
  const queryClient = useQueryClient();
  const apiFetch = (url: string, init?: RequestInit) => authenticatedFetch(url, authToken, init);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const usersQuery = useQuery({ queryKey: ['users'], enabled: !!authToken, queryFn: ({ signal }) => apiJson<PlatformUser[]>(`${API_BASE}/v1/auth/users`, authToken, { signal }) });
  const projectsQuery = useQuery({ queryKey: ['projects'], enabled: !!authToken, queryFn: ({ signal }) => apiJson<ProjectCatalogItem[]>(`${API_BASE}/v1/projects`, authToken, { signal }) });
  const organizationsQuery = useQuery({
    queryKey: ['organizations'],
    enabled: !!authToken,
    queryFn: ({ signal }) => apiJson<OrganizationCatalogItem[]>(`${API_BASE}/v1/projects/organizations/catalog`, authToken, { signal }),
  });
  const platformUsers = usersQuery.data ?? [];
  const projectCatalog = projectsQuery.data ?? [];
  const organizationCatalog = organizationsQuery.data ?? [];
  const usersLoading = usersQuery.isLoading;
  const accessCatalogLoading = projectsQuery.isLoading || organizationsQuery.isLoading;
  const loadPlatformUsers = () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: ['users'] }), queryClient.invalidateQueries({ queryKey: ['me'] }), queryClient.invalidateQueries({ queryKey: ['audit'] })]);
  const [grantForm, setGrantForm] = useState({ user_id: '', organization_ids: [] as string[], project_keys: [] as string[] });

  const [newLocalUser, setNewLocalUser] = useState({
    full_name: '',
    email: '',
    password: '',
    user_type: 'internal' as LocalUserType,
    access_role: 'default' as LocalUserRole,
  });

  const [passwordForm, setPasswordForm] = useState({
    user_id: '',
    password: '',
  });

  const activeLocalUsers = useMemo(() => {
    return Array.isArray(platformUsers) ? platformUsers.filter((u) => u.is_active).length : 0;
  }, [platformUsers]);

  const roleCapabilities: Record<LocalUserRole, string> = {
    admin: 'Manage configuration, users, explicit grants, integrations, and quality gates.',
    regular: 'View explicitly assigned projects and their results in read-only mode.',
    default: 'View projects, issues, and dashboards in read-only mode.',
  };

  const editUserGrants = (userId: string) => {
    const user = platformUsers.find((item) => item.user_id === userId);
    setGrantForm({
      user_id: userId,
      organization_ids: user?.grants.filter((grant) => grant.scope_type === 'organization').map((grant) => grant.scope_id) ?? [],
      project_keys: user?.grants.filter((grant) => grant.scope_type === 'project').map((grant) => grant.scope_id) ?? [],
    });
  };

  const grantsMutation = useMutation({
    mutationFn: (form: typeof grantForm) =>
      apiJson<{ organization_ids: string[]; project_keys: string[] }>(`${API_BASE}/v1/auth/users/${encodeURIComponent(form.user_id)}/grants`, authToken, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_ids: form.organization_ids, project_keys: form.project_keys }),
      }),
    onSuccess: async (saved, form) => {
      setGrantForm((current) => (current.user_id === form.user_id ? { ...current, ...saved } : current));
      setAdminMessage('Explicit access grants updated.');
      await loadPlatformUsers();
    },
  });
  const savingGrants = grantsMutation.isPending;
  const saveUserGrants = () => {
    beginAction();
    if (grantForm.user_id) grantsMutation.mutate(grantForm);
  };

  const addUserMutation = useMutation({
    mutationFn: async () => {
      const full_name = newLocalUser.full_name.trim();
      const email = newLocalUser.email.trim().toLowerCase();
      const password = newLocalUser.password.trim();
      if (!full_name || !email || !password) throw new Error('User full name, email and password are required.');
      if (password.length < 8) throw new Error('Password must be at least 8 characters.');
      return apiFetch(`${API_BASE}/v1/auth/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name, email, password, role: newLocalUser.access_role }),
      });
    },
    onSuccess: async () => {
      setNewLocalUser({ full_name: '', email: '', password: '', user_type: 'internal', access_role: 'default' });
      setAdminMessage('User created.');
      await loadPlatformUsers();
    },
  });
  const passwordMutation = useMutation({
    mutationFn: async () => {
      const password = passwordForm.password.trim();
      if (!passwordForm.user_id || !password) throw new Error('Select a user and provide a new password.');
      if (password.length < 8) throw new Error('Password must be at least 8 characters.');
      return apiFetch(`${API_BASE}/v1/auth/users/${encodeURIComponent(passwordForm.user_id)}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: password }),
      });
    },
    onSuccess: async () => {
      setPasswordForm({ user_id: '', password: '' });
      setAdminMessage('Password updated.');
      await loadPlatformUsers();
    },
  });
  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: LocalUserRole }) =>
      apiFetch(`${API_BASE}/v1/auth/users/${encodeURIComponent(userId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) }),
    onSuccess: async () => {
      setAdminMessage('User role updated.');
      await loadPlatformUsers();
    },
  });
  const statusMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`${API_BASE}/v1/auth/users/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !platformUsers.find((user) => user.user_id === userId)?.is_active }),
      }),
    onSuccess: async () => {
      setAdminMessage('User status updated.');
      await loadPlatformUsers();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (userId: string) => apiFetch(`${API_BASE}/v1/auth/users/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
    onSuccess: async (_, userId) => {
      setGrantForm((current) => (current.user_id === userId ? { user_id: '', organization_ids: [], project_keys: [] } : current));
      setAdminMessage('User deleted.');
      await loadPlatformUsers();
    },
  });
  const mutations = [addUserMutation, passwordMutation, roleMutation, statusMutation, deleteMutation, grantsMutation];
  const pending = mutations.some((mutation) => mutation.isPending);
  const error = usersQuery.error ?? projectsQuery.error ?? organizationsQuery.error ?? mutations.find((mutation) => mutation.isError)?.error;
  const beginAction = () => {
    setAdminMessage(null);
    mutations.forEach((mutation) => mutation.reset());
  };
  const addLocalUser = () => {
    beginAction();
    addUserMutation.mutate();
  };
  const updateUserPassword = () => {
    beginAction();
    passwordMutation.mutate();
  };
  const setUserRole = (userId: string, role: LocalUserRole) => {
    beginAction();
    roleMutation.mutate({ userId, role });
  };
  const toggleUserStatus = (userId: string) => {
    beginAction();
    statusMutation.mutate(userId);
  };
  const removeLocalUser = (userId: string) => {
    beginAction();
    deleteMutation.mutate(userId);
  };
  return (
    <>
      {error && (
        <p className="feedback error" role="alert">
          {error.message}
        </p>
      )}
      {(usersQuery.isError || projectsQuery.isError || organizationsQuery.isError) && (
        <button
          type="button"
          onClick={() => {
            void usersQuery.refetch();
            void projectsQuery.refetch();
            void organizationsQuery.refetch();
          }}
        >
          Retry access data
        </button>
      )}
      {adminMessage && (
        <p className="feedback" role="status">
          {adminMessage}
        </p>
      )}
      <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
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
            <h3>
              Local Users <InfoHint>Manage local identities, user type, and access role.</InfoHint>
            </h3>
            <div className="form-grid compact">
              <label>
                Full name
                <input value={newLocalUser.full_name} onChange={(event) => setNewLocalUser((current) => ({ ...current, full_name: event.target.value }))} placeholder="Jane Doe" />
              </label>
              <label>
                Email
                <input value={newLocalUser.email} onChange={(event) => setNewLocalUser((current) => ({ ...current, email: event.target.value }))} placeholder="jane.doe@upcoop.local" />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={newLocalUser.password}
                  onChange={(event) => setNewLocalUser((current) => ({ ...current, password: event.target.value }))}
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
                      user_type: event.target.value as LocalUserType,
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
                      access_role: event.target.value as LocalUserRole,
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
              <button type="button" onClick={addLocalUser}>
                Add local user
              </button>
            </div>

            <div className="form-grid compact" style={{ marginTop: '0.75rem' }}>
              <label>
                User to update
                <select value={passwordForm.user_id} onChange={(event) => setPasswordForm((current) => ({ ...current, user_id: event.target.value }))}>
                  <option value="">Select user</option>
                  {platformUsers
                    .filter((u) => u.auth_provider === 'local')
                    .map((user) => (
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
                  onChange={(event) => setPasswordForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Set or reset password"
                />
              </label>
            </div>
            <div className="action-row">
              <button type="button" onClick={updateUserPassword}>
                Set/Reset password
              </button>
            </div>

            <div className="table-wrap">
              {usersLoading && <p style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>Loading users…</p>}
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
                        <span className={`iam-chip status ${user.is_active ? 'active' : 'disabled'}`}>{user.is_active ? 'active' : 'disabled'}</span>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : '—'}</td>
                      <td>
                        <div className="iam-subtext">
                          {user.role === 'admin'
                            ? 'All projects (administrator)'
                            : user.grants.length > 0
                              ? user.grants.map((grant) => `${grant.scope_type}: ${grant.scope_id}`).join(' · ')
                              : 'No project access'}
                        </div>
                      </td>
                      <td>
                        <div className="iam-inline-actions">
                          <button type="button" onClick={() => editUserGrants(user.user_id)}>
                            Edit access
                          </button>
                          <button type="button" onClick={() => setUserRole(user.user_id, 'admin')}>
                            Admin
                          </button>
                          <button type="button" onClick={() => setUserRole(user.user_id, 'regular')}>
                            Regular
                          </button>
                          <button type="button" onClick={() => setUserRole(user.user_id, 'default')}>
                            Default
                          </button>
                          <button type="button" onClick={() => toggleUserStatus(user.user_id)}>
                            {user.is_active ? 'Disable' : 'Enable'}
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
            <h3>
              Explicit organization and project access{' '}
              <InfoHint>
                An organization grant includes its projects. A project grant is limited to that project. An empty selection leaves a non-administrator without project access. Use Ctrl or Cmd to select
                several entries.
              </InfoHint>
            </h3>
            <div className="form-grid compact">
              <label>
                User
                <select value={grantForm.user_id} onChange={(event) => editUserGrants(event.target.value)}>
                  <option value="">Select user</option>
                  {platformUsers.map((user) => (
                    <option key={user.user_id} value={user.user_id}>
                      {user.full_name} · {user.email}
                    </option>
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
                  onChange={(event) =>
                    setGrantForm((current) => ({
                      ...current,
                      organization_ids: Array.from(event.currentTarget.selectedOptions, (option) => option.value),
                    }))
                  }
                >
                  {organizationCatalog.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name} ({organization.key})
                    </option>
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
                  onChange={(event) =>
                    setGrantForm((current) => ({
                      ...current,
                      project_keys: Array.from(event.currentTarget.selectedOptions, (option) => option.value),
                    }))
                  }
                >
                  {projectCatalog.map((project) => (
                    <option key={project.id} value={project.key}>
                      {project.name} ({project.key})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="action-row">
              <button type="button" onClick={() => void saveUserGrants()} disabled={!grantForm.user_id || savingGrants || accessCatalogLoading}>
                {savingGrants ? 'Saving...' : 'Save explicit access'}
              </button>
            </div>
          </div>

          <div className="auth-card iam-card">
            <h3>
              Access Management Matrix <InfoHint>Standard role capabilities for admin, regular user, and default user.</InfoHint>
            </h3>
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
                    <td>
                      <span className="iam-chip role admin">admin</span>
                    </td>
                    <td>{roleCapabilities.admin}</td>
                  </tr>
                  <tr>
                    <td>
                      <span className="iam-chip role regular">regular</span>
                    </td>
                    <td>{roleCapabilities.regular}</td>
                  </tr>
                  <tr>
                    <td>
                      <span className="iam-chip role default">default</span>
                    </td>
                    <td>{roleCapabilities.default}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </fieldset>
    </>
  );
}
