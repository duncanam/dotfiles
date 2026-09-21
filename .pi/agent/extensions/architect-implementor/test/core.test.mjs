import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Theme } from '@earendil-works/pi-coding-agent';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { PassThrough } from 'node:stream';
import { validateConfig, workerArgs, loadConfig, configPath } from '../config.mjs';
import { Engine } from '../engine.mjs';
import { jsonLines } from '../wire.mjs';
import { Log, renderPane, clean, workflowSummary, implementorStatus, renderWorkflowStatus, workflowFooter } from '../ui.ts';
import { visibleWidth } from '@earendil-works/pi-tui';
const config = () => validateConfig({ version: 2, architect: { provider: 'mock', model: 'frontier', thinking: 'high' }, implementor: { provider: 'mock', model: 'small', thinking: 'low' } });

test('v2 config separates native architect defaults from implementor resources and rejects legacy shapes', () => {
  const c = config();
  assert.equal(c.checkinSeconds, 600); assert.equal(c.paneLines, 26);
  assert.deepEqual(c.architect, { provider: 'mock', model: 'frontier', thinking: 'high' });
  assert.equal(c.implementor.thinking, 'low');
  assert.throws(() => validateConfig({ ...c, version: undefined }), /config.version must be 2/);
  assert.throws(() => validateConfig({ ...c, checkinSeconds: 0 }), /integer/);
  assert.throws(() => validateConfig({ ...c, checkinSecond: 10 }), /Unknown/);
  assert.throws(() => validateConfig({ ...c, architect: { ...c.architect, thinking: 'extreme' } }), /thinking/);
  for (const key of ['extensions', 'skills', 'extraTools', 'allowUnsafeTools']) assert.throws(() => validateConfig({ ...c, architect: { ...c.architect, [key]: [] } }), /Unknown architect/);
  assert.throws(() => validateConfig({ ...c, checks: {} }), /Unknown config.checks/);
  const extended = validateConfig({ ...c, implementor: { ...c.implementor, extraTools: ['bash', 'context7_get_library_docs'] } });
  const extendedTools = workerArgs(extended, '/worker.ts').at(-1).split(',');
  assert.equal(extendedTools.filter((name) => name === 'bash').length, 1); assert.ok(extendedTools.includes('context7_get_library_docs'));
  const args = workerArgs(c, '/worker.ts');
  for (const flag of ['--no-session', '--no-approve', '--no-extensions', '--no-skills', '--no-prompt-templates']) assert.ok(args.includes(flag));
  assert.equal(args[args.indexOf('--thinking') + 1], 'low'); assert.equal(args.at(-1), 'read,write,edit,bash,ai_report');
});

