import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import extension from '../index.ts';
import worker from '../worker.ts';
import { routeEditor } from '../editor.ts';
import { WorkerPair } from '../transport.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait(fn, ms = 12000) { const end = Date.now() + ms; while (!fn()) { if (Date.now() > end) throw new Error('Timed out'); await sleep(30); } }
function api() {
  const events = new Map(), commands = new Map(), tools = new Map();
  return {
    events, commands, tools,
    on(name, fn) { events.set(name, fn); },
    registerCommand(name, c) { commands.set(name, c); },
    registerTool(t) { tools.set(t.name, t); },
    getAllTools() { return [...['read', 'bash', 'write', 'edit'], ...tools.keys()].map((name) => ({ name })); },
    setActiveTools() {},
    sendUserMessage() {},
  };
}

test('editor routes normal input, shell and parent-mutating slash commands without touching host; allows pair controls', () => {
  const sent = [], routed = [];
  const base = { setText() {}, addToHistory() {} };
  const editor = routeEditor(base, (text) => routed.push(text));
  editor.onSubmit = (text) => sent.push(text); // Exactly how Pi wires its callback.
  for (const text of ['hello', '!echo hi', '/compact', '/model', '/todo-enable']) editor.onSubmit(text);
  for (const text of ['/pair-enable another task', '/pair-disable', '/pair-models architect high', '/quit', '/reload']) editor.onSubmit(text);
  assert.deepEqual(routed, ['hello', '!echo hi', '/compact', '/model', '/todo-enable']);
  assert.deepEqual(sent, ['/pair-enable another task', '/pair-disable', '/pair-models architect high', '/quit', '/reload']);
});

test('implementor context survives cycles and done/blocked gates subsequent code tools', async () => {
  const previous = process.env.PI_AI_WORKER;
  process.env.PI_AI_WORKER = JSON.stringify({ role: 'implementor', cwd: '/tmp', config: { implementor: { extraTools: [] } } });
  try {
    const pi = api();
    const prompts = [];
    pi.sendUserMessage = (text) => prompts.push(text);
    worker(pi);
    pi.events.get('session_start')();
    const ctx = { sessionManager: { getBranch: () => [] } };
    assert.equal(pi.events.get('tool_call')({ toolName: 'write' }, ctx).block, true);
    const control = async (mode, cycle) => pi.commands.get('ai-control').handler(Buffer.from(JSON.stringify({ mode, cycle, text: 'task' })).toString('base64url'));
    await control('assign', 1);
    assert.equal(pi.events.get('tool_call')({ toolName: 'write' }, ctx), undefined);
    const result = await pi.tools.get('ai_report').execute('id', { kind: 'done', cycle: 1, text: 'done' });
    assert.equal(result.terminate, true);
    assert.equal(pi.events.get('tool_call')({ toolName: 'bash' }, ctx).block, true);
    pi.events.get('agent_settled')();
    assert.equal(pi.events.get('tool_call')({ toolName: 'write' }, ctx).block, true);
    await control('ping', 1);
    assert.equal(pi.events.get('tool_call')({ toolName: 'write' }, ctx).block, true, 'status ping does not resume coding');
    assert.equal((await pi.tools.get('ai_report').execute('status', { kind: 'status', cycle: 1, text: 'Still paused' })).terminate, undefined);
    await control('guide', 1);
    assert.equal(pi.events.get('tool_call')({ toolName: 'write' }, ctx), undefined, 'review guidance resumes the same cycle');
    await control('assign', 2);
    assert.equal(pi.events.get('tool_call')({ toolName: 'write' }, ctx), undefined);
    assert.equal(prompts.length, 4);
    const system = pi.events.get('before_agent_start')({ systemPrompt: 'base' }).systemPrompt;
    assert.match(system, /cycle: 2/);
    assert.match(system, /do not redesign architecture/);
    assert.deepEqual([...pi.tools.keys()], ['ai_report']);
  } finally { if (previous === undefined) delete process.env.PI_AI_WORKER; else process.env.PI_AI_WORKER = previous; }
});

