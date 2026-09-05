import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { QueryClient } from '@tanstack/react-query';

function expression(file, name, context) {
  const source = readFileSync(new URL(`./components/${file}.tsx`, import.meta.url), 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) initializer = node.initializer.getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(initializer, `${file}.${name} is present`);
  const { outputText } = ts.transpileModule(`(${initializer})`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } });
  return vm.runInNewContext(outputText, { useInfiniteQuery: value => value, useMutation: value => value, URLSearchParams, ...context });
}

const signal = new AbortController().signal;
let requested;
const audit = expression('AuditLog', 'auditQuery', {
  auditFilters: { action: 'user.login', actor: 'reader@example.test' }, authToken: 'session-test', API_BASE: '/api',
  apiJson: async (...args) => { requested = args; return { entries: [], total: 0 }; },
});
await audit.queryFn({ signal, pageParam: 50 });
assert.equal(requested[0], '/api/v1/audit-logs?limit=50&offset=50&action=user.login&actor=reader%40example.test');
assert.equal(requested[2].signal, signal);
assert.equal(audit.getNextPageParam({ entries: [1], total: 2 }, [{ entries: [1] }]), 1);
assert.equal(audit.getNextPageParam({ entries: [2], total: 2 }, [{ entries: [1] }, { entries: [2] }]), undefined);
assert.equal(audit.getNextPageParam({ entries: [], total: 99 }, [{ entries: [] }]), undefined);

const client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
let failure = true;
let invalidations = 0;
let feedback = null;
const notifications = expression('Notifications', 'channelMutation', {
  API_BASE: '/api', authToken: 'session-test',
  apiFetch: async () => { if (failure) throw new Error('HTTP 403'); },
  apiJson: async () => { if (failure) throw new Error('HTTP 500'); return { message: 'Test sent.' }; },
  queryClient: { invalidateQueries: async () => { invalidations++; } },
  setNotifMessage: value => { feedback = value; },
});
for (const action of ['delete', 'toggle', 'test']) {
  await assert.rejects(client.getMutationCache().build(client, notifications).execute({ action, id: 'channel-1', enabled: false }), /HTTP/);
  assert.equal(feedback, null, 'Failed actions must not display success');
  assert.equal(invalidations, 0, 'Failed actions must not invalidate as success');
}
failure = false;
await client.getMutationCache().build(client, notifications).execute({ action: 'delete', id: 'channel-1' });
assert.equal(feedback, 'Channel deleted.');
assert.equal(invalidations, 1);

const generation = expression('CiTokens', 'generateMutation', {
  API_BASE: '/api', authToken: 'session-test', platformTokenInput: ' current-test ', platformTokenName: ' CI ', platformTokenTtlDays: 90,
  platformTokenProjectKeys: ['project-1'], CI_TOKEN_SCOPES: ['analysis:read', 'analysis:write', 'integration:write'],
  apiJson: async (...args) => { requested = args; return { token: 'generated-test' }; },
  setPlatformTokenInput: () => {}, invalidateTokens: async () => {},
});
assert.equal(await generation.mutationFn('rotate'), 'generated-test');
assert.equal(requested[2].headers['X-Current-Platform-Token'], 'current-test');
assert.deepEqual(JSON.parse(requested[2].body), {
  token_name: 'CI', ttl_days: 90, require_current_token: true, project_keys: ['project-1'], scopes: ['analysis:read', 'analysis:write', 'integration:write'],
});
assert.equal(generation.gcTime, 0, 'Generated secrets must not survive component removal in an inactive mutation');
assert.equal(generation.mutationKey, undefined);
client.clear();
console.log('Admin query and mutation checks passed.');
