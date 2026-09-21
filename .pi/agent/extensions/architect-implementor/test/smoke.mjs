// Real Pi integration. No model prompts/calls: only extension and RPC commands.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig, configPath, agentDir } from '../config.mjs';
import { Implementor, sessionName } from '../transport.mjs';
import { jsonLines, send } from '../wire.mjs';
const defaults = loadConfig();
const paths = [configPath(), join(agentDir(), 'settings.json')];
const snapshot = () => Promise.all(paths.map((p) => readFile(p, 'utf8').catch((e) => { if (e.code === 'ENOENT') return undefined; throw e; })));
const settingsBefore = await snapshot();
const exec = promisify(execFile), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tmux = async (args) => (await exec('tmux', ['-L', 'pi-ai', ...args], { timeout: 5000 })).stdout;
const sessions = async () => (await tmux(['list-sessions', '-F', '#{session_name}']).catch(() => '')).trim().split('\n').filter(Boolean);
async function wait(fn, ms = 15000) { const end = Date.now() + ms; while (!await fn()) { if (Date.now() > end) throw new Error('Smoke timed out'); await sleep(50); } }
const probe = fileURLToPath(new URL('./host-smoke.ts', import.meta.url));
const workerConfig = structuredClone(defaults); workerConfig.implementor.extensions.push(probe);
let failure;
const worker = new Implementor(workerConfig, process.cwd(), 'real-startup-smoke', (event) => {
  if (event.type === 'extension_error') failure = new Error(event.error);
}, (error) => { failure = error; });
try {
  await worker.start();
  const state = await worker.rpc({ type: 'get_state' }), commands = await worker.rpc({ type: 'get_commands' });
  assert.equal(state.messageCount, 0); assert.ok(commands.commands.some((c) => c.name === 'ai-control'));
  const screen = await tmux(['capture-pane', '-p', '-J', '-t', `${sessionName(worker.key)}:0.0`, '-S', '-100']); assert.match(screen, /Implementor.*live activity/);
  await worker.changeModel(defaults.architect); await worker.changeModel(defaults.implementor);
  const restored = await worker.rpc({ type: 'get_state' });
  assert.equal(restored.sessionId, state.sessionId); assert.equal(restored.messageCount, 0);
  assert.equal(restored.model.provider, state.model.provider); assert.equal(restored.model.id, state.model.id); assert.equal(restored.thinkingLevel, state.thinkingLevel);
  if (failure) throw failure;
  console.log('Real implementor: configured tools loaded, model switch/restore retained session; zero messages.');
} finally { await worker.stop(); assert.deepEqual(await snapshot(), settingsBefore); }

