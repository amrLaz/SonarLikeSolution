import InfoHint from './InfoHint';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch as request, apiJson } from '../api';
import type { AzureDevOpsOrganizationConfig, DevOpsProviderTab } from '../types';
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api');

export default function DevOpsIntegrations({ authToken }: { authToken?: string }) {
  const [devOpsProviderTab, setDevOpsProviderTab] = useState<DevOpsProviderTab>('azure-devops');
  const [devOpsConfigModalOpen, setDevOpsConfigModalOpen] = useState(false);
  const [editingAzureDevOpsConfigId, setEditingAzureDevOpsConfigId] = useState<string | null>(null);
  const [azureDevOpsConfigForm, setAzureDevOpsConfigForm] = useState({
    config_name: '',
    organization_url: 'https://dev.azure.com/your-organization',
    personal_access_token: '',
    repo_import_enabled: false,
    quality_gate_enabled: false,
  });

  const queryClient = useQueryClient();
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const devOpsQuery = useQuery({
    queryKey: ['devops'],
    queryFn: ({ signal }) => apiJson<AzureDevOpsOrganizationConfig[]>(`${API_BASE}/v1/integrations/azure-devops/configs`, authToken, { signal }),
  });
  const azureDevOpsConfigs = devOpsQuery.data ?? [];
  const configDialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = devOpsConfigModalOpen ? configDialogRef.current : null;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [devOpsConfigModalOpen]);
  const openCreateAzureDevOpsConfigModal = () => {
    mutation.reset();
    setAdminMessage(null);
    setEditingAzureDevOpsConfigId(null);
    setAzureDevOpsConfigForm({
      config_name: '',
      organization_url: 'https://dev.azure.com/your-organization',
      personal_access_token: '',
      repo_import_enabled: false,
      quality_gate_enabled: false,
    });
    setDevOpsConfigModalOpen(true);
  };

  const openEditAzureDevOpsConfigModal = (config: AzureDevOpsOrganizationConfig) => {
    mutation.reset();
    setAdminMessage(null);
    setEditingAzureDevOpsConfigId(config.config_id);
    setAzureDevOpsConfigForm({
      config_name: config.config_name,
      organization_url: config.organization_url,
      personal_access_token: '',
      repo_import_enabled: config.repo_import_enabled,
      quality_gate_enabled: config.quality_gate_enabled,
    });
    setDevOpsConfigModalOpen(true);
  };

  const mutation = useMutation({
    mutationFn: async (action: { kind: 'save'; id: string | null; form: typeof azureDevOpsConfigForm } | { kind: 'test' | 'delete'; id: string }) => {
      const endpoint = `${API_BASE}/v1/integrations/azure-devops/configs${action.id ? `/${encodeURIComponent(action.id)}` : ''}`;
      await request(
        action.kind === 'test' ? `${endpoint}/test` : endpoint,
        authToken,
        action.kind === 'save'
          ? {
              method: action.id ? 'PUT' : 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(action.form),
            }
          : { method: action.kind === 'delete' ? 'DELETE' : 'POST' },
      );
    },
    onMutate: () => setAdminMessage(null),
    onSuccess: (_result, action) => {
      if (action.kind === 'save') {
        setDevOpsConfigModalOpen(false);
        setAzureDevOpsConfigForm((current) => ({ ...current, personal_access_token: '' }));
      }
      setAdminMessage(
        action.kind === 'save'
          ? `Azure DevOps configuration ${action.id ? 'updated' : 'created'}.`
          : action.kind === 'test'
            ? 'Azure DevOps configuration checked.'
            : 'Azure DevOps configuration deleted.',
      );
    },
    onSettled: async (_result, error, action) => {
      // The test endpoint persists last_error/status even when it returns an HTTP error.
      if (!error || action.kind === 'test') await queryClient.invalidateQueries({ queryKey: ['devops'] });
    },
  });
  const savingAzureDevOpsConfig = mutation.isPending && mutation.variables.kind === 'save';
  const testingAzureDevOpsConfigId = mutation.isPending && mutation.variables.kind === 'test' ? mutation.variables.id : null;
  const deletingAzureDevOpsConfigId = mutation.isPending && mutation.variables.kind === 'delete' ? mutation.variables.id : null;
  const error = mutation.error?.message;
  const saveAzureDevOpsConfig = () => {
    if (!mutation.isPending) mutation.mutate({ kind: 'save', id: editingAzureDevOpsConfigId, form: azureDevOpsConfigForm });
  };
  const testAzureDevOpsConfig = (id: string) => {
    if (!mutation.isPending) mutation.mutate({ kind: 'test', id });
  };
  const deleteAzureDevOpsConfig = (config: AzureDevOpsOrganizationConfig) => {
    if (!mutation.isPending && window.confirm(`Delete Azure DevOps configuration "${config.config_name}"?`)) mutation.mutate({ kind: 'delete', id: config.config_id });
  };

  return (
    <>
      {((!devOpsConfigModalOpen && error) || devOpsQuery.error) && (
        <p className="feedback error" role="alert">
          {error ?? devOpsQuery.error?.message}
        </p>
      )}
      {adminMessage && (
        <p className="feedback" role="status">
          {adminMessage}
        </p>
      )}

      <>
        <h2>
          DevOps Platform Integrations <InfoHint>Connect your platform to Azure DevOps at organization level, just like Sonar.</InfoHint>
        </h2>
        <div className="auth-card" style={{ marginTop: '1rem' }}>
          <p style={{ margin: 0, opacity: 0.85 }}>
            <strong>Important:</strong> this integration enables ALM features in the platform (for example PR decoration, repository import, and quality-gate feedback in Azure DevOps).
          </p>
          <p style={{ margin: '0.5rem 0 0', opacity: 0.75 }}>Pipeline authentication is separate and must be configured in your CI service connection or pipeline secrets to send analysis results.</p>
        </div>

        <div className="devops-provider-tabs">
          {[
            ['github', 'GitHub'],
            ['bitbucket', 'Bitbucket'],
            ['azure-devops', 'Azure DevOps'],
            ['gitlab', 'GitLab'],
          ].map(([id, label]) => (
            <button key={id} type="button" className={devOpsProviderTab === id ? 'active' : ''} onClick={() => setDevOpsProviderTab(id as DevOpsProviderTab)}>
              {label}
            </button>
          ))}
        </div>

        {devOpsProviderTab !== 'azure-devops' ? (
          <div className="auth-card" style={{ marginTop: '1rem' }}>
            <p style={{ margin: 0, opacity: 0.75 }}>{devOpsProviderTab} configuration UI is not implemented yet. Use Azure DevOps to connect your organization for now.</p>
          </div>
        ) : (
          <>
            <div className="action-row" style={{ marginTop: '1rem' }}>
              <button type="button" disabled={mutation.isPending} onClick={openCreateAzureDevOpsConfigModal}>
                Create configuration
              </button>
            </div>

            <div className="azure-devops-config-list">
              {devOpsQuery.isLoading ? (
                <p role="status">Loading Azure DevOps configurations…</p>
              ) : devOpsQuery.isError && !devOpsQuery.data ? null : azureDevOpsConfigs.length === 0 ? (
                <div className="auth-card" style={{ marginTop: '1rem' }}>
                  <p style={{ margin: 0, opacity: 0.75 }}>No Azure DevOps organization configured yet.</p>
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
                        <button type="button" disabled={mutation.isPending} onClick={() => openEditAzureDevOpsConfigModal(config)}>
                          Edit
                        </button>
                        <button type="button" className="danger" onClick={() => void deleteAzureDevOpsConfig(config)} disabled={mutation.isPending}>
                          {deletingAzureDevOpsConfigId === config.config_id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>

                    <div className="azure-devops-config-capabilities">
                      <p className={config.quality_gate_enabled ? 'integration-check ok' : 'integration-check ko'}>
                        <span aria-hidden="true" />
                        Quality Gate status reporting
                      </p>
                      <p className={config.repo_import_enabled ? 'integration-check ok' : 'integration-check ko'}>
                        <span aria-hidden="true" />
                        Import repositories from your DevOps Platform
                      </p>
                      <p className={config.pat_configured ? 'integration-check ok' : 'integration-check ko'}>
                        <span aria-hidden="true" />
                        Personal Access Token configured
                      </p>
                    </div>

                    <div className="azure-devops-config-meta">
                      <p>
                        Status: <strong>{config.status}</strong>
                      </p>
                      <p>Last checked: {config.last_tested_at ? new Date(config.last_tested_at).toLocaleString() : 'never'}</p>
                      {config.last_error && <p className="fail">Error: {config.last_error}</p>}
                    </div>

                    <div className="action-row">
                      <button type="button" onClick={() => void testAzureDevOpsConfig(config.config_id)} disabled={mutation.isPending}>
                        {testingAzureDevOpsConfigId === config.config_id ? 'Checking...' : 'Check configuration'}
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </>
        )}
      </>
      {devOpsConfigModalOpen && (
        <dialog
          className="config-modal"
          ref={configDialogRef}
          aria-labelledby="config-dialog-title"
          onCancel={(event) => {
            event.preventDefault();
            if (!savingAzureDevOpsConfig) setDevOpsConfigModalOpen(false);
          }}
        >
          <header className="config-modal-header">
            <h3 id="config-dialog-title">{editingAzureDevOpsConfigId ? 'Edit the configuration' : 'Create a configuration'}</h3>
            <button type="button" disabled={savingAzureDevOpsConfig} onClick={() => setDevOpsConfigModalOpen(false)}>
              Cancel
            </button>
          </header>
          {error && (
            <p className="feedback error" role="alert">
              {error}
            </p>
          )}
          <fieldset className="notification-fields" disabled={savingAzureDevOpsConfig} aria-label="Azure DevOps configuration">
            <div className="form-grid compact">
              <label>
                Configuration name
                <input
                  value={azureDevOpsConfigForm.config_name}
                  onChange={(event) => setAzureDevOpsConfigForm((current) => ({ ...current, config_name: event.target.value }))}
                  placeholder="up-group-azure-devops"
                />
              </label>
              <label>
                Azure DevOps URL
                <input
                  value={azureDevOpsConfigForm.organization_url}
                  onChange={(event) => setAzureDevOpsConfigForm((current) => ({ ...current, organization_url: event.target.value }))}
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
                      personal_access_token: event.target.value,
                    }))
                  }
                  placeholder={editingAzureDevOpsConfigId ? 'Leave blank to keep current PAT' : 'Paste Azure DevOps PAT'}
                  autoComplete="off"
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={azureDevOpsConfigForm.quality_gate_enabled}
                  onChange={(event) =>
                    setAzureDevOpsConfigForm((current) => ({
                      ...current,
                      quality_gate_enabled: event.target.checked,
                    }))
                  }
                />
                Enable PR decoration &amp; quality gate reporting
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={azureDevOpsConfigForm.repo_import_enabled}
                  onChange={(event) =>
                    setAzureDevOpsConfigForm((current) => ({
                      ...current,
                      repo_import_enabled: event.target.checked,
                    }))
                  }
                />
                Enable repository import
              </label>
            </div>
            <div className="action-row" style={{ marginTop: '1rem' }}>
              <button type="button" onClick={() => void saveAzureDevOpsConfig()} disabled={savingAzureDevOpsConfig}>
                {savingAzureDevOpsConfig ? 'Saving...' : 'Save configuration'}
              </button>
              <button type="button" disabled={savingAzureDevOpsConfig} onClick={() => setDevOpsConfigModalOpen(false)}>
                Cancel
              </button>
            </div>
          </fieldset>
        </dialog>
      )}
    </>
  );
}
