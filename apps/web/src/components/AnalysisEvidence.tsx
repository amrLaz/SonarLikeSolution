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
  const review = analysis.gate_snapshot?.security_review;
  const configuration = analysis.gate_snapshot?.configuration;
  const remediation = analysis.gate_snapshot?.remediation;
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
                <th>Périmètre</th>
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
                  <td>{condition.scope === 'new_code' ? 'Nouveau code' : 'Code global'}</td>
                  <td>{condition.state === "measured" ? formatMetric(condition.value) : condition.state === 'not_applicable' ? 'Non applicable' : measurementStateLabel(condition.state)}
                    {condition.denominator != null && <div>{formatMetric(condition.numerator)} / {formatMetric(condition.denominator)}</div>}
                    {condition.reason && <div>{condition.reason}</div>}
                  </td>
                  <td>
                    {condition.tool ? (
                      <><code>{condition.tool}</code>{condition.tool_version ? ` ${condition.tool_version}` : ""}</>
                    ) : condition.provenance ?? "Non disponible"}
                    {condition.scope === 'new_code' && <div>Baseline : <code>{condition.baseline_id ?? 'Non disponible'}</code><br />
                      <code>{condition.base_sha ?? 'Non disponible'}</code> → <code>{condition.head_sha ?? 'Non disponible'}</code>
                    </div>}
                  </td>
                  <td><span className={`status-pill ${condition.result}`}>{condition.result === 'not_applicable' ? 'Non applicable' : gateLabel(condition.result)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="feedback">Aucun instantané structuré du Quality Gate n’est disponible pour cette analyse.</p>
      )}

      {review && <section aria-label="Politique de revue sécurité appliquée">
        <h4>Revue sécurité — instantané de publication</h4>
        <p>{review.scope === 'new_code' ? 'Nouveau code' : 'Code global'} · {review.state === 'not_applicable' ? 'Non applicable' : review.state === 'measured' ? formatMetric(review.value, '%') : 'Non mesuré'}
          {' '}({review.numerator} / {review.denominator} hotspots revus) · seuil : {review.threshold == null ? 'Informatif' : formatMetric(review.threshold, '%')}.
          {' '}{review.result === 'not_applicable' ? 'Non applicable' : gateLabel(review.result)}</p>
        {review.reason && <p className="scope-note">Motif : {review.reason}</p>}
        <p className="scope-note">Décisions figées le {new Date(review.captured_at).toLocaleString()}. {review.applied_exception_decision_ids.length} exception(s) approuvée(s) appliquée(s). Une nouvelle revue s’applique aux publications suivantes.</p>
        {!!review.decisions?.length && <details><summary>Décisions conservées dans ce verdict</summary><ul>{review.decisions.map(decision => <li key={decision.decision_id}>
          <a href={`?finding_id=${encodeURIComponent(decision.finding_id)}`}>Dossier du finding</a> · décision <code>{decision.decision_id}</code> · version {decision.version} · {decision.state} / {decision.hotspot_review} · {decision.branch}
          <p>{decision.reason ?? 'Revue sans exception'}{decision.expires_at ? ` · expiration ${new Date(decision.expires_at).toLocaleString()}` : ''}</p>
        </li>)}</ul></details>}
      </section>}
      {configuration && <section aria-label="Configuration effective des analyseurs"><h4>Configuration des analyseurs</h4>
        <p>{({ matched: 'Configuration conforme', missing: 'Preuve de configuration absente', drift: 'Dérive de configuration', not_configured: 'Aucune configuration exécutable publiée' } as Record<string, string>)[configuration.state] ?? configuration.state}</p>
        <p className="scope-note">Empreinte attendue : <code>{configuration.expected_hash}</code><br />Empreinte effective : <code>{configuration.effective_hash}</code>{configuration.reason && <><br />{configuration.reason}</>}</p>
      </section>}
      {remediation && <section aria-label="Estimation documentée de remédiation"><h4>Effort de remédiation estimé</h4>
        <p>{remediation.estimated_seconds == null ? 'Non mesuré' : `${formatMetric(remediation.estimated_seconds / 60)} minutes estimées`} · {remediation.modeled_findings} finding(s) avec modèle, {remediation.unmodeled_findings} sans modèle.</p>
        <p className="scope-note">{remediation.state === 'partial' ? 'Estimation partielle. ' : ''}Périmètre : {remediation.scope === 'global' ? 'code global' : remediation.scope}. Modèle <code>{remediation.model}</code>, profil {remediation.profile_id}/{remediation.profile_version}. Cette durée est une estimation du producteur.</p>
        {!!remediation.documentation_sources.length && <ul>{remediation.documentation_sources.map(source => <li key={source}><a href={source} target="_blank" rel="noopener noreferrer">Modèle de remédiation du producteur</a></li>)}</ul>}
      </section>}
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



