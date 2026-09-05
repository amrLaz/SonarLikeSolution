import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./components/Collaboration.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('Collaboration.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const editor = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === 'FindingEditor');
function expression(name, context) {
  let found;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) found = node.initializer.getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(editor);
  assert.ok(found, name);
  const { outputText } = ts.transpileModule(`(${found})`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } });
  return vm.runInNewContext(outputText, context);
}

const finding = { id: 'durable', version: 7, state: 'accepted_risk', hotspot_review: 'not_reviewed', exception_reason: 'Reviewed compensating control', exception_expires_at: '2099-01-01T00:00:00Z' };
const initial = expression('initial', { finding });
assert.equal(initial.reason, finding.exception_reason, 'Existing exception reason must survive assignment changes');
assert.equal(initial.expires_at, finding.exception_expires_at);
const draft = { ...initial, assignee_user_id: 'owner', version: 6 };
assert.equal(expression('form', { draft, initial }), draft, 'Refetch cannot erase an edited draft or update its concurrency version');
assert.equal(expression('conflict', { draft, finding }), true, 'An older draft conflicts with the current finding');

const requests = [];
const context = { save: { isPending: false, mutate: body => requests.push(body) }, conflict: false, directoryReady: true, exception: true, form: { ...initial, assignee_user_id: 'owner', team_id: '' }, Date, Number };
expression('saveReview', context)({ preventDefault() {} });
assert.equal(requests.length, 1);
assert.equal(requests[0].body.version, 7);
assert.equal(requests[0].body.assignee_user_id, 'owner');
assert.equal(requests[0].body.team_id, null);
assert.equal(requests[0].body.reason, finding.exception_reason);
assert.equal(requests[0].body.expires_at, '2099-01-01T00:00:00.000Z');
for (const overrides of [{ conflict: true }, { directoryReady: false }, { save: { ...context.save, isPending: true } }, { form: { ...context.form, expires_at: 'not a date' } }, { form: { ...context.form, expires_at: '2000-01-01' } }]) {
  expression('saveReview', { ...context, ...overrides })({ preventDefault() {} });
}
assert.equal(requests.length, 1, 'Pending, stale, unloaded or invalid review submissions must not be sent');
expression('saveReview', { ...context, exception: false, form: { ...initial, state: 'open', assignee_user_id: '', team_id: '' } })({ preventDefault() {} });
assert.equal(requests[1].body.expires_at, null, 'Reopening removes the exception expiry');
console.log('Collaboration form checks passed.');

const portfolioSource = readFileSync(new URL('./components/Portfolio.tsx', import.meta.url), 'utf8');
const portfolioTree = ts.createSourceFile('Portfolio.tsx', portfolioSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let saveExpression, dateExpression;
function visitPortfolio(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(portfolioTree) === 'save') saveExpression = node.initializer.getText(portfolioTree);
  if (ts.isCallExpression(node) && node.expression.getText(portfolioTree).endsWith('.toLocaleDateString')) dateExpression = node.getText(portfolioTree);
  ts.forEachChild(node, visitPortfolio);
}
visitPortfolio(portfolioTree);
assert.ok(saveExpression); assert.ok(dateExpression);
const saveCode = ts.transpileModule(`(${saveExpression})`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const objectiveRequests = [];
const validObjective = { point: { project_key: 'p', branch: 'main', profile_id: 'dotnet', profile_version: '1', formula_version: '1' }, dimension: 'bugs', target: '0', due: '2026-10-05' };
const mutationFor = objective => vm.runInNewContext(saveCode, { objective, useMutation: value => value, apiBase: '/api', authToken: 'local-test', apiJson: async (url, token, init) => objectiveRequests.push(JSON.parse(init.body)), Date, Number, Error });
await mutationFor(validObjective).mutationFn();
assert.equal(objectiveRequests[0].target, 0, 'An explicitly entered zero is a valid target');
assert.equal(objectiveRequests[0].due_at, '2026-10-05T23:59:59.000Z');
for (const due of ['', 'not-a-date', '2026-02-30']) await assert.rejects(mutationFor({ ...validObjective, due }).mutationFn(), /échéance UTC valide/);
for (const target of ['', '1.5', '-1', 'abc', '2147483648']) await assert.rejects(mutationFor({ ...validObjective, target }).mutationFn(), /cible entière/);
await assert.rejects(mutationFor({ ...validObjective, dimension: 'coverage', target: '101' }).mutationFn(), /cible entière/);
assert.equal(objectiveRequests.length, 1, 'Invalid objectives are rejected before any HTTP call');
process.env.TZ = 'Europe/Paris';
const displayed = vm.runInNewContext(dateExpression, { target: { due_at: objectiveRequests[0].due_at }, Date });
assert.equal(displayed, new Date('2026-10-05T00:00:00Z').toLocaleDateString(undefined, { timeZone: 'UTC' }), 'UTC deadline does not shift to tomorrow in Paris');
console.log('Portfolio objective date and validation checks passed.');
