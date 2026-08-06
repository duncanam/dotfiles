/**
 * Todo Extension — autonomous TODO.md progress.
 *
 * The TODO.md file is the single source of truth. The LLM edits it directly
 * with `edit`/`write`; this extension only:
 *
 *   - injects a tiny current-item reminder at the TAIL of each LLM call's
 *     context (cache-safe: append-only, never persisted, rebuilt from the
 *     file each turn), and
 *   - after the agent settles, waits a short grace period; if nothing else
 *     engages the agent, sends one fuller next-item snapshot to start the
 *     next unattended cycle until every item is done, then auto-disables.
 *
 * Commands:
 *   /todo-enable [path] [--idle 30s]  enable for this Pi session
 *                                     (no args → cwd/TODO.md where pi opened)
 *   /todo-disable                     disable
 *   /todo                             show status
 *
 * Configuration is session-local: automation always starts disabled, with
 * cwd/TODO.md and a 30-second grace period. No settings file is created.
 *
 * Format: `- [ ]` / `- [x]` (case-insensitive). Indented lines under an item
 * are treated as context/sub-bullets for that item.
 */

import { type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TodoConfig {
	enabled: boolean;
	/** Absolute path to the TODO file. */
	path: string;
	/** Grace period after settle before auto-continuing. */
	idleMs: number;
}

interface TodoItem {
	index: number;
	indent: number;
	done: boolean;
	text: string;
	/** Indented lines following this checkbox (notes / sub-bullets). */
	body: string[];
}

interface ParsedTodo {
	items: TodoItem[];
	topItems: TodoItem[];
	/** Completed top-level work items, including their checkbox descendants. */
	done: number;
	total: number;
	minIndent: number;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const CHECKBOX = /^(\s*)[-*+]\s+\[( |x|X)\]\s+(.*)$/;

function indentWidth(s: string): number {
	return s.replace(/\t/g, "  ").length;
}

function parseTodo(text: string): ParsedTodo {
	const lines = text.split(/\r?\n/);
	const items: TodoItem[] = [];
	let current: TodoItem | null = null;

	const close = () => {
		if (current) {
			items.push(current);
			current = null;
		}
	};

	for (const line of lines) {
		const m = line.match(CHECKBOX);
		if (m) {
			close();
			current = {
				index: 0,
				indent: indentWidth(m[1]),
				done: m[2].toLowerCase() === "x",
				text: m[3].trim(),
				body: [],
			};
			continue;
		}
		if (current && /^\s+\S/.test(line)) {
			current.body.push(line);
		} else if (current) {
			// blank line or a non-indented line: end this item's block
			close();
		}
	}
	close();

	items.forEach((it, i) => (it.index = i));

	const minIndent = items.length ? Math.min(...items.map((i) => i.indent)) : 0;
	const topItems = items.filter((i) => i.indent === minIndent);
	const done = topItems.filter((item) => isCompleteWithDescendants(items, item)).length;
	return { items, topItems, done, total: topItems.length, minIndent };
}

/** A checked parent is not complete while any checkbox in its subtree remains open. */
function isCompleteWithDescendants(items: TodoItem[], item: TodoItem): boolean {
	if (!item.done) return false;
	for (let i = item.index + 1; i < items.length; i++) {
		const candidate = items[i];
		if (candidate.indent <= item.indent) break;
		if (!candidate.done) return false;
	}
	return true;
}

function descendantsOf(items: TodoItem[], item: TodoItem): TodoItem[] {
	const descendants: TodoItem[] = [];
	for (let i = item.index + 1; i < items.length; i++) {
		const candidate = items[i];
		if (candidate.indent <= item.indent) break;
		descendants.push(candidate);
	}
	return descendants;
}

function findNextUnchecked(
	items: TodoItem[],
): { item: TodoItem; parent?: TodoItem } | undefined {
	const idx = items.findIndex((i) => !i.done);
	if (idx === -1) return undefined;
	const item = items[idx];
	let parent: TodoItem | undefined;
	for (let j = idx - 1; j >= 0; j--) {
		if (items[j].indent < item.indent) {
			parent = items[j];
			break;
		}
	}
	return { item, parent };
}

function remainingCount(parsed: ParsedTodo): number {
	return parsed.items.filter((i) => !i.done).length;
}

const MAX_CYCLE_SNAPSHOT_CHARS = 12_000;

// Detailed snapshot, sent once when the timer starts a new unattended cycle.
function buildCyclePrompt(parsed: ParsedTodo, disp: string): string | null {
	const next = findNextUnchecked(parsed.items);
	if (!next) return null;

	const lines = [
		"[AUTOMATED TODO CYCLE — EXTENSION-SCHEDULED TASK]",
		`[TODO ${parsed.done}/${parsed.total} top-level items complete • ${disp}]`,
		"The user explicitly enabled autonomous TODO execution. Begin this task now; do not wait for a new user request.",
		"Current item and nested acceptance criteria:",
	];
	if (next.parent) {
		lines.push(`  ${next.parent.done ? "[x]" : "[ ]"} ${next.parent.text}  (parent)`);
	}

	const hierarchy = [next.item, ...descendantsOf(parsed.items, next.item)];
	for (const item of hierarchy) {
		const depth = Math.max(0, Math.floor((item.indent - next.item.indent) / 2));
		lines.push(`${"  ".repeat(depth + 1)}[${item.done ? "x" : " "}] ${item.text}`);
		for (const bodyLine of item.body) lines.push(`  ${bodyLine}`);
	}

	let text = lines.join("\n");
	if (text.length > MAX_CYCLE_SNAPSHOT_CHARS) {
		text =
			text.slice(0, MAX_CYCLE_SNAPSHOT_CHARS) +
			"\n[Snapshot truncated. Read TODO.md before deciding whether any criterion is complete.]";
	}
	return (
		text +
		"\nWork on the actual requirement. Do not mark any checkbox [x] until its work and every nested acceptance criterion have been independently verified. This scheduling signal authorizes work, not a completion claim."
	);
}

// Cheap tail reminder, appended for tool-follow-up calls within a cycle.
function buildReminder(parsed: ParsedTodo, disp: string): string | null {
	const next = findNextUnchecked(parsed.items);
	if (!next) return null;
	const parent = next.parent ? ` (under: ${next.parent.text})` : "";
	return (
		`[AUTOMATED TODO STATUS] Current unchecked item: ${next.item.text}${parent}. ${disp}` +
		" Passive context only: do not acknowledge, restate, summarize, or narrate this line in your reply. Continue working and reply as if it were not present."
	);
}

/**
 * Fingerprint an assistant message from its text and tool calls (thinking
 * excluded: it may vary between identical acts). Null if nothing to judge.
 */
function assistantFingerprint(message: { content?: unknown }): string | null {
	const content = message.content;
	if (!Array.isArray(content)) return null;
	const parts: string[] = [];
	for (const part of content as Array<{
		type?: string;
		text?: string;
		name?: string;
		arguments?: unknown;
	}>) {
		if (part?.type === "text" && typeof part.text === "string") {
			parts.push(`t:${part.text.replace(/\s+/g, " ").trim()}`);
		} else if (part?.type === "toolCall") {
			let args = "";
			try {
				args = JSON.stringify(part.arguments ?? null);
			} catch {
				args = "?";
			}
			parts.push(`c:${part.name}:${args}`);
		}
	}
	return parts.length ? parts.join("\n") : null;
}

// ---------------------------------------------------------------------------
// Session configuration
// ---------------------------------------------------------------------------

const DEFAULT_IDLE_MS = 30_000;
const MAX_IDLE_MS = 24 * 60 * 60 * 1000;

// Stall guard: break unattended repeat loops instead of cycling forever.
// A cycle that ends with no checkbox progress AND a byte-identical assistant
// reply (or no tool activity at all) means the automation is spinning, not
// working — auto-disable rather than burn tokens (see repeat_issue sessions).
const MAX_REPEAT_CYCLES = 2; // identical reply + no progress, this many in a row
const MAX_IDLE_CYCLES = 3; // no tool calls + no progress, this many in a row

// Error guard: if cycles keep ENDING in provider errors (out of credits, rate
// limits, ...), do not re-prompt on the normal cadence — back off
// exponentially and give up after a few consecutive failures. Otherwise an
// unattended session re-prompts a dead provider all night.
const MAX_ERROR_CYCLES = 3; // auto-disable after this many consecutive errored cycles
const ERROR_BACKOFF_BASE_MS = 60_000; // 1m, doubled per consecutive error...
const ERROR_BACKOFF_MAX_MS = 30 * 60_000; // ...capped at 30m

function defaultConfig(cwd: string): TodoConfig {
	return { enabled: false, path: join(cwd, "TODO.md"), idleMs: DEFAULT_IDLE_MS };
}

function parseDuration(s: string | undefined, fallbackMs: number): number {
	if (!s) return fallbackMs;
	const m = s.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/i);
	if (!m) return fallbackMs;
	const n = parseFloat(m[1]);
	const unit = (m[2] ?? "ms").toLowerCase();
	const mult = unit === "ms" ? 1 : unit === "s" ? 1000 : unit === "m" ? 60_000 : 3_600_000;
	const milliseconds = n * mult;
	if (!Number.isFinite(milliseconds)) return fallbackMs;
	return Math.min(MAX_IDLE_MS, Math.max(1000, Math.round(milliseconds)));
}

function displayPath(cwd: string, abs: string): string {
	const rel = relative(cwd, abs);
	if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return rel;
	return abs;
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
	// All state is local to this factory invocation, so session switches /
	// reloads get fresh bookkeeping (no leaked timers across runtimes).
	let cfg: TodoConfig | null = null;
	let cwdRef = "";
	let active = false;
	let graceTimer: NodeJS.Timeout | null = null;
	let graceDeadline: number | null = null;
	let tickInterval: NodeJS.Timeout | null = null;
	let cache: { path: string; mtimeMs: number; parsed: ParsedTodo } | null = null;
	let lastParsed: ParsedTodo | null = null;

	// ---- stall-guard state --------------------------------------------------
	let lastAssistantFp: string | null = null;
	let lastTurnHadToolCalls = false;
	let lastProgressSig: string | null = null;
	let prevCycleKey: string | null = null;
	let repeatStreak = 0;
	let idleStreak = 0;
	let errorStreak = 0;
	let lastErrorMessage: string | null = null;

	function resetStallState(): void {
		lastAssistantFp = null;
		lastTurnHadToolCalls = false;
		lastProgressSig = null;
		prevCycleKey = null;
		repeatStreak = 0;
		idleStreak = 0;
		errorStreak = 0;
		lastErrorMessage = null;
	}

	// ---- helpers -----------------------------------------------------------

	function clearGrace(): void {
		if (graceTimer) {
			clearTimeout(graceTimer);
			graceTimer = null;
		}
		if (tickInterval) {
			clearInterval(tickInterval);
			tickInterval = null;
		}
		graceDeadline = null;
	}

	function renderStatus(ctx: ExtensionContext, c: TodoConfig, remainingMs: number | null): void {
		if (!ctx.hasUI) return;
		const parts: string[] = [];
		if (lastParsed) parts.push(`[TODO ${lastParsed.done}/${lastParsed.total}]`);
		else parts.push(`[TODO]`);
		if (remainingMs != null) {
			const s = Math.max(0, Math.ceil(remainingMs / 1000));
			parts.push(`grace ${s}s`);
		}
		parts.push(displayPath(ctx.cwd, c.path));
		ctx.ui.setStatus("todo", parts.join(" "));
	}

	// Start (or restart) a grace countdown that starts a new unattended cycle.
	function startGrace(ctx: ExtensionContext, c: TodoConfig, delayMs: number): void {
		clearGrace();
		graceDeadline = Date.now() + delayMs;
		renderStatus(ctx, c, delayMs);
		tickInterval = setInterval(() => {
			if (graceDeadline == null) return;
			const remaining = Math.max(0, graceDeadline - Date.now());
			renderStatus(ctx, c, remaining);
		}, 1000);
		graceTimer = setTimeout(() => {
			// Stop the countdown immediately so the footer doesn't flicker
			// "grace 0s" after the fire. The new turn's agent_start (and the
			// following context handler) will refresh the status.
			clearGrace();
			if (!active || !cfg?.enabled) return;
			void queueContinuation(ctx);
		}, delayMs);
	}

	async function readTodo(absPath: string): Promise<ParsedTodo | null> {
		try {
			const st = await stat(absPath);
			if (cache && cache.path === absPath && cache.mtimeMs === st.mtimeMs) {
				lastParsed = cache.parsed;
				return cache.parsed;
			}
			const text = await readFile(absPath, "utf8");
			const parsed = parseTodo(text);
			cache = { path: absPath, mtimeMs: st.mtimeMs, parsed };
			lastParsed = parsed;
			return parsed;
		} catch {
			cache = null;
			return null;
		}
	}

	function updateStatus(ctx: ExtensionContext, c: TodoConfig, parsed: ParsedTodo): void {
		lastParsed = parsed;
		renderStatus(ctx, c, null);
	}

	async function queueContinuation(ctx: ExtensionContext): Promise<void> {
		const c = cfg;
		if (!active || !c?.enabled) return;
		const parsed = await readTodo(c.path);
		// The file read is async; do not send a stale continuation if the user
		// disabled/reconfigured todo while it was in flight.
		if (!active || cfg !== c || !c.enabled || !parsed) return;
		updateStatus(ctx, c, parsed);
		if (remainingCount(parsed) === 0) {
			await disableAutomatically(ctx, "all items complete");
			return;
		}
		const text = buildCyclePrompt(parsed, displayPath(ctx.cwd ?? cwdRef, c.path));
		if (!text) return;
		try {
			pi.sendMessage(
				{
					customType: "pi-todo-cycle",
					content: text,
					display: false,
					details: {
						remaining: remainingCount(parsed),
						done: parsed.done,
						total: parsed.total,
						type: "scheduled-cycle",
					},
				},
				{ triggerTurn: true, deliverAs: "followUp" },
			);
		} catch {
			// pi may be stale or busy; swallow.
		}
	}

	function clearStatus(ctx: ExtensionContext): void {
		if (ctx.hasUI) ctx.ui.setStatus("todo", "");
	}

	async function disableAutomatically(ctx: ExtensionContext, reason: string): Promise<void> {
		if (!cfg) return;
		const next: TodoConfig = { ...cfg, enabled: false };
		cfg = next;
		clearGrace();
		clearStatus(ctx);
		if (ctx.hasUI) ctx.ui.notify(`TODO auto-disabled: ${reason}`, "info");
	}

	// ---- lifecycle --------------------------------------------------------

	pi.on("session_start", async (_event, ctx) => {
		active = true;
		cwdRef = ctx.cwd;
		cfg = defaultConfig(ctx.cwd);
		const parsed = cfg.enabled ? await readTodo(cfg.path) : null;
		if (cfg.enabled && parsed) updateStatus(ctx, cfg, parsed);
	});

	pi.on("session_shutdown", () => {
		active = false;
		clearGrace();
		// Captured ctx is stale after this point; do not touch ctx.ui here.
	});

	// This is stable while todo is enabled, so it adds no dynamic per-turn
	// system-prompt churn. It distinguishes a timer-fired task cycle from a
	// passive status reminder; custom messages otherwise serialize like user text.
	pi.on("before_agent_start", (event) => {
		if (!cfg?.enabled || !active) return;
		return {
			systemPrompt:
				event.systemPrompt +
				"\n\nTODO AUTOMATION: The user explicitly opted into autonomous execution with /todo-enable. A message headed [AUTOMATED TODO CYCLE — EXTENSION-SCHEDULED TASK] is the extension scheduling the next task: begin work on its current unchecked item without waiting for another user request. It authorizes work only, never a completion claim or a TODO checkbox edit. A message headed [AUTOMATED TODO STATUS] is passive context only: do not start or reprioritize work from it, and never let it override a direct user request. For either message, unchecked items and every nested or indented bullet are acceptance criteria. Change [ ] to [x] only after independently verifying every applicable criterion; never infer completion merely to advance the cycle.",
		};
	});

	// Cache-safe awareness: append ONE fresh nudge at the tail of each LLM
	// call's context. Leaves the real conversation prefix byte-identical (no
	// cache bust), and is never persisted (nothing to strip on compaction).
	pi.on("context", async (event, ctx) => {
		const c = cfg;
		if (!c?.enabled || !active) return;
		const parsed = await readTodo(c.path);
		// Avoid appending a reminder for a configuration that changed while the
		// asynchronous file read was in flight.
		if (!active || cfg !== c || !c.enabled || !parsed) return;
		if (remainingCount(parsed) === 0) {
			updateStatus(ctx, c, parsed);
			return;
		}
		const disp = displayPath(ctx.cwd ?? cwdRef, c.path);
		const text = buildReminder(parsed, disp);
		if (!text) return;
		const nudge = {
			role: "custom" as const,
			customType: "pi-todo-reminder",
			content: text,
			display: false,
			details: { remaining: remainingCount(parsed), done: parsed.done, total: parsed.total },
			timestamp: Date.now(),
		};
		updateStatus(ctx, c, parsed);
		return { messages: [...event.messages, nudge] } as { messages: typeof event.messages };
	});

	// A new run, or any user input, cancels a pending auto-continue.
	pi.on("agent_start", () => clearGrace());
	pi.on("input", () => clearGrace());

	// Track the latest assistant turn so the stall guard can distinguish
	// "model did real work but hasn't checked a box yet" from "model is
	// spinning": repeating itself verbatim, or settling without any tool use.
	pi.on("turn_end", (event) => {
		const msg = event.message as
			| { role?: string; stopReason?: string; content?: unknown }
			| undefined;
		if (!msg || msg.role !== "assistant") return;
		if (msg.stopReason === "aborted") return; // user pressed Esc; not a signal
		if (msg.stopReason === "error") {
			// A mid-run error that pi auto-retries past is followed by a
			// successful turn (which resets this below), so only runs that
			// actually END on an error carry a non-zero streak into settle.
			errorStreak++;
			lastErrorMessage =
				typeof (msg as { errorMessage?: unknown }).errorMessage === "string"
					? ((msg as { errorMessage?: string }).errorMessage as string)
					: null;
			return;
		}
		errorStreak = 0;
		lastErrorMessage = null;
		lastAssistantFp = assistantFingerprint(msg);
		lastTurnHadToolCalls =
			Array.isArray(msg.content) &&
			(msg.content as Array<{ type?: string }>).some((p) => p?.type === "toolCall");
	});

	pi.on("agent_settled", async (_event, ctx) => {
		clearGrace();
		const c = cfg;
		if (!c?.enabled || !active) return;
		const parsed = await readTodo(c.path);
		if (!parsed) return;
		updateStatus(ctx, c, parsed);

		if (remainingCount(parsed) === 0) {
			// Nothing left: auto-disable promptly (no grace needed).
			await disableAutomatically(ctx, "all items complete");
			return;
		}

		// ---- error guard ----------------------------------------------------
		if (errorStreak > 0) {
			if (errorStreak >= MAX_ERROR_CYCLES) {
				const why = lastErrorMessage ? `: ${lastErrorMessage.slice(0, 120)}` : "";
				await disableAutomatically(
					ctx,
					`provider errors on ${errorStreak} consecutive cycles${why} — re-enable with /todo-enable`,
				);
				return;
			}
			const backoffMs = Math.min(
				ERROR_BACKOFF_MAX_MS,
				ERROR_BACKOFF_BASE_MS * 2 ** (errorStreak - 1),
			);
			if (ctx.hasUI) {
				ctx.ui.notify(
					`TODO cycle ended in a provider error (${errorStreak}/${MAX_ERROR_CYCLES} before auto-disable); retrying in ${Math.round(backoffMs / 1000)}s`,
					"warning",
				);
			}
			startGrace(ctx, c, backoffMs);
			return;
		}

		// ---- stall guard ----------------------------------------------------
		const next = findNextUnchecked(parsed.items);
		const progressSig = `${remainingCount(parsed)}|${parsed.done}|${next?.item.text ?? ""}`;
		const madeProgress = progressSig !== lastProgressSig;
		const cycleKey = `${progressSig}||${lastAssistantFp ?? ""}`;
		const repeatedCycle = !madeProgress && cycleKey === prevCycleKey;
		prevCycleKey = cycleKey;
		lastProgressSig = progressSig;

		if (madeProgress) {
			repeatStreak = 0;
			idleStreak = 0;
		} else {
			repeatStreak = repeatedCycle ? repeatStreak + 1 : 0;
			idleStreak = lastTurnHadToolCalls ? 0 : idleStreak + 1;
		}

		if (repeatStreak >= MAX_REPEAT_CYCLES) {
			await disableAutomatically(
				ctx,
				`repeat loop detected (${repeatStreak + 1} identical cycles with no TODO progress) — re-enable with /todo-enable`,
			);
			return;
		}
		if (idleStreak >= MAX_IDLE_CYCLES) {
			await disableAutomatically(
				ctx,
				`no TODO progress and no tool activity for ${idleStreak} cycles — re-enable with /todo-enable`,
			);
			return;
		}

		// Schedule an unattended continuation after the grace period, with a
		// live countdown shown in the footer status.
		startGrace(ctx, c, c.idleMs);
	});

	// ---- commands ---------------------------------------------------------

	pi.registerCommand("todo-enable", {
		description: "Enable autonomous TODO progress for this session: /todo-enable [path] [--idle 30s]",
		handler: async (args, ctx) => {
			const tokens = args.trim().split(/\s+/).filter(Boolean);
			let pathArg: string | undefined;
			let idleArg: string | undefined;
			for (let i = 0; i < tokens.length; i++) {
				const t = tokens[i];
				if (t === "--idle" && i + 1 < tokens.length) {
					idleArg = tokens[++i];
				} else if (t.startsWith("--idle=")) {
					idleArg = t.slice(7);
				} else if (t.startsWith("--")) {
					ctx.ui.notify(`Unknown flag: ${t}`, "warning");
					return;
				} else if (!pathArg) {
					pathArg = t;
				} else {
					ctx.ui.notify(`Unexpected argument: ${t}`, "warning");
					return;
				}
			}

			// No path arg → TODO.md in Pi's current working directory.
			const abs = resolve(ctx.cwd, pathArg ?? "TODO.md");
			const idleMs = parseDuration(idleArg, cfg?.idleMs ?? DEFAULT_IDLE_MS);
			const next: TodoConfig = { enabled: true, path: abs, idleMs };
			cfg = next;
			cwdRef = ctx.cwd;
			active = true;
			resetStallState();

			const parsed = await readTodo(abs);
			if (parsed) updateStatus(ctx, next, parsed);
			const disp = displayPath(ctx.cwd, next.path);
			const idleS = Math.round(idleMs / 1000);
			ctx.ui.notify(`TODO enabled: ${disp} (grace ${idleS}s)`, "info");

			// Prime: if there's work and the agent is idle, schedule a first
			// continuation so /todo-enable kicks things off on its own. Uses a
			// short capped delay; the countdown reflects this real delay.
			if (parsed && remainingCount(parsed) > 0 && ctx.isIdle()) {
				startGrace(ctx, next, Math.min(idleMs, 10_000));
			}
		},
	});

	pi.registerCommand("todo-disable", {
		description: "Disable autonomous TODO progress.",
		handler: async (_args, ctx) => {
			if (!cfg) {
				ctx.ui.notify("TODO not configured", "info");
				return;
			}
			const next: TodoConfig = { ...cfg, enabled: false };
			cfg = next;
			clearGrace();
			clearStatus(ctx);
			ctx.ui.notify("TODO disabled", "info");
		},
	});

	pi.registerCommand("todo", {
		description: "Show current TODO extension status.",
		handler: async (_args, ctx) => {
			const c = cfg;
			if (!c || !c.enabled) {
				ctx.ui.notify("TODO not enabled", "info");
				return;
			}
			const parsed = await readTodo(c.path);
			const disp = displayPath(ctx.cwd, c.path);
			if (!parsed) {
				ctx.ui.notify(`TODO enabled (${disp}) — file unreadable`, "warning");
				return;
			}
			const rem = remainingCount(parsed);
			ctx.ui.notify(
				`TODO ${parsed.done}/${parsed.total} done, ${rem} unchecked • ${disp} (grace ${Math.round(c.idleMs / 1000)}s)`,
				"info",
			);
		},
	});
}