test('architect has normal coding tools and extensions, delegates by instruction, and keeps ordered handoffs', async () => {
  const previous = process.env.PI_AI_WORKER;
  process.env.PI_AI_WORKER = JSON.stringify({ role: 'architect', cwd: '/tmp', config: { architect: { extraTools: ['context7_get_library_docs'] } } });
  try {
    const pi = api(); worker(pi);
    const ctx = { sessionManager: { getBranch: () => [{ type: 'message', message: { role: 'assistant', content: [{ type: 'toolCall' }, { type: 'toolCall' }] } }] } };
    for (const toolName of ['write', 'edit', 'bash', 'read', 'context7_get_library_docs']) assert.equal(pi.events.get('tool_call')({ toolName }, ctx), undefined);
    assert.equal(pi.events.get('tool_call')({ toolName: 'dynamic_extension_tool' }, ctx), undefined, 'Pi owns tool availability, not a second pair allowlist');
    assert.match(pi.events.get('tool_call')({ toolName: 'ai_directive' }, ctx).reason, /alone/);
    assert.deepEqual([...pi.tools.keys()], ['ai_directive']);
    let active;
    const getAll = pi.getAllTools;
    pi.getAllTools = () => [...getAll(), { name: 'context7_get_library_docs' }];
    pi.setActiveTools = (tools) => { active = tools; };
    pi.events.get('session_start')({}, ctx);
    for (const name of ['read', 'write', 'edit', 'bash', 'ai_directive', 'context7_get_library_docs']) assert.ok(active.includes(name));
    const policy = pi.events.get('before_agent_start')({ systemPrompt: 'base' }).systemPrompt;
    assert.match(policy, /Delegate substantive implementation/);
    assert.doesNotMatch(policy, /NEVER implement|restricted to the working directory|Bash is unavailable/);
    await pi.tools.get('ai_directive').execute('assign', { kind: 'assign', cycle: 0, text: 'task' });
    pi.events.get('agent_end')?.({ willRetry: true }, ctx);
    assert.equal(pi.events.get('tool_call')({ toolName: 'ai_directive' }, ctx).terminate, true, 'retry gap cannot replay a recorded directive');
    pi.events.get('agent_settled')();
    assert.equal(pi.events.get('tool_call')({ toolName: 'read' }, ctx), undefined);
  } finally { if (previous === undefined) delete process.env.PI_AI_WORKER; else process.env.PI_AI_WORKER = previous; }
});

// Deterministic event ordering/fault injection; the full test below still uses real tmux workers.
async function handoffHarness(t, onPrompt = () => {}) {
  const root = await mkdtemp('/tmp/pair-handoff-');
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  const pi = api(), messages = [], notices = [], statuses = [];
  let pair, widget;
  t.mock.method(WorkerPair.prototype, 'start', async function () { pair = this; });
  t.mock.method(WorkerPair.prototype, 'stop', async function () { this.stopped = true; });
  t.mock.method(WorkerPair.prototype, 'prompt', async function (role, message) {
    const control = message.startsWith('/ai-control ') ? JSON.parse(Buffer.from(message.slice(12), 'base64url').toString()) : undefined;
    const entry = { role, message, control };
    messages.push(entry);
    await onPrompt(entry);
  });
  const ctx = {
    mode: 'tui', cwd: root, isIdle: () => true, hasPendingMessages: () => false,
    sessionManager: { getSessionId: () => 'handoff-test' },
    ui: {
      notify: (text, level) => notices.push({ text, level }), setStatus: (_id, text) => statuses.push(text),
      getEditorComponent() {}, setEditorComponent() {},
      setWidget: (_id, factory) => { widget = factory?.({ terminal: { rows: 40 }, requestRender() {} }); },
    },
  };
  t.after(async () => {
    await pi.events.get('session_shutdown')?.();
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await rm(root, { recursive: true, force: true });
  });
  await writeFile(join(root, 'architect-implementor.json'), JSON.stringify({
    architect: { provider: 'mock', model: 'frontier' }, implementor: { provider: 'mock', model: 'small' },
  }));
  extension(pi);
  await pi.commands.get('pair-enable').handler('', ctx);
  await wait(() => statuses.at(-1)?.includes('active'));
  const emit = (role, event) => pair.onEvent(role, event);
  const send = (role, kind, cycle, text = kind) => {
    emit(role, { type: 'agent_start' });
    emit(role, { type: 'tool_execution_end', toolName: role === 'architect' ? 'ai_directive' : 'ai_report', result: { details: { ai: { kind, cycle, text } } } });
  };
  return { pi, pair, messages, notices, send, emit, settle: (role) => emit(role, { type: 'agent_settled' }),
    controls: (mode) => messages.filter((m) => m.role === 'implementor' && m.control?.mode === mode),
    display: () => widget.render(160).join('\n') };
}

