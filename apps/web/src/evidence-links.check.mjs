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
const nativeRequire = createRequire(import.meta.url);
function load(relativePath) {
  const exports = {};
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require: id => id === '../metric-display' ? load('./metric-display.ts') : nativeRequire(id),
  });
  return exports;
}
const AnalysisEvidence = load('./components/AnalysisEvidence.tsx').default;
const markup = renderToStaticMarkup(createElement(AnalysisEvidence, { analysis: {
  measurements: {}, gate_snapshot: { conditions: [{ metric: 'coverage', scope: 'new_code', operator: '>=', threshold: 80,
    state: 'not_applicable', result: 'not_applicable', value: null, numerator: 0, denominator: 0,
    provenance: 'normalized-reports/git-diff/v2', baseline_id: 'baseline-123', base_sha: 'base123', head_sha: 'head456', reason: 'no_changed_executable_lines' }] },
} }));
for (const text of ['Nouveau code', 'Non applicable', '0 / 0', 'baseline-123', 'base123', 'head456', 'normalized-reports/git-diff/v2', 'no_changed_executable_lines']) assert.ok(markup.includes(text), `Gate evidence renders ${text}`);
assert.ok(!markup.includes('100%'), 'No coverage percentage is invented for non applicable conditions');
console.log('Evidence links checks passed.');
