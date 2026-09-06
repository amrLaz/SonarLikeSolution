import assert from 'node:assert/strict';

const base = new URL(process.env.CODEINSIGHTS_TEST_URL ?? 'http://127.0.0.1:50618');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'Only an isolated local API is permitted');
assert(process.env.CODEINSIGHTS_TEST_TOKEN, 'CODEINSIGHTS_TEST_TOKEN is required');
const headers = { Authorization: `Bearer ${process.env.CODEINSIGHTS_TEST_TOKEN}` };
async function page(path) {
  const response = await fetch(new URL(`/api/v1/${path}`, base), { headers });
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  return { body: await response.json(), next: response.headers.get('X-Next-Cursor'), link: response.headers.get('Link') };
}
for (const path of ['insights/analyses', 'ingestions', 'profiles']) {
  const first = await page(`${path}?limit=1`);
  assert(Array.isArray(first.body));
  assert(first.body.length <= 1);
  if (first.next) {
    assert(first.link.includes('rel="next"'));
    const second = await page(`${path}?limit=1&cursor=${encodeURIComponent(first.next)}`);
    assert(second.body.length <= 1);
    assert.notDeepEqual(second.body, first.body, 'Continuation must advance');
  }
}
const summary = await page('insights/summary?limit=1');
assert(summary.body.projects.length <= 1);
if (summary.next) {
  const next = await page(`insights/summary?limit=1&cursor=${encodeURIComponent(summary.next)}`);
  assert.notEqual(next.body.projects[0]?.project_key, summary.body.projects[0]?.project_key);
}
if (summary.body.projects[0]) {
  const first = await page(`insights/branches?project_key=${encodeURIComponent(summary.body.projects[0].project_key)}&limit=1`);
  assert(first.body.length <= 1);
  if (first.next) {
    const next = await page(`insights/branches?project_key=${encodeURIComponent(summary.body.projects[0].project_key)}&limit=1&cursor=${encodeURIComponent(first.next)}`);
    assert.notEqual(first.body[0].name, next.body[0]?.name);
  }
}
const analyses = await page('insights/analyses?limit=1');
assert(analyses.body.length, 'Seed at least one isolated analysis before running this check');
for (const kind of ['findings', 'components', 'comparison'])
  await page(`insights/analyses/${encodeURIComponent(analyses.body[0].analysis_id)}/${kind}`);
await page('insights/rules?limit=1');
const branchFixture = await page('insights/summary?project_key=check-branches');
if (branchFixture.body.projects.length) {
  assert.equal((await page('profiles/projects/check-branches')).body, null, 'Unassigned profile must return JSON null');
  const project = branchFixture.body.projects[0];
  assert.equal(project.branch_count, 101);
  assert.equal(project.total_count, 101);
  assert.equal(project.branches.length, 0, 'Project summary must not materialize nested branch details');
  assert.equal(project.branches_truncated, true);
  const names = new Set();
  let cursor = '';
  const lengths = [];
  do {
    const current = await page(`insights/branches?project_key=check-branches&cursor=${encodeURIComponent(cursor)}`);
    lengths.push(current.body.length);
    for (const branch of current.body) { assert(!names.has(branch.name)); names.add(branch.name); }
    cursor = current.next ?? '';
  } while (cursor);
  assert.deepEqual(lengths, [50, 50, 1]);
  assert.equal(names.size, 101);
  const selected = await page('insights/branches?project_key=check-branches&branch=refs%2Fheads%2Fcheck-101');
  assert.equal(selected.body[0].name, 'refs/heads/check-101');
  console.log('101-branch fixture: bounded summary, pages 50/50/1, unique names and off-page selection passed.');
}
for (const query of ['limit=101', 'cursor=bad', 'from=bad', 'scope=new-code']) {
  const response = await fetch(new URL(`/api/v1/insights/analyses?${query}`, base), { headers });
  assert.equal(response.status, 422, query);
}
console.log('Insight SQL reads, bounded collections, continuations and invalid inputs passed.');
