import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

const projects = readFileSync(new URL('./components/Projects.tsx', import.meta.url), 'utf8');
const history = readFileSync(new URL('./components/MetricsHistory.tsx', import.meta.url), 'utf8');
const issues = readFileSync(new URL('./components/Issues.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const projectHeader = readFileSync(new URL('./components/ProjectHeader.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const newCode = readFileSync(new URL('./components/IngestionDetails.tsx', import.meta.url), 'utf8');
const favoritesSource = readFileSync(new URL('./project-favorites.ts', import.meta.url), 'utf8');
const favoritesOutput = ts.transpileModule(favoritesSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const favoriteExports = {};
vm.runInNewContext(favoritesOutput, { exports: favoriteExports });

const ordered = [
  { projectKey: 'a-plain', isFavorite: false },
  { projectKey: 'd-favorite', isFavorite: true },
  { projectKey: 'b-favorite', isFavorite: true },
].sort(favoriteExports.compareFavoriteProjects);
assert.deepEqual(ordered.map((project) => project.projectKey), ['b-favorite', 'd-favorite', 'a-plain'], 'Favorites sort before plain projects and remain alphabetical');
assert.deepEqual(favoriteExports.filterFavoriteProjects(ordered, true, 'D-').map((project) => project.projectKey), ['d-favorite'], 'Favorite and search filters compose');

for (const removed of ['Focus API', 'View all issues', '<AnalysisEvidence', 'Export all history', 'Exact values', 'All branches', 'issue-severity-links']) {
  assert.ok(!projects.includes(removed) && !history.includes(removed), `${removed} is removed from Projects`);
}
assert.ok(!app.includes('<IngestionDetails'), 'Projects no longer renders the reports and SBOM administration panel');
assert.ok(!app.includes('workspace-context') && !app.includes('Historique :'), 'Redundant project context and history explanation are removed');

for (const mapping of [
  "security_score: 'vulnerability'",
  "maintainability_score: 'code_smell'",
  "reliability_score: 'bug'",
  "dependency_vulnerabilities: 'dependency'",
]) assert.ok(projects.includes(mapping), `Metric navigation keeps ${mapping}`);

assert.ok((projects.match(/onMetricClick=/g) ?? []).length >= 2, 'Overview and detailed metric cards navigate to filtered Issues');
assert.ok(history.includes("label: 'Scores'") && history.includes("label: 'Percentages'") && history.includes("label: 'Findings'"), 'History groups compatible scales into tabs');
assert.ok(history.includes('role="tablist"') && history.includes('role="tabpanel"'), 'Metric groups expose accessible tab semantics');
assert.ok(projects.includes('repositoryCommitLink') && projects.includes('repositoryPullRequestLink') && projectHeader.includes('repositoryBranchLink'), 'Repository references link to their exact revision');
assert.ok(newCode.includes('repositoryCommitLink') && newCode.includes('baseUrl') && newCode.includes('headUrl'), 'New Code links both comparison commits');
assert.ok(styles.includes("input:not([type='checkbox'])") && styles.includes('.collaboration-checkbox input'), 'Issue checkbox keeps its native compact layout');
assert.ok(styles.includes('.metric-card:has(.metric-card-link):hover') && styles.includes('box-shadow: inset 0 0 0 2px var(--primary)'), 'Clickable metric hover has a clear bounded state');
assert.ok(projects.includes('Favorite projects only') && projects.includes('aria-pressed={summary.isFavorite}'), 'Favorite controls expose native filter and pressed state');
assert.ok(projects.includes('No favorite projects yet.') && projects.includes('No favorite projects match the current search.'), 'Favorite empty states remain explicit');
assert.ok(app.includes("method: isFavorite ? 'DELETE' : 'PUT'") && app.includes("['analyses', 'summary-project']"), 'Favorite mutation uses idempotent methods and refreshes both summary caches');
assert.ok(app.includes("setProjectCursor('')") && styles.includes('.project-favorite.active'), 'Favorite changes reset pagination and use the shared visual tokens');

for (const filter of ['severity', 'category', 'rule', 'path', 'mine', 'state', 'team_id']) {
  assert.ok(new RegExp(`(?:${filter}:|\\b${filter},)`).test(issues), `Issue exports include active ${filter} filter`);
}
assert.ok(issues.includes('/findings/export/csv?') && (issues.match(/\/findings\/export\//g) ?? []).length === 1, 'Issues expose one filtered CSV export');
assert.ok(issues.includes('className="icon-button"') && issues.includes('aria-label="Export filtered issues as CSV"'), 'CSV export is a named icon button');
assert.ok(!issues.includes('sur cette page') && !issues.includes('issues-toolbar-summary">\n            <p>'), 'Issues omit the per-page technical summary');
assert.ok(issues.indexOf('aria-label="Issue pages"') > issues.indexOf('className="issues-list"'), 'Issue pagination follows the list');
assert.ok(!app.includes('workspace-heading') && app.includes('`CodeInsights - ${pageName}`'), 'The app avoids a duplicate view heading and synchronizes the document title');

console.log('Projects UX checks passed.');
