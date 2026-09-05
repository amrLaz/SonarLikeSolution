import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '../api';
import type { AuthProvider } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api');

export default function AuthProviderSettings({ authToken }: { authToken?: string }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const hydratedProvider = useRef('');
  const providersQuery = useQuery({ queryKey: ['providers'], queryFn: ({ signal }) => apiJson<AuthProvider[]>(`${API_BASE}/v1/integrations/providers`, authToken, { signal }) });
  const authProviders = providersQuery.data ?? [];
  const [authForm, setAuthForm] = useState({
    provider_id: "github" as AuthProvider["provider_id"],
    connection_url: "https://github.com",
    tenant_id: "",
    client_id: "",
    client_secret: "",
    redirect_uri: "",
    scopes: "openid profile email",
  });

  const selectedAuthProvider = useMemo(
    () => authProviders.find((provider) => provider.provider_id === authForm.provider_id) ?? authProviders[0] ?? null,
    [authForm.provider_id, authProviders]
  );
  useEffect(() => {
    if (!selectedAuthProvider || hydratedProvider.current === selectedAuthProvider.provider_id) {
      return;
    }

    hydratedProvider.current = selectedAuthProvider.provider_id;
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
  const mutation = useMutation({
    mutationFn: async ({ action, form }: { action: 'save' | 'test' | 'disable'; form: typeof authForm }) => {
      const url = `${API_BASE}/v1/integrations/providers/${encodeURIComponent(form.provider_id)}`;
      if (action === 'disable') return apiJson<AuthProvider>(`${url}/disable`, authToken, { method: 'POST' });
      const body: Record<string, unknown> = { connection_url: form.connection_url.trim() };
      if (form.provider_id === 'azure-ad') {
        const config: Record<string, string> = { tenant_id: form.tenant_id.trim(), client_id: form.client_id.trim(), redirect_uri: form.redirect_uri.trim(), scopes: form.scopes.trim() };
        if (form.client_secret.trim()) config.client_secret = form.client_secret.trim();
        body.config_json = config;
      }
      const saved = await apiJson<AuthProvider>(url, authToken, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (action === 'test') {
        await queryClient.invalidateQueries({ queryKey: ['providers'] });
        return apiJson<AuthProvider>(`${url}/test`, authToken, { method: 'POST' });
      }
      return saved;
    },
    onMutate: () => setMessage(null),
    onSuccess: async (saved, { action, form }) => {
      if (action !== 'disable') setAuthForm(current => current.provider_id === form.provider_id && current.client_secret === form.client_secret ? { ...current, client_secret: '' } : current);
      setMessage(`${saved.display_name} ${action === 'disable' ? 'disabled' : action === 'test' ? 'configuration validated' : 'settings saved'}.`);
      await queryClient.invalidateQueries({ queryKey: ['providers'] });
    }
  });
  const savingAuthProvider = mutation.isPending && mutation.variables.action !== 'test';
  const testingAuthProvider = mutation.isPending && mutation.variables.action === 'test';
  const saveAuthProvider = () => mutation.mutate({ action: 'save', form: authForm });
  const testAuthProvider = () => mutation.mutate({ action: 'test', form: authForm });
  const disableAuthProvider = () => mutation.mutate({ action: 'disable', form: authForm });
  return <>
    {providersQuery.isLoading && <p role="status">Loading authentication providers…</p>}
    {(providersQuery.error ?? mutation.error) && <p className="feedback error" role="alert">{(providersQuery.error ?? mutation.error)?.message}</p>}
    {providersQuery.isError && <button type="button" onClick={() => void providersQuery.refetch()}>Retry authentication providers</button>}
    {message && <p className="feedback" role="status">{message}</p>}
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
                  {!providersQuery.isLoading && !providersQuery.isError && authProviders.length === 0 && <p role="status">No authentication providers configured.</p>}
                  {selectedAuthProvider && selectedAuthProvider.provider_id === authForm.provider_id && <div className="auth-card">
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
                      <button type="button" onClick={() => void testAuthProvider()} disabled={mutation.isPending || providersQuery.isError}>
                        {testingAuthProvider ? "Testing..." : "Test configuration"}
                      </button>
                      <button type="button" onClick={() => void saveAuthProvider()} disabled={mutation.isPending || providersQuery.isError}>
                        {savingAuthProvider ? "Saving..." : "Save"}
                      </button>
                      <button type="button" className="danger" onClick={() => void disableAuthProvider()} disabled={mutation.isPending || providersQuery.isError}>
                        Disable
                      </button>
                    </div>
                  </div>}

  </>;
}
