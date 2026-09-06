import InfoHint from './InfoHint';
import type { AnalysisRecord, IssueSeverityFilter, IssueTypeFilter, ProjectSummary } from '../types';
import { analysisGateClass, analysisGateLabel } from '../metric-display';
import { MetricGrid, type MetricKey } from './AnalysisEvidence';
import MetricsHistory from './MetricsHistory';

type ProjectsProps = {
  summaries: ProjectSummary[];
  filteredSummaries: ProjectSummary[];
  selectedSummary: ProjectSummary | null;
  selectedProject: string;
  selectedBranch: string;
  projectSearch: string;
  setSelectedProject: (project: string) => void;
  setSelectedBranch: (branch: string) => void;
  setProjectSearch: (search: string) => void;
  loading: boolean;
  error?: string | null;
  onOpenIssues: (summary: ProjectSummary, severity?: IssueSeverityFilter, category?: IssueTypeFilter) => void;
};

const metricIssueCategory: Record<MetricKey, IssueTypeFilter> = {
  security_score: 'vulnerability',
  maintainability_score: 'code_smell',
  reliability_score: 'bug',
  coverage: 'code',
  duplication: 'code',
  vulnerabilities: 'vulnerability',
  security_hotspots: 'security_hotspot',
  code_smells: 'code_smell',
  bugs: 'bug',
  dependency_vulnerabilities: 'dependency',
};

