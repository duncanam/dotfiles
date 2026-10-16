import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { INTERVAL_MS, PR_FIELDS } from "./core.ts";
import { registerPrWatch } from "./index.ts";
import { check, comment, HEAD, NEXT_HEAD, pr } from "./test-fixtures.ts";

async function flush() { for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve)); }
function harness(t: test.TestContext) {
	const base = mkdtempSync(join(tmpdir(), "pr-watch-extension-"));
	const cwd = join(base, "checkout"), directory = join(base, "state");
	mkdirSync(cwd);
	const hooks = new Map<string, Function>();
	const messages: string[] = [], notices: string[] = [];
	const calls: { command: string; args: string[]; signal: AbortSignal }[] = [];
	let commandHandler: Function;
	let now = 0, nextTimer = 1;
	const timers = new Map<number, { callback: () => void; due: number }>();
	const h = {
		cwd, directory, messages, notices, calls, timers, hooks,
		remote: pr(), inline: [[]] as any[], local: { branch: "fix-tests", head: HEAD }, idle: true, queued: false,
		confirmDelivery: true, status: undefined as string | undefined,
		intercept: undefined as ((command: string, args: string[], signal: AbortSignal) => Promise<void>) | undefined,
		emit: async (name: string, event: any = {}) => hooks.get(name)?.(event, ctx),
		command: async (args: string) => commandHandler(args, ctx),
		async finish(outcome = "completed") {
			await h.emit("agent_before_settle", { outcome });
			h.idle = true;
			await h.emit("agent_settled");
		},
		async tick(ms: number) {
			now += ms;
			for (const [id, task] of [...timers]) {
				if (task.due <= now && timers.delete(id)) task.callback();
			}
			await flush();
		},
		stateFiles: () => { try { return readdirSync(directory).filter(f => f.endsWith(".json") && !f.endsWith(".last-event.json")); } catch { return []; } },
		state: () => JSON.parse(readFileSync(join(directory, h.stateFiles()[0]), "utf8")),
	};
	const ctx = {
		cwd, hasUI: true, mode: "tui", isIdle: () => h.idle, hasPendingMessages: () => h.queued,
		ui: { notify: (message: string) => notices.push(message), setStatus: (_key: string, value: string | undefined) => { h.status = value; } },
	};
	const pi = {
		registerCommand(name: string, definition: any) { assert.equal(name, "pr-watch"); commandHandler = definition.handler; },
		on(name: string, handler: Function) { assert.ok(!hooks.has(name)); hooks.set(name, handler); },
		sendUserMessage(message: string, options: any) {
			assert.deepEqual(options, { expandPromptTemplates: false });
			messages.push(message);
			if (h.confirmDelivery) {
				void h.emit("message_start", { message: { role: "user", content: [{ type: "text", text: message }] } });
				h.idle = false;
				void h.emit("agent_start");
			}
		},
	};
	registerPrWatch(pi as any, {
		directory,
		now: () => now,
		run: async (command, args, _cwd, signal) => {
			calls.push({ command, args, signal });
			await h.intercept?.(command, args, signal);
			if (command === "git") {
				if (args.includes("--show-toplevel")) return cwd;
				return args.includes("--abbrev-ref") ? h.local.branch : h.local.head;
			}
			assert.equal(command, "gh");
			if (args[0] === "api") return JSON.stringify(h.inline);
			assert.deepEqual(args.slice(0, 2), ["pr", "view"]);
			return JSON.stringify(h.remote);
		},
		setTimer: (callback, ms) => { const id = nextTimer++; timers.set(id, { callback, due: now + ms }); return id as any; },
		clearTimer: timer => { timers.delete(timer as any); },
	});
	t.after(async () => { await h.emit("session_shutdown"); rmSync(base, { recursive: true, force: true }); });
	return h;
}

test("factory and session start are off: no polling, model messages, tools, or context hooks", async t => {
	const h = harness(t);
	await h.emit("session_start");
	await h.tick(INTERVAL_MS * 100);
	await h.command("status");
	await h.command("check");
	await h.command("on --bad-option");
	assert.equal(h.calls.length, 0);
	assert.equal(h.messages.length, 0);
	assert.equal(h.timers.size, 0);
	assert.equal(h.hooks.has("context"), false);
	assert.equal(h.hooks.has("before_agent_start"), false);
});

test("enable baselines quietly and polls every ten minutes, not sooner", async t => {
	const h = harness(t);
	h.remote.comments = [comment()];
	await h.command("on");
	assert.equal(h.messages.length, 0);
	assert.equal(h.state().counts.comments, 1);
	const calls = h.calls.length;
	await h.tick(INTERVAL_MS - 1);
	assert.equal(h.calls.length, calls);
	await h.tick(1);
	assert.ok(h.calls.length > calls);
	assert.equal(h.messages.length, 0);
	assert.equal(h.notices.length, 1, "unchanged polls do not even notify the UI");
});

