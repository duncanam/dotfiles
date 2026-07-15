/**
 * agent-manager — child session layer (standalone, no Cursor dependency).
 *
 * Spawns lead and worker AgentSessions (in-process, in-memory) with curated
 * tools + extensions, tracks per-agent status and a log ring buffer that the
 * UI renders into widgets.
 */
import { realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
	createAgentSession,
	createBashToolDefinition,
	createLocalBashOperations,
	DefaultResourceLoader,
	defineTool,
	formatSize,
	getAgentDir,
	SessionManager,
	truncateHead,
	type AgentSession,
	type BashOperations,
	type ModelRegistry,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { AgentManagerConfig, TierModelConfig } from "./config.js";
import { resolveChildExtensionPaths } from "./config.js";

export type AgentStatus = "idle" | "working" | "done" | "error" | "aborted" | "timed_out";

const MAX_LOG_LINES = 200;
const PER_AGENT_REPORT_MAX_BYTES = 24 * 1024;
const PER_AGENT_REPORT_MAX_LINES = 1_000;
const AGGREGATE_REPORT_MAX_BYTES = 50 * 1024;
const AGGREGATE_REPORT_MAX_LINES = 2_000;

export interface BoundedReport {
	content: string;
	truncated: boolean;
}

function boundReport(text: string, maxBytes: number, maxLines: number): BoundedReport {
	const result = truncateHead(text, {
		maxBytes: Math.max(1, maxBytes - 512),
		maxLines: Math.max(1, maxLines - 2),
	});
	if (!result.truncated) return { content: text, truncated: false };

	const notice = `\n\n[Output truncated: showing ${result.outputLines}/${result.totalLines} lines and ${formatSize(result.outputBytes)}/${formatSize(result.totalBytes)}. Full output is preserved in tool details.]`;
	const final = truncateHead(`${result.content}${notice}`, { maxBytes, maxLines });
	return { content: final.content, truncated: true };
}

export function boundAgentReport(text: string): BoundedReport {
	return boundReport(text, PER_AGENT_REPORT_MAX_BYTES, PER_AGENT_REPORT_MAX_LINES);
}

export function boundAggregateReport(text: string): BoundedReport {
	return boundReport(text, AGGREGATE_REPORT_MAX_BYTES, AGGREGATE_REPORT_MAX_LINES);
}

export function sanitizeAgentError(rawMessage: string): string {
	const urls: string[] = [];
	const withoutStack = rawMessage.replaceAll(/\n\s*at\s[^\n]+/g, "");
	const protectedUrls = withoutStack.replaceAll(/\bhttps?:\/\/[^\s)\]}'"`]+/g, (url) => {
		const token = `\uE000${urls.length}\uE001`;
		urls.push(url);
		return token;
	});
	const redacted = protectedUrls
		.replaceAll(/\bfile:\/\/\/[^\s)\]}'"`]+/g, "file://<path>")
		.replaceAll(/(?<![:/])\/[^\s)\]}'"`]+/g, "<path>");
	return redacted.replaceAll(/\uE000(\d+)\uE001/g, (_token, index: string) => urls[Number(index)] ?? "<url>");
}

type WorkerBashMode = "read" | "write";

interface WorkerBashPhaseCallbacks {
	onWaiting(): void;
	onExecuting(): void;
}

interface LockWaiter {
	mode: WorkerBashMode;
	resolve: (release: () => void) => void;
	reject: (error: Error) => void;
	signal?: AbortSignal;
	onAbort?: () => void;
}

class WorkspaceBashLock {
	private readers = 0;
	private writer = false;
	private queue: LockWaiter[] = [];

	wouldWait(mode: WorkerBashMode): boolean {
		if (mode === "write") return this.writer || this.readers > 0 || this.queue.length > 0;
		return this.writer || this.queue.some((waiter) => waiter.mode === "write");
	}