export default function Projects({
  summaries,
  filteredSummaries,
  selectedSummary,
  selectedProject,
  selectedBranch,
  projectSearch,
  setSelectedProject,
  setSelectedBranch,
  setProjectSearch,
  loading,
  error,
  onOpenIssues,
}: ProjectsProps) {
  return (
    <section className="content-grid">
      <aside className="left-filters">
        <h3>
          Filters <InfoHint>Dernière analyse par projet de cette page et projet sélectionné, toutes branches.</InfoHint>
        </h3>
        <p>Projects: {filteredSummaries.length}</p>
        <p>Passed: {filteredSummaries.filter((item) => item.latest.completeness != null && item.latest.quality_gate === 'pass').length}</p>
        <p>Failed: {filteredSummaries.filter((item) => item.latest.completeness != null && item.latest.quality_gate === 'fail').length}</p>
        <p>Unknown: {filteredSummaries.filter((item) => item.latest.completeness == null || item.latest.quality_gate === 'unknown').length}</p>
        <label className="project-search-filter">
          Search projects
          <input type="search" value={projectSearch} placeholder="Project name" onChange={(event) => setProjectSearch(event.target.value)} />
        </label>
        <div className="action-row">
          <button
            type="button"
            onClick={() => {
              setProjectSearch('');
              setSelectedProject('');
              setSelectedBranch('');
            }}
          >
            All projects
          </button>
        </div>
      </aside>
      <div className="project-list">
        {/* Always visible dropdowns */}
        <div className="project-context-selectors">
          <div style={{ flex: 1 }}>
            <label htmlFor="dashboard-project">PROJECT</label>
            <select
              id="dashboard-project"
              aria-label="Project"
              value={selectedProject}
              onChange={(e) => {
                setSelectedProject(e.target.value);
                setSelectedBranch('');
              }}
              style={{
                padding: '10px 12px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                fontSize: '14px',
                width: '100%',
                backgroundColor: 'var(--bg-lighter)',
              }}
            >
              <option value="">-- Select a project --</option>
              {filteredSummaries.map((summary) => (
                <option key={summary.projectKey} value={summary.projectKey}>
                  {summary.projectKey}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1 }}>
            <label htmlFor="dashboard-branch">BRANCH</label>
            {selectedProject && selectedSummary ? (
              (() => {
                const branchMap = new Map<string, AnalysisRecord[]>();
                for (const analysis of selectedSummary.history) {
                  const branch = analysis.branch || 'master';
                  const existing = branchMap.get(branch) ?? [];
                  existing.push(analysis);
                  branchMap.set(branch, existing);
                }
                const branches = selectedSummary.branches?.map((branch) => branch.name).sort() ?? Array.from(branchMap.keys()).sort();
                const activeBranch = selectedBranch || (branches.length > 0 ? branches[0] : '');

                return (
                  <select
                    id="dashboard-branch"
                    value={activeBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '4px',
                      border: '1px solid var(--border)',
                      fontSize: '14px',
                      width: '100%',
                      backgroundColor: 'var(--bg-lighter)',
                    }}
                  >
                    {branches.map((branch) => (
                      <option key={branch} value={branch}>
                        {branch}
                      </option>
                    ))}
                  </select>
                );
              })()
            ) : (
              <select
                id="dashboard-branch"
                disabled
                style={{
                  padding: '10px 12px',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  fontSize: '14px',
                  width: '100%',
                  backgroundColor: 'var(--bg-light)',
                }}
              >
                <option>Select a project first</option>
              </select>
            )}
          </div>
        </div>

        {selectedProject && selectedSummary ? (
          <>
            {(() => {
              const branchMap = new Map<string, AnalysisRecord[]>();
              for (const analysis of selectedSummary.history) {
                const branch = analysis.branch || 'master';
                const existing = branchMap.get(branch) ?? [];
                existing.push(analysis);
                branchMap.set(branch, existing);
              }
              const branches =
                selectedSummary.branches ??
                Array.from(branchMap.entries())
                  .map(([branchName, analyses]) => {
                    const sorted = [...analyses].sort((a, b) => b.created_at.localeCompare(a.created_at));
                    return {
                      name: branchName,
                      latest: sorted[0],
                      count: analyses.length,
                    };
                  })
                  .sort((a, b) => b.latest.created_at.localeCompare(a.latest.created_at));

              const activeBranch = selectedBranch || (branches.length > 0 ? branches[0].name : null);
              const detailedBranch = branches.find((b) => b.name === activeBranch);

              return branches.length === 0 ? (
                <p style={{ opacity: 0.7 }}>No branches found for this project</p>
              ) : (
                <>
                  {detailedBranch && (
                    <div className="analysis-detail">
                      <h3 style={{ margin: '0 0 16px 0' }}>Metrics for {activeBranch}</h3>
                      <div className="analysis-context">
                        <p>
                          <strong>Quality Gate:</strong>{' '}
                          <span className={`status-pill ${analysisGateClass(detailedBranch.latest.quality_gate, detailedBranch.latest.completeness)}`}>
                            {analysisGateLabel(detailedBranch.latest.quality_gate, detailedBranch.latest.completeness)}
                          </span>
                        </p>
                        <p>
                          <strong>Analysis:</strong> {detailedBranch.latest.status}
                        </p>
                        <p>
                          <strong>Commit:</strong> <code>{detailedBranch.latest.commit_sha || 'Non disponible'}</code>
                        </p>
                        <p>
                          <strong>Last:</strong> {new Date(detailedBranch.latest.created_at).toLocaleString()}
                        </p>
                      </div>
                      {!!detailedBranch.latest.gate_failures?.length && (
                        <div className="feedback error">
                          <strong>Gate failures</strong>
                          <ul>
                            {detailedBranch.latest.gate_failures.map((failure, index) => (
                              <li key={index}>{failure}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <MetricGrid metrics={detailedBranch.latest.metrics} onMetricClick={(metric) => onOpenIssues(selectedSummary, 'all', metricIssueCategory[metric])} />
                      <MetricsHistory history={selectedProjectAnalyses(selectedSummary.history, activeBranch)} />
                    </div>
                  )}

                </>
              );
            })()}
          </>
        ) : (
          <section className="project-overview">
            <h2>All Projects</h2>
            {!loading && !filteredSummaries.length && (
              <p className="empty-state" role="status">
                {error ? 'Analysis data could not be loaded. Use Refresh to retry.' : summaries.length ? 'No projects match the current filters.' : 'No analyses available yet.'}
              </p>
            )}
            <div className="project-overview-grid">
              {filteredSummaries.map((summary) => (
                <article key={summary.projectKey} className="project-overview-card">
                  <button type="button" className="project-open-issues" onClick={() => setSelectedProject(summary.projectKey)}>
                    <strong>{summary.projectKey}</strong>
                    <span>Open metrics →</span>
                  </button>
                  <span>Analysis history</span>
                  <span className="project-overview-counts">
                    <span>Passed: {summary.passCount}</span>
                    <span>Failed: {summary.failCount}</span>
                    <span>Unknown: {summary.unknownCount}</span>
                  </span>
                  <MetricGrid metrics={summary.latest.metrics} onMetricClick={(metric) => onOpenIssues(summary, 'all', metricIssueCategory[metric])} />
                  <span>Last: {new Date(summary.latest.created_at).toLocaleDateString()}</span>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}

function selectedProjectAnalyses(history: AnalysisRecord[], branch: string | null) {
  return history.filter((analysis) => !branch || analysis.branch === branch);
}
