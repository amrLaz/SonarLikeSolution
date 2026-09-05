import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson, apiPage } from '../api';

type Comparison = { state: string; reason?: string; new_count?: number; persistent_count?: number; resolved_count?: number; indeterminate_count?: number; coverage?: number | null; baseline_id?: string; base_sha?: string; head_sha?: string; covered_lines?: number; executable_lines?: number };
type Component = { id: number; name: string; version: string | null; purl: string | null; relationship: string; licenses: string[]; license_decision: string; source: string; observed_at: string; vulnerabilities: unknown[] };
const API = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api');

export function NewCode({ analysisId, token }: { analysisId: string; token?: string }) {
  const query = useQuery({ queryKey: ['comparison', analysisId], enabled: !!analysisId,
    queryFn: ({ signal }) => apiJson<Comparison>(`${API}/v1/insights/analyses/${encodeURIComponent(analysisId)}/comparison`, token, { signal }) });
  return <section className="panel comparison-panel"><h2>New Code</h2>
    {!analysisId ? <p role="status">Sélectionnez une analyse.</p> : query.isLoading ? <p role="status">Chargement de la comparaison…</p> : query.error ? <p role="alert">{query.error.message}</p> : query.data?.state !== 'available' ? <p role="status">Non disponible : {query.data?.reason ?? 'comparaison non mesurée'}.</p> : <>
      <p>Comparaison Git de l’analyse sélectionnée et de sa cible figée.</p>
      <p className="scope-note">Baseline : <code>{query.data.baseline_id ?? 'Non disponible'}</code><br /><code>{query.data.base_sha ?? 'Non disponible'}</code> → <code>{query.data.head_sha ?? 'Non disponible'}</code></p>
      <dl className="metric-grid">{([['Nouveaux', query.data.new_count], ['Persistants', query.data.persistent_count], ['Résolus', query.data.resolved_count], ['Indéterminés', query.data.indeterminate_count], ['Couverture des lignes modifiées (%)', query.data.coverage]] as const).map(([label, value]) => <div className="metric-card" key={label}><dt>{label}</dt><dd>{value ?? 'Non disponible'}</dd></div>)}</dl>
      <p>{query.data.covered_lines ?? 'Non disponible'} lignes couvertes / {query.data.executable_lines ?? 'Non disponible'} lignes exécutables modifiées dans les données reçues. {query.data.executable_lines === 0 && 'L’absence de lignes ne prouve pas la présence d’un rapport de couverture ; consultez l’état de la condition dans les preuves du gate.'}</p>
    </>}
  </section>;
}

export default function IngestionDetails({ project, analysisId, token }: { project: string; analysisId: string; token?: string }) {
  const [page, setPage] = useState({ analysis: '', cursor: '' });
  const cursor = page.analysis === analysisId ? page.cursor : '';
  const [importPage, setImportPage] = useState({ project: '', cursor: '' });
  const importCursor = importPage.project === project ? importPage.cursor : '';
  const [importSelection, setImportSelection] = useState({ project: '', id: '' });
  const selectedImport = importSelection.project === project ? importSelection.id : '';
  const receipt = useQuery({ queryKey: ['ingestion', selectedImport], enabled: !!selectedImport,
    queryFn: ({ signal }) => apiJson<{ reports: { report_id: string; state: string; size_bytes: number; error: string }[] }>(`${API}/v1/ingestions/${encodeURIComponent(selectedImport)}`, token, { signal }) });
  const components = useQuery({ queryKey: ['components', analysisId, cursor], enabled: !!analysisId,
    queryFn: ({ signal }) => apiPage<Component>(`${API}/v1/insights/analyses/${encodeURIComponent(analysisId)}/components?cursor=${encodeURIComponent(cursor)}`, token, { signal }) });
  const ingestions = useQuery({ queryKey: ['ingestions', project, importCursor], enabled: !!project,
    queryFn: ({ signal }) => apiPage<{ ingestion_id: string; revision: number; state: string; technical_state: string; quality_gate: string; error?: string }>(`${API}/v1/ingestions?project_key=${encodeURIComponent(project)}&cursor=${encodeURIComponent(importCursor)}`, token, { signal }) });
  return <section className="panel ingestion-details"><h2>Rapports et composants</h2>
    <button type="button" onClick={() => { void ingestions.refetch(); void components.refetch(); }}>Actualiser les imports</button>
    {ingestions.isLoading && <p role="status">Chargement des imports…</p>}
    {ingestions.error && <p role="alert">{ingestions.error.message}</p>}
    <p className="hint">Imports du projet, 50 par page. Le verdict qualité et l’état technique sont distincts.</p>
    {(ingestions.data?.items ?? []).map(item => <p key={item.ingestion_id}><button type="button" aria-pressed={selectedImport === item.ingestion_id} onClick={() => setImportSelection({ project, id: item.ingestion_id })}>{item.ingestion_id}</button> · révision {item.revision} · {item.state} · technique : {item.technical_state} · qualité : {item.quality_gate}{item.error && ` · ${item.error}`}</p>)}
    <div className="action-row">{importCursor && <button type="button" onClick={() => setImportPage({ project, cursor: '' })}>Première page d’imports</button>}{ingestions.data?.next && <button type="button" onClick={() => setImportPage({ project, cursor: ingestions.data!.next! })}>Imports précédents</button>}</div>
    {receipt.isLoading && <p role="status">Chargement du reçu…</p>}{receipt.error && <p role="alert">{receipt.error.message}</p>}
    {receipt.data && <div><h3>Rapports du reçu</h3><p>{receipt.data.reports.filter(report => report.state === 'received').length} reçus / {receipt.data.reports.length} déclarés</p>{receipt.data.reports.map(report => <p key={report.report_id}><code>{report.report_id}</code> · {report.state} · {report.size_bytes} octets {report.error}</p>)}</div>}
    <h3>Inventaire SBOM de l’analyse sélectionnée</h3>
    <p className="hint">Les CVE proviennent uniquement des rapports. Une liste vide ne prouve pas l’absence de vulnérabilités.</p>
    {components.isLoading ? <p role="status">Chargement des composants…</p> : components.error ? <p role="alert">{components.error.message}</p> : !components.data?.items.length ? <p role="status">Aucun composant fourni pour cette analyse.</p> : <div className="table-wrap" tabIndex={0} role="region" aria-label="Composants SBOM"><table><thead><tr><th>Composant</th><th>Relation</th><th>Licences</th><th>Décision</th><th>Provenance</th></tr></thead><tbody>{components.data.items.map(item => <tr key={item.id}><td>{item.name} {item.version ?? 'version inconnue'}<br /><code>{item.purl}</code></td><td>{item.relationship}</td><td>{item.licenses.join(', ') || 'Non disponible'}</td><td>{item.license_decision}</td><td>{item.source}<br />{new Date(item.observed_at).toLocaleString()}<br />{item.vulnerabilities.length} références CVE reçues</td></tr>)}</tbody></table></div>}
    <div className="action-row">{cursor && <button type="button" onClick={() => setPage({ analysis: analysisId, cursor: '' })}>Première page</button>}{components.data?.next && <button type="button" onClick={() => setPage({ analysis: analysisId, cursor: components.data!.next! })}>Composants suivants</button>}</div>
  </section>;
}
