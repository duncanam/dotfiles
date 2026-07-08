/**
 * ralph — an autonomous "Ralph Wiggum" loop with a SMART manager, run inside pi.
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
 * Faithful-to-Ralph guardrails: a *worker* can never self-declare "done" and stop the loop.
 * The loop stops only on: the manager's review verdict, /ralph-stop, the iteration cap,
 * consecutive worker failures, or git-based convergence (no real changes for several runs).
 *
 * Durable state (files, not conversation):
 *   .ralph/GOAL.md       the objective (human-set)
 *   .ralph/plan.md       the manager's living, prioritized plan
 *   .ralph/progress.md   the workers' running log
 *   .ralph/manager.md    the manager's review/audit trail
 *   .ralph/steering.md   a one-off note the manager leaves for the next worker
 *   .ralph/logs/         raw per-iteration worker event streams
 *
 * Commands:
 *   /ralph <goal>   start (or /ralph with no args to resume the existing goal)
 *   /ralph-stop     stop the loop and kill the current worker
 */

import { type ChildProcess, execSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const MAX_ITERATIONS = 1000;
const MAX_CONSECUTIVE_FAILS = 5;
const NO_PROGRESS_LIMIT = 3;
const WORKER_TIMEOUT_MS = 45 * 60 * 1000; // bench/build-heavy tasks can be slow
const DIFF_BUDGET = 6000; // chars of diff shown to the manager
const RECENT_ACTIONS = 4;
const BOX_MIN_WIDTH = 56;
const BOX_MAX_WIDTH = 160;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const WORKER_PROMPT = [
	"You are ONE iteration of an autonomous build loop working toward a fixed GOAL.",
	"You have a FRESH context and remember NOTHING from previous iterations. All durable",
	"state lives in files under .ralph/ and in the repository itself.",
	"",
	"Do this, in order:",
	"1. Read .ralph/GOAL.md (the objective), .ralph/plan.md (the manager's current prioritized",
	"   plan — follow it), .ralph/steering.md (a directive for THIS run, if present), and",
	"   .ralph/progress.md (what past iterations did). Inspect the repo (`git status`, run the",
	"   build/tests) to see what is done and what is next.",
	"2. Choose the SINGLE most valuable next unit of work toward the GOAL (respect the plan).",
	"3. Implement it — make real changes to the code.",
	"4. VERIFY: run the build and tests (or otherwise prove it works). If you broke something,",
	"   fix it before finishing this iteration.",
	"5. Append a short, dated entry to .ralph/progress.md EARLY and keep it updated as you go — it",
	"   is your ONLY durable memory across iterations (fresh context each run). Record what you did,",
	"   the key results/numbers, assumptions, and what the next iteration should do. You may keep",
	"   scratch artifacts under .ralph/, but progress.md is the canonical log. Commit code with git",
	"   if the repo uses it.",
	"",
	"If — after inspecting the state — you believe the GOAL is already fully complete, do NOT",
	"invent unnecessary work: make NO code changes and note 'nothing to do — <reason>' in",
	".ralph/progress.md. (A separate manager decides when the loop actually ends.)",
	"",
	"Rules:",
	"- Never ask questions — you are unsupervised. Make the most reasonable assumption, note it,",
	"  and proceed.",
	"- Do exactly ONE focused unit of work this run, then stop. The loop restarts you fresh.",
	"- Prefer small, safe, verifiable steps. Do not delete .ralph/GOAL.md.",
].join("\n");

const MANAGER_INIT_SYS = [
	"You are the MANAGER of an autonomous build loop (a 'Ralph' loop). You do NOT write code.",
	"Ephemeral worker agents each do one unit of work toward a fixed GOAL in a fresh context.",
	"Given the GOAL and the current repository state, produce an initial PLAN: a short,",
	"prioritized checklist of concrete steps for the workers.",
	"",
	"Respond with STRICT JSON only (no prose, no code fences):",
	'{ "status": "advancing", "analysis": "1-2 sentences", "decision": "continue",',
	'  "plan": "<contents for .ralph/plan.md>", "steering": "optional note for the first worker" }',
].join("\n");

const MANAGER_REVIEW_SYS = [
	"You are the MANAGER of an autonomous build loop (a 'Ralph' loop). You do NOT write code.",
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
	'  "plan": "the FULL updated contents for .ralph/plan.md: a short prioritized checklist of',
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
].join("\n");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type Phase = "idle" | "planning" | "working" | "reviewing";

interface RalphState {
	active: boolean;
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

function idleState(): RalphState {
	return {
		active: false,
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

let state: RalphState = idleState();
let pi!: ExtensionAPI;

let monitorTimer: ReturnType<typeof setInterval> | null = null;
let monitorCtx: ExtensionContext | null = null;
let spinnerFrame = 0;

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

const ralphDir = (cwd: string) => path.join(cwd, ".ralph");
const rf = (cwd: string, name: string) => path.join(ralphDir(cwd), name);

function setupRalphDir(cwd: string, goal: string | undefined): void {
	fs.mkdirSync(path.join(ralphDir(cwd), "logs"), { recursive: true });
	if (goal !== undefined) fs.writeFileSync(rf(cwd, "GOAL.md"), `${goal}\n`);
	if (!fs.existsSync(rf(cwd, "progress.md"))) fs.writeFileSync(rf(cwd, "progress.md"), "# Ralph progress log\n\n");
}

function readFileSafe(p: string): string {
	try {
		return fs.readFileSync(p, "utf8").trim();
	} catch {
		return "";
	}
}
const readGoal = (cwd: string) => readFileSafe(rf(cwd, "GOAL.md"));
const readPlan = (cwd: string) => readFileSafe(rf(cwd, "plan.md"));

function readProgressTail(cwd: string, lines: number): string {
	const all = readFileSafe(rf(cwd, "progress.md"));
	return all ? all.split("\n").slice(-lines).join("\n") : "";
}

function progressSize(cwd: string): number {
	try {
		return fs.statSync(rf(cwd, "progress.md")).size;
	} catch {
		return 0;
	}
}

// Durable-memory backstop: persist the worker's own summary when it forgot to.
function appendProgress(cwd: string, iteration: number, text: string): void {
	try {
		fs.appendFileSync(
			rf(cwd, "progress.md"),
			`\n## iteration ${iteration} (worker summary, auto-captured) — ${new Date().toISOString()}\n${truncate(text.trim(), 4000)}\n`,
		);
	} catch {
		/* best-effort */
	}
}
function writePlan(cwd: string, text: string): void {
	if (text.trim()) fs.writeFileSync(rf(cwd, "plan.md"), `${text.trim()}\n`);
}
function writeSteering(cwd: string, text: string): void {
	const p = rf(cwd, "steering.md");
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
			rf(cwd, "manager.md"),
			`\n## iteration ${iteration} — ${new Date().toISOString()}\nstatus: ${v.status}; decision: ${v.decision}\n${v.analysis}\n`,
		);
	} catch {
		// best-effort
	}
}

function runGit(cwd: string, cmd: string): string {
	try {
		return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
	} catch {
		return "";
	}
}

// Snapshot of git state ignoring .ralph/. null when not a usable git repo.
function repoSnapshot(cwd: string): string | null {
	try {
		const head = execSync("git rev-parse HEAD", {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		const status = runGit(cwd, "git status --porcelain")
			.split("\n")
			.filter((l) => l.trim() && !l.includes(".ralph/"))
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

function gitDiffSince(cwd: string, beforeHead: string | null): string {
	if (!beforeHead) {
		const wt = runGit(cwd, "git --no-pager diff").trim();
		return wt ? truncate(wt, DIFF_BUDGET) : "(no tracked changes / not a git repo)";
	}
	const commits = runGit(cwd, `git --no-pager log --oneline ${beforeHead}..HEAD`).trim();
	const stat = runGit(cwd, `git --no-pager diff --stat ${beforeHead}..HEAD`).trim();
	const patch = `${runGit(cwd, `git --no-pager diff ${beforeHead}..HEAD`)}\n${runGit(cwd, "git --no-pager diff")}`.trim();
	const parts: string[] = [];
	if (commits) parts.push(`Commits:\n${commits}`);
	if (stat) parts.push(`Files:\n${stat}`);
	if (patch) parts.push(`Patch:\n${truncate(patch, DIFF_BUDGET)}`);
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

	let complete: typeof import("@earendil-works/pi-ai/compat").complete;
	try {
		({ complete } = await import("@earendil-works/pi-ai/compat"));
	} catch {
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
		`CURRENT PLAN (.ralph/plan.md):\n${readPlan(cwd) || "(none yet)"}`,
		`RECENT PROGRESS (.ralph/progress.md):\n${readProgressTail(cwd, 25) || "(none yet)"}`,
		`LAST WORKER SUMMARY (its own words — real work may live in .ralph/, excluded from the diff):\n${truncate(summary || "(worker produced no summary text)", 2500)}`,
		`LAST WORKER CHANGES (git diff, excludes .ralph/):\n${diff}`,
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

// Workers run lean (--no-extensions) but we still want a few safety guards loaded
// explicitly (they are headless-safe: they block without prompting). Resolve each
// by filename across the likely extension locations and return absolute paths.
const WORKER_EXTENSIONS = ["protected-write-paths.ts"];

function resolveWorkerExtensions(cwd: string): string[] {
	const dirs: string[] = [];
	try {
		if (typeof __dirname === "string") dirs.push(path.dirname(__dirname));
	} catch {
		/* __dirname not provided by this loader */
	}
	dirs.push(path.join(os.homedir(), ".pi", "agent", "extensions"));
	dirs.push(path.join(cwd, ".pi", "extensions"));

	const found: string[] = [];
	for (const name of WORKER_EXTENSIONS) {
		for (const dir of dirs) {
			const p = path.join(dir, name);
			if (fs.existsSync(p)) {
				found.push(p);
				break;
			}
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
	if (state.recentActions.length > RECENT_ACTIONS) state.recentActions.shift();
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
		const logStream = fs.createWriteStream(rf(cwd, path.join("logs", `iter-${iteration}.jsonl`)));
		const errStream = fs.createWriteStream(rf(cwd, path.join("logs", `iter-${iteration}.err`)));

		const { cmd, baseArgs } = resolvePiInvocation();
		const args = [...baseArgs, "--mode", "json", "-a", "--no-extensions"];
		// Explicitly load safety guards (e.g. protected-write-paths) even though
		// discovery is off — `-e` paths still load with --no-extensions.
		for (const ext of resolveWorkerExtensions(cwd)) args.push("-e", ext);
		if (ctx.model) args.push("--model", `${ctx.model.provider}/${ctx.model.id}`);
		args.push(WORKER_PROMPT);

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
			pushAction(`worker exceeded ${Math.round(WORKER_TIMEOUT_MS / 60000)}m — killing`);
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
		}, WORKER_TIMEOUT_MS);

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

async function runLoop(ctx: ExtensionContext): Promise<void> {
	const cwd = ctx.cwd;
	let fails = 0;
	let noProgress = 0;
	try {
		// Initial planning pass (manager decomposes the goal).
		state.phase = "planning";
		state.running = true;
		pushAction("manager: planning…");
		renderMonitor();
		const init = await callManager(ctx, MANAGER_INIT_SYS, initUser(cwd));
		state.running = false;
		if (!state.active) return;
		if (init) {
			writePlan(cwd, init.plan);
			writeSteering(cwd, init.steering);
			pushAction("manager: plan ready");
		} else {
			pushAction("manager: no initial plan (continuing)");
		}
		renderMonitor();

		while (state.active && state.iteration < MAX_ITERATIONS) {
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
			if (!state.active) break;

			if (timedOut || code !== 0) {
				fails += 1;
				noProgress = 0;
				pushAction(`worker ${timedOut ? "timed out" : `exited ${code}`} (${fails}/${MAX_CONSECUTIVE_FAILS})`);
				renderMonitor();
				if (fails >= MAX_CONSECUTIVE_FAILS) return finish(ctx, "failed");
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
			// may live in .ralph/ (excluded from the diff) or otherwise go unrecorded.
			state.phase = "reviewing";
			state.running = true;
			pushAction("manager: reviewing…");
			renderMonitor();
			const beforeHead = before ? before.split("\n")[0] : null;
			const review = await callManager(
				ctx,
				MANAGER_REVIEW_SYS,
				reviewUser(cwd, gitDiffSince(cwd, beforeHead), summary),
			);
			state.running = false;
			if (!state.active) break;

			if (review) {
				writePlan(cwd, review.plan);
				writeSteering(cwd, review.steering);
				recordManagerNote(cwd, state.iteration, review);
				pushAction(`manager: ${review.status} → ${review.decision}`);
				if (review.analysis) pushAction(`  ${review.analysis.split("\n")[0]}`);
				renderMonitor();
				if (review.decision === "stop") {
					return finish(ctx, review.status === "complete" ? "complete" : "halted", review.analysis);
				}
			} else {
				pushAction("manager: no verdict (continuing)");
			}

			// Objective convergence backstop — but defer to the manager: only count a
			// no-change iteration when the manager isn't actively seeing progress.
			const advancing = review?.status === "advancing";
			if (trackable && !changed && !advancing) {
				noProgress += 1;
				pushAction(`no changes (${noProgress}/${NO_PROGRESS_LIMIT})`);
				renderMonitor();
				if (noProgress >= NO_PROGRESS_LIMIT) return finish(ctx, "converged");
			} else {
				noProgress = 0;
			}
		}
		if (state.active) finish(ctx, "max");
	} catch (err) {
		pushAction(`loop error: ${(err as Error).message}`);
		finish(ctx, "failed");
	}
}

type FinishReason = "complete" | "halted" | "converged" | "failed" | "max" | "stopped";

function finish(ctx: ExtensionContext, reason: FinishReason, detail?: string): void {
	const iterations = state.iteration;
	state.active = false;
	state.running = false;
	state.phase = "idle";
	if (state.child) {
		try {
			state.child.kill("SIGTERM");
		} catch {
			/* gone */
		}
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
			headline = `✓ ralph complete after ${iterations} iteration(s) — manager judged the goal met and verified.`;
			break;
		case "halted":
			headline = `⚠ ralph halted by manager after ${iterations} iteration(s) (stuck/thrashing).`;
			break;
		case "converged":
			headline = `✓ ralph converged after ${iterations} iteration(s) — ${NO_PROGRESS_LIMIT} in a row with no changes.`;
			break;
		case "failed":
			headline = `⚠ ralph stopped after ${MAX_CONSECUTIVE_FAILS} consecutive worker failures.`;
			break;
		case "max":
			headline = `■ ralph stopped: reached the ${MAX_ITERATIONS}-iteration cap.`;
			break;
		case "stopped":
			headline = `■ ralph stopped after ${iterations} iteration(s).`;
			break;
	}

	const extra = detail?.trim() || (reason === "converged" ? readProgressTail(ctx.cwd, 12) : "");
	const body = extra ? `${headline}\n\n${extra}` : headline;
	try {
		pi.sendMessage({ customType: "ralph", content: `[ralph] ${body}`, display: true }, { deliverAs: "nextTurn" });
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
	return Math.max(BOX_MIN_WIDTH, Math.min(cols - 4, BOX_MAX_WIDTH));
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
		monitorCtx.ui.setWidget("ralph", []);
		return;
	}
	const now = Date.now();
	const spin = state.running ? SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length] : "•";
	const step = fmtDuration(state.running ? now - state.turnStartedAt : 0);
	// Keep this compact: pi truncates widgets that are too tall.
	const rows = [
		`${spin} ${state.phase} · iteration ${state.iteration} · total ${fmtDuration(now - state.startedAt)} · step ${step}`,
		`goal  ${state.goal}`,
		...(state.recentActions.length ? state.recentActions : ["(starting…)"]),
		"stop with /ralph-stop",
	];
	monitorCtx.ui.setWidget("ralph", renderBox("ralph", rows));
	spinnerFrame += 1;
}

function updateStatus(ctx: ExtensionContext): void {
	monitorCtx = ctx;
	if (ctx.hasUI) {
		ctx.ui.setStatus(
			"ralph",
			state.active ? `⟳ ralph ${state.phase} #${state.iteration} ${fmtDuration(Date.now() - state.startedAt)}` : "",
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
		monitorCtx.ui.setStatus("ralph", "");
		monitorCtx.ui.setWidget("ralph", []);
	}
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default function (api: ExtensionAPI) {
	pi = api;

	pi.registerCommand("ralph", {
		description: "Autonomous Ralph loop with a smart manager: ephemeral fresh-context pi workers toward a goal.",
		handler: async (args, ctx) => {
			if (state.active) {
				ctx.ui.notify("ralph is already running. Use /ralph-stop first.", "warning");
				return;
			}
			const cwd = ctx.cwd;
			const argGoal = args.trim();
			let goal = argGoal;
			if (!goal) {
				goal = readGoal(cwd);
				if (!goal) {
					ctx.ui.notify("Usage: /ralph <goal>   (or /ralph with no args to resume)", "warning");
					return;
				}
			}
			if (!ctx.model) {
				ctx.ui.notify("ralph needs a model selected (the manager reviews each iteration).", "error");
				return;
			}

			setupRalphDir(cwd, argGoal ? goal : undefined);

			state = idleState();
			state.active = true;
			state.goal = goal;
			state.startedAt = Date.now();

			if (ctx.hasUI) {
				ctx.ui.notify(
					"⟳ ralph started — a smart manager steering ephemeral fresh-context workers. Stop with /ralph-stop.",
					"info",
				);
			}
			startMonitor(ctx);
			void runLoop(ctx);
		},
	});

	pi.registerCommand("ralph-stop", {
		description: "Stop the running Ralph loop and kill the current worker.",
		handler: async (_args, ctx) => {
			if (!state.active) {
				ctx.ui.notify("ralph is not running.", "info");
				return;
			}
			finish(ctx, "stopped");
		},
	});

	pi.on("session_shutdown", async () => {
		if (state.child) {
			try {
				state.child.kill("SIGTERM");
			} catch {
				/* gone */
			}
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
