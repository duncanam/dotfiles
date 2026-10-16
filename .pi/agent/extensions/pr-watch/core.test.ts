import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	acknowledge, acquireLock, baseline, buildPrompt, changes, collect, hasChanges, normalize,
	observed, PR_FIELDS, readState, run, statePath, targetFromUrl, writeJson,
} from "./core.ts";
import { check, comment, HEAD, NEXT_HEAD, pr, URL } from "./test-fixtures.ts";

function temp(t: test.TestContext) {
	const path = mkdtempSync(join(tmpdir(), "pr-watch-test-"));
	t.after(() => rmSync(path, { recursive: true, force: true }));
	return path;
}

test("first poll baselines feedback but surfaces current failed checks", () => {
	const snapshot = normalize(pr({ comments: [comment()], statusCheckRollup: [check()] }), []);
	const state = baseline(snapshot, false);
	assert.deepEqual(state.counts, { comments: 1, reviews: 0, inline: 0 });
	assert.equal(changes(state, snapshot).feedback.length, 0);
	assert.equal(changes(state, snapshot).failures.length, 1);
	const accepted = acknowledge(state, changes(state, snapshot));
	assert.equal(hasChanges(changes(accepted, snapshot)), false);
});

test("IDs/hashes detect equal-count replacement and edits; deletion alone stays quiet", () => {
	const snapshot = normalize(pr({ comments: [comment()] }), []);
	const state = baseline(snapshot, false);
	assert.equal(changes(state, normalize(pr({ comments: [comment("c2")] }), [])).feedback.length, 1);
	assert.equal(changes(state, normalize(pr({ comments: [comment("c1", "Edited feedback")] }), [])).feedback.length, 1);
	assert.equal(hasChanges(changes(state, normalize(pr(), []))), false);
	assert.equal(hasChanges(changes(state, snapshot)), false);
});

test("review decisions, review bodies, inline comments, replies, and ignored empty approvals", () => {
	const snapshot = normalize(pr({
		comments: [comment()],
		reviews: [
			{ ...comment("r1", ""), state: "CHANGES_REQUESTED" },
			{ ...comment("r2", ""), state: "APPROVED" },
			{ ...comment("r3", "Also document it"), state: "APPROVED" },
			{ ...comment("r4"), state: "PENDING" },
		],
	}), [
		{ id: 1, body: "Check null", user: { login: "bot[bot]" }, html_url: `${URL}#discussion_r1`, path: "src/a.ts", line: 9 },
		{ id: 2, body: "Still relevant", user: { login: "reviewer" }, in_reply_to_id: 1, path: "src/a.ts", original_line: 9 },
	]);
	assert.deepEqual(snapshot.feedback.map(f => f.id), ["comment:c1", "review:r1", "review:r3", "inline:1", "inline:2"]);
	assert.equal(snapshot.feedback[3].author, "bot[bot]");
	assert.equal(snapshot.feedback[4].line, 9);
	assert.deepEqual(snapshot.counts, { comments: 1, reviews: 4, inline: 2 });
	assert.equal(changes(baseline(snapshot, true), snapshot).feedback.length, 5);
});

test("only completed failures and legacy error statuses are actionable", () => {
	const snapshot = normalize(pr({ statusCheckRollup: [
		...["FAILURE", "TIMED_OUT", "STARTUP_FAILURE", "ACTION_REQUIRED", "SUCCESS", "NEUTRAL", "SKIPPED", "CANCELLED", "STALE", ""].map(c => check(c)),
		{ ...check(), status: "IN_PROGRESS" },
		{ __typename: "StatusContext", context: "external", state: "ERROR", createdAt: "today", targetUrl: "https://ci.example.com" },
		{ __typename: "StatusContext", context: "external", state: "PENDING" },
	] }), []);
	assert.equal(snapshot.failures.length, 5);
	assert.equal(snapshot.failures[4].state, "ERROR");
});

test("deduplicate unchanged failure; reruns and a new head are new events", () => {
	const first = normalize(pr({ statusCheckRollup: [check()] }), []);
	const state = acknowledge(baseline(first, false), changes(baseline(first, false), first));
	assert.equal(hasChanges(changes(state, first)), false);
	assert.equal(changes(state, normalize(pr({ statusCheckRollup: [check("FAILURE", 2)] }), [])).failures.length, 1);
	assert.equal(changes(state, normalize(pr({ headRefOid: NEXT_HEAD, statusCheckRollup: [check()] }), [])).failures.length, 1);
	const pending = normalize(pr({ statusCheckRollup: [{ ...check(), status: "IN_PROGRESS" }] }), []);
	const observedPending = observed(state, pending);
	assert.equal(hasChanges(changes(observedPending, first)), false, "old failure does not replay merely because a poll omitted it");
});

test("observing while busy updates counts without acknowledging events", () => {
	const initial = normalize(pr(), []);
	const next = normalize(pr({ comments: [comment()], statusCheckRollup: [check()] }), []);
	const state = observed(baseline(initial, false), next);
	assert.equal(state.counts.comments, 1);
	assert.equal(changes(state, next).feedback.length, 1);
	assert.equal(changes(state, next).failures.length, 1);
});

