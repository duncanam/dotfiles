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
	loadConfigEditorText,
	resetConfig,
	saveConfig,
	type AgentManagerConfig,
} from "./config.js";
import { boundAgentReport, boundAggregateReport, spawnSwarm, type Swarm } from "./agents.js";
import { SwarmUI } from "./ui.js";

export const AGENT_MANAGER_EVENTS = {
	activated: "agent-manager:activated",
	stopping: "agent-manager:stopping",
	stopped: "agent-manager:stopped",
	assignmentStarted: "agent-manager:assignment-started",
	assignmentCompleted: "agent-manager:assignment-completed",
	costUpdated: "agent-manager:cost-updated",
} as const;

interface ActiveState {
	config: AgentManagerConfig;
	swarm: Swarm;
	ui: SwarmUI;
	previousModel: Model<any> | undefined;
	managerCost: number;
	lastEmittedTotalCost: number;
	previousActiveTools: string[];
	previousThinkingLevel: ReturnType<ExtensionAPI["getThinkingLevel"]>;
	managerAllowedTools: ReadonlySet<string>;
	delegationControllers: Set<AbortController>;
}

const MANAGER_ROLE = (config: AgentManagerConfig) => `
## Role: manager (agent-manager mode active)

You are the MANAGER of a manager→lead→worker agent tree:
- ${config.leads} lead agents (${config.lead.model}), each commanding ${config.workersPerLead} workers (${config.worker.model}).
- Inspect only enough context to decompose work, delegate it, integrate reports, and report to the user.
- Use delegate with the assignments array to fan out to multiple leads in ONE call — more reliable than separate parallel calls.
- Each task must include goal, paths, constraints, and completion criteria.
- Leads fan out to their workers and report concise summaries.
- A message telling you to continue a todo means delegate that todo.
- Delegated tasks must include goal, paths, constraints, and completion criteria.
- Synthesize lead output and call out unresolved risks rather than pasting raw reports.`;

