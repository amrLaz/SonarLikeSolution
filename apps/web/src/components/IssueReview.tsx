import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson, apiPage } from '../api';
import './IssueReview.css';

const API = `${import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api')}/v1/collaboration`;

export type Team = { id: string; project_key: string; name: string; owner_user_id: string | null };
type Person = { user_id: string; full_name: string; email: string };
type Finding = {
  id: string;
  project_key: string;
  branch: string;
  category: string;
  state: string;
  effective_state: string;
  hotspot_review: string;
  assignee_user_id: string | null;
  team_id: string | null;
  exception_reason: string | null;
  exception_expires_at: string | null;
  last_seen_at: string;
  version: number;
};
type Decision = { id: string; actor_email: string; action: string; reason: string; created_at: string };
type ReviewDraft = { assignee_user_id: string; team_id: string; state: string; hotspot_review: string; reason: string; expires_at: string };

export const FINDING_STATES: Record<string, string> = {
  open: 'Ouvert',
  confirmed: 'Confirmé',
  resolved: 'Résolu',
  false_positive: 'Faux positif',
  accepted_risk: 'Risque accepté',
};

const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function FindingReview({
  findingId,
  occurrenceId,
  projectKey,
  authToken,
  isAdmin,
  branchUrl,
}: {
  findingId?: string | null;
  occurrenceId?: number;
  projectKey: string;
  authToken?: string;
  isAdmin: boolean;
  branchUrl?: string | null;
}) {
  const client = useQueryClient();
  const [adoptedId, setAdoptedId] = useState('');
  const id = findingId || adoptedId;
  const finding = useQuery({
    queryKey: ['collaboration', 'finding', id],
    enabled: !!id,
    queryFn: ({ signal }) => apiJson<Finding>(`${API}/findings/${encodeURIComponent(id)}`, authToken, { signal }),
  });
  const adopt = useMutation({
    mutationFn: () => apiJson<Finding>(`${API}/occurrences/${occurrenceId}`, authToken, { method: 'POST' }),
    onSuccess: (result) => {
      setAdoptedId(result.id);
      client.setQueryData(['collaboration', 'finding', result.id], result);
      void client.invalidateQueries({ queryKey: ['findings'] });
    },
  });

  return (
    <section className="issue-review" aria-label="Traitement de l’issue">
      {!id && (
        <button type="button" disabled={!occurrenceId || adopt.isPending} onClick={() => adopt.mutate()}>
          Traiter cette issue
        </button>
      )}
      {(finding.isLoading || adopt.isPending) && <p role="status">Chargement du traitement…</p>}
      {(finding.error ?? adopt.error) && (
        <p className="feedback error" role="alert">
          {(finding.error ?? adopt.error)?.message}
        </p>
      )}
      {finding.data && <IssueEditor key={`${finding.data.id}-${finding.data.version}`} finding={finding.data} projectKey={projectKey} authToken={authToken} isAdmin={isAdmin} branchUrl={branchUrl} />}
    </section>
  );
}