test("footer counts down in whole minutes without polling or prompting between deadlines", async t => {
	const h = harness(t);
	await h.command("on");
	assert.equal(h.status, "PR watch #42 · watching · 10m");
	const calls = h.calls.length;
	await h.tick(59_999);
	assert.equal(h.status, "PR watch #42 · watching · 10m");
	await h.tick(1);
	assert.equal(h.status, "PR watch #42 · watching · 9m");
	for (let minutes = 8; minutes >= 1; minutes--) {
		await h.tick(60_000);
		assert.equal(h.status, `PR watch #42 · watching · ${minutes}m`);
		assert.equal(h.calls.length, calls);
	}
	assert.equal(h.messages.length, 0);
	assert.equal(h.notices.length, 1);
	await h.tick(60_000);
	assert.ok(h.calls.length > calls);
	assert.equal(h.status, "PR watch #42 · watching · 10m");
});

test("countdown uses the actual deadline after delayed timer callbacks", async t => {
	const h = harness(t);
	await h.command("on");
	const calls = h.calls.length;
	await h.tick(125_000);
	assert.equal(h.status, "PR watch #42 · watching · 8m");
	await h.tick(55_000);
	assert.equal(h.status, "PR watch #42 · watching · 7m");
	assert.equal(h.calls.length, calls);
	await h.tick(INTERVAL_MS * 2);
	assert.equal(h.status, "PR watch #42 · watching · 10m");
});

test("manual poll resets the countdown and replaces the old poll deadline", async t => {
	const h = harness(t);
	await h.command("on");
	await h.tick(4 * 60_000);
	assert.equal(h.status, "PR watch #42 · watching · 6m");
	await h.command("check");
	assert.equal(h.status, "PR watch #42 · watching · 10m");
	const calls = h.calls.length;
	await h.tick(6 * 60_000);
	assert.equal(h.calls.length, calls);
	assert.equal(h.status, "PR watch #42 · watching · 4m");
	await h.tick(4 * 60_000);
	assert.ok(h.calls.length > calls);
	assert.equal(h.status, "PR watch #42 · watching · 10m");
});

test("retry countdown preserves status notes and stops updating when disabled", async t => {
	const h = harness(t);
	h.local.head = NEXT_HEAD;
	await h.command("on");
	h.intercept = async (_command, args) => { if (args[0] === "api") throw new Error("offline"); };
	await h.command("check");
	assert.equal(h.status, "PR watch #42 · poll error · 10m · local HEAD differs");
	const calls = h.calls.length;
	await h.tick(60_000);
	assert.equal(h.status, "PR watch #42 · poll error · 9m · local HEAD differs");
	assert.equal(h.calls.length, calls);
	await h.command("off");
	assert.equal(h.timers.size, 0);
	await h.tick(INTERVAL_MS);
	assert.equal(h.status, undefined);
	assert.equal(h.calls.length, calls);
});

test("existing failures trigger one user request, durable acknowledgement and a full report", async t => {
	const h = harness(t);
	h.remote.statusCheckRollup = [check()];
	await h.command("on");
	assert.equal(h.messages.length, 1);
	assert.match(h.messages[0], /1 newly failed/);
	assert.equal(h.state().seenFailures.length, 1);
	const report = readdirSync(h.directory).find(f => f.endsWith(".last-event.json"))!;
	assert.equal(JSON.parse(readFileSync(join(h.directory, report), "utf8")).failures.length, 1);
	await h.finish();
	await h.command("check");
	await h.tick(INTERVAL_MS);
	assert.equal(h.messages.length, 1);
});

test("include-existing explicitly replays feedback and failures", async t => {
	const h = harness(t);
	h.remote.comments = [comment()];
	await h.command("on");
	await h.command("off");
	await h.command("on --include-existing");
	assert.equal(h.messages.length, 1);
	assert.match(h.messages[0], /1 new\/edited feedback/);
});

test("include-existing survives a failed initial poll and retries without losing the backlog", async t => {
	const h = harness(t);
	h.remote.comments = [comment()];
	h.intercept = async (_command, args) => { if (args[0] === "api") throw new Error("offline"); };
	await h.command("on --include-existing");
	assert.equal(h.messages.length, 0);
	h.intercept = undefined;
	await h.tick(INTERVAL_MS);
	assert.equal(h.messages.length, 1);
	assert.match(h.messages[0], /1 new\/edited feedback/);
});

