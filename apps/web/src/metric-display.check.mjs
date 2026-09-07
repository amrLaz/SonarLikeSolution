import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Use the builder's existing TypeScript compiler so the check also runs on Node 20.
const { outputText } = ts.transpileModule(readFileSync(new URL('./metric-display.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const { analysisGateClass, analysisGateLabel, comparableVersions, completenessLabel, findingCategory, findingCategoryLabel, formatMetric, gateLabel, measurementStateLabel, scopedMetrics, metricPoint } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

const versioned = { profile_id: 'dotnet', profile_version: '1', formula_version: 'formula/1' };
assert.equal(comparableVersions(versioned, { ...versioned }), true);
assert.equal(comparableVersions(versioned, { ...versioned, formula_version: 'formula/2' }), false, 'Formula changes must break trend segments');
assert.equal(comparableVersions(versioned, { ...versioned, profile_id: 'react' }), false);
assert.equal(comparableVersions({}, {}), false, 'Missing versions do not prove comparability');
assert.equal(comparableVersions({ ...versioned, profile_version: '0' }, { ...versioned, profile_version: '0' }), false);

assert.equal(formatMetric(undefined, '%'), 'Not available');
assert.equal(formatMetric(null), 'Not available');
assert.equal(formatMetric(Number.NaN), 'Not available');
assert.equal(formatMetric(0, '%'), '0%');
assert.equal(gateLabel('unknown'), 'Unknown');
assert.equal(gateLabel(undefined), 'Unknown');
assert.equal(gateLabel('pass'), 'Pass');
assert.equal(gateLabel('fail'), 'Fail');
assert.equal(analysisGateLabel('pass', 'complete'), 'Pass');
assert.equal(analysisGateLabel('pass', undefined), 'Unknown');
assert.equal(analysisGateClass('pass', undefined), 'unknown');
assert.equal(measurementStateLabel('measured'), 'Measured');
assert.equal(measurementStateLabel('failed'), 'Measurement failed');
assert.equal(measurementStateLabel(undefined), 'Not measured');
assert.equal(completenessLabel('complete'), 'Complete');
assert.equal(completenessLabel(undefined), 'Not available');
assert.equal(findingCategory('dependency'), 'dependency');
assert.equal(findingCategory('code_smell'), 'code_smell');
assert.equal(findingCategoryLabel('vulnerability'), 'Vulnerability');
assert.equal(findingCategory('dependency_vulnerability'), 'unknown');
assert.equal(findingCategory(undefined), 'unknown');
assert.equal(findingCategoryLabel('ioc'), 'IOC');
assert.deepEqual(scopedMetrics({ coverage: 0 }, 'overall'), { coverage: 0 });
assert.deepEqual(scopedMetrics({ coverage: 95, quality_gate: 'pass' }, 'new-code'), {});
assert.equal(metricPoint(undefined, 1, 3, 100), null);
assert.equal(metricPoint(0, 1, 3, 100).y, 140);
assert.equal(metricPoint(200, 2, 3, 200).y, 10);
console.log('Metric display checks passed.');
