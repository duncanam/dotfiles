import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import extension from '../index.ts';
import workerExtension from '../worker.ts';
import { Implementor } from '../transport.mjs';
import { visibleWidth } from '@earendil-works/pi-tui';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait(fn, ms = 12000) { const end = Date.now() + ms; while (!fn()) { if (Date.now() > end) throw new Error('Timed out'); await sleep(20); } }
function api() {
  const events = new Map(), commands = new Map(), tools = new Map(), nativeMessages = [], userMessages = [], modelCalls = [];
  let active = ['read', 'bash', 'write', 'edit', 'context7_get_library_docs'];
  const pi = {
    events, commands, tools, nativeMessages, userMessages, modelCalls, model: { provider: 'parent', id: 'original' }, thinking: 'low',
    on(name, fn) { events.set(name, fn); }, registerCommand(name, c) { commands.set(name, c); },
    registerTool(t) { tools.set(t.name, t); active.push(t.name); }, registerMessageRenderer() {},
    getAllTools() { return [...new Set([...active, ...tools.keys()])].map((name) => ({ name })); },
    getActiveTools() { return [...active]; }, setActiveTools(names) { active = [...names]; },
    sendUserMessage(text, options) { userMessages.push({ text, options }); },
    sendMessage(message, options) { nativeMessages.push({ ...message, options }); },
    getThinkingLevel() { return pi.thinking; }, setThinkingLevel(level) { pi.thinking = pi.model.id === 'plain' ? 'off' : level; },
    async setModel(model) { modelCalls.push(model); pi.model = model; return true; },
  };
  return pi;
}

test('implementor retains cycle context; blocked/done pause all coding, ping does not resume, status may yield', async () => {
  const previous = process.env.PI_AI_WORKER;
  process.env.PI_AI_WORKER = JSON.stringify({ config: { implementor: { extraTools: [] } } });
  try {
    const pi = api(); workerExtension(pi); pi.events.get('session_start')();
    const ctx = { sessionManager: { getBranch: () => [] } };
    const control = (mode, cycle) => pi.commands.get('ai-control').handler(Buffer.from(JSON.stringify({ mode, cycle, text: 'task' })).toString('base64url'));
    assert.equal(pi.events.get('tool_call')({ toolName: 'write' }, ctx).block, true);
    await control('assign', 1); assert.equal(pi.events.get('tool_call')({ toolName: 'write' }, ctx), undefined);
    for (const kind of ['blocked', 'done']) {
      assert.equal((await pi.tools.get('ai_report').execute('id', { kind, cycle: 1, text: kind })).terminate, true);
      assert.equal(pi.events.get('tool_call')({ toolName: 'bash' }, ctx).block, true);
      pi.events.get('agent_settled')(); await control('ping', 1);
      assert.equal(pi.events.get('tool_call')({ toolName: 'write' }, ctx).block, true);
      assert.match((await pi.tools.get('ai_report').execute('status', { kind: 'status', cycle: 1, text: 'Paused' })).content[0].text, /Remain paused/);
      await control('guide', 1); assert.equal(pi.events.get('tool_call')({ toolName: 'write' }, ctx), undefined);
    }
    const status = await pi.tools.get('ai_report').execute('status', { kind: 'status', cycle: 1, text: 'Remote job running' });
    assert.equal(status.terminate, undefined); assert.match(status.content[0].text, /yield while awaiting external progress/);
    await control('assign', 2);
    await assert.rejects(control('assign', 2), /Invalid cycle/); await assert.rejects(control('guide', 1), /Invalid cycle/);
    const system = pi.events.get('before_agent_start')({ systemPrompt: 'base' }).systemPrompt;
    for (const pattern of [/cycle: 2/, /do not redesign architecture/, /bounded status snapshots with explicit timeouts/, /local command abort\/timeout does not establish remote job failure/, /report status and yield/, /do not report done while assigned acceptance criteria remain unmet/]) assert.match(system, pattern);
    assert.doesNotMatch(system, /PAIR_TODO|backlog continuation/); assert.deepEqual([...pi.tools.keys()], ['ai_report']);
  } finally { if (previous === undefined) delete process.env.PI_AI_WORKER; else process.env.PI_AI_WORKER = previous; }
});

