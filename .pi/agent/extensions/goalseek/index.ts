/**
 * goalseek — an iterative, manager-supervised goal-seeking loop, run inside pi.
 *
 * The top-level pi session is the MANAGER/ORCHESTRATOR. Each iteration it spawns an
 * EPHEMERAL child `pi` process (a "worker") that runs a fixed prompt with a completely
 * fresh context: the worker reads the goal + plan + progress + repo from disk, does one
 * unit of work, verifies it, logs progress, and exits.
 *
 * Unlike a dumb `while :; do … ; done`, the manager then makes its OWN LLM call to review
 * what the worker actually did (git diff + progress), judge the trajectory
 * (advancing / thrashing / stuck / complete), rewrite the plan, steer the next worker,
 * and decide whether to keep going or stop. Before the first worker it does an initial
 * planning pass.
 *
 * A worker can never self-declare "done" and stop the loop. The loop stops only on the
 * manager's review verdict, /goalseek-stop, the iteration cap, consecutive worker failures,
 * or git-based convergence (no real changes for several runs).
 *
 * Durable state (files, not conversation):
 *   .goalseek/GOAL.md       the objective (human-set)
 *   .goalseek/plan.md       the manager's living, prioritized plan
 *   .goalseek/progress.md   the workers' running log
 *   .goalseek/manager.md    the manager's review/audit trail
 *   .goalseek/steering.md   a one-off note the manager leaves for the next worker
 *   .goalseek/logs/         raw per-iteration worker event streams
 *
 * Commands:
 *   /goalseek <goal>       start (or /goalseek with no args to resume the existing goal)
 *   /goalseek-stop         stop the loop and kill the current worker
 *   /goalseek-pause        pause the loop (save state, kill worker, resume later)
 *   /goalseek-resume       resume a paused loop
 */

