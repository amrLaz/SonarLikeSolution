import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson, apiPage } from '../api';
import CollaborationDelivery from './CollaborationDelivery';
import type { ProjectSummary } from '../types';
import './Collaboration.css';

const API = `${import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api')}/v1/collaboration`;
export type Team = { id: string; project_key: string; name: string; owner_user_id: string | null };
type Person = { user_id: string; full_name: string; email: string };
type Finding = { id: string; project_key: string; branch: string; tool: string; rule_id: string; category: string; message: string; path: string | null; line: number | null; identity_kind: string; state: string; effective_state: string; hotspot_review: string; assignee_user_id: string | null; team_id: string | null; exception_reason: string | null; exception_expires_at: string | null; last_analysis_id: string; last_seen_at: string; updated_at: string; version: number };
type Decision = { id: string; actor_email: string; action: string; reason: string; snapshot: unknown; created_at: string };
type ReviewDraft = { version: number; assignee_user_id: string; team_id: string; state: string; hotspot_review: string; reason: string; expires_at: string };
export const FINDING_STATES: Record<string, string> = { open: 'Ouvert', confirmed: 'Confirmé', resolved: 'Résolu', false_positive: 'Faux positif', accepted_risk: 'Risque accepté' };
const stateLabel = (state: string) => FINDING_STATES[state] ?? state;
const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function useDirectory(project: string, token?: string) {
  const [teamPage, setTeamPage] = useState({ project: '', cursor: '' });
  const [personPage, setPersonPage] = useState({ project: '', cursor: '' });
  const teamCursor = teamPage.project === project ? teamPage.cursor : '';
  const personCursor = personPage.project === project ? personPage.cursor : '';
  const teams = useQuery({ queryKey: ['collaboration', 'teams', project, teamCursor], enabled: !!project,
    queryFn: ({ signal }) => apiPage<Team>(`${API}/teams?${new URLSearchParams({ project_key: project, cursor: teamCursor })}`, token, { signal }) });
  const people = useQuery({ queryKey: ['collaboration', 'people', project, personCursor], enabled: !!project,
    queryFn: ({ signal }) => apiPage<Person>(`${API}/people?${new URLSearchParams({ project_key: project, cursor: personCursor })}`, token, { signal }) });
  return { teams: { ...teams, data: teams.data?.items, next: teams.data?.next }, people: { ...people, data: people.data?.items, next: people.data?.next }, teamCursor, personCursor,
    setTeamCursor: (cursor: string) => setTeamPage({ project, cursor }), setPersonCursor: (cursor: string) => setPersonPage({ project, cursor }) };
}

function DirectoryPages({ directory, people = true }: { directory: ReturnType<typeof useDirectory>; people?: boolean }) {
  return <div className="action-row"><span className="hint">Catalogues : 50 entrées par page.</span>{directory.teamCursor && <button type="button" onClick={() => directory.setTeamCursor('')}>Premières équipes</button>}{directory.teams.next && <button type="button" onClick={() => directory.setTeamCursor(directory.teams.next!)}>Équipes suivantes</button>}{people && directory.personCursor && <button type="button" onClick={() => directory.setPersonCursor('')}>Premières personnes</button>}{people && directory.people.next && <button type="button" onClick={() => directory.setPersonCursor(directory.people.next!)}>Personnes suivantes</button>}</div>;
}

