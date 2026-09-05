import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../api';
import { findingCategory, findingCategoryLabel } from '../metric-display';
import type { AnalysisRecord, IssueSeverityFilter, IssueTypeFilter, ProjectMeta, ProjectSummary } from '../types';
import ProjectHeader from './ProjectHeader';
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api');
type Props = {
  authToken?: string; selectedProject: string; selectedBranch: string; selectedAnalysisId: string;
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

export default function Issues({ authToken, selectedProject, selectedBranch, selectedAnalysisId, selectedSummary, summaries, projectMeta, setSelectedProject, setSelectedBranch, setSelectedAnalysisId }: Props) {
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [issueSeverityFilter, setIssueSeverityFilter] = useState<IssueSeverityFilter>("all");
  const [issueTypeFilter, setIssueTypeFilter] = useState<IssueTypeFilter>("all");
  const [issueRuleFilter, setIssueRuleFilter] = useState("");
  const [issueFileFilter, setIssueFileFilter] = useState("");
  const issuesQuery = useQuery({
    queryKey: ['analyses', selectedProject], enabled: !!selectedProject,
    queryFn: ({ signal }) => apiJson<AnalysisRecord[]>(`${API_BASE}/v1/analyses?project_key=${encodeURIComponent(selectedProject)}`, authToken, { signal }),
  });
  const detailAnalyses = issuesQuery.data ?? [];
  const issuesLoading = issuesQuery.isLoading;
  const issuesError = issuesQuery.error?.message ?? null;
  const selectedAnalysis = detailAnalyses.find(analysis => analysis.analysis_id === selectedAnalysisId) ?? null;
  const allIssueDetails = useMemo(() => {
    if (!selectedAnalysis) return [];
    const affectedFiles = selectedAnalysis.metrics.affected_files ?? {};
    const meta = projectMeta[selectedAnalysis.project_key];

    return Object.entries(affectedFiles).flatMap(([filePath, fileData]) => {
      // Counts alone do not identify individual findings.
      if (!Array.isArray(fileData)) return [];
      return fileData.map((issue, index) => {
        const rule = issue.rule_id ?? issue.rule ?? "Non disponible";
        return {
          id: `${selectedAnalysis.analysis_id}:${filePath}:${issue.line}:${rule}:${index}`,
          project_key: selectedAnalysis.project_key,
          file_path: filePath,
          line: issue.line,
          end_line: issue.end_line,
          rule,
          message: issue.message,
          severity: String(issue.severity).toUpperCase(),
          category: findingCategory(issue.category),
          tool: issue.tool?.trim() || "Non disponible",
          commit_sha: selectedAnalysis.commit_sha ?? "",
          branch: selectedAnalysis.branch,
          repo_url: meta?.repoUrl ?? "",
          repo_provider: meta?.repoProvider ?? "other"
        };
      });
    });
  }, [selectedAnalysis, projectMeta]);

  const filteredIssueDetails = useMemo(() => {
    const severityMap: Record<string, IssueSeverityFilter> = {
      CRITICAL: "blocker",
      ERROR: "blocker",
      BLOCKER: "blocker",
      HIGH: "high",
      WARNING: "medium",
      MEDIUM: "medium",
      LOW: "low",
      INFO: "info",
      CONVENTION: "low"
    };
    return allIssueDetails.filter((issue) => {
      if (issueSeverityFilter !== "all") {
        const mapped = severityMap[issue.severity] ?? "low";
        if (mapped !== issueSeverityFilter) return false;
      }
      if (issueTypeFilter !== "all" && issue.category !== issueTypeFilter) return false;
      if (issueRuleFilter.trim()) {
        if (!issue.rule.toLowerCase().includes(issueRuleFilter.trim().toLowerCase())) return false;
      }
      if (issueFileFilter.trim()) {
        if (!issue.file_path.toLowerCase().includes(issueFileFilter.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [allIssueDetails, issueSeverityFilter, issueTypeFilter, issueRuleFilter, issueFileFilter]);

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
              <p className="issue-filter-label">Catégorie</p>
              {(["all", "secret", "dependency", "code", "ioc", "unknown"] as IssueTypeFilter[]).map((t) => (
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
              }}
            >
              Reset filters
            </button>
          </aside>

          {/* ── Right issues list ─────────────────────────────────── */}
          <div className="issues-main">
            <header className="issues-toolbar">
              <h2 style={{ margin: 0 }}>Issues</h2>
              <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                {filteredIssueDetails.length} issue{filteredIssueDetails.length !== 1 ? "s" : ""}
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
