import { useState } from 'react';
import InfoHint from './InfoHint';
import { METRIC_FIELDS, type MetricKey } from './AnalysisEvidence';
import { comparableVersions, formatMetric, metricPoint } from '../metric-display';
import type { AnalysisRecord } from '../types';

type MetricGroup = {
  id: 'scores' | 'percentages' | 'findings';
  label: string;
  unit: string;
  maximum?: number;
  metrics: readonly MetricKey[];
};

const GROUPS: readonly MetricGroup[] = [
  { id: 'scores', label: 'Scores', unit: '/100', maximum: 100, metrics: ['security_score', 'maintainability_score', 'reliability_score'] },
  { id: 'percentages', label: 'Percentages', unit: '%', maximum: 100, metrics: ['coverage', 'duplication'] },
  { id: 'findings', label: 'Findings', unit: '', metrics: ['vulnerabilities', 'security_hotspots', 'code_smells', 'bugs', 'dependency_vulnerabilities'] },
];

const LINE_COLORS = ['var(--primary)', 'var(--primary-dark)', 'var(--severity-low)', 'var(--text-primary)', 'var(--text-secondary)'] as const;

export default function MetricsHistory({ history }: { history: AnalysisRecord[] }) {
  const [selectedGroup, setSelectedGroup] = useState<MetricGroup['id']>('scores');
  const analyses = [...history].sort((left, right) => left.created_at.localeCompare(right.created_at));
  if (!analyses.length) return <p className="empty-state">No analysis is available for this branch.</p>;

  const group = GROUPS.find(({ id }) => id === selectedGroup) ?? GROUPS[0];
  const maximum = group.maximum ?? Math.max(1, ...group.metrics.flatMap((key) => analyses.map((analysis) => analysis.metrics[key])).filter(isFiniteNumber));

  return (
    <section className="metrics-history" aria-labelledby="metrics-history-title">
      <h3 id="metrics-history-title">
        Metric trends{' '}
        <InfoHint>Metrics with the same unit and scale are grouped. Missing data or a version change interrupts a line.</InfoHint>
      </h3>
      <div className="metric-history-tabs" role="tablist" aria-label="Metric group">
        {GROUPS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`metric-tab-${id}`}
            aria-controls={`metric-panel-${id}`}
            aria-selected={selectedGroup === id}
            className={selectedGroup === id ? 'active' : ''}
            onClick={() => setSelectedGroup(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="metric-history-panel" role="tabpanel" id={`metric-panel-${group.id}`} aria-labelledby={`metric-tab-${group.id}`}>
        <div className="metric-history-scale" aria-hidden="true">
          <span>{maximum}{group.unit === '%' ? '%' : group.unit}</span>
          <span>0{group.unit === '%' ? '%' : ''}</span>
        </div>
        <svg viewBox="0 0 360 150" className="trend-chart grouped-trend-chart" role="img" aria-label={`Grouped trend: ${group.label}.`}>
          {[10, 75, 140].map((y) => <line key={y} x1="8" y1={y} x2="352" y2={y} className="chart-grid-line" />)}
          {group.metrics.map((key, metricIndex) => {
            const [, label, unit] = METRIC_FIELDS.find(([field]) => field === key)!;
            const points = analyses.map((analysis, index) => metricPoint(analysis.metrics[key], index, analyses.length, maximum));
            const color = LINE_COLORS[metricIndex % LINE_COLORS.length];
            return points.map((point, index) => point && (
              <g key={`${key}:${analyses[index].analysis_id}`}>
                {index > 0 && points[index - 1] && comparableVersions(analyses[index - 1], analyses[index]) && (
                  <line x1={points[index - 1]!.x} y1={points[index - 1]!.y} x2={point.x} y2={point.y} stroke={color} strokeWidth="2" />
                )}
                <circle cx={point.x} cy={point.y} r="3.5" fill={color}>
                  <title>{label} · {formatMetric(analyses[index].metrics[key], unit)} · {new Date(analyses[index].created_at).toLocaleString()}</title>
                </circle>
              </g>
            ));
          })}
        </svg>
        <ul className="metric-history-legend" aria-label="Legend">
          {group.metrics.map((key, index) => {
            const [, label] = METRIC_FIELDS.find(([field]) => field === key)!;
            return <li key={key}><span style={{ backgroundColor: LINE_COLORS[index % LINE_COLORS.length] }} />{label}</li>;
          })}
        </ul>
      </div>
    </section>
  );
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
