import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiPage } from '../api';
import type { RuleCard, ProjectSummary } from '../types';

export default function Rules({ apiBase: API_BASE, authToken, selectedProject, onProjectChange, summaries, canSuppressRules }: {
  apiBase: string;
  authToken?: string;
  selectedProject: string;
  onProjectChange: (project: string) => void;
  summaries: ProjectSummary[];
  canSuppressRules: boolean;
}) {
  const queryClient = useQueryClient();
  const [ruleSearch, setRuleSearch] = useState("");
  const [ruleFilterCategory, setRuleFilterCategory] = useState<string>("all");
  const [ruleFilterSeverity, setRuleFilterSeverity] = useState<string>("all");
  const [ruleFilterStatus, setRuleFilterStatus] = useState<string>("all");
  const [ruleFilterLanguage, setRuleFilterLanguage] = useState<string>("all");
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const key = [selectedProject, ruleSearch, ruleFilterCategory, ruleFilterSeverity].join('|');
  const [page, setPage] = useState({ key: '', cursor: '' });
  const cursor = page.key === key ? page.cursor : '';
  const rulesQuery = useQuery({
    queryKey: ['rules', key, cursor], enabled: !!authToken,
    queryFn: ({ signal }) => apiPage<RuleCard>(`${API_BASE}/v1/insights/rules?${new URLSearchParams({ project_key: selectedProject, search: ruleSearch, category: ruleFilterCategory, severity: ruleFilterSeverity, cursor })}`, authToken, { signal }),
  });
  const rules = rulesQuery.data?.items ?? [];
  const rulesLoading = rulesQuery.isLoading;
  const rulesError = rulesQuery.error?.message ?? null;
  const filteredRules = useMemo(() => {
    const q = ruleSearch.trim().toLowerCase();
    return rules.filter((r) => {
      if (q && !r.title.toLowerCase().includes(q) && !r.rule_id.toLowerCase().includes(q)) return false;
      if (ruleFilterCategory !== "all" && r.category.toLowerCase() !== ruleFilterCategory) return false;
      if (ruleFilterSeverity !== "all" && r.severity.toLowerCase() !== ruleFilterSeverity) return false;
      if (ruleFilterStatus !== "all" && r.status !== ruleFilterStatus) return false;
      if (ruleFilterLanguage !== "all" && r.language.toLowerCase() !== ruleFilterLanguage.toLowerCase()) return false;
      return true;
    });
  }, [rules, ruleSearch, ruleFilterCategory, ruleFilterSeverity, ruleFilterStatus, ruleFilterLanguage]);

  const selectedRule = useMemo(
    () => filteredRules.find((r) => (r.key ?? r.rule_id) === selectedRuleId) ?? filteredRules[0] ?? null,
    [filteredRules, selectedRuleId]
  );


  const suppressionMutation = useMutation({
    mutationFn: ({ ruleId, suppress }: { ruleId: string; suppress: boolean }) => apiFetch(`${API_BASE}/v1/rules/${encodeURIComponent(ruleId)}/suppress`, authToken, { method: suppress ? 'POST' : 'DELETE' }),
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: ['rules'] }), queryClient.invalidateQueries({ queryKey: ['audit'] })]),
  });
  const suppressRule = (ruleId: string) => suppressionMutation.mutate({ ruleId, suppress: true });
  const unsuppressRule = (ruleId: string) => suppressionMutation.mutate({ ruleId, suppress: false });


  return (
        <>
        {suppressionMutation.error && <p className="feedback error" role="alert">{suppressionMutation.error.message}</p>}
        <p className="hint">Règles observées dans la dernière analyse de chaque projet. Les exceptions des profils se configurent ci-dessus ; les suppressions globales historiques ne s’appliquent pas à ce catalogue.</p>
        <div className="action-row">{cursor && <button type="button" onClick={() => setPage({ key, cursor: '' })}>Première page</button>}{rulesQuery.data?.next && <button type="button" onClick={() => setPage({ key, cursor: rulesQuery.data!.next! })}>Règles suivantes</button>}</div>
        <div className="tab-project-bar">
          <select
            aria-label="Project"
              value={selectedProject}
            onChange={(e) => { onProjectChange(e.target.value); }}
          >
            <option value="">— All projects —</option>
            {summaries.map((s) => (
              <option key={s.projectKey} value={s.projectKey}>{s.projectKey}</option>
            ))}
          </select>
        </div>
        <section className="two-pane-screen">
          <aside className="rules-sidebar">
            <h3>Filters</h3>

            <div className="filter-block">
              <label>Category</label>
              <select aria-label="Category" value={ruleFilterCategory} onChange={(e) => setRuleFilterCategory(e.target.value)}>
                <option value="all">All</option>
                <option value="bug">Bugs</option><option value="code_smell">Code smells</option><option value="vulnerability">Vulnérabilités</option><option value="security_hotspot">Points sensibles</option><option value="secret">Secrets</option><option value="dependency">Dependencies</option><option value="code">Code</option><option value="ioc">IOC</option><option value="unknown">Unknown</option>
              </select>
            </div>

            <div className="filter-block">
              <label>Severity</label>
              <select aria-label="Severity" value={ruleFilterSeverity} onChange={(e) => setRuleFilterSeverity(e.target.value)}>
                <option value="all">All</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div className="filter-block">
              <label>Status</label>
              <select aria-label="Status" value={ruleFilterStatus} onChange={(e) => setRuleFilterStatus(e.target.value)}>
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="suppressed">Suppressed</option>
              </select>
            </div>

            <div className="filter-block">
              <label>Language</label>
              <select aria-label="Language" value={ruleFilterLanguage} onChange={(e) => setRuleFilterLanguage(e.target.value)}>
                <option value="all">All</option>
                {[...new Set(rules.map((r) => r.language))].sort().map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              style={{ marginTop: "1rem", width: "100%" }}
              onClick={() => {
                setRuleFilterCategory("all");
                setRuleFilterSeverity("all");
                setRuleFilterStatus("all");
                setRuleFilterLanguage("all");
                setRuleSearch("");
              }}
            >
              Reset filters
            </button>
          </aside>

          <div className="rules-main">
            <header className="rules-toolbar">
              <input
                placeholder="Search rules by name or ID…"
                aria-label="Search rules by name or ID"
                value={ruleSearch}
                onChange={(e) => setRuleSearch(e.target.value)}
              />
              <p style={{ marginLeft: "auto", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                {rulesLoading ? "Loading…" : `${filteredRules.length} rule${filteredRules.length !== 1 ? "s" : ""}`}
              </p>
            </header>

            <div className="content-grid">
              <div className="rules-list">
                {rulesLoading && <p style={{ padding: "1rem", color: "var(--text-secondary)" }}>Loading rules…</p>}
                {rulesError && <p className="feedback error" role="alert">{rulesError}. <button type="button" onClick={() => void rulesQuery.refetch()}>Retry rules</button></p>}
                {!rulesLoading && !rulesError && filteredRules.length === 0 && (
                  <p style={{ padding: "1rem", color: "var(--text-secondary)" }}>No rules found.</p>
                )}
                {filteredRules.map((rule) => (
                  <article
                    key={rule.key ?? rule.rule_id}
                    className={(selectedRule?.key ?? selectedRule?.rule_id) === (rule.key ?? rule.rule_id) ? "rule-card selected" : "rule-card"}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4 style={{ margin: 0, fontSize: "0.9rem", wordBreak: "break-word" }}><button type="button" className="rule-title-button" aria-pressed={(selectedRule?.key ?? selectedRule?.rule_id) === (rule.key ?? rule.rule_id)} onClick={() => setSelectedRuleId(rule.key ?? rule.rule_id)}>{rule.title}</button></h4>
                      <p style={{ margin: "0.2rem 0 0", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                        {rule.category} · {rule.severity} · {rule.language}
                      </p>
                      <small style={{ color: "var(--text-secondary)" }}>
                        {rule.occurrences} occurrence{rule.occurrences !== 1 ? "s" : ""} in {rule.file_count} file{rule.file_count !== 1 ? "s" : ""}
                      </small>
                    </div>
                    <span className={rule.status === "suppressed" ? "chip chip-suppressed" : "chip chip-active"}>
                      {rule.status === "suppressed" ? "Suppressed" : "Active"}
                    </span>
                  </article>
                ))}
              </div>

              <aside className="panel">
                {selectedRule ? (
                  <>
                    <h3 style={{ wordBreak: "break-word", fontSize: "0.95rem" }}>{selectedRule.title}</h3>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                      {selectedRule.category} · {selectedRule.severity} · {selectedRule.language}
                    </p>
                    <code style={{ fontSize: "0.72rem", wordBreak: "break-all", display: "block", marginTop: "0.5rem", color: "var(--text-secondary)" }}>
                      {selectedRule.rule_id}
                    </code>

                    <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.82rem" }}>
                      <div><strong>{selectedRule.occurrences}</strong> occurrences</div>
                      <div><strong>{selectedRule.file_count}</strong> files affected</div>
                      <div><strong>{selectedRule.project_count}</strong> project{selectedRule.project_count !== 1 ? "s" : ""}:{" "}
                        {selectedRule.projects.join(", ")}
                      </div>
                    </div>

                    {canSuppressRules && (
                    <div className="action-row" style={{ marginTop: "1.25rem" }}>
                      {selectedRule.status === "active" ? (
                        <button
                          type="button"
                          disabled={suppressionMutation.isPending} onClick={() => suppressRule(selectedRule.rule_id)}
                          title="Mark as false positive — suppresses this rule globally"
                        >
                          Suppress (false positive)
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={suppressionMutation.isPending} onClick={() => unsuppressRule(selectedRule.rule_id)}
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                    )}
                    <p style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.75rem" }}>
                      {selectedRule.status === "suppressed"
                        ? "This rule is globally suppressed and will not count toward quality scores."
                        : canSuppressRules
                          ? "Suppressing marks all occurrences as false positives across all projects."
                          : "Contact an admin or analyst to suppress this rule."}
                    </p>
                  </>
                ) : (
                  <p style={{ color: "var(--text-secondary)" }}>Select a rule to see details.</p>
                )}
              </aside>
            </div>
          </div>
        </section>
        </>
  );
}
