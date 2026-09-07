import InfoHint from './InfoHint';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson, apiPage } from '../api';
import { repositoryCommitLink } from '../evidence-links';

type Comparison = {
  state: string;
  reason?: string;
  new_count?: number;
  persistent_count?: number;
  resolved_count?: number;
  indeterminate_count?: number;
  coverage?: number | null;
  baseline_id?: string;
  base_sha?: string;
  head_sha?: string;
  covered_lines?: number;
  executable_lines?: number;
};
type Component = {
  id: number;
  name: string;
  version: string | null;
  purl: string | null;
  relationship: string;
  licenses: string[];
  license_decision: string;
  source: string;
  observed_at: string;
  vulnerabilities: unknown[];
};
const API = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api');

export function NewCode({ analysisId, token, repoProvider = 'other', repoUrl }: { analysisId: string; token?: string; repoProvider?: 'github' | 'azure-devops' | 'other'; repoUrl?: string }) {
  const query = useQuery({
    queryKey: ['comparison', analysisId],
    enabled: !!analysisId,
    queryFn: ({ signal }) => apiJson<Comparison>(`${API}/v1/insights/analyses/${encodeURIComponent(analysisId)}/comparison`, token, { signal }),
  });
  const baseUrl = repositoryCommitLink(repoProvider, repoUrl, query.data?.base_sha);
  const headUrl = repositoryCommitLink(repoProvider, repoUrl, query.data?.head_sha);
  return (
    <section className="panel comparison-panel">
      <h2>
        New Code <InfoHint>Git comparison between the selected analysis and its frozen target.</InfoHint>
      </h2>
      {!analysisId ? (
        <p role="status">Select an analysis.</p>
      ) : query.isLoading ? (
        <p role="status">Loading comparison…</p>
      ) : query.error ? (
        <p role="alert">{query.error.message}</p>
      ) : query.data?.state !== 'available' ? (
        <p role="status">Not available: {query.data?.reason ?? 'comparison not measured'}.</p>
      ) : (
        <>
          <p className="scope-note">
            Baseline: <code>{query.data.baseline_id ?? 'Not available'}</code>
            <br />
            {baseUrl ? <a className="repository-reference" href={baseUrl} target="_blank" rel="noreferrer"><code>{query.data.base_sha}</code> ↗</a> : <code>{query.data.base_sha ?? 'Not available'}</code>}
            {' → '}
            {headUrl ? <a className="repository-reference" href={headUrl} target="_blank" rel="noreferrer"><code>{query.data.head_sha}</code> ↗</a> : <code>{query.data.head_sha ?? 'Not available'}</code>}
          </p>
          <dl className="metric-grid">
            {(
              [
                ['New', query.data.new_count],
                ['Persistent', query.data.persistent_count],
                ['Resolved', query.data.resolved_count],
                ['Indeterminate', query.data.indeterminate_count],
                ['Changed-line coverage (%)', query.data.coverage],
              ] as const
            ).map(([label, value]) => (
              <div className="metric-card" key={label}>
                <dt>{label}</dt>
                <dd>{value ?? 'Not available'}</dd>
              </div>
            ))}
          </dl>
          <p>
            {query.data.covered_lines ?? 'Not available'} covered lines / {query.data.executable_lines ?? 'Not available'} changed executable lines in the received data.{' '}
            {query.data.executable_lines === 0 && 'No changed lines does not prove that a coverage report was provided; check the condition status in the gate evidence.'}
          </p>
        </>
      )}
    </section>
  );
}

