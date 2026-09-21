import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { connect } from 'node:net';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, mkdir, writeFile, access, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig } from '../config.mjs';
import { Implementor, sessionName, reapOrphans } from '../transport.mjs';
const exec = promisify(execFile);
const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fake-rpc.mjs');
const config = () => validateConfig({ version: 2, architect: { provider: 'mock', model: 'frontier', thinking: 'high' }, implementor: { provider: 'mock', model: 'small', thinking: 'low' } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait(fn, timeout = 7000) { const end = Date.now() + timeout; while (!await fn()) { if (Date.now() > end) throw new Error('Timed out waiting'); await sleep(50); } }
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const tmux = (args) => exec('tmux', ['-L', 'pi-ai', '-f', '/dev/null', ...args], { timeout: 5000 });
async function has(name) { return tmux(['has-session', '-t', `=${name}`]).then(() => true, () => false); }
const names = (key) => [sessionName(key), `ai-${key}-architect`];
function boot(config, extra = {}) {
  return () => ({ command: process.execPath, args: [fixture], cwd: '/tmp', env: { ...process.env, MOCK_PROVIDER: config.implementor.provider, MOCK_MODEL: config.implementor.model, MOCK_THINKING: config.implementor.thinking, MOCK_PASSIVE: '1', ...extra } });
}

test('one inspectable tmux worker retains context, authenticates RPC, cancels UI and cleans its tree idempotently', { timeout: 20000 }, async () => {
  const root = await mkdtemp('/tmp/ai-test-'), childFile = join(root, 'descendant');
  const cfg = config(), events = []; let failure;
  const worker = new Implementor(cfg, '/tmp', 'parent-session', (e) => events.push(e), (e) => { failure = e; }, { root, boot: boot(cfg, { MOCK_DESCENDANT_FILE: childFile }) });
  try {
    await worker.start();
    assert.equal(await has(sessionName(worker.key)), true); assert.equal(await has(names(worker.key)[1]), false, 'no architect tmux');
    assert.equal((await stat(worker.dir)).mode & 0o777, 0o700);
    assert.equal((await stat(worker.socketPath)).mode & 0o777, 0o600);
    const socket = worker.socket;
    const unauthorized = connect(worker.socketPath);
    unauthorized.on('error', () => {});
    unauthorized.on('connect', () => unauthorized.write(JSON.stringify({ hello: 'implementor', token: 'wrong' }) + '\n'));
    await new Promise((resolve) => unauthorized.on('close', resolve));
    assert.equal(worker.socket, socket);
    await Promise.all(Array.from({ length: 20 }, (_, i) => worker.prompt(`Task ${i}\x1b]0;unsafe-title\x07`)));
    assert.equal(worker.socket, socket);
    await wait(() => events.filter((e) => e.type === 'test_prompt').length === 20);
    const screen = (await tmux(['capture-pane', '-p', '-J', '-t', `${sessionName(worker.key)}:0.0`, '-S', '-200'])).stdout;
    assert.match(screen, /Implementor.*live activity/); assert.match(screen, /\[architect\] Task 19/); assert.doesNotMatch(screen, /unsafe-title|\x1b/);
    worker.respondUi('dialog-original-id');
    await wait(() => events.some((e) => e.type === 'test_ui_response'));
    assert.equal(events.find((e) => e.type === 'test_ui_response').value.id, 'dialog-original-id');
    const pid = Number(await readFile(childFile, 'utf8')); assert.ok(alive(pid));
    await Promise.all([worker.stop(), worker.stop()]);
    await wait(() => !alive(pid)); assert.equal(await has(sessionName(worker.key)), false);
    await assert.rejects(access(worker.dir)); assert.equal(failure, undefined);
  } finally { await worker.stop(); await rm(root, { recursive: true, force: true }); }
});

test('live implementor model changes wait through retry gaps, hold handoffs and preserve context', { timeout: 15000 }, async () => {
  const root = await mkdtemp('/tmp/ai-model-test-'); const cfg = config(), events = []; let failure;
  const worker = new Implementor(cfg, '/tmp', 'switch-model', (e) => events.push(e), (e) => { failure = e; }, { root, boot: boot(cfg, { MOCK_BUSY_MS: '600', MOCK_RETRY_GAP: '1' }) });
  try {
    await worker.start(); const socket = worker.socket;
    await worker.prompt('first task'); await wait(() => worker.running);
    const before = await worker.rpc({ type: 'get_state' }); assert.equal(before.isStreaming, false, 'retry gap is not settled');
    const change = worker.changeModel({ provider: 'other', model: 'vendor/model', thinking: 'medium' });
    const next = worker.prompt('second task'); await sleep(100);
    assert.equal((await worker.rpc({ type: 'get_state' })).model.id, 'small');
    assert.equal(events.filter((e) => e.type === 'test_prompt').length, 1);
    await change; await next; await wait(() => events.filter((e) => e.type === 'test_prompt').length === 2);
    const after = await worker.rpc({ type: 'get_state' });
    assert.equal(after.sessionId, before.sessionId); assert.equal(after.messageCount, before.messageCount + 1); assert.equal(worker.socket, socket);
    const prompt = events.filter((e) => e.type === 'test_prompt').at(-1);
    assert.equal(prompt.model, 'vendor/model'); assert.equal(prompt.provider, 'other'); assert.equal(prompt.thinking, 'medium');
    assert.equal(cfg.architect.model, 'frontier'); assert.equal(failure, undefined);
  } finally { await worker.stop(); await rm(root, { recursive: true, force: true }); }
});

test('independent bridge lease expires if parent heartbeats stop', { timeout: 15000 }, async () => {
  const root = await mkdtemp('/tmp/ai-test-'), cfg = config(); let failure;
  const worker = new Implementor(cfg, '/tmp', 'frozen-parent', () => {}, (e) => { failure = e; }, { root, boot: boot(cfg), leaseMs: 1000 });
  try {
    await worker.start(); clearInterval(worker.heartbeat); await wait(() => !!failure); await worker.stop();
    assert.equal(await has(sessionName(worker.key)), false);
  } finally { await worker.stop(); await rm(root, { recursive: true, force: true }); }
});

test('SIGKILL of owning parent leaves neither implementor tmux nor detached tool descendants', { timeout: 15000 }, async () => {
  const root = await mkdtemp('/tmp/ai-test-');
  const owner = spawn(process.execPath, [fileURLToPath(new URL('./owner.mjs', import.meta.url)), root], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = ''; owner.stdout.on('data', (data) => { stdout += data; }); owner.stderr.on('data', (data) => { stderr += data; });
  try {
    await wait(() => stdout.includes('\n')); const { key } = JSON.parse(stdout.trim());
    const pid = Number(await readFile(join(root, 'implementor.pid'), 'utf8')); assert.ok(alive(pid)); owner.kill('SIGKILL');
    await wait(async () => !await has(sessionName(key))); await wait(() => !alive(pid));
    await reapOrphans(root, Date.now() + 120000); await assert.rejects(access(join(root, key))); assert.equal(stderr, '');
  } finally { owner.kill('SIGKILL'); await rm(root, { recursive: true, force: true }); }
});

test('unsupported effort and spawn failure roll back the single worker', { timeout: 15000 }, async () => {
  const root = await mkdtemp('/tmp/ai-test-'), cfg = config();
  try {
    for (const launch of [boot(cfg, { MOCK_THINKING: 'off' }), () => ({ command: '/definitely-not-a-pi-executable', args: [], cwd: '/tmp', env: {} })]) {
      const worker = new Implementor(cfg, '/tmp', 'bad-startup', () => {}, () => {}, { root, boot: launch });
      await assert.rejects(worker.start()); await worker.stop();
      for (const name of names(worker.key)) assert.equal(await has(name), false);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('cancelling startup cannot leave a late tmux session or heartbeat', { timeout: 10000 }, async () => {
  const root = await mkdtemp('/tmp/ai-test-'), cfg = config();
  const worker = new Implementor(cfg, '/tmp', 'cancel-start', () => {}, () => {}, { root, boot: boot(cfg) });
  try {
    const starting = assert.rejects(worker.start(), /cancelled|stopped|connect/i); await worker.stop(); await starting;
    assert.equal(await has(sessionName(worker.key)), false); await assert.rejects(access(worker.dir));
  } finally { await worker.stop(); await rm(root, { recursive: true, force: true }); }
});

test('orphan reap removes exact stale sessions including legacy architects, preserving fresh pairs and unrelated tmux', { timeout: 10000 }, async () => {
  const root = await mkdtemp('/tmp/ai-test-'), stale = 'a'.repeat(24), fresh = 'b'.repeat(24), unrelated = `ai-test-unrelated-${process.pid}`;
  try {
    for (const key of [stale, fresh]) {
      await mkdir(join(root, key)); await writeFile(join(root, key, 'lease.json'), JSON.stringify({ heartbeat: key === stale ? Date.now() - 120000 : Date.now() }));
      for (const name of names(key)) await tmux(['new-session', '-d', '-s', name, '/bin/sleep', '120']);
    }
    await tmux(['new-session', '-d', '-s', unrelated, '/bin/sleep', '120']); await reapOrphans(root);
    for (const name of names(stale)) assert.equal(await has(name), false);
    for (const name of names(fresh)) assert.equal(await has(name), true);
    assert.equal(await has(unrelated), true);
  } finally {
    for (const name of [...names(stale), ...names(fresh), unrelated]) await tmux(['kill-session', '-t', `=${name}`]).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});