async function harness(t, { onPrompt = () => {}, real = false, enable = true, task = '', configure = () => {} } = {}) {
  const root = await mkdtemp('/tmp/pair-native-test-'), previous = process.env.PI_CODING_AGENT_DIR, previousAudit = process.env.MOCK_AUDIT;
  process.env.PI_CODING_AGENT_DIR = root; process.env.MOCK_AUDIT = join(root, 'audit.jsonl');
  const pi = api(), messages = [], notices = [], statuses = [], uiResponses = [], terminal = { rows: 40 };
  const models = [{ provider: 'parent', id: 'original' }, ...['frontier', 'small', 'plain'].map((id) => ({ provider: 'mock', id })), { provider: 'other', id: 'vendor/model' }];
  let worker, widget;
  if (!real) {
    t.mock.method(Implementor.prototype, 'start', async function () { worker = this; this.testState = { model: { provider: this.config.implementor.provider, id: this.config.implementor.model }, thinkingLevel: this.config.implementor.thinking }; });
    t.mock.method(Implementor.prototype, 'stop', async function () { this.stopped = true; });
    t.mock.method(Implementor.prototype, 'respondUi', function (id) { uiResponses.push(id); });
    t.mock.method(Implementor.prototype, 'rpc', async function (command) {
      if (command.type === 'get_state') return { ...structuredClone(this.testState), isStreaming: this.running };
      if (command.type === 'get_available_models') return { models };
      if (command.type === 'get_available_thinking_levels') return { levels: ['off', 'low', 'medium', 'high', 'max'] };
      if (command.type === 'set_model') { this.testState.model = { provider: command.provider, id: command.modelId }; return; }
      if (command.type === 'set_thinking_level') { this.testState.thinkingLevel = command.level; return; }
      assert.equal(command.type, 'prompt');
      const { message } = command;
      const control = message.startsWith('/ai-control ') ? JSON.parse(Buffer.from(message.slice(12), 'base64url').toString()) : undefined;
      const entry = { message, control }; messages.push(entry); await onPrompt(entry);
    });
  }
  const ctx = {
    mode: 'tui', hasUI: true, cwd: root, isIdle: () => true, hasPendingMessages: () => false,
    sessionManager: { getSessionId: () => 'native-main-session', getBranch: () => [{ type: 'message', message: { role: 'user', content: 'Existing parent context' } }] },
    getSystemPrompt: () => 'Existing policies\n' + (pi.getActiveTools().includes('ai_directive') ? pi.tools.get('ai_directive').promptGuidelines.join('\n') : ''),
    get model() { return pi.model; }, modelRegistry: { getAvailable: () => models, find: (provider, id) => models.find((m) => m.provider === provider && m.id === id) },
    ui: {
      notify: (text, level) => notices.push({ text, level }), setStatus: (_id, text) => statuses.push(text), select: async () => undefined,
      getEditorComponent: () => assert.fail('Do not wrap the native editor'), setEditorComponent: () => assert.fail('Do not replace the native editor'), setFooter: () => assert.fail('Do not replace the native footer'),
      setWidget: (_id, factory, options) => { if (factory) assert.equal(options.placement, 'aboveEditor'); widget = factory?.({ terminal, requestRender() {} }); },
    },
  };
  t.after(async () => {
    await pi.events.get('session_shutdown')?.();
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    if (previousAudit === undefined) delete process.env.MOCK_AUDIT; else process.env.MOCK_AUDIT = previousAudit;
    await rm(root, { recursive: true, force: true });
  });
  const cfg = { version: 2, checkinSeconds: 1200, paneLines: 26, architect: { provider: 'mock', model: 'frontier', thinking: 'high' }, implementor: { provider: 'mock', model: 'small', thinking: 'low' } };
  if (real) { cfg.piCommand = fileURLToPath(new URL('./fake-rpc.mjs', import.meta.url)); await chmod(cfg.piCommand, 0o755); }
  configure(cfg); await writeFile(join(root, 'architect-implementor.json'), JSON.stringify(cfg));
  extension(pi); await pi.events.get('session_start')({}, ctx);
  assert.ok(!pi.getActiveTools().includes('ai_directive'));
  if (enable) await pi.commands.get('pair-enable').handler(task, ctx);
  const emit = (e) => { if (e.type === 'agent_start') worker.running = true; if (e.type === 'agent_settled') worker.running = false; worker.onEvent(e); };
  const sendReport = (kind, cycle, text = kind) => { emit({ type: 'agent_start' }); emit({ type: 'tool_execution_end', toolName: 'ai_report', result: { details: { ai: { kind, cycle, text } } } }); };
  const directive = (kind, cycle, text = kind, signal) => pi.tools.get('ai_directive').execute('native-call', { kind, cycle, text }, signal);
  return { pi, get worker() { return worker; }, root, ctx, cfg, messages, notices, statuses, uiResponses, terminal, emit, sendReport, directive,
    settle: () => emit({ type: 'agent_settled' }), controls: (mode) => messages.filter((m) => m.control?.mode === mode),
    get widget() { return widget; }, display: () => widget?.render(160).join('\n') ?? '', command: (name, args = '') => pi.commands.get(name).handler(args, ctx) };
}

