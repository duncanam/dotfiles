// Runs as the tmux pane's foreground process. No model output is persisted to disk.
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { jsonLines, send, clean } from './wire.mjs';
import { heartbeatLease, watchdogIntervalMs, recordShutdown } from './supervision.mjs';

const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const socket = connect(spec.socket);
let child, closing = false;
const leaseMs = spec.leaseMs ?? 20000, lease = heartbeatLease(leaseMs);
// JSON parse errors can quote RPC/model output; never persist that excerpt.
const errorReason = (error) => error instanceof SyntaxError ? 'invalid JSON' : String(error?.code ?? error?.message ?? error);
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
function stop(reason) {
  if (closing) return;
  closing = true;
  clearInterval(watchdog);
  const record = recordShutdown(dirname(process.argv[2]), reason);
  // Record and send before killing anything; the first cause wins over exit/EOF.
  try { send(socket, { type: 'bridge_error', error: record.reason }); } catch {}
  try { display(`\n[stopped] ${record.reason}\n`); } catch {}
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
const watchdog = setInterval(() => { if (lease.expired()) stop(`Parent heartbeat timed out (${leaseMs}ms lease)`); }, watchdogIntervalMs);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => stop(`Bridge received ${sig}`));
socket.on('error', (error) => stop(`Parent socket error: ${errorReason(error)}`));
socket.on('close', () => stop('Parent socket closed'));
socket.on('connect', () => {
  try { send(socket, { hello: 'implementor', token: spec.token }); }
  catch (error) { stop(`Bridge handshake failed: ${errorReason(error)}`); }
});
process.stdout.on('error', (error) => stop(`Tmux output error: ${errorReason(error)}`));
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
  if (packet.type === 'heartbeat') { lease.heartbeat(); return; }
  if (packet.type === 'stop') { stop('Parent requested stop'); return; }
  if (packet.type === 'boot' && !child && !closing) {
    display('○ Implementor · live activity (inspect with tmux attach -r)\n');
    child = spawn(packet.command, packet.args, { cwd: packet.cwd, env: { ...packet.env, PI_AI_BRIDGE_PID: String(process.pid) }, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child.on('error', (error) => stop(`Pi process error: ${errorReason(error)}`));
    child.on('exit', (code, signal) => stop(`Pi exited (${signal ? `signal ${signal}` : `code ${code}`})`));
    child.stdin.on('error', (error) => stop(`Pi stdin error: ${errorReason(error)}`));
    jsonLines(child.stdout, (event) => { if (!closing) { send(socket, event); inspect(event); } }, (error) => stop(`Pi RPC stream error: ${errorReason(error)}`));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (text) => { if (!closing) { try { send(socket, { type: 'bridge_stderr', text: text.slice(-8000) }); display(text.slice(-8000)); } catch (error) { stop(`Pi stderr forwarding failed: ${errorReason(error)}`); } } });
  } else if (packet.type === 'rpc' && child && !closing) {
    if (packet.command.type === 'prompt') {
      let text = packet.command.message;
      try { const control = JSON.parse(Buffer.from(text.slice('/ai-control '.length), 'base64url').toString('utf8')); text = `${control.mode}, cycle ${control.cycle}: ${control.text}`; } catch {}
      display(`\n[architect] ${text.slice(0, 6000)}\n`);
    }
    send(child.stdin, packet.command);
  }
}, (error) => stop(`Parent RPC stream error: ${errorReason(error)}`));