test('strict JSON settings resolve only implementor resource paths relative to the settings file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pair-config-')), previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  try {
    const path = join(root, 'architect-implementor.json'); assert.equal(configPath(), path);
    assert.throws(() => loadConfig(), /architect-implementor\.example\.json/);
    await writeFile(join(root, 'guard.ts'), 'export default () => {};'); await mkdir(join(root, 'skill'));
    const raw = config(); raw.implementor.extensions = ['./guard.ts']; raw.implementor.skills = ['./skill'];
    await writeFile(path, JSON.stringify(raw)); const loaded = loadConfig();
    assert.equal(loaded.architect.thinking, 'high'); assert.equal(loaded.implementor.thinking, 'low');
    assert.deepEqual(loaded.implementor.extensions, [join(root, 'guard.ts')]); assert.deepEqual(loaded.implementor.skills, [join(root, 'skill')]);
    await writeFile(path, '{"architect": {},}'); assert.throws(() => loadConfig(), /Invalid JSON/);
    await writeFile(path, JSON.stringify({ ...raw, unexpected: true })); assert.throws(() => loadConfig(), /Unknown config.unexpected/);
    await writeFile(path, JSON.stringify({ note: '💡'.repeat(20000) })); assert.throws(() => loadConfig(), /exceeds 64 KiB/);
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test('check-in cadence ignores activity; blockers reset and pause the implementation clock', () => {
  const e = new Engine(1200000);
  assert.equal(e.directive({ kind: 'assign', cycle: 0, text: 'Plan' }, 1000).length, 1, 'no architect-worker cycle note');
  e.report({ kind: 'status', cycle: 1, text: 'Working' });
  e.directive({ kind: 'guide', cycle: 1, text: 'Clarification' }, 550000); e.directive({ kind: 'ping', cycle: 1, text: 'Status?' }, 590000);
  assert.equal(e.startedAt, 1000); assert.equal(e.nextPing, 1201000); assert.deepEqual(e.tick(1200999), []);
  const reminder = e.tick(1201000); assert.equal(reminder.length, 1);
  assert.match(reminder[0].text, /Assess whether an update is needed/); assert.match(reminder[0].text, /Do not immediately duplicate recent guidance/);
  assert.equal(e.nextPing, 2401000); assert.deepEqual(e.tick(1201001), []);
  e.report({ kind: 'blocked', cycle: 1, text: 'Obstacle' }); e.report({ kind: 'status', cycle: 1, text: 'Awaiting guidance' });
  assert.equal(e.startedAt, 0); assert.equal(e.nextPing, 0); assert.deepEqual(e.tick(9000000), []);
  e.directive({ kind: 'guide', cycle: 1, text: 'Resolution' }, 9000000);
  assert.equal(e.startedAt, 9000000); assert.equal(e.nextPing, 10200000); assert.equal(e.cycle, 1);
  assert.deepEqual(e.tick(10199999), []); assert.equal(e.tick(10200000).length, 1);
});

test('long review/accepted waits remain paused; same-cycle corrections get a full fresh interval and require a fresh completion', () => {
  const e = new Engine(10000);
  for (const kind of ['guide', 'ping']) assert.throws(() => e.directive({ kind, cycle: 0, text: 'Too early' }), /Use assign/);
  e.directive({ kind: 'assign', cycle: 0, text: 'task' }, 1000); e.report({ kind: 'done', cycle: 1, text: 'done' });
  let now = 1000000;
  for (const phase of ['reviewing', 'accepted']) {
    assert.equal(e.startedAt, 0); assert.equal(e.nextPing, 0); assert.deepEqual(e.tick(now - 1), []);
    assert.equal(e.directive({ kind: 'ping', cycle: 1, text: 'Clarify the test result' }, now - 1)[0].mode, 'ping');
    e.report({ kind: 'status', cycle: 1, text: 'Tests pass; still paused' }); assert.equal(e.phase, phase); assert.equal(e.nextPing, 0);
    assert.doesNotMatch(renderWorkflowStatus(120, { mode: 'active', ...e }, now - 1).join('\n'), /CHECK-IN|elapsed|remaining|due now/);
    assert.deepEqual(e.directive({ kind: 'guide', cycle: 1, text: 'Fix this review finding' }, now), [{ role: 'implementor', mode: 'guide', cycle: 1, text: 'Fix this review finding' }]);
    assert.equal(e.phase, 'implementing'); assert.equal(e.startedAt, now); assert.equal(e.nextPing, now + 10000);
    assert.match(workflowSummary({ mode: 'active', ...e }, now), /elapsed 0:00.*next check-in 0:10/);
    const bar = renderWorkflowStatus(120, { mode: 'active', ...e, checkinMs: e.intervalMs }, now).at(-1);
    assert.match(bar, /CHECK-IN\s+─+\s+0:10 remaining/); assert.doesNotMatch(bar, /━|due now/);
    assert.deepEqual(e.tick(now + 9999), []); assert.equal(e.tick(now + 10000).length, 1);
    assert.throws(() => e.directive({ kind: 'accept', cycle: 1, text: 'Premature' }), /completion report/);
    e.report({ kind: 'done', cycle: 1, text: 'Correction verified' }); e.directive({ kind: 'accept', cycle: 1, text: 'Accepted' }); now += 1000000;
  }
});

test('short cycles do not accumulate check-ins; stale/overlapping handoffs fail and review has no prescribed tool sequence', () => {
  const e = new Engine(10000);
  assert.throws(() => e.directive({ kind: 'accept', cycle: 0, text: 'Early' }), /completion report/);
  for (let i = 0; i < 20; i++) {
    e.directive({ kind: 'assign', cycle: i, text: 'task' }, i * 5000);
    assert.throws(() => e.directive({ kind: 'assign', cycle: i + 1, text: 'overlap' }), /active/); assert.deepEqual(e.tick(i * 5000 + 4999), []);
    e.report({ kind: 'blocked', cycle: i + 1, text: 'Decision' });
    assert.throws(() => e.directive({ kind: 'accept', cycle: i + 1, text: 'Early' }), /completion report/);
    const effects = e.report({ kind: 'done', cycle: i + 1, text: 'done' }); assert.match(effects[0].text, /Independently review/);
    e.directive({ kind: 'accept', cycle: i + 1, text: 'Reviewed with ordinary tools' }); assert.equal(e.phase, 'accepted');
  }
  assert.throws(() => e.report({ kind: 'status', cycle: 1, text: 'late' }), /Stale/);
  assert.throws(() => e.directive({ kind: 'assign', cycle: 1, text: 'late' }), /Stale/);
});

test('status requests wake once, invalid messages do not consume them, and new instructions/terminal reports clear them', () => {
  const e = new Engine(10000);
  const directive = (kind, cycle = e.cycle) => e.directive({ kind, cycle, text: kind }, 1000);
  const report = (kind, cycle = e.cycle) => e.report({ kind, cycle, text: kind })[0];
  directive('assign'); assert.equal(report('status').triggerTurn, false);
  directive('ping'); assert.throws(() => report('status', 0), /Stale/);
  assert.throws(() => e.report({ kind: 'status', cycle: 1, text: '' }), /Invalid communication/);
  assert.throws(() => directive('assign'), /active/);
  assert.equal(report('status').triggerTurn, true); assert.equal(report('status').triggerTurn, false);
  directive('ping'); directive('guide'); assert.equal(report('status').triggerTurn, false);
  directive('ping'); assert.equal(report('blocked').triggerTurn, true); assert.equal(report('status').triggerTurn, false);
  directive('ping'); directive('assign'); assert.equal(report('status').triggerTurn, false);
  directive('ping'); assert.equal(report('done').triggerTurn, true); assert.equal(report('status').triggerTurn, false);
  directive('ping'); directive('accept'); assert.equal(report('status').triggerTurn, false);
  assert.equal(e.startedAt, 0); assert.equal(e.nextPing, 0);
});

test('workflow indicators retain phase, cycle, countdown, hours and worker activity without intercepted-input claims', () => {
  const state = { mode: 'active', phase: 'implementing', cycle: 3, startedAt: 1000, nextPing: 601000 };
  assert.match(workflowSummary(state, 121000), /cycle 3 • implementing • elapsed 2:00 • next check-in 8:00/);
  assert.match(workflowSummary(state, 122000), /next check-in 7:59/); assert.match(workflowSummary(state, 601000), /check-in due/);
  assert.equal(state.nextPing, 601000); assert.equal(implementorStatus(state, true), 'working'); assert.equal(implementorStatus(state, false), 'idle: task open');
  for (const mode of ['starting', 'failed', 'stopping']) {
    const s = { ...state, mode }; assert.equal(implementorStatus(s, true), mode);
    assert.doesNotMatch(workflowSummary(s), /next check-in|elapsed|implementing|intercepted/);
  }
  for (const [phase, label] of [['blocked', 'paused: blocker'], ['reviewing', 'paused: review']]) {
    assert.equal(implementorStatus({ ...state, phase }, true), label); assert.doesNotMatch(workflowSummary({ ...state, phase }), /next check-in|elapsed/);
  }
  for (const [seconds, elapsed] of [[3599, '59:59'], [3600, '1:00:00'], [17449, '4:50:49'], [90000, '25:00:00']]) {
    const now = state.startedAt + seconds * 1000; assert.ok(workflowSummary(state, now).includes(`elapsed ${elapsed}`)); assert.ok(renderWorkflowStatus(120, state, now).join('\n').includes(`elapsed ${elapsed}`));
  }
  assert.match(workflowFooter(state), /◇ Architect \(main\)/); assert.doesNotMatch(workflowFooter(state), /input|cycle|elapsed/);
  for (const width of [0, 1, 20, 60, 100]) for (const line of renderWorkflowStatus(width, state, 121000)) assert.ok(visibleWidth(line) <= width);
});

test('JSONL preserves Unicode line separators and fragmented UTF8', () => {
  const stream = new PassThrough(), result = [];
  jsonLines(stream, (x) => result.push(x), (e) => { throw e; });
  for (const byte of Buffer.from(JSON.stringify({ text: 'hello\u2028world\u2029💡' }) + '\r\n')) stream.write(Buffer.from([byte]));
  assert.deepEqual(result, [{ text: 'hello\u2028world\u2029💡' }]);
});

test('single transparent pane retains theme colors, log categories, and width/height budgets', async () => {
  const root = dirname(fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent')));
  const themes = await Promise.all(['dark', 'light'].map(async (name) => {
    const json = JSON.parse(await readFile(join(root, 'modes/interactive/theme', `${name}.json`), 'utf8'));
    const colors = Object.fromEntries(Object.entries(json.colors).map(([key, value]) => [key, json.vars[value] ?? value])); return new Theme(colors, colors, 'truecolor');
  }));
  const log = new Log();
  for (const text of ['[thinking] Reviewing the response contract.', '→ read {"path":"src/types.ts"}', '← read: interface Result {}', '[guide] Keep the interface stable.', '[queued status] Waiting for capacity.', 'ERROR: retry required', 'Wide 世界 💡 and e\u0301\x1b]0;untrusted\x07']) log.add(text);
  const pane = { status: 'paused: blocker', model: 'gpt-5.6-luna', thinking: 'max', log };
  const rendered = themes.map((theme) => renderPane(130, 26, pane, theme).join('\n'));
  assert.notEqual(rendered[0], rendered[1]); assert.equal(clean(rendered[0]), clean(rendered[1]));
  for (const word of ['╭', '╯', '○ Implementor', 'effort max', 'paused: blocker', 'THINK', 'TOOL', 'RESULT', 'HANDOFF', 'QUEUED status']) assert.ok(clean(rendered[0]).includes(word), word);
  assert.ok(!rendered[0].includes('\x1b]')); assert.ok(!rendered[0].includes('\x1b[48;'));
  const state = { mode: 'active', phase: 'implementing', cycle: 1, startedAt: 1000, nextPing: 601000, checkinMs: 600000 };
  assert.match(clean(renderWorkflowStatus(130, state, 301000, themes[0]).join('\n')), /CHECK-IN.*━.*─.*5:00 remaining/);
  for (const theme of themes) for (const width of [0, 1, 7, 8, 20, 40, 59, 60, 61, 80, 130, 380]) for (const height of [0, 1, 2, 3, 6, 7, 12, 26]) {
    const lines = renderPane(width, height, pane, theme); assert.ok(lines.length <= height);
    for (const line of lines) assert.ok(visibleWidth(line) <= width, `width ${width}: ${visibleWidth(line)}`);
  }
});

test('empty thinking is hidden and later deltas survive interleaved handoff log entries', () => {
  const log = new Log(), pane = { log }; log.start('[thinking] \n');
  assert.doesNotMatch(renderPane(160, 26, pane).join('\n'), /THINK/);
  log.add('[guide] New feedback'); log.delta('Checking the queue.');
  assert.match(renderPane(160, 26, pane).join('\n'), /THINK\s+Checking the queue\./);
  assert.equal(log.entries[1], '[guide] New feedback');
  log.start('[thinking] '); assert.equal(renderPane(160, 26, pane).join('\n').match(/THINK/g).length, 1);
});

test('idle and active implementor pane uses full width, fixed height and one bottom-border tmux identity', () => {
  const name = 'ai-abcdef0123456789abcdef01-implementor';
  const pane = { status: 'awaiting assignment', model: 'gpt-5.6-luna', thinking: 'max', log: new Log(), sessionName: name };
  const theme = { fg: (_color, text) => text, bold: (text) => text, bg: () => assert.fail('No background painting') };
  for (const width of [50, 80, 159, 160, 240, 380]) {
    const rows = renderPane(width, 26, pane, theme); assert.equal(rows.length, 26);
    for (const row of rows) assert.equal(visibleWidth(row), width);
    assert.equal(rows[0].indexOf('╮'), width - 1); assert.equal(rows[0].match(/╭/g).length, 1);
    assert.ok(rows[0].startsWith('╭─ ○ Implementor · awaiting assignment '));
    assert.ok(rows.at(-1).startsWith('╰─ tmux: ')); assert.ok(rows.slice(0, -1).every((row) => !row.includes('tmux:')));
  }
  assert.ok(renderPane(80, 26, pane).at(-1).includes(name)); assert.ok(renderPane(40, 26, pane).at(-1).includes('…'));
  assert.match(renderPane(160, 26, pane).join('\n'), /main conversation/); assert.doesNotMatch(renderPane(160, 26, pane).join('\n'), /◇ Architect|LIVE FEED|Config:/);
  pane.log.add('ERROR: provider unavailable'); assert.match(renderPane(160, 26, pane).join('\n'), /ERROR: provider unavailable/);
  pane.sessionName = '\x1b]0;bad title\x07name\nwith newline'; const safe = renderPane(160, 26, pane).at(-1);
  assert.ok(!safe.includes('\x1b')); assert.ok(!safe.includes('\n'));
});

test('tiny terminal widths and bounded logs safely strip untrusted ANSI', () => {
  const log = new Log(); log.add('\x1b[2J\x1b]0;bad title\x07Hello 💡\t世界\n' + 'x'.repeat(1000));
  assert.equal(clean('\x1b[31mred\x1b[0m\x00'), 'red');
  for (const width of [0, 1, 3, 4, 20, 59, 60, 81, 200]) for (const line of renderPane(width, 8, { log })) assert.ok(visibleWidth(line) <= width);
  log.start('old stream'); for (let i = 0; i < 1000; i++) log.add('x'.repeat(4000)); log.delta('fresh stream');
  assert.ok(log.entries.join('\n').length <= 60000); assert.equal(log.entries.at(-1), 'fresh stream');
});
