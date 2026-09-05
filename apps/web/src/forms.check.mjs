import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual handlers without a browser framework or a second implementation.
function handler(name, context, path = name === 'saveNotifChannel' ? './components/Notifications.tsx' : name === 'platformSettings' ? './components/PlatformSettings.tsx' : './components/QualityGates.tsx') {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) expression = node.initializer.getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(expression, `${name} is present`);
  const { outputText } = ts.transpileModule(`(${expression})`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } });
  return vm.runInNewContext(outputText, context);
}

let gate = { name: 'Gate', max_bugs: 3 };
const update = handler('updateGateField', {
  selectedGate: { gate_id: 'g1' },
  gateForm: gate,
  setDraft: (draft) => { gate = draft.form; },
});
update('max_bugs', '');
assert.equal(gate.max_bugs, '', 'Clearing a threshold must not send zero');
update('max_bugs', '0');
assert.equal(gate.max_bugs, 0);
update('name', 'New gate');
assert.equal(gate.name, 'New gate');
const emptyGate = handler('gateForm', { draft: null, selectedGate: null });
assert.equal(emptyGate.name, '', 'An empty gate catalog must render safely');
assert.equal(emptyGate.min_security_score, '');
const draft = { gateId: 'g1', form: { name: 'Edited gate', min_security_score: '' } };
assert.equal(handler('gateForm', { draft, selectedGate: { gate_id: 'g1', name: 'Refetched gate', min_security_score: 85 } }), draft.form, 'Refetch must preserve a modified draft');
assert.equal(handler('gateForm', { draft, selectedGate: { gate_id: 'g2', name: 'Another gate' } }).name, 'Another gate', 'Drafts must not cross gate selections');
const settings = handler('platformSettings', {
  DEFAULT_PLATFORM_SETTINGS: { instance_name: 'Default', retention_keep_days: '90' },
  settingsQuery: { data: { instance_name: 'Refetched name', retention_keep_days: '30' } },
  draft: { instance_name: '' },
});
assert.equal(settings.instance_name, '', 'A settings refetch must preserve an explicitly empty draft field');
assert.equal(settings.retention_keep_days, '30', 'Unedited settings must follow the server');

let requests = 0;
let error = null;
let success = null;
let reset = false;
const context = {
  notifSaving: false,
  notifForm: { name: 'Webhook', channel_type: 'webhook', url: 'https://example.test', on_fail: true, on_pass: false },
  Error,
  channelMutation: { reset: () => {} },
  saveMutation: { mutateAsync: async () => { requests++; throw new Error('Channel creation failed (500).'); } },
  setNotifFormError: (value) => {
    error = value;
  },
  setNotifMessage: (value) => {
    success = value;
  },
  setNotifForm: () => {
    reset = true;
  },
  setShowNotifForm: () => {},
  loadNotifChannels: () => {
    throw new Error('must not reload after failure');
  },
  normalizeErrorMessage: (value) => value.message,
};
await handler('saveNotifChannel', context)();
assert.equal(requests, 1);
assert.match(error, /500/);
assert.equal(success, null);
assert.equal(reset, false, 'Keep the draft after failure');
await handler('saveNotifChannel', { ...context, notifSaving: true })();
assert.equal(requests, 1, 'Ignore duplicate submission while pending');
console.log('Form handler checks passed.');

const invalidations = [];
const devOps = handler('mutation', {
  useMutation: options => options,
  queryClient: { invalidateQueries: async options => { invalidations.push(options.queryKey.join('/')); } },
}, './components/DevOpsIntegrations.tsx');
await devOps.onSettled(undefined, new Error('403'), { kind: 'save' });
await devOps.onSettled(undefined, new Error('500'), { kind: 'delete' });
assert.equal(invalidations.length, 0, 'Failed configuration writes must not invalidate as successes');
await devOps.onSettled(undefined, new Error('400'), { kind: 'test' });
assert.deepEqual(invalidations, ['devops'], 'A failed connection test persists last_error and requires a refresh');
await devOps.onSettled(undefined, null, { kind: 'save' });
assert.deepEqual(invalidations, ['devops', 'devops']);
console.log('DevOps mutation checks passed.');
