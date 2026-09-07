import InfoHint from './InfoHint';
import { useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '../api';
import type { AuditLogEntry } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api');

export default function AuditLog({ authToken }: { authToken?: string }) {
  const queryClient = useQueryClient();
  const [auditLogActionFilter, setAuditLogActionFilter] = useState('');
  const [auditLogActorFilter, setAuditLogActorFilter] = useState('');
  const [auditFilters, setAuditFilters] = useState({ action: '', actor: '' });
  const auditQuery = useInfiniteQuery({
    queryKey: ['audit', auditFilters],
    initialPageParam: 0,
    queryFn: ({ signal, pageParam }) => {
      const params = new URLSearchParams({ limit: '50', offset: String(pageParam) });
      if (auditFilters.action) params.set('action', auditFilters.action);
      if (auditFilters.actor) params.set('actor', auditFilters.actor);
      return apiJson<{ total: number; entries: AuditLogEntry[] }>(`${API_BASE}/v1/audit-logs?${params}`, authToken, { signal });
    },
    getNextPageParam: (last, pages) => {
      const count = pages.reduce((sum, page) => sum + page.entries.length, 0);
      return last.entries.length && count < last.total ? count : undefined;
    },
  });
  const auditLogs = auditQuery.data?.pages.flatMap((page) => page.entries) ?? [];
  const auditLogLoading = auditQuery.isFetching;

  return (
    <>
      <h2>
        Audit Log <InfoHint>Immutable trace of every security-relevant action — role changes, rule suppressions, token rotations, settings updates.</InfoHint>
      </h2>

      <div className="auth-card" style={{ marginBottom: '1rem' }}>
        <form
          className="form-grid compact"
          style={{ alignItems: 'flex-end' }}
          onSubmit={(event) => {
            event.preventDefault();
            const next = { action: auditLogActionFilter, actor: auditLogActorFilter.trim() };
            void queryClient.resetQueries({ queryKey: ['audit', next], exact: true });
            setAuditFilters(next);
          }}
        >
          <label>
            Filter by action
            <select value={auditLogActionFilter} onChange={(e) => setAuditLogActionFilter(e.target.value)}>
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
            <input placeholder="email..." value={auditLogActorFilter} onChange={(e) => setAuditLogActorFilter(e.target.value)} />
          </label>
          <button type="submit" disabled={auditLogLoading}>
            {auditLogLoading ? 'Loading...' : 'Apply'}
          </button>
        </form>
      </div>

      <div className="auth-card" style={{ padding: 0, overflow: 'hidden' }}>
        {auditLogLoading && <p role="status">Loading audit events…</p>}
        {auditQuery.isError ? (
          <p className="feedback error" role="alert">
            {auditQuery.error.message}
          </p>
        ) : auditLogs.length === 0 && !auditLogLoading ? (
          <p style={{ padding: '1.5rem', margin: 0, opacity: 0.7, textAlign: 'center' }}>No audit events yet — actions will appear here as users interact with the platform.</p>
        ) : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Audit events">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2, rgba(0,0,0,0.05))' }}>
                  <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left', whiteSpace: 'nowrap' }}>Date</th>
                  <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left' }}>Actor</th>
                  <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left' }}>Role</th>
                  <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left' }}>Action</th>
                  <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left' }}>Resource</th>
                  <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((entry) => (
                  <tr key={entry.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem 0.8rem', whiteSpace: 'nowrap', opacity: 0.75 }}>{new Date(entry.created_at).toLocaleString()}</td>
                    <td style={{ padding: '0.5rem 0.8rem', fontFamily: 'monospace' }}>{entry.actor_email}</td>
                    <td style={{ padding: '0.5rem 0.8rem' }}>
                      <span
                        style={{
                          padding: '0.1rem 0.4rem',
                          borderRadius: '3px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: entry.actor_role === 'admin' ? 'var(--danger-light)' : 'var(--warning-light)',
                          color: entry.actor_role === 'admin' ? 'var(--danger)' : 'var(--warning)',
                        }}
                      >
                        {entry.actor_role}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem 0.8rem', fontFamily: 'monospace', fontWeight: 600 }}>{entry.action}</td>
                    <td style={{ padding: '0.5rem 0.8rem', opacity: 0.85 }}>{entry.resource_label ?? entry.resource_id ?? entry.resource_type}</td>
                    <td style={{ padding: '0.5rem 0.8rem', opacity: 0.7, maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.details ? JSON.stringify(entry.details) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {auditQuery.hasNextPage && (
          <div style={{ padding: '0.75rem', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
            <button type="button" onClick={() => void auditQuery.fetchNextPage()} disabled={auditLogLoading} style={{ fontSize: '0.85rem' }}>
              {auditLogLoading ? 'Loading...' : 'Next'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
