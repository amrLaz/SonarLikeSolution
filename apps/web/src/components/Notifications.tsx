import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiJson } from '../api';
import type { NotificationChannel } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api');
const emptyForm = {
  name: '',
  channel_type: 'webhook' as 'webhook' | 'email',
  url: '',
  to_email: '',
  smtp_host: '',
  smtp_port: '587',
  smtp_user: '',
  smtp_password: '',
  smtp_from: '',
  on_fail: true,
  on_pass: false,
};

export default function Notifications({ authToken }: { authToken?: string }) {
  const queryClient = useQueryClient();
  const [notifMessage, setNotifMessage] = useState<string | null>(null);
  const [notifFormError, setNotifFormError] = useState<string | null>(null);
  const [showNotifForm, setShowNotifForm] = useState(false);
  const [notifForm, setNotifForm] = useState(emptyForm);
  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: ({ signal }) => apiJson<NotificationChannel[]>(`${API_BASE}/v1/notifications/channels`, authToken, { signal }),
  });
  const notifChannels = notificationsQuery.data ?? [];
  const notifLoading = notificationsQuery.isLoading;
  const saveMutation = useMutation({
    mutationFn: (payload: { name: string; channel_type: string; config: Record<string, string>; on_fail: boolean; on_pass: boolean; enabled: boolean }) =>
      apiFetch(`${API_BASE}/v1/notifications/channels`, authToken, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const notifSaving = saveMutation.isPending;
  const saveNotifChannel = async () => {
    if (notifSaving) return;
    const { channel_type, name, url, to_email, smtp_host, smtp_port, smtp_user, smtp_password, smtp_from, on_fail, on_pass } = notifForm;
    if (!name.trim()) {
      setNotifFormError('Name is required.');
      return;
    }
    const config: Record<string, string> =
      channel_type === 'webhook'
        ? { url: url.trim() }
        : { to_email: to_email.trim(), smtp_host: smtp_host.trim(), smtp_port, smtp_user: smtp_user.trim(), smtp_password, smtp_from: smtp_from.trim() || smtp_user.trim() };
    setNotifFormError(null);
    setNotifMessage(null);
    channelMutation.reset();
    try {
      await saveMutation.mutateAsync({ name: name.trim(), channel_type, config, on_fail, on_pass, enabled: true });
      setShowNotifForm(false);
      setNotifForm(emptyForm);
      setNotifMessage('Channel created.');
    } catch (error) {
      setNotifFormError(error instanceof Error ? error.message : String(error));
    }
  };
  const channelMutation = useMutation({
    mutationFn: async ({ id, action, enabled }: { id: string; action: 'delete' | 'test' | 'toggle'; enabled?: boolean }) => {
      const url = `${API_BASE}/v1/notifications/channels/${id}`;
      if (action === 'test') {
        const result = await apiJson<{ message?: string }>(`${url}/test`, authToken, { method: 'POST' });
        return result.message ?? 'Test sent.';
      }
      await apiFetch(
        url,
        authToken,
        action === 'delete'
          ? { method: 'DELETE' }
          : {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enabled }),
            },
      );
      return action === 'delete' ? 'Channel deleted.' : 'Channel updated.';
    },
    onMutate: () => setNotifMessage(null),
    onSuccess: async (message, { action }) => {
      setNotifMessage(message);
      if (action !== 'test') await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  const notifTestingId = channelMutation.isPending && channelMutation.variables.action === 'test' ? channelMutation.variables.id : null;
  const deleteNotifChannel = (id: string) => channelMutation.mutate({ id, action: 'delete' });
  const testNotifChannel = (id: string) => channelMutation.mutate({ id, action: 'test' });
  const toggleNotifChannel = (id: string, enabled: boolean) => channelMutation.mutate({ id, action: 'toggle', enabled });
  return (
    <>
      <h2>Notifications</h2>
      <p>Send alerts when a quality gate fails (or recovers). Supports generic webhooks (Teams, Slack, Power Automate…) and SMTP email.</p>

      {notifMessage && (
        <p className="feedback success" role="status">
          {notifMessage}
        </p>
      )}
      {channelMutation.error && (
        <p className="feedback error" role="alert">
          {channelMutation.error.message}
        </p>
      )}
      <div className="action-row" style={{ marginBottom: '1rem' }}>
        <button
          type="button"
          disabled={notifSaving || channelMutation.isPending}
          onClick={() => {
            setShowNotifForm((v) => !v);
            setNotifMessage(null);
            setNotifFormError(null);
          }}
        >
          {showNotifForm ? 'Cancel' : '+ Add channel'}
        </button>
      </div>

      {showNotifForm && (
        <form
          className="auth-card"
          style={{ marginBottom: '1.5rem' }}
          onSubmit={(event) => {
            event.preventDefault();
            void saveNotifChannel();
          }}
          onInvalid={(event) => setNotifFormError((event.target as HTMLInputElement).validationMessage)}
          onChange={() => setNotifFormError(null)}
        >
          <h4 style={{ marginBottom: '1rem' }}>New notification channel</h4>
          {notifFormError && (
            <p id="notification-form-error" className="feedback" role="alert">
              {notifFormError}
            </p>
          )}
          <fieldset
            className="notification-fields"
            disabled={notifSaving || channelMutation.isPending}
            aria-label="Notification channel settings"
            aria-describedby={notifFormError ? 'notification-form-error' : undefined}
          >
            <div className="form-grid compact">
              <label>
                Name
                <input required pattern=".*\S.*" value={notifForm.name} onChange={(e) => setNotifForm((f) => ({ ...f, name: e.target.value }))} placeholder="My Teams webhook" />
              </label>
              <label>
                Type
                <select value={notifForm.channel_type} onChange={(e) => setNotifForm((f) => ({ ...f, channel_type: e.target.value as 'webhook' | 'email' }))}>
                  <option value="webhook">Webhook (Teams / Slack / generic HTTP POST)</option>
                  <option value="email">Email (SMTP)</option>
                </select>
              </label>
            </div>

            {notifForm.channel_type === 'webhook' ? (
              <div className="form-grid compact" style={{ marginTop: '0.75rem' }}>
                <label>
                  Webhook URL
                  <input
                    type="url"
                    required
                    pattern="https?://.+"
                    value={notifForm.url}
                    onChange={(e) => setNotifForm((f) => ({ ...f, url: e.target.value }))}
                    placeholder="https://outlook.office.com/webhook/..."
                  />
                </label>
              </div>
            ) : (
              <div className="form-grid compact" style={{ marginTop: '0.75rem' }}>
                <label>
                  To (recipient email)
                  <input type="email" required value={notifForm.to_email} onChange={(e) => setNotifForm((f) => ({ ...f, to_email: e.target.value }))} placeholder="devops-team@company.com" />
                </label>
                <label>
                  SMTP host
                  <input required pattern=".*\S.*" value={notifForm.smtp_host} onChange={(e) => setNotifForm((f) => ({ ...f, smtp_host: e.target.value }))} placeholder="smtp.office365.com" />
                </label>
                <label>
                  SMTP port
                  <input type="number" required min={1} max={65535} step={1} value={notifForm.smtp_port} onChange={(e) => setNotifForm((f) => ({ ...f, smtp_port: e.target.value }))} />
                </label>
                <label>
                  SMTP user
                  <input value={notifForm.smtp_user} onChange={(e) => setNotifForm((f) => ({ ...f, smtp_user: e.target.value }))} placeholder="noreply@company.com" />
                </label>
                <label>
                  SMTP password
                  <input type="password" autoComplete="new-password" value={notifForm.smtp_password} onChange={(e) => setNotifForm((f) => ({ ...f, smtp_password: e.target.value }))} />
                </label>
                <label>
                  From address
                  <input
                    type="email"
                    required={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifForm.smtp_user.trim())}
                    value={notifForm.smtp_from}
                    onChange={(e) => setNotifForm((f) => ({ ...f, smtp_from: e.target.value }))}
                    placeholder="sast-platform@company.com"
                  />
                  <span className="hint">Defaults to SMTP user when it is an email address.</span>
                </label>
              </div>
            )}

            <div className="form-grid compact" style={{ marginTop: '0.75rem' }}>
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" checked={notifForm.on_fail} onChange={(e) => setNotifForm((f) => ({ ...f, on_fail: e.target.checked }))} />
                Notify when quality gate <strong>fails</strong>
              </label>
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" checked={notifForm.on_pass} onChange={(e) => setNotifForm((f) => ({ ...f, on_pass: e.target.checked }))} />
                Notify when quality gate <strong>passes</strong> (recovery alert)
              </label>
            </div>

            <div className="action-row" style={{ marginTop: '1rem' }}>
              <button type="submit">{notifSaving ? 'Saving…' : 'Save channel'}</button>
            </div>
          </fieldset>
        </form>
      )}

      {notifLoading && <p role="status">Loading…</p>}

      {notificationsQuery.isError && (
        <p className="feedback error" role="alert">
          {notificationsQuery.error.message}
        </p>
      )}
      {!notificationsQuery.isError && !notifLoading && notifChannels.length === 0 && !showNotifForm && (
        <div className="auth-card" style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>
          No notification channels configured yet. Add one above to start receiving alerts.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {notifChannels.map((ch) => (
          <div key={ch.id} className="auth-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', opacity: ch.enabled ? 1 : 0.55 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <strong>{ch.name}</strong>
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.1rem 0.4rem',
                    borderRadius: '3px',
                    background: ch.channel_type === 'webhook' ? 'var(--warning-light)' : 'var(--primary-light)',
                    color: ch.channel_type === 'webhook' ? 'var(--warning)' : 'var(--primary)',
                  }}
                >
                  {ch.channel_type}
                </span>
                {!ch.enabled && <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>disabled</span>}
              </div>
              <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                {ch.on_fail && <span style={{ marginRight: '0.5rem' }}>🔴 on fail</span>}
                {ch.on_pass && <span>🟢 on pass</span>}
                {ch.channel_type === 'webhook' && ch.config.url && (
                  <span style={{ marginLeft: '0.5rem', fontFamily: 'monospace' }}>
                    {String(ch.config.url).slice(0, 60)}
                    {String(ch.config.url).length > 60 ? '…' : ''}
                  </span>
                )}
                {ch.channel_type === 'email' && ch.config.to_email && <span style={{ marginLeft: '0.5rem' }}>{String(ch.config.to_email)}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              <button type="button" style={{ fontSize: '0.8rem' }} disabled={channelMutation.isPending || notifSaving} onClick={() => toggleNotifChannel(ch.id, !ch.enabled)}>
                {ch.enabled ? 'Disable' : 'Enable'}
              </button>
              <button type="button" style={{ fontSize: '0.8rem' }} disabled={channelMutation.isPending || notifSaving} onClick={() => testNotifChannel(ch.id)}>
                {notifTestingId === ch.id ? 'Testing…' : 'Test'}
              </button>
              <button
                type="button"
                style={{ fontSize: '0.8rem', color: 'var(--danger)' }}
                disabled={channelMutation.isPending || notifSaving}
                onClick={() => {
                  if (window.confirm(`Delete "${ch.name}"?`)) deleteNotifChannel(ch.id);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
