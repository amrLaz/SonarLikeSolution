import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiPage } from '../api';
import { findingCategory, findingCategoryLabel } from '../metric-display';
import type { IssueSeverityFilter, IssueTypeFilter, ProjectMeta, ProjectSummary } from '../types';
import ProjectHeader from './ProjectHeader';
import { FindingReview, FINDING_STATES, type Team } from './Collaboration';
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api');
type Props = {
  authToken?: string; isAdmin: boolean; selectedProject: string; selectedBranch: string; selectedAnalysisId: string;
  selectedSummary: ProjectSummary | null; summaries: ProjectSummary[]; projectMeta: Record<string, ProjectMeta>;
  setSelectedProject: (value: string) => void; setSelectedBranch: (value: string) => void; setSelectedAnalysisId: (value: string) => void;
};
const buildFileUrl = (
  repoUrl: string,
  provider: string,
  commitSha: string,
  filePath: string
): string => {
  if (!repoUrl) return "#";
  const base = repoUrl.replace(/\/$/, "");
  if (provider === "github") {
    return `${base}/blob/${commitSha || "HEAD"}/${filePath}`;
  }
  if (provider === "azure-devops") {
    return `${base}?path=/${filePath}&version=GC${commitSha || "main"}`;
  }
  return base;
};

export default function Issues({ authToken, isAdmin, selectedProject, selectedBranch, selectedAnalysisId, selectedSummary, summaries, projectMeta, setSelectedProject, setSelectedBranch, setSelectedAnalysisId }: Props) {
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [issueSeverityFilter, setIssueSeverityFilter] = useState<IssueSeverityFilter>("all");
  const [issueTypeFilter, setIssueTypeFilter] = useState<IssueTypeFilter>("all");
  const [issueRuleFilter, setIssueRuleFilter] = useState("");
  const [issueFileFilter, setIssueFileFilter] = useState("");
  const [mine, setMine] = useState(false);
  const [state, setState] = useState('');
  const [team, setTeam] = useState({ project: '', id: '', cursor: '' });
  const teamId = team.project === selectedProject ? team.id : '';
  const teamCursor = team.project === selectedProject ? team.cursor : '';
  const teams = useQuery({ queryKey: ['collaboration', 'teams', selectedProject, teamCursor], enabled: !!selectedProject,
    queryFn: ({ signal }) => apiPage<Team>(`${API_BASE}/v1/collaboration/teams?${new URLSearchParams({ project_key: selectedProject, cursor: teamCursor })}`, authToken, { signal }) });
  const filterKey = [selectedAnalysisId, issueSeverityFilter, issueTypeFilter, issueRuleFilter, issueFileFilter, mine, state, teamId].join('|');
  const [page, setPage] = useState({ key: '', cursor: '' });
  const cursor = page.key === filterKey ? page.cursor : '';
  const issuesQuery = useQuery({
    queryKey: ['findings', filterKey, cursor], enabled: !!selectedAnalysisId,
    queryFn: ({ signal }) => apiPage<{ id: number; finding_id: string | null; tool: string; rule_id: string; severity: string; category: string; message: string; path: string | null; line: number | null }>(
      `${API_BASE}/v1/insights/analyses/${encodeURIComponent(selectedAnalysisId)}/findings?${new URLSearchParams({ severity: issueSeverityFilter, category: issueTypeFilter, rule: issueRuleFilter, path: issueFileFilter, mine: mine ? 'true' : '', state, team_id: teamId, cursor })}`, authToken, { signal }),
  });
  const issuesLoading = issuesQuery.isLoading;
  const issuesError = issuesQuery.error?.message ?? null;
  const selectedAnalysis = selectedSummary?.history.find(item => item.analysis_id === selectedAnalysisId);
  const filteredIssueDetails = useMemo(() => (issuesQuery.data?.items ?? []).map(issue => ({
    id: String(issue.id), finding_id: issue.finding_id, file_path: issue.path ?? '', line: issue.line, end_line: undefined as number | undefined,
    rule: issue.rule_id, message: issue.message, severity: issue.severity.toUpperCase(), category: findingCategory(issue.category),
    tool: issue.tool, commit_sha: selectedAnalysis?.commit_sha ?? '', branch: selectedAnalysis?.branch ?? '',
    repo_url: projectMeta[selectedProject]?.repoUrl ?? '', repo_provider: projectMeta[selectedProject]?.repoProvider ?? 'other',
  })), [issuesQuery.data, selectedAnalysis, projectMeta, selectedProject]);
  const allIssueDetails = filteredIssueDetails;

  return (
        <section className="two-pane-screen issues-screen">
          <p className="hint" style={{ gridColumn: "1 / -1" }}>Issues et Vulnerabilities &amp; IOCs utilisent la même analyse sélectionnée. Les compteurs et la liste ci-dessous portent uniquement sur ses findings détaillés ; un ancien résumé par fichier ne crée aucune issue artificielle.</p>
          {/* ── Project Header ──────────────────────────────── */}
          <div style={{ gridColumn: "1 / -1" }}>
            <ProjectHeader
              selectedSummary={selectedSummary}
              allSummaries={summaries}
              onProjectChange={(projectKey) => {
                setSelectedProject(projectKey);
                setSelectedBranch("");
              }}
              onBranchChange={setSelectedBranch}
              selectedBranch={selectedBranch}
              selectedAnalysisId={selectedAnalysisId}
              onAnalysisChange={setSelectedAnalysisId}
            />
          </div>

          {/* ── Left sidebar filters ──────────────────────────────── */}
          <aside className="issues-sidebar">
            <h3>Filters</h3>
            <div className="issue-filter-group">
              <label className="collaboration-checkbox"><input type="checkbox" checked={mine} onChange={event => setMine(event.target.checked)} /> Mes problèmes</label>
              <label>État collaboratif<select value={state} onChange={event => setState(event.target.value)}><option value="">Tous les états</option>{Object.entries(FINDING_STATES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Équipe<select value={teamId} disabled={!teams.isSuccess} onChange={event => setTeam({ project: selectedProject, id: event.target.value, cursor: teamCursor })}><option value="">Toutes les équipes</option>{teamId && !teams.data?.items.some(item => item.id === teamId) && <option value={teamId}>Équipe sélectionnée hors page</option>}{teams.data?.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              {teams.error && <p role="alert">{teams.error.message}</p>}
              {teamCursor && <button type="button" onClick={() => setTeam({ project: selectedProject, id: teamId, cursor: '' })}>Premières équipes</button>}
              {teams.data?.next && <button type="button" onClick={() => setTeam({ project: selectedProject, id: teamId, cursor: teams.data!.next! })}>Équipes suivantes</button>}
            </div>

            <div className="issue-filter-group">
              <p className="issue-filter-label">Catégorie</p>
              {(["all", "bug", "code_smell", "vulnerability", "security_hotspot", "secret", "dependency", "code", "ioc", "unknown"] as IssueTypeFilter[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={issueTypeFilter === t}
                  className={`issue-filter-btn${issueTypeFilter === t ? " active" : ""}`}
                  onClick={() => setIssueTypeFilter(t)}
                >
                  {t === "all" ? "Toutes" : findingCategoryLabel(t)}
                </button>
              ))}
            </div>

            <div className="issue-filter-group">
              <p className="issue-filter-label">Severity</p>
              {(["all", "blocker", "high", "medium", "low", "info"] as IssueSeverityFilter[]).map((sev) => (
                <button
                  key={sev}
                  type="button"
                  aria-pressed={issueSeverityFilter === sev}
                  className={`issue-filter-btn${issueSeverityFilter === sev ? " active" : ""}`}
                  onClick={() => setIssueSeverityFilter(sev)}
                >
                  {sev === "all" ? "All severities" : sev.charAt(0).toUpperCase() + sev.slice(1)}
                </button>
              ))}
            </div>

            <div className="issue-filter-group">
              <p className="issue-filter-label">Rule</p>
              <input
                aria-label="Filter by rule"
                placeholder="Filter by rule…"
                value={issueRuleFilter}
                onChange={(e) => setIssueRuleFilter(e.target.value)}
              />
            </div>

            <div className="issue-filter-group">
              <p className="issue-filter-label">File</p>
              <input
                aria-label="Filter by file path"
                placeholder="Filter by file path…"
                value={issueFileFilter}
                onChange={(e) => setIssueFileFilter(e.target.value)}
              />
            </div>

            <button
              type="button"
              style={{ marginTop: "0.75rem", width: "100%" }}
              onClick={() => {
                setIssueSeverityFilter("all");
                setIssueTypeFilter("all");
                setIssueRuleFilter("");
                setIssueFileFilter("");
                setMine(false); setState(''); setTeam({ project: selectedProject, id: '', cursor: '' });
              }}
            >
              Reset filters
            </button>
          </aside>

          {/* ── Right issues list ─────────────────────────────────── */}
          <div className="issues-main">
            <div className="action-row">
              {cursor && <button type="button" onClick={() => setPage({ key: filterKey, cursor: '' })}>Première page</button>}
              {issuesQuery.data?.next && <button type="button" onClick={() => setPage({ key: filterKey, cursor: issuesQuery.data!.next! })}>Page suivante</button>}
            </div>
            <header className="issues-toolbar">
              <h2 style={{ margin: 0 }}>Issues</h2>
              <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                {filteredIssueDetails.length} sur cette page · issue{filteredIssueDetails.length !== 1 ? "s" : ""}
                {allIssueDetails.length > 0 && filteredIssueDetails.length < allIssueDetails.length
                  ? ` (filtered from ${allIssueDetails.length})`
                  : ""}
              </p>
            </header>

            {issuesLoading ? <p className="feedback" role="status">Loading file findings…</p> : issuesError ? <p className="feedback error" role="alert">{issuesError}. <button type="button" onClick={() => void issuesQuery.refetch()}>Retry</button></p> : filteredIssueDetails.length === 0 ? (
              <div className="issues-empty">
                {allIssueDetails.length === 0
                  ? "No file findings available in the loaded analyses for this scope."
                  : "No issues match the current filters."}
              </div>
            ) : (
              <div className="issues-list">
                {filteredIssueDetails.map((issue) => {
                  const severityLower = issue.severity.toLowerCase();
                  const sevClass =
                    severityLower === "critical" || severityLower === "error" || severityLower === "blocker"
                      ? "sev-blocker"
                      : severityLower === "high"
                      ? "sev-high"
                      : severityLower === "warning" || severityLower === "medium"
                      ? "sev-medium"
                      : severityLower === "info" || severityLower === "convention"
                      ? "sev-info"
                      : "sev-low";
                  const shortFile = issue.file_path.split("/").slice(-2).join("/");
                  const lineLabel =
                    issue.end_line && issue.end_line !== issue.line
                      ? `L${issue.line}–${issue.end_line}`
                      : `L${issue.line}`;
                  const isExpanded = expandedIssueId === issue.id;

                  return (
                    <article key={issue.id} className={`issue-card ${isExpanded ? "expanded" : ""}`}>
                      <div className="issue-card-header">
                        <div className="issue-card-left">
                          <span className={`sev-badge ${sevClass}`}>{issue.severity}</span>
                        </div>
                        <div className="issue-card-body">
                          <p className="issue-message">{issue.message}</p>
                          <p className="issue-meta">
                            <span className="issue-rule">{findingCategoryLabel(issue.category)} · {issue.tool} · {issue.rule}</span>
                            <span className="issue-sep">·</span>
                            <code>{issue.branch} @ {issue.commit_sha.slice(0, 7) || "Non disponible"}</code>
                            <span className="issue-sep">·</span>
                            {issue.repo_url ? (
                              <a
                                href={buildFileUrl(issue.repo_url, issue.repo_provider, issue.commit_sha, issue.file_path)}
                                target="_blank"
                                rel="noreferrer"
                                className="issue-file-link"
                                title={issue.file_path}
                              >
                                <span className="issue-file">{shortFile}</span>
                                <span className="issue-file-colon">:</span>
                                <span className="issue-line">{lineLabel}</span>
                                <span className="issue-ext-icon">↗</span>
                              </a>
                            ) : (
                              <>
                                <span className="issue-file" title={issue.file_path}>{shortFile}</span>
                                <span className="issue-sep">·</span>
                                <span className="issue-line">{lineLabel}</span>
                              </>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="issue-expand-btn"
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? "Collapse file details" : "Expand file details"}
                          onClick={() => setExpandedIssueId(isExpanded ? null : issue.id)}
                          title={isExpanded ? "Collapse file details" : "Expand file details"}
                        >
                          {isExpanded ? "▾" : "▸"}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="issue-details">
                          <div className="issue-file-header">
                            <strong>File Details:</strong>
                            <code className="file-path">{issue.file_path}</code>
                            <span className="line-info">Lines {issue.line}{issue.end_line ? `-${issue.end_line}` : ""}</span>
                          </div>
                          <div className="issue-code-preview">
                            <pre>
                              <code>
                                {`// File: ${issue.file_path}
// Issue at line ${issue.line}${issue.end_line ? `-${issue.end_line}` : ""}
//
// ${issue.rule}: ${issue.message}
//
// This issue suggests:
${issue.message.split(".").map((s) => `// - ${s.trim()}`).join("\n")}
`}
                              </code>
                            </pre>
                          </div>
                          {issue.repo_url && (
                            <div className="issue-actions">
                              <a
                                href={buildFileUrl(issue.repo_url, issue.repo_provider, issue.commit_sha, issue.file_path)}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-open-repo"
                              >
                                🔗 View in Repository
                              </a>
                            </div>
                          )}
                          <FindingReview key={`${selectedAnalysisId}:${issue.id}`} findingId={issue.finding_id} occurrenceId={Number(issue.id)} projectKey={selectedProject} authToken={authToken} isAdmin={isAdmin} />
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      );
}
