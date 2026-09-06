import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./navigation-state.ts', import.meta.url), 'utf8').replace(/^import type .*;$/gm, '');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(output, { exports, URLSearchParams });
const parsed = exports.parseWorkspaceUrl('?tab=rules&project=p&rule_status=disabled&severity=high&mine=true&unknown=x');
assert.equal(parsed.tab, 'rules'); assert.equal(parsed.project, 'p'); assert.equal(parsed.rules.status, 'disabled'); assert.equal(parsed.issues.severity, 'high'); assert.equal(parsed.issues.mine, true);
assert.equal(exports.parseWorkspaceUrl('?tab=nope&severity=nope').tab, 'projects'); assert.equal(exports.parseWorkspaceUrl('?tab=nope&severity=nope').issues.severity, 'all');
const serialized = exports.workspaceSearch(parsed);
assert.match(serialized, /tab=rules/); assert.match(serialized, /rule_status=disabled/); assert.doesNotMatch(serialized, /unknown=/); assert.equal(exports.workspaceSearch(exports.parseWorkspaceUrl('')), '');
const appSource = fs.readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
assert.match(appSource, /if \(!initialUrlHasTab\) setActiveTab\('issues'\)/, 'An explicit tab must win over legacy analysis deep-link routing');
console.log('Navigation URL state checks passed.');