test('native main Pi becomes architect, keeps normal tools/commands/context and uses config defaults only on initialization', async (t) => {
  const h = await harness(t, { task: 'Build a change' });
  assert.deepEqual(h.pi.model, { provider: 'mock', id: 'frontier' }); assert.equal(h.pi.thinking, 'high');
  assert.deepEqual(h.pi.userMessages, [{ text: 'Build a change', options: { deliverAs: 'followUp' } }]);
  assert.equal(h.messages.length, 0, 'initial task goes to main Pi, not directly to worker');
  assert.deepEqual([...h.pi.commands.keys()], ['pair-enable', 'pair-disable', 'pair-usage', 'pair-models']);
  assert.equal(h.pi.events.has('input'), false); assert.equal(h.pi.events.has('user_bash'), false); assert.equal(h.pi.events.has('agent_settled'), false, 'no separate architect scheduler');
  for (const toolName of ['write', 'edit', 'bash', 'read', 'context7_get_library_docs', 'dynamic_tool']) assert.equal(h.pi.events.get('tool_call')({ toolName }, h.ctx), undefined);
  const multi = { sessionManager: { getBranch: () => [{ type: 'message', message: { role: 'assistant', content: [{ type: 'toolCall' }, { type: 'toolCall' }] } }] } };
  assert.match(h.pi.events.get('tool_call')({ toolName: 'ai_directive' }, multi).reason, /alone/);
  const policy = h.ctx.getSystemPrompt();
  for (const pattern of [/^Existing policies/, /main Pi conversation/, /Delegate substantive implementation/, /observable readiness\/capacity criteria/, /not as mandatory ping commands/, /Avoid immediately duplicating recent guidance/]) assert.match(policy, pattern);
  assert.match(policy, /Delegate substantive implementation and investigations, including read-only debugging\/research/);
  assert.match(policy, /implementor owns that scope until completion or a blocker/);
  assert.match(policy, /Routine progress reports are informational, not a request to start working/);
  assert.doesNotMatch(policy, /NEVER implement|PAIR_TODO|backlog continuation/);
  await h.pi.setModel({ provider: 'other', id: 'vendor/model' }); h.pi.setThinkingLevel('medium');
  h.pi.events.get('context')({ messages: [] });
  assert.equal(h.pi.model.id, 'vendor/model'); assert.equal(h.pi.thinking, 'medium');
  await h.command('pair-disable'); assert.equal(h.pi.model.id, 'vendor/model'); assert.equal(h.pi.thinking, 'medium');
  assert.doesNotMatch(h.ctx.getSystemPrompt(), /You are the ARCHITECT/);
  assert.equal(h.pi.events.get('before_agent_start'), undefined, 'native tool guidelines survive custom-message turns');
  assert.ok(!h.pi.getActiveTools().includes('ai_directive')); assert.ok(h.pi.getActiveTools().includes('context7_get_library_docs'));
  await assert.rejects(h.directive('assign', 0), /Pair is off/);
});