export default function agentManagerExtension(pi: ExtensionAPI): void {
	let active: ActiveState | undefined;
	let correctingModel = false;
	let correctingThinking = false;

	const emitEvent = (name: string, data: Record<string, unknown>) => {
		try {
			pi.events.emit(name, data);
		} catch (error) {
			console.error(`agent-manager event ${name} failed: ${error instanceof Error ? error.message : error}`);
		}
	};

	const emitCostUpdate = (state: ActiveState) => {
		const childCost = [...state.swarm.leads, ...state.swarm.workers.flat()].reduce(
			(total, agent) => total + agent.cost,
			0,
		);
		const totalCost = state.managerCost + childCost;
		if (totalCost === state.lastEmittedTotalCost) return;
		state.lastEmittedTotalCost = totalCost;
		emitEvent(AGENT_MANAGER_EVENTS.costUpdated, {
			managerCost: state.managerCost,
			childCost,
			totalCost,
		});
	};

	pi.on("session_start", () => {
		if (!active) pi.setActiveTools(pi.getActiveTools().filter((name) => name !== "delegate"));
	});

	pi.on("input", (event) => {
		if (!active) return;

		// Leave interactive steering to Pi's normal queue. It will be delivered
		// after the current delegation finishes instead of aborting child agents.
		if (event.source !== "extension" || !event.text.startsWith("Continue with the next open todo:")) {
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
		if (!active) return;
		if (active.managerAllowedTools.has(event.toolName)) return;
		return {
			block: true,
			reason: `Manager tool ${event.toolName} is not allowlisted in agent-manager mode. Delegate the work to a lead.`,
		};
	});

	pi.on("before_agent_start", async (event) => {
		if (!active || typeof event.systemPrompt !== "string") return;
		// before_agent_start receives a freshly assembled prompt for every run.
		return { systemPrompt: event.systemPrompt + MANAGER_ROLE(active.config) };
	});

	pi.on("before_provider_headers", (event) => {
		if (!active) return;
		event.headers["x-agent-manager-agent-id"] = "manager";
		event.headers["x-agent-manager-tier"] = "manager";
	});

	pi.on("model_select", async (event, context) => {
		if (!active || correctingModel) return;
		const expected = active.config.manager;
		if (event.model.provider === expected.provider && event.model.id === expected.model) return;
		const managerModel = context.modelRegistry.find(expected.provider, expected.model);
		if (!managerModel) {
			context.ui.notify(`Configured manager model ${expected.provider}/${expected.model} disappeared`, "error");
			return;
		}
		correctingModel = true;
		try {
			const restored = await pi.setModel(managerModel);
			if (!restored) {
				context.ui.notify(`Could not restore manager model ${expected.provider}/${expected.model}`, "error");
				return;
			}
			pi.setThinkingLevel(expected.thinkingLevel);
			context.ui.notify(
				`agent-manager restored ${expected.provider}/${expected.model}; use /agent-manager-kill before changing models`,
				"warning",
			);
		} catch (error) {
			context.ui.notify(
				`Could not restore manager model: ${error instanceof Error ? error.message : error}`,
				"error",
			);
		} finally {
			correctingModel = false;
		}
	});

	pi.on("thinking_level_select", (event, context) => {
		if (!active || correctingThinking || correctingModel) return;
		const expected = active.config.manager.thinkingLevel;
		if (event.level === expected) return;
		correctingThinking = true;
		try {
			pi.setThinkingLevel(expected);
			context.ui.notify(
				`agent-manager restored thinking level ${expected}; use /agent-manager-kill before changing it`,
				"warning",
			);
		} catch (error) {
			context.ui.notify(
				`Could not restore manager thinking level: ${error instanceof Error ? error.message : error}`,
				"error",
			);
		} finally {
			correctingThinking = false;
		}
	});

	pi.on("message_end", async (event) => {
		if (!active || event.message.role !== "assistant") return;
		const usage = (event.message as { usage?: { cost?: { total?: number } } }).usage;
		if (usage?.cost?.total) {
			active.managerCost += usage.cost.total;
			active.ui.markDirty();
			emitCostUpdate(active);
		}
	});

	pi.registerTool({
		name: "delegate",
		label: "Delegate",
		description:
			"Assign work to one or more leads in a single call. Each assignment assigns one lead a self-contained task. Leads execute in parallel.",
		promptSnippet: "Assign work to one or more leads",
		promptGuidelines: [
			"Use delegate to fan out to multiple leads in one call via the assignments array.",
			"Each task must be self-contained (goal, paths, constraints, completion criteria).",
		],
		parameters: Type.Object({
			assignments: Type.Array(
				Type.Object({
					lead: Type.Integer({ minimum: 1, description: "Lead number (1-indexed)" }),
					task: Type.String({
						description: "Self-contained task: goal, paths, constraints, completion criteria",
					}),
				}),
				{ minItems: 1, maxItems: 10 },
			),
		}),
		renderCall: (args, theme) => {
			const count = args.assignments?.length ?? 0;
			const label = count <= 1 ? `delegate → lead${args.assignments?.[0]?.lead ?? "?"}` : `delegate → ${count} leads`;
			return new Text(theme.fg("toolTitle", theme.bold(label)), 0, 0);
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
			const state = active;
			const seenLeads = new Set<number>();
			const validated = params.assignments.map((assignment, index) => {
				const task = assignment.task.trim();
				if (!task) throw new Error(`Assignment ${index + 1} for lead${assignment.lead} has an empty task.`);
				const lead = state.swarm.leads[assignment.lead - 1];
				if (!lead) {
					throw new Error(
						`Assignment ${index + 1} targets lead${assignment.lead}; valid leads are 1-${state.swarm.leads.length}.`,
					);
				}
				if (seenLeads.has(assignment.lead)) {
					throw new Error(`Lead${assignment.lead} appears more than once in the same delegation batch.`);
				}
				seenLeads.add(assignment.lead);
				return { lead, task };
			});

			const controller = new AbortController();
			const abortFromParent = () => controller.abort(signal?.reason);
			if (signal?.aborted) abortFromParent();
			else signal?.addEventListener("abort", abortFromParent, { once: true });
			state.delegationControllers.add(controller);
			const startedAt = Date.now();
			const startingCosts = new Map(validated.map(({ lead }) => [lead.id, lead.cost]));
			emitEvent(AGENT_MANAGER_EVENTS.assignmentStarted, {
				batchId: _id,
				assignments: validated.map(({ lead, task }) => ({ leadId: lead.id, task })),
				startedAt,
			});
			let completed = 0;
			onUpdate?.({
				content: [{ type: "text", text: `Running ${validated.map(({ lead }) => lead.id).join(", ")}…` }],
				details: {},
			});
			try {
				const reports = await Promise.all(
					validated.map(async ({ lead, task }) => {
						const report = await lead.run(task, controller.signal);
						completed += 1;
						onUpdate?.({
							content: [{ type: "text", text: `${completed}/${validated.length} lead assignment(s) completed…` }],
							details: {},
						});
						const fullText = `## ${lead.id}\n${report}`;
						const status = report.startsWith("TIMEOUT")
							? "timed_out"
							: report.startsWith("CANCELLED")
								? "aborted"
								: report.startsWith("ERROR")
									? "error"
									: "completed";
						return {
							leadId: lead.id,
							task,
							report,
							status,
							cost: lead.cost - (startingCosts.get(lead.id) ?? 0),
							bounded: boundAgentReport(fullText),
						};
					}),
				);
				const aggregate = boundAggregateReport(reports.map(({ bounded }) => bounded.content).join("\n\n"));
				const endedAt = Date.now();
				const batchStatus = controller.signal.aborted
					? "aborted"
					: reports.some(({ status }) => status !== "completed")
						? "partial"
						: "completed";
				emitEvent(AGENT_MANAGER_EVENTS.assignmentCompleted, {
					batchId: _id,
					status: batchStatus,
					leadIds: reports.map(({ leadId }) => leadId),
					startedAt,
					endedAt,
				});
				return {
					content: [{ type: "text", text: aggregate.content }],
					details: {
						batchId: _id,
						status: batchStatus,
						startedAt,
						endedAt,
						durationMs: endedAt - startedAt,
						reports: reports.map(({ leadId, task, report, status, cost, bounded }) => ({
							leadId,
							task,
							report,
							status,
							cost,
							truncated: bounded.truncated,
						})),
						aggregateTruncated: aggregate.truncated,
					},
				};
			} finally {
				state.delegationControllers.delete(controller);
				signal?.removeEventListener("abort", abortFromParent);
			}
		},
	});

	async function teardown(restoreState: boolean, reason: string): Promise<Error[]> {
		if (!active) return [];
		const state = active;
		active = undefined;
		emitEvent(AGENT_MANAGER_EVENTS.stopping, { reason });
		const errors: Error[] = [];
		const capture = (step: string, error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			errors.push(new Error(`${step}: ${message}`));
		};

		for (const controller of state.delegationControllers) controller.abort("agent-manager teardown");
		state.delegationControllers.clear();
		try {
			state.ui.stop();
		} catch (error) {
			capture("UI cleanup failed", error);
		}
		try {
			await state.swarm.disposeAll();
		} catch (error) {
			capture("child disposal failed", error);
		}

		if (restoreState) {
			try {
				pi.setActiveTools(state.previousActiveTools);
			} catch (error) {
				capture("tool restoration failed", error);
			}
			if (state.previousModel) {
				try {
					const restored = await pi.setModel(state.previousModel);
					if (!restored) capture("model restoration failed", "model authentication is unavailable");
				} catch (error) {
					capture("model restoration failed", error);
				}
			}
			try {
				pi.setThinkingLevel(state.previousThinkingLevel);
			} catch (error) {
				capture("thinking-level restoration failed", error);
			}
		}
		emitEvent(AGENT_MANAGER_EVENTS.stopped, {
			reason,
			restoredHostState: restoreState,
			errors: errors.map((error) => error.message),
		});
		return errors;
	}

	pi.registerCommand("agent-manager", {
		description: "Activate the manager→lead→worker tree; an optional argument starts an initial task",
		handler: async (args, context) => {
			if (active) {
				context.ui.notify("agent-manager already active — /agent-manager-kill first", "warning");
				return;
			}
			let config: AgentManagerConfig;
			try {
				config = loadConfig();
			} catch (error) {
				context.ui.notify(
					`Invalid agent-manager config: ${error instanceof Error ? error.message : error}`,
					"error",
				);
				return;
			}

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
			if (!context.modelRegistry.hasConfiguredAuth(managerModel)) {
				context.ui.notify(
					`Manager model ${config.manager.provider}/${config.manager.model} has no configured authentication`,
					"error",
				);
				return;
			}
			const knownTools = new Set(pi.getAllTools().map((tool) => tool.name));
			const missingManagerTools = [...new Set([...config.managerTools, "delegate"])].filter(
				(name) => !knownTools.has(name),
			);
			if (missingManagerTools.length > 0) {
				context.ui.notify(
					`Manager tool(s) not found: ${missingManagerTools.join(", ")}`,
					"error",
				);
				return;
			}

			context.ui.notify(
				`Spawning ${config.leads} leads × ${config.workersPerLead} workers (${config.leads * config.workersPerLead + config.leads} child sessions)…`,
				"info",
			);
			let ui: SwarmUI | undefined;
			const onChange = () => {
				ui?.markDirty();
				if (active) emitCostUpdate(active);
			};
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
			const managerTools = [...new Set([...config.managerTools, "delegate"])];
			try {
				pi.setActiveTools(managerTools);
				const installed = pi.getActiveTools();
				const expectedSet = new Set(managerTools);
				if (
					installed.length !== expectedSet.size ||
					installed.some((name) => !expectedSet.has(name)) ||
					managerTools.some((name) => !installed.includes(name))
				) {
					throw new Error(
						`Pi installed an unexpected active-tool set (expected: ${managerTools.join(", ")}; actual: ${installed.join(", ")})`,
					);
				}
			} catch (error) {
				await swarm.disposeAll();
				try {
					pi.setActiveTools(previousActiveTools);
				} catch {
					// Continue rollback attempts independently.
				}
				try {
					if (previousModel) await pi.setModel(previousModel);
				} catch {
					// Continue rollback attempts independently.
				}
				try {
					pi.setThinkingLevel(previousThinkingLevel);
				} catch {
					// Continue rollback attempts independently.
				}
				context.ui.notify(
					`Could not enforce manager tool restrictions: ${error instanceof Error ? error.message : error}`,
					"error",
				);
				return;
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
				lastEmittedTotalCost: 0,
				previousActiveTools,
				previousThinkingLevel,
				managerAllowedTools: new Set(managerTools),
				delegationControllers: new Set(),
			};
			ui.start();
			emitEvent(AGENT_MANAGER_EVENTS.activated, {
				cwd: context.cwd,
				managerModel: `${config.manager.provider}/${config.manager.model}`,
				leadModel: `${config.lead.provider}/${config.lead.model}`,
				workerModel: `${config.worker.provider}/${config.worker.model}`,
				leads: config.leads,
				workersPerLead: config.workersPerLead,
			});
			context.ui.notify(
				"agent-manager active. Manager tools are read-only; steering queues until the current delegation finishes. /agent-manager-kill to stop.",
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
				loadConfigEditorText(),
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
			const errors = await teardown(true, "kill");
			if (errors.length > 0) {
				context.ui.notify(
					`agent-manager stopped with cleanup warnings: ${errors.map((error) => error.message).join("; ")}`,
					"warning",
				);
				return;
			}
			context.ui.notify("agent-manager stopped — children disposed, UI cleared, model restored", "info");
		},
	});

	pi.on("session_shutdown", async (event) => {
		// Reload keeps the current host session alive, so restore its pre-manager
		// state before the old extension runtime becomes stale.
		const errors = await teardown(event.reason === "reload", event.reason);
		for (const error of errors) console.error(`agent-manager shutdown: ${error.message}`);
	});
}
