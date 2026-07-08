/**
 * pi-loop — autonomous, unsupervised work loop for pi.
 *
 * Inspired by the "Ralph Wiggum" / Stop-hook re-injection loops people run with
 * Claude Code. You give it a GOAL and it keeps the agent working turn after turn,
 * fully unattended, until the goal is verifiably complete — never stopping to ask
 * questions.
 *
 * How it works:
 *   - `/loop <goal>` sends a kickoff prompt that puts the agent in autonomous mode.
 *   - After every agent turn (`agent_end`) the extension automatically re-injects a
 *     "continue" prompt, so the agent keeps going without human input.
 *   - The agent signals completion by calling the `loop_done` tool (or, permanently
 *     stuck, `loop_blocked`). Guardrails also stop the loop on max-iterations,
 *     a stall (identical output repeated), no tool activity, or a time budget.
 *   - Context is auto-compacted when it grows past a threshold so long runs don't
 *     exhaust the window.
 *
 * Commands:
 *   /loop [--max=N] [--minutes=N] [--compact=R] [--exit] <goal>
 *   /loop-stop      stop the active loop
 *
 * Flags:
 *   --max=N        hard cap on iterations (default 50)
 *   --minutes=N    wall-clock budget in minutes (default: none)
 *   --compact=R    compact when context usage >= R * contextWindow (0<R<1, default 0.75)
 *   --exit         shut pi down when the loop terminates (great for unattended runs)
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const DEFAULT_MAX_ITERATIONS = 50;
const DEFAULT_COMPACT_RATIO = 0.75;
const STALL_LIMIT = 3; // identical final messages in a row => stalled
const NO_TOOL_LIMIT = 4; // turns with zero tool activity in a row => no progress
const FALLBACK_CONTEXT_WINDOW = 200_000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type TerminalReason =
	| "done"
	| "blocked"
	| "stalled"
	| "no-progress"
	| "max-iterations"
	| "time-budget"
	| "manual";

interface ParsedArgs {
	goal: string;
	maxIterations: number;
	timeBudgetMs: number | null;
	compactRatio: number;
	exitOnEnd: boolean;
}

interface LoopState {
	active: boolean;
	goal: string;
	iteration: number; // completed turns
	maxIterations: number;
	startedAt: number;
	timeBudgetMs: number | null;
	compactRatio: number;
	exitOnEnd: boolean;
	// per-turn signals set by the loop_done / loop_blocked tools
	doneSignaled: boolean;
	doneSummary: string;
	blockedSignaled: boolean;
	blockedReason: string;
	// live monitor timing
	turnStartedAt: number;
	running: boolean;
	// guardrail bookkeeping
	recentFinals: string[];
	noToolStreak: number;
}

function idleState(): LoopState {
	return {
		active: false,
		goal: "",
		iteration: 0,
		maxIterations: DEFAULT_MAX_ITERATIONS,
		startedAt: 0,
		timeBudgetMs: null,
		compactRatio: DEFAULT_COMPACT_RATIO,
		exitOnEnd: false,
		doneSignaled: false,
		doneSummary: "",
		blockedSignaled: false,
		blockedReason: "",
		turnStartedAt: 0,
		running: false,
		recentFinals: [],
		noToolStreak: 0,
	};
}

let state: LoopState = idleState();

// Live monitor (widget box above the editor) — session-scoped resources.
let monitorTimer: ReturnType<typeof setInterval> | null = null;
let monitorCtx: ExtensionContext | null = null;
let spinnerFrame = 0;
let continuationScheduled = false;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const BOX_WIDTH = 58;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArgs(raw: string): ParsedArgs {
	const trimmed = raw.trim();
	const tokens = trimmed.length ? trimmed.split(/\s+/) : [];
	let maxIterations = DEFAULT_MAX_ITERATIONS;
	let timeBudgetMs: number | null = null;
	let compactRatio = DEFAULT_COMPACT_RATIO;
	let exitOnEnd = false;
	const goalParts: string[] = [];

	let i = 0;
	while (i < tokens.length) {
		const t = tokens[i];
		// Returns the flag value for `--name value` or `--name=value`, else undefined.
		const val = (name: string): string | undefined => {
			if (t === name) {
				const next = tokens[i + 1] ?? "";
				i += 1; // consume the value token
				return next;
			}
			if (t.startsWith(`${name}=`)) return t.slice(name.length + 1);
			return undefined;
		};

		let v: string | undefined;
		if ((v = val("--max")) !== undefined) {
			const n = parseInt(v, 10);
			if (Number.isFinite(n) && n > 0) maxIterations = n;
			i += 1;
			continue;
		}
		if ((v = val("--minutes")) !== undefined) {
			const n = parseFloat(v);
			if (Number.isFinite(n) && n > 0) timeBudgetMs = Math.floor(n * 60_000);
			i += 1;
			continue;
		}
		if ((v = val("--compact")) !== undefined) {
			const n = parseFloat(v);
			if (Number.isFinite(n) && n > 0 && n < 1) compactRatio = n;
			i += 1;
			continue;
		}
		if (t === "--exit") {
			exitOnEnd = true;
			i += 1;
			continue;
		}
		goalParts.push(t);
		i += 1;
	}

	return { goal: goalParts.join(" ").trim(), maxIterations, timeBudgetMs, compactRatio, exitOnEnd };
}

function makeState(p: ParsedArgs): LoopState {
	return {
		...idleState(),
		active: true,
		goal: p.goal,
		maxIterations: p.maxIterations,
		startedAt: Date.now(),
		timeBudgetMs: p.timeBudgetMs,
		compactRatio: p.compactRatio,
		exitOnEnd: p.exitOnEnd,
	};
}

type AnyMsg = {
	role?: string;
	content?: unknown;
	toolCalls?: unknown[];
};

function lastAssistantText(messages: AnyMsg[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (m?.role !== "assistant") continue;
		if (!Array.isArray(m.content)) continue;
		const text = m.content
			.filter((p): p is { type: string; text: string } => {
				const part = p as { type?: string; text?: unknown };
				return part?.type === "text" && typeof part.text === "string";
			})
			.map((p) => p.text)
			.join("\n")
			.trim();
		if (text) return text;
	}
	return "";
}

function hadToolActivity(messages: AnyMsg[]): boolean {
	const toolTypes = new Set(["toolCall", "tool_use", "tool-call", "toolUse"]);
	for (const m of messages) {
		if (!m) continue;
		if (m.role === "toolResult") return true;
		if (m.role === "assistant") {
			if (Array.isArray(m.toolCalls) && m.toolCalls.length > 0) return true;
			if (Array.isArray(m.content)) {
				for (const p of m.content) {
					const type = (p as { type?: string })?.type;
					if (type && toolTypes.has(type)) return true;
				}
			}
		}
	}
	return false;
}

function normalize(text: string): string {
	return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function shortGoal(goal: string, max = 64): string {
	return goal.length > max ? `${goal.slice(0, max - 3)}...` : goal;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

function buildKickoff(): string {
	return [
		"You are now running in AUTONOMOUS LOOP mode — fully unsupervised. Work continuously and",
		"independently toward the GOAL below until it is completely finished and verified.",
		"",
		"GOAL:",
		state.goal,
		"",
		"RULES:",
		"1. Never ask the user questions — you will get no answers. At any decision point, choose the",
		"   most reasonable option, note the assumption in one line, and proceed.",
		"2. Take real action every turn: read/write files, run commands, run builds and tests. Prefer",
		"   doing over planning.",
		"3. After each change, VERIFY it: run the build, tests, linters, or reproduce the behaviour. If",
		"   you broke something, fix it.",
		"4. You do NOT need to finish everything in one turn. After each of your turns an automatic",
		'   "continue" message is sent, so keep chipping away: pick the next most valuable step and do it.',
		"5. Call the `loop_done` tool ONLY when the ENTIRE goal is complete AND verified. Include a",
		"   concise summary of what you did and how you verified it. Do not call it early.",
		"6. Call the `loop_blocked` tool ONLY if you are permanently and genuinely stuck (e.g. a required",
		"   secret that cannot exist, or a contradiction no reasonable default resolves). This is a last",
		"   resort — almost always prefer making a reasonable assumption and continuing.",
		"",
		"Start now: outline your plan in 2-4 bullets, then immediately begin executing it.",
	].join("\n");
}

function buildContinuation(): string {
	const next = state.iteration + 1;
	return [
		`[autonomous loop — iteration ${next}/${state.maxIterations}] Continue working toward the GOAL.`,
		"Take concrete action this turn (edit files, run commands) — do not just re-plan. If work remains",
		"or something is broken, fix it now and verify (build/tests). Do NOT ask questions; decide and",
		"proceed. Call `loop_done` only when everything is complete and verified; call `loop_blocked`",
		"only if permanently stuck.",
		"",
		"GOAL (reminder):",
		state.goal,
	].join("\n");
}

// ---------------------------------------------------------------------------
// Loop control
// ---------------------------------------------------------------------------

function fmtDuration(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	const s = total % 60;
	const m = Math.floor(total / 60) % 60;
	const h = Math.floor(total / 3600);
	const pad = (n: number) => n.toString().padStart(2, "0");
	return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function visibleLen(s: string): number {
	// strip ANSI escapes, count code points
	// eslint-disable-next-line no-control-regex
	return [...s.replace(/\x1b\[[0-9;]*m/g, "")].length;
}

function padCell(s: string, width: number): string {
	const len = visibleLen(s);
	if (len <= width) return s + " ".repeat(width - len);
	const cps = [...s];
	let out = "";
	let count = 0;
	for (const ch of cps) {
		if (count >= width - 1) break;
		out += ch;
		count += 1;
	}
	return `${out}…`;
}

function dimText(s: string): string {
	try {
		const theme = monitorCtx?.ui.theme;
		return theme?.fg ? theme.fg("dim", s) : s;
	} catch {
		return s;
	}
}

function renderBox(title: string, rows: string[]): string[] {
	const inner = BOX_WIDTH - 2; // chars between corners
	const prefix = `─ ${title} `;
	const dashes = Math.max(0, inner - visibleLen(prefix));
	const top = dimText(`╭${prefix}${"─".repeat(dashes)}╮`);
	const bottom = dimText(`╰${"─".repeat(inner)}╯`);
	const body = rows.map((r) => `${dimText("│ ")}${padCell(r, inner - 2)}${dimText(" │")}`);
	return [top, ...body, bottom];
}

function renderMonitor(): void {
	if (!monitorCtx || !monitorCtx.hasUI) return;
	if (!state.active) {
		monitorCtx.ui.setWidget("loop", []);
		return;
	}
	const now = Date.now();
	const current = Math.min(state.iteration + (state.running ? 1 : 0), state.maxIterations);
	const spin = state.running ? SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length] : "•";
	const turnElapsed = state.running ? now - state.turnStartedAt : 0;
	const totalElapsed = now - state.startedAt;
	const stateLabel = state.running ? "working" : "waiting";
	const budget = state.timeBudgetMs ? `   budget ${fmtDuration(state.timeBudgetMs)}` : "";
	const rows = [
		`${spin} iteration ${current}/${state.maxIterations}      ${stateLabel}`,
		`this turn ${fmtDuration(turnElapsed)}      total ${fmtDuration(totalElapsed)}${budget}`,
		`goal  ${state.goal}`,
		"stop with /loop-stop",
	];
	monitorCtx.ui.setWidget("loop", renderBox("pi-loop", rows));
	spinnerFrame += 1;
}

function updateStatus(ctx: ExtensionContext): void {
	monitorCtx = ctx;
	if (ctx.hasUI) {
		if (state.active) {
			const current = Math.min(state.iteration + (state.running ? 1 : 0), state.maxIterations);
			ctx.ui.setStatus(
				"loop",
				`⟳ loop ${current}/${state.maxIterations} ${fmtDuration(Date.now() - state.startedAt)}`,
			);
		} else {
			ctx.ui.setStatus("loop", "");
		}
	}
	renderMonitor();
}

function startMonitor(ctx: ExtensionContext): void {
	monitorCtx = ctx;
	if (monitorTimer) clearInterval(monitorTimer);
	if (ctx.hasUI) {
		monitorTimer = setInterval(() => {
			if (monitorCtx) updateStatus(monitorCtx);
		}, 1000);
		const t = monitorTimer as unknown as { unref?: () => void };
		if (typeof t.unref === "function") t.unref();
	}
	updateStatus(ctx);
}

function stopMonitor(): void {
	if (monitorTimer) {
		clearInterval(monitorTimer);
		monitorTimer = null;
	}
	if (monitorCtx?.hasUI) {
		monitorCtx.ui.setStatus("loop", "");
		monitorCtx.ui.setWidget("loop", []);
	}
}

function headlineFor(reason: TerminalReason, iterations: number): string {
	switch (reason) {
		case "done":
			return `✓ loop complete after ${iterations} iteration(s).`;
		case "blocked":
			return "⚠ loop stopped: the agent reported it is permanently blocked.";
		case "stalled":
			return `⚠ loop stopped: output unchanged across ${STALL_LIMIT} iterations (stalled).`;
		case "no-progress":
			return `⚠ loop stopped: ${NO_TOOL_LIMIT} turns with no tool activity (no progress).`;
		case "max-iterations":
			return `■ loop stopped: reached the max of ${state.maxIterations} iterations.`;
		case "time-budget":
			return "■ loop stopped: time budget reached.";
		case "manual":
			return "■ loop stopped by user.";
	}
}

function stopLoop(ctx: ExtensionContext, reason: TerminalReason, detail?: string): void {
	const exit = state.exitOnEnd;
	const iterations = state.iteration;
	state.active = false;
	continuationScheduled = false;

	const headline = headlineFor(reason, iterations);
	const trimmedDetail = detail?.trim();
	const body = trimmedDetail ? `${headline}\n\n${trimmedDetail}` : headline;

	// Record a durable entry in the session log (works in every mode).
	try {
		pi.sendMessage(
			{ customType: "pi-loop", content: `[pi-loop] ${body}`, display: true },
			{ deliverAs: "nextTurn" },
		);
	} catch {
		// ignore — recording is best-effort
	}

	stopMonitor();
	if (ctx.hasUI) {
		ctx.ui.notify(headline, reason === "done" ? "info" : "warning");
		if (trimmedDetail && reason !== "done") {
			ctx.ui.notify(trimmedDetail.slice(0, 300), "info");
		}
	}

	if (exit) ctx.shutdown();
}

function pendingUserInput(ctx: ExtensionContext): boolean {
	try {
		return typeof ctx.hasPendingMessages === "function" ? ctx.hasPendingMessages() : false;
	} catch {
		return false;
	}
}

// Re-inject the "continue" prompt, but only once the agent is genuinely idle.
// This deliberately avoids the streaming follow-up queue (deliverAs: "followUp"),
// which lets continuations pile up faster than they are consumed. Each
// continuation is a normal user message that starts exactly one new turn, so the
// loop is self-serializing: one turn at a time, no queue.
function scheduleContinuation(ctx: ExtensionContext): void {
	if (!state.active || continuationScheduled) return;
	continuationScheduled = true;
	const attempt = () => {
		if (!state.active) {
			continuationScheduled = false;
			return;
		}
		if (!ctx.isIdle() || pendingUserInput(ctx)) {
			// Agent still working, or the user queued something: wait and retry.
			setTimeout(attempt, 300);
			return;
		}
		continuationScheduled = false;
		performContinuation(ctx);
	};
	setTimeout(attempt, 0);
}

function performContinuation(ctx: ExtensionContext): void {
	if (!state.active) return;
	updateStatus(ctx);

	const usage = ctx.getContextUsage();
	const contextWindow = ctx.model?.contextWindow ?? FALLBACK_CONTEXT_WINDOW;
	const threshold = Math.floor(contextWindow * state.compactRatio);

	if (usage && typeof usage.tokens === "number" && usage.tokens >= threshold) {
		if (ctx.hasUI) {
			ctx.ui.notify(`[loop] compacting context (${usage.tokens} ≥ ${threshold} tokens)`, "info");
		}
		ctx.compact({
			customInstructions:
				"This is an autonomous work loop. Preserve: the GOAL, all key decisions and assumptions " +
				"made so far, what has been completed and verified, and what work remains.",
			onComplete: () => sendContinuation(ctx),
			onError: () => sendContinuation(ctx),
		});
		return;
	}

	sendContinuation(ctx);
}

function sendContinuation(ctx: ExtensionContext): void {
	if (!state.active) return;
	Promise.resolve(pi.sendUserMessage(buildContinuation())).catch((err) => {
		if (ctx.hasUI) {
			ctx.ui.notify(`[loop] could not continue: ${err?.message ?? String(err)}`, "error");
		}
	});
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

let pi!: ExtensionAPI;

export default function (api: ExtensionAPI) {
	pi = api;

	// --- completion / block signalling tools ------------------------------

	pi.registerTool({
		name: "loop_done",
		label: "Loop: Done",
		description:
			"Signal that the current autonomous /loop GOAL is fully complete AND verified. Only call this " +
			"during an active loop, and only when everything is finished and you have verified it (e.g. " +
			"build and tests pass). Provide a concise summary of what was accomplished and how it was " +
			"verified. If no loop is active, this is a no-op.",
		parameters: Type.Object({
			summary: Type.String({
				description: "Concise summary of what was accomplished and how it was verified.",
			}),
		}),
		async execute(_toolCallId, params) {
			if (!state.active) {
				return {
					content: [{ type: "text", text: "No autonomous loop is active; nothing to complete." }],
					details: {},
				};
			}
			state.doneSignaled = true;
			state.doneSummary = params.summary ?? "";
			return {
				content: [
					{
						type: "text",
						text: "Completion recorded. The autonomous loop will stop after this turn. Do not start new work.",
					},
				],
				details: {},
			};
		},
	});

	pi.registerTool({
		name: "loop_blocked",
		label: "Loop: Blocked",
		description:
			"Signal that the current autonomous /loop is PERMANENTLY blocked and cannot proceed even with " +
			"reasonable assumptions (e.g. a required secret that cannot exist). This is a last resort — " +
			"almost always prefer making a reasonable assumption and continuing. Provide a clear reason. " +
			"If no loop is active, this is a no-op.",
		parameters: Type.Object({
			reason: Type.String({ description: "Why the loop cannot proceed, and what is needed to unblock it." }),
		}),
		async execute(_toolCallId, params) {
			if (!state.active) {
				return {
					content: [{ type: "text", text: "No autonomous loop is active; nothing to block." }],
					details: {},
				};
			}
			state.blockedSignaled = true;
			state.blockedReason = params.reason ?? "";
			return {
				content: [
					{
						type: "text",
						text: "Block recorded. The autonomous loop will stop after this turn so a human can intervene.",
					},
				],
				details: {},
			};
		},
	});

	// --- the loop itself: re-inject after every turn ----------------------

	pi.on("agent_start", async (_event, ctx) => {
		if (!state.active) return;
		continuationScheduled = false;
		state.turnStartedAt = Date.now();
		state.running = true;
		updateStatus(ctx);
	});

	pi.on("agent_end", async (event, ctx) => {
		if (!state.active) return;
		state.running = false;

		const messages = (event.messages ?? []) as AnyMsg[];
		const finalText = lastAssistantText(messages);
		const toolActivity = hadToolActivity(messages);

		// Consume this turn's signals (tool calls or text sentinels).
		const done = state.doneSignaled || /\bLOOP_DONE\b/.test(finalText);
		const blocked = state.blockedSignaled || /\bLOOP_BLOCKED\b/.test(finalText);
		const summary = state.doneSummary || finalText;
		const blockedReason = state.blockedReason || finalText;
		state.doneSignaled = false;
		state.doneSummary = "";
		state.blockedSignaled = false;
		state.blockedReason = "";

		if (blocked) {
			stopLoop(ctx, "blocked", blockedReason);
			return;
		}
		if (done) {
			stopLoop(ctx, "done", summary);
			return;
		}

		state.iteration += 1;

		// Stall detection: identical final output STALL_LIMIT times in a row.
		const norm = normalize(finalText);
		if (norm) {
			state.recentFinals.push(norm);
			if (state.recentFinals.length > STALL_LIMIT) state.recentFinals.shift();
			if (
				state.recentFinals.length === STALL_LIMIT &&
				state.recentFinals.every((t) => t === state.recentFinals[0])
			) {
				stopLoop(ctx, "stalled");
				return;
			}
		}

		// No-progress detection: several turns with no tool activity.
		state.noToolStreak = toolActivity ? 0 : state.noToolStreak + 1;
		if (state.noToolStreak >= NO_TOOL_LIMIT) {
			stopLoop(ctx, "no-progress");
			return;
		}

		// Hard limits.
		if (state.iteration >= state.maxIterations) {
			stopLoop(ctx, "max-iterations");
			return;
		}
		if (state.timeBudgetMs !== null && Date.now() - state.startedAt >= state.timeBudgetMs) {
			stopLoop(ctx, "time-budget");
			return;
		}

		scheduleContinuation(ctx);
	});

	// Never let a loop leak across session replacement.
	pi.on("session_shutdown", async () => {
		state.active = false;
		continuationScheduled = false;
		stopMonitor();
	});

	// --- commands ---------------------------------------------------------

	pi.registerCommand("loop", {
		description:
			"Autonomously work toward a goal, unsupervised, until it is done. " +
			"Usage: /loop [--max=N] [--minutes=N] [--compact=R] [--exit] <goal>",
		handler: async (args, ctx) => {
			const parsed = parseArgs(args);
			if (!parsed.goal) {
				ctx.ui.notify("Usage: /loop [--max=N] [--minutes=N] [--compact=R] [--exit] <goal>", "warning");
				return;
			}
			if (!ctx.isIdle()) {
				ctx.ui.notify("Agent is busy — wait for it to finish, then start the loop.", "warning");
				return;
			}

			state = makeState(parsed);
			continuationScheduled = false;
			if (ctx.hasUI) {
				const budget = state.timeBudgetMs ? `, ${Math.round(state.timeBudgetMs / 60000)}m budget` : "";
				ctx.ui.notify(
					`⟳ autonomous loop started (max ${state.maxIterations} iterations${budget}). Stop with /loop-stop.`,
					"info",
				);
			}
			startMonitor(ctx);
			pi.sendUserMessage(buildKickoff());
		},
	});

	pi.registerCommand("loop-stop", {
		description: "Stop the active autonomous loop",
		handler: async (_args, ctx) => {
			if (!state.active) {
				ctx.ui.notify("No autonomous loop is active.", "info");
				return;
			}
			stopLoop(ctx, "manual");
		},
	});
}
