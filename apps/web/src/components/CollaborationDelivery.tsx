import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiJson, apiPage } from '../api';
import type { AzureDevOpsOrganizationConfig } from '../types';

const BASE = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api');
const API = `${BASE}/v1/collaboration`;
type Config = { organization_config_id: string; ado_project: string; work_item_type: string; enabled: boolean };
type Subscription = { id: string; project_key: string; scope: string; scope_id: string };
type Notice = { id: string; project_key: string; finding_id: string; action: string; created_at: string; read_at: string | null };
type Boards = { link: { work_item_id: number | null; state: string; error: string | null; url: string | null; updated_at: string } | null; events: { decision_id: string; state: string; error: string | null; completed_at: string | null }[] };

export default function CollaborationDelivery({ authToken, projectKey, findingId, teamId, isAdmin }: { authToken?: string; projectKey: string; findingId?: string; teamId?: string; isAdmin: boolean }) {
  const client = useQueryClient();
  const [cursor, setCursor] = useState('');
  const subscriptions = useQuery({ queryKey: ['collaboration', 'subscriptions'], queryFn: ({ signal }) => apiJson<Subscription[]>(`${API}/subscriptions`, authToken, { signal }) });
  const notices = useQuery({ queryKey: ['collaboration', 'notifications', cursor], enabled: !findingId, queryFn: ({ signal }) => apiPage<Notice>(`${API}/notifications?${new URLSearchParams({ cursor })}`, authToken, { signal }) });
  const boards = useQuery({ queryKey: ['collaboration', 'boards', findingId], enabled: !!findingId, queryFn: ({ signal }) => apiJson<Boards>(`${API}/findings/${findingId}/boards`, authToken, { signal }) });
  const mutation = useMutation({ mutationFn: ({ path, method, body }: { path: string; method: string; body?: unknown }) => apiFetch(`${API}${path}`, authToken, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['collaboration'] }) });
  const scope = findingId ? 'finding' : teamId ? 'team' : 'project';
  const scopeId = findingId || teamId || projectKey;
  const subscription = subscriptions.data?.find(item => item.scope === scope && item.scope_id === scopeId && item.project_key === projectKey);
  return <section className="collaboration-review"><h3>{findingId ? 'Azure Boards et abonnement au finding' : 'Abonnements et notifications'}</h3>
    <p className="hint">Les notifications de cette boîte portent sur les décisions significatives du périmètre suivi. L’abonnement ne configure pas d’envoi email ou webhook.</p>
    {[subscriptions.error, notices.error, boards.error, mutation.error].filter(Boolean).map((error, index) => <p className="feedback error" role="alert" key={index}>{error!.message}</p>)}
    {(subscriptions.isLoading || notices.isLoading || boards.isLoading) && <p role="status">Chargement…</p>}
    {projectKey && <div className="action-row"><span>{scope === 'finding' ? 'Finding sélectionné' : scope === 'team' ? 'Équipe sélectionnée' : `Projet ${projectKey}`}</span><button type="button" disabled={mutation.isPending || !subscriptions.isSuccess} onClick={() => mutation.mutate(subscription ? { path: `/subscriptions/${subscription.id}`, method: 'DELETE' } : { path: '/subscriptions', method: 'POST', body: { scope, scope_id: scopeId, project_key: projectKey } })}>{subscription ? 'Se désabonner' : 'S’abonner'}</button></div>}
    {!findingId && subscriptions.isSuccess && <details><summary>Mes abonnements ({subscriptions.data.length})</summary>{subscriptions.data.length === 0 ? <p>Aucun abonnement.</p> : <ul>{subscriptions.data.map(item => <li key={item.id}>{item.project_key} · {item.scope} · <code>{item.scope_id}</code> <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ path: `/subscriptions/${item.id}`, method: 'DELETE' })}>Retirer cet abonnement</button></li>)}</ul>}</details>}
    {findingId && <>
      {boards.isSuccess && !boards.data.link && <p>Aucun Work Item demandé.</p>}
      {boards.data?.link && <p>Livraison : <strong>{boards.data.link.state}</strong>{boards.data.link.url && <> · <a href={boards.data.link.url} target="_blank" rel="noreferrer">Work Item {boards.data.link.work_item_id}</a></>}{boards.data.link.error && <span role="alert"> · {boards.data.link.error}</span>}</p>}
      <div className="action-row"><button type="button" disabled={mutation.isPending || !boards.isSuccess || !!boards.data?.link} onClick={() => mutation.mutate({ path: `/findings/${findingId}/boards`, method: 'POST' })}>Créer un Work Item Azure Boards</button><button type="button" onClick={() => void boards.refetch()}>Actualiser la synchronisation</button></div>
      {!!boards.data?.events.length && <details><summary>Synchronisations récentes (100 maximum)</summary><ul>{boards.data.events.map(item => <li key={item.decision_id}>{item.state} · {item.completed_at ? new Date(item.completed_at).toLocaleString() : 'En attente'}{item.error && <p role="alert">{item.error}</p>}</li>)}</ul></details>}
    </>}
    {!findingId && <><h4>Ma boîte de notifications</h4>{notices.isSuccess && !notices.data.items.length && <p>Aucune notification sur cette page.</p>}<ul>{notices.data?.items.map(item => <li key={item.id}><p><a href={`?finding_id=${encodeURIComponent(item.finding_id)}`}>{item.project_key} · {item.action}</a> · {new Date(item.created_at).toLocaleString()} · {item.read_at ? 'Lu' : 'Non lu'}</p>{!item.read_at && <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ path: `/notifications/${item.id}/read`, method: 'PUT' })}>Marquer comme lu</button>}</li>)}</ul><div className="action-row">{cursor && <button type="button" onClick={() => setCursor('')}>Premières notifications</button>}{notices.data?.next && <button type="button" onClick={() => setCursor(notices.data!.next!)}>Notifications suivantes</button>}<button type="button" onClick={() => void notices.refetch()}>Actualiser les notifications</button></div></>}
    {isAdmin && projectKey && !findingId && <BoardsConfiguration key={projectKey} project={projectKey} token={authToken} />}
    {mutation.isSuccess && <p role="status">Demande enregistrée. Une création de Work Item est asynchrone ; consultez son état de synchronisation.</p>}
  </section>;
}

