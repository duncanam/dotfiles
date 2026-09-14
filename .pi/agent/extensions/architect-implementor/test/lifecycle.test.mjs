import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, mkdir, writeFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig } from '../config.mjs';
import { WorkerPair, sessionNames, reapOrphans } from '../transport.mjs';
const exec = promisify(execFile);
const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fake-rpc.mjs');
const config = () => validateConfig({ architect: { provider: 'mock', model: 'frontier', thinking: 'high' }, implementor: { provider: 'mock', model: 'small', thinking: 'low' } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait(fn, timeout = 7000) { const end = Date.now() + timeout; while (!await fn()) { if (Date.now() > end) throw new Error('Timed out waiting'); await sleep(50); } }
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const tmux = (args) => exec('tmux', ['-L', 'pi-ai', '-f', '/dev/null', ...args], { timeout: 5000 });
async function has(name) { return tmux(['has-session', '-t', `=${name}`]).then(() => true, () => false); }
function boot(config, extra = {}) {
  return (role) => ({ command: process.execPath, args: [fixture], cwd: '/tmp', env: { ...process.env, MOCK_ROLE: role, MOCK_PROVIDER: config[role].provider, MOCK_MODEL: config[role].model, MOCK_THINKING: config[role].thinking, MOCK_PASSIVE: '1', ...extra } });
}

test('tmux pair uses long-lived workers, correlated RPC, UI cancellation, and idempotent tree cleanup', { timeout: 20000 }, async () => {
  const root = await mkdtemp('/tmp/ai-test-');
  const childFile = join(root, 'descendant');
  const cfg = config();
  const events = [];
  let failure;
  const pair = new WorkerPair(cfg, '/tmp', 'parent-session', (role, e) => events.push({ role, ...e }), (e) => { failure = e; }, { root, boot: boot(cfg, { MOCK_DESCENDANT_FILE: childFile }) });
  try {
    await pair.start();
    for (const name of sessionNames(pair.key)) assert.equal(await has(name), true);
    const originalSockets = [...pair.sockets.values()];
    await Promise.all(Array.from({ length: 20 }, (_, i) => pair.prompt(i % 2 ? 'architect' : 'implementor', `Task ${i}`)));
    assert.deepEqual([...pair.sockets.values()], originalSockets);
    await wait(() => events.filter((e) => e.type === 'test_prompt').length === 20); // Acceptance precedes streamed events.
    pair.respondUi('architect', 'dialog-original-id');
    await wait(() => events.some((e) => e.type === 'test_ui_response'));
    assert.equal(events.find((e) => e.type === 'test_ui_response').value.id, 'dialog-original-id');
    const pid = Number(await readFile(childFile, 'utf8'));
    assert.ok(alive(pid));
    await Promise.all([pair.stop(), pair.stop()]);
    await wait(() => !alive(pid));
    for (const name of sessionNames(pair.key)) assert.equal(await has(name), false);
    await assert.rejects(access(pair.dir));
    assert.equal(failure, undefined);
  } finally { await pair.stop(); await rm(root, { recursive: true, force: true }); }
});

test('live model changes wait for settled (including retry gaps), hold feedback, and preserve worker context', { timeout: 15000 }, async () => {
  const root = await mkdtemp('/tmp/ai-model-test-');
  const cfg = config(), events = [];
  let failure;
  const pair = new WorkerPair(cfg, '/tmp', 'switch-model', (role, e) => events.push({ role, ...e }), (e) => { failure = e; },
    { root, boot: boot(cfg, { MOCK_BUSY_MS: '600', MOCK_RETRY_GAP: '1' }) });
  try {
    await pair.start();
    const sockets = [...pair.sockets.values()];
    await pair.prompt('architect', 'first task');
    await wait(() => pair.running.has('architect'));
    const before = await pair.rpc('architect', { type: 'get_state' });
    assert.equal(before.isStreaming, false, 'retry gap alone is not a settled boundary');
    const change = pair.changeModel('architect', { provider: 'other', model: 'vendor/model', thinking: 'medium' });
    const next = pair.prompt('architect', 'second task');
    await sleep(100);
    assert.equal((await pair.rpc('architect', { type: 'get_state' })).model.id, 'frontier');
    assert.equal(events.filter((e) => e.type === 'test_prompt').length, 1);
    await change;
    await next;
    await wait(() => events.filter((e) => e.type === 'test_prompt').length === 2);
    const after = await pair.rpc('architect', { type: 'get_state' });
    assert.equal(after.sessionId, before.sessionId);
    assert.equal(after.messageCount, before.messageCount + 1);
    assert.deepEqual([...pair.sockets.values()], sockets);
    const prompt = events.filter((e) => e.type === 'test_prompt').at(-1);
    assert.equal(prompt.model, 'vendor/model');
    assert.equal(prompt.provider, 'other');
    assert.equal(prompt.thinking, 'medium');
    const other = await pair.rpc('implementor', { type: 'get_state' });
    assert.equal(other.model.id, 'small');
    assert.equal(other.thinkingLevel, 'low');
    assert.equal(failure, undefined);
  } finally { await pair.stop(); await rm(root, { recursive: true, force: true }); }
});

test('independent bridge lease expires if parent heartbeats stop', { timeout: 15000 }, async () => {
  const root = await mkdtemp('/tmp/ai-test-');
  const cfg = config();
  let failure;
  const pair = new WorkerPair(cfg, '/tmp', 'frozen-parent', () => {}, (e) => { failure = e; }, { root, boot: boot(cfg), leaseMs: 1000 });
  try {
    await pair.start();
    clearInterval(pair.heartbeat);
    await wait(() => !!failure);
    await pair.stop();
    for (const name of sessionNames(pair.key)) assert.equal(await has(name), false);
  } finally { await pair.stop(); await rm(root, { recursive: true, force: true }); }
});

test('SIGKILL of owning parent leaves neither tmux workers nor detached tool descendants', { timeout: 15000 }, async () => {
  const root = await mkdtemp('/tmp/ai-test-');
  const owner = spawn(process.execPath, [fileURLToPath(new URL('./owner.mjs', import.meta.url)), root], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  owner.stdout.on('data', (data) => { stdout += data; });
  owner.stderr.on('data', (data) => { stderr += data; });
  try {
    await wait(() => stdout.includes('\n'));
    const { key } = JSON.parse(stdout.trim());
    const pids = await Promise.all(['architect', 'implementor'].map(async (r) => Number(await readFile(join(root, `${r}.pid`), 'utf8'))));
    assert.ok(pids.every(alive));
    owner.kill('SIGKILL');
    await wait(async () => (await Promise.all(sessionNames(key).map(has))).every((x) => !x));
    await wait(() => pids.every((pid) => !alive(pid)));
    await reapOrphans(root, Date.now() + 120000);
    await assert.rejects(access(join(root, key)));
    assert.equal(stderr, '');
  } finally { owner.kill('SIGKILL'); await rm(root, { recursive: true, force: true }); }
});

test('unsupported effort fails startup without leaving workers', { timeout: 15000 }, async () => {
  const root = await mkdtemp('/tmp/ai-test-');
  const cfg = config();
  const pair = new WorkerPair(cfg, '/tmp', 'bad-effort', () => {}, () => {}, { root, boot: boot(cfg, { MOCK_THINKING: 'off' }) });
  try {
    await assert.rejects(pair.start(), /effort high unsupported/);
    for (const name of sessionNames(pair.key)) assert.equal(await has(name), false);
  } finally { await pair.stop(); await rm(root, { recursive: true, force: true }); }
});

test('startup child spawn failure rolls back both tmux sessions', { timeout: 15000 }, async () => {
  const root = await mkdtemp('/tmp/ai-test-');
  const cfg = config();
  const pair = new WorkerPair(cfg, '/tmp', 'bad-executable', () => {}, () => {}, { root, boot: () => ({ command: '/definitely-not-a-pi-executable', args: [], cwd: '/tmp', env: {} }) });
  try {
    await assert.rejects(pair.start());
    for (const name of sessionNames(pair.key)) assert.equal(await has(name), false);
  } finally { await pair.stop(); await rm(root, { recursive: true, force: true }); }
});

test('orphan reap only removes exact stale pair names, preserving fresh pairs and unrelated tmux', { timeout: 10000 }, async () => {
  const root = await mkdtemp('/tmp/ai-test-');
  const stale = 'a'.repeat(24), fresh = 'b'.repeat(24);
  const unrelated = `ai-test-unrelated-${process.pid}`;
  try {
    for (const key of [stale, fresh]) {
      await mkdir(join(root, key));
      await writeFile(join(root, key, 'lease.json'), JSON.stringify({ heartbeat: key === stale ? Date.now() - 120000 : Date.now() }));
      for (const name of sessionNames(key)) await tmux(['new-session', '-d', '-s', name, '/bin/sleep', '120']);
    }
    await tmux(['new-session', '-d', '-s', unrelated, '/bin/sleep', '120']);
    await reapOrphans(root);
    for (const name of sessionNames(stale)) assert.equal(await has(name), false);
    for (const name of sessionNames(fresh)) assert.equal(await has(name), true);
    assert.equal(await has(unrelated), true);
  } finally {
    for (const name of [...sessionNames(stale), ...sessionNames(fresh), unrelated]) await tmux(['kill-session', '-t', `=${name}`]).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});
