import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api';
import { evidenceLink } from '../evidence-links';
import CodeQuality from './CodeQuality';

type FileEntry = { path: string; kind: string; source_url: string | null; finding_count: number | null; executable_lines: number | null; covered_lines: number | null };
type FilePage = { commit_sha: string; inventory_state: string; scope?: { component: string; version: string }; files: FileEntry[] };
type FileDetail = { path: string; commit_sha: string; kind: string; findings_truncated: boolean; lines: { line: number; covered: boolean | null; source_url: string | null; findings: { id: number; tool: string; rule_id: string; category: string; severity: string; message: string }[] }[] };
const kindLabel: Record<string, string> = { source: 'Source', test: 'Test', generated: 'Généré', third_party: 'Tiers' };

export default function CodeExplorer({ api, token, analysisId }: { api: string; token?: string; analysisId: string }) {
  const [prefix, setPrefix] = useState('');
  const [page, setPage] = useState({ prefix: '', cursor: '' });
  const [file, setFile] = useState({ path: '', cursor: '' });
  const files = useQuery({ queryKey: ['code-files', analysisId, page], enabled: !!analysisId,
    queryFn: async ({ signal }) => {
      const response = await apiFetch(`${api}/v1/code/analyses/${encodeURIComponent(analysisId)}/files?${new URLSearchParams(page)}`, token, { signal });
      return { data: await response.json() as FilePage, next: response.headers.get('X-Next-Cursor') };
    } });
  const detail = useQuery({ queryKey: ['code-file', analysisId, file], enabled: !!analysisId && !!file.path,
    queryFn: async ({ signal }) => {
      const response = await apiFetch(`${api}/v1/code/analyses/${encodeURIComponent(analysisId)}/file?${new URLSearchParams(file)}`, token, { signal });
      return { data: await response.json() as FileDetail, next: response.headers.get('X-Next-Cursor') };
    } });
  return <section><h2>Code au commit analysé</h2>
    {!analysisId ? <p role="status">Sélectionnez une analyse.</p> : <>
      <p className="hint">Navigation dans les chemins du dépôt et annotations reçues. Les liens ouvrent le SHA analysé ; aucune copie de source n’est affichée.</p>
      <form onSubmit={event => { event.preventDefault(); setPage({ prefix, cursor: '' }); }}><label htmlFor="code-path-prefix">Répertoire ou préfixe du chemin</label><input id="code-path-prefix" value={prefix} maxLength={1500} placeholder="apps/api/" onChange={event => setPrefix(event.target.value)} /><button type="submit">Afficher les fichiers</button></form>
      {files.isLoading && <p role="status">Chargement des fichiers…</p>}{files.error && <p role="alert">{files.error.message}</p>}
      {files.data && <>
        <p>Commit <code>{files.data.data.commit_sha}</code>{files.data.data.scope && <> · composant {files.data.data.scope.component} / {files.data.data.scope.version}</>}.</p>
        <p className="hint">{files.data.data.inventory_state === 'git_tree' ? 'Inventaire Git au commit analysé, limité au composant.' : 'Inventaire Git absent : seuls les fichiers des rapports sont disponibles.'} {files.data.data.files.length} fichiers sur cette page.</p>
        {!files.data.data.files.length ? <p role="status">Aucun fichier dans ce périmètre.</p> : <div className="table-wrap" tabIndex={0} role="region" aria-label="Fichiers du commit"><table><thead><tr><th>Fichier</th><th>Type</th><th>Findings</th><th>Lignes couvertes / exécutables</th></tr></thead><tbody>{files.data.data.files.map(item => {
          const link = evidenceLink(item.source_url);
          return <tr key={item.path}><th scope="row"><button type="button" aria-pressed={file.path === item.path} onClick={() => setFile({ path: item.path, cursor: '' })}>{item.path}</button>{link && <> <a href={link} target="_blank" rel="noreferrer" aria-label={`Ouvrir ${item.path} au commit analysé`}>↗</a></>}</th><td>{kindLabel[item.kind] ?? item.kind}</td><td>{item.finding_count ?? 'Non mesuré'}</td><td>{item.executable_lines == null ? 'Non mesurée' : `${item.covered_lines} / ${item.executable_lines}`}</td></tr>;
        })}</tbody></table></div>}
        <div className="action-row">{page.cursor && <button type="button" onClick={() => setPage({ ...page, cursor: '' })}>Premiers fichiers</button>}{files.data.next && <button type="button" onClick={() => setPage({ ...page, cursor: files.data!.next! })}>Fichiers suivants</button>}</div>
      </>}
      {detail.isLoading && <p role="status">Chargement des annotations…</p>}{detail.error && <p role="alert">{detail.error.message}</p>}
      {detail.data && <section className="panel" aria-label="Annotations du fichier"><h3><code>{detail.data.data.path}</code></h3><p>{kindLabel[detail.data.data.kind] ?? detail.data.data.kind} · commit <code>{detail.data.data.commit_sha}</code>.</p>
        <p className="hint">Seules les lignes portant une mesure ou un finding apparaissent ; une couverture absente reste non mesurée.</p>
        {!detail.data.data.lines.length ? <p role="status">Aucune annotation reçue dans cette page.</p> : <div className="table-wrap" tabIndex={0} role="region" aria-label="Lignes annotées"><table><thead><tr><th>Ligne</th><th>Couverture</th><th>Findings reçus</th></tr></thead><tbody>{detail.data.data.lines.map(line => {
          const url = evidenceLink(line.source_url);
          return <tr key={line.line}><th scope="row">{url ? <a href={url} target="_blank" rel="noreferrer">L{line.line} ↗</a> : `L${line.line} · lien indisponible`}</th><td>{line.covered == null ? 'Non mesurée' : line.covered ? 'Couverte' : 'Non couverte'}</td><td>{line.findings.length ? line.findings.map(finding => <p key={finding.id}><code>{finding.tool} / {finding.rule_id}</code> · {finding.severity} · {finding.category}<br />{finding.message}</p>) : 'Aucun finding reçu'}</td></tr>;
        })}</tbody></table></div>}
        {detail.data.data.findings_truncated && <p role="status">Findings limités aux 500 premières occurrences de cette page de lignes.</p>}
        <div className="action-row">{file.cursor && <button type="button" onClick={() => setFile({ ...file, cursor: '' })}>Premières annotations</button>}{detail.data.next && <button type="button" onClick={() => setFile({ ...file, cursor: detail.data!.next! })}>Annotations suivantes</button>}</div>
      </section>}
      <CodeQuality analysisId={analysisId} token={token} />
    </>}
  </section>;
}