test("collect uses read-only JSON commands and flattens every inline page", async () => {
	const calls: string[][] = [];
	const snapshot = await collect(async (command, args) => {
		calls.push([command, ...args]);
		if (args[0] === "api") return JSON.stringify([[{ id: 1, body: "one" }], [{ id: 2, body: "two", in_reply_to_id: 1 }]]);
		return JSON.stringify(pr());
	}, "/checkout", targetFromUrl(URL), new AbortController().signal);
	assert.equal(snapshot.feedback.length, 2);
	assert.deepEqual(calls, [
		["gh", "pr", "view", URL, "--json", PR_FIELDS],
		["gh", "api", "repos/acme/widgets/pulls/42/comments?per_page=100", "--hostname", "github.com", "--paginate", "--slurp"],
		["gh", "pr", "view", URL, "--json", "headRefOid,headRefName,state"],
	]);
});

test("remote head race, API failure, malformed pagination, and unknown check schema fail closed", async () => {
	await assert.rejects(collect(async (_command, args) => {
		if (args[0] === "api") return "[[]]";
		return JSON.stringify(pr(args.at(-1) === PR_FIELDS ? {} : { headRefOid: NEXT_HEAD }));
	}, "/checkout", targetFromUrl(URL), new AbortController().signal), /changed during polling/);
	await assert.rejects(collect(async () => { throw new Error("offline"); }, "/checkout", targetFromUrl(URL), new AbortController().signal), /offline/);
	await assert.rejects(collect(async (_command, args) => args[0] === "api" ? '[{"message":"denied"}]' : JSON.stringify(pr()), "/checkout", targetFromUrl(URL), new AbortController().signal), /array/);
	assert.throws(() => normalize(pr({ comments: undefined }), []), /array/);
	assert.throws(() => normalize(pr({ statusCheckRollup: [{ __typename: "Unknown" }] }), []), /Unknown/);
});

test("state is private, atomic, survives restart, and refuses corrupt data", t => {
	const directory = join(temp(t), "state");
	const snapshot = normalize(pr({ comments: [comment()] }), []);
	const path = statePath(directory, "/worktree", snapshot.target);
	assert.equal(readState(path, URL), undefined);
	writeJson(path, baseline(snapshot, false));
	assert.equal(hasChanges(changes(readState(path, URL)!, snapshot)), false);
	assert.equal(statSync(path).mode & 0o777, 0o600);
	assert.equal(statSync(directory).mode & 0o777, 0o700);
	assert.deepEqual(readdirSync(directory), [path.split("/").at(-1)]);
	assert.notEqual(path, statePath(directory, "/different-worktree", snapshot.target));
	assert.throws(() => readState(path, URL.replace("42", "43")), /Invalid/);
	writeFileSync(path, "broken");
	assert.throws(() => readState(path, URL));
});

test("checkout lock prevents concurrent watchers and releases idempotently", t => {
	const directory = temp(t);
	const release = acquireLock(directory, "/checkout");
	assert.throws(() => acquireLock(directory, "/checkout"), /watcher/);
	const other = acquireLock(directory, "/other-checkout");
	other(); release(); release();
	acquireLock(directory, "/checkout")();
	assert.deepEqual(readdirSync(directory), []);
});

test("prompt is bounded, labels untrusted data, and points to full delta", () => {
	const snapshot = normalize(pr({ comments: Array.from({ length: 100 }, (_, i) => comment(`c${i}`, "x".repeat(10_000))) }), []);
	const delta = changes(baseline(snapshot, true), snapshot);
	const prompt = buildPrompt(snapshot, delta, "/private/full.json", { branch: snapshot.branch, head: snapshot.head });
	assert.ok(prompt.length < 10_000);
	assert.match(prompt, /100 new\/edited/);
	assert.match(prompt, /untrusted evidence/);
	assert.match(prompt, /\/private\/full.json/);
	assert.match(prompt, new RegExp(HEAD));
	assert.match(prompt, /Do not commit, push/);
	assert.doesNotMatch(prompt, /differs from the PR head/);
});

test("different local HEAD is context, not an instruction to stop or discard local work", () => {
	const snapshot = normalize(pr({ statusCheckRollup: [check()] }), []);
	const delta = changes(baseline(snapshot, false), snapshot);
	const prompt = buildPrompt(snapshot, delta, "/private/full.json", { branch: snapshot.branch, head: NEXT_HEAD });
	assert.match(prompt, new RegExp(`PR head on GitHub: ${HEAD}`));
	assert.match(prompt, new RegExp(`local HEAD: ${NEXT_HEAD}`));
	assert.match(prompt, /does not block investigation/);
	assert.match(prompt, /CI results belong to the PR head/);
	assert.match(prompt, /preserve local work/);
	assert.match(prompt, /avoid reapplying fixes already present/);
	assert.doesNotMatch(prompt, /head still match|if not, stop/);
});

test("URL parsing rejects unsafe targets and supports GitHub Enterprise", () => {
	assert.equal(targetFromUrl("https://github.example.com/team/repo/pull/1").host, "github.example.com");
	for (const url of ["http://github.com/a/b/pull/1", "https://user:pass@github.com/a/b/pull/1", "https://github.com/a/b/pull/1?bad=1", "https://github.com/a/b/issues/1"]) assert.throws(() => targetFromUrl(url));
});

test("process runner does not interpolate arguments and honors abort", async () => {
	const output = await run(process.execPath, ["-e", "console.log(process.argv[1])", "$(echo not-a-shell)"], process.cwd(), new AbortController().signal);
	assert.equal(output.trim(), "$(echo not-a-shell)");
	const controller = new AbortController();
	const pending = run(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], process.cwd(), controller.signal);
	controller.abort();
	await assert.rejects(pending, /failed/);
});