function BoardsConfiguration({ project, token }: { project: string; token?: string }) {
  const client = useQueryClient();
  const config = useQuery({ queryKey: ['collaboration', 'boards-config', project], queryFn: ({ signal }) => apiJson<Config | null>(`${API}/projects/${encodeURIComponent(project)}/boards`, token, { signal }) });
  const organizations = useQuery({ queryKey: ['devops-organizations'], queryFn: ({ signal }) => apiJson<AzureDevOpsOrganizationConfig[]>(`${BASE}/v1/integrations/azure-devops/configs`, token, { signal }) });
  const [draft, setDraft] = useState<Config | null>(null);
  const form = draft ?? config.data ?? { organization_config_id: '', ado_project: '', work_item_type: 'Bug', enabled: false };
  const mutation = useMutation({ mutationFn: () => apiFetch(`${API}/projects/${encodeURIComponent(project)}/boards`, token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['collaboration', 'boards-config', project] }); setDraft(null); } });
  return <details><summary>Configurer Azure Boards pour {project}</summary><p>Réutilise une intégration Azure DevOps existante. Le projet cible doit correspondre au dépôt lié au projet CodeInsights.</p>{[config.error, organizations.error, mutation.error].filter(Boolean).map((error, index) => <p role="alert" key={index}>{error!.message}</p>)}
    <form className="collaboration-form" onSubmit={event => { event.preventDefault(); if (!mutation.isPending) mutation.mutate(); }}>
      <label>Organisation Azure DevOps<select required value={form.organization_config_id} onChange={event => setDraft({ ...form, organization_config_id: event.target.value })}><option value="">Choisir une intégration</option>{organizations.data?.map(item => <option key={item.config_id} value={item.config_id}>{item.config_name} · {item.organization_url}</option>)}</select></label>
      <label>Projet Azure DevOps<input required maxLength={200} value={form.ado_project} onChange={event => setDraft({ ...form, ado_project: event.target.value })} /></label>
      <label>Type de Work Item<input required maxLength={100} value={form.work_item_type} onChange={event => setDraft({ ...form, work_item_type: event.target.value })} /></label>
      <label className="collaboration-checkbox"><input type="checkbox" checked={form.enabled} onChange={event => setDraft({ ...form, enabled: event.target.checked })} />Activer Azure Boards</label>
      <button type="submit" disabled={mutation.isPending || !config.isSuccess || !organizations.isSuccess}>Enregistrer la configuration</button>
    </form>{mutation.isSuccess && <p role="status">Configuration enregistrée.</p>}
  </details>;
}
