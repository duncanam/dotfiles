// Runs as the tmux pane's foreground process. No model output is persisted to disk.
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { jsonLines, send, clean } from './wire.mjs';

const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
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
socket.on('connect', () => send(socket, { hello: 'implementor', token: spec.token }));
const display = (text) => process.stdout.write(clean(text));
const resultText = (result) => result?.content?.filter((c) => c.type === 'text').map((c) => c.text).join('\n') ?? '';
function inspect(event) {
  const delta = event.assistantMessageEvent;
  if (event.type === 'message_update' && delta?.type === 'text_delta') display(delta.delta);
  if (event.type === 'agent_start') display('\n[working]\n');
  if (event.type === 'agent_settled') display('\n[idle — awaiting architect]\n');
  if (event.type === 'tool_execution_start') display(`\n[tool ${event.toolName}] ${JSON.stringify(event.args).slice(0, 1500)}\n`);
  if (event.type === 'tool_execution_end') display(`\n[${event.isError ? 'ERROR' : 'result'} ${event.toolName}] ${resultText(event.result).slice(-4000)}\n`);
  if (event.type === 'auto_retry_start' || event.type === 'extension_error') display(`\n[${event.type}] ${event.errorMessage ?? event.error ?? ''}\n`);
  if (event.type === 'message_end' && event.message?.role === 'assistant' && ['error', 'aborted'].includes(event.message.stopReason)) display(`\n[model ${event.message.stopReason}] ${event.message.errorMessage ?? ''}\n`);
}
jsonLines(socket, (packet) => {
  if (packet.type === 'heartbeat') { lastHeartbeat = Date.now(); return; }
  if (packet.type === 'stop') { stop(); return; }
  if (packet.type === 'boot' && !child && !closing) {
    display('○ Implementor · live activity (inspect with tmux attach -r)\n');
    child = spawn(packet.command, packet.args, { cwd: packet.cwd, env: { ...packet.env, PI_AI_BRIDGE_PID: String(process.pid) }, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child.on('error', (e) => { try { send(socket, { type: 'bridge_error', error: e.message }); } finally { stop(); } });
    child.on('exit', (code, signal) => { if (!closing) { try { send(socket, { type: 'bridge_error', error: `Pi exited (${code ?? signal})` }); } finally { stop(); } } });
    child.stdin.on('error', stop);
    jsonLines(child.stdout, (event) => { if (!closing) { send(socket, event); inspect(event); } }, stop);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (text) => { if (!closing) { try { send(socket, { type: 'bridge_stderr', text: text.slice(-8000) }); display(text.slice(-8000)); } catch { stop(); } } });
  } else if (packet.type === 'rpc' && child && !closing) {
    if (packet.command.type === 'prompt') {
      let text = packet.command.message;
      try { const control = JSON.parse(Buffer.from(text.slice('/ai-control '.length), 'base64url').toString('utf8')); text = `${control.mode}, cycle ${control.cycle}: ${control.text}`; } catch {}
      display(`\n[architect] ${text.slice(0, 6000)}\n`);
    }
    send(child.stdin, packet.command);
  }
}, stop);
