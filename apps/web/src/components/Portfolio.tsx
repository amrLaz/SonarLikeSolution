import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '../api';
import { METRIC_FIELDS } from './AnalysisEvidence';
import { completenessLabel, formatMetric, gateLabel, measurementStateLabel } from '../metric-display';

type Point = {
  analysis_id: string; project_key: string; branch: string; commit_sha: string; created_at: string;
  profile_id: string; profile_version: string; formula_version: string; quality_gate: string;
  completeness: string; freshness: string; comparison_state: string; baseline_analysis_id: string | null;
  details_purged: boolean; dimensions: Record<string, { state: string; value: number | null; delta: number | null; trend: string }>;
  objectives: { dimension: string; target: number; due_at: string; state: string }[];
};
type Page = { schema_version: number; generated_at: string; scope: unknown; freshness_days: number; items: Point[]; next_cursor: string | null };
const filterLabels = { project_key: 'Projet', branch: 'Branche', organization_id: 'Identifiant organisation', team_id: 'Identifiant équipe propriétaire', commit: 'Préfixe commit', from: 'Depuis (UTC)', to: 'Jusqu’au (UTC)' };
type Filters = Record<keyof typeof filterLabels, string> & { latest: string };
const stateLabels: Record<string, string> = { comparable: 'Comparable', version_break: 'Rupture de version', version_unknown: 'Version inconnue', baseline_absent: 'Sans référence', incomplete: 'Incomplet', fresh: 'Récent', stale: 'Ancien', unknown: 'Inconnu', improved: 'Amélioration', regressed: 'Régression', stable: 'Stable', not_comparable: 'Non comparable', met: 'Atteint', unmet: 'Non atteint' };
const initialFilters = (): Filters => {
  const params = new URLSearchParams(window.location.search);
  return Object.fromEntries([...Object.keys(filterLabels), 'latest'].map(key => [key, params.get(`portfolio_${key}`) ?? (key === 'latest' ? 'true' : '')])) as Filters;
};