test("new and edited feedback triggers once, including equal-count replacement", async t => {
	const h = harness(t);
	await h.command("on");
	h.remote.comments = [comment()];
	await h.command("check");
	assert.equal(h.messages.length, 1);
	await h.finish();
	await h.command("check");
	assert.equal(h.messages.length, 1);
	h.remote.comments = [comment("c1", "Edited")];
	await h.command("check");
	assert.equal(h.messages.length, 2);
	await h.finish();
	h.remote.comments = [comment("replacement")];
	await h.command("check");
	assert.equal(h.messages.length, 3);
});

test("busy agent retains delta outside context; settlement re-fetches and then delivers", async t => {
	const h = harness(t);
	await h.command("on");
	h.idle = false;
	await h.emit("agent_start");
	h.remote.comments = [comment()];
	await h.tick(INTERVAL_MS);
	assert.equal(h.messages.length, 0);
	assert.equal(h.state().counts.comments, 1);
	assert.deepEqual(h.state().seenFeedback, {});
	h.remote.comments = [comment("c1", "Updated while busy")];
	const calls = h.calls.length;
	await h.finish();
	assert.equal(h.messages.length, 0, "notification-only settlement does not inject synchronously");
	await h.tick(0);
	assert.ok(h.calls.length > calls);
	assert.equal(h.messages.length, 1);
	assert.match(h.messages[0], /Updated while busy/);
});

test("a pending failure that recovered while the agent was busy never prompts", async t => {
	const h = harness(t);
	await h.command("on");
	h.idle = false;
	await h.emit("agent_start");
	h.remote.statusCheckRollup = [check()];
	await h.command("check");
	h.remote.statusCheckRollup = [check("SUCCESS")];
	await h.finish();
	await h.tick(0);
	assert.equal(h.messages.length, 0);
});

test("queued user input, compaction and dialogs defer injection", async t => {
	const h = harness(t);
	await h.command("on");
	h.remote.comments = [comment()];
	h.queued = true;
	await h.command("check");
	h.queued = false;
	await h.emit("session_before_compact");
	await h.command("check");
	await h.emit("session_compact_failed");
	await h.emit("ui_prompt_start");
	await h.command("check");
	assert.equal(h.messages.length, 0);
	await h.emit("ui_prompt_end");
	await h.command("check");
	assert.equal(h.messages.length, 1);
});

test("remote head change delivers feedback and failures without requiring local synchronization", async t => {
	const h = harness(t);
	await h.command("on");
	h.remote.headRefOid = NEXT_HEAD;
	h.remote.statusCheckRollup = [check()];
	h.remote.comments = [comment()];
	await h.command("check");
	assert.equal(h.messages.length, 1);
	assert.equal(h.state().seenFailures.length, 1);
	assert.equal(Object.keys(h.state().seenFeedback).length, 1);
	assert.equal(h.state().head, NEXT_HEAD, "failure fingerprints remain scoped to the remote PR head");
	assert.match(h.status!, /local HEAD differs/);
	assert.doesNotMatch(h.status!, /paused/);
	assert.match(h.messages[0], new RegExp(`PR head on GitHub: ${NEXT_HEAD}`));
	assert.match(h.messages[0], new RegExp(`local HEAD: ${HEAD}`));
	const reportFile = readdirSync(h.directory).find(f => f.endsWith(".last-event.json"))!;
	const report = JSON.parse(readFileSync(join(h.directory, reportFile), "utf8"));
	assert.equal(report.head, NEXT_HEAD);
	assert.equal(report.localHead, HEAD);
	await h.command("status");
	assert.match(h.notices.at(-1)!, /different; watching continues/);
	await h.finish();
	h.local.head = NEXT_HEAD;
	await h.command("check");
	assert.equal(h.messages.length, 1, "synchronizing later must not replay the same findings");
	assert.doesNotMatch(h.status!, /differs/);
});

test("existing CI failures deliver with local commits; more local commits do not replay them", async t => {
	const h = harness(t);
	h.local.head = NEXT_HEAD;
	h.remote.statusCheckRollup = [check()];
	await h.command("on");
	assert.equal(h.messages.length, 1);
	assert.match(h.messages[0], /does not block investigation/);
	await h.finish();
	h.local.head = "c".repeat(40);
	await h.tick(INTERVAL_MS);
	assert.equal(h.messages.length, 1);
	assert.equal(h.state().head, HEAD);
	assert.equal(h.state().seenFailures.length, 1);
	assert.equal(h.notices.length, 1, "head differences alone do not produce repeated UI notifications");
});

test("different SHAs alone stay quiet; new review feedback still delivers without failed CI", async t => {
	const h = harness(t);
	h.local.head = NEXT_HEAD;
	await h.command("on");
	await h.tick(INTERVAL_MS);
	assert.equal(h.messages.length, 0);
	assert.match(h.status!, /watching/);
	h.remote.comments = [comment()];
	await h.command("check");
	assert.equal(h.messages.length, 1);
	assert.match(h.messages[0], /1 new\/edited feedback item\(s\), 0 newly failed/);
});

