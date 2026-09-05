import { useMemo } from "react";
import type { AnalysisRecord, ProjectSummary } from "../types";
import { analysisGateClass, analysisGateLabel } from "../metric-display";
import "./ProjectHeader.css";

interface ProjectHeaderProps {
  selectedSummary: ProjectSummary | null;
  allSummaries: ProjectSummary[];
  onProjectChange: (projectKey: string) => void;
  onBranchChange: (branch: string) => void;
  selectedBranch: string;
  selectedAnalysisId?: string;
  onAnalysisChange?: (analysisId: string) => void;
  hideProjectSelector?: boolean;
  scopeUnavailable?: boolean;
}

export default function ProjectHeader({
  selectedSummary,
  allSummaries,
  onProjectChange,
  onBranchChange,
  selectedBranch,
  selectedAnalysisId,
  onAnalysisChange,
  hideProjectSelector = false,
  scopeUnavailable = false
}: ProjectHeaderProps) {

  // Extract unique branches from project history
  const availableBranches = useMemo(() => {
    if (!selectedSummary) return [];
    
    const branches = new Map<string, AnalysisRecord>();
    for (const analysis of selectedSummary.history) {
      if (!branches.has(analysis.branch)) {
        branches.set(analysis.branch, analysis);
      }
    }
    
    return Array.from(branches.entries())
      .sort((a, b) => {
        // Sort master/main first, then by branch name
        const aName = a[0].toLowerCase();
        const bName = b[0].toLowerCase();
        const isMaster = (name: string) => name === "master" || name === "main";
        
        if (isMaster(aName) && !isMaster(bName)) return -1;
        if (!isMaster(aName) && isMaster(bName)) return 1;
        return aName.localeCompare(bName);
      })
      .map(([branch]) => branch);
  }, [selectedSummary]);

  const branchAnalyses = useMemo(() => {
    if (!selectedSummary || !selectedBranch) return [];
    return selectedSummary.history.filter((analysis) => analysis.branch === selectedBranch);
  }, [selectedSummary, selectedBranch]);

  // Keep the visible metadata tied to the explicitly selected analysis.
  const selectedBranchData = useMemo(() => {
    if (!selectedSummary || !selectedBranch) return null;
    return branchAnalyses.find((analysis) => analysis.analysis_id === selectedAnalysisId) ?? branchAnalyses[0] ?? null;
  }, [branchAnalyses, selectedAnalysisId, selectedBranch, selectedSummary]);

  return (
    <div className="project-header">
      <div className="project-header-top">
        <div className="project-selector-group">
          {!hideProjectSelector && (
            <div className="project-name-section">
              <label htmlFor="project-select">Project</label>
              <select
                id="project-select"
                value={selectedSummary?.projectKey ?? ""}
                onChange={(e) => {
                  onProjectChange(e.target.value);
                  // Reset branch to master/main when switching projects
                  const newSummary = allSummaries.find((s) => s.projectKey === e.target.value);
                  if (newSummary) {
                    const defaultBranch = newSummary.history[0]?.branch ?? "master";
                    onBranchChange(defaultBranch);
                  }
                }}
                className="project-selector"
              >
                <option value="">Select project...</option>
                {allSummaries.map((summary) => (
                  <option key={summary.projectKey} value={summary.projectKey}>
                    {summary.projectKey}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedSummary && availableBranches.length > 0 && (
            <div className="branch-selector-group">
              <label htmlFor="branch-selector">Branch</label>
              <select
                id="branch-selector"
                className="branch-selector-button"
                value={selectedBranch}
                onChange={(event) => onBranchChange(event.target.value)}
              >
                {availableBranches.map((branch) => (
                  <option key={branch} value={branch}>{branch}</option>
                ))}
              </select>
            </div>
          )}

          {onAnalysisChange && branchAnalyses.length > 0 && (
            <div className="analysis-selector-group">
              <label htmlFor="analysis-selector">Analyse</label>
              <select
                id="analysis-selector"
                value={selectedBranchData?.analysis_id ?? ""}
                onChange={(event) => onAnalysisChange(event.target.value)}
              >
                {branchAnalyses.map((analysis) => (
                  <option key={analysis.analysis_id} value={analysis.analysis_id}>
                    {new Date(analysis.created_at).toLocaleString()} · {analysis.commit_sha?.substring(0, 7) || "commit inconnu"}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {selectedBranchData && (
          <div className="branch-info">
            {!scopeUnavailable && (
              <span className={`quality-gate-badge ${analysisGateClass(selectedBranchData.quality_gate, selectedBranchData.completeness)}`}>
                Quality Gate: {analysisGateLabel(selectedBranchData.quality_gate, selectedBranchData.completeness)}
              </span>
            )}
            <span className={`analysis-status status-${selectedBranchData.status}`}>
              Analysis: {({ queued: "Queued", running: "Running", completed: "Completed", failed: "Technical failure" })[selectedBranchData.status] ?? "Unknown"}
            </span>
            <span className="commit-sha" title={selectedBranchData.commit_sha}>
              {selectedBranchData.commit_sha?.substring(0, 7) || "Commit non disponible"}
            </span>
            <span className="analysis-date">
              {new Date(selectedBranchData.created_at).toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
