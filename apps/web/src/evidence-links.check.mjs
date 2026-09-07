import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

const source = readFileSync(new URL('./evidence-links.ts', import.meta.url), 'utf8');
const exports = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, URL });
for (const value of [undefined, null, '', 'javascript:alert(1)', 'data:text/html,hello', '/relative', 'https://user:secret@example.com']) assert.equal(exports.evidenceLink(value), null);
assert.equal(exports.evidenceLink('https://example.com/rule?q=a%20b#details'), 'https://example.com/rule?q=a%20b#details');
assert.equal(exports.ruleDefinitionLink('dotnet', 'CA2000'), 'https://learn.microsoft.com/dotnet/fundamentals/code-analysis/quality-rules/ca2000');
assert.equal(exports.ruleDefinitionLink('scanner', 'CWE-79'), 'https://cwe.mitre.org/data/definitions/79.html');
assert.equal(exports.ruleDefinitionLink('scanner', 'CVE-2026-12345'), 'https://nvd.nist.gov/vuln/detail/CVE-2026-12345');
assert.equal(exports.ruleDefinitionLink('unknown', 'custom-rule'), null);
assert.equal(exports.repositoryCommitLink('azure-devops', 'https://dev.azure.com/up-group/project/_git/repo', 'abc1234'), 'https://dev.azure.com/up-group/project/_git/repo/commit/abc1234');
assert.equal(exports.repositoryCommitLink('azure-devops', 'https://up-group@dev.azure.com/up-group/project/_git/repo', 'abc1234'), 'https://dev.azure.com/up-group/project/_git/repo/commit/abc1234');
assert.equal(exports.repositoryBranchLink('azure-devops', 'https://dev.azure.com/up-group/project/_git/repo', 'feature/a b'), 'https://dev.azure.com/up-group/project/_git/repo?version=GBfeature%2Fa+b');
assert.equal(exports.repositoryPullRequestLink('azure-devops', 'https://dev.azure.com/up-group/project/_git/repo', '42'), 'https://dev.azure.com/up-group/project/_git/repo/pullrequest/42');
assert.equal(exports.repositoryCommitLink('github', 'https://github.com/up/repo.git', 'abcdef1'), 'https://github.com/up/repo/commit/abcdef1');
assert.equal(exports.repositoryBranchLink('github', 'https://github.com/up/repo.git', 'feature/link'), 'https://github.com/up/repo/tree/feature/link');
for (const unsafe of ['javascript:alert(1)', 'https://user:secret@example.com/repo']) assert.equal(exports.repositoryCommitLink('azure-devops', unsafe, 'abcdef1'), null);
assert.equal(exports.repositoryCommitLink('azure-devops', 'https://user:secret@dev.azure.com/up/p/_git/r', 'abcdef1'), null);
assert.equal(exports.repositoryCommitLink('azure-devops', 'https://user@example.com/up/p/_git/r', 'abcdef1'), null);
assert.equal(exports.repositoryCommitLink('other', 'https://example.com/repo', 'abcdef1'), null);
assert.equal(exports.repositoryPullRequestLink('azure-devops', 'https://dev.azure.com/up/p/_git/r', '../42'), null);
const nativeRequire = createRequire(import.meta.url);
function load(relativePath) {
  const exports = {};
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports,
    require: (id) => (id === '../metric-display' ? load('./metric-display.ts') : nativeRequire(id)),
  });
  return exports;
}
const AnalysisEvidence = load('./components/AnalysisEvidence.tsx').default;
const markup = renderToStaticMarkup(
  createElement(AnalysisEvidence, {
    analysis: {
      measurements: {},
      gate_snapshot: {
        conditions: [
          {
            metric: 'coverage',
            scope: 'new_code',
            operator: '>=',
            threshold: 80,
            state: 'not_applicable',
            result: 'not_applicable',
            value: null,
            numerator: 0,
            denominator: 0,
            provenance: 'normalized-reports/git-diff/v2',
            baseline_id: 'baseline-123',
            base_sha: 'base123',
            head_sha: 'head456',
            reason: 'no_changed_executable_lines',
          },
        ],
      },
    },
  }),
);
for (const text of ['New Code', 'Not applicable', '0 / 0', 'baseline-123', 'base123', 'head456', 'normalized-reports/git-diff/v2', 'no_changed_executable_lines'])
  assert.ok(markup.includes(text), `Gate evidence renders ${text}`);
assert.ok(!markup.includes('100%'), 'No coverage percentage is invented for non applicable conditions');
console.log('Evidence links checks passed.');