export function FindingReview({ findingId, occurrenceId, projectKey, authToken, isAdmin }: { findingId?: string | null; occurrenceId?: number; projectKey: string; authToken?: string; isAdmin: boolean }) {
  const client = useQueryClient();
  const [materializedId, setMaterializedId] = useState('');
  const id = findingId || materializedId;
  const finding = useQuery({ queryKey: ['collaboration', 'finding', id], enabled: !!id,
    queryFn: ({ signal }) => apiJson<Finding>(`${API}/findings/${encodeURIComponent(id)}`, authToken, { signal }) });
  const materialize = useMutation({ mutationFn: () => apiJson<Finding>(`${API}/occurrences/${occurrenceId}`, authToken, { method: 'POST' }),
    onSuccess: result => { client.setQueryData(['collaboration', 'finding', result.id], result); setMaterializedId(result.id); void client.invalidateQueries({ queryKey: ['findings'] }); } });
  return <section className="collaboration-review" aria-label="Suivi du finding">
    {!id && <><p>Ce finding n’a pas encore de dossier collaboratif.</p><button type="button" disabled={materialize.isPending || !occurrenceId} onClick={() => materialize.mutate()}>Ouvrir le suivi collaboratif</button></>}
    {(finding.isLoading || materialize.isPending) && <p role="status">Chargement du suivi…</p>}
    {(finding.error ?? materialize.error) && <p className="feedback error" role="alert">{(finding.error ?? materialize.error)?.message} <button type="button" onClick={() => id ? void finding.refetch() : materialize.reset()}>Réessayer</button></p>}
    {finding.data && <FindingEditor key={finding.data.id} finding={finding.data} authToken={authToken} isAdmin={isAdmin} projectKey={projectKey} />}
  </section>;
}

