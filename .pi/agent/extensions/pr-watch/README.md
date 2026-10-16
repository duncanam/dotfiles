# PR watch

Opt-in GitHub PR watching for an open Pi agent. Polling is deterministic software,
not a recurring model prompt. Nothing enters model context unless something new
needs attention.

## Use

Run Pi from the PR checkout, with `gh` installed and authenticated. Reload once
with `/reload` after installing this extension, then:

```text
/pr-watch on                      # current branch's PR; immediate poll, then every 10m
/pr-watch                         # status, last poll, counts, and state file
/pr-watch check                   # poll now (only when enabled)
/pr-watch off                     # cancel future polls and pending local delivery
```

The footer shows minutes remaining until the next poll (`10m`, `9m`, …, `1m`),
rounded up. It shows `checking` while a poll is in progress, then resets the
countdown. Minute updates are UI-only: they do not call GitHub or prompt the agent.

On **first use**, existing feedback becomes the baseline; existing failed checks
are actionable immediately. Subsequent enables reuse saved fingerprints, including
new feedback received while watching was off.

To deliberately include/replay all existing feedback and current failures:

```text
/pr-watch off
/pr-watch on --include-existing
```

Watching is **off** on startup, reload, session replacement, and tree navigation.
It also turns off if the PR closes/merges, the branch changes, or the agent ends
with an abort/error. `/pr-watch off` cannot retract a request already delivered or
undo edits. Press Escape to stop an agent that has already started fixing things.

One PR per agent: the PR resolved by `gh pr view` for the current branch. Its URL
is pinned for the duration of the watch. The local branch name must match the PR
head branch; detached HEAD and locally renamed branches are rejected. Use separate
checkouts/agents for separate PRs. A lock prevents two watchers owning one checkout.

## What triggers work

- New or edited conversation comments.
- New or edited review bodies, and `CHANGES_REQUESTED` even without a body.
- New or edited inline review comments and replies (all REST pages).
- Newly observed failed checks from the PR's latest-commit status rollup:
  `FAILURE`, `TIMED_OUT`, `STARTUP_FAILURE`, `ACTION_REQUIRED`, and legacy status
  `FAILURE`/`ERROR`.

Pending, successful, skipped, neutral, cancelled, and stale checks do not trigger.
Empty approvals and unpublished reviews do not trigger. Bot feedback is included.
There is no semantic model classification during polling: a thank-you comment or
infrastructure failure can still trigger investigation, not necessarily a code fix.
Thread resolution changes alone are not monitored.

Counts are saved for inspection, but **IDs plus content hashes** detect changes.
This catches edits and equal-count replacement that count-only comparison misses.
Failure fingerprints include PR head, check identity/URL, status, and execution
timestamps: unchanged failures don't repeatedly wake the model, while reruns or a
new head can. Deletion alone does not trigger a request.

## Delivery and safety

When idle, Pi receives one bounded **actual user message** asking it to investigate,
fix locally, and test. It includes the PR URL/head, a brief delta, and the path to a
private full-delta JSON report. Raw polling output and logs are not sent to the
model. No tools, context hooks, system-prompt changes, or per-turn reminders are
registered by this extension.

If the agent is busy, compacting, has queued input, or is showing a blocking dialog,
changes remain outside context. After an agent run settles, pending work causes a
fresh poll; otherwise the next regular poll handles it. Recovered failures are not
sent from a stale pending snapshot. **Different local and PR head SHAs do not pause
delivery.** CI is scoped to the latest pushed PR head, not the local commit: local
commits, rebases, or remote updates need not match it. Both SHAs appear in status,
fix requests, and the full-delta report. A SHA difference alone never prompts the
agent or resets failure fingerprints.

The agent is asked to verify the intended PR branch, inspect differences before
editing, preserve local work, and avoid duplicating fixes already present. If safe
progress requires synchronizing history, it must report that blocker rather than
resetting, rebasing, or switching branches. It must also check that failures are
still current. No API can make remote updates and local editing atomic.

The watcher runs only read-only `git`/`gh` commands via argument arrays, without a
shell. Every subprocess has a 30-second timeout and bounded output. It uses:

- `git rev-parse` for checkout identity.
- `gh pr view --json ...` for PR metadata, comments, reviews, and check rollup.
- `gh api repos/OWNER/REPO/pulls/N/comments?per_page=100 --paginate --slurp`
  (with the PR hostname) for inline feedback.

There are no automatic commits, pushes, merges, reruns, or GitHub replies. Fix
requests explicitly preserve that restriction and label GitHub content as
untrusted data. These are instructions, **not a sandbox**: enabling the mode
allows unattended local model/tool activity and incurs normal model usage when
there are events. Existing permission extensions continue to govern agent tools.

An event is acknowledged when Pi emits its user message, not when a poll observes
it or merely calls `sendUserMessage`. If delivery isn't confirmed within 30 seconds,
the watcher stops with the delta unacknowledged. **Acknowledged means dispatched,
not fixed.** Aborted/failed work may need explicit backlog replay. A crash between
message delivery and state persistence may also replay work; exactly-once delivery
across process crashes is not promised.

Network/API errors are UI-only and retry next interval. Partial or malformed
snapshots do not advance the baseline. Corrupt state is not silently discarded.
Polls do not overlap; disabling aborts in-flight subprocesses, and late results
cannot start work in another session.

## Storage and troubleshooting

State lives outside the checkout and conversation at:

```text
~/.pi/agent/pr-watch/
```

`PI_CODING_AGENT_DIR` is respected. State files are keyed by canonical checkout
path and PR URL, and contain counts, fingerprints, head SHA, and last poll time.
The latest dispatched delta is stored beside them as `*.last-event.json`, including
full comment bodies; it is overwritten by the next dispatch, not an unlimited log.
Directories/files are created with modes `0700`/`0600` and JSON writes use atomic
rename. `/pr-watch status` reports the state path.

- **HEAD mismatch:** informational, not a pause. `/pr-watch status` shows both
  SHAs; `/pr-watch check` refreshes immediately. If an older loaded version still
  says `paused: local HEAD ≠ PR head`, run `/reload`, then `/pr-watch on`. Saved
  fingerprints are reused; no state deletion or forced synchronization is needed.
- **No PR/auth error:** check `gh pr view` in that checkout and `gh auth status`.
  Enable again after correcting initialization failures.
- **Corrupt state:** disable the watcher and move the reported state file aside to
  create a fresh baseline, or explicitly use `--include-existing` to replay.
- **Lock after a crash:** inspect the reported `.lock` file's PID. Remove that
  specific lock only after confirming its owner has exited. Live locks are never
  automatically stolen; orderly disable/shutdown releases them.

## Development

No runtime npm dependencies. Uses Pi's current `ExtensionAPI` and Node built-ins.
With a Node version that supports direct TypeScript execution (the installed Pi
uses Node 25):

```sh
cd ~/.pi/agent/extensions/pr-watch
node --test *.test.ts
```

Tests cover deterministic deltas, pagination/schema failures, reruns/head changes,
private persistence/locking, timer cadence, busy-agent coalescing, delivery
acknowledgement, cancellation, session isolation, and delivery with differing
local/remote heads without duplicate prompts. `registerPrWatch` accepts
injected process/timer dependencies so tests make no GitHub calls or model requests.