test('native communication rendering stays compact without hiding errors or expanded instructions', async (t) => {
  const h = await harness(t); const tool = h.pi.tools.get('ai_directive');
  const theme = { fg: (_key, text) => text, bold: (text) => text };
  const result = { content: [{ type: 'text', text: 'Queued; yield until feedback.' }], details: { cycle: 1, phase: 'implementing' } };
  const context = { args: { kind: 'assign' }, isError: false };
  const render = (value, expanded = false, ctx = context) => tool.renderResult(value, { expanded }, theme, ctx).render(100).join('\n').trim();
  assert.equal(render(result), 'Queued • cycle 1');
  assert.match(render(result, true), /yield until feedback/);
  assert.equal(render(result, false, { args: { kind: 'accept' }, isError: false }), 'Accepted • cycle 1');
  assert.match(render({ ...result, content: [{ type: 'text', text: 'Invalid directive\x1b[31m' }] }, false, { ...context, isError: true }), /Invalid directive/);
  assert.doesNotMatch(render({ ...result, content: [{ type: 'text', text: 'Invalid directive\x1b[31m' }] }, false, { ...context, isError: true }), /\x1b/);
  assert.match(render({ content: [{ type: 'text', text: 'Waiting for settlement.' }] }), /Waiting for settlement/);
});

test('native tool continuations see fresh cycle/phase without a new prompt; branch navigation stops the old plan', async (t) => {
  const h = await harness(t);
  const history = [{ role: 'user', content: 'Main context', timestamp: 0 }];
  const snapshot = () => h.pi.events.get('context')({ messages: history }).messages.at(-1);
  assert.match(snapshot().content, /cycle 0; phase planning/);
  await h.directive('assign', 0);
  assert.match(snapshot().content, /cycle 1; phase implementing/);
  h.sendReport('done', 1); h.settle(); await wait(() => h.pi.nativeMessages.length === 1);
  assert.match(snapshot().content, /cycle 1; phase reviewing/);
  assert.equal(snapshot().display, false); assert.equal(history.length, 1, 'state snapshot does not mutate or persist into history');
  h.ctx.getSystemPrompt = () => 'Custom SYSTEM.md without tool guidelines';
  assert.match(snapshot().content, /You are the ARCHITECT/, 'custom system prompts still receive role context');
  await h.pi.events.get('session_tree')();
  assert.equal(h.worker.stopped, true); assert.equal(h.widget, undefined);
  assert.equal(h.pi.events.get('context')({ messages: history }), undefined);
});

test('single pane preserves indicators and 26-row idle height while native UI remains untouched on resize', async (t) => {
  const h = await harness(t);
  assert.equal(h.widget.render(380).length, 28); assert.equal(h.widget.render(380)[2].match(/╭/g).length, 1);
  assert.match(h.widget.render(380)[1], /Usage \(pair, est\.\).*Architect.*Implementor.*Total/);
  assert.match(h.widget.render(380).at(-1), /tmux: ai-[a-f0-9]{24}-implementor/); assert.doesNotMatch(h.widget.render(380).join('\n'), /-architect|◇ Architect/);
  for (const rows of [8, 12, 20, 28, 40]) for (const width of [1, 7, 20, 80, 380]) {
    h.terminal.rows = rows; const lines = h.widget.render(width); assert.ok(lines.length <= Math.max(0, rows - 12));
    for (const line of lines) assert.ok(visibleWidth(line) <= width);
  }
  h.terminal.rows = 40; await h.directive('assign', 0);
  assert.match(h.display(), /cycle 1 • implementing/); assert.match(h.display(), /CHECK-IN/); assert.match(h.display(), /elapsed/); assert.match(h.display(), /mock\/small.*effort low/);
});

