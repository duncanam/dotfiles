import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { loadConfig, roles } from './config.mjs';
import { Engine } from './engine.mjs';
import { WorkerPair, reapOrphans, sessionNames } from './transport.mjs';
import { Log, renderPanes, renderWorkflowStatus, roleStatus, workflowFooter } from './ui.ts';
import { routeEditor, CustomEditor } from './editor.ts';
import { chooseModel, selection, modelLabel, type Selection } from './models.ts';

type Role = 'architect' | 'implementor';
type Mode = 'off' | 'starting' | 'active' | 'failed' | 'stopping';
export default function architectImplementor(pi: ExtensionAPI) {
  if (process.env.PI_AI_WORKER) return;
  let mode: Mode = 'off';
  let ctx: ExtensionContext;
  let config: any;
  let pair: WorkerPair | undefined;
  let engine: Engine;
  let generation = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let repaint: ReturnType<typeof setTimeout> | undefined;
  let requestRender: (() => void) | undefined;
  let previousEditor: ReturnType<ExtensionContext['ui']['getEditorComponent']>;
  let chain = Promise.resolve();
  let pending: Record<Role, any[]> = { architect: [], implementor: [] };
  let feedback: { text: string; images?: any[] }[] = [];
  let logs = { architect: new Log(), implementor: new Log() };
  let busy = { architect: false, implementor: false };
  let overrides: Partial<Record<Role, Selection>> = {};
  let modelPicker: AbortController | undefined;
  const modelChanges = new Set<Role>();

  const status = () => ({ mode, phase: engine?.phase ?? 'planning', cycle: engine?.cycle ?? 0, startedAt: engine?.startedAt ?? 0, nextPing: engine?.nextPing ?? 0, checkinMs: engine?.intervalMs });
  let lastStatus: string | undefined;
  function updateStatus() {
    const text = workflowFooter(status());
    if (text !== lastStatus) { ctx.ui.setStatus('architect-implementor', text); lastStatus = text; }
  }
  function render() {
    if (!repaint) repaint = setTimeout(() => { repaint = undefined; updateStatus(); requestRender?.(); }, 80);
  }
  function log(role: Role, text: string) { logs[role].add(text); render(); }
  function show() {
    updateStatus();
    ctx.ui.setWidget('architect-implementor', (tui, theme) => {
      requestRender = () => tui.requestRender();
      return {
        render: (width: number) => {
          const state = status();
          const header = renderWorkflowStatus(width, state, Date.now(), theme);
          const height = Math.max(3, Math.min(config?.paneLines ?? 18, (tui.terminal.rows || 30) - 12 - header.length));
          return [...header, ...renderPanes(width, height, roles.map((r, i) => {
            const role = r as Role;
            return { title: role === 'architect' ? 'Architect' : 'Implementor', role, status: roleStatus(state, role, busy[role]) + (modelChanges.has(role) ? ' • model queued' : ''), model: config?.[role].model, thinking: config?.[role].thinking, sessionName: pair ? sessionNames(pair.key)[i] : undefined, log: logs[role], emptyMessage: mode === 'starting' ? 'Starting worker…' : mode === 'stopping' ? 'Stopping worker…' : mode === 'failed' ? 'Worker stopped. Use /pair-disable to return.' : undefined };
          }), theme)];
        },
        invalidate() {},
      };
    }, { placement: 'aboveEditor' });
  }
  function fail(error: unknown) {
    if (mode === 'off' || mode === 'stopping' || mode === 'failed') return;
    mode = 'failed';
    clearInterval(timer);
    const text = error instanceof Error ? error.message : String(error);
    log('architect', `ERROR: ${text}\nInput remains intercepted. /pair-disable to restore parent input.`);
    ctx.ui.notify(`Pair stopped: ${text}. Use /pair-disable.`, 'error');
    void pair?.stop();
  }
  function enqueue(work: () => Promise<void>) {
    const mine = generation;
    chain = chain.then(async () => { if (mine === generation && mode === 'active') await work(); }).catch(fail);
  }
  async function effects(items: any[]) {
    for (const item of items) {
      if (mode !== 'active' || !pair) return;
      log(item.role, `[${item.mode}] ${item.text}`);
      if (item.mode === 'accepted') {
        ctx.ui.notify('Architect accepted the work. Pair remains enabled.', 'info');
      } else if (['assign', 'guide', 'ping', 'note'].includes(item.mode)) {
        const encoded = Buffer.from(JSON.stringify(item)).toString('base64url');
        await pair.prompt(item.role, `/ai-control ${encoded}`);
      } else await pair.prompt(item.role, item.text);
    }
    render();
  }
  async function protocol(role: Role, data: any) {
    let items;
    try {
      items = role === 'architect' ? engine.directive(data) : engine.report(data);
    } catch (error) {
      const text = `Protocol rejected (cycle ${engine.cycle}, ${engine.phase}): ${error instanceof Error ? error.message : String(error)}`;
      log(role, text);
      await pair?.prompt(role, text);
      return;
    }
    // Delivery failures are not model mistakes. Stop rather than invite a replay
    // after the state transition (the recipient may already have received it).
    await effects(items);
  }
  async function handoffs() {
    const ready: [Role, any][] = [];
    // Snapshot settled reports before directives, including ones queued while
    // another RPC was in flight. Never discard feedback just because done races it.
    for (const role of ['implementor', 'architect'] as const) {
      if (busy[role] || (role === 'architect' && pending.implementor.length)) continue;
      for (const data of pending[role].splice(0)) ready.push([role, data]);
    }
    for (const [role, data] of ready) await protocol(role, data);
  }
  function event(role: Role, e: any) {
    if (mode === 'off' || mode === 'stopping' || mode === 'failed') return;
    if (e.type === 'extension_error') { fail(`${role} extension error: ${e.error}`); return; }
    if (e.type === 'agent_start') busy[role] = true;
    if (e.type === 'message_update') {
      const delta = e.assistantMessageEvent;
      if (delta?.type === 'text_start' || delta?.type === 'thinking_start') logs[role].add(delta.type === 'thinking_start' ? '[thinking] ' : '');
      if (delta?.type === 'text_delta' || delta?.type === 'thinking_delta') logs[role].delta(delta.delta);
    }
    if (e.type === 'tool_execution_start') log(role, `→ ${e.toolName} ${JSON.stringify(e.args).slice(0, 1500)}`);
    if (e.type === 'tool_execution_end') {
      const text = e.result?.content?.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n') ?? '';
      log(role, `${e.isError ? 'ERROR' : '←'} ${e.toolName}: ${text.slice(-4000)}`);
      if (!e.isError) {
        const data = e.result?.details?.ai;
        if (data && ((role === 'architect' && e.toolName === 'ai_directive') || (role === 'implementor' && e.toolName === 'ai_report'))) {
          // Terminal handoffs wait for agent_settled, never race an in-flight edit/tool batch.
          if (role === 'architect' || data.kind !== 'status') pending[role].push(data);
          else enqueue(() => protocol(role, data));
        }
      }
    }
    if (e.type === 'agent_settled') {
      busy[role] = false;
      if (pending[role].length) enqueue(handoffs);
      else if (role === 'implementor' && engine.phase === 'implementing') enqueue(async () => {
        await effects([{ role: 'architect', mode: 'message', text: `Implementor is idle in cycle ${engine.cycle} without a terminal report. Do not infer completion. Ping for status or guide it to continue/report a blocker.` }]);
      });
    }
    if (e.type === 'message_end' && e.message?.role === 'assistant' && ['error', 'aborted'].includes(e.message.stopReason)) log(role, `Model ${e.message.stopReason}: ${e.message.errorMessage ?? 'no details'}`);
    if (e.type === 'bridge_stderr') log(role, `[stderr] ${e.text}`);
    if (e.type === 'auto_retry_start' || e.type === 'compaction_start') log(role, `[${e.type}] ${e.errorMessage ?? ''}`);
    if (e.type === 'auto_retry_end' && e.success === false) ctx.ui.notify(`${role}: model retries exhausted (${String(e.finalError ?? 'connection error').slice(0, 1000)}). Pair context retained; send feedback or use /pair-models to continue.`, 'warning');
    if (e.type === 'extension_ui_request') {
      log(role, `[extension UI: ${e.method}] ${e.message ?? e.title ?? ''}`);
      if (['select', 'confirm', 'input', 'editor'].includes(e.method)) {
        // Headless workers must not hang waiting for a nonexistent editor or grant permissions.
        try { pair?.respondUi(role, e.id); } catch (error) { fail(error); }
        ctx.ui.notify(`${role} requested UI; cancelled. Resolve via architect feedback or adjust its extension allowlist.`, 'warning');
      }
    }
    render();
  }
  function input(text: string, images?: any[]) {
    if (mode === 'starting') {
      if (feedback.length >= 100) { ctx.ui.notify('Startup feedback queue full; please retry after startup.', 'error'); return; }
      feedback.push({ text, images });
      log('architect', `[queued user feedback] ${text}`);
    } else if (mode === 'active') {
      log('architect', `[user feedback] ${text}`);
      // Do not put live feedback behind orchestration RPC acknowledgements.
      void pair?.prompt('architect', `[User feedback]\n${text}`, images).catch(fail);
    } else ctx.ui.notify('Pair is not running; input was not sent to the parent. Use /pair-disable first.', 'warning');
  }
  async function stop() {
    generation++;
    modelPicker?.abort(); modelPicker = undefined;
    overrides = {}; modelChanges.clear();
    if (mode === 'off') return;
    mode = 'stopping';
    clearInterval(timer); clearTimeout(repaint); repaint = undefined;
    updateStatus(); requestRender?.();
    await pair?.stop();
    pair = undefined; pending = { architect: [], implementor: [] }; feedback = []; busy = { architect: false, implementor: false };
    ctx.ui.setEditorComponent(previousEditor);
    previousEditor = undefined;
    ctx.ui.setWidget('architect-implementor', undefined);
    ctx.ui.setStatus('architect-implementor', undefined);
    lastStatus = undefined;
    requestRender = undefined;
    mode = 'off';
  }
  pi.registerCommand('pair-enable', {
    description: 'Enable Architect/Implementor; optional initial task',
    handler: async (args, commandCtx) => {
      if (modelPicker) { commandCtx.ui.notify('Finish or cancel the model picker first.', 'warning'); return; }
      if (mode !== 'off') { commandCtx.ui.notify('Pair already enabled; /pair-disable first.', 'warning'); return; }
      if (commandCtx.mode !== 'tui') { commandCtx.ui.notify('Pair UI requires interactive Pi.', 'error'); return; }
      if (!commandCtx.isIdle() || commandCtx.hasPendingMessages()) { commandCtx.ui.notify('Wait for the parent to settle and disable other automation before enabling.', 'warning'); return; }
      ctx = commandCtx;
      try {
        config = loadConfig();
        for (const role of roles) Object.assign(config[role], overrides[role as Role]);
      } catch (e) { ctx.ui.notify(String(e), 'error'); return; }
      logs = { architect: new Log(), implementor: new Log() };
      engine = new Engine(config.checkinSeconds * 1000);
      mode = 'starting';
      const mine = ++generation;
      chain = Promise.resolve();
      show();
      previousEditor = ctx.ui.getEditorComponent();
      ctx.ui.setEditorComponent((tui, theme, keys) => routeEditor(previousEditor?.(tui, theme, keys) ?? new CustomEditor(tui, theme, keys), (text) => input(text)));
      pair = new WorkerPair(config, ctx.cwd, ctx.sessionManager.getSessionId(), event, fail);
      render();
      if (args.trim()) feedback.push({ text: args.trim() });
      // Return the command immediately; startup and all model calls run asynchronously.
      void pair.start().then(async () => {
        if (mine !== generation || mode !== 'starting') return;
        mode = 'active';
        render();
        timer = setInterval(() => { render(); enqueue(async () => { await effects(engine.tick()); }); }, 1000);
        const queued = feedback; feedback = [];
        for (const message of queued) input(message.text, message.images);
      }).catch((e) => { if (mine === generation) fail(e); });
    },
  });
  pi.registerCommand('pair-disable', { description: 'Stop both workers and restore parent input', handler: async (_args, commandCtx) => { await stop(); commandCtx.ui.notify('Pair disabled; parent input restored.', 'info'); } });
  pi.registerCommand('pair-models', {
    description: 'One-off worker model/effort picker; or ROLE PROVIDER/MODEL EFFORT, ROLE EFFORT, ROLE reset',
    getArgumentCompletions: (prefix) => roles.filter((r) => r.startsWith(prefix)).map((r) => ({ value: r, label: r })),
    handler: async (args, commandCtx) => {
      if (commandCtx.mode !== 'tui') { commandCtx.ui.notify('Pair models requires interactive Pi.', 'error'); return; }
      if (mode !== 'off' && mode !== 'active') { commandCtx.ui.notify('Wait for startup, or /pair-disable a failed/stopping pair first.', 'warning'); return; }
      if (modelPicker) { commandCtx.ui.notify('A model picker is already open.', 'warning'); return; }
      const mine = generation, livePair = pair, initialMode = mode;
      const controller = new AbortController();
      modelPicker = controller;
      try {
        const current = mode === 'off' ? loadConfig() : config;
        if (mode === 'off') for (const role of roles) Object.assign(current[role], overrides[role as Role]);
        const available = async (role: Role) => livePair
          ? ((await livePair.rpc(role, { type: 'get_available_models' })) as any).models
          : commandCtx.modelRegistry.getAvailable();
        const choice = await chooseModel(args, current, commandCtx.ui, available, controller.signal);
        if (!choice || controller.signal.aborted || mine !== generation || mode !== initialMode) return;
        const { role } = choice;
        if (modelChanges.has(role)) { commandCtx.ui.notify(`${role} already has a queued model change. Wait for it to finish.`, 'warning'); return; }
        const target = choice.reset ? selection(loadConfig()[role]) : choice.target!;
        if (!livePair) {
          const models = await available(role);
          if (controller.signal.aborted || mine !== generation || mode !== 'off') return;
          if (!models.some((m: any) => m.provider === target.provider && m.id === target.model)) throw new Error(`Model unavailable: ${target.provider}/${target.model}`);
          if (choice.reset) delete overrides[role];
          else overrides[role] = target;
          commandCtx.ui.notify(`${role}: ${modelLabel(target)} for the next /pair-enable only; worker validates effort at startup. JSON unchanged.`, 'info');
          return;
        }
        modelChanges.add(role);
        log(role, `[model change queued] ${modelLabel(target)}`);
        commandCtx.ui.notify(`${role}: queued ${modelLabel(target)} for its next settled boundary (up to 10 minutes). Context retained; JSON unchanged.`, 'info');
        // Do not hold the editor while a worker finishes a long-running task.
        void livePair.changeModel(role, target).then(() => {
          if (mine !== generation || mode !== 'active' || pair !== livePair) return;
          if (choice.reset) delete overrides[role];
          else overrides[role] = target;
          log(role, `[model changed] ${modelLabel(target)}`);
          commandCtx.ui.notify(`${role}: ${modelLabel(target)} for this pair only.`, 'info');
        }).catch((error) => {
          if (mine !== generation || mode !== 'active') return;
          log(role, `[model change rejected] ${error.message}`);
          commandCtx.ui.notify(error.message, 'error');
        }).finally(() => {
          if (mine === generation) { modelChanges.delete(role); render(); }
        });
      } catch (error) {
        if (!controller.signal.aborted && mine === generation) commandCtx.ui.notify(String(error), 'error');
      } finally {
        if (modelPicker === controller) modelPicker = undefined;
      }
    },
  });
  pi.on('input', (e) => {
    if (mode === 'off') return { action: 'continue' as const };
    if (e.source === 'extension') ctx.ui.notify('Suppressed extension-injected parent prompt while AI pair is enabled. Disable other automation.', 'warning');
    else input(e.text, e.images);
    return { action: 'handled' as const };
  });
  pi.on('user_bash', (e) => {
    if (mode === 'off') return;
    input(`User requests this shell operation (assess/delegate; do not execute in the parent):\n${e.command}`);
    return { result: { output: 'Routed to Architect; not executed in parent.', exitCode: 0, cancelled: false, truncated: false } };
  });
  pi.on('session_start', async (_e, sessionCtx) => { ctx = sessionCtx; if (sessionCtx.mode === 'tui') await reapOrphans().catch((e) => sessionCtx.ui.notify(`AI orphan cleanup: ${e}`, 'warning')); });
  pi.on('session_shutdown', stop);
}