const priorSessions = await sessions();
const env = { ...process.env, PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1' };
for (const key of ['PI_AI_WORKER', 'PI_AI_BRIDGE_PID', 'PI_SESSION_ID', 'PI_SESSION_FILE', 'PI_PROVIDER', 'PI_MODEL', 'PI_REASONING_LEVEL', 'PI_CODING_AGENT_SESSION_DIR', 'TMUX', 'TMUX_PANE']) delete env[key];
const main = spawn(defaults.piCommand, ['--mode', 'rpc', '--no-session', '--no-approve', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files',
  '-e', fileURLToPath(new URL('../index.ts', import.meta.url)), '-e', probe,
  '--provider', defaults.implementor.provider, '--model', defaults.implementor.model, '--thinking', defaults.implementor.thinking], { cwd: process.cwd(), env, stdio: ['pipe', 'pipe', 'pipe'] });
const pending = new Map(), events = []; let seq = 0, stderr = '', exited = false, exitCode;
main.stderr.setEncoding('utf8'); main.stderr.on('data', (text) => { stderr += text; });
main.on('error', (error) => { failure = error; });
main.on('exit', (code) => { exited = true; exitCode = code; for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error(`Main Pi exited ${code}: ${stderr}`)); } pending.clear(); });
jsonLines(main.stdout, (event) => {
  events.push(event);
  if (event.type === 'extension_error') failure = new Error(event.error);
  if (event.type === 'response') {
    const request = pending.get(event.id);
    if (request) { clearTimeout(request.timer); pending.delete(event.id); event.success ? request.resolve(event.data) : request.reject(new Error(event.error)); }
  }
}, (error) => { failure = error; });
function rpc(command) {
  return new Promise((resolve, reject) => {
    if (exited) { reject(new Error(`Main Pi exited ${exitCode}: ${stderr}`)); return; }
    const id = `smoke-${++seq}`, timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC ${command.type} timed out: ${stderr}`)); }, 25000);
    pending.set(id, { resolve, reject, timer }); send(main.stdin, { ...command, id });
  });
}
const command = (message) => rpc({ type: 'prompt', message });
async function tools() {
  await command('/pair-smoke-tools');
  return JSON.parse(events.filter((e) => e.method === 'notify' && e.message?.startsWith('SMOKE_TOOLS ')).at(-1).message.slice(12));
}
try {
  const before = await rpc({ type: 'get_state' }); assert.equal(before.messageCount, 0); assert.ok(!(await tools()).includes('ai_directive'));
  await command('/pair-enable');
  if (failure) throw failure;
  const enabled = await rpc({ type: 'get_state' });
  assert.equal(enabled.sessionId, before.sessionId); assert.equal(enabled.messageCount, 0);
  assert.equal(enabled.model.provider, defaults.architect.provider); assert.equal(enabled.model.id, defaults.architect.model); assert.equal(enabled.thinkingLevel, defaults.architect.thinking);
  assert.ok((await tools()).includes('ai_directive'));
  const added = (await sessions()).filter((name) => !priorSessions.includes(name)); assert.equal(added.length, 1); assert.match(added[0], /-implementor$/);
  await rpc({ type: 'set_model', provider: defaults.implementor.provider, modelId: defaults.implementor.model });
  await rpc({ type: 'set_thinking_level', level: defaults.implementor.thinking });
  await command(`/pair-models ${defaults.architect.provider}/${defaults.architect.model} ${defaults.architect.thinking}`);
  await wait(() => events.some((e) => e.method === 'notify' && e.message?.includes(`Implementor: ${defaults.architect.provider}/${defaults.architect.model} · ${defaults.architect.thinking} for this pair only`)));
  await command('/pair-models reset');
  await wait(() => events.some((e) => e.method === 'notify' && e.message?.includes(`Implementor: ${defaults.implementor.provider}/${defaults.implementor.model} · ${defaults.implementor.thinking} for this pair only`)));
  await command('/pair-disable'); assert.deepEqual(await sessions(), priorSessions); assert.ok(!(await tools()).includes('ai_directive'));
  const disabled = await rpc({ type: 'get_state' });
  assert.equal(disabled.sessionId, before.sessionId); assert.equal(disabled.messageCount, 0); assert.equal(disabled.model.id, defaults.implementor.model); assert.equal(disabled.thinkingLevel, defaults.implementor.thinking);
  await command('/pair-enable'); await command('/pair-smoke-quit'); await wait(() => exited);
  assert.equal(exitCode, 0); assert.deepEqual(await sessions(), priorSessions); assert.ok(!events.some((e) => e.type === 'agent_start'));
  if (failure) throw failure;
  console.log('Real native architect: JSON defaults applied, native model control independent, one tmux worker, overrides/reset and shutdown verified; zero model turns.');
} finally {
  if (!exited) { await command('/pair-disable').catch(() => {}); await command('/pair-smoke-quit').catch(() => {}); }
  if (!exited) { main.kill('SIGTERM'); await wait(() => exited).catch(() => main.kill('SIGKILL')); }
  assert.deepEqual(await snapshot(), settingsBefore, 'extension config and Pi settings remain unchanged');
}
