// Pair-local accounting only. Never inject worker usage into native Pi totals.
const tokenKeys = ['input', 'output', 'cacheRead', 'cacheWrite'] as const;
const metricKeys = [...tokenKeys, 'tokens', 'cost'] as const;
type TokenKey = typeof tokenKeys[number];
type MetricKey = typeof metricKeys[number];
export type Metric = { value: number; missing: number };
export type RoleUsage = { records: number } & Record<MetricKey, Metric>;
export type PairUsage = { architect: RoleUsage; implementor: RoleUsage };
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
const amount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function emptyUsage(): RoleUsage {
  const metric = (): Metric => ({ value: 0, missing: 0 });
  return { records: 0, input: metric(), output: metric(), cacheRead: metric(), cacheWrite: metric(), tokens: metric(), cost: metric() };
}
export function emptyPairUsage(): PairUsage { return { architect: emptyUsage(), implementor: emptyUsage() }; }
function add(metric: Metric, value: unknown) {
  if (amount(value)) metric.value += value;
  else metric.missing++;
}
function addTotal(metric: Metric, total: unknown, parts: Record<string, unknown>) {
  if (amount(total)) { add(metric, total); return; }
  // A missing total can be derived from all four disjoint categories. If only
  // some are reported, retain their known subtotal without calling it complete.
  let complete = true;
  for (const key of tokenKeys) {
    if (amount(parts[key])) metric.value += parts[key];
    else complete = false;
  }
  if (!complete) metric.missing++;
}
export function recordUsage(totals: RoleUsage, value: unknown) {
  const usage = object(value), cost = object(usage.cost);
  totals.records++;
  for (const key of tokenKeys) add(totals[key], usage[key]);
  // reasoning is included in output; cacheWrite1h is included in cacheWrite.
  addTotal(totals.tokens, usage.totalTokens, usage);
  addTotal(totals.cost, cost.total, cost);
}
export function recordMessageUsage(totals: RoleUsage, value: unknown): boolean {
  const message = object(value);
  if (message.role === 'assistant' && message.stopReason !== 'pending'
    || message.role === 'toolResult' && message.usage !== undefined) {
    recordUsage(totals, message.usage);
    return true;
  }
  return false;
}
export function combinedUsage(pair: PairUsage): RoleUsage {
  const result = emptyUsage();
  result.records = pair.architect.records + pair.implementor.records;
  for (const key of metricKeys) {
    result[key].value = pair.architect[key].value + pair.implementor[key].value;
    result[key].missing = pair.architect[key].missing + pair.implementor[key].missing;
  }
  return result;
}
function tokens(value: number, compact: boolean) {
  if (!compact || value < 1000) return String(value);
  for (const [size, suffix] of [[1e9, 'b'], [1e6, 'm'], [1e3, 'k']] as const) {
    if (value >= size) return `${(value / size).toFixed(1)}${suffix}`;
  }
  return String(value);
}
function formatMetric(metric: Metric, format: (value: number) => string) {
  if (metric.missing && metric.value === 0) return 'n/a';
  return (metric.missing ? '≥' : '') + format(metric.value);
}
export function usageSummary(usage: RoleUsage, compact = true): string {
  const count = formatMetric(usage.tokens, (value) => tokens(value, compact));
  const cost = formatMetric(usage.cost, (value) => `$${value > 0 && value < 0.0001 ? value.toPrecision(2) : value.toFixed(4)}`);
  return `${count} tok / ${cost}`;
}
export function usageRows(pair: PairUsage): [string, RoleUsage][] {
  return [['Architect', pair.architect], ['Implementor', pair.implementor], ['Total', combinedUsage(pair)]];
}
export function usageReport(pair: PairUsage): string {
  const labels: Record<TokenKey, string> = { input: 'input', output: 'output', cacheRead: 'cache read', cacheWrite: 'cache write' };
  return usageRows(pair).map(([role, totals]) => `${role}: ${usageSummary(totals, false)}\n  ${tokenKeys.map((key) => `${labels[key]} ${formatMetric(totals[key], String)}`).join(' · ')}`).join('\n')
    + '\nFinalized reported usage incl. cache tokens, tool model usage and successful compactions; reasoning is already in output.'
    + '\n≥ marks partial totals; n/a means unavailable. Cost is Pi’s estimate, not billed spend.'
    + '\nExcludes unreported/in-flight usage and background cache warming. Native Pi totals are unchanged.';
}
