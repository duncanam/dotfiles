import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Theme } from '@earendil-works/pi-coding-agent';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { PassThrough } from 'node:stream';
import { validateConfig, workerArgs, loadConfig, configPath } from '../config.mjs';
import { Engine } from '../engine.mjs';
import { jsonLines } from '../wire.mjs';
import { inspectFile, inspectPath } from '../inspect.mjs';
import { Log, renderPanes, clean, workflowSummary, roleStatus, renderWorkflowStatus, workflowFooter } from '../ui.ts';
import { visibleWidth } from '@earendil-works/pi-tui';

export const config = () => validateConfig({ architect: { provider: 'mock', model: 'frontier', thinking: 'high' }, implementor: { provider: 'mock', model: 'small', thinking: 'low' } });

test('config validates independent models/effort, defaults, and rejects unsafe tools/typos', () => {
  const c = config();
  assert.equal(c.checkinSeconds, 600);
  assert.equal(c.architect.thinking, 'high');
  assert.equal(c.implementor.thinking, 'low');
  assert.throws(() => validateConfig({ ...c, checkinSeconds: 0 }), /integer/);
  assert.throws(() => validateConfig({ ...c, checkinSecond: 10 }), /Unknown/);
  assert.throws(() => validateConfig({ ...c, architect: { ...c.architect, thinking: 'extreme' } }), /thinking/);
  assert.throws(() => validateConfig({ ...c, architect: { ...c.architect, extraTools: ['bash'] } }), /UnsafeTools/);
  const args = workerArgs(c, 'architect', '/worker.ts');
  for (const flag of ['--no-session', '--no-approve', '--no-extensions', '--no-skills', '--no-prompt-templates']) assert.ok(args.includes(flag));
  assert.equal(args[args.indexOf('--thinking') + 1], 'high');
  assert.equal(args.at(-1), 'ai_inspect,ai_directive');
});

