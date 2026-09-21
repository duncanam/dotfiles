import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { StringEnum } from '@earendil-works/pi-ai';
import { Type } from 'typebox';
import { workerTools } from './config.mjs';
import { commonInstructions, implementorInstructions, communicationAlone } from './prompts.ts';

export default function worker(pi: ExtensionAPI) {
  if (!process.env.PI_AI_WORKER) return;
  const { config } = JSON.parse(process.env.PI_AI_WORKER);
  let cycle = 0, paused = true, sentTerminal = false;
  const tools = [...new Set<string>([...workerTools, ...config.implementor.extraTools])];
  let watchdog: ReturnType<typeof setInterval> | undefined;
  let forcedExit: ReturnType<typeof setTimeout> | undefined;
  pi.on('session_start', (_event, ctx) => {
    // Secondary guard: even SIGKILL of the bridge must not strand its Pi child.
    const bridgePid = Number(process.env.PI_AI_BRIDGE_PID);
    if (bridgePid > 1) {
      watchdog = setInterval(() => {
        if (process.ppid === bridgePid) return;
        paused = true; sentTerminal = true;
        clearInterval(watchdog);
        ctx.abort(); ctx.shutdown();
        forcedExit = setTimeout(() => process.exit(1), 3000);
        forcedExit.unref();
      }, 1000);
      watchdog.unref();
    }
    const present = new Set(pi.getAllTools().map((t) => t.name));
    for (const name of tools) if (!present.has(name)) throw new Error(`Configured implementor tool is unavailable: ${name}`);
    pi.setActiveTools(tools);
  });
  pi.on('session_shutdown', () => { clearInterval(watchdog); clearTimeout(forcedExit); });
  pi.on('before_agent_start', (event) => ({ systemPrompt: `${event.systemPrompt}\n\n${implementorInstructions}\n${commonInstructions}\nCurrent assignment cycle: ${cycle}.` }));
  pi.on('tool_call', (event, ctx) => {
    if (sentTerminal || (paused && event.toolName !== 'ai_report')) return { block: true, terminate: true, reason: 'Paused: await architect guidance or a new cycle' };
    if (event.toolName === 'ai_report' && !communicationAlone(ctx)) return { block: true, reason: 'Call the communication tool alone, not alongside any other tools.' };
  });
  pi.on('agent_settled', () => { sentTerminal = false; });
  pi.registerCommand('ai-control', {
    description: 'Internal implementor control',
    handler: async (args) => {
      const data = JSON.parse(Buffer.from(args, 'base64url').toString('utf8'));
      if (!['assign', 'guide', 'ping'].includes(data.mode) || !Number.isSafeInteger(data.cycle) || data.cycle < 1
        || (data.mode === 'assign' ? data.cycle !== cycle + 1 : data.cycle !== cycle)
        || typeof data.text !== 'string' || !data.text.trim() || data.text.length > 6000) throw new Error('Invalid cycle control');
      cycle = data.cycle;
      if (data.mode === 'assign' || data.mode === 'guide') paused = false;
      sentTerminal = false;
      pi.sendUserMessage(`[Architect ${data.mode}; cycle ${cycle}]\n${data.text}`, { deliverAs: 'steer' });
    },
  });
  pi.registerTool({
    name: 'ai_report', label: 'Report to architect', description: 'Send a concise status, blocker, or completion summary (not logs). blocked/done pause implementation pending architect guidance. Call alone.',
    parameters: Type.Object({ kind: StringEnum(['status', 'blocked', 'done'] as const), cycle: Type.Integer({ minimum: 1 }), text: Type.String({ minLength: 1, maxLength: 6000 }) }),
    async execute(_id, params) {
      if (params.cycle !== cycle) throw new Error(`Current cycle is ${cycle}`);
      if (params.kind !== 'status') { paused = true; sentTerminal = true; }
      const text = params.kind === 'status' ? (paused ? 'Status sent. Remain paused pending architect guidance.' : 'Status sent. Continue useful work or yield while awaiting external progress.') : 'Paused; wait for architect guidance.';
      return { content: [{ type: 'text', text }], details: { ai: params }, ...(params.kind !== 'status' ? { terminate: true } : {}) };
    },
  });
}