test('terminal reports wait through retries and precede racing corrections; reports enter native conversation, not full transcripts', async (t) => {
  const h = await harness(t); const first = await h.directive('assign', 0, 'Implement a small change'); assert.equal(first.terminate, true);
  assert.equal(h.controls('assign').length, 1); h.emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'PRIVATE_TRANSCRIPT' } });
  h.sendReport('done', 1, 'Changed src/a.ts; tests pass'); h.emit({ type: 'agent_end', willRetry: true });
  h.emit({ type: 'auto_retry_start', errorMessage: 'WebSocket error' });
  const guides = ['First correction', 'Second correction'].map((text) => h.directive('guide', 1, text));
  await sleep(30); assert.equal(h.controls('guide').length, 0); assert.equal(h.pi.nativeMessages.length, 0);
  h.emit({ type: 'agent_start' }); h.emit({ type: 'auto_retry_end', success: true }); h.settle(); await Promise.all(guides);
  assert.deepEqual(h.controls('guide').map((m) => m.control.text), ['First correction', 'Second correction']);
  assert.match(h.display(), /cycle 1 • implementing/);
  assert.equal(h.pi.nativeMessages.length, 1); assert.match(h.pi.nativeMessages[0].content, /Implementor done.*cycle 1/s);
  assert.deepEqual(h.pi.nativeMessages[0].options, { triggerTurn: true, deliverAs: 'followUp' });
  assert.equal(h.pi.nativeMessages[0].display, true); assert.doesNotMatch(JSON.stringify(h.pi.nativeMessages), /PRIVATE_TRANSCRIPT/);
  await assert.rejects(h.directive('accept', 1), /completion report/);
  h.sendReport('done', 1); h.settle(); await wait(() => h.pi.nativeMessages.length === 2);
  await h.directive('ping', 1); h.sendReport('status', 1); h.settle(); await wait(() => h.pi.nativeMessages.length === 3);
  assert.match(h.display(), /cycle 1 • reviewing/); const count = h.pi.nativeMessages.length;
  assert.equal((await h.directive('accept', 1, 'Independently verified')).terminate, undefined, 'native Pi may explain its review normally');
  await sleep(40); assert.equal(h.pi.nativeMessages.length, count, 'no automatic backlog continuation'); assert.match(h.display(), /cycle 1 • accepted/);
});

test('routine startup/progress stays visible without waking the architect; one requested status and terminal reports do wake it', async (t) => {
  const h = await harness(t); await h.directive('assign', 0, 'Investigate the issue, no edits');
  for (const toolName of ['read', 'bash', 'write', 'edit']) assert.equal(h.pi.events.get('tool_call')({ toolName }, h.ctx), undefined, 'ownership guidance does not install tool bans');
  const status = async (text) => {
    const count = h.pi.nativeMessages.length; h.sendReport('status', 1, text);
    await wait(() => h.pi.nativeMessages.length === count + 1); return h.pi.nativeMessages.at(-1);
  };
  const startup = await status('Starting investigation');
  assert.equal(startup.display, true); assert.equal(startup.options.triggerTurn, false);
  assert.match(startup.content, /Starting investigation/); assert.match(h.display(), /QUEUED status\s+Starting investigation/);
  assert.equal((await status('Still investigating')).options.triggerTurn, false);
  await h.directive('ping', 1, 'What is the current progress?');
  assert.equal((await status('Requested progress')).options.triggerTurn, true);
  assert.equal((await status('More progress')).options.triggerTurn, false, 'one wake-up per explicit status request');
  h.sendReport('blocked', 1, 'Need an architectural decision'); h.settle();
  await wait(() => h.pi.nativeMessages.length === 5); assert.equal(h.pi.nativeMessages.at(-1).options.triggerTurn, true);
  await h.directive('guide', 1, 'Resolve the blocker');
  assert.equal((await status('Continuing')).options.triggerTurn, false);
  h.sendReport('done', 1); h.settle(); await wait(() => h.pi.nativeMessages.length === 7);
  assert.equal(h.pi.nativeMessages.at(-1).options.triggerTurn, true);
});

test('status and yield avoids idle re-prompts through retry gaps; a fresh unreported run still warns', async (t) => {
  const h = await harness(t); await h.directive('assign', 0);
  for (const retry of [false, true]) {
    h.sendReport('status', 1, 'Job 42 running; waiting for result');
    if (retry) { h.emit({ type: 'agent_end', willRetry: true }); h.emit({ type: 'agent_start' }); }
    h.settle(); await wait(() => h.pi.nativeMessages.length === (retry ? 2 : 1)); await sleep(30);
    assert.ok(!h.pi.nativeMessages.some((m) => m.content.includes('Implementor is idle'))); assert.equal(h.controls('ping').length, 0);
    assert.ok(h.pi.nativeMessages.every((m) => m.options.triggerTurn === false), 'yielded progress does not schedule a second investigator');
  }
  h.emit({ type: 'agent_start' }); h.settle(); await wait(() => h.pi.nativeMessages.some((m) => m.content.includes('without a status, blocker or completion report')));
});