import { type ChildProcess, execSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Settings — loaded from .goalseek/settings.json; all fields are live-mutable via
// /goalseek-set while the loop runs (no restart needed).
// ---------------------------------------------------------------------------

interface GoalseekSettings {
	maxIterations: number;
	maxConsecutiveFails: number;
	noProgressLimit: number;
	workerTimeoutMs: number;
	diffBudget: number;
	recentActions: number;
	boxMinWidth: number;
	boxMaxWidth: number;
	spinnerFrames: string[];
	workerPrompt: string;
	managerInitSys: string;
	managerReviewSys: string;
	requiredGuards: string[];
	excludedExtensionNames: string[];
	progressTailBytes: number;
}

const DEFAULT_SETTINGS: GoalseekSettings = {
	maxIterations: 1000,
	maxConsecutiveFails: 5,
	noProgressLimit: 3,
	workerTimeoutMs: 45 * 60 * 1000,
	diffBudget: 6000,
	recentActions: 6,
	boxMinWidth: 56,
	boxMaxWidth: 160,
	spinnerFrames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
	workerPrompt: [
		"You are ONE iteration of an autonomous build loop working toward a fixed GOAL.",
		"You have a FRESH context and remember NOTHING from previous iterations. All durable",
		"state lives in files under .goalseek/ and in the repository itself.",
		"",
		"Do this, in order:",
		"1. Read .goalseek/GOAL.md (the objective), .goalseek/plan.md (the manager's current prioritized",
		"   plan — follow it), .goalseek/steering.md (a directive for THIS run, if present), and",
		"   .goalseek/progress.md (what past iterations did). Inspect the repo (`git status`, run the",
		"   build/tests) to see what is done and what is next.",
		"2. Choose the SINGLE most valuable next unit of work toward the GOAL (respect the plan).",
		"3. Implement it — make real changes to the code.",
		"4. VERIFY: run the build and tests (or otherwise prove it works). If you broke something,",
		"   fix it before finishing this iteration.",
		"5. Append a short, dated entry to .goalseek/progress.md EARLY and keep it updated as you go — it",
		"   is your ONLY durable memory across iterations (fresh context each run). Record what you did,",
		"   the key results/numbers, assumptions, and what the next iteration should do. You may keep",
		"   scratch artifacts under .goalseek/, but progress.md is the canonical log. Commit code with git",
		"   if the repo uses it.",
		"",
		"If — after inspecting the state — you believe the GOAL is already fully complete, do NOT",
		"invent unnecessary work: make NO code changes and note 'nothing to do — <reason>' in",
		".goalseek/progress.md. (A separate manager decides when the loop actually ends.)",
		"",
		"Rules:",
		"- Never ask questions — you are unsupervised. Make the most reasonable assumption, note it,",
		"  and proceed.",
		"- Do exactly ONE focused unit of work this run, then stop. The loop restarts you fresh.",
		"- Prefer small, safe, verifiable steps. Do not delete .goalseek/GOAL.md.",
	].join("\n"),
	managerInitSys: [
		"You are the MANAGER of Goalseek, an autonomous goal-seeking build loop. You do NOT write code.",
		"Ephemeral worker agents each do one unit of work toward a fixed GOAL in a fresh context.",
		"Given the GOAL and the current repository state, produce an initial PLAN: a short,",
		"prioritized checklist of concrete steps for the workers.",
		"",
		"Respond with STRICT JSON only (no prose, no code fences):",
		'{ "status": "advancing", "analysis": "1-2 sentences", "decision": "continue",',
		'  "plan": "<contents for .goalseek/plan.md>", "steering": "optional note for the first worker" }',
	].join("\n"),
	managerReviewSys: [
		"You are the MANAGER of Goalseek, an autonomous goal-seeking build loop. You do NOT write code.",
		"Ephemeral worker agents each do one unit of work toward a fixed GOAL in a fresh context;",
		"you review what just happened and steer the next one.",
		"",
		"You receive: the GOAL, the current PLAN, recent PROGRESS notes, and the DIFF the last",
		"worker produced. Assess the trajectory and respond with STRICT JSON only (no prose, no",
		"code fences):",
		"{",
		'  "status": "advancing" | "thrashing" | "stuck" | "complete",',
		'  "analysis": "1-3 sentence assessment of the last worker and overall trajectory",',
		'  "decision": "continue" | "stop",',
		'  "plan": "the FULL updated contents for .goalseek/plan.md: a short prioritized checklist of',
		'           the next concrete steps; remove done items, add newly discovered work",',
		'  "steering": "optional 1-2 sentence directive for the NEXT worker, or empty"',
		"}",
		"",
		"Guidance:",
		"- advancing: real progress → decision continue.",
		"- thrashing: churning / reverting / going in circles → continue but use steering+plan to",
		"  break the pattern; if it has thrashed repeatedly with no net progress → stop.",
		"- stuck: no meaningful progress and no clear path → stop.",
		"- complete: the GOAL is genuinely met AND verified (build/tests green per the evidence) →",
		"  stop. Be conservative: prefer continue if unsure.",
		"- Reconcile status with decision: decision:stop is ONLY valid with status complete (success)",
		"  or stuck/thrashing (giving up). status:advancing ALWAYS pairs with decision:continue — never",
		"  pair advancing with stop. If you judge the goal met, say complete, not advancing.",
	].join("\n"),
	requiredGuards: ["protected-write-paths.ts"],
	excludedExtensionNames: ["goalseek", "work-plan", "todo-queue.ts"],
	progressTailBytes: 16_000,
};

let currentSettings: GoalseekSettings = { ...DEFAULT_SETTINGS };

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type Phase = "idle" | "planning" | "working" | "reviewing";

interface GoalseekState {
	active: boolean;
	sessionId: number; // incremented on every /goalseek invocation; lets stale runLoop coroutines detect they've been superseded
	goal: string;
	iteration: number;
	startedAt: number;
	turnStartedAt: number;
	running: boolean;
	phase: Phase;
	child: ChildProcess | null;
	managerAbort: AbortController | null;
	recentActions: string[];
}

let _nextSessionId = 1;

function idleState(): GoalseekState {
	return {
		active: false,
		sessionId: 0,
		goal: "",
		iteration: 0,
		startedAt: 0,
		turnStartedAt: 0,
		running: false,
		phase: "idle",
		child: null,
		managerAbort: null,
		recentActions: [],
	};
}

let state: GoalseekState = idleState();
let pi!: ExtensionAPI;

let monitorTimer: ReturnType<typeof setInterval> | null = null;
let monitorCtx: ExtensionContext | null = null;
let spinnerFrame = 0;

// Cache the resolved `complete` function so a single transient import failure
// on the first manager call doesn't permanently break the manager for the session.
let _piAiComplete: typeof import("@earendil-works/pi-ai/compat").complete | null = null;
async function getComplete(): Promise<typeof import("@earendil-works/pi-ai/compat").complete | null> {
	if (_piAiComplete !== null) return _piAiComplete;
	try {
		const mod = await import("@earendil-works/pi-ai/compat");
		_piAiComplete = mod.complete;
		return _piAiComplete;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

const goalseekDir = (cwd: string) => path.join(cwd, ".goalseek");
const stateFile = (cwd: string, name: string) => path.join(goalseekDir(cwd), name);

function setupGoalseekDir(cwd: string, goal: string | undefined): void {
	fs.mkdirSync(path.join(goalseekDir(cwd), "logs"), { recursive: true });
	if (goal !== undefined) fs.writeFileSync(stateFile(cwd, "GOAL.md"), `${goal}\n`);
	if (!fs.existsSync(stateFile(cwd, "progress.md"))) {
		fs.writeFileSync(stateFile(cwd, "progress.md"), "# Goalseek progress log\n\n");
	}
}

function readFileSafe(p: string): string {
	try {
		return fs.readFileSync(p, "utf8").trim();
	} catch {
		return "";
	}
}
const readGoal = (cwd: string) => readFileSafe(stateFile(cwd, "GOAL.md"));
const readPlan = (cwd: string) => readFileSafe(stateFile(cwd, "plan.md"));

function readProgressTail(cwd: string, lines: number): string {
	const p = stateFile(cwd, "progress.md");
	try {
		const size = fs.statSync(p).size;
		if (size === 0) return "";
		let content: string;
		if (size <= currentSettings.progressTailBytes) {
			content = fs.readFileSync(p, "utf8");
		} else {
			const fd = fs.openSync(p, "r");
			const buf = Buffer.alloc(currentSettings.progressTailBytes);
			fs.readSync(fd, buf, 0, currentSettings.progressTailBytes, size - currentSettings.progressTailBytes);
			fs.closeSync(fd);
			content = buf.toString("utf8");
			// Drop the first (likely partial) line caused by the mid-file read offset.
			const nl = content.indexOf("\n");
			if (nl >= 0) content = content.slice(nl + 1);
		}
		return content.split("\n").slice(-lines).join("\n");
	} catch {
		return "";
	}
}

function progressSize(cwd: string): number {
	try {
		return fs.statSync(stateFile(cwd, "progress.md")).size;
	} catch {
		return 0;
	}
}

// Durable-memory backstop: persist the worker's own summary when it forgot to.
function appendProgress(cwd: string, iteration: number, text: string): void {
	try {
		fs.appendFileSync(
			stateFile(cwd, "progress.md"),
			`\n## iteration ${iteration} (worker summary, auto-captured) — ${new Date().toISOString()}\n${truncate(text.trim(), 4000)}\n`,
		);
	} catch {
		/* best-effort */
	}
}
function writePlan(cwd: string, text: string): void {
	if (text.trim()) fs.writeFileSync(stateFile(cwd, "plan.md"), `${text.trim()}\n`);
}
function writeSteering(cwd: string, text: string): void {
	const p = stateFile(cwd, "steering.md");
	if (text.trim()) fs.writeFileSync(p, `${text.trim()}\n`);
	else {
		try {
			fs.rmSync(p);
		} catch {
			// none to clear
		}
	}
}
function recordManagerNote(cwd: string, iteration: number, v: Verdict): void {
	try {
		fs.appendFileSync(
			stateFile(cwd, "manager.md"),
			`\n## iteration ${iteration} — ${new Date().toISOString()}\nstatus: ${v.status}; decision: ${v.decision}\n${v.analysis}\n`,
		);
	} catch {
		// best-effort
	}
}

// ---------------------------------------------------------------------------
// Settings persistence
// ---------------------------------------------------------------------------

function loadSettings(cwd: string): GoalseekSettings {
	const p = stateFile(cwd, "settings.json");
	try {
		const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<GoalseekSettings>;
		return { ...DEFAULT_SETTINGS, ...raw };
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}

function saveSettings(cwd: string, s: GoalseekSettings): void {
	const p = stateFile(cwd, "settings.json");
	fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
}

/** Parse a string value for a settings key, returning the typed value or undefined. */
function coerceSetting(key: string, raw: string): unknown {
	const def = DEFAULT_SETTINGS[key as keyof GoalseekSettings];
	if (def === undefined) return undefined;

	// Try JSON parse first (for arrays, numbers that should be strings, etc.)
	if (raw.startsWith("[") || raw.startsWith("{") || raw === "true" || raw === "false" || raw === "null") {
		try {
			return JSON.parse(raw);
		} catch {
			/* fall through */
		}
	}

	if (typeof def === "number") {
		const n = Number(raw);
		if (!Number.isNaN(n)) return n;
		// Support expressions like "45*60*1000"
		try {
			const evaluated = Function(`"use strict"; return (${raw})`)();
			if (typeof evaluated === "number" && !Number.isNaN(evaluated)) return evaluated;
		} catch {
			/* not an expression */
		}
		return undefined;
	}

	if (typeof def === "boolean") {
		if (raw === "true" || raw === "1" || raw === "yes") return true;
		if (raw === "false" || raw === "0" || raw === "no") return false;
		return undefined;
	}

	if (typeof def === "string") {
		return raw;
	}

	if (Array.isArray(def)) {
		// Try JSON array first, then comma-separated
		try {
			return JSON.parse(raw);
		} catch {
			return raw.split(",").map((s) => s.trim()).filter(Boolean);
		}
	}

	return undefined;
}

// ---------------------------------------------------------------------------
// Pause / Resume state — saved to .goalseek/pause.json
// ---------------------------------------------------------------------------

interface PauseState {
	pausedAt: string;
	iteration: number;
	goal: string;
}

function savePauseState(cwd: string, iteration: number, goal: string): void {
	const s: PauseState = {
		pausedAt: new Date().toISOString(),
		iteration,
		goal,
	};
	fs.writeFileSync(stateFile(cwd, "pause.json"), JSON.stringify(s, null, 2) + "\n");
}

function readPauseState(cwd: string): PauseState | null {
	try {
		const raw = fs.readFileSync(stateFile(cwd, "pause.json"), "utf8");
		const p = JSON.parse(raw) as PauseState;
		if (typeof p.pausedAt === "string" && typeof p.iteration === "number" && typeof p.goal === "string") {
			return p;
		}
		return null;
	} catch {
		return null;
	}
}

function clearPauseState(cwd: string): void {
	try {
		fs.rmSync(stateFile(cwd, "pause.json"));
	} catch {
		/* file didn't exist */
	}
}

function runGit(cwd: string, cmd: string): string {
	try {
		return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
	} catch {
		return "";
	}
}

// Snapshot of git state ignoring .goalseek/. null when not a usable git repo.
function repoSnapshot(cwd: string): string | null {
	try {
		const head = execSync("git rev-parse HEAD", {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		const status = runGit(cwd, "git status --porcelain")
			.split("\n")
			.filter((l) => l.trim() && !l.includes(".goalseek/"))
			.sort()
			.join("\n");
		return `${head}\n${status}`;
	} catch {
		return null;
	}
}

function truncate(s: string, n: number): string {
	return s.length > n ? `${s.slice(0, n)}\n…[truncated]` : s;
}

// Send SIGTERM then SIGKILL after 5 s so workers that ignore SIGTERM don't linger.
function killGracefully(child: ChildProcess): void {
	try {
		child.kill("SIGTERM");
	} catch {
		/* already gone */
	}
	const t = setTimeout(() => {
		try {
			child.kill("SIGKILL");
		} catch {
			/* already gone */
		}
	}, 5000);
	(t as unknown as { unref?: () => void }).unref?.();
}

function gitDiffSince(cwd: string, beforeHead: string | null): string {
	if (!beforeHead) {
		const wt = runGit(cwd, "git --no-pager diff").trim();
		return wt ? truncate(wt, currentSettings.diffBudget) : "(no tracked changes / not a git repo)";
	}
	const commits = runGit(cwd, `git --no-pager log --oneline ${beforeHead}..HEAD`).trim();
	const stat = runGit(cwd, `git --no-pager diff --stat ${beforeHead}..HEAD`).trim();
	const patch = `${runGit(cwd, `git --no-pager diff ${beforeHead}..HEAD`)}\n${runGit(cwd, "git --no-pager diff")}`.trim();
	const parts: string[] = [];
	if (commits) parts.push(`Commits:\n${commits}`);
	if (stat) parts.push(`Files:\n${stat}`);
	if (patch) parts.push(`Patch:\n${truncate(patch, currentSettings.diffBudget)}`);
	return parts.join("\n\n") || "(no changes this iteration)";
}

function repoOverview(cwd: string): string {
	const recent = runGit(cwd, "git --no-pager log --oneline -5").trim();
	const status = runGit(cwd, "git --no-pager status --porcelain").trim();
	let files = runGit(cwd, "git ls-files").split("\n").filter(Boolean).slice(0, 60).join("\n");
	if (!files) {
		try {
			files = fs
				.readdirSync(cwd)
				.filter((f) => !f.startsWith("."))
				.slice(0, 60)
				.join("\n");
		} catch {
			files = "";
		}
	}
	return `Recent commits:\n${recent || "(none)"}\n\nWorking-tree status:\n${status || "(clean)"}\n\nFiles:\n${files || "(unknown)"}`;
}

// ---------------------------------------------------------------------------
// Manager (LLM) review
// ---------------------------------------------------------------------------

interface Verdict {
	status: string;
	analysis: string;
	decision: "continue" | "stop";
	plan: string;
	steering: string;
}

function parseVerdict(text: string): Verdict | null {
	let t = text.trim();
	const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fence) t = fence[1].trim();
	const start = t.indexOf("{");
	const end = t.lastIndexOf("}");
	if (start < 0 || end < 0) return null;
	try {
		const o = JSON.parse(t.slice(start, end + 1)) as Record<string, unknown>;
		return {
			status: typeof o.status === "string" ? o.status : "advancing",
			analysis: typeof o.analysis === "string" ? o.analysis : "",
			decision: o.decision === "stop" ? "stop" : "continue",
			plan: typeof o.plan === "string" ? o.plan : "",
			steering: typeof o.steering === "string" ? o.steering : "",
		};
	} catch {
		return null;
	}
}

async function callManager(ctx: ExtensionContext, systemPrompt: string, userText: string): Promise<Verdict | null> {
	if (!ctx.model) return null;
	let auth: { ok: boolean; apiKey?: string; headers?: Record<string, string>; env?: Record<string, string> };
	try {
		auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	} catch {
		return null;
	}
	if (!auth.ok || !auth.apiKey) return null;

	const complete = await getComplete();
	if (!complete) {
		pushAction("manager: pi-ai unavailable");
		return null;
	}

	const controller = new AbortController();
	state.managerAbort = controller;
	try {
		const response = await complete(
			ctx.model,
			{
				systemPrompt,
				messages: [{ role: "user", content: [{ type: "text", text: userText }], timestamp: Date.now() }],
			},
			{ apiKey: auth.apiKey, headers: auth.headers, env: auth.env, signal: controller.signal },
		);
		if (response.stopReason === "aborted") return null;
		const text = response.content
			.filter((c: { type: string }): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("\n");
		return parseVerdict(text);
	} catch (err) {
		pushAction(`manager error: ${(err as Error).message}`);
		return null;
	} finally {
		state.managerAbort = null;
	}
}

function initUser(cwd: string): string {
	return `GOAL:\n${readGoal(cwd)}\n\nREPOSITORY STATE:\n${repoOverview(cwd)}`;
}
function reviewUser(cwd: string, diff: string, summary: string): string {
	return [
		`GOAL:\n${readGoal(cwd)}`,
		`CURRENT PLAN (.goalseek/plan.md):\n${readPlan(cwd) || "(none yet)"}`,
		`RECENT PROGRESS (.goalseek/progress.md):\n${readProgressTail(cwd, 25) || "(none yet)"}`,
		`LAST WORKER SUMMARY (its own words — real work may live in .goalseek/, excluded from the diff):\n${truncate(summary || "(worker produced no summary text)", 2500)}`,
		`LAST WORKER CHANGES (git diff, excludes .goalseek/):\n${diff}`,
	].join("\n\n");
}

// ---------------------------------------------------------------------------
// Child pi worker
// ---------------------------------------------------------------------------

function resolvePiInvocation(): { cmd: string; baseArgs: string[] } {
	const cli = process.argv[1];
	if (cli && /\.(c|m)?js$/.test(cli)) return { cmd: process.execPath, baseArgs: [cli] };
	return { cmd: "pi", baseArgs: [] };
}

// Workers disable automatic extension discovery, then explicitly load eligible
// project and global extensions. requiredGuards are checked and warned about when
// missing; excludedExtensionNames are omitted from worker processes.

// Resolved path of Goalseek's own directory, used to exclude itself even when a
// saved excludedExtensionNames setting omits "goalseek".
const GOALSEEK_OWN_DIR = typeof __dirname === "string" ? path.resolve(__dirname) : null;

function resolveWorkerExtensions(cwd: string): string[] {
	const found: string[] = [];
	const seen = new Set<string>();

	function addExt(p: string): void {
		const resolved = path.resolve(p);
		if (!seen.has(resolved)) {
			seen.add(resolved);
			found.push(p);
		}
	}

	const searchDirs = [
		path.join(os.homedir(), ".pi", "agent", "extensions"),
		path.join(cwd, ".goalseek"), // project-local Goalseek extensions
		path.join(cwd, ".pi", "extensions"),
	];

	for (const dir of searchDirs) {
		try {
			const entries = fs.readdirSync(dir, { withFileTypes: true });
			for (const entry of entries) {
				const fullPath = path.resolve(dir, entry.name);
				if (new Set(currentSettings.excludedExtensionNames).has(entry.name)) continue;

				if (entry.isDirectory()) {
					// Extension packaged as a subdirectory with index.ts
					if (GOALSEEK_OWN_DIR && fullPath === GOALSEEK_OWN_DIR) continue;
					const indexPath = path.join(fullPath, "index.ts");
					if (fs.existsSync(indexPath)) addExt(indexPath);
				} else if (
					entry.isFile() &&
					entry.name.endsWith(".ts") &&
					!entry.name.endsWith(".d.ts") &&
					!entry.name.includes(".disabled")
				) {
					addExt(path.join(dir, entry.name));
				}
			}
		} catch {
			/* directory not found or unreadable — skip */
		}
	}

	return found;
}

function argSummary(name: string, args: unknown): string {
	if (!args || typeof args !== "object") return args == null ? "" : String(args);
	const a = args as Record<string, unknown>;
	if (name === "bash" && typeof a.command === "string") return a.command.split("\n")[0].slice(0, 100);
	if (typeof a.path === "string") return a.path;
	if (typeof a.file_path === "string") return a.file_path;
	const s = JSON.stringify(a);
	return s.length > 100 ? `${s.slice(0, 97)}...` : s;
}

function assistantText(message: unknown): string {
	const m = message as { role?: string; content?: unknown };
	if (!m || m.role !== "assistant" || !Array.isArray(m.content)) return "";
	return m.content
		.filter((c): c is { type: string; text: string } => {
			const p = c as { type?: string; text?: unknown };
			return p?.type === "text" && typeof p.text === "string";
		})
		.map((c) => c.text)
		.join(" ")
		.trim();
}

function pushAction(line: string): void {
	state.recentActions.push(line);
	if (state.recentActions.length > currentSettings.recentActions) state.recentActions.shift();
}

function handleWorkerLine(line: string, logStream: fs.WriteStream): string | null {
	logStream.write(`${line}\n`);
	let event: { type?: string; toolName?: string; args?: unknown; isError?: boolean; message?: unknown };
	try {
		event = JSON.parse(line);
	} catch {
		return null;
	}
	let summary: string | null = null;
	switch (event.type) {
		case "tool_execution_start":
			pushAction(`→ ${event.toolName ?? "tool"} ${argSummary(event.toolName ?? "", event.args)}`.trimEnd());
			break;
		case "tool_execution_end":
			pushAction(`${event.isError ? "✗" : "✓"} ${event.toolName ?? "tool"}`);
			break;
		case "message_end": {
			const text = assistantText(event.message);
			if (text) {
				pushAction(`» ${text.split("\n")[0]}`);
				summary = text;
			}
			break;
		}
		default:
			return null;
	}
	renderMonitor();
	return summary;
}

function runWorker(
	ctx: ExtensionContext,
	iteration: number,
): Promise<{ code: number; timedOut: boolean; summary: string }> {
	return new Promise((resolve) => {
		const cwd = ctx.cwd;
		const logStream = fs.createWriteStream(stateFile(cwd, path.join("logs", `iter-${iteration}.jsonl`)));
		const errStream = fs.createWriteStream(stateFile(cwd, path.join("logs", `iter-${iteration}.err`)));

		const { cmd, baseArgs } = resolvePiInvocation();
		const args = [...baseArgs, "--mode", "json", "-a", "--no-extensions"];
		// Explicitly load eligible extensions even though automatic discovery is off;
		// `-e` paths still load with --no-extensions.
		for (const ext of resolveWorkerExtensions(cwd)) args.push("-e", ext);
		if (ctx.model) args.push("--model", `${ctx.model.provider}/${ctx.model.id}`);
		args.push(currentSettings.workerPrompt);

		let child: ChildProcess;
		try {
			child = spawn(cmd, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
		} catch (err) {
			pushAction(`spawn failed: ${(err as Error).message}`);
			renderMonitor();
			logStream.end();
			errStream.end();
			resolve({ code: 1, timedOut: false, summary: "" });
			return;
		}
		state.child = child;

		let timedOut = false;
		let lastSummary = "";
		const timer = setTimeout(() => {
			timedOut = true;
			pushAction(`worker exceeded ${Math.round(currentSettings.workerTimeoutMs / 60000)}m — killing`);
			renderMonitor();
			try {
				child.kill("SIGTERM");
			} catch {
				/* gone */
			}
			setTimeout(() => {
				try {
					child.kill("SIGKILL");
				} catch {
					/* gone */
				}
			}, 5000);
		}, currentSettings.workerTimeoutMs);

		if (child.stdout) {
			const rl = readline.createInterface({ input: child.stdout });
			rl.on("line", (l) => {
				const s = handleWorkerLine(l, logStream);
				if (s) lastSummary = s;
			});
			child.on("close", () => rl.close());
		}
		child.stderr?.on("data", (d) => errStream.write(d));
		child.on("error", (err) => {
			pushAction(`worker error: ${err.message}`);
			renderMonitor();
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			logStream.end();
			errStream.end();
			if (state.child === child) state.child = null;
			resolve({ code: code ?? 0, timedOut, summary: lastSummary });
		});
	});
}

// ---------------------------------------------------------------------------
// Orchestration loop
// ---------------------------------------------------------------------------

async function runLoop(ctx: ExtensionContext, sessionId: number): Promise<void> {
	const cwd = ctx.cwd;
	const stale = () => state.sessionId !== sessionId; // true if a newer /goalseek has started
	let fails = 0;
	let noProgress = 0;
	try {
		// Initial planning pass (manager decomposes the goal).
		// Skipped when resuming from a pause (iteration > 0) — the existing
		// plan.md + steering.md are still valid from the last review.
		if (state.iteration === 0) {
			state.phase = "planning";
			state.running = true;
			pushAction("manager: planning…");
			renderMonitor();
			const init = await callManager(ctx, currentSettings.managerInitSys, initUser(cwd));
			state.running = false;
			if (stale() || !state.active) return;
			if (init) {
				writePlan(cwd, init.plan);
				writeSteering(cwd, init.steering);
				recordManagerNote(cwd, 0, init); // iteration 0 = initial planning pass
				pushAction("manager: plan ready");
			} else {
				pushAction("manager: no initial plan (continuing)");
			}
			renderMonitor();
		}

		while (!stale() && state.active && state.iteration < currentSettings.maxIterations) {
			state.iteration += 1;
			state.turnStartedAt = Date.now();
			state.running = true;
			state.phase = "working";
			state.recentActions = [];
			pushAction(`iteration ${state.iteration}…`);
			renderMonitor();

			const progressBefore = progressSize(cwd);
			const before = repoSnapshot(cwd);
			const { code, timedOut, summary } = await runWorker(ctx, state.iteration);
			state.running = false;
			if (stale() || !state.active) break;

			if (timedOut || code !== 0) {
				fails += 1;
				noProgress = 0;
				pushAction(`worker ${timedOut ? "timed out" : `exited ${code}`} (${fails}/${currentSettings.maxConsecutiveFails})`);
				renderMonitor();
				if (fails >= currentSettings.maxConsecutiveFails) return finish(ctx, "failed");
				continue;
			}
			fails = 0;

			// If the worker didn't record progress itself, persist its own summary so the
			// next fresh worker (and the manager) can see what happened.
			if (summary && progressSize(cwd) <= progressBefore) appendProgress(cwd, state.iteration, summary);

			const after = repoSnapshot(cwd);
			const trackable = before !== null && after !== null;
			const changed = trackable ? before !== after : true;

			// Smart manager review — also give it the worker's own summary, since real work
			// may live in .goalseek/ (excluded from the diff) or otherwise go unrecorded.
			state.phase = "reviewing";
			state.running = true;
			pushAction("manager: reviewing…");
			renderMonitor();
			const beforeHead = before ? before.split("\n")[0] : null;
			const review = await callManager(
				ctx,
				currentSettings.managerReviewSys,
				reviewUser(cwd, gitDiffSince(cwd, beforeHead), summary),
			);
			state.running = false;
			if (stale() || !state.active) break;

			if (review) {
				writePlan(cwd, review.plan);
				writeSteering(cwd, review.steering);
				recordManagerNote(cwd, state.iteration, review);
				pushAction(`manager: ${review.status} → ${review.decision}`);
				if (review.analysis) pushAction(`  ${review.analysis.split("\n")[0]}`);
				renderMonitor();
				if (review.decision === "stop") {
					if (review.status === "complete") {
						// The only clean success stop: goal genuinely met and verified.
						return finish(ctx, "complete", review.analysis);
					} else if (review.status === "thrashing" || review.status === "stuck") {
						// No path forward → halt.
						return finish(ctx, "halted", review.analysis);
					} else {
						// status === "advancing" + stop is contradictory: "advancing" is a
						// keep-going signal, so we do NOT terminate on it. A clean success
						// must be reported as status:complete.
						pushAction(
							"manager: advancing but requested stop — continuing (a clean stop needs status:complete)",
						);
					}
				}
			} else {
				pushAction("manager: no verdict (continuing)");
			}

			// Objective convergence backstop — but defer to the manager: only count a
			// no-change iteration when the manager isn't actively seeing progress.
			const advancing = review?.status === "advancing";
			if (trackable && !changed && !advancing) {
				noProgress += 1;
				pushAction(`no changes (${noProgress}/${currentSettings.noProgressLimit})`);
				renderMonitor();
				if (noProgress >= currentSettings.noProgressLimit) return finish(ctx, "converged");
			} else {
				noProgress = 0;
			}
		}
		if (!stale() && state.active) finish(ctx, "max");
	} catch (err) {
		pushAction(`loop error: ${(err as Error).message}`);
		finish(ctx, "failed");
	}
}

type FinishReason = "complete" | "halted" | "converged" | "failed" | "max" | "stopped";

function finish(ctx: ExtensionContext, reason: FinishReason, detail?: string): void {
	if (!state.active) return; // guard against re-entry
	clearPauseState(ctx.cwd);
	const iterations = state.iteration;
	state.active = false;
	state.running = false;
	state.phase = "idle";
	if (state.child) {
		killGracefully(state.child);
		state.child = null;
	}
	if (state.managerAbort) {
		try {
			state.managerAbort.abort();
		} catch {
			/* noop */
		}
		state.managerAbort = null;
	}
	stopMonitor();

	let headline: string;
	switch (reason) {
		case "complete":
			headline = `✓ goalseek complete after ${iterations} iteration(s) — manager judged the goal met and verified.`;
			break;
		case "halted":
			headline = `⚠ goalseek halted by manager after ${iterations} iteration(s) (stuck/thrashing).`;
			break;
		case "converged":
			headline = `✓ goalseek converged after ${iterations} iteration(s) — ${currentSettings.noProgressLimit} in a row with no changes.`;
			break;
		case "failed":
			headline = `⚠ goalseek stopped after ${currentSettings.maxConsecutiveFails} consecutive worker failures.`;
			break;
		case "max":
			headline = `■ goalseek stopped: reached the ${currentSettings.maxIterations}-iteration cap.`;
			break;
		case "stopped":
			headline = `■ goalseek stopped after ${iterations} iteration(s).`;
			break;
	}

	const extra = detail?.trim() || (reason === "converged" ? readProgressTail(ctx.cwd, 12) : "");
	const body = extra ? `${headline}\n\n${extra}` : headline;
	try {
		pi.sendMessage({ customType: "goalseek", content: `[goalseek] ${body}`, display: true }, { deliverAs: "nextTurn" });
	} catch {
		/* best-effort */
	}
	if (ctx.hasUI) {
		ctx.ui.notify(headline, reason === "complete" || reason === "converged" ? "info" : "warning");
	}
}

// ---------------------------------------------------------------------------
// Live monitor box
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

function boxWidth(): number {
	// Fill the terminal width (minus a small margin), within sensible bounds.
	const cols = process.stdout?.columns ?? 80;
	return Math.max(currentSettings.boxMinWidth, Math.min(cols - 4, currentSettings.boxMaxWidth));
}

function renderBox(title: string, rows: string[]): string[] {
	const inner = boxWidth() - 2;
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
		monitorCtx.ui.setWidget("goalseek", []);
		return;
	}
	const now = Date.now();
	const spin = state.running ? currentSettings.spinnerFrames[spinnerFrame % currentSettings.spinnerFrames.length] : "•";
	const step = fmtDuration(state.running ? now - state.turnStartedAt : 0);
	// Keep this compact: pi truncates widgets that are too tall.
	const rows = [
		`${spin} ${state.phase} · iteration ${state.iteration} · total ${fmtDuration(now - state.startedAt)} · step ${step}`,
		`goal  ${state.goal}`,
		...(state.recentActions.length ? state.recentActions : ["(starting…)"]),
		"stop with /goalseek-stop",
	];
	monitorCtx.ui.setWidget("goalseek", renderBox("goalseek", rows));
	spinnerFrame += 1;
}

function updateStatus(ctx: ExtensionContext): void {
	monitorCtx = ctx;
	if (ctx.hasUI) {
		ctx.ui.setStatus(
			"goalseek",
			state.active ? `⟳ goalseek ${state.phase} #${state.iteration} ${fmtDuration(Date.now() - state.startedAt)}` : "",
		);
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
		monitorCtx.ui.setStatus("goalseek", "");
		monitorCtx.ui.setWidget("goalseek", []);
	}
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default function (api: ExtensionAPI) {
	pi = api;

	pi.registerCommand("goalseek", {
		description:
			"Autonomous Goalseek loop with a smart manager: ephemeral fresh-context pi workers toward a goal. " +
			"With no arguments, resumes the goal in .goalseek/GOAL.md or a previously paused loop.",
		handler: async (args, ctx) => {
			if (state.active) {
				ctx.ui.notify("goalseek is already running. Use /goalseek-stop first.", "warning");
				return;
			}
			const cwd = ctx.cwd;
			const argGoal = args.trim();
			let goal: string;
			let resumeIteration = 0;

			// ── Determine goal: arg > pause state > GOAL.md ──
			if (argGoal) {
				// Starting a brand-new goal — clear any stale pause state
				clearPauseState(cwd);
				goal = argGoal;
			} else {
				const pauseState = readPauseState(cwd);
				if (pauseState) {
					goal = pauseState.goal;
					resumeIteration = pauseState.iteration;
				} else {
					goal = readGoal(cwd);
					if (!goal) {
						ctx.ui.notify("Usage: /goalseek <goal>   (or /goalseek with no args to resume)", "warning");
						return;
					}
				}
			}

			if (!ctx.model) {
				ctx.ui.notify("goalseek needs a model selected (the manager reviews each iteration).", "error");
				return;
			}

			// Set up the .goalseek/ directory (harmless if it already exists)
			setupGoalseekDir(cwd, goal);

			// Resume-from-pause: consume the pause bookmark
			const isPauseResume = resumeIteration > 0;
			if (isPauseResume) {
				clearPauseState(cwd);
				if (ctx.hasUI) {
					ctx.ui.notify(
						`⟳ goalseek resuming from iteration ${resumeIteration}`,
						"info",
					);
				}
			}

			currentSettings = loadSettings(cwd);

			// Warn if any required guard extensions can't be resolved.
			const foundGuards = resolveWorkerExtensions(cwd).map((p) => path.basename(p));
			const missingGuards = currentSettings.requiredGuards.filter((name) => !foundGuards.includes(name));
			if (missingGuards.length > 0) {
				ctx.ui.notify(
					`goalseek: worker guard extension(s) not found — workers will run without them: ${missingGuards.join(", ")}`,
					"warning",
				);
			}

			state = idleState();
			state.sessionId = _nextSessionId++;
			state.active = true;
			state.goal = goal;
			state.iteration = resumeIteration;
			state.startedAt = Date.now();

			if (!isPauseResume && ctx.hasUI) {
				ctx.ui.notify(
					"⟳ goalseek started — a smart manager steering ephemeral fresh-context workers. Stop with /goalseek-stop or /goalseek-pause.",
					"info",
				);
			}
			startMonitor(ctx);
			void runLoop(ctx, state.sessionId);
		},
	});

	pi.registerCommand("goalseek-stop", {
		description: "Stop the running Goalseek loop and kill the current worker.",
		handler: async (_args, ctx) => {
			if (!state.active) {
				ctx.ui.notify("goalseek is not running.", "info");
				return;
			}
			finish(ctx, "stopped");
		},
	});

	pi.registerCommand("goalseek-pause", {
		description:
			"Pause the running Goalseek loop. The current worker is killed, and the manager review is aborted. " +
			"The loop state (iteration, goal) is saved to .goalseek/pause.json. " +
			"Resume later with /goalseek or /goalseek-resume.",
		handler: async (_args, ctx) => {
			if (!state.active) {
				ctx.ui.notify("goalseek is not running.", "info");
				return;
			}
			const cwd = ctx.cwd;
			const pausedIteration = state.iteration;
			const pausedGoal = state.goal;

			// Kill the current worker (if any)
			if (state.child) {
				killGracefully(state.child);
				state.child = null;
			}

			// Abort any manager review in progress
			if (state.managerAbort) {
				try {
					state.managerAbort.abort();
				} catch {
					/* noop */
				}
				state.managerAbort = null;
			}

			// Save pause state before clearing in-memory state
			savePauseState(cwd, pausedIteration, pausedGoal);

			// Tear down the loop
			state.active = false;
			state.running = false;
			state.phase = "idle";
			stopMonitor();

			if (ctx.hasUI) {
				ctx.ui.notify(
					`⏸ goalseek paused at iteration ${pausedIteration} (goal: ${pausedGoal}). ` +
						`Resume with /goalseek or /goalseek-resume.`,
					"info",
				);
			}
		},
	});

	pi.registerCommand("goalseek-resume", {
		description:
			"Resume a paused Goalseek loop from .goalseek/pause.json. " +
			"Equivalent to running /goalseek (with no args) when a pause state exists.",
		handler: async (_args, ctx) => {
			if (state.active) {
				ctx.ui.notify("goalseek is already running. Use /goalseek-pause first.", "warning");
				return;
			}
			const cwd = ctx.cwd;
			const pauseState = readPauseState(cwd);
			if (!pauseState) {
				ctx.ui.notify("No paused goalseek loop found. Start one with /goalseek <goal>.", "info");
				return;
			}

			if (!ctx.model) {
				ctx.ui.notify("goalseek needs a model selected (the manager reviews each iteration).", "error");
				return;
			}

			// Consume the pause bookmark
			const resumeIteration = pauseState.iteration;
			clearPauseState(cwd);

			setupGoalseekDir(cwd, pauseState.goal);
			currentSettings = loadSettings(cwd);

			const foundGuards = resolveWorkerExtensions(cwd).map((p) => path.basename(p));
			const missingGuards = currentSettings.requiredGuards.filter((name) => !foundGuards.includes(name));
			if (missingGuards.length > 0) {
				ctx.ui.notify(
					`goalseek: worker guard extension(s) not found — workers will run without them: ${missingGuards.join(", ")}`,
					"warning",
				);
			}

			state = idleState();
			state.sessionId = _nextSessionId++;
			state.active = true;
			state.goal = pauseState.goal;
			state.iteration = resumeIteration;
			state.startedAt = Date.now();

			if (ctx.hasUI) {
				ctx.ui.notify(
					`⟳ goalseek resuming from iteration ${resumeIteration} (paused at ${pauseState.pausedAt})`,
					"info",
				);
			}
			startMonitor(ctx);
			void runLoop(ctx, state.sessionId);
		},
	});

	pi.registerCommand("goalseek-set", {
		description:
			"View or change goalseek settings live (no restart needed). " +
			"Usage: /goalseek-set                  — show all settings\n" +
			"       /goalseek-set <key> <value>    — set a simple value\n" +
			"       /goalseek-set <key> @<file>    — load value from file (for prompts)\n" +
			"       /goalseek-set reload           — reload from .goalseek/settings.json\n" +
			"       /goalseek-set save             — save current in-memory settings to disk",
		handler: async (args, ctx) => {
			const cwd = ctx.cwd;
			const trimmed = args.trim();

			// ── No args → display current settings ──
			if (!trimmed) {
				const display = Object.entries(currentSettings)
					.map(([key, value]) => {
						if (typeof value === "string" && value.length > 80) {
							return `  ${key}: <${value.length} chars>`;
						}
						if (Array.isArray(value)) {
							return `  ${key}: [${value.map((v) => (typeof v === "string" ? `"${v}"` : String(v))).join(", ")}]`;
						}
						return `  ${key}: ${JSON.stringify(value)}`;
					})
					.join("\n");
				ctx.ui.notify(`Current goalseek settings (edit .goalseek/settings.json for full control):\n\n${display}`, "info");
				return;
			}

			// ── Special sub-commands ──
			if (trimmed === "reload") {
				currentSettings = loadSettings(cwd);
				ctx.ui.notify("goalseek settings reloaded from .goalseek/settings.json", "info");
				return;
			}
			if (trimmed === "save") {
				saveSettings(cwd, currentSettings);
				ctx.ui.notify("goalseek settings saved to .goalseek/settings.json", "info");
				return;
			}

			// ── Parse key [value] ──
			const spaceIdx = trimmed.indexOf(" ");
			const key = spaceIdx > 0 ? trimmed.slice(0, spaceIdx) : trimmed;
			let rawValue: string | undefined = spaceIdx > 0 ? trimmed.slice(spaceIdx + 1).trim() : undefined;

			if (!(key in DEFAULT_SETTINGS)) {
				ctx.ui.notify(
					`Unknown setting "${key}". Valid keys: ${Object.keys(DEFAULT_SETTINGS).join(", ")}`,
					"error",
				);
				return;
			}

			// ── Load value from file if prefixed with @ ──
			if (rawValue && rawValue.startsWith("@")) {
				const filePath = rawValue.slice(1);
				try {
					rawValue = fs.readFileSync(
						path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath),
						"utf8",
					).trim();
				} catch (err) {
					ctx.ui.notify(`Cannot read file "${filePath}": ${(err as Error).message}`, "error");
					return;
				}
			}

			// ── Show current value when no value given ──
			if (rawValue === undefined || rawValue === "") {
				const v = (currentSettings as unknown as Record<string, unknown>)[key];
				if (typeof v === "string" && v.length > 200) {
					ctx.ui.notify(`${key}: <${v.length} chars, first 200: ${v.slice(0, 200)}…>`, "info");
				} else if (Array.isArray(v)) {
					ctx.ui.notify(`${key}: [${v.map((i) => (typeof i === "string" ? `"${i}"` : String(i))).join(", ")}]`, "info");
				} else {
					ctx.ui.notify(`${key}: ${JSON.stringify(v)}`, "info");
				}
				return;
			}

			// ── Update the setting ──
			const typed = coerceSetting(key, rawValue);
			if (typed === undefined) {
				ctx.ui.notify(
					`Cannot parse "${rawValue.slice(0, 100)}" for setting "${key}". ` +
						`Expected type: ${typeof DEFAULT_SETTINGS[key as keyof GoalseekSettings]}`,
					"error",
				);
				return;
			}

			(currentSettings as unknown as Record<string, unknown>)[key] = typed;

			const isPromptKey = ["workerPrompt", "managerInitSys", "managerReviewSys"].includes(key);
			const summary = isPromptKey
				? `<${(typed as string).length} chars>`
				: JSON.stringify(typed);
			ctx.ui.notify(`goalseek: ${key} = ${summary} (live)`, "info");

			// Auto-persist simple (non-prompt) settings
			if (!isPromptKey) {
				saveSettings(cwd, currentSettings);
				ctx.ui.notify(`  → persisted to .goalseek/settings.json`, "info");
			} else {
				ctx.ui.notify(`  → use /goalseek-set save or edit .goalseek/settings.json and /goalseek-set reload to persist`, "info");
			}
		},
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		// If the loop was actively running, auto-pause so the user can resume
		// after a crash, Ctrl+C, /reload, /new, /resume, etc.
		if (state.active) {
			savePauseState(ctx.cwd, state.iteration, state.goal);
		}

		if (state.child) {
			killGracefully(state.child);
			state.child = null;
		}
		if (state.managerAbort) {
			try {
				state.managerAbort.abort();
			} catch {
				/* noop */
			}
			state.managerAbort = null;
		}
		state.active = false;
		state.running = false;
		stopMonitor();
	});
}
