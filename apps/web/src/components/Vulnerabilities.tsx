/**
 * Vulnerabilities & IOCs Tab Component
 * Displays CVEs, IOCs, and vulnerability statistics for an analysis
 */
import { useEffect, useState, useMemo, useRef } from 'react';
import './Vulnerabilities.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api');

interface CVE {
  id: string;
  vulnerability_id: string;
  language: string;
  package_name: string;
  current_version: string;
  vulnerable_versions: string;
  fix_available: boolean;
  fixed_version?: string;
  created_at: string;
  severity?: string;
  cvss_score?: number | null;
  file_path?: string;
  line?: number | null;
  end_line?: number | null;
  source_url?: string | null;
  kev?: boolean;
  category?: 'secret' | 'dependency' | 'code' | 'ioc' | 'unknown';
  tool?: string;
  vulnerability?: {
    cve_id: string;
    cvss_v3_score?: number | null;
    cvss_v3_severity: string;
    description: string;
  };
}

interface IOC {
  id: string;
  ioc_type: string;  // 'ip', 'domain', 'hash', 'url', 'string'
  risk_level: string; // 'critical', 'high', 'medium', 'low'
  value?: string;
  file_path?: string;
  line_number?: number;
  detected_at: string;
  details?: Record<string, unknown>;
}

// Transform API IOC response to component interface
function transformIOC(apiIOC: any): IOC {
  const iocData = apiIOC.ioc || apiIOC;
  return {
    id: apiIOC.id || iocData.id,
    ioc_type: iocData.ioc_type || '',
    risk_level: iocData.risk_level || 'unknown',
    value: iocData.ioc_value || iocData.value,
    file_path: iocData.file_path,
    line_number: iocData.line_number,
    detected_at: iocData.detected_at || apiIOC.created_at,
    details: iocData.details,
  };
}

interface VulnerabilityData {
  analysis_id: string;
  total_vulnerabilities?: number | null;
  critical_count?: number | null;
  high_count?: number | null;
  medium_count?: number | null;
  low_count?: number | null;
  kev_count?: number;
  vulnerabilities: CVE[];
  iocs: IOC[];
  last_scan_date?: string;
}

type TabType = 'vulnerabilities' | 'secrets' | 'iocs';
type VulnSeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';
type IOCRiskFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';
type IOCTypeFilter = 'all' | 'ip' | 'domain' | 'hash' | 'url' | 'string';

type VulnerabilitiesTabProps = {
  analysisId: string;
  projectKey: string;
  branch: string;
  commitSha: string;
  authToken?: string;
  canManage?: boolean;
};

