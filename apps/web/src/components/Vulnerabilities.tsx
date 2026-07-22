/**
 * Vulnerabilities & IOCs Tab Component
 * Displays CVEs, IOCs, and vulnerability statistics for an analysis
 */
import { useEffect, useState, useMemo } from 'react';
import './Vulnerabilities.css';

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

  useEffect(() => {
    const fetchVulnerabilities = async () => {
      try {
        setLoading(true);
        const apiBase = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api');
        const response = await fetch(`${apiBase}/v1/analyses/${analysisId}/vulnerabilities`);
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

  return (
    <div className="vulnerabilities-screen">
      {/* Summary Stats */}
      <div className="vuln-stats-grid">
        <div className="stat-card critical">
          <div className="stat-number">{vulnData.critical_count}</div>
          <div className="stat-label">Critical</div>
        </div>
        <div className="stat-card high">
          <div className="stat-number">{vulnData.high_count}</div>
          <div className="stat-label">High</div>
        </div>
        <div className="stat-card medium">
          <div className="stat-number">{vulnData.medium_count}</div>
          <div className="stat-label">Medium</div>
        </div>
        <div className="stat-card low">
          <div className="stat-number">{vulnData.low_count}</div>
          <div className="stat-label">Low</div>
        </div>
        <div className="stat-card total">
          <div className="stat-number">{vulnData.total_vulnerabilities}</div>
          <div className="stat-label">Total</div>
        </div>
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
                      <div key={vuln.id} className="vuln-card">
                        <div className="vuln-header">
                          <span className={`severity-badge ${severityLower}`}>
                            {severity}
                          </span>
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

                          {vuln.vulnerable_versions && vuln.vulnerable_versions !== "unknown" && (
                            <div className="vuln-range">
                              Affected: {vuln.vulnerable_versions}
                            </div>
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
                            </div>
                          )}

                          {vuln.fix_available && vuln.fixed_version && (
                            <div className="vuln-fix">
                              Fix available: Upgrade to v{vuln.fixed_version}
                            </div>
                          )}
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
