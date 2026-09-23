import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsonLines, send } from '../wire.mjs';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('real Pi stays idle during unsolicited progress, then reviews, corrects and accepts on completion (no API)', { timeout: 30000 }, async () => {
  const root = await mkdtemp('/tmp/pair-native-loop-');
  const provider = fileURLToPath(new URL('./mock-provider.ts', import.meta.url));
  await writeFile(join(root, 'architect-implementor.json'), JSON.stringify({ version: 2,
    architect: { provider: 'pair-fixture', model: 'architect', thinking: 'high' },
    implementor: { provider: 'pair-fixture', model: 'implementor', thinking: 'high', extensions: [provider] },
  }));
  const env = { ...process.env, PI_CODING_AGENT_DIR: root, PI_OFFLINE: '1' };
  for (const name of ['PI_AI_WORKER', 'PI_AI_BRIDGE_PID', 'PI_SESSION_ID', 'PI_SESSION_FILE', 'PI_PROVIDER', 'PI_MODEL', 'PI_REASONING_LEVEL', 'PI_CODING_AGENT_SESSION_DIR', 'TMUX', 'TMUX_PANE']) delete env[name];
  const child = spawn('pi', ['--mode', 'rpc', '--no-session', '--no-approve', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files',
    '-e', fileURLToPath(new URL('../index.ts', import.meta.url)), '-e', provider, '--provider', 'pair-fixture', '--model', 'architect', '--thinking', 'high'], { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(), events = []; let seq = 0, stderr = '', exited = false;
  const closed = new Promise((resolve) => child.once('exit', resolve));
  child.stderr.on('data', (data) => { stderr += data; });
  child.on('exit', () => { exited = true; for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error(stderr || 'Pi exited')); } pending.clear(); });
  jsonLines(child.stdout, (event) => {
    events.push(event); const p = event.type === 'response' && pending.get(event.id);
    if (p) { clearTimeout(p.timer); pending.delete(event.id); event.success ? p.resolve(event.data) : p.reject(new Error(event.error)); }
  }, (error) => { stderr += String(error); });
  const rpc = (command) => new Promise((resolve, reject) => {
    const id = `test-${++seq}`, timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC timed out: ${stderr}`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); send(child.stdin, { ...command, id });
  });
  try {
    await rpc({ type: 'set_auto_retry', enabled: false });
    await rpc({ type: 'prompt', message: '/pair-enable Complete the fixture task. MAIN_ONLY_SENTINEL' });
    const waitMessage = async (text) => {
      const deadline = Date.now() + 15000;
      while (!events.some((e) => e.type === 'message_end' && JSON.stringify(e.message).includes(text))) {
        const errors = events.filter((e) => e.type === 'extension_error' || e.type === 'message_end' && e.message?.stopReason === 'error' || e.method === 'notify' && e.notifyType === 'error');
        assert.equal(errors.length, 0, JSON.stringify(errors)); assert.ok(Date.now() < deadline, JSON.stringify(events.slice(-8)) + stderr); await sleep(30);
      }
    };
    for (const pass of [1, 2]) {
      await waitMessage(`Starting fixture pass ${pass}`);
      assert.equal((await rpc({ type: 'get_state' })).isStreaming, false, 'routine progress must not start an architect turn');
      const { messages } = await rpc({ type: 'get_messages' });
      assert.equal(messages.filter((m) => m.role === 'assistant').length, 2 * pass - 1, 'no parallel investigation after startup/correction status');
      await writeFile(join(root, `fixture-continue-${pass === 1 ? 1 : 4}`), 'continue');
    }
    await waitMessage('Native architect accepted the corrected fixture.');
    assert.equal(await readFile(join(root, 'proof.txt'), 'utf8'), 'corrected\n');
    const { messages } = await rpc({ type: 'get_messages' });
    assert.equal(messages.filter((m) => m.role === 'custom' && m.customType === 'pair-update' && m.content.includes('Implementor done')).length, 2);
    assert.equal(messages.filter((m) => m.role === 'custom' && m.customType === 'pair-update' && m.content.includes('Implementor status')).length, 2, 'informational progress stays in the visible native history');
    assert.equal(messages.filter((m) => m.role === 'toolResult' && m.toolName === 'read').length, 2, 'independent native review after both completions');
    assert.equal(messages.filter((m) => m.role === 'toolResult' && m.toolName === 'ai_directive').length, 3);
    assert.doesNotMatch(JSON.stringify(messages), /PRIVATE_WORKER_SENTINEL|Current pair state: cycle/, 'worker transcript and transient state snapshots are not persisted in main history');
    assert.ok(!messages.some((m) => m.customType === 'pair-state'), 'the persisted system prompt may describe snapshots, but snapshots stay transient');
    await rpc({ type: 'prompt', message: '/pair-usage' });
    const usageNotice = events.filter((e) => e.method === 'notify' && e.message?.startsWith('Pair usage')).at(-1).message;
    assert.match(usageNotice, /Architect: 870 tok \/ \$0\.0600/);
    assert.match(usageNotice, /Implementor: 1740 tok \/ \$0\.1200/);
    assert.match(usageNotice, /Total: 2610 tok \/ \$0\.1800/);
    const stats = await rpc({ type: 'get_session_stats' });
    assert.equal(stats.tokens.total, 870, 'native session usage still excludes the worker');
    assert.ok(Math.abs(stats.cost - 0.06) < 1e-12, 'worker costs are not injected into native totals');
    await rpc({ type: 'prompt', message: '/pair-disable' });
    await rpc({ type: 'prompt', message: '/pair-usage' });
    assert.match(events.filter((e) => e.method === 'notify' && e.message?.startsWith('Pair usage')).at(-1).message, /last enable[\s\S]*Total: 2610 tok \/ \$0\.1800/);
    await rpc({ type: 'prompt', message: '/fixture-quit' });
    await Promise.race([closed, sleep(1000)]); assert.ok(exited, 'native host shuts down');
  } finally {
    if (!exited) {
      await rpc({ type: 'prompt', message: '/pair-disable' }).catch(() => {}); child.kill('SIGTERM');
      await Promise.race([closed, sleep(1000)]); if (!exited) child.kill('SIGKILL');
    }
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Test complete')); } pending.clear();
    await rm(root, { recursive: true, force: true });
  }
});
