// Runs as the tmux pane's foreground process. No model output is persisted to disk.
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { jsonLines, send } from './wire.mjs';

const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const role = process.argv[3];
const socket = connect(spec.socket);
let child, closing = false, lastHeartbeat = Date.now();
function descendants(pid) {
  try {
    const rows = execFileSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8', timeout: 2000 }).trim().split('\n').map((line) => line.trim().split(/\s+/).map(Number));
    const found = new Set([pid]);
    for (let changed = true; changed;) {
      changed = false;
      for (const [id, parent] of rows) if (found.has(parent) && !found.has(id)) { found.add(id); changed = true; }
    }
    return [...found].reverse();
  } catch { return [pid]; }
}
function kill(pid, signal) { try { process.kill(pid, signal); } catch {} }
function stop() {
  if (closing) return;
  closing = true;
  clearInterval(watchdog);
  const pids = child?.pid ? descendants(child.pid) : [];
  if (child?.stdin.writable) {
    try { send(child.stdin, { type: 'clear_queue' }); send(child.stdin, { type: 'abort' }); } catch {}
  }
  // Capture descendants before reparenting, including Pi's detached bash process groups.
  for (const pid of pids) kill(pid, 'SIGTERM');
  if (child?.pid) kill(-child.pid, 'SIGTERM');
  setTimeout(() => {
    for (const pid of pids) kill(pid, 'SIGKILL');
    if (child?.pid) kill(-child.pid, 'SIGKILL');
    socket.destroy();
    process.exit(0);
  }, 1200);
}
const watchdog = setInterval(() => { if (Date.now() - lastHeartbeat > (spec.leaseMs ?? 20000)) stop(); }, 500);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, stop);
socket.on('error', stop);
socket.on('close', stop);
socket.on('connect', () => send(socket, { hello: role, token: spec.tokens[role] }));
jsonLines(socket, (packet) => {
  if (packet.type === 'heartbeat') { lastHeartbeat = Date.now(); return; }
  if (packet.type === 'stop') { stop(); return; }
  if (packet.type === 'boot' && !child && !closing) {
    child = spawn(packet.command, packet.args, { cwd: packet.cwd, env: { ...packet.env, PI_AI_BRIDGE_PID: String(process.pid) }, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child.on('error', (e) => { try { send(socket, { type: 'bridge_error', error: e.message }); } finally { stop(); } });
    child.on('exit', (code, signal) => { if (!closing) { try { send(socket, { type: 'bridge_error', error: `Pi exited (${code ?? signal})` }); } finally { stop(); } } });
    child.stdin.on('error', stop);
    jsonLines(child.stdout, (event) => { if (!closing) send(socket, event); }, stop);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (text) => { if (!closing) { try { send(socket, { type: 'bridge_stderr', text: text.slice(-8000) }); } catch { stop(); } } });
  } else if (packet.type === 'rpc' && child && !closing) send(child.stdin, packet.command);
}, stop);
