import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleWidth } from '@earendil-works/pi-tui';
import { emptyUsage, emptyPairUsage, recordUsage, recordMessageUsage, combinedUsage, usageSummary, usageReport } from '../usage.ts';
import { renderUsageStatus, clean } from '../ui.ts';

const full = () => ({ input: 100, output: 10, cacheRead: 30, cacheWrite: 5, totalTokens: 145,
  reasoning: 8, cacheWrite1h: 4, cost: { input: 0.006, output: 0.003, cacheRead: 0.001, cacheWrite: 0, total: 0.01 } });

test('usage includes cache tokens exactly once, keeps reasoning inside output and sums independent roles', () => {
  const pair = emptyPairUsage();
  assert.equal(usageSummary(pair.architect), '0 tok / $0.0000');
  recordUsage(pair.architect, full());
  recordUsage(pair.implementor, full()); recordUsage(pair.implementor, full());
  const total = combinedUsage(pair);
  assert.equal(total.records, 3); assert.deepEqual(total.tokens, { value: 435, missing: 0 });
  assert.deepEqual(total.cost, { value: 0.03, missing: 0 });
  assert.equal(total.output.value, 30); assert.equal(total.cacheWrite.value, 15);
  assert.equal(pair.architect.tokens.value, 145); assert.equal(pair.implementor.tokens.value, 290);
  total.input.value++; assert.equal(pair.architect.input.value, 100, 'combined snapshots do not alias either role');
  assert.match(usageReport(pair), /Architect: 145 tok \/ \$0\.0100/);
  assert.match(usageReport(pair), /Implementor: 290 tok \/ \$0\.0200/);
  assert.match(usageReport(pair), /Total: 435 tok \/ \$0\.0300/);
  assert.match(usageReport(pair), /input 300 · output 30 · cache read 90 · cache write 15/);
});

test('only finalized assistant and nested-tool messages count, including errors/aborts and repeated identical responses', () => {
  const totals = emptyUsage();
  for (const message of [{ role: 'user', usage: full() }, { role: 'custom', usage: full() }, { role: 'toolResult' }, { role: 'assistant', stopReason: 'pending', usage: full() }]) {
    assert.equal(recordMessageUsage(totals, message), false);
  }
  for (const stopReason of ['stop', 'stop', 'toolUse', 'error', 'aborted']) {
    assert.equal(recordMessageUsage(totals, { role: 'assistant', stopReason, usage: full() }), true);
  }
  assert.equal(recordMessageUsage(totals, { role: 'toolResult', usage: full() }), true);
  assert.equal(totals.records, 6); assert.equal(totals.tokens.value, 870);
  assert.ok(Math.abs(totals.cost.value - 0.06) < 1e-12);
});

test('missing totals derive from disjoint categories; reported totals take precedence; valid zero stays zero', () => {
  const usage = full(); delete usage.totalTokens; delete usage.cost.total;
  const totals = emptyUsage(); recordUsage(totals, usage);
  assert.equal(usageSummary(totals), '145 tok / $0.0100');
  recordUsage(totals, { ...full(), totalTokens: 150, cost: { total: 0 } });
  assert.equal(usageSummary(totals), '295 tok / $0.0100');
  assert.equal(totals.tokens.missing, 0); assert.equal(totals.cost.missing, 0);
});

test('unknown, malformed and partial usage is not fabricated as a complete zero', () => {
  const pair = emptyPairUsage();
  recordMessageUsage(pair.architect, { role: 'assistant', stopReason: 'aborted' });
  assert.equal(usageSummary(pair.architect), 'n/a tok / n/a');
  recordUsage(pair.implementor, { input: 10, output: -1, cacheRead: 5, cacheWrite: Infinity, totalTokens: '15', cost: { input: 0.002, total: NaN } });
  assert.equal(usageSummary(pair.implementor), '≥15 tok / ≥$0.0020');
  assert.equal(usageSummary(combinedUsage(pair)), '≥15 tok / ≥$0.0020');
  recordUsage(pair.architect, full());
  assert.equal(usageSummary(pair.architect), '≥145 tok / ≥$0.0100');
  for (const invalid of [null, undefined, 'bad', [], { cost: -1 }]) recordUsage(pair.implementor, invalid);
  const report = usageReport(pair);
  assert.doesNotMatch(report, /NaN|Infinity|undefined/);
  assert.match(report, /output n\/a/); assert.match(report, /not billed spend/);
});

test('compact usage wraps within terminal widths, respects themes and has exact breakdowns on demand', () => {
  const pair = emptyPairUsage();
  recordUsage(pair.architect, { ...full(), totalTokens: 1234567 });
  recordUsage(pair.implementor, { ...full(), totalTokens: 3000000000, cost: { total: 0.000012 } });
  assert.equal(usageSummary(pair.architect), '1.2m tok / $0.0100');
  assert.equal(usageSummary(pair.implementor), '3.0b tok / $0.000012');
  assert.match(usageReport(pair), /Architect: 1234567 tok/);
  assert.match(usageReport(pair), /Implementor: 3000000000 tok/);
  const themes = [undefined, { fg: (_key, text) => `\x1b[31m${text}\x1b[0m`, bold: (text) => text }];
  for (const theme of themes) for (const width of [0, 1, 7, 20, 40, 80, 160, 380]) {
    const rows = renderUsageStatus(width, pair, theme);
    for (const row of rows) assert.ok(visibleWidth(row) <= width, `${width}: ${row}`);
  }
  const plain = renderUsageStatus(160, pair).join('\n');
  assert.equal(clean(renderUsageStatus(160, pair, themes[1]).join('\n')), plain);
  for (const text of ['Usage (pair, est.)', 'Architect', 'Implementor', 'Total']) assert.ok(plain.includes(text));
});
