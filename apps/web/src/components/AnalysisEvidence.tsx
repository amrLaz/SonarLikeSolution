import type { AnalysisMetrics, AnalysisRecord, TechnicalState } from '../types';
import { completenessLabel, formatMetric, measurementStateLabel, gateLabel } from '../metric-display';

export const METRIC_FIELDS = [
  ["security_score", "Security", "/100"],
  ["maintainability_score", "Maintainability", "/100"],
  ["reliability_score", "Reliability", "/100"],
  ["coverage", "Coverage", "%"],
  ["duplication", "Duplications", "%"],
  ["vulnerabilities", "Vulnerabilities", ""],
  ["security_hotspots", "Hotspots", ""],
  ["code_smells", "Code Smells", ""],
  ["bugs", "Bugs", ""],
  ["dependency_vulnerabilities", "SCA Dep. Vulns", ""]
] as const;

export type MetricKey = (typeof METRIC_FIELDS)[number][0];

export function MetricGrid({ metrics, onMetricClick }: { metrics: AnalysisMetrics; onMetricClick?: (metric: MetricKey) => void }) {
  return <dl className="metric-grid">{METRIC_FIELDS.map(([key, label, unit]) => (
    <div className={`metric-card${typeof metrics[key] === "number" && Number.isFinite(metrics[key]) ? "" : " is-unavailable"}`} key={key}>
      <dt>{label}</dt>
      <dd>{formatMetric(metrics[key], unit)}</dd>
      {onMetricClick && <button type="button" className="metric-card-link" onClick={() => onMetricClick(key)} aria-label={`View issues related to ${label}`} />}
    </div>
  ))}</dl>;
}

