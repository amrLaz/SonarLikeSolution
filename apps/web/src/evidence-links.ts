export function evidenceLink(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function ruleDefinitionLink(tool: string, ruleId: string): string | null {
  const rule = ruleId.trim();
  const upper = rule.toUpperCase();
  if (/^CVE-\d{4}-\d{4,}$/.test(upper)) return `https://nvd.nist.gov/vuln/detail/${upper}`;
  const cwe = /^CWE-(\d+)$/.exec(upper);
  if (cwe) return `https://cwe.mitre.org/data/definitions/${cwe[1]}.html`;
  if (/^CA\d{4}$/.test(upper)) return `https://learn.microsoft.com/dotnet/fundamentals/code-analysis/quality-rules/${upper.toLowerCase()}`;
  if (tool.toLowerCase().includes('eslint') && /^[a-z0-9@/_-]+$/i.test(rule)) return `https://eslint.org/docs/latest/rules/${encodeURIComponent(rule)}`;
  if (/^SA\d{4}$/.test(upper)) return `https://github.com/DotNetAnalyzers/StyleCopAnalyzers/blob/master/documentation/${upper}.md`;
  return null;
}
