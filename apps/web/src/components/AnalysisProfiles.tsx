import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson, apiPage } from '../api';

export default function AnalysisProfiles({ api, token, project, admin }: { api: string; token?: string; project: string; admin: boolean }) {
  const client = useQueryClient();
  const [cursor, setCursor] = useState('');
  const [definition, setDefinition] = useState('');
  const [profile, setProfile] = useState('');
  const [version, setVersion] = useState('');
  const [enforcement, setEnforcement] = useState('informative');
  const [exception, setException] = useState({ tool: '', rule_id: '', path: '', reason: '', expires_at: '' });
  const catalogue = useQuery({ queryKey: ['profiles', cursor], queryFn: ({ signal }) => apiPage<unknown>(`${api}/v1/profiles?cursor=${encodeURIComponent(cursor)}`, token, { signal }) });
  const assignment = useQuery({ queryKey: ['profile-assignment', project], enabled: !!project,
    queryFn: ({ signal }) => apiJson<{ profile_id: string; profile_version: string; enforcement: string } | null>(`${api}/v1/profiles/projects/${encodeURIComponent(project)}`, token, { signal }) });
  const exceptions = useQuery({ queryKey: ['profile-exceptions', project], enabled: !!project,
    queryFn: ({ signal }) => apiJson<{ id: string; tool: string; rule_id: string; path?: string; reason: string; expires_at: string }[]>(`${api}/v1/profiles/projects/${encodeURIComponent(project)}/exceptions`, token, { signal }) });
  const save = useMutation({ mutationFn: ({ path, body, method }: { path: string; body: unknown; method: string }) => apiJson(`${api}/v1/profiles${path}`, token, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: ['profiles'] }), client.invalidateQueries({ queryKey: ['profile-assignment'] }), client.invalidateQueries({ queryKey: ['profile-exceptions'] })]) });
  const [parseError, setParseError] = useState('');
  return <section className="panel analysis-profiles"><h2>Profils d’analyse versionnés</h2>
    <p>Les nouvelles versions sont immuables ; les analyses conservent leur configuration. Les suppressions globales historiques ne s’appliquent pas à ces profils.</p>
    {[catalogue.error, assignment.error, exceptions.error, save.error].filter(Boolean).map((error, index) => <p role="alert" key={index}>{error!.message}</p>)}
    {catalogue.isLoading && <p role="status">Chargement des profils…</p>}
    <div className="action-row">{cursor && <button type="button" onClick={() => setCursor('')}>Première page de profils</button>}{catalogue.data?.next && <button type="button" onClick={() => setCursor(catalogue.data!.next!)}>Profils suivants</button>}</div>
    <details><summary>Catalogue et conditions</summary><pre >{JSON.stringify(catalogue.data?.items ?? [], null, 2)}</pre></details>
    {assignment.data && <p>Projet : {assignment.data.profile_id} / {assignment.data.profile_version} · {assignment.data.enforcement}</p>}
    {project && assignment.isSuccess && !assignment.data && <p>Aucun profil P1 affecté à ce projet.</p>}
    {admin && <>
      <form onSubmit={event => { event.preventDefault(); try { const body: unknown = JSON.parse(definition); setParseError(''); save.mutate({ path: '', body, method: 'POST' }); } catch { setParseError('Le profil doit être un document JSON valide.'); } }}>
        <label htmlFor="profile-json">Nouvelle version (définition JSON)</label><textarea id="profile-json" value={definition} onChange={event => setDefinition(event.target.value)} required rows={8} />
        {parseError && <p role="alert">{parseError}</p>}<button type="submit" disabled={save.isPending}>Créer une version</button>
      </form>
      {project && <form onSubmit={event => { event.preventDefault(); save.mutate({ path: `/projects/${encodeURIComponent(project)}`, method: 'PUT', body: { profile_id: profile, profile_version: version, enforcement } }); }}>
        <label htmlFor="assigned-profile">Identifiant du profil</label><input id="assigned-profile" required value={profile} onChange={event => setProfile(event.target.value)} />
        <label htmlFor="assigned-version">Version</label><input id="assigned-version" required value={version} onChange={event => setVersion(event.target.value)} />
        <label htmlFor="enforcement">Gate CI</label><select id="enforcement" value={enforcement} onChange={event => setEnforcement(event.target.value)}><option value="informative">Informatif</option><option value="blocking">Bloquant</option></select>
        <button type="submit" disabled={save.isPending}>Affecter au projet</button>
      </form>}
      {project && <form onSubmit={event => { event.preventDefault(); save.mutate({ path: `/projects/${encodeURIComponent(project)}/exceptions`, method: 'POST', body: { ...exception, path: exception.path || null, expires_at: new Date(exception.expires_at).toISOString() } }); }}>
        <h3>Exception limitée au projet</h3>{(['tool', 'rule_id', 'path', 'reason', 'expires_at'] as const).map(field => <label key={field}>{({ tool: 'Outil', rule_id: 'Règle', path: 'Chemin (facultatif)', reason: 'Motif', expires_at: 'Expiration' })[field]}<input type={field === 'expires_at' ? 'datetime-local' : 'text'} required={field !== 'path'} value={exception[field]} onChange={event => setException({ ...exception, [field]: event.target.value })} /></label>)}<button type="submit" disabled={save.isPending}>Créer l’exception</button>
      </form>}
    </>}
    {(exceptions.data ?? []).map(item => <p key={item.id}>{item.tool} · {item.rule_id} · {item.path ?? 'Tous chemins'} · {item.reason} · expire {new Date(item.expires_at).toLocaleString()}</p>)}
    {save.isSuccess && <p role="status">Enregistré.</p>}
  </section>;
}
