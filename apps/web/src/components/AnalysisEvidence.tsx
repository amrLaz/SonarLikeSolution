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

export function MetricGrid({ metrics }: { metrics: AnalysisMetrics }) {
  return <dl className="metric-grid">{METRIC_FIELDS.map(([key, label, unit]) => (
    <div className={`metric-card${typeof metrics[key] === "number" && Number.isFinite(metrics[key]) ? "" : " is-unavailable"}`} key={key}><dt>{label}</dt><dd>{formatMetric(metrics[key], unit)}</dd></div>
  ))}</dl>;
}

export default function AnalysisEvidence({ analysis }: { analysis: AnalysisRecord }) {
  const measurements = Object.entries(analysis.measurements ?? {});
  const conditions = analysis.gate_snapshot?.conditions ?? [];
  const completeness = analysis.completeness ?? "incomplete";
  const technicalState = analysis.technical_state ?? analysis.gate_snapshot?.technical_state ?? "incomplete";
  const technicalStateLabel: Record<TechnicalState, string> = {
    success: "Réussi",
    failed: "Échec",
    incomplete: "Incomplet"
  };

  return (
    <section className="analysis-evidence" aria-label="Mesures et verdict reproductible">
      <div className="analysis-evidence-heading">
        <h4>Preuves de calcul</h4>
        <span className={`status-pill completeness-${completeness}`}>Complétude : {completenessLabel(completeness)}</span>
        <span className={`status-pill technical-${technicalState}`}>État technique : {technicalStateLabel[technicalState] ?? technicalState}</span>
      </div>
      <p className="scope-note">
        Profil <code>{analysis.profile_id ?? "Non disponible"}</code> · version <code>{analysis.profile_version ?? "Non disponible"}</code> · formule{" "}
        <code>{analysis.formula_version ?? "Non disponible"}</code>
      </p>

      {measurements.length > 0 ? (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="État des mesures">
          <table>
            <caption>Mesures reçues pour cette analyse</caption>
            <thead>
              <tr>
                <th>Mesure</th>
                <th>État</th>
                <th>Valeur</th>
                <th>Outil</th>
              </tr>
            </thead>
            <tbody>
              {measurements.map(([dimension, measurement]) => (
                <tr key={dimension}>
                  <th scope="row"><code>{dimension}</code></th>
                  <td><span className={`status-pill measurement-${measurement.state}`}>{measurementStateLabel(measurement.state)}</span></td>
                  <td>{measurement.state === "measured" ? formatMetric(analysis.gate_snapshot?.metrics?.[dimension] ?? measurement.value) : "Non disponible"}</td>
                  <td>
                    {measurement.tool ? (
                      <><code>{measurement.tool}</code>{measurement.tool_version ? ` ${measurement.tool_version}` : ""}</>
                    ) : "Non disponible"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="feedback">Cette analyse historique ne fournit pas l’état détaillé des mesures.</p>
      )}

      {conditions.length > 0 ? (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Conditions du Quality Gate">
          <table>
            <caption>{analysis.gate_snapshot?.gate_name ?? "Quality Gate"} — instantané appliqué</caption>
            <thead>
              <tr>
                <th>Mesure</th>
                <th>Condition</th>
                <th>Valeur</th>
                <th>Provenance</th>
                <th>Résultat</th>
              </tr>
            </thead>
            <tbody>
              {conditions.map((condition, index) => (
                <tr key={`${condition.metric}:${index}`}>
                  <th scope="row"><code>{condition.metric}</code></th>
                  <td><code>{condition.operator} {condition.threshold}</code></td>
                  <td>{condition.state === "measured" ? formatMetric(condition.value) : measurementStateLabel(condition.state)}</td>
                  <td>
                    {condition.tool ? (
                      <><code>{condition.tool}</code>{condition.tool_version ? ` ${condition.tool_version}` : ""}</>
                    ) : "Non disponible"}
                  </td>
                  <td><span className={`status-pill ${condition.result}`}>{gateLabel(condition.result)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="feedback">Aucun instantané structuré du Quality Gate n’est disponible pour cette analyse.</p>
      )}

      {!!analysis.tool_executions?.length && (
        <p className="scope-note">
          Outils :{" "}
          {analysis.tool_executions
            .map((execution) => `${execution.tool}${execution.version ? ` ${execution.version}` : ""} (${execution.status}${execution.error_code ? `, ${execution.error_code}` : ""})`)
            .join(" · ")}
        </p>
      )}
    </section>
  );
}



