import InfoHint from './InfoHint';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '../api';
import { DEFAULT_PLATFORM_SETTINGS } from '../types';
import type { PlatformSettings } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api');
type Props = { authToken?: string; activeSection: 'general-settings' | 'analysis-scope' | 'data-retention' };

export default function PlatformSettingsPanel({ authToken, activeSection }: Props) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Partial<PlatformSettings>>({});
  const [message, setMessage] = useState<string | null>(null);
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: ({ signal }) => apiJson<PlatformSettings>(`${API_BASE}/v1/platform/settings`, authToken, { signal }),
  });
  const cleanupQuery = useQuery({
    queryKey: ['cleanup'],
    enabled: activeSection === 'data-retention',
    queryFn: ({ signal }) => apiJson<{ last_cleanup_at: string; last_cleanup_deleted: number }>(`${API_BASE}/v1/platform/cleanup/status`, authToken, { signal }),
  });
  const cleanupStatus = cleanupQuery.data ?? null;
  const platformSettings = { ...DEFAULT_PLATFORM_SETTINGS, ...settingsQuery.data, ...draft };
  const settingsMutation = useMutation({
    mutationFn: ({ updates }: { updates: Partial<PlatformSettings>; successMessage: string }) =>
      apiJson<PlatformSettings>(`${API_BASE}/v1/platform/settings`, authToken, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) }),
    onMutate: () => {
      setMessage(null);
      cleanupMutation.reset();
    },
    onSuccess: async (saved, { updates, successMessage }) => {
      queryClient.setQueryData(['settings'], saved);
      setDraft((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !(key in updates))));
      setMessage(successMessage);
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
  const cleanupMutation = useMutation({
    mutationFn: () => apiJson<{ deleted_analyses: number; cleanup_at: string }>(`${API_BASE}/v1/platform/cleanup`, authToken, { method: 'POST' }),
    onMutate: () => {
      setMessage(null);
      settingsMutation.reset();
    },
    onSuccess: async (result) => {
      setMessage(`Cleanup done: ${result.deleted_analyses} analyses deleted.`);
      await Promise.all(['cleanup', 'analyses', 'projects', 'vulnerabilities', 'audit', 'gates'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    },
  });
  const savingPlatformSettings = settingsMutation.isPending;
  const runningCleanup = cleanupMutation.isPending;
  const savePlatformSettings = (updates: Partial<PlatformSettings>, successMessage: string) => {
    if (!savingPlatformSettings) settingsMutation.mutate({ updates, successMessage });
  };
  if (settingsQuery.isLoading) return <p role="status">Loading platform settings…</p>;
  if (!settingsQuery.data)
    return (
      <p className="feedback error" role="alert">
        {settingsQuery.error?.message ?? 'Platform settings unavailable.'}
      </p>
    );
  return (
    <>
      {settingsQuery.error && (
        <p className="feedback error" role="alert">
          {settingsQuery.error.message}
        </p>
      )}
      {message && (
        <p className="feedback success" role="status">
          {message}
        </p>
      )}
      {(settingsMutation.error ?? cleanupMutation.error) && (
        <p className="feedback error" role="alert">
          {(settingsMutation.error ?? cleanupMutation.error)?.message}
        </p>
      )}
      <fieldset className="notification-fields" disabled={savingPlatformSettings || runningCleanup} aria-label="Platform settings">
        {activeSection === 'general-settings' && (
          <>
            <h2>
              General Settings <InfoHint>Edit global settings for this Sonar-like instance.</InfoHint>
            </h2>
            <div className="auth-card">
              <h3>General</h3>
              <div className="form-grid compact">
                <label>
                  Instance name
                  <input value={platformSettings.instance_name} onChange={(e) => setDraft((current) => ({ ...current, instance_name: e.target.value }))} />
                </label>
                <label>
                  Report max size on DB (MB)
                  <input value={platformSettings.report_max_size_mb} onChange={(e) => setDraft((current) => ({ ...current, report_max_size_mb: e.target.value }))} />
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
                        report_max_size_mb: platformSettings.report_max_size_mb,
                      },
                      'General settings saved.',
                    )
                  }
                >
                  {savingPlatformSettings ? 'Saving…' : 'Save general settings'}
                </button>
              </div>
            </div>
          </>
        )}

        {activeSection === 'analysis-scope' && (
          <>
            <h2>
              Analysis Scope <InfoHint>Define global source exclusions and analysis boundaries.</InfoHint>
            </h2>
            <div className="form-grid compact">
              <label>
                Global Source File Exclusions
                <input value={platformSettings.global_source_exclusions} onChange={(e) => setDraft((current) => ({ ...current, global_source_exclusions: e.target.value }))} />
              </label>
              <label>
                Source File Exclusions
                <input value={platformSettings.source_file_exclusions} onChange={(e) => setDraft((current) => ({ ...current, source_file_exclusions: e.target.value }))} />
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
                      source_file_exclusions: platformSettings.source_file_exclusions,
                    },
                    'Scope policy saved.',
                  )
                }
              >
                {savingPlatformSettings ? 'Saving…' : 'Save scope'}
              </button>
              <button
                type="button"
                disabled={savingPlatformSettings}
                onClick={() =>
                  void savePlatformSettings(
                    {
                      global_source_exclusions: DEFAULT_PLATFORM_SETTINGS.global_source_exclusions,
                      source_file_exclusions: DEFAULT_PLATFORM_SETTINGS.source_file_exclusions,
                    },
                    'Default scope restored.',
                  )
                }
              >
                Restore defaults
              </button>
            </div>
          </>
        )}

        {activeSection === 'data-retention' && (
          <>
            <h2>
              Data Retention <InfoHint>Configure automatic cleanup of old analysis data to prevent database growth.</InfoHint>
            </h2>

            <div className="auth-card">
              <h3>Retention rules</h3>
              <div className="form-grid compact">
                <label>
                  Keep completed analyses (days)
                  <input type="number" min="7" max="3650" value={platformSettings.retention_keep_days} onChange={(e) => setDraft((s) => ({ ...s, retention_keep_days: e.target.value }))} />
                </label>
                <label>
                  Keep failed analyses (days)
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={platformSettings.retention_keep_failed_days}
                    onChange={(e) => setDraft((s) => ({ ...s, retention_keep_failed_days: e.target.value }))}
                  />
                </label>
                <label>
                  Max analyses kept per branch
                  <input type="number" min="1" max="500" value={platformSettings.retention_max_per_branch} onChange={(e) => setDraft((s) => ({ ...s, retention_max_per_branch: e.target.value }))} />
                </label>
                <label>
                  Protected branches (never deleted, comma-separated)
                  <input
                    type="text"
                    placeholder="master,main,develop"
                    value={platformSettings.retention_protected_branches}
                    onChange={(e) => setDraft((s) => ({ ...s, retention_protected_branches: e.target.value }))}
                  />
                </label>
              </div>
              <div className="form-grid compact" style={{ marginTop: '0.75rem' }}>
                <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={platformSettings.retention_auto_cleanup === 'true'}
                    onChange={(e) =>
                      setDraft((s) => ({
                        ...s,
                        retention_auto_cleanup: e.target.checked ? 'true' : 'false',
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
                      'Retention policy saved.',
                    )
                  }
                >
                  {savingPlatformSettings ? 'Saving…' : 'Save retention policy'}
                </button>
              </div>
            </div>

            <div className="auth-card" style={{ marginTop: '1.5rem' }}>
              <h3>Audit log retention</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                Audit entries older than this threshold are deleted during cleanup. Minimum enforced server-side: 30 days.
              </p>
              <div className="form-grid compact">
                <label>
                  Keep audit logs (days)
                  <input type="number" min="30" max="3650" value={platformSettings.audit_log_retention_days} onChange={(e) => setDraft((s) => ({ ...s, audit_log_retention_days: e.target.value }))} />
                </label>
              </div>
              <p style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '0.4rem' }}>Default: 365 days (1 year). Recommended minimum for ISO 27001 / SOC 2: 90 days.</p>
            </div>

            <div className="auth-card" style={{ marginTop: '1.5rem' }}>
              <h3>Manual cleanup</h3>
              {cleanupQuery.isLoading ? (
                <p role="status">Loading cleanup status…</p>
              ) : cleanupQuery.isError ? (
                <p className="feedback error" role="alert">
                  {cleanupQuery.error.message}
                </p>
              ) : cleanupStatus?.last_cleanup_at ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  Last cleanup: {new Date(cleanupStatus.last_cleanup_at).toLocaleString()} — {cleanupStatus.last_cleanup_deleted} analyses deleted
                </p>
              ) : (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>No cleanup has run yet.</p>
              )}
              <div className="action-row">
                <button type="button" disabled={runningCleanup} onClick={() => cleanupMutation.mutate()}>
                  {runningCleanup ? 'Running…' : 'Run cleanup now'}
                </button>
              </div>
            </div>
          </>
        )}
      </fieldset>
    </>
  );
}