export default function VulnerabilitiesTab({
  analysisId,
  projectKey,
  branch,
  commitSha,
  authToken,
  canManage = false
}: VulnerabilitiesTabProps) {
  const [vulnData, setVulnData] = useState<VulnerabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('vulnerabilities');
  const [vulnSeverityFilter, setVulnSeverityFilter] = useState<VulnSeverityFilter>('all');
  const [iocRiskFilter, setIocRiskFilter] = useState<IOCRiskFilter>('all');
  const [iocTypeFilter, setIocTypeFilter] = useState<IOCTypeFilter>('all');
  const [aiFixLoading, setAiFixLoading] = useState<Set<string>>(new Set());
  const [aiFixResults, setAiFixResults] = useState<Map<string, string>>(new Map());
  const [aiFixOpen, setAiFixOpen] = useState<Set<string>>(new Set());

  const currentAnalysis = useRef(analysisId);
  currentAnalysis.current = analysisId;

  const requestAiFix = async (vuln: CVE) => {
    const key = vuln.id;
    if (aiFixLoading.has(key)) return;
    setAiFixLoading(prev => new Set(prev).add(key));
    try {
      const resp = await fetch(`${API_BASE}/v1/analyses/${analysisId}/ai-fix`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          cve_id: vuln.vulnerability?.cve_id ?? '',
          pkg_name: vuln.package_name ?? '',
          version: vuln.current_version ?? '',
          fixed_version: vuln.fixed_version ?? '',
          description: vuln.vulnerability?.description ?? '',
          language: vuln.language ?? '',
          severity: vuln.severity ?? '',
          rule_id: vuln.vulnerability_id ?? '',
          message: vuln.vulnerability?.description ?? '',
          file_path: vuln.file_path ?? '',
        }),
      });
      if (currentAnalysis.current !== analysisId) return;
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        if (currentAnalysis.current !== analysisId) return;
        setAiFixResults(prev => new Map(prev).set(key, `Erreur : ${err.detail ?? resp.status}`));
      } else {
        const data = await resp.json();
        if (currentAnalysis.current !== analysisId) return;
        setAiFixResults(prev => new Map(prev).set(key, data.suggestion));
      }
      setAiFixOpen(prev => new Set(prev).add(key));
    } catch (e) {
      if (currentAnalysis.current !== analysisId) return;
      setAiFixResults(prev => new Map(prev).set(key, 'Impossible de contacter le service IA.'));
      setAiFixOpen(prev => new Set(prev).add(key));
    } finally {
      if (currentAnalysis.current !== analysisId) return;
      setAiFixLoading(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  };

  const toggleAiFix = (key: string) => {
    setAiFixOpen(prev => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key); else s.add(key);
      return s;
    });
  };

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    setVulnData(null);
    setVulnSeverityFilter('all');
    setIocRiskFilter('all');
    setIocTypeFilter('all');
    setAiFixLoading(new Set());
    setAiFixResults(new Map());
    setAiFixOpen(new Set());
    const fetchVulnerabilities = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE}/v1/analyses/${analysisId}/vulnerabilities`, {
          signal: controller.signal,
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined
        });
        if (!response.ok) throw new Error('Failed to fetch vulnerabilities');
        const data = await response.json();
        if (controller.signal.aborted) return;
        // Transform IOCs from API format to component format
        const transformedIOCs = (data.iocs || []).map(transformIOC);
        setVulnData({
          ...data,
          vulnerabilities: data.vulnerabilities ?? [],
          iocs: transformedIOCs,
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    fetchVulnerabilities();
    return () => controller.abort();
  }, [analysisId, authToken]);

  // Filter CVEs by severity
  const primaryFindings = useMemo(
    () => (vulnData?.vulnerabilities ?? []).filter((finding) => finding.category !== 'secret' && finding.category !== 'ioc'),
    [vulnData]
  );
  const secretFindings = useMemo(
    () => (vulnData?.vulnerabilities ?? []).filter((finding) => finding.category === 'secret'),
    [vulnData]
  );
  const iocFindings = useMemo(
    () => (vulnData?.vulnerabilities ?? []).filter((finding) => finding.category === 'ioc'),
    [vulnData]
  );

  const filteredVulnerabilities = useMemo(() => {
    if (vulnSeverityFilter === 'all') return primaryFindings;
    return primaryFindings.filter((v) => {
      const severity = (v.vulnerability?.cvss_v3_severity || v.severity || '').toLowerCase();
      return severity.includes(vulnSeverityFilter) || severity.startsWith(vulnSeverityFilter);
    });
  }, [primaryFindings, vulnSeverityFilter]);

  // Filter IOCs by risk level and type
  const filteredIOCs = useMemo(() => {
    if (!vulnData) return [];
    return vulnData.iocs.filter((ioc) => {
      const riskMatch = iocRiskFilter === 'all' || ioc.risk_level.toLowerCase() === iocRiskFilter;
      const typeMatch = iocTypeFilter === 'all' || ioc.ioc_type.toLowerCase() === iocTypeFilter;
      return riskMatch && typeMatch;
    });
  }, [vulnData, iocRiskFilter, iocTypeFilter]);

  const vulnerabilityCounts = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0, kev: 0 };
    for (const vulnerability of primaryFindings) {
      const severity = (vulnerability.vulnerability?.cvss_v3_severity || vulnerability.severity || '').toLowerCase();
      if (severity in counts && severity !== 'kev') counts[severity as keyof Omit<typeof counts, 'kev'>] += 1;
      if (vulnerability.kev) counts.kev += 1;
    }
    return counts;
  }, [primaryFindings]);

  if (loading) return <div className="vuln-loading" role="status">Loading vulnerabilities...</div>;
  if (error) return <div className="vuln-error" role="alert">Error: {error}</div>;
  if (!vulnData) return <div className="vuln-empty">No vulnerability data</div>;

  const totalCount = primaryFindings.length;

  const makeStatCard = (
    label: string,
    count: number | null | undefined,
    severity: VulnSeverityFilter,
    colorClass: string,
  ) => {
    const isActive = activeTab === 'vulnerabilities' && vulnSeverityFilter === severity;
    return (
      <button
        type="button"
        className={`stat-card ${colorClass}${isActive ? ' stat-card--active' : ''}`}
        onClick={() => {
          setActiveTab('vulnerabilities');
          setVulnSeverityFilter(isActive ? 'all' : severity);
        }}
        aria-pressed={isActive}
        title={isActive ? 'Reset filter' : `Show ${label} only`}
      >
        <div className="stat-number">{count ?? "Non disponible"}</div>
        <div className="stat-label">{label}</div>
      </button>
    );
  };

  return (
    <div className="vulnerabilities-screen">
      <p className="scope-note">
        Périmètre : <strong>{projectKey}</strong> · <code>{branch}</code> · commit <code>{commitSha || 'Non disponible'}</code>. CVEs, dépendances et IOC transmis pour cette même analyse ; TOTAL compte uniquement les entrées effectivement retournées.
      </p>
      {/* Summary Stats — clickable to filter */}
      <div className="vuln-stats-grid">
        {makeStatCard('CRITICAL', vulnerabilityCounts.critical, 'critical', 'critical')}
        {makeStatCard('HIGH', vulnerabilityCounts.high, 'high', 'high')}
        {makeStatCard('MEDIUM', vulnerabilityCounts.medium, 'medium', 'medium')}
        {makeStatCard('LOW', vulnerabilityCounts.low, 'low', 'low')}
        <button
          type="button"
          className={`stat-card total${activeTab === 'vulnerabilities' && vulnSeverityFilter === 'all' ? ' stat-card--active' : ''}`}
          onClick={() => { setActiveTab('vulnerabilities'); setVulnSeverityFilter('all'); }}
          aria-pressed={activeTab === 'vulnerabilities' && vulnSeverityFilter === 'all'}
          title="Show all severities"
        >
          <div className="stat-number">{totalCount ?? "Non disponible"}</div>
          <div className="stat-label">TOTAL</div>
        </button>
        {vulnerabilityCounts.kev > 0 && (
          <div className="stat-card kev" title="CVEs activement exploitées selon CISA KEV">
            <div className="stat-number">{vulnerabilityCounts.kev}</div>
            <div className="stat-label">Exploitées KEV</div>
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="vuln-tabs">
        <button
          type="button"
          className={`tab-button ${activeTab === 'vulnerabilities' ? 'active' : ''}`}
          aria-pressed={activeTab === 'vulnerabilities'}
          onClick={() => setActiveTab('vulnerabilities')}
        >
          Dépendances & code ({primaryFindings.length})
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'secrets' ? 'active' : ''}`}
          aria-pressed={activeTab === 'secrets'}
          onClick={() => setActiveTab('secrets')}
        >
          Secrets ({secretFindings.length})
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'iocs' ? 'active' : ''}`}
          aria-pressed={activeTab === 'iocs'}
          onClick={() => setActiveTab('iocs')}
        >
          IOCs ({vulnData.iocs.length + iocFindings.length})
        </button>
      </div>

      {/* CVEs Tab */}
      {activeTab === 'vulnerabilities' && (
        <div className="tab-content">
          {primaryFindings.length > 0 ? (
            <>
              <div className="filter-group">
                <label htmlFor="vuln-severity">Filter vulnerabilities:</label>
                <select
                  id="vuln-severity"
                  value={vulnSeverityFilter}
                  onChange={(e) => setVulnSeverityFilter(e.target.value as VulnSeverityFilter)}
                >
                  <option value="all">All severities</option>
                  <option value="critical">Critical only</option>
                  <option value="high">High only</option>
                  <option value="medium">Medium only</option>
                  <option value="low">Low only</option>
                </select>
              </div>

              {filteredVulnerabilities.length > 0 ? (
                <div className="vuln-list">
                  {filteredVulnerabilities.map((vuln) => {
                    const severity = vuln.vulnerability?.cvss_v3_severity || vuln.severity || 'UNKNOWN';
                    const severityLower = severity.toLowerCase();
                    const cvssScore = vuln.vulnerability?.cvss_v3_score ?? vuln.cvss_score;
                    return (
                      <div key={vuln.id} className={`vuln-card${vuln.kev ? ' vuln-card--kev' : ''}`}>
                        <div className="vuln-header">
                          <span className={`severity-badge ${severityLower}`}>
                            {severity}
                          </span>
                          {vuln.kev && (
                            <span className="kev-badge" title="Activement exploitée dans la nature — CISA Known Exploited Vulnerabilities">
                              ⚠ KEV
                            </span>
                          )}
                          <span className="cve-id">{vuln.vulnerability?.cve_id || 'N/A'}</span>
                          <span className="cvss-score">CVSS {cvssScore == null ? "Non disponible" : cvssScore.toFixed(1)}</span>
                        </div>

                        <div className="vuln-body">
                          <div className="vuln-package">
                            <strong>{vuln.package_name && vuln.package_name !== "unknown" ? vuln.package_name : "—"}</strong>
                            {vuln.current_version && vuln.current_version !== "unknown" && (
                              <span className="version">v{vuln.current_version}</span>
                            )}
                          </div>
                          {vuln.language && vuln.language !== "unknown" && (
                            <span className="lang-badge">{vuln.language}</span>
                          )}

                          {vuln.vulnerability?.description && (
                            <p className="vuln-description">
                              {vuln.vulnerability.description}
                            </p>
                          )}

                          {vuln.file_path && (
                            <div className="vuln-location">
                              {vuln.file_path}
                              {vuln.line && <span className="line-number">:{vuln.line}</span>}
                              {vuln.source_url && (
                                <a
                                  href={vuln.source_url}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="vuln-source-link"
                                  style={{ marginLeft: '0.75rem' }}
                                >
                                  Open in Azure DevOps
                                </a>
                              )}
                              {(() => {
                                const cveId = vuln.vulnerability?.cve_id;
                                if (!cveId) return null;
                                const advisoryUrl = cveId.toUpperCase().startsWith('GHSA-')
                                  ? `https://github.com/advisories/${cveId}`
                                  : cveId.toUpperCase().startsWith('CVE-')
                                  ? `https://nvd.nist.gov/vuln/detail/${cveId}`
                                  : null;
                                if (!advisoryUrl) return null;
                                return (
                                  <a
                                    href={advisoryUrl}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="vuln-source-link"
                                    style={{ marginLeft: '0.5rem' }}
                                  >
                                    View Advisory
                                  </a>
                                );
                              })()}
                            </div>
                          )}

                          {vuln.fix_available && vuln.fixed_version && (
                            <div className="vuln-fix">
                              Fix disponible : mettre à jour vers v{vuln.fixed_version}
                            </div>
                          )}

                          {/* AI Fix */}
                          {canManage && <div className="ai-fix-section">
                            {aiFixResults.has(vuln.id) ? (
                              <button
                                type="button"
                                className="ai-fix-toggle"
                                aria-expanded={aiFixOpen.has(vuln.id)}
                                onClick={() => toggleAiFix(vuln.id)}
                              >
                                ✦ Suggestion IA {aiFixOpen.has(vuln.id) ? '▲' : '▼'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className={`ai-fix-btn${aiFixLoading.has(vuln.id) ? ' loading' : ''}`}
                                onClick={() => requestAiFix(vuln)}
                                disabled={aiFixLoading.has(vuln.id)}
                              >
                                {aiFixLoading.has(vuln.id) ? '…' : '✦ Suggestion IA'}
                              </button>
                            )}
                            {aiFixOpen.has(vuln.id) && aiFixResults.has(vuln.id) && (
                              <div className="ai-fix-result">
                                <pre>{aiFixResults.get(vuln.id)}</pre>
                              </div>
                            )}
                          </div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  No vulnerabilities match the current filters
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">No CVE vulnerabilities returned for this analysis</div>
          )}
        </div>
      )}

      {activeTab === 'secrets' && (
        <div className="tab-content">
          {secretFindings.length > 0 ? (
            <div className="vuln-list">
              {secretFindings.map((finding) => (
                <div key={finding.id} className="vuln-card">
                  <div className="vuln-header">
                    <span className={`severity-badge ${(finding.severity ?? 'unknown').toLowerCase()}`}>{finding.severity ?? 'UNKNOWN'}</span>
                    <span className="cve-id">SECRET · {finding.tool ?? 'outil inconnu'}</span>
                  </div>
                  <div className="vuln-body">
                    <p className="vuln-description">{finding.vulnerability?.description ?? finding.vulnerability_id}</p>
                    {finding.file_path && <div className="vuln-location">{finding.file_path}{finding.line ? `:${finding.line}` : ''}</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="empty-state">Aucun secret transmis pour cette analyse</div>}
        </div>
      )}

      {/* IOCs Tab */}
      {activeTab === 'iocs' && (
        <div className="tab-content">
          {iocFindings.length > 0 && (
            <div className="vuln-list">
              {iocFindings.map((finding) => (
                <div key={finding.id} className="vuln-card">
                  <div className="vuln-header">
                    <span className={`severity-badge ${(finding.severity ?? 'unknown').toLowerCase()}`}>{finding.severity ?? 'UNKNOWN'}</span>
                    <span className="cve-id">IOC · {finding.tool ?? 'outil inconnu'}</span>
                  </div>
                  <div className="vuln-body">
                    <p className="vuln-description">{finding.vulnerability?.description ?? finding.vulnerability_id}</p>
                    {finding.file_path && <div className="vuln-location">{finding.file_path}{finding.line ? `:${finding.line}` : ''}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {vulnData.iocs.length > 0 ? (
            <>
              <div className="filter-group">
                <label htmlFor="ioc-risk">Filter by risk:</label>
                <select
                  id="ioc-risk"
                  value={iocRiskFilter}
                  onChange={(e) => setIocRiskFilter(e.target.value as IOCRiskFilter)}
                >
                  <option value="all">All risk levels</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>

                <label htmlFor="ioc-type">Filter by type:</label>
                <select
                  id="ioc-type"
                  value={iocTypeFilter}
                  onChange={(e) => setIocTypeFilter(e.target.value as IOCTypeFilter)}
                >
                  <option value="all">All types</option>
                  <option value="ip">IP Address</option>
                  <option value="domain">Domain</option>
                  <option value="hash">Hash</option>
                  <option value="url">URL</option>
                  <option value="string">String/Credential</option>
                </select>
              </div>

              {filteredIOCs.length > 0 ? (
                <div className="ioc-list">
                  {filteredIOCs.map((ioc) => (
                    <div key={ioc.id} className={`ioc-card risk-${ioc.risk_level.toLowerCase()}`}>
                      <div className="ioc-header">
                        <span className="ioc-type">
                          {ioc.ioc_type.toUpperCase()}
                        </span>
                        <span className={`risk-badge risk-${ioc.risk_level.toLowerCase()}`}>
                          {ioc.risk_level.toUpperCase()}
                        </span>
                        <span className="detection-date">
                          {new Date(ioc.detected_at).toLocaleDateString()}
                        </span>
                      </div>
                      {ioc.value && (
                        <div className="ioc-value" title={ioc.value}>
                          {ioc.value}
                        </div>
                      )}
                      {ioc.file_path && (
                        <div className="ioc-location">
                          {ioc.file_path}
                          {ioc.line_number && (
                            <span className="line-number">:{ioc.line_number}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  No IOCs match the current filters
                </div>
              )}
            </>
          ) : iocFindings.length === 0 ? (
            <div className="empty-state">
              No IOCs returned for this analysis
            </div>
          ) : null}
        </div>
      )}

      {/* Scan Info */}
      {vulnData.last_scan_date && (
        <div className="scan-info">
          Last scanned: {new Date(vulnData.last_scan_date).toLocaleString()}
        </div>
      )}
    </div>
  );
}