function IssueEditor({ finding, projectKey, authToken, isAdmin, branchUrl }: { finding: Finding; projectKey: string; authToken?: string; isAdmin: boolean; branchUrl?: string | null }) {
  const prefix = useId();
  const client = useQueryClient();
  const [comment, setComment] = useState('');
  const [draft, setDraft] = useState<ReviewDraft>({
    assignee_user_id: finding.assignee_user_id ?? '',
    team_id: finding.team_id ?? '',
    state: finding.state,
    hotspot_review: finding.hotspot_review,
    reason: finding.exception_reason ?? '',
    expires_at: finding.exception_expires_at ?? '',
  });
  const teams = useQuery({
    queryKey: ['collaboration', 'teams', projectKey],
    queryFn: ({ signal }) => apiPage<Team>(`${API}/teams?${new URLSearchParams({ project_key: projectKey })}`, authToken, { signal }),
  });
  const people = useQuery({
    queryKey: ['collaboration', 'people', projectKey],
    queryFn: ({ signal }) => apiPage<Person>(`${API}/people?${new URLSearchParams({ project_key: projectKey })}`, authToken, { signal }),
  });
  const decisions = useQuery({
    queryKey: ['collaboration', 'decisions', finding.id],
    queryFn: ({ signal }) => apiPage<Decision>(`${API}/findings/${finding.id}/decisions`, authToken, { signal }),
  });
  const save = useMutation({
    mutationFn: ({ path = '', body }: { path?: string; body: unknown }) => apiJson<Finding>(`${API}/findings/${finding.id}${path}`, authToken, json(path ? 'POST' : 'PUT', body)),
    onSuccess: async (result, request) => {
      client.setQueryData(['collaboration', 'finding', finding.id], result);
      if (request.path) setComment('');
      await Promise.all([client.invalidateQueries({ queryKey: ['collaboration', 'decisions', finding.id] }), client.invalidateQueries({ queryKey: ['findings'] })]);
    },
  });
  const exception = draft.state === 'false_positive' || draft.state === 'accepted_risk';
  const validExpiry = !exception || (Number.isFinite(Date.parse(draft.expires_at)) && Date.parse(draft.expires_at) > Date.now());
  const change = (field: keyof ReviewDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!validExpiry || save.isPending) return;
    save.mutate({
      body: {
        version: finding.version,
        ...draft,
        assignee_user_id: draft.assignee_user_id || null,
        team_id: draft.team_id || null,
        expires_at: exception ? new Date(draft.expires_at).toISOString() : null,
      },
    });
  };

  return (
    <>
      <h3>Traitement</h3>
      <p>
        <strong>{FINDING_STATES[finding.effective_state] ?? finding.effective_state}</strong> · {branchUrl ? <a href={branchUrl} target="_blank" rel="noreferrer">{finding.branch} ↗</a> : finding.branch} · vu le {new Date(finding.last_seen_at).toLocaleString()}
      </p>
      {finding.state !== finding.effective_state && <p role="status">L’exception a expiré : l’issue est de nouveau ouverte.</p>}
      {[teams.error, people.error, decisions.error, save.error].filter(Boolean).map((error, index) => (
        <p className="feedback error" role="alert" key={index}>
          {error!.message}
        </p>
      ))}
      <form className="issue-review-form" onSubmit={submit}>
        <label htmlFor={`${prefix}-owner`}>
          Responsable
          <select id={`${prefix}-owner`} value={draft.assignee_user_id} onChange={(event) => change('assignee_user_id', event.target.value)}>
            <option value="">Non assigné</option>
            {!!draft.assignee_user_id && !people.data?.items.some((person) => person.user_id === draft.assignee_user_id) && (
              <option value={draft.assignee_user_id}>Responsable actuel (hors de cette page)</option>
            )}
            {people.data?.items.map((person) => (
              <option key={person.user_id} value={person.user_id}>
                {person.full_name || person.email}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${prefix}-team`}>
          Équipe
          <select id={`${prefix}-team`} value={draft.team_id} onChange={(event) => change('team_id', event.target.value)}>
            <option value="">Aucune équipe</option>
            {!!draft.team_id && !teams.data?.items.some((team) => team.id === draft.team_id) && <option value={draft.team_id}>Équipe actuelle (hors de cette page)</option>}
            {teams.data?.items.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${prefix}-state`}>
          État
          <select id={`${prefix}-state`} value={draft.state} onChange={(event) => change('state', event.target.value)}>
            {Object.entries(FINDING_STATES).map(([value, label]) => (
              <option key={value} value={value} disabled={!isAdmin && (value === 'false_positive' || value === 'accepted_risk')}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {finding.category === 'security_hotspot' && (
          <label htmlFor={`${prefix}-hotspot`}>
            Revue du hotspot
            <select id={`${prefix}-hotspot`} value={draft.hotspot_review} onChange={(event) => change('hotspot_review', event.target.value)}>
              <option value="not_reviewed">Non revu</option>
              <option value="safe">Sûr</option>
              <option value="to_fix">À corriger</option>
            </select>
          </label>
        )}
        <label htmlFor={`${prefix}-reason`}>
          Motif
          <textarea
            id={`${prefix}-reason`}
            maxLength={4000}
            required={draft.state !== finding.state || draft.hotspot_review !== finding.hotspot_review || exception}
            value={draft.reason}
            onChange={(event) => change('reason', event.target.value)}
          />
        </label>
        {exception && (
          <label htmlFor={`${prefix}-expiry`}>
            Expiration de l’exception
            <input
              id={`${prefix}-expiry`}
              type="text"
              placeholder="2026-12-31T23:00:00Z"
              required
              disabled={!isAdmin}
              value={draft.expires_at}
              onChange={(event) => change('expires_at', event.target.value)}
            />
          </label>
        )}
        <button type="submit" disabled={save.isPending || !teams.isSuccess || !people.isSuccess || !validExpiry}>
          Enregistrer
        </button>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (comment.trim()) save.mutate({ path: '/comments', body: { version: finding.version, reason: comment } });
        }}
      >
        <label htmlFor={`${prefix}-comment`}>
          Commentaire
          <textarea id={`${prefix}-comment`} maxLength={4000} required value={comment} onChange={(event) => setComment(event.target.value)} />
        </label>
        <button type="submit" disabled={save.isPending || !comment.trim()}>
          Ajouter
        </button>
      </form>
      <h4>Historique</h4>
      {!decisions.isLoading && !decisions.data?.items.length && <p>Aucune décision enregistrée.</p>}
      <ol>
        {decisions.data?.items.map((decision) => (
          <li key={decision.id}>
            <time>{new Date(decision.created_at).toLocaleString()}</time> · {decision.actor_email} · {decision.action}
            <p>{decision.reason || 'Sans commentaire'}</p>
          </li>
        ))}
      </ol>
    </>
  );
}