test('JSON settings preserve role options and resolve paths relative to the settings file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pair-config-'));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  try {
    const path = join(root, 'architect-implementor.json');
    assert.equal(configPath(), path);
    await writeFile(join(root, 'architect-implementor.yaml'), 'legacy: ignored');
    assert.throws(() => loadConfig(), /architect-implementor\.example\.json/);
    await writeFile(join(root, 'guard.ts'), 'export default () => {};');
    await mkdir(join(root, 'skill'));
    const raw = config();
    raw.architect.extensions = ['./guard.ts'];
    raw.implementor.skills = ['./skill'];
    raw.checks = { tests: { command: 'npm test', timeoutSeconds: 7 } };
    await writeFile(path, JSON.stringify(raw, null, 2));
    const loaded = loadConfig();
    assert.equal(loaded.architect.thinking, 'high');
    assert.equal(loaded.implementor.thinking, 'low');
    assert.equal(loaded.checkinSeconds, 600);
    assert.deepEqual(loaded.architect.extensions, [join(root, 'guard.ts')]);
    assert.deepEqual(loaded.implementor.skills, [join(root, 'skill')]);
    assert.deepEqual(loaded.checks, raw.checks);
    await writeFile(path, '{"architect": {},}');
    assert.throws(() => loadConfig(), /Invalid JSON in .*architect-implementor\.json/);
    await writeFile(path, JSON.stringify({ ...raw, unexpected: true }));
    assert.throws(() => loadConfig(), /Unknown config.unexpected/);
    await writeFile(path, JSON.stringify({ note: '💡'.repeat(20000) }));
    assert.throws(() => loadConfig(), /exceeds 64 KiB/);
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test('cycle timer stays anchored through status, feedback and guidance; only assignment resets', () => {
  const e = new Engine(600000);
  e.directive({ kind: 'assign', cycle: 0, text: 'Plan' }, 1000);
  assert.deepEqual(e.tick(600999), []);
  e.report({ kind: 'status', cycle: 1, text: 'Working' });
  e.directive({ kind: 'guide', cycle: 1, text: 'Clarification' }, 550000);
  assert.equal(e.tick(601000).length, 1);
  assert.equal(e.nextPing, 1201000);
  assert.deepEqual(e.tick(601001), []);
  e.report({ kind: 'blocked', cycle: 1, text: 'Obstacle' });
  assert.deepEqual(e.tick(2000000), []);
  e.directive({ kind: 'guide', cycle: 1, text: 'Resolution' }, 2000000);
  assert.equal(e.startedAt, 1000);
  assert.equal(e.tick(2000000).length, 1);
  e.report({ kind: 'done', cycle: 1, text: 'Finished' });
  e.directive({ kind: 'assign', cycle: 1, text: 'Correction' }, 2100000);
  assert.equal(e.nextPing, 2700000);
});

test('short cycles never accumulate into long-turn check-ins; stale and overlapping handoffs fail', () => {
  const e = new Engine(10000);
  for (let i = 0; i < 20; i++) {
    e.directive({ kind: 'assign', cycle: i, text: 'task' }, i * 5000);
    assert.throws(() => e.directive({ kind: 'assign', cycle: i + 1, text: 'overlap' }), /active/);
    assert.deepEqual(e.tick(i * 5000 + 4999), []);
    e.report({ kind: 'done', cycle: i + 1, text: 'done' });
  }
  assert.throws(() => e.report({ kind: 'status', cycle: 1, text: 'late' }), /Stale/);
  assert.throws(() => e.directive({ kind: 'assign', cycle: 1, text: 'late' }), /Stale/);
});

test('completion requires fresh independent evidence; logs never form an effect', () => {
  const e = new Engine();
  e.inspected('changes'); e.inspected('read');
  e.directive({ kind: 'assign', cycle: 0, text: 'task' });
  const effects = e.report({ kind: 'done', cycle: 1, text: 'src/a.ts changed' });
  assert.match(effects[0].text, /Independently/);
  const accept = { kind: 'accept', cycle: 1, text: 'Verified' };
  assert.throws(() => e.directive(accept), /independently/);
  e.inspected('changes');
  assert.throws(() => e.directive(accept), /independently/);
  e.inspected('read');
  e.directive(accept);
  assert.equal(e.phase, 'accepted');
});

test('live status shows phase/cycle and countdown without changing the anchored timer', () => {
  const state = { mode: 'active', phase: 'implementing', cycle: 3, startedAt: 1000, nextPing: 601000 };
  assert.match(workflowSummary(state, 121000), /cycle 3 • implementing • elapsed 2:00 • next check-in 8:00/);
  assert.match(workflowSummary(state, 122000), /next check-in 7:59/);
  assert.match(workflowSummary(state, 601000), /check-in due/);
  assert.equal(state.nextPing, 601000);
  assert.equal(roleStatus(state, 'architect', false), 'monitoring');
  assert.equal(roleStatus(state, 'implementor', true), 'working');
  for (const mode of ['starting', 'failed', 'stopping']) {
    const s = { ...state, mode };
    assert.equal(roleStatus(s, 'architect', true), mode);
    assert.doesNotMatch(workflowSummary(s), /next check-in|elapsed|implementing/);
  }
  const blocked = { ...state, phase: 'blocked' };
  assert.equal(roleStatus(blocked, 'implementor', true), 'paused: blocker');
  assert.doesNotMatch(workflowSummary(blocked), /next check-in|elapsed/);
  assert.equal(roleStatus({ ...state, phase: 'reviewing' }, 'implementor', true), 'paused: review');
  for (const width of [0, 1, 20, 60, 100]) {
    for (const line of renderWorkflowStatus(width, state, 121000)) assert.ok(visibleWidth(line) <= width);
  }
});

test('JSONL preserves Unicode line separators and fragmented UTF8', () => {
  const stream = new PassThrough();
  const result = [];
  jsonLines(stream, (x) => result.push(x), (e) => { throw e; });
  const bytes = Buffer.from(JSON.stringify({ text: 'hello\u2028world\u2029💡' }) + '\r\n');
  for (const byte of bytes) stream.write(Buffer.from([byte]));
  assert.deepEqual(result, [{ text: 'hello\u2028world\u2029💡' }]);
});

test('read policy blocks traversal, symlink escape and raw git internals', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ai-inspect-'));
  try {
    await mkdir(join(dir, 'project'));
    await mkdir(join(dir, 'project', '.git'));
    await writeFile(join(dir, 'private'), 'outside');
    await writeFile(join(dir, 'project', 'code.ts'), 'one\ntwo\nthree');
    await symlink(join(dir, 'private'), join(dir, 'project', 'escape'));
    assert.equal(await inspectFile(join(dir, 'project'), 'code.ts', 2, 1), '2: two');
    await assert.rejects(inspectPath(join(dir, 'project'), '../private'), /restricted/);
    await assert.rejects(inspectPath(join(dir, 'project'), 'escape'), /restricted/);
    await assert.rejects(inspectPath(join(dir, 'project'), '.git'), /internals/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('transparent panes recolor across themes, style log categories, and respect width/height budgets', async () => {
  const root = dirname(fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent')));
  const themes = await Promise.all(['dark', 'light'].map(async (name) => {
    const json = JSON.parse(await readFile(join(root, 'modes/interactive/theme', `${name}.json`), 'utf8'));
    const colors = Object.fromEntries(Object.entries(json.colors).map(([key, value]) => [key, json.vars[value] ?? value]));
    return new Theme(colors, colors, 'truecolor');
  }));
  const log = new Log();
  log.add('[user feedback] Please check the API.');
  log.add('[thinking] Reviewing the response contract.');
  log.add('→ ai_inspect {"kind":"read"}');
  log.add('← ai_inspect: interface Result {}');
  log.add('[guide] Keep the interface stable.');
  log.add('ERROR: retry required');
  log.add('Wide 世界 💡 and combining e\u0301\x1b]0;untrusted\x07');
  const panes = [
    { title: 'Architect', role: 'architect', status: 'working', model: 'gpt-5.6-sol', thinking: 'max', log },
    { title: 'Implementor', role: 'implementor', status: 'paused: blocker', model: 'gpt-5.6-luna', thinking: 'max', log },
  ];
  const rendered = themes.map((theme) => renderPanes(130, 18, panes, theme).join('\n'));
  assert.notEqual(rendered[0], rendered[1]);
  assert.equal(clean(rendered[0]), clean(rendered[1]));
  for (const word of ['╭', '╯', 'Architect', 'Implementor', 'effort max', 'paused: blocker', 'YOU', 'THINK', 'TOOL', 'RESULT', 'HANDOFF']) assert.ok(clean(rendered[0]).includes(word), word);
  assert.ok(!rendered[0].includes('\x1b]'));
  assert.ok(!rendered[0].includes('\x1b[48;'), 'must not paint filled backgrounds');
  assert.match(clean(rendered[0]).split('\n')[0], /Architect · working/);
  const state = { mode: 'active', phase: 'implementing', cycle: 1, startedAt: 1000, nextPing: 601000, checkinMs: 600000 };
  assert.match(clean(renderWorkflowStatus(130, state, 301000, themes[0]).join('\n')), /CHECK-IN.*━.*─.*5:00 remaining/);
  for (const theme of themes) for (const width of [0, 1, 7, 8, 20, 40, 59, 60, 61, 80, 130, 240, 380]) for (const height of [0, 1, 2, 3, 6, 7, 12, 18]) {
    const lines = renderPanes(width, height, panes, theme);
    assert.ok(lines.length <= height, `height ${height}: ${lines.length}`);
    for (const line of lines) assert.ok(visibleWidth(line) <= width, `width ${width}: ${visibleWidth(line)}`);
    for (const line of renderWorkflowStatus(width, state, 301000, theme)) assert.ok(visibleWidth(line) <= width);
  }
});

test('idle and active panes retain tall full-width 50/50 geometry without background paint or clutter', () => {
  const panes = [
    { title: 'Architect', role: 'architect', status: 'idle', model: 'gpt-5.6-sol', thinking: 'max', log: new Log() },
    { title: 'Implementor', role: 'implementor', status: 'awaiting assignment', model: 'gpt-5.6-luna', thinking: 'max', log: new Log() },
  ];
  const transparentTheme = { fg: (_color, text) => text, bold: (text) => text, bg: () => assert.fail('No background painting') };
  const idle = renderPanes(380, 18, panes, transparentTheme);
  assert.equal(idle.length, 18);
  for (const width of [80, 159, 160, 240, 380]) {
    const rows = renderPanes(width, 18, panes, transparentTheme);
    const leftWidth = Math.floor((width - 2) / 2);
    assert.equal(rows.length, 18);
    for (const row of rows) assert.equal(visibleWidth(row), width);
    assert.equal(rows[0].indexOf('╮'), leftWidth - 1);
    assert.equal(rows[0].indexOf('╭', 1), leftWidth + 2);
    assert.ok(Math.abs(leftWidth - (width - leftWidth - 2)) <= 1);
  }
  assert.match(idle.join('\n'), /What would you like to build/);
  assert.doesNotMatch(idle.join('\n'), /LIVE FEED|tmux:|Config:/);
  assert.ok(idle[0].startsWith('╭─ ◇ Architect · idle '));
  assert.ok(idle[0].includes('╭─ ○ Implementor · awaiting assignment '));
  assert.match(idle.at(-1), /^╰─+╯  ╰─+╯$/);
  const state = { mode: 'active', phase: 'implementing', cycle: 1, startedAt: 1000, nextPing: 601000 };
  assert.doesNotMatch(workflowFooter(state), /cycle|implementing|elapsed/);
  assert.doesNotMatch(renderWorkflowStatus(380, state, 1000).join('\n'), /pair-disable|input →/);
  panes[0].log.add('ERROR: provider unavailable');
  const active = renderPanes(380, 18, panes, transparentTheme);
  assert.equal(active.length, 18);
  assert.match(active.join('\n'), /ERROR: provider unavailable/);
});

test('each tmux session is embedded in its bottom border without extra rows or overflow', () => {
  const key = 'abcdef0123456789abcdef01';
  const panes = ['architect', 'implementor'].map((role) => ({ title: role, role, log: new Log(), sessionName: `ai-${key}-${role}` }));
  const lines = renderPanes(160, 18, panes);
  assert.equal(lines.length, 18);
  assert.ok(lines.at(-1).includes(`tmux: ${panes[0].sessionName}`));
  assert.ok(lines.at(-1).includes(`tmux: ${panes[1].sessionName}`));
  assert.ok(lines.slice(0, -1).every((line) => !line.includes('tmux:')));
  const stacked = renderPanes(50, 18, panes);
  assert.equal(stacked.filter((line) => line.startsWith('╰─ tmux:')).length, 2);
  assert.ok(renderPanes(80, 18, panes).at(-1).includes('…'));
  for (const width of [0, 1, 7, 8, 20, 50, 59, 60, 80, 101, 160, 380]) {
    const rendered = renderPanes(width, 18, panes);
    for (const line of rendered) assert.ok(visibleWidth(line) <= width);
  }
  panes[0].sessionName = '\x1b]0;bad title\x07name\nwith newline';
  const safe = renderPanes(160, 18, panes).at(-1);
  assert.ok(!safe.includes('\x1b'));
  assert.ok(!safe.includes('\n'));
});

test('pane widths are safe on tiny/resized terminals and untrusted ANSI is stripped', () => {
  const log = new Log();
  log.add('\x1b[2J\x1b]0;bad title\x07Hello 💡\t世界\n' + 'x'.repeat(1000));
  assert.equal(clean('\x1b[31mred\x1b[0m\x00'), 'red');
  for (const width of [0, 1, 3, 4, 20, 59, 60, 81, 200]) {
    const lines = renderPanes(width, 8, [{ title: 'Architect 💡', log }, { title: 'Implementor', log }]);
    for (const line of lines) assert.ok(visibleWidth(line) <= width, `${width}: ${visibleWidth(line)}`);
  }
  for (let i = 0; i < 1000; i++) log.add('x'.repeat(4000));
  assert.ok(log.entries.join('\n').length <= 60000);
});