	acquire(mode: WorkerBashMode, signal?: AbortSignal): Promise<() => void> {
		if (signal?.aborted) return Promise.reject(new Error("aborted while waiting for worker bash lock"));
		return new Promise<() => void>((resolve, reject) => {
			const waiter: LockWaiter = { mode, resolve, reject, signal };
			waiter.onAbort = () => {
				const index = this.queue.indexOf(waiter);
				if (index < 0) return;
				this.queue.splice(index, 1);
				reject(new Error("aborted while waiting for worker bash lock"));
				this.drain();
			};
			signal?.addEventListener("abort", waiter.onAbort, { once: true });
			this.queue.push(waiter);
			this.drain();
		});
	}

	private grant(waiter: LockWaiter): void {
		if (waiter.onAbort) waiter.signal?.removeEventListener("abort", waiter.onAbort);
		if (waiter.mode === "write") this.writer = true;
		else this.readers += 1;
		let released = false;
		waiter.resolve(() => {
			if (released) return;
			released = true;
			if (waiter.mode === "write") this.writer = false;
			else this.readers = Math.max(0, this.readers - 1);
			this.drain();
		});
	}

	private drain(): void {
		if (this.writer || this.queue.length === 0) return;
		if (this.readers > 0) {
			while (this.queue[0]?.mode === "read") this.grant(this.queue.shift()!);
			return;
		}
		if (this.queue[0].mode === "write") {
			this.grant(this.queue.shift()!);
			return;
		}
		while (this.queue[0]?.mode === "read") this.grant(this.queue.shift()!);
	}
}

const workspaceBashLocks = new Map<string, WorkspaceBashLock>();