test('queued report UI hides communication boilerplate but retains ordinary tool output and errors', async (t) => {
  const h = await harness(t); await h.directive('assign', 0);
  h.emit({ type: 'message_update', assistantMessageEvent: { type: 'thinking_start' } });
  h.emit({ type: 'tool_execution_start', toolName: 'ai_report', args: { kind: 'status' } });
  h.emit({ type: 'tool_execution_end', toolName: 'ai_report', result: { content: [{ type: 'text', text: 'Status sent. Boilerplate.' }], details: { ai: { kind: 'status', cycle: 1, text: 'Job 42 running' } } } });
  assert.match(h.display(), /QUEUED status\s+Job 42 running/); assert.doesNotMatch(h.display(), /THINK|Boilerplate|"kind"|ai_report/);
  h.emit({ type: 'tool_execution_end', toolName: 'ai_report', isError: true, result: { content: [{ type: 'text', text: 'Invalid report' }] } });
  assert.match(h.display(), /ERROR ai_report: Invalid report/);
  h.emit({ type: 'tool_execution_start', toolName: 'read', args: { path: 'file.txt' } });
  h.emit({ type: 'tool_execution_end', toolName: 'read', result: { content: [{ type: 'text', text: 'Important detail' }], details: { ai: { kind: 'done', cycle: 1, text: 'not a report' } } } });
  assert.match(h.display(), /TOOL\s+read/); assert.match(h.display(), /RESULT\s+read: Important detail/);
  h.emit({ type: 'tool_execution_end', toolName: 'ai_report', result: { content: [{ type: 'text', text: 'Missing metadata' }] } });
  assert.match(h.display(), /RESULT\s+ai_report: Missing metadata/);
});

test('completion has priority even when guidance is queued behind an in-flight RPC acknowledgement', async (t) => {
  let release, held = false; const gate = new Promise((resolve) => { release = resolve; });
  const h = await harness(t, { onPrompt: async (entry) => { if (entry.control?.mode === 'ping') { held = true; await gate; } } });
  t.after(release); await h.directive('assign', 0); const ping = h.directive('ping', 1); await wait(() => held);
  const guide = h.directive('guide', 1, 'Review correction'); h.sendReport('done', 1); h.settle(); release(); await ping; await guide;
  assert.equal(h.pi.nativeMessages.filter((m) => m.content.includes('Implementor done')).length, 1);
  assert.match(h.display(), /cycle 1 • implementing/); assert.equal(h.controls('guide').length, 1);
});

test('protocol errors are native tool errors; uncertain delivery stops delegation without intercepting main Pi', async (t) => {
  const h = await harness(t, { onPrompt: () => { throw Object.assign(new Error('Delivery acknowledgement timed out'), { code: 'RPC_TIMEOUT' }); } });
  await assert.rejects(h.directive('ping', 0), /cycle 0, planning.*Use assign/); assert.equal(h.worker.stopped, false);
  await assert.rejects(h.directive('assign', 0), /timed out/); await wait(() => h.worker.stopped);
  assert.equal(h.controls('assign').length, 1); assert.ok(!h.pi.getActiveTools().includes('ai_directive'));
  assert.equal(h.pi.events.has('input'), false); assert.match(h.pi.nativeMessages.at(-1).content, /Do not automatically replay/);
  await assert.rejects(h.directive('assign', 0), /Pair is failed/); assert.equal(h.controls('assign').length, 1);
});

test('Escape cancels an unsent directive waiting for a settled report; it does not cancel the worker', async (t) => {
  const h = await harness(t); await h.directive('assign', 0); h.sendReport('done', 1);
  const abort = new AbortController(); const cancelled = assert.rejects(h.directive('guide', 1, 'Unsent correction', abort.signal), /cancelled before dispatch/);
  await sleep(20); abort.abort(); await cancelled; h.settle(); await wait(() => h.pi.nativeMessages.length === 1);
  assert.equal(h.controls('guide').length, 0); assert.equal(h.worker.stopped, false); assert.match(h.display(), /reviewing/);
});

test('worker retries preserve context and headless UI requests are cancelled, never approved', async (t) => {
  const h = await harness(t); h.emit({ type: 'auto_retry_end', success: false, finalError: 'WebSocket error' });
  assert.ok(h.notices.some((n) => /retries exhausted.*WebSocket error.*Context retained/.test(n.text))); assert.equal(h.worker.stopped, false); assert.equal(h.messages.length, 0);
  h.emit({ type: 'extension_ui_request', method: 'confirm', id: 'permission', title: 'Allow?' }); assert.deepEqual(h.uiResponses, ['permission']);
});

