import InfoHint from './InfoHint';
import type { AnalysisRecord, ProjectSummary } from '../types';
import { analysisGateLabel, comparableVersions, formatMetric, metricPoint } from '../metric-display';
import { METRIC_FIELDS } from './AnalysisEvidence';

type EvolutionProps = {
  summaries: ProjectSummary[];
  selectedSummary: ProjectSummary | null;
  selectedProject: string;
  selectedBranch: string;
  setSelectedProject: (project: string) => void;
  setSelectedBranch: (branch: string) => void;
  selectedProjectAnalyses: AnalysisRecord[];
};

export default function Evolution({ summaries, selectedSummary, selectedProject, selectedBranch, setSelectedProject, setSelectedBranch, selectedProjectAnalyses }: EvolutionProps) {
  return (
    <section className="panel">
      <div className="tab-project-bar">
        <select
          aria-label="Project"
          value={selectedProject}
          onChange={(e) => {
            setSelectedProject(e.target.value);
            setSelectedBranch('');
          }}
        >
          <option value="">— Select project —</option>
          {summaries.map((s) => (
            <option key={s.projectKey} value={s.projectKey}>
              {s.projectKey}
            </option>
          ))}
        </select>
        {selectedSummary && (
          <select aria-label="Branch" value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
            {(selectedSummary.branches?.map((branch) => branch.name) ?? [...new Set(selectedSummary.history.map((a) => a.branch))]).map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedSummary ? (
        <>
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ margin: '0 0 16px 0' }}>
              Metrics evolution — {selectedProject} · {selectedBranch || 'all branches'}{' '}
              <InfoHint>
                Valeurs publiées par analyse. Les mesures absentes et les changements ou absences de version de profil/formule interrompent les courbes ; les tableaux donnent les valeurs exactes. Le
                portefeuille permet la recherche sur tout l’historique conservé.
              </InfoHint>
            </h2>
          </div>

          {(() => {
            const history = [...selectedProjectAnalyses].sort((a, b) => a.created_at.localeCompare(b.created_at));
            return history.length === 0 ? (
              <p className="empty-state">No analyses available for this branch.</p>
            ) : (
              <>
                <div className="charts-grid">
                  {METRIC_FIELDS.map(([key, label, unit]) => {
                    const values = history.map((a) => a.metrics[key]);
                    const maximum = unit ? 100 : Math.max(1, ...values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)));
                    const points = values.map((value, index) => metricPoint(value, index, values.length, maximum));
                    return (
                      <article className="chart-card" key={key}>
                        <h3>{label} trend</h3>
                        <p className="hint">
                          Scale: 0–{maximum}
                          {unit === '%' ? '%' : ''}
                        </p>
                        {points.some(Boolean) ? (
                          <svg viewBox="0 0 360 150" className="trend-chart" role="img" aria-label={label + ' trend. Exact values in the table below.'}>
                            {points.map(
                              (point, index) =>
                                point && (
                                  <g key={index}>
                                    {index > 0 && points[index - 1] && comparableVersions(history[index - 1], history[index]) && (
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
                <div className="table-wrap" tabIndex={0} role="region" aria-label="Evolution values">
                  <table>
                    <caption>
                      Metrics by analysis — {selectedProject} · {selectedBranch}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Commit</th>
                        <th scope="col">Analysis</th>
                        <th scope="col">Quality Gate</th>
                        <th scope="col">Profil / version / formule</th>
                        {METRIC_FIELDS.map(([key, label]) => (
                          <th scope="col" key={key}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((analysis) => (
                        <tr key={analysis.analysis_id}>
                          <th scope="row">{new Date(analysis.created_at).toLocaleString()}</th>
                          <td>
                            <code>{analysis.commit_sha || 'Non disponible'}</code>
                          </td>
                          <td>{analysis.status}</td>
                          <td>{analysisGateLabel(analysis.quality_gate, analysis.completeness)}</td>
                          <td>
                            {analysis.profile_id || 'Non disponible'} / {analysis.profile_version || 'Non disponible'} / {analysis.formula_version || 'Non disponible'}
                          </td>
                          {METRIC_FIELDS.map(([key, , unit]) => (
                            <td key={key}>{formatMetric(analysis.metrics[key], unit)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </>
      ) : (
        <p>No project selected.</p>
      )}
    </section>
  );
}
