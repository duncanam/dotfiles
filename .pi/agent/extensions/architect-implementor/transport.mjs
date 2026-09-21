import { createServer } from 'node:net';
import { mkdir, writeFile, rename, readdir, readFile, rm, lstat, chmod } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { levels, workerArgs } from './config.mjs';
import { jsonLines, send } from './wire.mjs';
const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
export const runtimeRoot = `/tmp/pi-ai-${process.getuid?.() ?? 'user'}`;
export const sessionName = (key) => `ai-${key}-implementor`;
const tmux = (args) => exec('tmux', ['-L', 'pi-ai', '-f', '/dev/null', ...args], { timeout: 5000, maxBuffer: 1024 * 1024 });
export async function secureRoot(root = runtimeRoot) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid())) throw new Error(`Unsafe runtime directory: ${root}`);
  await chmod(root, 0o700);
}
export async function reapOrphans(root = runtimeRoot, now = Date.now()) {
  await secureRoot(root);
  for (const name of await readdir(root)) {
    if (!/^[a-f0-9]{24}$/.test(name)) continue;
    const dir = join(root, name);
    const stat = await lstat(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
    let heartbeat = stat.mtimeMs;
    try {
      const value = Number(JSON.parse(await readFile(join(dir, 'lease.json'), 'utf8')).heartbeat);
      if (Number.isFinite(value)) heartbeat = value;
    } catch {}
    if (now - heartbeat < 60000) continue;
    // Also reap owned, stale architect sessions left by the old two-worker version.
    for (const session of [sessionName(name), `ai-${name}-architect`]) await tmux(['kill-session', '-t', `=${session}`]).catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
}

export class Implementor {
  socket;
  pending = new Map();
  seq = 0;
  stopped = false;
  stopPromise;
  outgoing = Promise.resolve();
  running = false;
  constructor(config, cwd, sessionId, onEvent, onFailure, options = {}) {
    this.config = config; this.cwd = cwd; this.onEvent = onEvent; this.onFailure = onFailure;
    this.key = createHash('sha256').update(`${sessionId}:${process.pid}:${randomBytes(32).toString('hex')}`).digest('hex').slice(0, 24);
    this.root = options.root ?? runtimeRoot;
    this.dir = join(this.root, this.key);
    this.socketPath = join(this.dir, 'rpc.sock');
    this.token = randomBytes(32).toString('hex');
    this.options = options;
  }
  fail(error) {
    if (this.stopped) return;
    this.onFailure(error instanceof Error ? error : new Error(String(error)));
    void this.stop();
  }
  async lease() {
    if (this.stopped) return;
    const path = join(this.dir, 'lease.json');
    await writeFile(`${path}.tmp`, JSON.stringify({ heartbeat: Date.now(), pid: process.pid }), { mode: 0o600 });
    if (!this.stopped) await rename(`${path}.tmp`, path);
  }
  async start() {
    try {
      await reapOrphans(this.root);
      if (this.stopped) throw new Error('Startup cancelled');
      await mkdir(this.dir, { mode: 0o700 });
      await this.lease();
      if (this.stopped) throw new Error('Startup cancelled');
      this.server = createServer((socket) => {
        let authenticated = false;
        const timer = setTimeout(() => socket.destroy(), 5000);
        socket.on('error', () => socket.destroy());
        socket.on('close', () => { clearTimeout(timer); if (authenticated && !this.stopped) this.fail(new Error('Implementor disconnected')); });
        jsonLines(socket, (packet) => {
          if (!authenticated) {
            if (this.stopped || packet.hello !== 'implementor' || packet.token !== this.token || this.socket) { socket.destroy(); return; }
            authenticated = true;
            clearTimeout(timer);
            this.socket = socket;
            const env = { ...process.env };
            for (const key of ['PI_SESSION_ID', 'PI_SESSION_FILE', 'PI_PROVIDER', 'PI_MODEL', 'PI_REASONING_LEVEL', 'PI_CODING_AGENT_SESSION_DIR', 'TMUX', 'TMUX_PANE']) delete env[key];
            env.PI_AI_WORKER = JSON.stringify({ config: this.config });
            env.PI_SKIP_VERSION_CHECK = '1';
            const boot = this.options.boot?.() ?? {
              command: this.config.piCommand,
              args: workerArgs(this.config, join(here, 'worker.ts')),
              cwd: this.cwd, env,
            };
            send(socket, { type: 'boot', ...boot });
            return;
          }
          if (packet.type === 'bridge_error') { this.fail(new Error(`Implementor: ${packet.error}`)); return; }
          if (packet.type === 'response') {
            const pending = this.pending.get(packet.id);
            if (pending) {
              clearTimeout(pending.timer); this.pending.delete(packet.id);
              packet.success ? pending.resolve(packet.data) : pending.reject(new Error(`Implementor: ${packet.error}`));
            }
          }
          if (packet.type === 'agent_start') this.running = true;
          if (packet.type === 'agent_settled') this.running = false;
          this.onEvent(packet);
        }, (error) => { socket.destroy(); if (authenticated) this.fail(error); });
      });
      this.server.on('error', (error) => this.fail(error));
      await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(this.socketPath, resolve); });
      if (this.stopped) throw new Error('Startup cancelled');
      await chmod(this.socketPath, 0o600);
      await writeFile(join(this.dir, 'bridge.json'), JSON.stringify({ socket: this.socketPath, token: this.token, leaseMs: this.options.leaseMs ?? 20000 }), { mode: 0o600 });
      if (this.stopped) throw new Error('Startup cancelled');
      this.heartbeat = setInterval(() => {
        if (this.socket) { try { send(this.socket, { type: 'heartbeat' }); } catch (e) { this.fail(e); } }
        void this.lease().catch((e) => { if (!this.stopped) this.fail(e); });
      }, 2000);
      if (this.stopped) throw new Error('Startup cancelled');
      // Multi-argument shell-command avoids shell interpolation, including paths with spaces.
      this.launch = tmux(['new-session', '-d', '-s', sessionName(this.key), '-c', this.cwd,
        process.execPath, join(here, 'bridge.mjs'), join(this.dir, 'bridge.json')]);
      await this.launch;
      const deadline = Date.now() + 20000;
      while (!this.socket && Date.now() < deadline && !this.stopped) await new Promise((r) => setTimeout(r, 50));
      if (!this.socket || this.stopped) throw new Error('Implementor did not connect');
      const state = await this.rpc({ type: 'get_state' });
      const supported = await this.rpc({ type: 'get_available_thinking_levels' });
      const configured = this.config.implementor;
      if (state.model?.provider !== configured.provider || state.model?.id !== configured.model) throw new Error('Implementor: exact configured model was not selected');
      if (state.thinkingLevel !== configured.thinking || !supported.levels.includes(configured.thinking)) throw new Error(`Implementor: effort ${configured.thinking} unsupported (available: ${supported.levels.join(', ')})`);
    } catch (error) { await this.stop(); throw error; }
  }
  rpc(command, timeout = 20000) {
    return new Promise((resolve, reject) => {
      if (this.stopped || !this.socket) { reject(new Error('Implementor not connected')); return; }
      const id = `ai-${++this.seq}`;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Object.assign(new Error(`Implementor: ${command.type} timed out`), { code: 'RPC_TIMEOUT' }));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { send(this.socket, { type: 'rpc', command: { ...command, id } }); }
      catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e); }
    });
  }
  respondUi(id) {
    send(this.socket, { type: 'rpc', command: { type: 'extension_ui_response', id, cancelled: true } });
  }
  serialize(work) {
    const task = this.outgoing.then(() => {
      if (this.stopped) throw new Error('Implementor stopped');
      return work();
    });
    this.outgoing = task.catch(() => {});
    return task;
  }
  prompt(message) {
    return this.serialize(() => this.rpc({ type: 'prompt', message, streamingBehavior: 'steer' }));
  }
  changeModel(target, waitMs = 600000) {
    target = { provider: target.provider, model: target.model, thinking: target.thinking };
    if (!levels.includes(target.thinking) || !target.provider || !target.model) return Promise.reject(new Error('Invalid model/effort'));
    // Reserve the worker immediately: subsequent handoffs wait behind this change.
    return this.serialize(async () => {
      const deadline = Date.now() + waitMs;
      let before;
      while (!this.stopped) {
        if (!this.running) {
          before = await this.rpc({ type: 'get_state' });
          if (!this.running && !before.isStreaming && !before.isCompacting && !before.pendingMessageCount) break;
        }
        if (Date.now() >= deadline) throw new Error('Implementor: model change expired waiting for worker to settle; previous selection retained');
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (this.stopped) throw new Error('Implementor stopped');
      const models = await this.rpc({ type: 'get_available_models' });
      if (!models.models.some((m) => m.provider === target.provider && m.id === target.model)) throw new Error(`Implementor: model unavailable: ${target.provider}/${target.model}`);
      const previous = { provider: before.model.provider, model: before.model.id, thinking: before.thinkingLevel };
      const apply = async (desired) => {
        // Pi 0.85.1 setters are session-only; they do not persist global defaults.
        await this.rpc({ type: 'set_model', provider: desired.provider, modelId: desired.model });
        const supported = await this.rpc({ type: 'get_available_thinking_levels' });
        if (!supported.levels.includes(desired.thinking)) throw new Error(`Implementor: effort ${desired.thinking} unsupported (available: ${supported.levels.join(', ')})`);
        await this.rpc({ type: 'set_thinking_level', level: desired.thinking });
        const after = await this.rpc({ type: 'get_state' });
        if (after.model?.provider !== desired.provider || after.model?.id !== desired.model || after.thinkingLevel !== desired.thinking) throw new Error('Implementor: requested model/effort was not selected exactly');
      };
      try {
        await apply(target);
      } catch (error) {
        if (this.stopped) throw error;
        if (error.code === 'RPC_TIMEOUT') { this.fail(error); throw error; }
        try { await apply(previous); }
        catch (rollback) {
          const fatal = new Error(`Implementor: model change failed (${error.message}); rollback failed (${rollback.message})`);
          this.fail(fatal);
          throw fatal;
        }
        throw new Error(`${error.message}; previous model/effort restored`);
      }
      Object.assign(this.config.implementor, target);
      return target;
    });
  }
  stop() {
    if (this.stopPromise) return this.stopPromise;
    this.stopped = true;
    clearInterval(this.heartbeat);
    this.stopPromise = (async () => {
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Implementor stopped')); }
      this.pending.clear();
      if (this.socket) { try { send(this.socket, { type: 'stop' }); } catch {} }
      // A cancelled startup must not create its tmux session after cleanup finishes.
      await this.launch?.catch(() => {});
      // Allow the bridge to terminate the entire process tree before removing its pane.
      await new Promise((r) => setTimeout(r, 1600));
      await tmux(['kill-session', '-t', `=${sessionName(this.key)}`]).catch(() => {});
      this.socket?.destroy(); this.socket = undefined;
      this.server?.close();
      await rm(this.dir, { recursive: true, force: true });
    })();
    return this.stopPromise;
  }
}