test('late failures and events from a disabled worker cannot stop or prompt a replacement', async (t) => {
  let rejectDelivery; const h = await harness(t, { onPrompt: () => new Promise((_resolve, reject) => { rejectDelivery = reject; }) });
  const oldRequest = assert.rejects(h.directive('assign', 0), /Pair stopped/); await wait(() => rejectDelivery);
  const old = h.worker; await h.command('pair-disable'); await oldRequest; await h.command('pair-enable');
  rejectDelivery(new Error('Late failure')); old.onEvent({ type: 'extension_error', error: 'Late error' });
  await sleep(40); assert.notEqual(h.worker, old); assert.equal(h.worker.stopped, false); assert.equal(h.pi.nativeMessages.length, 0);
});

test('initialization cancellation is serialized with disable and cannot start a worker or inject a stale task', async (t) => {
  const h = await harness(t, { enable: false }); let release;
  h.pi.setModel = async (model) => { await new Promise((resolve) => { release = resolve; }); h.pi.model = model; return true; };
  const starting = h.command('pair-enable', 'Do not dispatch this task'); await wait(() => release);
  const stopping = h.command('pair-disable'), repeatedStop = h.command('pair-disable');
  await h.command('pair-enable'); assert.equal(h.worker, undefined);
  release(); await Promise.all([starting, stopping, repeatedStop]);
  assert.equal(h.worker, undefined); assert.equal(h.widget, undefined); assert.equal(h.pi.userMessages.length, 0); assert.ok(!h.pi.getActiveTools().includes('ai_directive'));
});

test('bad architect defaults fail before spawning and restore the prior selection after effort clamping', async (t) => {
  const h = await harness(t, { configure: (cfg) => { cfg.architect.model = 'plain'; } });
  assert.equal(h.worker, undefined); assert.equal(h.pi.model.id, 'original'); assert.equal(h.pi.thinking, 'low');
  assert.ok(h.notices.some((n) => /effort high unsupported/.test(n.text))); assert.equal(h.pi.nativeMessages[0].options.triggerTurn, false);
});

test('implementor-only overrides support pre-enable staging, cancel/reset, native host independence and cleanup', async (t) => {
  const h = await harness(t, { enable: false }); const configBefore = await readFile(join(h.root, 'architect-implementor.json'), 'utf8');
  await h.command('pair-models'); await h.command('pair-models', 'medium'); await h.command('pair-enable');
  assert.equal(h.worker.config.implementor.thinking, 'medium'); assert.equal(h.pi.thinking, 'high');
  await h.pi.setModel({ provider: 'other', id: 'vendor/model' }); h.pi.setThinkingLevel('max');
  await h.command('pair-models', 'other/vendor/model high'); await wait(() => h.worker.config.implementor.model === 'vendor/model');
  assert.match(h.display(), /other\/vendor\/model.*effort high/); assert.equal(h.pi.thinking, 'max');
  await h.command('pair-models', 'reset'); await wait(() => h.worker.config.implementor.model === 'small');
  assert.equal(h.worker.config.implementor.thinking, 'low'); assert.equal(h.pi.model.id, 'vendor/model');
  assert.equal(await readFile(join(h.root, 'architect-implementor.json'), 'utf8'), configBefore);
  await h.command('pair-disable'); await h.command('pair-models', 'medium'); await h.command('pair-disable'); await h.command('pair-enable');
  assert.equal(h.worker.config.implementor.thinking, 'low'); assert.equal(h.pi.model.id, 'frontier');
});

