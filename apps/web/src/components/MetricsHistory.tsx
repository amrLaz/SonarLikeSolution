import InfoHint from './InfoHint';
import { METRIC_FIELDS } from './AnalysisEvidence';
import { comparableVersions, formatMetric, metricPoint } from '../metric-display';
import type { AnalysisRecord } from '../types';

export default function MetricsHistory({ history, project, branch }: { history: AnalysisRecord[]; project: string; branch: string }) {
  const analyses = [...history].sort((left, right) => left.created_at.localeCompare(right.created_at));
  if (!analyses.length) return <p className="empty-state">Aucune analyse disponible pour cette branche.</p>;
  return (
    <section className="metrics-history" aria-labelledby="metrics-history-title">
      <h3 id="metrics-history-title">
        Évolution des métriques{' '}
        <InfoHint>Chaque métrique garde sa propre échelle pour ne pas mélanger pourcentages, scores et nombres d’issues. Une donnée absente ou un changement de version interrompt sa courbe.</InfoHint>
      </h3>
      <div className="charts-grid">
        {METRIC_FIELDS.map(([key, label, unit]) => {
          const values = analyses.map((analysis) => analysis.metrics[key]);
          const maximum = unit ? 100 : Math.max(1, ...values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)));
          const points = values.map((value, index) => metricPoint(value, index, values.length, maximum));
          return (
            <article className="metric-trend" key={key}>
              <header>
                <strong>{label}</strong>
                <span>
                  0–{maximum}
                  {unit === '%' ? '%' : ''}
                </span>
              </header>
              {points.some(Boolean) ? (
                <svg viewBox="0 0 360 120" className="trend-chart" role="img" aria-label={`Évolution ${label}. Valeurs exactes dans le tableau.`}>
                  {points.map(
                    (point, index) =>
                      point && (
                        <g key={index}>
                          {index > 0 && points[index - 1] && comparableVersions(analyses[index - 1], analyses[index]) && (
                            <line x1={points[index - 1]!.x} y1={points[index - 1]!.y} x2={point.x} y2={point.y} stroke="var(--primary)" strokeWidth="2" />
                          )}
                          <circle cx={point.x} cy={point.y} r="3" fill="var(--primary)" />
                        </g>
                      ),
                  )}
                </svg>
              ) : (
                <p className="empty-state">Non disponible</p>
              )}
            </article>
          );
        })}
      </div>
      <details>
        <summary>Valeurs exactes</summary>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Valeurs des métriques dans le temps">
          <table>
            <caption>
              {project} · {branch}
            </caption>
            <thead>
              <tr>
                <th>Date</th>
                <th>Commit</th>
                {METRIC_FIELDS.map(([key, label]) => (
                  <th key={key}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analyses.map((analysis) => (
                <tr key={analysis.analysis_id}>
                  <th scope="row">{new Date(analysis.created_at).toLocaleString()}</th>
                  <td>
                    <code>{analysis.commit_sha || 'Non disponible'}</code>
                  </td>
                  {METRIC_FIELDS.map(([key, , unit]) => (
                    <td key={key}>{formatMetric(analysis.metrics[key], unit)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