test('review handoffs survive retry gaps and racing completion without losing, duplicating or rejecting guidance', async (t) => {
  const h = await handoffHarness(t);
  h.send('architect', 'assign', 0);
  h.emit('architect', { type: 'message_end', message: { role: 'assistant', stopReason: 'error', errorMessage: 'WebSocket error' } });
  h.emit('architect', { type: 'agent_end', willRetry: true });
  h.emit('architect', { type: 'auto_retry_start', attempt: 1, errorMessage: 'WebSocket error' });
  await sleep(20);
  assert.equal(h.controls('assign').length, 0, 'agent_end is not a safe handoff boundary');
  h.emit('architect', { type: 'agent_start' });
  h.emit('architect', { type: 'auto_retry_end', success: true });
  h.settle('architect');
  await wait(() => h.controls('assign').length === 1);
  h.send('implementor', 'done', 1); // Still settling its final tools/retries.
  for (const text of ['Fix the first review finding', 'Also fix the second finding']) {
    h.send('architect', 'guide', 1, text);
    h.settle('architect');
    await sleep(20);
  }
  assert.equal(h.controls('guide').length, 0);
  h.settle('implementor');
  await wait(() => h.controls('guide').length === 2);
  assert.deepEqual(h.controls('guide').map((m) => m.control.text), ['Fix the first review finding', 'Also fix the second finding']);
  assert.ok(h.controls('guide').every((m) => m.control.cycle === 1));
  assert.equal(h.messages.filter((m) => m.message.includes('Implementor done')).length, 1);
  assert.match(h.display(), /cycle 1 • implementing/);
  h.send('implementor', 'done', 1);
  h.settle('implementor');
  await wait(() => h.messages.filter((m) => m.message.includes('Implementor done')).length === 2);
  h.send('architect', 'ping', 1);
  h.settle('architect');
  await wait(() => h.controls('ping').length === 1);
  h.send('implementor', 'status', 1, 'The tests passed; awaiting review');
  h.settle('implementor');
  await wait(() => h.messages.some((m) => m.message.includes('Implementor status')));
  assert.match(h.display(), /cycle 1 • reviewing/);
  h.send('architect', 'accept', 1);
  h.settle('architect');
  await wait(() => h.notices.some((n) => n.text.includes('accepted')));
  assert.equal(h.controls('assign').length, 1);
  assert.ok(!h.messages.some((m) => m.message.includes('Protocol rejected')));
  assert.ok(!h.notices.some((n) => n.level === 'error'));
});

test('completion takes priority over queued guidance even when another RPC acknowledgement was in flight', async (t) => {
  let release, held = false;
  const gate = new Promise((resolve) => { release = resolve; });
  const h = await handoffHarness(t, async (entry) => {
    if (entry.message.includes('Implementor status')) { held = true; await gate; }
  });
  t.after(() => release());
  h.send('architect', 'assign', 0);
  h.settle('architect');
  await wait(() => h.controls('assign').length === 1);
  h.send('implementor', 'status', 1);
  await wait(() => held);
  h.send('architect', 'guide', 1, 'Review correction');
  h.settle('architect');
  h.send('implementor', 'done', 1);
  h.settle('implementor');
  release();
  await wait(() => h.controls('guide').length === 1);
  const done = h.messages.findIndex((m) => m.message.includes('Implementor done'));
  const guide = h.messages.findIndex((m) => m.control?.mode === 'guide');
  assert.ok(done >= 0 && done < guide, 'apply the completion report before resuming corrections');
  assert.match(h.display(), /cycle 1 • implementing/);
  assert.ok(!h.messages.some((m) => m.message.includes('Protocol rejected')));
});

test('protocol mistakes get actionable feedback, but uncertain delivery stops without inviting a job replay', async (t) => {
  const h = await handoffHarness(t, (entry) => {
    if (entry.role === 'implementor') throw Object.assign(new Error('Delivery acknowledgement timed out'), { code: 'RPC_TIMEOUT' });
  });
  h.send('architect', 'ping', 0);
  h.settle('architect');
  await wait(() => h.messages.some((m) => m.message.includes('Protocol rejected')));
  assert.match(h.messages.at(-1).message, /cycle 0, planning.*Use assign/);
  assert.equal(h.pair.stopped, false);
  h.send('architect', 'assign', 0);
  h.settle('architect');
  await wait(() => h.notices.some((n) => n.text.includes('Pair stopped')));
  assert.equal(h.pair.stopped, true);
  assert.equal(h.controls('assign').length, 1, 'delivery may have happened; do not resend');
  assert.equal(h.messages.filter((m) => m.message.includes('Protocol rejected')).length, 1, 'delivery error is not another model protocol error');
  assert.deepEqual(h.pi.events.get('input')({ text: 'try again', source: 'interactive' }), { action: 'handled' });
  assert.equal(h.controls('assign').length, 1);
});