test('pair usage counts final events, tool usage and compaction once, survives model/cycle changes and resets on re-enable', async (t) => {
  const h = await harness(t, { enable: false });
  const usage = (input) => ({ input, output: 2, cacheRead: 3, cacheWrite: 4, totalTokens: input + 9, cost: { total: input / 1000 } });
  const assistant = (input, stopReason = 'stop') => ({ role: 'assistant', stopReason, usage: usage(input) });
  const architect = (message) => h.pi.events.get('message_end')({ message });
  const implementor = (message) => h.emit({ type: 'message_end', message });
  architect(assistant(999)); await h.command('pair-usage');
  assert.match(h.notices.at(-1).text, /No pair usage recorded/);
  await h.command('pair-enable');
  architect(assistant(10));
  for (let i = 0; i < 3; i++) h.emit({ type: 'message_update', usage: usage(20), assistantMessageEvent: { type: 'text_delta', delta: 'preview' } });
  h.emit({ type: 'turn_end', message: assistant(20) });
  implementor(assistant(20)); implementor(assistant(5, 'aborted'));
  architect({ role: 'toolResult', usage: usage(3) });
  h.emit({ type: 'tool_execution_end', toolName: 'nested', result: { usage: usage(5) } }); // message_end owns tool accounting
  h.pi.events.get('session_compact')({ compactionEntry: { usage: usage(2) } });
  h.emit({ type: 'compaction_end', aborted: false, result: { usage: usage(1) } });
  h.emit({ type: 'compaction_end', aborted: true });
  h.emit({ type: 'compaction_end', errorMessage: 'No summary' });
  await h.command('pair-models', 'medium'); await wait(() => h.worker.config.implementor.thinking === 'medium');
  await h.directive('assign', 0); h.sendReport('done', 1); h.settle();
  await wait(() => h.pi.nativeMessages.length === 1); await h.directive('accept', 1); await h.directive('assign', 1);
  await h.command('pair-usage'); const report = h.notices.at(-1).text;
  assert.match(report, /Architect: 42 tok \/ \$0\.0150/);
  assert.match(report, /Implementor: 53 tok \/ \$0\.0260/);
  assert.match(report, /Total: 95 tok \/ \$0\.0410/);
  assert.match(h.display(), /Architect 42 tok \/ \$0\.0150.*Implementor 53 tok \/ \$0\.0260.*Total 95 tok \/ \$0\.0410/);
  assert.doesNotMatch(JSON.stringify(h.pi.nativeMessages), /Pair usage|0\.0410/, 'metrics do not enter the model conversation');
  const old = h.worker; await h.command('pair-disable');
  architect(assistant(999)); old.onEvent({ type: 'message_end', message: assistant(999) });
  await h.command('pair-usage'); assert.equal(h.notices.at(-1).text, report.replace('current enable', 'last enable'));
  await h.command('pair-enable');
  old.onEvent({ type: 'message_end', message: assistant(999) });
  old.onEvent({ type: 'compaction_end', result: { usage: usage(999) } });
  await h.command('pair-usage'); assert.match(h.notices.at(-1).text, /Total: 0 tok \/ \$0\.0000/);
  assert.match(h.display(), /Architect 0 tok.*Implementor 0 tok.*Total 0 tok/);
});

test('two native-architect tasks use one real tmux worker, retaining worker context and isolated transcripts', { timeout: 20000 }, async (t) => {
  const h = await harness(t, { real: true, task: 'Main-only task context' });
  for (let cycle = 1; cycle <= 2; cycle++) {
    await h.directive('assign', cycle - 1, `Implement task ${cycle}`);
    await wait(() => h.pi.nativeMessages.filter((m) => m.content.includes('Implementor done')).length === cycle);
    assert.match(h.display(), new RegExp(`cycle ${cycle} • reviewing`));
    await h.directive('accept', cycle, 'Reviewed files and tests independently');
    if (cycle === 1) { await h.command('pair-models', 'high'); await wait(() => h.notices.some((n) => n.text.includes('mock/small · high for this pair only'))); }
  }
  const audit = (await readFile(join(h.root, 'audit.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(audit.filter((e) => e.type === 'spawn').length, 1); assert.equal(new Set(audit.map((e) => e.pid)).size, 1);
  assert.equal(audit.filter((e) => e.type === 'prompt').at(-1).thinking, 'high');
  assert.doesNotMatch(JSON.stringify(audit), /Main-only task context|Existing parent context/); assert.doesNotMatch(JSON.stringify(h.pi.nativeMessages), /PRIVATE_TRANSCRIPT/);
  assert.match(h.display(), /PRIVATE_TRANSCRIPT_NOT_FOR_ARCHITECT/); await h.command('pair-disable'); assert.equal(h.widget, undefined); assert.equal(h.pi.model.id, 'frontier');
});