test("branch switch or closed PR stops all timers instead of editing wrong checkout", async t => {
	const h = harness(t);
	await h.command("on");
	h.local.branch = "other";
	h.local.head = NEXT_HEAD;
	h.remote.comments = [comment()];
	await h.command("check");
	assert.equal(h.messages.length, 0);
	assert.equal(h.timers.size, 0);
	assert.match(h.notices.at(-1)!, /branch changed/);
	h.local.branch = "fix-tests";
	await h.command("on");
	await h.finish();
	h.remote.state = "MERGED";
	await h.command("check");
	assert.equal(h.timers.size, 0);
	assert.match(h.notices.at(-1)!, /merged/);
});

test("off aborts an in-flight request and ignores its late result", async t => {
	const h = harness(t);
	await h.command("on");
	h.remote.comments = [comment()];
	let release!: () => void;
	h.intercept = async (_command, args) => { if (args[0] === "api") await new Promise<void>(resolve => { release = resolve; }); };
	const poll = h.command("check");
	await flush();
	assert.ok(release);
	const signal = h.calls.at(-1)!.signal;
	await h.command("off");
	assert.equal(signal.aborted, true);
	release();
	await poll;
	assert.equal(h.messages.length, 0);
	assert.equal(h.state().counts.comments, 0);
	assert.equal(h.timers.size, 0);
});

test("polls never overlap", async t => {
	const h = harness(t);
	await h.command("on");
	let release!: () => void;
	h.intercept = async (_command, args) => { if (args.at(-1) === PR_FIELDS) await new Promise<void>(resolve => { release = resolve; }); };
	const first = h.command("check");
	await flush();
	assert.equal(h.status, "PR watch #42 · checking", "in-flight polls have no stale countdown");
	const calls = h.calls.length;
	await h.command("check");
	await h.tick(INTERVAL_MS);
	assert.equal(h.calls.length, calls);
	release(); await first;
	assert.equal(h.timers.size, 1);
});

test("failed reads never advance baseline; errors stay in UI and retry next interval", async t => {
	const h = harness(t);
	await h.command("on");
	h.remote.comments = [comment()];
	h.intercept = async (_command, args) => { if (args[0] === "api") throw new Error("offline"); };
	await h.command("check");
	await h.command("check");
	assert.equal(h.notices.filter(n => n.includes("offline")).length, 1);
	assert.equal(h.state().counts.comments, 0);
	assert.equal(h.messages.length, 0);
	h.intercept = undefined;
	await h.tick(INTERVAL_MS);
	assert.equal(h.messages.length, 1);
});

test("restart remains off and persisted fingerprints suppress repeats across re-enabling", async t => {
	const h = harness(t);
	h.remote.statusCheckRollup = [check()];
	await h.command("on");
	await h.finish();
	await h.emit("session_shutdown");
	await h.emit("session_start", { reason: "reload" });
	const calls = h.calls.length;
	await h.tick(INTERVAL_MS * 10);
	assert.equal(h.calls.length, calls);
	await h.command("on");
	assert.equal(h.messages.length, 1);
	h.remote.statusCheckRollup = [check("FAILURE", 2)];
	await h.command("check");
	assert.equal(h.messages.length, 2);
});

test("aborts/errors and tree navigation disable autonomous work", async t => {
	const h = harness(t);
	for (const outcome of ["aborted", "error"]) {
		await h.command("on");
		await h.finish(outcome);
		assert.equal(h.timers.size, 0);
		assert.equal(h.status, undefined);
	}
	await h.command("on");
	await h.emit("session_before_tree");
	assert.equal(h.timers.size, 0);
});

test("unconfirmed message delivery does not acknowledge work and stops rather than looping", async t => {
	const h = harness(t);
	h.confirmDelivery = false;
	h.remote.statusCheckRollup = [check()];
	await h.command("on");
	assert.equal(h.messages.length, 1);
	assert.equal(h.state().seenFailures.length, 0);
	const calls = h.calls.length;
	await h.command("check");
	assert.equal(h.calls.length, calls, "do not race unconfirmed delivery with another snapshot");
	assert.equal(h.messages.length, 1);
	await h.tick(30_000);
	assert.equal(h.timers.size, 0);
	assert.match(h.notices.at(-1)!, /not confirmed/);
});

test("late discovery after off cannot create a lock or enable a timer", async t => {
	const h = harness(t);
	let release!: () => void;
	h.intercept = async () => new Promise<void>(resolve => { release = resolve; });
	const enabling = h.command("on");
	await flush();
	await h.command("off");
	release();
	await enabling;
	assert.equal(h.timers.size, 0);
	assert.equal(h.messages.length, 0);
	assert.deepEqual(h.stateFiles(), []);
});
