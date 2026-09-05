import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../api';

type Ratio = { state: string; numerator: number | null; denominator: number | null; percentage: number | null };
type Totals = { lines: Ratio; branches: Ratio; conditions: Ratio; code_lines: number | null; class_complexity: number | null; duplication_state: string; duplicate_blocks: number | null; formula_version: string };
type Location = { path: string; start: number; end: number; source_url: string | null };
type Row = { path?: string; source_url?: string | null; totals?: Totals; line?: number; covered?: boolean | number; total?: number; kind?: string; identity?: string; tool?: string; tool_version?: string; first?: Location; second?: Location; lines?: number; language?: string };
type Result = { state: string; reason?: string; commit_sha?: string; totals?: Totals; items?: Row[]; next_cursor?: number | null; provenance?: { report_id: string; tool: string; tool_version: string; format: string }[] };

const labels: Record<string, string> = { unavailable: 'Indisponible', not_measured: 'Non mesuré', not_applicable: 'Non applicable', ambiguous: 'Fusion indéterminée', measured: 'Mesuré' };
const API = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api');
const ratio = (value: Ratio) => value.percentage === null ? labels[value.state] ?? value.state : `${value.percentage.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % (${value.numerator}/${value.denominator})`;
const number = (value: number | null | undefined) => value == null ? 'Non mesuré' : value.toLocaleString('fr-FR');

export default function CodeQuality({ analysisId, token }: { analysisId: string; token?: string }) {
  const id = useId();
  const [selection, setSelection] = useState({ analysis: analysisId, scope: 'global', view: 'files', path: '', cursor: 0 });
  const current = selection.analysis === analysisId ? selection : { analysis: analysisId, scope: 'global', view: 'files', path: '', cursor: 0 };
  const select = (change: Partial<typeof current>) => setSelection({ ...current, cursor: 0, ...change });
  const query = useQuery({
    queryKey: ['code-quality', analysisId, current.scope, current.view, current.path, current.cursor],
    enabled: Boolean(analysisId),
    queryFn: ({ signal }) => apiJson<Result>(`${API}/v1/analyses/${encodeURIComponent(analysisId)}/code-quality?${new URLSearchParams({ scope: current.scope, view: current.view, path: current.path, cursor: String(current.cursor), limit: '50' })}`, token, { signal }),
  });
  const totals = query.data?.totals;
  const source = (location: Location) => location.source_url ? <a href={location.source_url} target="_blank" rel="noopener noreferrer">{location.path}:{location.start}–{location.end}</a> : <span>{location.path}:{location.start}–{location.end} · lien indisponible</span>;
  return <section className="analysis-evidence" aria-label="Qualité détaillée du code">
    <h3>Couverture, duplication et taille</h3>
    <p className="hint">Comptages des producteurs au commit <code>{query.data?.commit_sha ?? 'non disponible'}</code>. Les branches et conditions restent séparées. Aucune moyenne de pourcentages.</p>
    <div className="action-row">
      <label htmlFor={`${id}-scope`}>Périmètre <select id={`${id}-scope`} value={current.scope} onChange={e => select({ scope: e.target.value })}><option value="global">Global</option><option value="new_code">Nouveau code</option></select></label>
      <label htmlFor={`${id}-view`}>Détail <select id={`${id}-view`} value={current.view} onChange={e => select({ view: e.target.value })}><option value="files">Fichiers</option><option value="directories">Répertoires</option><option value="lines">Lignes de couverture</option><option value="branches">Branches et conditions</option><option value="duplicates">Blocs dupliqués</option></select></label>
      <label htmlFor={`${id}-path`}>Chemin <input id={`${id}-path`} value={current.path} maxLength={4096} placeholder="src/" onChange={e => select({ path: e.target.value })} /></label>
    </div>
    {query.isLoading && <p role="status">Chargement des preuves de code…</p>}
    {query.error && <p role="alert">{query.error.message}</p>}
    {query.data?.state === 'unavailable' && <p role="status">Preuves détaillées indisponibles pour cette analyse.</p>}
    {totals && <>
      <dl className="metric-grid">
        <div className="metric-card"><dt>Couverture lignes</dt><dd>{ratio(totals.lines)}</dd></div>
        <div className="metric-card"><dt>Couverture branches</dt><dd>{ratio(totals.branches)}</dd></div>
        <div className="metric-card"><dt>Couverture conditions</dt><dd>{ratio(totals.conditions)}</dd></div>
        <div className="metric-card"><dt>Lignes de code</dt><dd>{number(totals.code_lines)}</dd></div>
        <div className="metric-card"><dt>Complexité des classes</dt><dd>{number(totals.class_complexity)}</dd></div>
        <div className="metric-card"><dt>Blocs dupliqués</dt><dd>{totals.duplicate_blocks === null ? labels[totals.duplication_state] ?? totals.duplication_state : number(totals.duplicate_blocks)}</dd></div>
      </dl>
      <p className="hint">Formule {totals.formula_version}. Taille et complexité ne sont pas réparties sur les lignes nouvelles. Les conditions sans identités ne peuvent pas être fusionnées entre rapports superposés.</p>
    </>}
    {!!query.data?.items?.length && <div className="table-wrap" tabIndex={0} role="region" aria-label="Preuves détaillées par fichier"><table>
      <thead><tr><th>Localisation</th><th>Mesure</th><th>Provenance / détail</th></tr></thead>
      <tbody>{query.data.items.map((item, index) => <tr key={`${current.cursor}-${index}`}>
        <td>{item.first && item.second ? <>{source(item.first)}<br />{source(item.second)}</> : item.source_url ? <a href={item.source_url} target="_blank" rel="noopener noreferrer">{item.path}{item.line ? `:${item.line}` : ''}</a> : <code>{item.path}{item.line ? `:${item.line}` : ''}</code>}</td>
        <td>{item.totals ? <>Lignes : {ratio(item.totals.lines)}<br />Branches : {ratio(item.totals.branches)}<br />Conditions : {ratio(item.totals.conditions)}<br />Taille : {number(item.totals.code_lines)} · complexité : {number(item.totals.class_complexity)}</> : item.first ? `${item.lines} lignes dupliquées` : typeof item.covered === 'boolean' ? item.covered ? 'Couverte' : 'Non couverte' : `${item.covered}/${item.total}`}</td>
        <td>{item.tool ? `${item.tool} ${item.tool_version || 'version inconnue'}` : 'Union des rapports du périmètre'}{item.kind && <><br />{item.kind} · {item.identity}</>}{item.language && <><br />{item.language}</>}</td>
      </tr>)}</tbody>
    </table></div>}
    {query.data?.state === 'available' && !query.data.items?.length && <p role="status">Aucune preuve fournie dans cette vue et ce périmètre.</p>}
    <div className="action-row">{current.cursor > 0 && <button type="button" onClick={() => select({ cursor: 0 })}>Première page</button>}{query.data?.next_cursor != null && <button type="button" onClick={() => select({ cursor: query.data!.next_cursor! })}>Page suivante</button>}</div>
    {!!query.data?.provenance?.length && <details><summary>Rapports producteurs</summary>{query.data.provenance.map(p => <p key={p.report_id}><code>{p.report_id}</code> · {p.tool} {p.tool_version || 'version inconnue'} · {p.format}</p>)}</details>}
  </section>;
}