function workspaceBashLock(cwd: string): WorkspaceBashLock {
	const key = existingRealpath(cwd);
	let lock = workspaceBashLocks.get(key);
	if (!lock) {
		lock = new WorkspaceBashLock();
		workspaceBashLocks.set(key, lock);
	}
	return lock;
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function sandboxString(value: string): string {
	return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function existingRealpath(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return path;
	}
}

function workerSandboxProfile(cwd: string, mode: WorkerBashMode): string {
	const home = homedir();
	const workspace = existingRealpath(cwd);
	const writeRoots = [
		...(mode === "write" ? [workspace] : []),
		existingRealpath(tmpdir()),
		existingRealpath("/tmp"),
		existingRealpath(join(home, ".cache")),
		existingRealpath(join(home, ".npm")),
		existingRealpath(join(home, "Library", "Caches")),
	];
	const protectedWrites = [
		...(mode === "read" ? [workspace] : []),
		existingRealpath(join(cwd, ".git")),
		existingRealpath(join(cwd, "node_modules")),
	];
	const protectedReads = [
		join(home, ".ssh"),
		join(home, ".aws"),
		join(home, ".gnupg"),
		join(home, ".env"),
	];
	return [
		"(version 1)",
		"(deny default)",
		'(import "system.sb")',
		"(allow process*)",
		"(allow file-read*)",
		"(allow file-write-data (literal \"/dev/null\"))",
		"(allow sysctl-read)",
		"(allow mach-lookup)",
		"(allow network*)",
		...writeRoots.map((path) => `(allow file-write* (subpath "${sandboxString(path)}"))`),
		...protectedWrites.map((path) => `(deny file-write* (subpath "${sandboxString(path)}"))`),
		'(deny file-write* (regex #"/(\\.git|node_modules)(/|$)"))',
		...protectedReads.map((path) => `(deny file-read* (subpath "${sandboxString(path)}"))`),
	].join("\n");
}

function createWorkerBashOperations(
	cwd: string,
	mode: WorkerBashMode,
	phases: WorkerBashPhaseCallbacks,
): BashOperations {
	const local = createLocalBashOperations();
	const lock = workspaceBashLock(cwd);
	return {
		async exec(command, commandCwd, options) {
			if (process.platform !== "darwin") {
				throw new Error("worker bash is disabled: no supported workspace sandbox is available on this platform");
			}
			const sandboxedCommand = `/usr/bin/sandbox-exec -p ${shellQuote(workerSandboxProfile(cwd, mode))} -- /bin/sh -lc ${shellQuote(command)}`;
			const waiting = lock.wouldWait(mode);
			if (waiting) phases.onWaiting();
			const release = await lock.acquire(mode, options.signal);
			try {
				if (options.signal?.aborted) throw new Error("aborted while waiting for worker bash lock");
				phases.onExecuting();
				return await local.exec(sandboxedCommand, commandCwd, options);
			} finally {
				release();
			}
		},
	};
}

export class AgentHandle {
	readonly id: string;
	readonly kind: "lead" | "worker";
	readonly turnTimeoutSeconds: number;
	readonly modelResponseTimeoutSeconds: number;
	readonly defaultToolTimeoutSeconds: number | undefined;
	session!: AgentSession;
	status: AgentStatus = "idle";
	cost = 0;
	onChange: () => void = () => {};

	private log: string[] = [];
	private partial = "";
	private chain: Promise<unknown> = Promise.resolve();
	private disposed = false;
	private startedAt = 0;
	private lastElapsedMs = 0;
	private phase: "idle" | "model" | "tool_wait" | "tool" = "idle";
	private phaseStartedAt = 0;
	private activeToolCount = 0;
	private activeToolNames = new Set<string>();
	private currentToolTimeoutSeconds: number | undefined;
	private timeoutReason: string | undefined;
	private turnTimer: ReturnType<typeof setTimeout> | undefined;
	private modelTimer: ReturnType<typeof setTimeout> | undefined;
	private toolTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(options: {
		id: string;
		kind: "lead" | "worker";
		turnTimeoutSeconds: number;
		modelResponseTimeoutSeconds: number;
		defaultToolTimeoutSeconds?: number;
	}) {
		this.id = options.id;
		this.kind = options.kind;
		this.turnTimeoutSeconds = options.turnTimeoutSeconds;
		this.modelResponseTimeoutSeconds = options.modelResponseTimeoutSeconds;
		this.defaultToolTimeoutSeconds = options.defaultToolTimeoutSeconds;
	}

	tail(count: number): string[] {
		const all = this.partial ? [...this.log, this.partial] : this.log;
		return all.slice(-count);
	}

	latest(): string {
		return this.partial || this.log[this.log.length - 1] || "";
	}

	push(line: string): void {
		this.flushPartial();
		this.log.push(line);
		if (this.log.length > MAX_LOG_LINES) this.log.splice(0, this.log.length - MAX_LOG_LINES);
		this.onChange();
	}

	appendText(delta: string): void {
		// Cap the partial buffer at 10KB to prevent OOM on long no-newline streams.
		if (this.partial.length > 10_000) {
			this.flushPartial();
		}
		this.partial += delta;
		const parts = this.partial.split("\n");
		this.partial = parts.pop() ?? "";
		for (const part of parts) {
			if (part.trim().length > 0) {
				this.log.push(part);
				if (this.log.length > MAX_LOG_LINES) this.log.splice(0, this.log.length - MAX_LOG_LINES);
			}
		}
		this.onChange();
	}

	private flushPartial(): void {
		if (this.partial.trim().length > 0) this.log.push(this.partial);
		this.partial = "";
	}

	setStatus(status: AgentStatus): void {
		const now = Date.now();
		if (status === "working") {
			this.startedAt = now;
			this.lastElapsedMs = 0;
		} else if (this.status === "working" && this.startedAt > 0) {
			this.lastElapsedMs = now - this.startedAt;
			this.startedAt = 0;
		}
		this.status = status;
		this.onChange();
	}

	timing(): {
		phase: "idle" | "model" | "tool_wait" | "tool";
		turnElapsedSeconds: number;
		phaseElapsedSeconds: number;
		phaseTimeoutSeconds: number | undefined;
	} {
		const now = Date.now();
		return {
			phase: this.phase,
			turnElapsedSeconds: Math.floor((this.startedAt > 0 ? now - this.startedAt : this.lastElapsedMs) / 1000),
			phaseElapsedSeconds: this.phaseStartedAt > 0 ? Math.floor((now - this.phaseStartedAt) / 1000) : 0,
			phaseTimeoutSeconds:
				this.phase === "model"
					? this.modelResponseTimeoutSeconds
					: this.phase === "tool" || this.phase === "tool_wait"
						? this.currentToolTimeoutSeconds
						: undefined,
		};
	}

	toolStarted(toolName: string): void {
		if (this.status !== "working") return;
		this.activeToolCount += 1;
		this.activeToolNames.add(toolName);
		if (this.activeToolCount === 1) {
			this.clearModelTimer();
			this.phase = "tool";
			this.phaseStartedAt = Date.now();
			this.armToolTimer();
		}
	}

	toolWaiting(toolName: string): void {
		if (this.status !== "working" || !this.activeToolNames.has(toolName)) return;
		this.phase = "tool_wait";
		this.onChange();
	}

	toolExecuting(toolName: string): void {
		if (this.status !== "working" || !this.activeToolNames.has(toolName)) return;
		this.phase = "tool";
		this.onChange();
	}

	toolEnded(toolName: string): void {
		if (this.status !== "working") return;
		this.activeToolNames.delete(toolName);
		this.activeToolCount = Math.max(0, this.activeToolCount - 1);
		if (this.activeToolCount === 0) {
			this.clearToolTimer();
			this.phase = "model";
			this.phaseStartedAt = Date.now();
			this.armModelTimer();
			this.push("… model response");
		}
	}

	private clearModelTimer(): void {
		if (this.modelTimer) clearTimeout(this.modelTimer);
		this.modelTimer = undefined;
	}

	private clearToolTimer(): void {
		if (this.toolTimer) clearTimeout(this.toolTimer);
		this.toolTimer = undefined;
	}

	private clearWatchdogs(): void {
		if (this.turnTimer) clearTimeout(this.turnTimer);
		this.turnTimer = undefined;
		this.clearModelTimer();
		this.clearToolTimer();
	}

	private triggerTimeout(reason: string): void {
		if (this.status !== "working" || this.timeoutReason || !this.session) return;
		this.timeoutReason = reason;
		this.push(`◷ timeout: ${reason}`);
		this.setStatus("timed_out");
		this.clearWatchdogs();
		void this.session.abort().catch(() => {});
	}

	private armModelTimer(): void {
		this.clearModelTimer();
		this.modelTimer = setTimeout(
			() => this.triggerTimeout(`model phase exceeded ${this.modelResponseTimeoutSeconds}s`),
			this.modelResponseTimeoutSeconds * 1000,
		);
	}

	private armToolTimer(): void {
		this.clearToolTimer();
		if (this.currentToolTimeoutSeconds === undefined) return;
		this.toolTimer = setTimeout(() => {
			const tools = [...this.activeToolNames].join(", ") || "unknown";
			this.triggerTimeout(`tool phase (${tools}) exceeded ${this.currentToolTimeoutSeconds}s`);
		}, this.currentToolTimeoutSeconds * 1000);
	}

	private startWatchdogs(): void {
		this.timeoutReason = undefined;
		this.activeToolCount = 0;
		this.activeToolNames.clear();
		this.phase = "model";
		this.phaseStartedAt = Date.now();
		this.turnTimer = setTimeout(
			() => this.triggerTimeout(`assignment exceeded ${this.turnTimeoutSeconds}s`),
			this.turnTimeoutSeconds * 1000,
		);
		this.armModelTimer();
	}

	private stopWatchdogs(): void {
		this.clearWatchdogs();
		this.activeToolCount = 0;
		this.activeToolNames.clear();
		this.currentToolTimeoutSeconds = undefined;
		this.phase = "idle";
		this.phaseStartedAt = 0;
	}

	run(task: string, signal?: AbortSignal, toolTimeoutSeconds = this.defaultToolTimeoutSeconds): Promise<string> {
		const result = this.chain.then(async (): Promise<string> => {
			if (this.disposed) return `CANCELLED (${this.id}): agent was disposed`;
			if (signal?.aborted) {
				this.setStatus("aborted");
				return `CANCELLED (${this.id}): parent operation was aborted`;
			}

			this.currentToolTimeoutSeconds =
				toolTimeoutSeconds === undefined
					? undefined
					: Math.max(1, Math.min(toolTimeoutSeconds, this.turnTimeoutSeconds));
			this.setStatus("working");
			this.push(`▶ task: ${task.slice(0, 120)}`);
			this.push("… model response");
			this.startWatchdogs();
			const abortChild = () => {
				if (this.status === "working") this.setStatus("aborted");
				this.clearWatchdogs();
				void this.session.abort().catch(() => {});
			};
			signal?.addEventListener("abort", abortChild, { once: true });
			try {
				await this.session.prompt(task);
				if (this.timeoutReason) return `TIMEOUT (${this.id}): ${this.timeoutReason}`;
				if (signal?.aborted) {
					this.setStatus("aborted");
					return `CANCELLED (${this.id}): parent operation was aborted`;
				}
				this.setStatus("done");
				return lastAssistantText(this.session);
			} catch (error) {
				if (this.timeoutReason) return `TIMEOUT (${this.id}): ${this.timeoutReason}`;
				if (signal?.aborted) {
					this.setStatus("aborted");
					return `CANCELLED (${this.id}): parent operation was aborted`;
				}
				this.setStatus("error");
				const rawMessage = error instanceof Error ? error.message : String(error);
				const message = sanitizeAgentError(rawMessage);
				this.push(`✗ ${message}`);
				return `ERROR (${this.id}): ${message}`;
			} finally {
				this.stopWatchdogs();
				signal?.removeEventListener("abort", abortChild);
			}
		});
		this.chain = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		this.clearWatchdogs();
		try {
			await this.session.abort();
		} catch {
			// The session may already be idle.
		}
		this.session.dispose();
	}
}

export function lastAssistantText(session: AgentSession): string {
	for (let index = session.messages.length - 1; index >= 0; index -= 1) {
		const message = session.messages[index] as { role?: string; content?: unknown };
		if (message.role !== "assistant") continue;
		if (typeof message.content === "string") return message.content;
		if (Array.isArray(message.content)) {
			const text = message.content
				.filter((block: { type?: string }) => block.type === "text")
				.map((block: { text?: string }) => block.text ?? "")
				.join("\n")
				.trim();
			if (text) return text;
		}
	}
	return "(no output)";
}

function wire(handle: AgentHandle, session: AgentSession): void {
	handle.session = session;
	session.subscribe((event) => {
		switch (event.type) {
			case "message_end": {
				const message = event.message as { role?: string; usage?: { cost?: { total?: number } } };
				if (message.role === "assistant" && message.usage?.cost?.total) {
					handle.cost += message.usage.cost.total;
					handle.onChange();
				}
				break;
			}
			case "message_update": {
				const deltaEvent = event.assistantMessageEvent as Record<string, unknown>;
				if (deltaEvent.type === "text_delta" || deltaEvent.type === "thinking_delta") {
					handle.appendText((deltaEvent.delta as string) ?? "");
				}
				break;
			}
			case "tool_execution_start":
				handle.toolStarted(event.toolName);
				handle.push(`→ ${event.toolName}`);
				break;
			case "tool_execution_end":
				handle.push(`${event.isError ? "✗" : "✓"} ${event.toolName}`);
				handle.toolEnded(event.toolName);
				break;
		}
	});
}

const LEAD_ROLE = (
	id: string,
	workerCount: number,
	turnTimeout: number,
	modelTimeout: number,
	defaultWorkerToolTimeout: number,
	maxWorkerToolTimeout: number,
) => `
## Role: ${id} (lead agent)

You are a LEAD agent in a manager→lead→worker tree, coordinating ${workerCount} worker agents.
- Decompose each manager task into independent, self-contained subtasks and fan them out with run_workers.
- Every worker task must include paths, goal, constraints, and completion criteria.
- Worker tools default to ${defaultWorkerToolTimeout}s. Set toolTimeoutSeconds only when a task justifiably needs longer, up to ${maxWorkerToolTimeout}s.
- You have read-only Pi tools; workers perform all edits. Verify reports against files where practical.
- Each model phase has a ${modelTimeout}s watchdog and the complete assignment has a ${turnTimeout}s watchdog.
- Your final message is a concise report to the manager: work done, files touched, verification, risks, and unresolved items.`;

const workerBashSchema = Type.Object({
	command: Type.String({ description: "Bash command to execute" }),
	mode: Type.Union([Type.Literal("read"), Type.Literal("write")], {
		description: "Use read for commands that must not modify the workspace; use write when workspace mutation is required",
	}),
	timeout: Type.Optional(Type.Number({ description: "Timeout in seconds" })),
});

function createWorkerBashToolDefinition(
	cwd: string,
	handle: AgentHandle,
): ToolDefinition {
	const phases = {
		onWaiting: () => handle.toolWaiting("bash"),
		onExecuting: () => handle.toolExecuting("bash"),
	};
	const readDefinition = createBashToolDefinition(cwd, {
		operations: createWorkerBashOperations(cwd, "read", phases),
	});
	const writeDefinition = createBashToolDefinition(cwd, {
		operations: createWorkerBashOperations(cwd, "write", phases),
	});
	return {
		...writeDefinition,
		description: `${writeDefinition.description}\nThe mode field is required: read commands run concurrently in a workspace-write-denied sandbox; write commands receive exclusive workspace access.`,
		parameters: workerBashSchema,
		execute: (toolCallId, { mode, ...input }, signal, onUpdate, context) => {
			if (mode !== "read" && mode !== "write") throw new Error('bash mode must be "read" or "write"');
			return (mode === "read" ? readDefinition : writeDefinition).execute(
				toolCallId,
				input as { command: string; timeout?: number },
				signal,
				onUpdate,
				context,
			);
		},
	} as ToolDefinition;
}

const WORKER_ROLE = (
	id: string,
	turnTimeout: number,
	modelTimeout: number,
	defaultToolTimeout: number,
	maxToolTimeout: number,
) => `
## Role: ${id} (worker agent)

You are a WORKER agent. Complete each self-contained task end-to-end and verify your work.
- Stay strictly within the assigned scope.
- Each model phase has a ${modelTimeout}s watchdog and the complete task has a ${turnTimeout}s watchdog.
- Each tool defaults to ${defaultToolTimeout}s; the lead may raise that task's tool limit to at most ${maxToolTimeout}s.
- Bash requires mode: "read" or mode: "write". Read mode runs in parallel and cannot write the workspace; use write mode only when workspace mutation is required.
- If blocked, stop and report the blocker.
- Your final message briefly reports work, changed files, verification, and remaining issues.`;

async function makeChildLoader(options: {
	cwd: string;
	agentId: string;
	agentTier: "lead" | "worker";
	rolePrompt: string;
	extensionPaths: string[];
	bashTimeoutSeconds: number;
	sandboxWorkerBash?: boolean;
	workerHandle?: AgentHandle;
	extraTools?: ToolDefinition[];
}): Promise<DefaultResourceLoader> {
	const loader = new DefaultResourceLoader({
		cwd: options.cwd,
		agentDir: getAgentDir(),
		noExtensions: true,
		additionalExtensionPaths: options.extensionPaths,
		extensionFactories: [
			{
				name: `agent-manager-child:${options.cwd}`,
				factory: (childPi) => {
					if (options.sandboxWorkerBash) {
						if (!options.workerHandle) throw new Error("sandboxed worker bash requires a worker handle");
						childPi.registerTool(createWorkerBashToolDefinition(options.cwd, options.workerHandle));
					}
					for (const tool of options.extraTools ?? []) childPi.registerTool(tool);
					childPi.on("before_provider_headers", (event) => {
						event.headers["x-agent-manager-agent-id"] = options.agentId;
						event.headers["x-agent-manager-tier"] = options.agentTier;
					});
					childPi.on("tool_call", (event) => {
						if (event.toolName !== "bash" || !event.input || typeof event.input !== "object") return;
						const input = event.input as { timeout?: number };
						if (input.timeout === undefined || input.timeout > options.bashTimeoutSeconds) {
							input.timeout = options.bashTimeoutSeconds;
						}
					});
				},
			},
		],
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
		appendSystemPrompt: [options.rolePrompt],
	});
	await loader.reload();
	const extensionErrors = loader.getExtensions().errors;
	if (extensionErrors.length > 0) {
		throw new Error(
			`child extension load failed: ${extensionErrors.map(({ path, error }) => `${path}: ${error}`).join("; ")}`,
		);
	}
	return loader;
}

export interface Swarm {
	leads: AgentHandle[];
	workers: AgentHandle[][];
	disposeAll(): Promise<void>;
}

function assertActiveTools(session: AgentSession, tier: string, expectedTools: string[]): void {
	const expected = [...new Set(expectedTools)];
	const actual = session.getActiveToolNames();
	const expectedSet = new Set(expected);
	if (
		actual.length !== expectedSet.size ||
		actual.some((name) => !expectedSet.has(name)) ||
		expected.some((name) => !actual.includes(name))
	) {
		throw new Error(
			`agent-manager: ${tier} tool setup mismatch (expected: ${expected.join(", ")}; actual: ${actual.join(", ")})`,
		);
	}
}

function findModel(registry: ModelRegistry, tier: string, config: TierModelConfig) {
	const model = registry.find(config.provider, config.model);
	if (!model) {
		throw new Error(
			`agent-manager: ${tier} model ${config.provider}/${config.model} not found (check pi --list-models)`,
		);
	}
	if (!registry.hasConfiguredAuth(model)) {
		throw new Error(
			`agent-manager: ${tier} model ${config.provider}/${config.model} has no configured authentication`,
		);
	}
	return model;
}

export async function spawnSwarm(
	cwd: string,
	config: AgentManagerConfig,
	onChange: () => void,
	modelRegistry: ModelRegistry,
): Promise<Swarm> {
	const authStorage = modelRegistry.authStorage;
	const leadModel = findModel(modelRegistry, "lead", config.lead);
	const workerModel = findModel(modelRegistry, "worker", config.worker);
	const extensionPaths = resolveChildExtensionPaths(config.childExtensions);

	const leads: AgentHandle[] = [];
	const workers: AgentHandle[][] = [];
	const spawned: AgentHandle[] = [];
	const disposeAll = async () => {
		await Promise.allSettled(spawned.map((handle) => handle.dispose()));
	};

	try {
		for (let leadIndex = 0; leadIndex < config.leads; leadIndex += 1) {
			const leadId = `lead${leadIndex + 1}`;
			const group: AgentHandle[] = [];
			for (let workerIndex = 0; workerIndex < config.workersPerLead; workerIndex += 1) {
				const workerId = `${leadId}.worker${workerIndex + 1}`;
				const worker = new AgentHandle({
					id: workerId,
					kind: "worker",
					turnTimeoutSeconds: config.workerTurnTimeoutSeconds,
					modelResponseTimeoutSeconds: config.modelResponseTimeoutSeconds,
					defaultToolTimeoutSeconds: config.workerToolTimeoutSeconds,
				});
				worker.onChange = onChange;
				const { session } = await createAgentSession({
					cwd,
					model: workerModel,
					thinkingLevel: config.worker.thinkingLevel,
					tools: config.workerTools,
					resourceLoader: await makeChildLoader({
						cwd,
						agentId: worker.id,
						agentTier: "worker",
						rolePrompt: WORKER_ROLE(
							worker.id,
							config.workerTurnTimeoutSeconds,
							config.modelResponseTimeoutSeconds,
							config.workerToolTimeoutSeconds,
							config.workerToolTimeoutMaxSeconds,
						),
						extensionPaths,
						bashTimeoutSeconds: config.workerBashTimeoutSeconds,
						sandboxWorkerBash: true,
						workerHandle: worker,
					}),
					sessionManager: SessionManager.inMemory(cwd),
					authStorage,
					modelRegistry,
				});
				wire(worker, session);
				spawned.push(worker);
				assertActiveTools(session, worker.id, config.workerTools);
				group.push(worker);
			}

			const workerTaskSchema = Type.Union([
				Type.String({ description: "Self-contained subtask using the default tool timeout" }),
				Type.Object({
					task: Type.String({ description: "Self-contained subtask" }),
					toolTimeoutSeconds: Type.Optional(
						Type.Integer({
							description: `Per-tool timeout for this task; default ${config.workerToolTimeoutSeconds}s, maximum ${config.workerToolTimeoutMaxSeconds}s`,
							minimum: 1,
							maximum: config.workerToolTimeoutMaxSeconds,
						}),
					),
				}),
			]);
			const runWorkers = defineTool({
				name: "run_workers",
				label: "Run Workers",
				description: `Fan out 1-${config.workersPerLead} independent, self-contained subtasks concurrently. Tools default to ${config.workerToolTimeoutSeconds}s; raise toolTimeoutSeconds only for justified long operations, up to ${config.workerToolTimeoutMaxSeconds}s.`,
				parameters: Type.Object({
					tasks: Type.Array(workerTaskSchema, {
						minItems: 1,
						maxItems: config.workersPerLead,
					}),
				}),
				execute: async (_id, params, signal, onUpdate) => {
					onUpdate?.({
						content: [{ type: "text", text: `Running ${params.tasks.length} worker task(s)…` }],
						details: {},
					});
					const reports = await Promise.all(
						params.tasks.map(async (taskSpec, index) => {
							const worker = group[index % group.length];
							const task = typeof taskSpec === "string" ? taskSpec : taskSpec.task;
							const toolTimeoutSeconds =
								typeof taskSpec === "string" || taskSpec.toolTimeoutSeconds === undefined
									? config.workerToolTimeoutSeconds
									: Math.min(taskSpec.toolTimeoutSeconds, config.workerToolTimeoutMaxSeconds);
							// Do not replay failed or timed-out work automatically: it may
							// already have performed partial mutations. The lead decides how
							// to recover after inspecting this worker's attributed report.
							const report = await worker.run(task, signal, toolTimeoutSeconds);
							const fullText = `### ${worker.id}\n${report}`;
							return {
								workerId: worker.id,
								task,
								toolTimeoutSeconds,
								report,
								bounded: boundAgentReport(fullText),
							};
						}),
					);
					const aggregate = boundAggregateReport(reports.map(({ bounded }) => bounded.content).join("\n\n"));
					return {
						content: [{ type: "text", text: aggregate.content }],
						details: {
							reports: reports.map(({ workerId, task, toolTimeoutSeconds, report, bounded }) => ({
								workerId,
								task,
								toolTimeoutSeconds,
								report,
								truncated: bounded.truncated,
							})),
							aggregateTruncated: aggregate.truncated,
						},
					};
				},
			});

			const lead = new AgentHandle({
				id: leadId,
				kind: "lead",
				turnTimeoutSeconds: config.leadTurnTimeoutSeconds,
				modelResponseTimeoutSeconds: config.modelResponseTimeoutSeconds,
			});
			lead.onChange = onChange;
			const { session } = await createAgentSession({
				cwd,
				model: leadModel,
				thinkingLevel: config.lead.thinkingLevel,
				tools: [...config.leadTools, "run_workers"],
				resourceLoader: await makeChildLoader({
					cwd,
					agentId: lead.id,
					agentTier: "lead",
					rolePrompt: LEAD_ROLE(
						leadId,
						config.workersPerLead,
						config.leadTurnTimeoutSeconds,
						config.modelResponseTimeoutSeconds,
						config.workerToolTimeoutSeconds,
						config.workerToolTimeoutMaxSeconds,
					),
					extensionPaths,
					bashTimeoutSeconds: config.workerBashTimeoutSeconds,
					extraTools: [runWorkers],
				}),
				sessionManager: SessionManager.inMemory(cwd),
				authStorage,
				modelRegistry,
			});
			wire(lead, session);
			spawned.push(lead);
			assertActiveTools(session, lead.id, [...config.leadTools, "run_workers"]);
			leads.push(lead);
			workers.push(group);
		}
	} catch (error) {
		await disposeAll();
		throw error;
	}

	return { leads, workers, disposeAll };
}
