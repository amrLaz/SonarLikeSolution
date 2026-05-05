import { useState, useMemo } from "react";
import type { AnalysisRecord, ProjectSummary } from "../App";
import "./ProjectHeader.css";

interface ProjectHeaderProps {
  selectedSummary: ProjectSummary | null;
  allSummaries: ProjectSummary[];
  onProjectChange: (projectKey: string) => void;
  onBranchChange: (branch: string) => void;
  selectedBranch: string;
  hideProjectSelector?: boolean;
}

export default function ProjectHeader({
  selectedSummary,
  allSummaries,
  onProjectChange,
  onBranchChange,
  selectedBranch,
  hideProjectSelector = false
}: ProjectHeaderProps) {
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);

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

  // Get data for selected branch
  const selectedBranchData = useMemo(() => {
    if (!selectedSummary || !selectedBranch) return null;
    const analysis = selectedSummary.history.find((a) => a.branch === selectedBranch);
    return analysis ?? null;
  }, [selectedSummary, selectedBranch]);

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
              <div className="branch-selector-container">
                <button
                  id="branch-selector"
                  className="branch-selector-button"
                  onClick={() => setShowBranchDropdown(!showBranchDropdown)}
                  title={`Switch branch: ${selectedBranch}`}
                >
                  <span className="branch-icon">⎇</span>
                  <span className="branch-name">{selectedBranch}</span>
                  <span className="branch-badge">{availableBranches.length}</span>
                </button>

                {showBranchDropdown && (
                  <div className="branch-dropdown">
                    {availableBranches.map((branch) => {
                      const branchAnalysis = selectedSummary.history.find((a) => a.branch === branch);
                      const isSelected = branch === selectedBranch;
                      const status = branchAnalysis?.quality_gate ?? "unknown";

                      return (
                        <button
                          key={branch}
                          type="button"
                          className={`branch-option ${isSelected ? "active" : ""} status-${status}`}
                          onClick={() => {
                            onBranchChange(branch);
                            setShowBranchDropdown(false);
                          }}
                        >
                          <span className="branch-option-name">{branch}</span>
                          <span className={`branch-option-status ${status}`}>
                            {status === "pass" ? "✓" : status === "fail" ? "✕" : "○"}
                          </span>
                          {branchAnalysis && (
                            <span className="branch-option-date">
                              {new Date(branchAnalysis.created_at).toLocaleDateString()}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {selectedBranchData && (
          <div className="branch-info">
            <span className={`quality-gate-badge ${selectedBranchData.quality_gate}`}>
              {selectedBranchData.quality_gate === "pass" ? "✓ Passed" : "✕ Failed"}
            </span>
            <span className="commit-sha" title={selectedBranchData.commit_sha}>
              {selectedBranchData.commit_sha?.substring(0, 7)}
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
