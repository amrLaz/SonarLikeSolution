import InfoHint from './InfoHint';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson, apiPage } from '../api';
import { findingCategory, findingCategoryLabel } from '../metric-display';
import type { IssueSeverityFilter, IssueTypeFilter, ProjectMeta, ProjectSummary } from '../types';
import ProjectHeader from './ProjectHeader';
import { FindingReview, FINDING_STATES, type Team } from './IssueReview';
import { evidenceLink, repositoryBranchLink, repositoryCommitLink, ruleDefinitionLink } from '../evidence-links';
import type { IssueFilters } from '../navigation-state';
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api');
type Props = {
  authToken?: string;
  isAdmin: boolean;
  selectedProject: string;
  selectedBranch: string;
  selectedAnalysisId: string;
  selectedSummary: ProjectSummary | null;
  summaries: ProjectSummary[];
  projectMeta: Record<string, ProjectMeta>;
  setSelectedProject: (value: string) => void;
  setSelectedBranch: (value: string) => void;
  setSelectedAnalysisId: (value: string) => void;
  downloadExport: (url: string, filename: string) => Promise<void>;
  filters: IssueFilters;
  onFiltersChange: (filters: IssueFilters) => void;
};
type EvidenceLocation = { kind: string; flow?: number; thread?: number; step: number; path?: string; line?: number; end_line?: number; source_url?: string | null };
type FindingEvidence = {
  driver_version?: string;
  documentation_url?: string;
  documentation_source?: string;
  documentation_version?: string;
  documentation_status?: string;
  locations?: EvidenceLocation[];
  locations_truncated?: boolean;
};
type IssueOccurrence = {
  id: number;
  finding_id: string | null;
  tool: string;
  original_tool?: string;
  tool_version?: string;
  rule_id: string;
  severity: string;
  category: string;
  message: string;
  path: string | null;
  line: number | null;
  source_url?: string | null;
  evidence?: FindingEvidence | null;
  prompt_available: boolean;
  prompt_unavailable_reason?: string | null;
};

