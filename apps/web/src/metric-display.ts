export function formatMetric(value: number | null | undefined, unit = ''): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}${unit}` : 'Non disponible';
}

export function comparableVersions(previous: { profile_id?: string | null; profile_version?: string | null; formula_version?: string | null }, current: typeof previous): boolean {
  return (['profile_id', 'profile_version', 'formula_version'] as const).every(key => !!current[key] && current[key] !== '0' && current[key] !== 'unknown' && current[key] === previous[key]);
}

export function gateLabel(value: string | null | undefined): string {
  return value === 'pass' ? 'Pass' : value === 'fail' ? 'Fail' : 'Unknown';
}

export function analysisGateLabel(value: string | null | undefined, completeness: string | null | undefined): string {
  const label = gateLabel(value);
  return completeness == null ? 'Unknown' : label;
}

export function analysisGateClass(value: string | null | undefined, completeness: string | null | undefined): string {
  return completeness == null ? 'unknown' : value === 'pass' || value === 'fail' ? value : 'unknown';
}

export function measurementStateLabel(value: string | null | undefined): string {
  if (value === 'measured') return 'Mesurée';
  if (value === 'absent') return 'Absente';
  if (value === 'failed') return 'Échec de mesure';
  return 'Non mesurée';
}

export function completenessLabel(value: string | null | undefined): string {
  if (value === 'complete') return 'Complète';
  if (value === 'incomplete') return 'Incomplète';
  return 'Non disponible';
}

export type FindingCategory = 'secret' | 'dependency' | 'code' | 'ioc' | 'unknown' | 'bug' | 'code_smell' | 'vulnerability' | 'security_hotspot';

export function findingCategory(value: string | null | undefined): FindingCategory {
  return value === 'secret' || value === 'dependency' || value === 'code' || value === 'ioc' || value === 'bug' || value === 'code_smell' || value === 'vulnerability' || value === 'security_hotspot' ? value : 'unknown';
}

export function findingCategoryLabel(value: FindingCategory): string {
  return {
    bug: 'Bug', code_smell: 'Code smell', vulnerability: 'Vulnérabilité', security_hotspot: 'Point sensible',
    secret: 'Secret',
    dependency: 'Dépendance / CVE',
    code: 'Code',
    ioc: 'IOC',
    unknown: 'Catégorie inconnue',
  }[value];
}

export function scopedMetrics<T extends object>(metrics: T, scope: 'overall' | 'new-code'): Partial<T> {
  // ponytail: no baseline/diff contract yet; enable New Code only when real scoped metrics exist.
  return scope === 'overall' ? metrics : {};
}

export function metricPoint(value: number | null | undefined, index: number, count: number, maximum: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return { x: count === 1 ? 180 : 8 + (index / (count - 1)) * 344, y: 140 - (value / maximum) * 130 };
}
