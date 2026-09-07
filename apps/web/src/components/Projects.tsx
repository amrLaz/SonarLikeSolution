import InfoHint from './InfoHint';
import type { AnalysisRecord, IssueSeverityFilter, IssueTypeFilter, ProjectMeta, ProjectSummary } from '../types';
import { analysisGateClass, analysisGateLabel } from '../metric-display';
import { repositoryBranchLink, repositoryCommitLink, repositoryPullRequestLink } from '../evidence-links';
import { MetricGrid, type MetricKey } from './AnalysisEvidence';
import MetricsHistory from './MetricsHistory';

type ProjectsProps = {
  summaries: ProjectSummary[];
  filteredSummaries: ProjectSummary[];
  selectedSummary: ProjectSummary | null;
  selectedProject: string;
  selectedBranch: string;
  projectSearch: string;
  favoritesOnly: boolean;
  favoritePending: boolean;
  favoriteError?: string | null;
  setSelectedProject: (project: string) => void;
  setSelectedBranch: (branch: string) => void;
  setProjectSearch: (search: string) => void;
  setFavoritesOnly: (favoriteOnly: boolean) => void;
  onToggleFavorite: (summary: ProjectSummary) => void;
  loading: boolean;
  error?: string | null;
  projectMeta: Record<string, ProjectMeta>;
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
  favoritesOnly,
  favoritePending,
  favoriteError,
  setSelectedProject,
  setSelectedBranch,
  setProjectSearch,
  setFavoritesOnly,
  onToggleFavorite,
  loading,
  error,
  projectMeta,
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
        <label className="favorite-projects-filter">
          <input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} />
          Favorite projects only
        </label>
        <div className="action-row">
          <button
            type="button"
            onClick={() => {
              setProjectSearch('');
              setFavoritesOnly(false);
              setSelectedProject('');
              setSelectedBranch('');
            }}
          >
            All projects
          </button>
        </div>
      </aside>
      <div className="project-list">
        {favoriteError && (
          <p className="feedback error" role="alert">
            Favorite could not be updated: {favoriteError}
          </p>
        )}
        {/* Always visible dropdowns */}
        <div className="project-context-selectors">
          <div style={{ flex: 1 }}>
            <label htmlFor="dashboard-project">PROJECT</label>
            <div className="project-favorite-select">
              <select
                id="dashboard-project"
                aria-label="Project"
                value={selectedProject}
                onChange={(e) => {
                  setSelectedProject(e.target.value);
                  setSelectedBranch('');
                }}
              >
                <option value="">-- Select a project --</option>
                {filteredSummaries.map((summary) => (
                  <option key={summary.projectKey} value={summary.projectKey}>
                    {summary.projectKey}
                  </option>
                ))}
              </select>
              {selectedSummary && <FavoriteButton summary={selectedSummary} pending={favoritePending} onToggle={onToggleFavorite} />}
            </div>
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
                const repository = projectMeta[selectedSummary.projectKey];
                const branchUrl = repositoryBranchLink(repository?.repoProvider ?? 'other', repository?.repoUrl, activeBranch);

                return (
                  <div className="reference-select">
                    <select id="dashboard-branch" value={activeBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
                      {branches.map((branch) => (
                        <option key={branch} value={branch}>
                          {branch}
                        </option>
                      ))}
                    </select>
                    {branchUrl && (
                      <a href={branchUrl} target="_blank" rel="noreferrer" aria-label={`Ouvrir la branche ${activeBranch} dans le dépôt`} title="Ouvrir la branche dans le dépôt">
                        ↗
                      </a>
                    )}
                  </div>
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
              const repository = projectMeta[selectedSummary.projectKey];
              const commitUrl = repositoryCommitLink(repository?.repoProvider ?? 'other', repository?.repoUrl, detailedBranch?.latest.commit_sha);
              const pullRequestUrl = repositoryPullRequestLink(repository?.repoProvider ?? 'other', repository?.repoUrl, detailedBranch?.latest.pr_id);

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
                          <strong>Commit:</strong>{' '}
                          {commitUrl ? (
                            <a className="repository-reference" href={commitUrl} target="_blank" rel="noreferrer">
                              <code>{detailedBranch.latest.commit_sha}</code> ↗
                            </a>
                          ) : (
                            <code>{detailedBranch.latest.commit_sha || 'Non disponible'}</code>
                          )}
                        </p>
                        {pullRequestUrl && (
                          <p>
                            <strong>PR:</strong>{' '}
                            <a className="repository-reference" href={pullRequestUrl} target="_blank" rel="noreferrer">
                              #{detailedBranch.latest.pr_id} ↗
                            </a>
                          </p>
                        )}
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
                {error
                  ? 'Analysis data could not be loaded. Use Refresh to retry.'
                  : favoritesOnly
                    ? summaries.some((summary) => summary.isFavorite)
                      ? 'No favorite projects match the current search.'
                      : 'No favorite projects yet.'
                    : summaries.length
                      ? 'No projects match the current filters.'
                      : 'No analyses available yet.'}
              </p>
            )}
            <div className="project-overview-grid">
              {filteredSummaries.map((summary) => (
                <article key={summary.projectKey} className="project-overview-card">
                  <div className="project-card-header">
                    <button type="button" className="project-open-issues" onClick={() => setSelectedProject(summary.projectKey)}>
                      <strong>{summary.projectKey}</strong>
                      <span>Open metrics →</span>
                    </button>
                    <FavoriteButton summary={summary} pending={favoritePending} onToggle={onToggleFavorite} />
                  </div>
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

function FavoriteButton({ summary, pending, onToggle }: { summary: ProjectSummary; pending: boolean; onToggle: (summary: ProjectSummary) => void }) {
  const action = summary.isFavorite ? 'Remove from favorites' : 'Add to favorites';
  return (
    <button
      type="button"
      className={`project-favorite${summary.isFavorite ? ' active' : ''}`}
      aria-label={`${action}: ${summary.projectKey}`}
      aria-pressed={summary.isFavorite}
      title={action}
      disabled={pending}
      onClick={() => onToggle(summary)}
    >
      <span aria-hidden="true">{summary.isFavorite ? '★' : '☆'}</span>
    </button>
  );
}

function selectedProjectAnalyses(history: AnalysisRecord[], branch: string | null) {
  return history.filter((analysis) => !branch || analysis.branch === branch);
}
