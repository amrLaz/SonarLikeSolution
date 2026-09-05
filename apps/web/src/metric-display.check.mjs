import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Use the builder's existing TypeScript compiler so the check also runs on Node 20.
const { outputText } = ts.transpileModule(readFileSync(new URL('./metric-display.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const { analysisGateClass, analysisGateLabel, completenessLabel, findingCategory, findingCategoryLabel, formatMetric, gateLabel, measurementStateLabel, scopedMetrics, metricPoint } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

assert.equal(formatMetric(undefined, '%'), 'Non disponible');
assert.equal(formatMetric(null), 'Non disponible');
assert.equal(formatMetric(Number.NaN), 'Non disponible');
assert.equal(formatMetric(0, '%'), '0%');
assert.equal(gateLabel('unknown'), 'Unknown');
assert.equal(gateLabel(undefined), 'Unknown');
assert.equal(gateLabel('pass'), 'Pass');
assert.equal(gateLabel('fail'), 'Fail');
assert.equal(analysisGateLabel('pass', 'complete'), 'Pass');
assert.equal(analysisGateLabel('pass', 'legacy_unverified'), 'Pass · historique non vérifié');
assert.equal(analysisGateClass('pass', undefined), 'unknown');
assert.equal(measurementStateLabel('measured'), 'Mesurée');
assert.equal(measurementStateLabel('failed'), 'Échec de mesure');
assert.equal(measurementStateLabel(undefined), 'Non mesurée');
assert.equal(completenessLabel('complete'), 'Complète');
assert.equal(completenessLabel('legacy_unverified'), 'Historique non vérifié');
assert.equal(findingCategory('dependency'), 'dependency');
assert.equal(findingCategory('dependency_vulnerability'), 'unknown');
assert.equal(findingCategory(undefined), 'unknown');
assert.equal(findingCategoryLabel('ioc'), 'IOC');
assert.deepEqual(scopedMetrics({ coverage: 0 }, 'overall'), { coverage: 0 });
assert.deepEqual(scopedMetrics({ coverage: 95, quality_gate: 'pass' }, 'new-code'), {});
assert.equal(metricPoint(undefined, 1, 3, 100), null);
assert.equal(metricPoint(0, 1, 3, 100).y, 140);
assert.equal(metricPoint(200, 2, 3, 200).y, 10);
console.log('Metric display checks passed.');
