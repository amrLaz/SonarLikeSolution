/**
 * Vulnerabilities & IOCs Tab Component
 * Displays CVEs, IOCs, and vulnerability statistics for an analysis
 */
import { useEffect, useState, useMemo } from 'react';
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
  cvss_score?: number;
  file_path?: string;
  line?: number | null;
  end_line?: number | null;
  source_url?: string | null;
  kev?: boolean;
  vulnerability?: {
    cve_id: string;
    cvss_v3_score: number;
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
    risk_level: iocData.risk_level || 'low',
    value: iocData.ioc_value || iocData.value,
    file_path: iocData.file_path,
    line_number: iocData.line_number,
    detected_at: iocData.detected_at || apiIOC.created_at,
    details: iocData.details,
  };
}

interface VulnerabilityData {
  analysis_id: string;
  total_vulnerabilities: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  kev_count?: number;
  vulnerabilities: CVE[];
  iocs: IOC[];
  last_scan_date?: string;
}

type TabType = 'vulnerabilities' | 'iocs';
type VulnSeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';
type IOCRiskFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';
type IOCTypeFilter = 'all' | 'ip' | 'domain' | 'hash' | 'url' | 'string';

export default function VulnerabilitiesTab({ analysisId }: { analysisId: string }) {
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

  const requestAiFix = async (vuln: CVE) => {
    const key = vuln.id;
    if (aiFixLoading.has(key)) return;
    setAiFixLoading(prev => new Set(prev).add(key));
    try {
      const resp = await fetch(`${API_BASE}/v1/analyses/${analysisId}/ai-fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        setAiFixResults(prev => new Map(prev).set(key, `Erreur : ${err.detail ?? resp.status}`));
      } else {
        const data = await resp.json();
        setAiFixResults(prev => new Map(prev).set(key, data.suggestion));
      }
      setAiFixOpen(prev => new Set(prev).add(key));
    } catch (e) {
      setAiFixResults(prev => new Map(prev).set(key, 'Impossible de contacter le service IA.'));
      setAiFixOpen(prev => new Set(prev).add(key));
    } finally {
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
    const fetchVulnerabilities = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE}/v1/analyses/${analysisId}/vulnerabilities`);
        if (!response.ok) throw new Error('Failed to fetch vulnerabilities');
        const data = await response.json();
        // Transform IOCs from API format to component format
        const transformedIOCs = (data.iocs || []).map(transformIOC);
        setVulnData({
          ...data,
          iocs: transformedIOCs,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchVulnerabilities();
  }, [analysisId]);

  // Filter CVEs by severity
  const filteredVulnerabilities = useMemo(() => {
    if (!vulnData) return [];
    if (vulnSeverityFilter === 'all') return vulnData.vulnerabilities;
    return vulnData.vulnerabilities.filter((v) => {
      const severity = (v.vulnerability?.cvss_v3_severity || '').toLowerCase();
      return severity.includes(vulnSeverityFilter) || severity.startsWith(vulnSeverityFilter);
    });
  }, [vulnData, vulnSeverityFilter]);

  // Filter IOCs by risk level and type
  const filteredIOCs = useMemo(() => {
    if (!vulnData) return [];
    return vulnData.iocs.filter((ioc) => {
      const riskMatch = iocRiskFilter === 'all' || ioc.risk_level.toLowerCase() === iocRiskFilter;
      const typeMatch = iocTypeFilter === 'all' || ioc.ioc_type.toLowerCase() === iocTypeFilter;
      return riskMatch && typeMatch;
    });
  }, [vulnData, iocRiskFilter, iocTypeFilter]);

  // Count IOCs by type
  const iocTypeCounts = useMemo(() => {
    if (!vulnData) return {};
    const counts: Record<string, number> = {};
    vulnData.iocs.forEach((ioc) => {
      counts[ioc.ioc_type] = (counts[ioc.ioc_type] || 0) + 1;
    });
    return counts;
  }, [vulnData]);

  if (loading) return <div className="vuln-loading">Loading vulnerabilities...</div>;
  if (error) return <div className="vuln-error">Error: {error}</div>;
  if (!vulnData) return <div className="vuln-empty">No vulnerability data</div>;

  const totalCount = vulnData.critical_count + vulnData.high_count + vulnData.medium_count + vulnData.low_count;

  const makeStatCard = (
    label: string,
    count: number,
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
        title={isActive ? 'Reset filter' : `Show ${label} only`}
      >
        <div className="stat-number">{count}</div>
        <div className="stat-label">{label}</div>
      </button>
    );
  };

  return (
    <div className="vulnerabilities-screen">
      {/* Summary Stats — clickable to filter */}
      <div className="vuln-stats-grid">
        {makeStatCard('CRITICAL', vulnData.critical_count, 'critical', 'critical')}
        {makeStatCard('HIGH', vulnData.high_count, 'high', 'high')}
        {makeStatCard('MEDIUM', vulnData.medium_count, 'medium', 'medium')}
        {makeStatCard('LOW', vulnData.low_count, 'low', 'low')}
        <button
          type="button"
          className={`stat-card total${activeTab === 'vulnerabilities' && vulnSeverityFilter === 'all' ? ' stat-card--active' : ''}`}
          onClick={() => { setActiveTab('vulnerabilities'); setVulnSeverityFilter('all'); }}
          title="Show all severities"
        >
          <div className="stat-number">{totalCount}</div>
          <div className="stat-label">TOTAL</div>
        </button>
        {(vulnData.kev_count ?? 0) > 0 && (
          <div className="stat-card kev" title="CVEs activement exploitées selon CISA KEV">
            <div className="stat-number">{vulnData.kev_count}</div>
            <div className="stat-label">Exploitées KEV</div>
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="vuln-tabs">
        <button
          type="button"
          className={`tab-button ${activeTab === 'vulnerabilities' ? 'active' : ''}`}
          onClick={() => setActiveTab('vulnerabilities')}
        >
          CVEs & Dependencies ({vulnData.vulnerabilities.length})
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'iocs' ? 'active' : ''}`}
          onClick={() => setActiveTab('iocs')}
        >
          IOCs & Secrets ({vulnData.iocs.length})
        </button>
      </div>

      {/* CVEs Tab */}
      {activeTab === 'vulnerabilities' && (
        <div className="tab-content">
          {vulnData.vulnerabilities.length > 0 ? (
            <>
              <div className="filter-group">
                <label>Filter vulnerabilities:</label>
                <select
                  value={vulnSeverityFilter}
                  onChange={(e) => setVulnSeverityFilter(e.target.value as VulnSeverityFilter)}
                >
                  <option value="all">All severities</option>
                  <option value="critical">Critical only</option>
                  <option value="high">High and above</option>
                  <option value="medium">Medium and above</option>
                  <option value="low">Low and above</option>
                </select>
              </div>

              {filteredVulnerabilities.length > 0 ? (
                <div className="vuln-list">
                  {filteredVulnerabilities.map((vuln) => {
                    const severity = vuln.vulnerability?.cvss_v3_severity || 'UNKNOWN';
                    const severityLower = severity.toLowerCase();
                    const cvssScore = vuln.vulnerability?.cvss_v3_score;
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
                          {cvssScore !== undefined && (
                            <span className="cvss-score">CVSS {cvssScore.toFixed(1)}</span>
                          )}
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
                                  {vuln.source_url.includes('github.com/advisories') || vuln.source_url.includes('github.com/security')
                                    ? 'View Advisory'
                                    : vuln.source_url.includes('dev.azure.com')
                                    ? 'Open in Azure DevOps'
                                    : 'View source'}
                                </a>
                              )}
                            </div>
                          )}

                          {vuln.fix_available && vuln.fixed_version && (
                            <div className="vuln-fix">
                              Fix disponible : mettre à jour vers v{vuln.fixed_version}
                            </div>
                          )}

                          {/* AI Fix */}
                          <div className="ai-fix-section">
                            {aiFixResults.has(vuln.id) ? (
                              <button
                                type="button"
                                className="ai-fix-toggle"
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
                          </div>
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
            <div className="empty-state">No CVE vulnerabilities found</div>
          )}
        </div>
      )}

      {/* IOCs Tab */}
      {activeTab === 'iocs' && (
        <div className="tab-content">
          {vulnData.iocs.length > 0 ? (
            <>
              <div className="filter-group">
                <label>Filter by risk:</label>
                <select
                  value={iocRiskFilter}
                  onChange={(e) => setIocRiskFilter(e.target.value as IOCRiskFilter)}
                >
                  <option value="all">All risk levels</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>

                <label style={{ marginLeft: '1rem' }}>Filter by type:</label>
                <select
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
          ) : (
            <div className="empty-state">
              No IOCs (secrets/credentials/malicious indicators) detected
            </div>
          )}
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
