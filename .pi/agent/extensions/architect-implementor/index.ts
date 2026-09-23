import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { StringEnum } from '@earendil-works/pi-ai';
import { Text } from '@earendil-works/pi-tui';
import { Type } from 'typebox';
import { loadConfig, levels } from './config.mjs';
import { Engine, communication } from './engine.mjs';
import { Implementor, reapOrphans, sessionName } from './transport.mjs';
import { Log, clean, renderPane, renderWorkflowStatus, renderUsageStatus, implementorStatus, workflowFooter } from './ui.ts';
import { emptyPairUsage, recordMessageUsage, recordUsage, usageReport, type PairUsage } from './usage.ts';
import { chooseModel, selection, modelLabel, initializeArchitect, type Selection } from './models.ts';
import { commonInstructions, architectInstructions, communicationAlone } from './prompts.ts';

type Mode = 'off' | 'starting' | 'active' | 'failed' | 'stopping';
type Directive = { kind: string; cycle: number; text: string };
type Request = { data: Directive; signal?: AbortSignal; started: boolean; resolve: (result: any) => void; reject: (error: unknown) => void };
export default function architectImplementor(pi: ExtensionAPI) {
  if (process.env.PI_AI_WORKER) return;
  let mode: Mode = 'off', ctx: ExtensionContext, config: any, engine: Engine;
  let implementor: Implementor | undefined;
  let generation = 0, busy = false, reported = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let repaint: ReturnType<typeof setTimeout> | undefined;
  let requestRender: (() => void) | undefined;
  let chain = Promise.resolve(), startup = Promise.resolve();
  let shutdown: Promise<void> | undefined;
  let reports: Directive[] = [], directives: Request[] = [];
  const requests = new Set<Request>();
  let feed = new Log(), override: Selection | undefined;
  let modelPicker: AbortController | undefined, modelChanging = false;
  let lastStatus: string | undefined;
  let usage: PairUsage | undefined;
  const status = () => ({ mode, phase: engine?.phase ?? 'planning', cycle: engine?.cycle ?? 0, startedAt: engine?.startedAt ?? 0, nextPing: engine?.nextPing ?? 0, checkinMs: engine?.intervalMs });
  function activeTool(enabled: boolean) {
    const tools = pi.getActiveTools().filter((name) => name !== 'ai_directive');
    pi.setActiveTools(enabled ? [...tools, 'ai_directive'] : tools);
  }
  function updateStatus() {
    const text = workflowFooter(status());
    if (text !== lastStatus) { ctx.ui.setStatus('architect-implementor', text); lastStatus = text; }
  }
  function render() {
    if (!repaint) repaint = setTimeout(() => { repaint = undefined; updateStatus(); requestRender?.(); }, 80);
  }
  function log(text: string) { feed.add(text); render(); }
  function show() {
    updateStatus();
    if (ctx.mode !== 'tui') return;
    ctx.ui.setWidget('architect-implementor', (tui, theme) => {
      requestRender = () => tui.requestRender();
      return {
        render: (width: number) => {
          const state = status(), space = Math.max(0, (tui.terminal.rows || 30) - 12);
          const header = [...renderWorkflowStatus(width, state, Date.now(), theme),
            ...(usage ? renderUsageStatus(width, usage, theme) : []),
          ].slice(0, Math.max(0, space - 3));
          const height = Math.max(0, Math.min(config.paneLines, space - header.length));
          return [...header, ...renderPane(width, height, {
            status: implementorStatus(state, busy) + (modelChanging ? ' • model queued' : ''),
            model: `${config.implementor.provider}/${config.implementor.model}`, thinking: config.implementor.thinking,
            sessionName: implementor ? sessionName(implementor.key) : undefined, log: feed,
            emptyMessage: mode === 'starting' ? 'Starting implementor…' : mode === 'stopping' ? 'Stopping implementor…' : mode === 'failed' ? 'Implementor stopped. Main Pi remains available. /pair-disable to clear.' : undefined,
          }, theme)];
        },
        invalidate() {},
      };
    }, { placement: 'aboveEditor' });
  }
  function message(content: string, label = 'Pair', body = content, triggerTurn = true) {
    pi.sendMessage({ customType: 'pair-update', content, display: true, details: { label, body } }, { triggerTurn, deliverAs: 'followUp' });
  }
  function rejectRequests(error: unknown) {
    for (const request of requests) request.reject(error);
    directives = []; reports = [];
  }
  function fail(error: unknown) {
    if (mode === 'off' || mode === 'stopping' || mode === 'failed') return;
    const wasActive = mode === 'active';
    mode = 'failed'; clearInterval(timer); modelPicker?.abort(); activeTool(false); updateStatus();
    const text = error instanceof Error ? error.message : String(error);
    rejectRequests(new Error(text));
    log(`ERROR: ${text}`);
    ctx.ui.notify(`Implementor stopped: ${text}. Main Pi remains available; /pair-disable to clear.`, 'error');
    message(`Implementor stopped: ${text}. A missing acknowledgement does not prove a directive was undelivered. Verify files and remote job state before retrying. Do not automatically replay work.`, 'Pair failure', undefined, wasActive);
    void implementor?.stop();
  }
  function enqueue(work: () => Promise<void>) {
    const mine = generation;
    chain = chain.then(async () => { if (mine === generation && mode === 'active') await work(); }).catch((error) => { if (mine === generation) fail(error); });
  }
  async function effects(items: any[], detail?: { label: string; body: string }) {
    const mine = generation, worker = implementor;
    for (const item of items) {
      if (mine !== generation || mode !== 'active' || !worker) throw new Error('Pair stopped during handoff');
      if (item.role === 'implementor') {
        log(`[${item.mode}] ${item.text}`);
        await worker.prompt(`/ai-control ${Buffer.from(JSON.stringify(item)).toString('base64url')}`);
      } else if (item.mode === 'accepted') ctx.ui.notify('Architect accepted the work. Pair remains enabled.', 'info');
      else message(item.text, detail?.label, detail?.body, item.triggerTurn);
    }
    if (mine === generation) render();
  }
  async function report(data: Directive) {
    let items;
    try { items = engine.report(data); }
    catch (error) {
      const text = `Protocol rejected (cycle ${engine.cycle}, ${engine.phase}): ${error instanceof Error ? error.message : String(error)}`;
      log(text); await implementor?.prompt(text); return;
    }
    await effects(items, { label: `○ Implementor • ${data.kind} • cycle ${data.cycle}`, body: data.text });
  }
  async function drain() {
    const mine = generation;
    while (mine === generation && mode === 'active') {
      // Reports win even if guidance was queued while another RPC acknowledgement
      // was in flight. A terminal report is not safe to act on until fully settled.
      if (reports.length) {
        if (busy) return;
        await report(reports.shift()!); continue;
      }
      const request = directives.shift();
      if (!request) return;
      if (request.signal?.aborted) { request.reject(new Error('Directive cancelled before dispatch')); continue; }
      let items;
      try { items = engine.directive(request.data); }
      catch (error) { request.reject(new Error(`Protocol rejected (cycle ${engine.cycle}, ${engine.phase}): ${error instanceof Error ? error.message : String(error)}`)); continue; }
      request.started = true;
      try {
        await effects(items);
        if (mine !== generation || mode !== 'active') throw new Error('Pair stopped during handoff');
        request.resolve({
          content: [{ type: 'text', text: `${request.data.kind === 'accept' ? 'Accepted' : 'Queued ' + request.data.kind + ' to implementor'}; cycle ${engine.cycle}, ${engine.phase}.${request.data.kind === 'accept' ? ' Explain the outcome and verification limits.' : ' Queued does not mean acted on. Yield until feedback or a check-in.'}` }],
          details: { cycle: engine.cycle, phase: engine.phase },
          ...(request.data.kind === 'accept' ? {} : { terminate: true }),
        });
      } catch (error) { request.reject(error); throw error; }
    }
  }
  function event(e: any) {
    if (mode === 'off' || mode === 'stopping' || mode === 'failed') return;
    if (e.type === 'extension_error') { fail(`Implementor extension error: ${e.error}`); return; }
    // Only authoritative terminal events, never streaming snapshots or turn_end.
    if (usage && e.type === 'message_end') recordMessageUsage(usage.implementor, e.message);
    if (usage && e.type === 'compaction_end' && !e.aborted && e.result?.usage !== undefined) recordUsage(usage.implementor, e.result.usage);
    if (e.type === 'agent_start') { if (!busy) reported = false; busy = true; }
    if (e.type === 'message_update') {
      const delta = e.assistantMessageEvent;
      if (delta?.type === 'text_start' || delta?.type === 'thinking_start') feed.start(delta.type === 'thinking_start' ? '[thinking] ' : '');
      if (delta?.type === 'text_delta' || delta?.type === 'thinking_delta') feed.delta(delta.delta);
    }
    if (e.type === 'tool_execution_start' && e.toolName !== 'ai_report') log(`→ ${e.toolName} ${JSON.stringify(e.args).slice(0, 1500)}`);
    if (e.type === 'tool_execution_end') {
      const data = !e.isError && e.toolName === 'ai_report' && e.result?.details?.ai;
      if (data) {
        log(`[queued ${data.kind}] ${data.text}`); reported = true;
        if (data.kind === 'status') enqueue(() => report(data));
        else reports.push(data);
      } else {
        const text = e.result?.content?.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n') ?? '';
        log(`${e.isError ? 'ERROR' : '←'} ${e.toolName}: ${text.slice(-4000)}`);
      }
    }
    if (e.type === 'agent_settled') {
      busy = false;
      if (reports.length || directives.length) enqueue(drain);
      else if (engine.phase === 'implementing' && !reported) enqueue(async () => {
        message(`Implementor is idle in cycle ${engine.cycle} without a status, blocker or completion report. Do not infer completion. Ping for status or guide it to continue/report a blocker.`, '○ Implementor • unreported idle');
      });
    }
    if (e.type === 'message_end' && e.message?.role === 'assistant' && ['error', 'aborted'].includes(e.message.stopReason)) log(`Model ${e.message.stopReason}: ${e.message.errorMessage ?? 'no details'}`);
    if (e.type === 'bridge_stderr') log(`[stderr] ${e.text}`);
    if (e.type === 'auto_retry_start' || e.type === 'compaction_start') log(`[${e.type}] ${e.errorMessage ?? ''}`);
    if (e.type === 'auto_retry_end' && e.success === false) ctx.ui.notify(`Implementor: model retries exhausted (${String(e.finalError ?? 'connection error').slice(0, 1000)}). Context retained; guide/ping it or use /pair-models.`, 'warning');
    if (e.type === 'extension_ui_request') {
      log(`[extension UI: ${e.method}] ${e.message ?? e.title ?? ''}`);
      if (['select', 'confirm', 'input', 'editor'].includes(e.method)) {
        try { implementor?.respondUi(e.id); } catch (error) { fail(error); }
        ctx.ui.notify('Implementor requested UI; cancelled. Resolve in the main conversation or adjust its extension allowlist.', 'warning');
      }
    }
    render();
  }
  function stop(): Promise<void> {
    if (shutdown) return shutdown;
    generation++; modelPicker?.abort(); modelPicker = undefined; override = undefined; modelChanging = false;
    activeTool(false);
    if (mode === 'off') return Promise.resolve();
    mode = 'stopping'; clearInterval(timer); clearTimeout(repaint); repaint = undefined;
    rejectRequests(new Error('Pair stopped; verify any already-dispatched work before retrying'));
    updateStatus(); requestRender?.();
    shutdown = (async () => {
      await implementor?.stop();
      await startup; // Do not let a late initialization clobber a replacement pair's model.
      implementor = undefined; busy = reported = false;
      ctx.ui.setWidget('architect-implementor', undefined); ctx.ui.setStatus('architect-implementor', undefined);
      lastStatus = undefined; requestRender = undefined; mode = 'off';
    })().finally(() => { shutdown = undefined; });
    return shutdown;
  }
  pi.registerTool({
    name: 'ai_directive', label: 'Direct implementor',
    description: 'Assign a new job with constraints/acceptance criteria, guide/resume the current job (including review corrections), ping for status without resuming coding, or accept independently reviewed work. Call alone. Supply the current cycle (0 before the first assignment); assign increments it. Text is capped at 6000 characters.',
    promptSnippet: 'Delegate to the persistent implementor and accept independently reviewed work',
    promptGuidelines: [`While ai_directive is active: ${architectInstructions}`, `When coordinating with ai_directive: ${commonInstructions}`],
    parameters: Type.Object({ kind: StringEnum(['assign', 'guide', 'ping', 'accept'] as const), cycle: Type.Integer({ minimum: 0 }), text: Type.String({ minLength: 1, maxLength: 6000 }) }),
    async execute(_id, params, signal) {
      if (mode !== 'active') throw new Error(`Pair is ${mode}; /pair-enable before delegating`);
      const data = communication(params, ['assign', 'guide', 'ping', 'accept']);
      if (signal?.aborted) throw new Error('Directive cancelled before dispatch');
      return new Promise<any>((resolve, reject) => {
        const finish = () => { requests.delete(request); signal?.removeEventListener('abort', abort); };
        const request: Request = { data, signal, started: false, resolve: (value) => { finish(); resolve(value); }, reject: (error) => { finish(); reject(error); } };
        const abort = () => { if (!request.started) { directives = directives.filter((r) => r !== request); request.reject(new Error('Directive cancelled before dispatch')); } };
        requests.add(request); directives.push(request); signal?.addEventListener('abort', abort, { once: true }); enqueue(drain);
      });
    },
    renderCall(args, theme, context) {
      const text = clean(String(args.text ?? ''));
      const title = args.kind === 'accept' ? 'Accept work' : `${args.kind ?? 'Direct'} → Implementor`;
      return new Text(theme.fg('toolTitle', theme.bold(title)) + (text ? '\n' + (context.expanded ? text : text.slice(0, 400) + (text.length > 400 ? '…' : '')) : ''), 0, 0);
    },
    renderResult(result, { expanded }, theme, context) {
      const text = result.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
      const cycle = (result.details as { cycle?: unknown } | undefined)?.cycle;
      const summary = !context.isError && !expanded && typeof cycle === 'number'
        ? `${context.args.kind === 'accept' ? 'Accepted' : 'Queued'} • cycle ${cycle}` : clean(text);
      return new Text(theme.fg(context.isError ? 'error' : 'muted', summary), 0, 0);
    },
  });
  pi.registerMessageRenderer('pair-update', (entry, { expanded, outputPad }, theme) => {
    const detail = entry.details as { label?: string; body?: string } | undefined;
    return new Text(theme.fg('customMessageLabel', theme.bold(clean(detail?.label ?? 'Pair'))) + '\n' + clean(String(expanded ? entry.content : detail?.body ?? entry.content)), outputPad, 0);
  });
  pi.on('tool_call', (e, toolCtx) => {
    if (e.toolName === 'ai_directive' && !communicationAlone(toolCtx)) return { block: true, reason: 'Call ai_directive alone, not alongside other tools.' };
  });
  pi.on('message_end', (e) => {
    if (mode === 'active' && usage && recordMessageUsage(usage.architect, e.message)) render();
  });
  pi.on('session_compact', (e) => {
    if (mode === 'active' && usage && e.compactionEntry.usage !== undefined) {
      recordUsage(usage.architect, e.compactionEntry.usage); render();
    }
  });
  pi.on('context', (e) => {
    if (mode === 'off' || mode === 'stopping') return;
    // Native tool/follow-up continuations need current state even when there has
    // been no new user prompt (before_agent_start is not a per-model-call hook).
    const state = mode === 'active' ? `Current pair state: cycle ${engine.cycle}; phase ${engine.phase}. Use this cycle for ai_directive. Historical reports from previous pair runs are not current assignments.`
      : `Pair is ${mode}; the implementor is unavailable. Do not replay work or assume it is complete.`;
    // Custom SYSTEM.md prompts may omit native tool promptGuidelines entirely.
    const content = mode === 'active' && !ctx.getSystemPrompt().includes(architectInstructions)
      ? `${architectInstructions}\n${commonInstructions}\n${state}` : state;
    return { messages: [...e.messages, { role: 'custom' as const, customType: 'pair-state', content, display: false, timestamp: Date.now() }] };
  });
  pi.registerCommand('pair-enable', {
    description: 'Make this Pi the architect and start one implementor; optional initial task',
    handler: async (args, commandCtx) => {
      if (modelPicker) { commandCtx.ui.notify('Finish or cancel the model picker first.', 'warning'); return; }
      if (mode !== 'off') { commandCtx.ui.notify('Pair already enabled; /pair-disable first.', 'warning'); return; }
      if (!commandCtx.hasUI) { commandCtx.ui.notify('Pair requires interactive Pi or RPC mode.', 'error'); return; }
      if (!commandCtx.isIdle() || commandCtx.hasPendingMessages()) { commandCtx.ui.notify('Wait for Pi to settle and disable conflicting automation before enabling.', 'warning'); return; }
      ctx = commandCtx;
      try { config = loadConfig(); Object.assign(config.implementor, override); }
      catch (error) { ctx.ui.notify(String(error), 'error'); return; }
      feed = new Log(); usage = emptyPairUsage(); engine = new Engine(config.checkinSeconds * 1000); mode = 'starting';
      const mine = ++generation; chain = Promise.resolve(); show();
      startup = (async () => {
        await initializeArchitect(pi, ctx, config.architect, () => mine === generation);
        if (mine !== generation) return;
        implementor = new Implementor(config, ctx.cwd, ctx.sessionManager.getSessionId(),
          (e: any) => { if (mine === generation) event(e); }, (error: unknown) => { if (mine === generation) fail(error); });
        await implementor.start();
        if (mine !== generation || mode !== 'starting') return;
        mode = 'active'; activeTool(true); updateStatus(); render();
        timer = setInterval(() => { render(); enqueue(async () => { await effects(engine.tick()); }); }, 1000);
        ctx.ui.notify('Pair enabled. Main Pi is the architect; /model and /thinking work normally. /pair-models controls the implementor.', 'info');
        if (args.trim()) pi.sendUserMessage(args.trim(), { deliverAs: 'followUp' });
      })().catch((error) => { if (mine === generation) fail(error); });
      await startup;
    },
  });
  pi.registerCommand('pair-disable', { description: 'Stop the implementor; retain the main conversation and current model', handler: async (_args, commandCtx) => { await stop(); commandCtx.ui.notify('Pair disabled. Main conversation and model retained.', 'info'); } });
  pi.registerCommand('pair-usage', {
    description: 'Reported tokens and estimated cost by role for the current or last enabled pair',
    handler: async (_args, commandCtx) => {
      commandCtx.ui.notify(usage ? `Pair usage — ${mode === 'off' ? 'last' : 'current'} enable\n${usageReport(usage)}` : 'No pair usage recorded. /pair-enable starts new totals.', 'info');
    },
  });
  pi.registerCommand('pair-models', {
    description: 'Temporary implementor model/effort: [PROVIDER/MODEL EFFORT | EFFORT | reset]; architect uses /model and /thinking',
    getArgumentCompletions: (prefix) => [...levels, 'reset'].filter((s) => s.startsWith(prefix)).map((s) => ({ value: s, label: s })),
    handler: async (args, commandCtx) => {
      if (!commandCtx.hasUI) return;
      if (mode !== 'off' && mode !== 'active') { commandCtx.ui.notify('Wait for startup, or /pair-disable first.', 'warning'); return; }
      if (modelPicker || modelChanging) { commandCtx.ui.notify('An implementor model selection/change is already pending.', 'warning'); return; }
      const mine = generation, worker = implementor, initialMode = mode;
      const controller = new AbortController(); modelPicker = controller;
      try {
        const current = mode === 'off' ? Object.assign(loadConfig().implementor, override) : config.implementor;
        const available = async () => worker ? ((await worker.rpc({ type: 'get_available_models' })) as any).models : commandCtx.modelRegistry.getAvailable();
        const choice = await chooseModel(args, current, commandCtx.ui, available, controller.signal);
        if (!choice || controller.signal.aborted || mine !== generation || mode !== initialMode) return;
        const target = choice.reset ? selection(loadConfig().implementor) : choice.target!;
        if (!worker) {
          const models = await available();
          if (controller.signal.aborted || mine !== generation || mode !== 'off') return;
          if (!models.some((m: any) => m.provider === target.provider && m.id === target.model)) throw new Error(`Model unavailable: ${target.provider}/${target.model}`);
          override = choice.reset ? undefined : target;
          commandCtx.ui.notify(`Implementor: ${modelLabel(target)} for the next /pair-enable; worker validates effort at startup. JSON unchanged.`, 'info'); return;
        }
        modelChanging = true; log(`[model change queued] ${modelLabel(target)}`);
        commandCtx.ui.notify(`Implementor: queued ${modelLabel(target)} for its next settled boundary (up to 10 minutes). Context retained; JSON unchanged.`, 'info');
        void worker.changeModel(target).then(() => {
          if (mine !== generation || mode !== 'active' || implementor !== worker) return;
          override = choice.reset ? undefined : target; log(`[model changed] ${modelLabel(target)}`);
          commandCtx.ui.notify(`Implementor: ${modelLabel(target)} for this pair only.`, 'info');
        }).catch((error) => {
          if (mine !== generation || mode !== 'active') return;
          log(`[model change rejected] ${error.message}`); commandCtx.ui.notify(error.message, 'error');
        }).finally(() => { if (mine === generation) { modelChanging = false; render(); } });
      } catch (error) { if (!controller.signal.aborted && mine === generation) commandCtx.ui.notify(String(error), 'error'); }
      finally { if (modelPicker === controller) modelPicker = undefined; }
    },
  });
  pi.on('session_start', async (_e, sessionCtx) => { ctx = sessionCtx; usage = undefined; activeTool(false); await reapOrphans().catch((error) => ctx.ui.notify(`AI orphan cleanup: ${error}`, 'warning')); });
  pi.on('session_shutdown', stop);
  // A worker must not keep implementing a plan from an abandoned main branch.
  pi.on('session_tree', stop);
}