export default function AnalysisEvidence({ analysis }: { analysis: AnalysisRecord }) {
  const measurements = Object.entries(analysis.measurements ?? {});
  const conditions = analysis.gate_snapshot?.conditions ?? [];
  const review = analysis.gate_snapshot?.security_review;
  const configuration = analysis.gate_snapshot?.configuration;
  const remediation = analysis.gate_snapshot?.remediation;
  const completeness = analysis.completeness ?? "incomplete";
  const technicalState = analysis.technical_state ?? analysis.gate_snapshot?.technical_state ?? "incomplete";
  const technicalStateLabel: Record<TechnicalState, string> = {
    success: "Successful",
    failed: "Failed",
    incomplete: "Incomplete"
  };

  return (
    <section className="analysis-evidence" aria-label="Measurements and reproducible verdict">
      <div className="analysis-evidence-heading">
        <h4>Calculation evidence</h4>
        <span className={`status-pill completeness-${completeness}`}>Completeness: {completenessLabel(completeness)}</span>
        <span className={`status-pill technical-${technicalState}`}>Technical status: {technicalStateLabel[technicalState] ?? technicalState}</span>
      </div>
      <p className="scope-note">
        Profile <code>{analysis.profile_id ?? "Not available"}</code> · version <code>{analysis.profile_version ?? "Not available"}</code> · formula{" "}
        <code>{analysis.formula_version ?? "Not available"}</code>
      </p>

      {measurements.length > 0 ? (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Measurement status">
          <table>
            <caption>Measurements received for this analysis</caption>
            <thead>
              <tr>
                <th>Measurement</th>
                <th>Status</th>
                <th>Value</th>
                <th>Tool</th>
              </tr>
            </thead>
            <tbody>
              {measurements.map(([dimension, measurement]) => (
                <tr key={dimension}>
                  <th scope="row"><code>{dimension}</code></th>
                  <td><span className={`status-pill measurement-${measurement.state}`}>{measurementStateLabel(measurement.state)}</span></td>
                  <td>{measurement.state === "measured" ? formatMetric(analysis.gate_snapshot?.metrics?.[dimension] ?? measurement.value) : "Not available"}</td>
                  <td>
                    {measurement.tool ? (
                      <><code>{measurement.tool}</code>{measurement.tool_version ? ` ${measurement.tool_version}` : ""}</>
                    ) : "Not available"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="feedback">This historical analysis does not provide detailed measurement status.</p>
      )}

      {conditions.length > 0 ? (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Quality Gate conditions">
          <table>
            <caption>{analysis.gate_snapshot?.gate_name ?? "Quality Gate"} — applied snapshot</caption>
            <thead>
              <tr>
                <th>Measurement</th>
                <th>Condition</th>
                <th>Scope</th>
                <th>Value</th>
                <th>Provenance</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {conditions.map((condition, index) => (
                <tr key={`${condition.metric}:${index}`}>
                  <th scope="row"><code>{condition.metric}</code></th>
                  <td><code>{condition.operator} {condition.threshold}</code></td>
                  <td>{condition.scope === 'new_code' ? 'New Code' : 'Overall code'}</td>
                  <td>{condition.state === "measured" ? formatMetric(condition.value) : condition.state === 'not_applicable' ? 'Not applicable' : measurementStateLabel(condition.state)}
                    {condition.denominator != null && <div>{formatMetric(condition.numerator)} / {formatMetric(condition.denominator)}</div>}
                    {condition.reason && <div>{condition.reason}</div>}
                  </td>
                  <td>
                    {condition.tool ? (
                      <><code>{condition.tool}</code>{condition.tool_version ? ` ${condition.tool_version}` : ""}</>
                    ) : condition.provenance ?? "Not available"}
                    {condition.scope === 'new_code' && <div>Baseline: <code>{condition.baseline_id ?? 'Not available'}</code><br />
                      <code>{condition.base_sha ?? 'Not available'}</code> → <code>{condition.head_sha ?? 'Not available'}</code>
                    </div>}
                  </td>
                  <td><span className={`status-pill ${condition.result}`}>{condition.result === 'not_applicable' ? 'Not applicable' : gateLabel(condition.result)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="feedback">No structured Quality Gate snapshot is available for this analysis.</p>
      )}

      {review && <section aria-label="Applied security review policy">
        <h4>Security review — publication snapshot</h4>
        <p>{review.scope === 'new_code' ? 'New Code' : 'Overall code'} · {review.state === 'not_applicable' ? 'Not applicable' : review.state === 'measured' ? formatMetric(review.value, '%') : 'Not measured'}
          {' '}({review.numerator} / {review.denominator} hotspots reviewed) · threshold: {review.threshold == null ? 'Informational' : formatMetric(review.threshold, '%')}.
          {' '}{review.result === 'not_applicable' ? 'Not applicable' : gateLabel(review.result)}</p>
        {review.reason && <p className="scope-note">Reason: {review.reason}</p>}
        <p className="scope-note">Decisions frozen on {new Date(review.captured_at).toLocaleString()}. {review.applied_exception_decision_ids.length} approved exception(s) applied. A new review applies to later publications.</p>
        {!!review.decisions?.length && <details><summary>Decisions retained in this verdict</summary><ul>{review.decisions.map(decision => <li key={decision.decision_id}>
          <a href={`?finding_id=${encodeURIComponent(decision.finding_id)}`}>Finding record</a> · decision <code>{decision.decision_id}</code> · version {decision.version} · {decision.state} / {decision.hotspot_review} · {decision.branch}
          <p>{decision.reason ?? 'Review without exception'}{decision.expires_at ? ` · expires ${new Date(decision.expires_at).toLocaleString()}` : ''}</p>
        </li>)}</ul></details>}
      </section>}
      {configuration && <section aria-label="Effective analyzer configuration"><h4>Analyzer configuration</h4>
        <p>{({ matched: 'Configuration matches', missing: 'Configuration evidence missing', drift: 'Configuration drift', not_configured: 'No executable configuration published' } as Record<string, string>)[configuration.state] ?? configuration.state}</p>
        <p className="scope-note">Expected fingerprint: <code>{configuration.expected_hash}</code><br />Effective fingerprint: <code>{configuration.effective_hash}</code>{configuration.reason && <><br />{configuration.reason}</>}</p>
      </section>}
      {remediation && <section aria-label="Documented remediation estimate"><h4>Estimated remediation effort</h4>
        <p>{remediation.estimated_seconds == null ? 'Not measured' : `${formatMetric(remediation.estimated_seconds / 60)} estimated minutes`} · {remediation.modeled_findings} finding(s) with a model, {remediation.unmodeled_findings} without one.</p>
        <p className="scope-note">{remediation.state === 'partial' ? 'Partial estimate. ' : ''}Scope: {remediation.scope === 'global' ? 'overall code' : remediation.scope}. Model <code>{remediation.model}</code>, profile {remediation.profile_id}/{remediation.profile_version}. This duration is the producer's estimate.</p>
        {!!remediation.documentation_sources.length && <ul>{remediation.documentation_sources.map(source => <li key={source}><a href={source} target="_blank" rel="noopener noreferrer">Producer remediation model</a></li>)}</ul>}
      </section>}
      {!!analysis.tool_executions?.length && (
        <p className="scope-note">
          Tools:{" "}
          {analysis.tool_executions
            .map((execution) => `${execution.tool}${execution.version ? ` ${execution.version}` : ""} (${execution.status}${execution.error_code ? `, ${execution.error_code}` : ""})`)
            .join(" · ")}
        </p>
      )}
    </section>
  );
}



