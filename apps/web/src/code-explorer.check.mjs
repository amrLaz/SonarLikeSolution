import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as query from '@tanstack/react-query';

const nativeRequire = createRequire(import.meta.url);
// Normalize cross-VM plain objects so TanStack uses the same cache hashing as the browser realm.
const queryInRealm = { ...query, useQuery: options => query.useQuery({ ...options, queryKey: JSON.parse(JSON.stringify(options.queryKey)) }) };
function load(path) {
  const exports = {};
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, URL, URLSearchParams, require: id => id === '@tanstack/react-query' ? queryInRealm : id === '../api' ? {} : id === './CodeQuality' ? { default: () => null } : id === '../evidence-links' ? load('./evidence-links.ts') : nativeRequire(id),
  });
  return exports;
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
client.setQueryData(['code-files', 'analysis', { prefix: '', cursor: '' }], { data: {
  commit_sha: 'abc123', inventory_state: 'reported_files_only', files: [
    { path: 'zero.cs', kind: 'source', source_url: 'https://example.org/source', finding_count: 0, executable_lines: 1, covered_lines: 0 },
    { path: 'missing.cs', kind: 'test', source_url: null, finding_count: 0, executable_lines: null, covered_lines: null },
  ],
}, next: 'next-page' });
const render = (component, props) => renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(component, props)));
const files = render(load('./components/CodeExplorer.tsx').default, { api: '/api', analysisId: 'analysis' });
for (const value of ['Inventaire Git absent', '0 / 1', 'Non mesurée', 'Fichiers suivants', 'abc123', 'zero.cs', 'missing.cs', 'https://example.org/source']) assert.ok(files.includes(value), `Explorer shows ${value}`);
client.setQueryData(['code-scope', 'project'], { definition: null, version: null });
client.setQueryData(['code-scope-versions', 'project', ''], { items: [], next: null });
client.setQueryData(['code-scope-branches', 'project', ''], { items: [{ branch: 'main', archived: true, is_main: true }], next: null });
const scope = render(load('./components/CodeScopes.tsx').default, { api: '/api', project: 'project', admin: false });
assert.ok(scope.includes('archivée') && scope.includes('Aucun périmètre versionné affecté'));
assert.ok(!scope.includes('Publier un périmètre') && !scope.includes('Désarchiver'), 'Readers have no write controls');
client.clear();
console.log('Code explorer and scope rendering checks passed.');
