import type { AnalysisRecord, ProjectSummary } from '../types';
import { analysisGateClass, analysisGateLabel } from '../metric-display';
import AnalysisEvidence, { MetricGrid } from './AnalysisEvidence';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api');

type ProjectsProps = {
  summaries: ProjectSummary[];
  filteredSummaries: ProjectSummary[];
  selectedSummary: ProjectSummary | null;
  selectedProject: string;
  selectedBranch: string;
  setSelectedProject: (project: string) => void;
  setSelectedBranch: (branch: string) => void;
  setProjectSearch: (search: string) => void;
  loading: boolean;
  error?: string | null;
  downloadExport: (url: string, filename: string) => Promise<void>;
};

export default function Projects({ summaries, filteredSummaries, selectedSummary, selectedProject, selectedBranch, setSelectedProject, setSelectedBranch, setProjectSearch, loading, error, downloadExport }: ProjectsProps) {
  return (<section className="content-grid">
    <aside className="left-filters">
      <h3>Filters</h3>
      <p className="project-count-scope">Dernière analyse par projet de cette page et projet sélectionné, toutes branches.</p>
      <p>Projects: {filteredSummaries.length}</p>
      <p>Passed: {filteredSummaries.filter((item) => item.latest.completeness != null && item.latest.quality_gate === "pass").length}</p>
      <p>Failed: {filteredSummaries.filter((item) => item.latest.completeness != null && item.latest.quality_gate === "fail").length}</p>
      <p>Unknown: {filteredSummaries.filter((item) => item.latest.completeness == null || item.latest.quality_gate === "unknown").length}</p>
      <div className="action-row">
        <button type="button" onClick={() => { setProjectSearch(""); setSelectedProject(""); setSelectedBranch(""); }}>All projects</button>
        <button type="button" onClick={() => setProjectSearch("api")}>Focus API</button>
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
              setSelectedBranch("");
            }}
            style={{
              padding: "10px 12px",
              borderRadius: "4px",
              border: "1px solid var(--border)",
              fontSize: "14px",
              width: "100%",
              backgroundColor: "var(--bg-lighter)"
            }}
          >
            <option value="">-- Select a project --</option>
            {filteredSummaries.map((summary) => (
              <option key={summary.projectKey} value={summary.projectKey}>{summary.projectKey}</option>
            ))}
          </select>
        </div>

        <div style={{ flex: 1 }}>
          <label htmlFor="dashboard-branch">BRANCH</label>
          {selectedProject && selectedSummary ? (() => {
            const branchMap = new Map<string, AnalysisRecord[]>();
            for (const analysis of selectedSummary.history) {
              const branch = analysis.branch || "master";
              const existing = branchMap.get(branch) ?? [];
              existing.push(analysis);
              branchMap.set(branch, existing);
            }
            const branches = selectedSummary.branches?.map(branch => branch.name).sort() ?? Array.from(branchMap.keys()).sort();
            const activeBranch = selectedBranch || (branches.length > 0 ? branches[0] : "");

            return (
              <select
                id="dashboard-branch"
                value={activeBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                style={{
                  padding: "10px 12px",
                  borderRadius: "4px",
                  border: "1px solid var(--border)",
                  fontSize: "14px",
                  width: "100%",
                  backgroundColor: "var(--bg-lighter)"
                }}
              >
                {branches.map((branch) => (
                  <option key={branch} value={branch}>{branch}</option>
                ))}
              </select>
            );
          })() : (
            <select
              id="dashboard-branch"
              disabled
              style={{
                padding: "10px 12px",
                borderRadius: "4px",
                border: "1px solid var(--border)",
                fontSize: "14px",
                width: "100%",
                backgroundColor: "var(--bg-light)"
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
              const branch = analysis.branch || "master";
              const existing = branchMap.get(branch) ?? [];
              existing.push(analysis);
              branchMap.set(branch, existing);
            }
            const branches = selectedSummary.branches ?? Array.from(branchMap.entries())
              .map(([branchName, analyses]) => {
                const sorted = [...analyses].sort((a, b) =>
                  b.created_at.localeCompare(a.created_at)
                );
                return {
                  name: branchName,
                  latest: sorted[0],
                  count: analyses.length
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
                    <h3 style={{ margin: "0 0 16px 0" }}>Metrics for {activeBranch}</h3>
                    <div className="analysis-context">
                      <p><strong>Quality Gate:</strong> <span className={`status-pill ${analysisGateClass(detailedBranch.latest.quality_gate, detailedBranch.latest.completeness)}`}>{analysisGateLabel(detailedBranch.latest.quality_gate, detailedBranch.latest.completeness)}</span></p>
                      <p><strong>Analysis:</strong> {detailedBranch.latest.status}</p>
                      <p><strong>Commit:</strong> <code>{detailedBranch.latest.commit_sha || "Non disponible"}</code></p>
                      <p><strong>Last:</strong> {new Date(detailedBranch.latest.created_at).toLocaleString()}</p>
                    </div>
                    {!!detailedBranch.latest.gate_failures?.length && <div className="feedback error"><strong>Gate failures</strong><ul>{detailedBranch.latest.gate_failures.map((failure, index) => <li key={index}>{failure}</li>)}</ul></div>}
                    <MetricGrid metrics={detailedBranch.latest.metrics} />
                    <AnalysisEvidence analysis={detailedBranch.latest} />
                    <div style={{ marginTop: "16px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => void downloadExport(
                          `${API_BASE}/v1/analyses/${detailedBranch.latest.analysis_id}/export/pdf`,
                          `${detailedBranch.latest.project_key}-${detailedBranch.latest.analysis_id}.pdf`
                        )}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: "6px",
                          padding: "8px 16px", backgroundColor: "var(--primary)", color: "var(--bg-lighter)",
                          borderRadius: "6px", fontSize: "13px", fontWeight: "600"
                        }}
                      >
                        ↓ Export PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => void downloadExport(
                          `${API_BASE}/v1/analyses/${detailedBranch.latest.analysis_id}/export/csv`,
                          `${detailedBranch.latest.project_key}-${detailedBranch.latest.analysis_id}.csv`
                        )}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: "6px",
                          padding: "8px 16px", backgroundColor: "var(--bg-lighter)", color: "var(--primary)",
                          border: "1.5px solid var(--primary)", borderRadius: "6px",
                          fontSize: "13px", fontWeight: "600"
                        }}
                      >
                        ↓ Export CSV (latest)
                      </button>
                      <button
                        type="button"
                        onClick={() => void downloadExport(
                          `${API_BASE}/v1/analyses/export/csv?project_key=${encodeURIComponent(selectedProject)}`,
                          `${selectedProject}-history.csv`
                        )}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: "6px",
                          padding: "8px 16px", backgroundColor: "var(--bg-lighter)", color: "var(--text-secondary)",
                          border: "1.5px solid var(--border)", borderRadius: "6px",
                          fontSize: "13px", fontWeight: "600"
                        }}
                      >
                        ↓ Export all history (CSV)
                      </button>
                    </div>
                  </div>
                )}

                <h4 style={{ marginTop: "24px", marginBottom: "12px" }}>All branches</h4>
                {branches.map((branch) => (
                  <article className={`branch-card ${selectedBranch === branch.name ? "selected" : ""}`} key={branch.name}>
                    <div className="analysis-context">
                      <button type="button" aria-pressed={selectedBranch === branch.name} onClick={() => setSelectedBranch(branch.name)}>{branch.name}</button>
                      <span className={`status-pill ${analysisGateClass(branch.latest.quality_gate, branch.latest.completeness)}`}>{analysisGateLabel(branch.latest.quality_gate, branch.latest.completeness)}</span>
                      <span>Analysis: {branch.latest.status}</span>
                      <span>{branch.count} analyses · {new Date(branch.latest.created_at).toLocaleString()}</span>
                      <code>{branch.latest.commit_sha || "Non disponible"}</code>
                    </div>
                    <MetricGrid metrics={branch.latest.metrics} />
                  </article>
                ))}
              </>
            );
          })()}
        </>
      ) : (
        <section className="project-overview">
          <h2>All Projects</h2>
          {!loading && !filteredSummaries.length && <p className="empty-state" role="status">{error ? "Analysis data could not be loaded. Use Refresh to retry." : summaries.length ? "No projects match the current filters." : "No analyses available yet."}</p>}
          <div className="project-overview-grid">
            {filteredSummaries.map((summary) => (
              <button key={summary.projectKey} type="button" className="project-overview-card" onClick={() => { setSelectedProject(summary.projectKey); setSelectedBranch(""); }}>
                <strong>{summary.projectKey}</strong>
                <span>Analysis history</span>
                <span className="project-overview-counts"><span>Passed: {summary.passCount}</span><span>Failed: {summary.failCount}</span><span>Unknown: {summary.unknownCount}</span><span>Historique: {summary.legacyCount ?? 0}</span></span>
                <span>Last: {new Date(summary.latest.created_at).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  </section>);
}