export default function Issues({
  authToken,
  isAdmin,
  selectedProject,
  selectedBranch,
  selectedAnalysisId,
  selectedSummary,
  summaries,
  projectMeta,
  setSelectedProject,
  setSelectedBranch,
  setSelectedAnalysisId,
  downloadExport,
  filters,
  onFiltersChange,
}: Props) {
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const promptDialog = useRef<HTMLDialogElement>(null);
  const [promptState, setPromptState] = useState<{ issueId: string; prompt: string; loading: boolean; error: string | null; copied: boolean } | null>(null);
  useEffect(() => {
    if (!promptState) return;
    promptDialog.current?.showModal();
  }, [promptState?.issueId]);
  const closePrompt = () => {
    promptDialog.current?.close();
    setPromptState(null);
  };
  const loadPrompt = async (issueId: string) => {
    setPromptState({ issueId, prompt: '', loading: true, error: null, copied: false });
    try {
      const result = await apiJson<{ prompt: string }>(`${API_BASE}/v1/issues/${encodeURIComponent(issueId)}/prompt`, authToken);
      setPromptState({ issueId, prompt: result.prompt, loading: false, error: null, copied: false });
    } catch (error) {
      setPromptState({ issueId, prompt: '', loading: false, error: error instanceof Error ? error.message : 'Impossible de générer le prompt.', copied: false });
    }
  };
  const { severity: issueSeverityFilter, category: issueTypeFilter, rule: issueRuleFilter, file: issueFileFilter, mine, state, team: teamId } = filters;
  const updateFilters = (patch: Partial<IssueFilters>) => onFiltersChange({ ...filters, ...patch });
  const [teamPage, setTeamPage] = useState({ project: '', cursor: '' });
  const teamCursor = teamPage.project === selectedProject ? teamPage.cursor : '';
  const teams = useQuery({
    queryKey: ['collaboration', 'teams', selectedProject, teamCursor],
    enabled: !!selectedProject,
    queryFn: ({ signal }) => apiPage<Team>(`${API_BASE}/v1/collaboration/teams?${new URLSearchParams({ project_key: selectedProject, cursor: teamCursor })}`, authToken, { signal }),
  });
  const filterKey = [selectedAnalysisId, issueSeverityFilter, issueTypeFilter, issueRuleFilter, issueFileFilter, mine, state, teamId].join('|');
  const [page, setPage] = useState({ key: '', cursor: '' });
  const cursor = page.key === filterKey ? page.cursor : '';
  const exportQuery = new URLSearchParams({
    severity: issueSeverityFilter,
    category: issueTypeFilter,
    rule: issueRuleFilter,
    path: issueFileFilter,
    mine: mine ? 'true' : '',
    state,
    team_id: teamId,
  });
  const issuesQuery = useQuery({
    queryKey: ['findings', filterKey, cursor],
    enabled: !!selectedAnalysisId,
    queryFn: ({ signal }) =>
      apiPage<IssueOccurrence>(
        `${API_BASE}/v1/insights/analyses/${encodeURIComponent(selectedAnalysisId)}/findings?${new URLSearchParams({ severity: issueSeverityFilter, category: issueTypeFilter, rule: issueRuleFilter, path: issueFileFilter, mine: mine ? 'true' : '', state, team_id: teamId, cursor })}`,
        authToken,
        { signal },
      ),
  });
  const issuesLoading = issuesQuery.isLoading;
  const issuesError = issuesQuery.error?.message ?? null;
  const selectedAnalysis = selectedSummary?.history.find((item) => item.analysis_id === selectedAnalysisId);
  const repository = projectMeta[selectedProject];
  const branchUrl = repositoryBranchLink(repository?.repoProvider ?? 'other', repository?.repoUrl, selectedAnalysis?.branch);
  const filteredIssueDetails = useMemo(
    () =>
      (issuesQuery.data?.items ?? []).map((issue) => ({
        id: String(issue.id),
        finding_id: issue.finding_id,
        file_path: issue.path ?? '',
        line: issue.line,
        end_line: issue.evidence?.locations?.find((location) => location.kind === 'primary')?.end_line,
        rule: issue.rule_id,
        message: issue.message,
        severity: issue.severity.toUpperCase(),
        category: findingCategory(issue.category),
        tool: issue.tool,
        commit_sha: selectedAnalysis?.commit_sha ?? '',
        branch: selectedAnalysis?.branch ?? '',
        source_url: evidenceLink(issue.source_url),
        evidence: issue.evidence,
        documentation_url: evidenceLink(issue.evidence?.documentation_url),
        producer: issue.original_tool ?? issue.tool,
        tool_version: issue.evidence?.driver_version ?? issue.tool_version,
        prompt_available: issue.prompt_available,
        prompt_unavailable_reason: issue.prompt_unavailable_reason,
      })),
    [issuesQuery.data, selectedAnalysis],
  );
  const allIssueDetails = filteredIssueDetails;

  return (
    <section className="two-pane-screen issues-screen">
      {/* ── Project Header ──────────────────────────────── */}
      <div style={{ gridColumn: '1 / -1' }}>
        <ProjectHeader
          selectedSummary={selectedSummary}
          allSummaries={summaries}
          onProjectChange={(projectKey) => {
            setSelectedProject(projectKey);
            setSelectedBranch('');
          }}
          onBranchChange={setSelectedBranch}
          selectedBranch={selectedBranch}
          selectedAnalysisId={selectedAnalysisId}
          onAnalysisChange={setSelectedAnalysisId}
          repoProvider={repository?.repoProvider}
          repoUrl={repository?.repoUrl}
        />
      </div>

      {/* ── Left sidebar filters ──────────────────────────────── */}
      <aside className="issues-sidebar">
        <h3>Filters</h3>
        <div className="issue-filter-group">
          <label className="collaboration-checkbox">
            <input type="checkbox" checked={mine} onChange={(event) => updateFilters({ mine: event.target.checked })} /> Mes problèmes
          </label>
          <label>
            État collaboratif
            <select value={state} onChange={(event) => updateFilters({ state: event.target.value })}>
              <option value="">Tous les états</option>
              {Object.entries(FINDING_STATES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Équipe
            <select value={teamId} disabled={!teams.isSuccess} onChange={(event) => updateFilters({ team: event.target.value })}>
              <option value="">Toutes les équipes</option>
              {teamId && !teams.data?.items.some((item) => item.id === teamId) && <option value={teamId}>Équipe sélectionnée hors page</option>}
              {teams.data?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {teams.error && <p role="alert">{teams.error.message}</p>}
          {teamCursor && (
            <button type="button" onClick={() => setTeamPage({ project: selectedProject, cursor: '' })}>
              Premières équipes
            </button>
          )}
          {teams.data?.next && (
            <button type="button" onClick={() => setTeamPage({ project: selectedProject, cursor: teams.data!.next! })}>
              Équipes suivantes
            </button>
          )}
        </div>

        <div className="issue-filter-group">
          <p className="issue-filter-label">Catégorie</p>
          {(['all', 'bug', 'code_smell', 'vulnerability', 'security_hotspot', 'secret', 'dependency', 'code', 'ioc', 'unknown'] as IssueTypeFilter[]).map((t) => (
            <button key={t} type="button" aria-pressed={issueTypeFilter === t} className={`issue-filter-btn${issueTypeFilter === t ? ' active' : ''}`} onClick={() => updateFilters({ category: t })}>
              {t === 'all' ? 'Toutes' : findingCategoryLabel(t)}
            </button>
          ))}
        </div>

        <div className="issue-filter-group">
          <p className="issue-filter-label">Severity</p>
          {(['all', 'blocker', 'high', 'medium', 'low', 'info'] as IssueSeverityFilter[]).map((sev) => (
            <button
              key={sev}
              type="button"
              aria-pressed={issueSeverityFilter === sev}
              className={`issue-filter-btn${issueSeverityFilter === sev ? ' active' : ''}`}
              onClick={() => updateFilters({ severity: sev })}
            >
              {sev === 'all' ? 'All severities' : sev.charAt(0).toUpperCase() + sev.slice(1)}
            </button>
          ))}
        </div>

        <div className="issue-filter-group">
          <p className="issue-filter-label">Rule</p>
          <input aria-label="Filter by rule" placeholder="Filter by rule…" value={issueRuleFilter} onChange={(e) => updateFilters({ rule: e.target.value })} />
        </div>

        <div className="issue-filter-group">
          <p className="issue-filter-label">File</p>
          <input aria-label="Filter by file path" placeholder="Filter by file path…" value={issueFileFilter} onChange={(e) => updateFilters({ file: e.target.value })} />
        </div>

        <button
          type="button"
          style={{ marginTop: '0.75rem', width: '100%' }}
          onClick={() => {
            onFiltersChange({ severity: 'all', category: 'all', rule: '', file: '', mine: false, state: '', team: '' });
            setTeamPage({ project: selectedProject, cursor: '' });
          }}
        >
          Reset filters
        </button>
      </aside>

      {/* ── Right issues list ─────────────────────────────────── */}
      <div className="issues-main">
        <div className="action-row">
          {cursor && (
            <button type="button" onClick={() => setPage({ key: filterKey, cursor: '' })}>
              Première page
            </button>
          )}
          {issuesQuery.data?.next && (
            <button type="button" onClick={() => setPage({ key: filterKey, cursor: issuesQuery.data!.next! })}>
              Page suivante
            </button>
          )}
        </div>
        <header className="issues-toolbar">
          <div className="issues-toolbar-summary">
            <h2>
              Issues{' '}
              <InfoHint>
                Problèmes détectés dans l’analyse sélectionnée. Les compteurs et la liste portent uniquement sur ses findings détaillés ; un résumé par fichier ne crée aucune issue artificielle. Le lien
                de code ouvre le commit exact dans le dépôt.
              </InfoHint>
            </h2>
            <p>
              {filteredIssueDetails.length} sur cette page · issue{filteredIssueDetails.length !== 1 ? 's' : ''}
              {allIssueDetails.length > 0 && filteredIssueDetails.length < allIssueDetails.length ? ` (filtered from ${allIssueDetails.length})` : ''}
            </p>
          </div>
          <div className="issues-export-actions" aria-label="Exporter les issues filtrées">
            <button
              type="button"
              className="primary"
              disabled={!selectedAnalysisId}
              onClick={() => void downloadExport(`${API_BASE}/v1/insights/analyses/${encodeURIComponent(selectedAnalysisId)}/findings/export/pdf?${exportQuery}`, `${selectedProject}-${selectedAnalysisId}-issues.pdf`)}
            >
              ↓ Export PDF
            </button>
            <button
              type="button"
              disabled={!selectedAnalysisId}
              onClick={() => void downloadExport(`${API_BASE}/v1/insights/analyses/${encodeURIComponent(selectedAnalysisId)}/findings/export/csv?${exportQuery}`, `${selectedProject}-${selectedAnalysisId}-issues.csv`)}
            >
              ↓ Export CSV
            </button>
          </div>
        </header>

        {issuesLoading ? (
          <p className="feedback" role="status">
            Loading file findings…
          </p>
        ) : issuesError ? (
          <p className="feedback error" role="alert">
            {issuesError}.{' '}
            <button type="button" onClick={() => void issuesQuery.refetch()}>
              Retry
            </button>
          </p>
        ) : filteredIssueDetails.length === 0 ? (
          <div className="issues-empty">{allIssueDetails.length === 0 ? 'No file findings available in the loaded analyses for this scope.' : 'No issues match the current filters.'}</div>
        ) : (
          <div className="issues-list">
            {filteredIssueDetails.map((issue) => {
              const severityLower = issue.severity.toLowerCase();
              const sevClass =
                severityLower === 'critical' || severityLower === 'error' || severityLower === 'blocker'
                  ? 'sev-blocker'
                  : severityLower === 'high'
                    ? 'sev-high'
                    : severityLower === 'warning' || severityLower === 'medium'
                      ? 'sev-medium'
                      : severityLower === 'low' || severityLower === 'convention'
                        ? 'sev-low'
                        : 'sev-info';
              const shortFile = issue.file_path.split('/').slice(-2).join('/');
              const lineLabel = issue.end_line && issue.end_line !== issue.line ? `L${issue.line}–${issue.end_line}` : issue.line == null ? 'Ligne indisponible' : `L${issue.line}`;
              const isExpanded = expandedIssueId === issue.id;

              const definitionUrl = issue.documentation_url ?? ruleDefinitionLink(issue.tool, issue.rule);
              const issueBranchUrl = repositoryBranchLink(repository?.repoProvider ?? 'other', repository?.repoUrl, issue.branch);
              const issueCommitUrl = repositoryCommitLink(repository?.repoProvider ?? 'other', repository?.repoUrl, issue.commit_sha);
              return (
                <article key={issue.id} className={`issue-card ${sevClass}${isExpanded ? ' expanded' : ''}`}>
                  <div className="issue-card-header">
                    <div className="issue-card-left">
                      <span className={`sev-badge ${sevClass}`}>{issue.severity}</span>
                    </div>
                    <div className="issue-card-body">
                      <p className="issue-message">{issue.message}</p>
                      <p className="issue-meta">
                        <span className="issue-rule">
                          {findingCategoryLabel(issue.category)} · {issue.tool} · {issue.rule}
                        </span>
                        <span className="issue-sep">·</span>
                        <span className="issue-revision">
                          {issueBranchUrl ? <a href={issueBranchUrl} target="_blank" rel="noreferrer"><code>{issue.branch}</code></a> : <code>{issue.branch}</code>}
                          {' @ '}
                          {issueCommitUrl ? <a href={issueCommitUrl} target="_blank" rel="noreferrer"><code>{issue.commit_sha.slice(0, 7)}</code></a> : <code>{issue.commit_sha.slice(0, 7) || 'Non disponible'}</code>}
                        </span>
                        <span className="issue-sep">·</span>
                        {issue.source_url ? (
                          <a href={issue.source_url} target="_blank" rel="noreferrer" className="issue-file-link" title={issue.file_path}>
                            <span className="issue-file">{shortFile}</span>
                            <span className="issue-file-colon">:</span>
                            <span className="issue-line">{lineLabel}</span>
                            <span className="issue-ext-icon">↗</span>
                          </a>
                        ) : (
                          <>
                            <span className="issue-file" title={issue.file_path}>
                              {shortFile}
                            </span>
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
                      aria-label={isExpanded ? 'Collapse file details' : 'Expand file details'}
                      onClick={() => setExpandedIssueId(isExpanded ? null : issue.id)}
                      title={isExpanded ? 'Collapse file details' : 'Expand file details'}
                    >
                      {isExpanded ? '▾' : '▸'}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="issue-details">
                      <div className="issue-file-header">
                        <strong>File Details:</strong>
                        <code className="file-path">{issue.file_path}</code>
                        <span className="line-info">{lineLabel}</span>
                      </div>
                      <p>Message du rapport : {issue.message}</p>
                      {issue.source_url ? (
                        <div className="issue-actions">
                          <a href={issue.source_url} target="_blank" rel="noreferrer" className="btn-open-repo">
                            Ouvrir au commit analysé
                          </a>
                        </div>
                      ) : (
                        <p>Lien vers le code au commit analysé indisponible.</p>
                      )}
                      <div className="issue-actions">
                        <button
                          type="button"
                          disabled={!issue.prompt_available}
                          title={issue.prompt_available ? undefined : `Prompt indisponible : ${issue.prompt_unavailable_reason ?? 'source absente'}`}
                          onClick={() => void loadPrompt(issue.id)}
                        >
                          Générer le prompt
                        </button>
                        {!issue.prompt_available && <span>Prompt indisponible ({issue.prompt_unavailable_reason ?? 'source absente'}).</span>}
                      </div>
                      <section aria-label="Documentation de la règle">
                        <h4>Pourquoi cette issue ? Comment la résoudre ?</h4>
                        <p>
                          Producteur : {issue.producer} · règle <code>{issue.rule}</code> · analyseur {issue.tool_version ?? 'version inconnue'}.
                        </p>
                        {definitionUrl ? (
                          <>
                            <a href={definitionUrl} target="_blank" rel="noreferrer">
                              Consulter la définition externe
                            </a>
                            <InfoHint>
                              {issue.documentation_url
                                ? `Lien fourni par le producteur dans le rapport (${issue.evidence?.documentation_source ?? 'provenance non précisée'}). Version documentaire : ${issue.evidence?.documentation_version ?? 'inconnue'}.`
                                : 'Lien construit vers le référentiel public officiel reconnu pour cet identifiant. Aucune définition de règle n’est stockée dans CodeInsights.'}
                            </InfoHint>
                          </>
                        ) : (
                          <p>Documentation de la règle indisponible.</p>
                        )}
                      </section>
                      <section aria-label="Localisations et flux du rapport">
                        <h4>Preuves contextualisées</h4>
                        {['related', 'flow'].map((kind) => {
                          const locations = issue.evidence?.locations?.filter((location) => location.kind === kind) ?? [];
                          return (
                            <div key={kind}>
                              <p>
                                {kind === 'related' ? 'Localisations secondaires' : 'Chemins de flux'} : {locations.length ? `${locations.length} localisations reçues` : 'non fournis'}.
                              </p>
                              {locations.length > 0 && (
                                <ol>
                                  {locations.map((location, index) => {
                                    const link = evidenceLink(location.source_url);
                                    const label = `${location.path ?? 'Fichier indisponible'} · ${location.line == null ? 'ligne indisponible' : `L${location.line}${location.end_line ? `–${location.end_line}` : ''}`}`;
                                    return (
                                      <li key={index}>
                                        {kind === 'flow' && (
                                          <span>
                                            Flux {location.flow} · fil {location.thread} · étape {location.step} :{' '}
                                          </span>
                                        )}
                                        {link ? (
                                          <a href={link} target="_blank" rel="noreferrer">
                                            {label}
                                          </a>
                                        ) : (
                                          <span>{label}</span>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ol>
                              )}
                            </div>
                          );
                        })}
                        {issue.evidence?.locations_truncated && <p role="status">Liste de preuves tronquée à la limite d’import.</p>}
                      </section>
                      <FindingReview
                        key={`${selectedAnalysisId}:${issue.id}`}
                        findingId={issue.finding_id}
                        occurrenceId={Number(issue.id)}
                        projectKey={selectedProject}
                        authToken={authToken}
                        isAdmin={isAdmin}
                        branchUrl={branchUrl}
                      />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
      {promptState && (
        <dialog ref={promptDialog} className="config-modal prompt-modal" aria-labelledby="prompt-dialog-title" onCancel={(event) => { event.preventDefault(); closePrompt(); }}>
          <div className="config-modal-header">
            <h3 id="prompt-dialog-title">Prompt IA contextualisé</h3>
            <button type="button" aria-label="Fermer" onClick={closePrompt}>×</button>
          </div>
          {promptState.loading && <p role="status">Génération du prompt…</p>}
          {promptState.error && <p className="feedback error" role="alert">{promptState.error}</p>}
          {promptState.prompt && <textarea aria-label="Prompt IA" readOnly value={promptState.prompt} rows={18} />}
          <div className="action-row">
            <button
              type="button"
              disabled={!promptState.prompt}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(promptState.prompt);
                  setPromptState({ ...promptState, copied: true, error: null });
                } catch {
                  setPromptState({ ...promptState, copied: false, error: 'La copie dans le presse-papiers a échoué.' });
                }
              }}
            >
              Copier
            </button>
            <button type="button" onClick={closePrompt}>Fermer</button>
            {promptState.copied && <span role="status">Copié</span>}
          </div>
        </dialog>
      )}
    </section>
  );
}
