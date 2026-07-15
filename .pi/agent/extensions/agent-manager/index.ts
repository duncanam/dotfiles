/**
 * agent-manager — standalone extension (works with any provider except Cursor children).
 *
 * For Cursor children, use the bundled version in the pi-cursor-sdk fork.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai/compat";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
	getConfigPath,
	loadConfig,
	resetConfig,
	saveConfig,
	type AgentManagerConfig,
} from "./config.js";
import { spawnSwarm, type Swarm } from "./agents.js";
import { SwarmUI } from "./ui.js";

interface ActiveState {
	config: AgentManagerConfig;
	swarm: Swarm;
	ui: SwarmUI;
	previousModel: Model<any> | undefined;
	managerCost: number;
	previousActiveTools: string[];
	previousThinkingLevel: ReturnType<ExtensionAPI["getThinkingLevel"]>;
}

const MANAGER_ROLE = (config: AgentManagerConfig) => `
## Role: manager (agent-manager mode active)

You are the MANAGER of a manager→lead→worker agent tree:
- ${config.leads} lead agents (${config.lead.model}), each commanding ${config.workersPerLead} workers (${config.worker.model}).
- Inspect only enough context to decompose work, delegate it, integrate reports, and report to the user.
- Use delegate for implementation, testing, builds, expensive searches, and all leaf work.
- Use multiple delegate calls in one assistant turn when sub-domains are independent.
- Leads fan out to their workers and report concise summaries.
- A message telling you to continue a todo means delegate that todo.
- Delegated tasks must include goal, paths, constraints, and completion criteria.
- Synthesize lead output and call out unresolved risks rather than pasting raw reports.`;

export default function agentManagerExtension(pi: ExtensionAPI): void {
	let active: ActiveState | undefined;

	pi.on("session_start", () => {
		if (!active) pi.setActiveTools(pi.getActiveTools().filter((name) => name !== "delegate"));
	});

	pi.on("input", (event) => {
		if (!active || event.source !== "extension" || !event.text.startsWith("Continue with the next open todo:")) {
			return;
		}
		return {
			action: "transform" as const,
			text:
				event.text +
				"\n\nAgent-manager mode is active: delegate this todo to one or more leads. Do not execute leaf work directly.",
			images: event.images ?? [],
		};
	});

	pi.on("tool_call", (event) => {
		if (
			!active ||
			active.config.managerTools.includes(event.toolName) ||
			!["bash", "edit", "write", "nomad_submit"].includes(event.toolName)
		) {
			return;
		}
		return {
			block: true,
			reason: `Manager tool ${event.toolName} is disabled in agent-manager mode. Delegate the work to a lead.`,
		};
	});

	pi.on("before_agent_start", async (event) => {
		if (!active || typeof event.systemPrompt !== "string") return;
		return { systemPrompt: event.systemPrompt + MANAGER_ROLE(active.config) };
	});

	pi.on("message_end", async (event) => {
		if (!active || event.message.role !== "assistant") return;
		const usage = (event.message as { usage?: { cost?: { total?: number } } }).usage;
		if (usage?.cost?.total) {
			active.managerCost += usage.cost.total;
			active.ui.markDirty();
		}
	});

	pi.registerTool({
		name: "delegate",
		label: "Delegate",
		description:
			"Delegate a self-contained task to a lead agent. Call delegate several times in one turn for independent parallel work.",
		promptSnippet: "Delegate a sub-domain of work to a lead agent",
		promptGuidelines: [
			"Use delegate for implementation, testing, builds, and other leaf work in agent-manager mode.",
			"Call delegate multiple times in one assistant turn when lead tasks are independent.",
		],
		parameters: Type.Object({
			lead: Type.Optional(Type.Integer({ minimum: 1, description: "Lead number (1-indexed)" })),
			task: Type.Optional(
				Type.String({ description: "Self-contained task: goal, paths, constraints, completion criteria" }),
			),
		}),
		renderCall: (args, theme) => {
			const target = typeof args.lead === "number" ? `lead${args.lead}` : "lead?";
			return new Text(theme.fg("toolTitle", theme.bold(`delegate → ${target}`)), 0, 0);
		},
		renderResult: (result, _options, theme) => {
			const text = (result.content as Array<{ type: string; text?: string }>).find(
				(c) => c.type === "text",
			)?.text ?? "(completed)";
			const firstLine = text.split("\n")[0].slice(0, 80);
			return new Text(theme.fg("toolOutput", firstLine), 0, 0);
		},
		async execute(_id, params, signal, onUpdate) {
			if (!active) throw new Error("No active agent tree. Run /agent-manager first.");
			const leadCount = active.swarm.leads.length;
			const softError = (text: string) => ({ content: [{ type: "text" as const, text }], details: {} });
			if (typeof params.lead !== "number" || !params.task || !params.task.trim()) {
				return softError(
					`Incomplete delegate call (missing ${
						typeof params.lead !== "number" ? "lead" : "task"
					}). Re-issue delegate with both a lead number (1-${leadCount}) and a self-contained task including goal, paths, constraints, and completion criteria.`,
			);
			}
			const lead = active.swarm.leads[params.lead - 1];
			if (!lead) {
				return softError(`Lead ${params.lead} does not exist. Re-issue delegate with a lead number in 1-${leadCount}.`);
			}
			onUpdate?.({
				content: [{ type: "text", text: `Delegated to ${lead.id}; live progress is shown in its panel…` }],
				details: {},
			});
			const report = await lead.run(params.task, signal);
			void report;
			return { content: [{ type: "text", text: `## Report from ${lead.id}\n\n${report}` }], details: {} };
		},
	});

	async function teardown(restoreModel: boolean): Promise<void> {
		if (!active) return;
		const state = active;
		active = undefined;
		state.ui.stop();
		await state.swarm.disposeAll();
		if (!restoreModel) return;
		pi.setActiveTools(state.previousActiveTools);
		if (state.previousModel) {
			try {
				await pi.setModel(state.previousModel);
			} catch {
				// The prior model may no longer be available.
			}
		}
		pi.setThinkingLevel(state.previousThinkingLevel);
	}

	pi.registerCommand("agent-manager", {
		description: "Activate the manager→lead→worker tree; an optional argument starts an initial task",
		handler: async (args, context) => {
			if (active) {
				context.ui.notify("agent-manager already active — /agent-manager-kill first", "warning");
				return;
			}
			const config = loadConfig();

			// Guard: Cursor children deadlock in-process without the pi-cursor-sdk fork.
			const cursorChildTiers = [
				config.lead.provider === "cursor" ? "lead" : undefined,
				config.worker.provider === "cursor" ? "worker" : undefined,
			].filter((tier): tier is string => tier !== undefined);
			if (cursorChildTiers.length > 0) {
				context.ui.notify(
					`Cursor cannot be used for in-process ${cursorChildTiers.join(
						"/",
					)} agents without the pi-cursor-sdk fork (gh:duncanam/pi-cursor-sdk). ` +
						`Choose a non-Cursor child provider in ${getConfigPath()}.`,
					"error",
				);
				return;
			}

			const managerModel = context.modelRegistry.find(config.manager.provider, config.manager.model);
			if (!managerModel) {
				context.ui.notify(
					`Manager model ${config.manager.provider}/${config.manager.model} not found`,
					"error",
				);
				return;
			}

			context.ui.notify(
				`Spawning ${config.leads} leads × ${config.workersPerLead} workers (${config.leads * config.workersPerLead + config.leads} child sessions)…`,
				"info",
			);
			let ui: SwarmUI | undefined;
			const onChange = () => ui?.markDirty();
			let swarm: Swarm;
			try {
				swarm = await spawnSwarm(context.cwd, config, onChange, context.modelRegistry);
			} catch (error) {
				context.ui.notify(
					`agent-manager spawn failed: ${error instanceof Error ? error.message : error}`,
					"error",
				);
				return;
			}

			const previousModel = context.model;
			const previousActiveTools = pi.getActiveTools();
			const previousThinkingLevel = pi.getThinkingLevel();
			const switched = await pi.setModel(managerModel);
			if (!switched) {
				await swarm.disposeAll();
				context.ui.notify(`Could not switch to manager model ${config.manager.model}`, "error");
				return;
			}
			try {
				pi.setThinkingLevel(config.manager.thinkingLevel);
			} catch {
				// Non-fatal; keep current thinking level.
			}
			const knownTools = new Set(pi.getAllTools().map((tool) => tool.name));
			const managerTools = [...new Set([...config.managerTools, "delegate"])].filter((name) =>
				knownTools.has(name),
			);
			try {
				pi.setActiveTools(managerTools);
			} catch {
				// Non-fatal; tool restrictions degrade gracefully.
			}

			ui = new SwarmUI(context.ui, config, swarm, () => active?.managerCost ?? 0);
			for (const lead of swarm.leads) lead.onChange = onChange;
			for (const group of swarm.workers) {
				for (const worker of group) worker.onChange = onChange;
			}
			active = {
				config,
				swarm,
				ui,
				previousModel,
				managerCost: 0,
				previousActiveTools,
				previousThinkingLevel,
			};
			ui.start();
			context.ui.notify(
				"agent-manager active. Manager tools are read-only; steer mid-flight with Enter. /agent-manager-kill to stop.",
				"info",
			);
			if (args.trim()) pi.sendUserMessage(args.trim());
		},
	});

	pi.registerCommand("agent-manager-config", {
		description: "Edit persistent agent-manager defaults, or use: /agent-manager-config reset",
		handler: async (args, context) => {
			if (args.trim() === "reset") {
				resetConfig();
				context.ui.notify(`Reset agent-manager defaults (${getConfigPath()})`, "info");
				return;
			}
			if (!context.hasUI) {
				context.ui.notify(`Edit ${getConfigPath()} in an interactive Pi session`, "warning");
				return;
			}
			const edited = await context.ui.editor(
				"Agent-manager defaults (JSON)",
				`${JSON.stringify(loadConfig(), null, 2)}\n`,
			);
			if (edited === undefined) return;
			try {
				const saved = saveConfig(JSON.parse(edited));
				context.ui.notify(
					`Saved ${getConfigPath()} (${saved.leads} leads × ${saved.workersPerLead} workers); applies next activation`,
					"info",
				);
			} catch (error) {
				context.ui.notify(
					`Invalid agent-manager config: ${error instanceof Error ? error.message : error}`,
					"error",
				);
			}
		},
	});

	pi.registerCommand("agent-manager-kill", {
		description: "Kill the agent tree, clear widgets, and restore the previous model",
		handler: async (_args, context) => {
			if (!active) {
				context.ui.notify("agent-manager is not active", "info");
				return;
			}
			await teardown(true);
			context.ui.notify("agent-manager stopped — children disposed, UI cleared, model restored", "info");
		},
	});

	pi.on("session_shutdown", async () => {
		try {
			await teardown(false);
		} catch {
			// Swallow shutdown errors — Pi is already terminating.
		}
	});
}