function FindingEditor({ finding, authToken, isAdmin, projectKey }: { finding: Finding; authToken?: string; isAdmin: boolean; projectKey: string }) {
  const client = useQueryClient();
  const prefix = useId();
  const directory = useDirectory(projectKey, authToken);
  const { teams, people } = directory;
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const initial: ReviewDraft = { version: finding.version, assignee_user_id: finding.assignee_user_id ?? '', team_id: finding.team_id ?? '', state: finding.state, hotspot_review: finding.hotspot_review, reason: finding.exception_reason ?? '', expires_at: finding.exception_expires_at ?? '' };
  const form = draft ?? initial;
  const change = (field: keyof ReviewDraft, value: string) => setDraft({ ...form, [field]: value });
  const [comment, setComment] = useState('');
  const [cursor, setCursor] = useState('');
  const decisions = useQuery({ queryKey: ['collaboration', 'decisions', finding.id, cursor],
    queryFn: ({ signal }) => apiPage<Decision>(`${API}/findings/${finding.id}/decisions?${new URLSearchParams({ cursor })}`, authToken, { signal }) });
  const save = useMutation({ mutationFn: ({ path, body }: { path: string; body: unknown }) => apiJson<Finding>(`${API}/findings/${finding.id}${path}`, authToken, json(path ? 'POST' : 'PUT', body)),
    onSuccess: async (result, request) => { client.setQueryData(['collaboration', 'finding', finding.id], result); if (request.path) setComment(''); else setDraft(null); await Promise.all([client.invalidateQueries({ queryKey: ['collaboration'] }), client.invalidateQueries({ queryKey: ['findings'] })]); } });
  const exception = form.state === 'false_positive' || form.state === 'accepted_risk';
  const directoryReady = teams.isSuccess && people.isSuccess;
  const conflict = draft !== null && draft.version !== finding.version;
  const restrictedException = !isAdmin && (finding.state === 'false_positive' || finding.state === 'accepted_risk');
  const saveReview = (event: FormEvent) => {
    event.preventDefault();
    if (save.isPending || conflict || !directoryReady) return;
    if (exception && (!Number.isFinite(Date.parse(form.expires_at)) || Date.parse(form.expires_at) <= Date.now())) return;
    save.mutate({ path: '', body: { ...form, assignee_user_id: form.assignee_user_id || null, team_id: form.team_id || null, expires_at: exception ? new Date(form.expires_at).toISOString() : null } });
  };
  return <>
    <h3>Suivi et revue</h3><p><strong>{stateLabel(finding.effective_state)}</strong> · {finding.project_key} · {finding.branch} · vu le {new Date(finding.last_seen_at).toLocaleString()}</p>
    <p className="hint">Identité : {finding.identity_kind === 'fingerprint' ? 'empreinte scanner' : 'localisation exacte ; un déplacement peut créer un nouveau finding'}. Les décisions restent consultables après purge des rapports. Les exceptions portent sur ce finding, ce projet et cette branche ; elles ne changent pas le verdict automatique du gate.</p>
    {finding.state !== finding.effective_state && <p role="status">L’exception a expiré : le finding est de nouveau ouvert.</p>}
    <a href={`?finding_id=${encodeURIComponent(finding.id)}`}>Lien permanent vers ce suivi</a>
    {[teams.error, people.error, decisions.error, save.error].filter(Boolean).map((error, index) => <p className="feedback error" role="alert" key={index}>{error!.message}</p>)}
    {(teams.isLoading || people.isLoading) && <p role="status">Chargement des personnes et équipes…</p>}
    {conflict && <p role="alert">Ce finding a changé depuis le début de votre saisie. Rechargez sa version avant d’enregistrer.</p>}
    <form className="collaboration-form" onSubmit={saveReview}>
      <label htmlFor={`${prefix}-assignee`}>Responsable<select id={`${prefix}-assignee`} value={form.assignee_user_id} onChange={event => change('assignee_user_id', event.target.value)}><option value="">Non assigné</option>{!!form.assignee_user_id && !people.data?.some(item => item.user_id === form.assignee_user_id) && <option value={form.assignee_user_id}>Responsable non disponible ({form.assignee_user_id})</option>}{people.data?.map(item => <option key={item.user_id} value={item.user_id}>{item.full_name || item.email}</option>)}</select></label>
      <label htmlFor={`${prefix}-team`}>Équipe<select id={`${prefix}-team`} value={form.team_id} onChange={event => change('team_id', event.target.value)}><option value="">Aucune équipe</option>{!!form.team_id && !teams.data?.some(item => item.id === form.team_id) && <option value={form.team_id}>Équipe non disponible ({form.team_id})</option>}{teams.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label htmlFor={`${prefix}-state`}>État<select id={`${prefix}-state`} disabled={restrictedException} value={form.state} onChange={event => change('state', event.target.value)}>{Object.entries(FINDING_STATES).map(([value, label]) => <option key={value} value={value} disabled={!isAdmin && (value === 'false_positive' || value === 'accepted_risk')}>{label}</option>)}</select></label>
      {finding.category === 'security_hotspot' && <label htmlFor={`${prefix}-review`}>Revue du hotspot<select id={`${prefix}-review`} value={form.hotspot_review} onChange={event => change('hotspot_review', event.target.value)}><option value="not_reviewed">Non revu</option><option value="safe">Sûr</option><option value="to_fix">À corriger</option></select></label>}
      <label htmlFor={`${prefix}-reason`}>Motif de la décision<textarea id={`${prefix}-reason`} readOnly={restrictedException} maxLength={4000} required={form.state !== finding.state || form.hotspot_review !== finding.hotspot_review || exception} value={form.reason} onChange={event => change('reason', event.target.value)} /></label>
      {exception && <label htmlFor={`${prefix}-expiry`}>Expiration de l’exception (date ISO avec fuseau)<input id={`${prefix}-expiry`} type="text" placeholder="2026-12-31T23:00:00Z" required disabled={!isAdmin} value={form.expires_at} onChange={event => change('expires_at', event.target.value)} /></label>}
      <div className="action-row"><button type="submit" disabled={save.isPending || !directoryReady || conflict || (exception && (!Number.isFinite(Date.parse(form.expires_at)) || Date.parse(form.expires_at) <= Date.now()))}>Enregistrer la décision</button><button type="button" disabled={save.isPending} onClick={() => { setDraft(null); void client.invalidateQueries({ queryKey: ['collaboration', 'finding', finding.id] }); }}>Recharger et abandonner la saisie</button></div>
    </form>
    <DirectoryPages directory={directory} />
    <form onSubmit={event => { event.preventDefault(); if (!save.isPending) save.mutate({ path: '/comments', body: { version: finding.version, reason: comment } }); }}><label htmlFor={`${prefix}-comment`}>Commentaire<textarea id={`${prefix}-comment`} required maxLength={4000} value={comment} onChange={event => setComment(event.target.value)} /></label><button type="submit" disabled={save.isPending || !comment.trim()}>Ajouter un commentaire</button></form>
    {save.isSuccess && <p role="status">Décision enregistrée.</p>}
    <h4>Historique des décisions</h4>{decisions.isLoading && <p role="status">Chargement des décisions…</p>}{decisions.isSuccess && !decisions.data.items.length && <p>Aucune décision enregistrée.</p>}
    <ol>{decisions.data?.items.map(item => <li key={item.id}><p><time>{new Date(item.created_at).toLocaleString()}</time> · {item.actor_email} · {item.action}</p><p>{item.reason || 'Sans commentaire'}</p><details><summary>État conservé lors de la décision</summary><pre>{JSON.stringify(item.snapshot, null, 2)}</pre></details></li>)}</ol>
    <div className="action-row">{cursor && <button type="button" onClick={() => setCursor('')}>Première page de décisions</button>}{decisions.data?.next && <button type="button" onClick={() => setCursor(decisions.data!.next!)}>Décisions suivantes</button>}</div>
    <CollaborationDelivery authToken={authToken} projectKey={projectKey} findingId={finding.id} isAdmin={isAdmin} />
  </>;
}

function Ownership({ project, token }: { project: string; token?: string }) {
  const client = useQueryClient();
  const directory = useDirectory(project, token);
  const { teams, people } = directory;
  const ownership = useQuery({ queryKey: ['collaboration', 'ownership', project], queryFn: ({ signal }) => apiJson<{ owner_user_id: string | null; team_id: string | null } | null>(`${API}/ownership/${encodeURIComponent(project)}`, token, { signal }) });
  const [draft, setDraft] = useState<{ owner_user_id: string; team_id: string } | null>(null);
  const form = draft ?? { owner_user_id: ownership.data?.owner_user_id ?? '', team_id: ownership.data?.team_id ?? '' };
  const [name, setName] = useState('');
  const save = useMutation({ mutationFn: ({ path, body }: { path: string; body: unknown }) => apiJson(`${API}${path}`, token, json(path === '/teams' ? 'POST' : 'PUT', body)), onSuccess: async (_, request) => { if (request.path === '/teams') setName(''); else setDraft(null); await client.invalidateQueries({ queryKey: ['collaboration'] }); } });
  return <details><summary>Équipes et propriétaire du projet</summary><p>La propriété sert à l’assignation initiale des nouveaux findings.</p>{[teams.error, people.error, ownership.error, save.error].filter(Boolean).map((error, index) => <p role="alert" key={index}>{error!.message}</p>)}
    <form className="collaboration-form" onSubmit={event => { event.preventDefault(); if (!save.isPending) save.mutate({ path: `/ownership/${encodeURIComponent(project)}`, body: { owner_user_id: form.owner_user_id || null, team_id: form.team_id || null } }); }}>
      <label>Propriétaire<select value={form.owner_user_id} onChange={event => setDraft({ ...form, owner_user_id: event.target.value })}><option value="">Aucun propriétaire</option>{form.owner_user_id && !people.data?.some(item => item.user_id === form.owner_user_id) && <option value={form.owner_user_id}>Propriétaire hors page ({form.owner_user_id})</option>}{people.data?.map(item => <option key={item.user_id} value={item.user_id}>{item.full_name || item.email}</option>)}</select></label>
      <label>Équipe du projet<select value={form.team_id} onChange={event => setDraft({ ...form, team_id: event.target.value })}><option value="">Aucune équipe</option>{form.team_id && !teams.data?.some(item => item.id === form.team_id) && <option value={form.team_id}>Équipe hors page ({form.team_id})</option>}{teams.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button type="submit" disabled={save.isPending || !ownership.isSuccess || !teams.isSuccess || !people.isSuccess}>Enregistrer la propriété</button>
    </form>
    <DirectoryPages directory={directory} />
    <form onSubmit={event => { event.preventDefault(); if (!save.isPending) save.mutate({ path: '/teams', body: { project_key: project, name } }); }}><label>Nom de la nouvelle équipe<input required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label><button type="submit" disabled={save.isPending || !name.trim()}>Créer l’équipe</button></form>{save.isSuccess && <p role="status">Enregistré.</p>}
  </details>;
}

export default function Collaboration({ authToken, isAdmin, summaries, initialFindingId = '' }: { authToken?: string; isAdmin: boolean; summaries: ProjectSummary[]; initialFindingId?: string }) {
  const [filters, setFilters] = useState({ project_key: '', branch: '', team_id: '', state: '', mine: false });
  const [selected, setSelected] = useState(initialFindingId);
  const [page, setPage] = useState({ key: '', cursor: '' });
  const key = JSON.stringify(filters); const cursor = page.key === key ? page.cursor : '';
  const directory = useDirectory(filters.project_key, authToken);
  const { teams } = directory;
  const list = useQuery({ queryKey: ['collaboration', 'findings', key, cursor], queryFn: ({ signal }) => apiPage<Finding>(`${API}/findings?${new URLSearchParams({ ...filters, mine: filters.mine ? 'true' : '', cursor })}`, authToken, { signal }) });
  const detail = useQuery({ queryKey: ['collaboration', 'finding', selected], enabled: !!selected, queryFn: ({ signal }) => apiJson<Finding>(`${API}/findings/${encodeURIComponent(selected)}`, authToken, { signal }) });
  return <section className="panel collaboration-screen"><h2>Collaboration</h2><p>Suivi durable par projet et branche, indépendant de la conservation des rapports détaillés. Une absence au scan ne signifie pas une résolution.</p>
    <div className="collaboration-form">
      <label>Projet exact (vide : tous les projets)<input list="collaboration-projects" maxLength={100} value={filters.project_key} onChange={event => { setFilters({ ...filters, project_key: event.target.value, team_id: '' }); setSelected(''); }} /><datalist id="collaboration-projects">{summaries.map(item => <option key={item.projectKey} value={item.projectKey} />)}</datalist></label>
      <label>Branche exacte<input value={filters.branch} onChange={event => setFilters({ ...filters, branch: event.target.value })} /></label>
      <label>Équipe<select disabled={!filters.project_key || !teams.isSuccess} value={filters.team_id} onChange={event => setFilters({ ...filters, team_id: event.target.value })}><option value="">Toutes les équipes</option>{filters.team_id && !teams.data?.some(item => item.id === filters.team_id) && <option value={filters.team_id}>Équipe sélectionnée hors page</option>}{teams.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>État<select value={filters.state} onChange={event => setFilters({ ...filters, state: event.target.value })}><option value="">Tous les états</option>{Object.entries(FINDING_STATES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="collaboration-checkbox"><input type="checkbox" checked={filters.mine} onChange={event => setFilters({ ...filters, mine: event.target.checked })} />Mes problèmes</label>
    </div>
    {filters.project_key && <DirectoryPages directory={directory} people={false} />}
    {[list.error, detail.error, teams.error].filter(Boolean).map((error, index) => <p className="feedback error" role="alert" key={index}>{error!.message}</p>)}
    {list.isLoading && <p role="status">Chargement des findings…</p>}{list.isSuccess && !list.data.items.length && <p role="status">Aucun finding dans ce périmètre et avec ces filtres.</p>}
    <p className="hint">{list.data?.items.length ?? 0} findings sur cette page, 50 maximum. Les filtres s’appliquent avant pagination.</p>
    <div className="action-row">{cursor && <button type="button" onClick={() => setPage({ key, cursor: '' })}>Première page</button>}{list.data?.next && <button type="button" onClick={() => setPage({ key, cursor: list.data!.next! })}>Findings suivants</button>}<button type="button" onClick={() => void list.refetch()}>Actualiser</button></div>
    <div className="table-wrap" role="region" aria-label="Findings collaboratifs" tabIndex={0}><table><thead><tr><th scope="col">Finding</th><th scope="col">Projet / branche</th><th scope="col">État effectif</th><th scope="col">Dernière observation</th></tr></thead><tbody>{list.data?.items.map(item => <tr key={item.id}><th scope="row"><button type="button" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>{item.tool} · {item.rule_id}</button><p>{item.message}</p></th><td>{item.project_key}<br />{item.branch}</td><td>{stateLabel(item.effective_state)}</td><td>{new Date(item.last_seen_at).toLocaleString()}</td></tr>)}</tbody></table></div>
    {detail.isLoading && <p role="status">Chargement du finding sélectionné…</p>}
    {detail.data && <FindingReview key={detail.data.id} findingId={detail.data.id} projectKey={detail.data.project_key} authToken={authToken} isAdmin={isAdmin} />}
    {isAdmin && filters.project_key && <Ownership key={filters.project_key} project={filters.project_key} token={authToken} />}
    <CollaborationDelivery key={filters.project_key} authToken={authToken} projectKey={filters.project_key} teamId={filters.team_id} isAdmin={isAdmin} />
  </section>;
}