export default function Portfolio({ authToken, isAdmin, apiBase = '/api' }: { authToken?: string; isAdmin: boolean; apiBase?: string }) {
  const client = useQueryClient();
  const [filters, setFilters] = useState(initialFilters);
  const [applied, setApplied] = useState(filters);
  const [cursors, setCursors] = useState<string[]>(['']);
  const [dimension, setDimension] = useState('bugs');
  const [notice, setNotice] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const exportAbort = useRef<AbortController | null>(null);
  useEffect(() => () => exportAbort.current?.abort(), []);
  const [objective, setObjective] = useState<{ point: Point; dimension: string; target: string; due: string } | null>(null);
  const utcDate = (value: string) => {
    if (!value) return '';
    const date = new Date(value + 'Z');
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  };
  const params = (cursor = '', scope = applied) => new URLSearchParams({ ...scope, from: utcDate(scope.from), to: utcDate(scope.to), limit: '50', cursor });
  const query = useQuery({ queryKey: ['portfolio', applied, cursors[cursors.length - 1]], enabled: !!authToken,
    queryFn: ({ signal }) => apiJson<Page>(`${apiBase}/v1/portfolio/history?${params(cursors[cursors.length - 1])}`, authToken, { signal }) });
  const save = useMutation({ mutationFn: async () => {
    if (!objective) return;
    const target = Number(objective.target);
    const due = new Date(objective.due + 'T23:59:59Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(objective.due) || !Number.isFinite(due.getTime()) || due.toISOString().slice(0, 10) !== objective.due)
      throw new Error('Saisissez une échéance UTC valide.');
    if (!objective.target.trim() || !Number.isSafeInteger(target) || target < 0 || target > 2147483647 || (objective.dimension.endsWith('_score') || ['coverage', 'duplication'].includes(objective.dimension)) && target > 100)
      throw new Error('Saisissez une cible entière positive ou nulle, limitée à 100 pour les scores et pourcentages.');
    const point = objective.point;
    await apiJson(`${apiBase}/v1/portfolio/objectives`, authToken, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      project_key: point.project_key, branch: point.branch, dimension: objective.dimension, target,
      profile_id: point.profile_id, profile_version: point.profile_version, formula_version: point.formula_version, due_at: due.toISOString(),
    }) });
  }, onSuccess: async () => { setNotice('Objectif enregistré.'); setObjective(null); await client.invalidateQueries({ queryKey: ['portfolio'] }); } });

  async function exportAll() {
    setExporting(true); setExportError('');
    const controller = new AbortController(); exportAbort.current = controller;
    try {
      // ponytail: JSON export is assembled in the browser; use a streaming server export if the measured portfolio exceeds browser memory.
      let cursor = ''; let first: Page | undefined; const items: Point[] = []; const seen = new Set<string>();
      do {
        const page = await apiJson<Page>(`${apiBase}/v1/portfolio/history?${params(cursor)}`, authToken, { signal: controller.signal });
        first ??= page; items.push(...page.items); cursor = page.next_cursor ?? '';
        if (cursor && seen.has(cursor)) throw new Error('Le serveur a répété un curseur. Export interrompu.');
        seen.add(cursor);
      } while (cursor);
      const url = URL.createObjectURL(new Blob([JSON.stringify({ ...first, items, next_cursor: null }, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'codeinsights-portfolio.json'; link.click(); URL.revokeObjectURL(url);
      setNotice(`${items.length} synthèses exportées avec leur périmètre et leurs versions.`);
    } catch (error) { setExportError(error instanceof Error ? error.message : 'Export impossible'); }
    finally { setExporting(false); }
  }

  return <section className="panel collaboration-screen">
    <h2>Portefeuille et historique</h2>
    <p className="hint">Dimensions séparées par projet et branche. La référence est l’analyse précédente de la même branche, même avant la période filtrée. Une rupture de version ou une mesure absente interdit la comparaison.</p>
    <form className="form-grid" onSubmit={event => {
      event.preventDefault(); setApplied(filters); setCursors(['']); setNotice('');
      const url = new URL(window.location.href); url.searchParams.set('tab', 'portfolio');
      for (const [key, value] of Object.entries(filters)) { if (value) url.searchParams.set(`portfolio_${key}`, value); else url.searchParams.delete(`portfolio_${key}`); }
      url.searchParams.delete('analysis_id'); url.searchParams.delete('finding_id'); window.history.replaceState({}, '', url);
    }}>
      {Object.entries(filterLabels).map(([key, label]) => <label key={key}>{label}<input type={key === 'from' || key === 'to' ? 'datetime-local' : 'text'} value={filters[key as keyof Filters]} maxLength={key === 'branch' ? 500 : 128} onChange={event => setFilters({ ...filters, [key]: event.target.value })} /></label>)}
      <label>Historique<select value={filters.latest} onChange={event => setFilters({ ...filters, latest: event.target.value })}><option value="true">Dernière analyse par projet et branche</option><option value="false">Toutes les analyses de la période</option></select></label>
      <div className="action-row"><button className="primary" type="submit">Appliquer les filtres</button><button type="button" disabled={exporting || query.isPending} onClick={exportAll}>{exporting ? 'Export en cours…' : 'Exporter le périmètre en JSON'}</button>{exporting && <button type="button" onClick={() => exportAbort.current?.abort()}>Annuler l’export</button>}</div>
    </form>
    <p className="hint">L’URL conserve les filtres appliqués pour le partage. L’accès reste soumis aux droits du destinataire. Fraîcheur : {query.data?.freshness_days ?? 7} jours. Les filtres organisation et équipe utilisent leur identifiant exact.</p>
    {notice && <p role="status" className="feedback">{notice}</p>}
    {exportError && <p role="alert" className="feedback error">{exportError}</p>}
    {query.isPending && <p role="status">Chargement des synthèses…</p>}
    {query.error && <p role="alert" className="feedback error">{query.error.message}</p>}
    {query.data && <>
      <label>Dimension affichée <select value={dimension} onChange={event => setDimension(event.target.value)}>{METRIC_FIELDS.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <p role="status">{query.data.items.length} synthèses sur cette page · page {cursors.length}{query.data.next_cursor ? ' · suite disponible' : ' · dernière page'}</p>
      {query.data.items.length === 0 ? <p className="empty-state">Aucune analyse accessible ne correspond aux filtres.</p> : <div className="table-wrap" tabIndex={0} role="region" aria-label="Synthèses du portefeuille">
        <table><caption>Valeurs exactes — {METRIC_FIELDS.find(([key]) => key === dimension)?.[1]}</caption><thead><tr><th scope="col">Projet / branche</th><th scope="col">Commit / date</th><th scope="col">Mesure</th><th scope="col">Progression</th><th scope="col">Confiance</th><th scope="col">Versions</th><th scope="col">Objectif actuel</th></tr></thead>
          <tbody>{query.data.items.map(point => { const measure = point.dimensions[dimension]; const target = point.objectives.find(item => item.dimension === dimension); return <tr key={point.analysis_id}>
            <th scope="row">{point.project_key}<br /><code>{point.branch}</code></th>
            <td><a href={`?analysis_id=${encodeURIComponent(point.analysis_id)}`}><code>{point.commit_sha}</code></a><br /><time dateTime={point.created_at}>{new Date(point.created_at).toLocaleString()}</time>{point.details_purged && <p className="hint">Synthèse conservée ; détails purgés</p>}</td>
            <td>{formatMetric(measure?.value, METRIC_FIELDS.find(([key]) => key === dimension)?.[2])}<br />{measurementStateLabel(measure?.state)}</td>
            <td>{stateLabels[measure?.trend] ?? 'Non comparable'}{measure?.delta != null && <> ({measure.delta > 0 ? '+' : ''}{measure.delta})</>}<br />{stateLabels[point.comparison_state] ?? point.comparison_state}{point.baseline_analysis_id && <><br /><a href={`?analysis_id=${encodeURIComponent(point.baseline_analysis_id)}`}>Analyse de référence</a></>}</td>
            <td>{gateLabel(point.quality_gate)}<br />{completenessLabel(point.completeness)}<br />{stateLabels[point.freshness] ?? point.freshness}</td>
            <td><code>{point.profile_id} / {point.profile_version}</code><br /><code>{point.formula_version}</code></td>
            <td>{target ? <>{target.target} · {stateLabels[target.state] ?? target.state}<br />Échéance UTC : {new Date(target.due_at).toLocaleDateString(undefined, { timeZone: 'UTC' })}</> : 'Aucun objectif'}{isAdmin && <><br /><button type="button" onClick={() => { save.reset(); setObjective({ point, dimension, target: String(target?.target ?? ''), due: target?.due_at.slice(0, 10) ?? '' }); }}>Définir un objectif</button></>}</td>
          </tr>; })}</tbody></table>
      </div>}
      <div className="action-row"><button type="button" disabled={cursors.length === 1 || query.isFetching} onClick={() => setCursors(cursors.slice(0, -1))}>Page précédente</button><button type="button" disabled={!query.data.next_cursor || query.isFetching} onClick={() => setCursors([...cursors, query.data!.next_cursor!])}>Page suivante</button></div>
    </>}
    {objective && <form className="form-grid" onSubmit={event => { event.preventDefault(); if (!save.isPending) save.mutate(); }}>
      <h3>Objectif — {objective.point.project_key} / {objective.point.branch}</h3>
      <p className="hint">{objective.dimension} · {objective.point.profile_id}/{objective.point.profile_version} · {objective.point.formula_version}. Un changement de contrat suspend son évaluation.</p>
      <label>Cible<input autoFocus type="number" min="0" max={objective.dimension.endsWith('_score') || ['coverage', 'duplication'].includes(objective.dimension) ? 100 : undefined} step="1" required value={objective.target} onChange={event => setObjective({ ...objective, target: event.target.value })} /></label>
      <label>Échéance UTC<input type="date" required value={objective.due} onChange={event => setObjective({ ...objective, due: event.target.value })} /></label>
      <div className="action-row"><button className="primary" disabled={save.isPending}>Enregistrer</button><button type="button" disabled={save.isPending} onClick={() => setObjective(null)}>Annuler</button></div>
      {save.error && <p role="alert" className="feedback error">{save.error.message}</p>}
    </form>}
  </section>;
}