test('exhausted provider retries are visible without automatic job replay or discarded worker context', async (t) => {
  const h = await handoffHarness(t);
  h.emit('architect', { type: 'auto_retry_end', success: false, finalError: 'WebSocket error' });
  h.settle('architect');
  assert.ok(h.notices.some((n) => n.level === 'warning' && /retries exhausted.*WebSocket error.*context retained/.test(n.text)));
  assert.equal(h.pair.stopped, false);
  assert.equal(h.messages.length, 0);
  h.pi.events.get('input')({ text: 'Please continue', source: 'interactive' });
  await wait(() => h.messages.length === 1);
  assert.match(h.messages[0].message, /Please continue/);
});

test('full parent workflow completes two tasks using the same pair, keeps transcripts isolated, then disables cleanly', { timeout: 20000 }, async () => {
  const root = await mkdtemp('/tmp/ai-ui-test-');
  const prior = process.env.PI_CODING_AGENT_DIR, auditPrior = process.env.MOCK_AUDIT;
  const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fake-rpc.mjs');
  await chmod(fixture, 0o755);
  process.env.PI_CODING_AGENT_DIR = root;
  process.env.MOCK_AUDIT = join(root, 'audit.jsonl');
  const notices = [], statuses = [];
  const terminal = { rows: 40 };
  let widget;
  const pi = api();
  for (const name of ['setActiveTools', 'setModel', 'sendUserMessage', 'sendMessage', 'appendEntry']) pi[name] = () => { throw new Error(`Parent must not call ${name}`); };
  let factory;
  const previousFactory = () => ({ setText() {} });
  factory = previousFactory;
  const context = {
    mode: 'tui', cwd: root, isIdle: () => true, hasPendingMessages: () => false,
    sessionManager: { getSessionId: () => 'unchanged-parent' },
    model: Object.freeze({ provider: 'parent', id: 'untouched' }),
    modelRegistry: { getAvailable: () => ['frontier', 'small'].map((id) => ({ provider: 'mock', id })) },
    ui: {
      notify: (text, level) => notices.push({ text, level }),
      setStatus: (_id, text) => statuses.push(text),
      getEditorComponent: () => factory, setEditorComponent: (f) => { factory = f; },
      setWidget(_id, component) {
        if (component) {
          widget = component({ terminal, requestRender() {} });
          assert.ok(widget.render(100).join('\n').includes('Architect'));
        } else widget = undefined;
      },
    },
  };
  try {
    await writeFile(join(root, 'architect-implementor.json'), JSON.stringify({
      piCommand: fixture,
      architect: { provider: 'mock', model: 'frontier', thinking: 'high' },
      implementor: { provider: 'mock', model: 'small', thinking: 'low' },
    }));
    extension(pi);
    assert.deepEqual([...pi.commands.keys()], ['pair-enable', 'pair-disable', 'pair-models']);
    context.ui.select = async () => undefined;
    await pi.commands.get('pair-models').handler('', context); // Cancel without modifying anything.
    await pi.commands.get('pair-models').handler('architect medium', context);
    await pi.commands.get('pair-enable').handler('Build task one', context);
    assert.match(statuses.at(-1), /starting/);
    assert.equal(widget.render(380).length, 23, 'startup retains 22-row panes plus status');
    terminal.rows = 28;
    assert.equal(widget.render(380).length, 16, 'short terminals retain 12 rows for the editor and other UI');
    terminal.rows = 40;
    assert.doesNotMatch(widget.render(380).slice(0, -1).join('\n'), /tmux:|Config:|Parent model\/conversation/);
    const sessionFooter = widget.render(380).at(-1);
    const architectSession = sessionFooter.match(/ai-[a-f0-9]{24}-architect/)?.[0];
    assert.ok(architectSession, 'architect session is visible in the bottom edge');
    assert.ok(sessionFooter.includes(architectSession.replace(/architect$/, 'implementor')));
    await wait(() => notices.some((n) => n.text.includes('accepted')) || notices.some((n) => n.level === 'error'));
    assert.equal(notices.filter((n) => n.level === 'error').length, 0, JSON.stringify(notices));
    await wait(() => widget.render(100).join('\n').includes('cycle 1 • accepted'));
    assert.match(widget.render(100).join('\n'), /cycle 1 • accepted/);
    const settingsBefore = await readFile(join(root, 'architect-implementor.json'), 'utf8');
    await pi.commands.get('pair-models').handler('architect other/vendor/model medium', context);
    await wait(() => notices.some((n) => n.text.includes('architect: other/vendor/model · medium for this pair only')));
    await pi.commands.get('pair-models').handler('implementor high', context);
    await wait(() => notices.some((n) => n.text.includes('implementor: mock/small · high for this pair only')));
    assert.match(widget.render(380).join('\n'), /vendor\/model/);
    assert.match(widget.render(380).join('\n'), /cycle 1 • accepted/);
    assert.equal(await readFile(join(root, 'architect-implementor.json'), 'utf8'), settingsBefore);
    assert.deepEqual(pi.events.get('input')({ text: 'Build task two', source: 'interactive' }), { action: 'handled' });
    await wait(() => notices.filter((n) => n.text.includes('accepted')).length === 2 || notices.some((n) => n.level === 'error'));
    assert.equal(notices.filter((n) => n.level === 'error').length, 0, JSON.stringify(notices));
    const audit = (await readFile(process.env.MOCK_AUDIT, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(audit.filter((e) => e.type === 'spawn').length, 2);
    assert.equal(audit.find((e) => e.message?.includes('Build task one')).thinking, 'medium', 'pre-enable override used at startup');
    assert.equal(new Set(audit.filter((e) => e.role === 'implementor').map((e) => e.pid)).size, 1);
    assert.ok(!audit.filter((e) => e.role === 'architect').some((e) => e.message.includes('PRIVATE_TRANSCRIPT_NOT_FOR_ARCHITECT')));
    assert.equal(audit.filter((e) => e.role === 'architect' && e.message.includes('Implementor done')).length, 2);
    const secondTask = audit.find((e) => e.message?.includes('Build task two'));
    assert.equal(secondTask.model, 'vendor/model');
    assert.equal(secondTask.provider, 'other');
    assert.equal(secondTask.thinking, 'medium');
    assert.equal(audit.filter((e) => e.role === 'implementor' && e.type === 'prompt').at(-1).thinking, 'high');
    assert.ok(!audit.filter((e) => e.type === 'prompt').some((e) => e.message.includes(architectSession)), 'session labels stay UI-only');
    await wait(() => widget.render(100).join('\n').includes('cycle 2 • accepted'));
    await pi.commands.get('pair-models').handler('architect reset', context);
    await wait(() => notices.some((n) => n.text.includes('architect: mock/frontier · high for this pair only')));
    assert.equal(await readFile(join(root, 'architect-implementor.json'), 'utf8'), settingsBefore);
    await pi.commands.get('pair-disable').handler('', context);
    assert.ok(statuses.some((s) => s?.includes('stopping')));
    assert.equal(statuses.at(-1), undefined);
    assert.equal(widget, undefined);
    assert.equal(factory, previousFactory);
    assert.deepEqual(pi.events.get('input')({ text: 'parent', source: 'interactive' }), { action: 'continue' });
    assert.deepEqual(context.model, { provider: 'parent', id: 'untouched' });
    await pi.commands.get('pair-models').handler('architect medium', context);
    await pi.commands.get('pair-disable').handler('', context); // Also clears staged overrides when already off.
    await pi.commands.get('pair-enable').handler('', context);
    await wait(() => statuses.at(-1)?.includes('active'));
    const fresh = widget.render(380).join('\n');
    assert.match(fresh, /frontier/);
    assert.match(fresh, /high/);
    assert.match(fresh, /low/);
    assert.doesNotMatch(fresh, /medium|vendor\/model/);
    await pi.commands.get('pair-disable').handler('', context);
  } finally {
    await pi.events.get('session_shutdown')?.();
    if (prior === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = prior;
    if (auditPrior === undefined) delete process.env.MOCK_AUDIT; else process.env.MOCK_AUDIT = auditPrior;
    await rm(root, { recursive: true, force: true });
  }
});
