import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
	INTERVAL_MS, acknowledge, acquireLock, baseline, buildPrompt, changes, clean, collect, hasChanges,
	localIdentity, observed, readState, run, statePath, targetFromUrl, writeJson,
	type Run, type State, type Target,
} from "./core.ts";

interface Watch {
	ctx: ExtensionContext; controller: AbortController; cwd: string; branch?: string; target?: Target;
	path?: string; state?: State; release?: () => void; running: boolean; pending: boolean; includeExisting: boolean;
	localHead?: string; error?: string; delivery?: { marker: string; state: State };
	nextPollAt?: number; statusDetail?: string;
}
interface Dependencies {
	run?: Run; directory?: string; now?: () => number;
	setTimer?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
	clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}
const HELP = "/pr-watch on [--include-existing] | off | status | check";
const MINUTE_MS = 60_000;

export function registerPrWatch(pi: ExtensionAPI, deps: Dependencies = {}): void {
	const exec = deps.run ?? run;
	const agentDir = process.env.PI_CODING_AGENT_DIR?.replace(/^~(?=\/|$)/, homedir()) || join(homedir(), ".pi", "agent");
	const directory = deps.directory ?? join(resolve(agentDir), "pr-watch");
	const setTimer = deps.setTimer ?? ((callback, ms) => { const timer = setTimeout(callback, ms); timer.unref(); return timer; });
	const clearTimer = deps.clearTimer ?? clearTimeout;
	const now = deps.now ?? Date.now;
	let active: Watch | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let deliveryTimer: ReturnType<typeof setTimeout> | undefined;
	let busy = false;
	let compacting = false;
	let dialog = false;

	function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error" = "info") {
		if (ctx.hasUI) ctx.ui.notify(message, level);
	}
	function status(w: Watch, detail = w.statusDetail ?? "watching") {
		w.statusDetail = detail;
		const countdown = w.nextPollAt === undefined ? "" : ` · ${Math.max(0, Math.ceil((w.nextPollAt - now()) / MINUTE_MS))}m`;
		const headNote = w.localHead && w.state && w.localHead !== w.state.head ? " · local HEAD differs" : "";
		if (active === w && w.ctx.hasUI) w.ctx.ui.setStatus("pr-watch", `PR watch #${w.target?.number ?? "…"} · ${detail}${countdown}${headNote}`);
	}
	function stop(ctx?: ExtensionContext, reason?: string) {
		if (timer) clearTimer(timer);
		if (deliveryTimer) clearTimer(deliveryTimer);
		timer = deliveryTimer = undefined;
		const previous = active;
		active = undefined; // Invalidate every in-flight await before abort/release.
		previous?.controller.abort();
		try { previous?.release?.(); }
		catch (error) { if (ctx) notify(ctx, `PR watch lock cleanup failed: ${String(error)}`, "warning"); }
		if (ctx?.hasUI) ctx.ui.setStatus("pr-watch", undefined);
		if (reason && ctx) notify(ctx, `PR watch off: ${reason}`);
	}
	function schedule(w: Watch, delay = INTERVAL_MS) {
		if (active !== w) return;
		if (timer) clearTimer(timer);
		const deadline = now() + delay;
		w.nextPollAt = deadline;
		status(w);
		const tick = () => {
			if (active !== w || w.nextPollAt !== deadline) return;
			timer = undefined;
			const remaining = deadline - now();
			if (remaining <= 0) {
				w.nextPollAt = undefined;
				void poll(w);
				return;
			}
			// UI-only minute ticks: use the deadline so delayed callbacks don't drift.
			status(w);
			timer = setTimer(tick, remaining % MINUTE_MS || MINUTE_MS);
		};
		timer = setTimer(tick, Math.min(delay, MINUTE_MS));
	}
	function canDeliver(w: Watch): boolean {
		return !busy && !compacting && !dialog && w.ctx.isIdle() && !w.ctx.hasPendingMessages();
	}
	async function poll(w: Watch) {
		if (active !== w || w.running || w.delivery || !w.target || !w.branch) return;
		if (timer) clearTimer(timer);
		timer = undefined;
		w.nextPollAt = undefined;
		w.running = true;
		status(w, "checking");
		try {
			const snapshot = await collect(exec, w.cwd, w.target, w.controller.signal);
			if (active !== w) return;
			const local = await localIdentity(exec, w.cwd, w.controller.signal);
			if (active !== w) return;
			if (local.branch !== w.branch || snapshot.branch !== w.branch) {
				stop(w.ctx, "branch changed; re-enable in the intended checkout"); return;
			}
			if (snapshot.state !== "OPEN") { stop(w.ctx, `PR is ${snapshot.state.toLowerCase()}`); return; }
			w.localHead = local.head;
			w.path ??= statePath(directory, w.cwd, w.target);
			w.state ??= w.includeExisting ? baseline(snapshot, true) : readState(w.path, w.target.url) ?? baseline(snapshot, false);
			const delta = changes(w.state, snapshot);
			w.state = observed(w.state, snapshot);
			writeJson(w.path, w.state); // Counts update even when agent delivery is deferred.
			w.pending = hasChanges(delta);
			w.error = undefined;
			// Local commits/rebases need not equal the pushed PR head. CI is scoped
			// to snapshot.head; carry both SHAs to the agent rather than blocking it.
			if (!w.pending) { status(w, "watching"); return; }
			if (!canDeliver(w)) { status(w, "new events · waiting for idle"); return; }
			const reportPath = w.path.replace(/\.json$/, ".last-event.json");
			writeJson(reportPath, { url: snapshot.target.url, head: snapshot.head, localHead: local.head, observedAt: w.state.lastPollAt, ...delta });
			const marker = `[pr-watch request ${randomUUID()}]`;
			w.delivery = { marker, state: acknowledge(w.state, delta) };
			// A sendUserMessage call returns void, not a delivery promise. Only acknowledge
			// once Pi emits the actual user message, not when we merely request it.
			deliveryTimer = setTimer(() => {
				if (active === w && w.delivery) stop(w.ctx, "message delivery was not confirmed; events remain unacknowledged");
			}, 30_000);
			pi.sendUserMessage(`${buildPrompt(snapshot, delta, reportPath, local)}\n\n${marker}`, { expandPromptTemplates: false });
			status(w, "fix request sent");
		} catch (error) {
			if (active !== w) return;
			const message = clean(error instanceof Error ? error.message : String(error));
			if (w.delivery) { stop(w.ctx, `delivery failed: ${message}`); return; }
			status(w, "poll error");
			if (w.error !== message) notify(w.ctx, `PR watch: ${message}`, "warning");
			w.error = message;
		} finally {
			w.running = false;
			schedule(w);
		}
	}

	pi.registerCommand("pr-watch", {
		description: "Opt-in GitHub PR auto-fixes: on [--include-existing], off, status, check (10-minute polling)",
		handler: async (args, ctx) => {
			const words = args.trim().split(/\s+/).filter(Boolean);
			const command = words[0] ?? "status";
			if (command === "off" && words.length === 1) { stop(ctx, "disabled by user"); return; }
			if (command === "status" && words.length <= 1) {
				const w = active;
				notify(ctx, w ? [
					`PR watch on (10m): ${w.target?.url ?? "initializing"}`,
					`Last successful poll: ${w.state?.lastPollAt ?? "none"}; counts: ${JSON.stringify(w.state?.counts ?? {})}`,
					`Local HEAD: ${w.localHead ?? "unknown"}; PR head: ${w.state?.head ?? "unknown"}${w.localHead && w.state && w.localHead !== w.state.head ? " (different; watching continues)" : ""}`,
					`Pending changes: ${w.pending ? "yes" : "no"}${w.error ? `; error: ${w.error}` : ""}`,
					`State: ${w.path ?? directory}`,
				].join("\n") : `PR watch off. ${HELP}`);
				return;
			}
			if (command === "check" && words.length === 1) {
				if (!active) { notify(ctx, "PR watch is off; use /pr-watch on first", "warning"); return; }
				if (active.running) { notify(ctx, "PR watch poll already in progress"); return; }
				await poll(active); return;
			}
			if (command !== "on" || words.length > 2 || (words[1] && words[1] !== "--include-existing")) {
				notify(ctx, HELP, "warning"); return;
			}
			if (active) { notify(ctx, "PR watch is already on; turn it off before reconfiguring", "warning"); return; }
			const w: Watch = { ctx, cwd: ctx.cwd, controller: new AbortController(), running: true, pending: false, includeExisting: words[1] === "--include-existing" };
			active = w;
			busy = !ctx.isIdle();
			try {
				w.cwd = realpathSync((await exec("git", ["rev-parse", "--show-toplevel"], ctx.cwd, w.controller.signal)).trim());
				if (active !== w) return;
				w.release = acquireLock(directory, w.cwd);
				const local = await localIdentity(exec, w.cwd, w.controller.signal);
				if (active !== w) return;
				if (local.branch === "HEAD") throw new Error("Detached HEAD; check out the PR branch first");
				w.branch = local.branch;
				// Resolve once using gh's own branch/upstream selection, then pin the URL.
				const pr = JSON.parse(await exec("gh", ["pr", "view", "--json", "url,headRefName"], w.cwd, w.controller.signal));
				if (active !== w) return;
				if (pr.headRefName !== w.branch) throw new Error("Local branch name does not match the PR head branch");
				w.target = targetFromUrl(pr.url);
				w.running = false;
				notify(ctx, `PR watch on: ${w.target.url} (every 10m). ${w.includeExisting ? "Including existing feedback and failed checks." : "Old feedback is baselined on first use; existing failed checks are actionable."} /pr-watch off stops it.`);
				await poll(w);
			} catch (error) {
				if (active === w) stop(ctx, error instanceof Error ? error.message : String(error));
			}
		},
	});

	pi.on("message_start", (event, ctx) => {
		const w = active;
		if (!w?.delivery || event.message.role !== "user") return;
		const content = event.message.content;
		const body = typeof content === "string" ? content : content.filter(p => p.type === "text").map(p => p.text).join("\n");
		if (!body.includes(w.delivery.marker)) return;
		try {
			writeJson(w.path!, w.delivery.state);
			w.state = w.delivery.state;
			w.pending = false;
			w.delivery = undefined;
			if (deliveryTimer) clearTimer(deliveryTimer);
			deliveryTimer = undefined;
		} catch (error) { stop(ctx, `could not persist delivery: ${String(error)}`); }
	});
	pi.on("agent_start", () => { busy = true; });
	pi.on("agent_settled", (_event, ctx) => {
		busy = false;
		if (active) {
			active.ctx = ctx;
			// Notification-only event: defer work to a timer and fetch a fresh snapshot.
			if (active.pending && !active.running && !active.delivery) schedule(active, 0);
		}
	});
	pi.on("agent_before_settle", (event, ctx) => {
		if (active && event.outcome !== "completed") stop(ctx, `agent ${event.outcome}; re-enable when ready`);
	});
	pi.on("session_before_compact", () => { compacting = true; });
	pi.on("session_compact", () => { compacting = false; });
	pi.on("session_compact_failed", () => { compacting = false; });
	pi.on("ui_prompt_start", () => { dialog = true; });
	pi.on("ui_prompt_end", () => { dialog = false; });
	pi.on("session_before_tree", (_event, ctx) => { if (active) stop(ctx, "session tree navigation"); });
	pi.on("session_start", (_event, ctx) => { stop(ctx); busy = compacting = dialog = false; });
	pi.on("session_shutdown", () => { stop(); });
}

export default function prWatch(pi: ExtensionAPI): void { registerPrWatch(pi); }
