import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const projects = readFileSync(new URL('./components/Projects.tsx', import.meta.url), 'utf8');
const history = readFileSync(new URL('./components/MetricsHistory.tsx', import.meta.url), 'utf8');
const issues = readFileSync(new URL('./components/Issues.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');

for (const removed of ['Focus API', 'Voir toutes les issues', '<AnalysisEvidence', 'Export all history', 'Valeurs exactes', 'All branches', 'issue-severity-links']) {
  assert.ok(!projects.includes(removed) && !history.includes(removed), `${removed} is removed from Projects`);
}
assert.ok(!app.includes('<IngestionDetails'), 'Projects no longer renders the reports and SBOM administration panel');

for (const mapping of [
  "security_score: 'vulnerability'",
  "maintainability_score: 'code_smell'",
  "reliability_score: 'bug'",
  "dependency_vulnerabilities: 'dependency'",
]) assert.ok(projects.includes(mapping), `Metric navigation keeps ${mapping}`);

assert.ok((projects.match(/onMetricClick=/g) ?? []).length >= 2, 'Overview and detailed metric cards navigate to filtered Issues');
assert.ok(history.includes("label: 'Scores'") && history.includes("label: 'Percentages'") && history.includes("label: 'Findings'"), 'History groups compatible scales into tabs');
assert.ok(history.includes('role="tablist"') && history.includes('role="tabpanel"'), 'Metric groups expose accessible tab semantics');

for (const filter of ['severity', 'category', 'rule', 'path', 'mine', 'state', 'team_id']) {
  assert.ok(new RegExp(`(?:${filter}:|\\b${filter},)`).test(issues), `Issue exports include active ${filter} filter`);
}
assert.ok(issues.includes('/findings/export/pdf?') && issues.includes('/findings/export/csv?'), 'Issue exports use the filtered findings endpoints');

console.log('Projects UX checks passed.');