export default function IngestionDetails({ project, analysisId, token }: { project: string; analysisId: string; token?: string }) {
  const [page, setPage] = useState({ analysis: '', cursor: '' });
  const cursor = page.analysis === analysisId ? page.cursor : '';
  const [importPage, setImportPage] = useState({ project: '', cursor: '' });
  const importCursor = importPage.project === project ? importPage.cursor : '';
  const [importSelection, setImportSelection] = useState({ project: '', id: '' });
  const selectedImport = importSelection.project === project ? importSelection.id : '';
  const receipt = useQuery({
    queryKey: ['ingestion', selectedImport],
    enabled: !!selectedImport,
    queryFn: ({ signal }) =>
      apiJson<{ reports: { report_id: string; state: string; size_bytes: number; error: string }[] }>(`${API}/v1/ingestions/${encodeURIComponent(selectedImport)}`, token, { signal }),
  });
  const components = useQuery({
    queryKey: ['components', analysisId, cursor],
    enabled: !!analysisId,
    queryFn: ({ signal }) => apiPage<Component>(`${API}/v1/insights/analyses/${encodeURIComponent(analysisId)}/components?cursor=${encodeURIComponent(cursor)}`, token, { signal }),
  });
  const ingestions = useQuery({
    queryKey: ['ingestions', project, importCursor],
    enabled: !!project,
    queryFn: ({ signal }) =>
      apiPage<{ ingestion_id: string; revision: number; state: string; technical_state: string; quality_gate: string; error?: string }>(
        `${API}/v1/ingestions?project_key=${encodeURIComponent(project)}&cursor=${encodeURIComponent(importCursor)}`,
        token,
        { signal },
      ),
  });
  return (
    <section className="panel ingestion-details">
      <h2>
        Reports and components <InfoHint>Project imports, 50 per page. Quality verdict and technical status are distinct.</InfoHint>
      </h2>
      <button
        type="button"
        onClick={() => {
          void ingestions.refetch();
          void components.refetch();
        }}
      >
        Refresh imports
      </button>
      {ingestions.isLoading && <p role="status">Loading imports…</p>}
      {ingestions.error && <p role="alert">{ingestions.error.message}</p>}
      {(ingestions.data?.items ?? []).map((item) => (
        <p key={item.ingestion_id}>
          <button type="button" aria-pressed={selectedImport === item.ingestion_id} onClick={() => setImportSelection({ project, id: item.ingestion_id })}>
            {item.ingestion_id}
          </button>{' '}
          · revision {item.revision} · {item.state} · technical: {item.technical_state} · quality: {item.quality_gate}
          {item.error && ` · ${item.error}`}
        </p>
      ))}
      <div className="action-row">
        {importCursor && (
          <button type="button" onClick={() => setImportPage({ project, cursor: '' })}>
            First page
          </button>
        )}
        {ingestions.data?.next && (
          <button type="button" onClick={() => setImportPage({ project, cursor: ingestions.data!.next! })}>
            Next
          </button>
        )}
      </div>
      {receipt.isLoading && <p role="status">Loading receipt…</p>}
      {receipt.error && <p role="alert">{receipt.error.message}</p>}
      {receipt.data && (
        <div>
          <h3>Receipt reports</h3>
          <p>
            {receipt.data.reports.filter((report) => report.state === 'received').length} received / {receipt.data.reports.length} declared
          </p>
          {receipt.data.reports.map((report) => (
            <p key={report.report_id}>
              <code>{report.report_id}</code> · {report.state} · {report.size_bytes} bytes {report.error}
            </p>
          ))}
        </div>
      )}
      <h3>
        Selected analysis SBOM inventory <InfoHint>CVEs come only from reports. An empty list does not prove that there are no vulnerabilities.</InfoHint>
      </h3>
      {components.isLoading ? (
        <p role="status">Loading components…</p>
      ) : components.error ? (
        <p role="alert">{components.error.message}</p>
      ) : !components.data?.items.length ? (
        <p role="status">No components were provided for this analysis.</p>
      ) : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="SBOM components">
          <table>
            <thead>
              <tr>
                <th>Component</th>
                <th>Relationship</th>
                <th>Licenses</th>
                <th>Decision</th>
                <th>Provenance</th>
              </tr>
            </thead>
            <tbody>
              {components.data.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.name} {item.version ?? 'unknown version'}
                    <br />
                    <code>{item.purl}</code>
                  </td>
                  <td>{item.relationship}</td>
                  <td>{item.licenses.join(', ') || 'Not available'}</td>
                  <td>{item.license_decision}</td>
                  <td>
                    {item.source}
                    <br />
                    {new Date(item.observed_at).toLocaleString()}
                    <br />
                    {item.vulnerabilities.length} CVE references received
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="action-row">
        {cursor && (
          <button type="button" onClick={() => setPage({ analysis: analysisId, cursor: '' })}>
            First page
          </button>
        )}
        {components.data?.next && (
          <button type="button" onClick={() => setPage({ analysis: analysisId, cursor: components.data!.next! })}>
            Next
          </button>
        )}
      </div>
    </section>
  );
}
