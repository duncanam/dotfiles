# Architect / Implementor for Pi

**Main Pi is the architect.** Its conversation, tools, reports and reviews use normal scrollable Pi history. One persistent implementor runs in tmux and appears in a full-width, themed pane above the native editor. No architect subprocess, input interception or replacement editor/footer.

Typechecked against Pi 0.85.1; integration-tested with Pi 0.87.1, Node 25 and tmux on macOS. Unix-only; Linux untested.

## Use

```text
/pair-enable Implement the authentication change described below
...talk directly to the architect in normal Pi...
/model                     # architect's native model selector
/thinking                  # architect's native thinking selector
/pair-models high          # implementor only
/pair-usage                # per-role tokens/cache/estimated cost, plus combined total
/pair-disable
```

Bare `/pair-enable` initializes defaults and starts the implementor **without a model call**. An optional task enters the main conversation. Normal text/images, steering/follow-ups, `!shell`, skills, templates and slash commands work normally. Avoid conflicting autonomous extensions.

Each enable applies the architect model/effort from JSON using native **session-only** setters. Subsequent `/model`, `/thinking` and keyboard selections work normally. Disable leaves the main conversation and its current model/effort intact; it does not restore an old selection. The extension never writes Pi's global defaults.

The implementor keeps its own in-memory context across assignments and model switches. Disable, quit, reload, session replacement or successful `/tree` navigation stops it and clears temporary overrides. Re-enable creates a fresh worker. Main history follows Pi's normal session/branch/compaction behavior; code changes are not undone.

**Escape affects the main Pi turn, not the implementor.** An unsent directive awaiting a settled report can be cancelled. Already-dispatched work may continue, and worker reports can trigger a subsequent architect turn. `/pair-disable` stops the local worker and its tool process tree; that does not imply cancellation of remote jobs.

## Configuration

Use `~/.pi/agent/architect-implementor.json` (or `$PI_CODING_AGENT_DIR/architect-implementor.json`). Strict JSON is re-read on enable; no project-local configuration. Start from `architect-implementor.example.json`.

```json
{
  "version": 2,
  "checkinSeconds": 1200,
  "paneLines": 26,
  "piCommand": "pi",
  "architect": {
    "provider": "openai-codex",
    "model": "gpt-5.6-sol",
    "thinking": "high"
  },
  "implementor": {
    "provider": "openai-codex",
    "model": "gpt-5.6-luna",
    "thinking": "max",
    "extensions": [],
    "skills": [],
    "extraTools": []
  }
}
```

`architect` contains **only** `provider`, `model`, and `thinking`. It inherits the main Pi's normal tools, extensions, skills and policies. The extension adds `ai_directive` while active, preserving other active tools. Role guidelines and a transient current-state snapshot also cover automatic report-driven turns and tool continuations.

`implementor` additionally accepts explicit `extensions`, `skills`, and `extraTools`. Paths resolve relative to the JSON file; absolute paths and `~/` work. It has read/write/edit/Bash plus `ai_report`. Missing tools and unsupported model/effort selections fail rather than silently downgrade. Authentication is reused normally.

The installed/example config retains source-control, search, protected-path and Context7 extensions, source-control skill and Context7 tools **for the implementor**, and enables `extensions/loop-guard.ts`. The guard warns after three identical assistant responses and aborts the local run after five; warnings/aborts appear in the implementor feed. It detects repeated responses, not semantic lack of progress, and does not cancel remote jobs or declare the assignment complete. The implementor's automatic resource discovery/project approval are disabled; ancestor/global `AGENTS.md` still loads. Keep unrelated orchestration out of its allowlist. This is not a filesystem or OS sandbox: both agents have ordinary user privileges and must follow normal policies.

Defaults: `checkinSeconds: 600`, `paneLines: 26`, `piCommand: "pi"`. The installed configuration uses **1200-second check-ins and 26 rows**.

### Upgrade from two tmux workers

1. Save a concise handoff from any old workers whose context you need. Their private conversations are not imported automatically.
2. `/pair-disable`, then `/reload` when safe. Reload stops old workers and loses their in-memory context.
3. Use version 2 JSON: add `"version": 2` and remove `extensions`, `skills`, and `extraTools` from `architect`. Keep implementor resources.
4. `/pair-enable` with the handoff/task.

The installed and example JSON have already been migrated. The version marker prevents the old extension from accidentally starting its obsolete architect worker with the new configuration. Existing live workers are not hot-migrated.

## Temporary implementor models

`/pair-models` opens an implementor model/effort picker; Escape cancels. There is no role picker or role argument:

```text
/pair-models openai-codex/gpt-5.6-luna max
/pair-models high
/pair-models reset
```

Effort alone keeps the current model. `reset` restores implementor defaults from JSON. Before enable, choices are staged for the next worker. While active, changes preserve its conversation and task clock, and never change the architect or JSON.

Live switches wait for a settled boundary, including retries/compaction. The command returns immediately with a `model queued` indicator; subsequent handoffs wait behind the switch. The wait expires after ten minutes, duplicate changes are rejected, and exact selection is verified before pane metadata changes. Unsupported selections roll back; uncertain setters or failed rollback stop delegation. Disable/reload clears staged and live overrides.

## Workflow and indicators

- Architect does enough initial investigation to scope the job, delegates substantive work (including read-only investigations), resolves blockers and independently reviews completion using ordinary tools. The implementor owns the delegated scope until done/blocked; the architect must not repeat that investigation or implementation in parallel. Explicitly non-overlapping work and coordinated supporting edits remain allowed. This is instruction-based ownership, not a tool ban. No required plan file, inspection wrapper or automatic backlog scheduler.
- `ai_directive` must run alone in its tool batch. Assign increments the cycle; guide resumes/corrects the same cycle; ping requests status without resuming paused coding; accept requires a fresh completion. Dispatch yields the architect turn. Acceptance lets Pi produce its normal summary or decide on further work.
- Implementor `blocked`/`done` pauses coding. Terminal reports wait for `agent_settled`, including retry gaps, before triggering main-conversation review. Completion is applied before racing corrections. Successful RPC acknowledgement means **queued**, not acted on. Unknown delivery stops delegation rather than replaying a job.
- Concise reports enter the main conversation as visible, labeled messages. **Routine status is informational:** it stays in history without triggering or queuing an architect model turn. A ping permits the next valid status report to trigger one assessment; further status stays informational. Guide, assign, accept and terminal reports clear the request. Blocked/done, check-ins and genuine failures still wake the architect. A requested status response is not authorization to repeat the delegated job; if nothing is actionable, the architect waits. Use blocked when a decision/intervention is needed. Worker display transcripts are not forwarded. Communication text is capped at 6,000 characters.
- External-job monitoring favors bounded snapshots, observable readiness/capacity criteria, and status followed by yielding. Reporting status then yielding does not cause an immediate idle re-prompt; an unreported exit still warns. Local timeout/abort does not prove remote failure. These are instructions, not tool bans or forced remote cancellation.
- Check-ins measure the current uninterrupted implementation stretch. Done/blocker resets and pauses the clock; acceptance keeps it paused. Resuming guidance starts a full interval in the same cycle. Routine activity, status, pings, model changes and guidance while working do not reset it. Reminders invite judgment, not redundant mandatory pings.
- The pane retains phase/cycle, elapsed time, the check-in progress bar/countdown, implementor activity, provider/model/effort and a muted tmux identity. Transparent borders/colors follow Pi's theme. It remains full-width and tall when idle, adapting to narrow/short terminals while reserving space for native Pi. Times over an hour use `H:MM:SS`; the countdown is **not** an ETA.
- Successful communication is compact, empty thinking markers are hidden, and ordinary output/errors remain visible. Logs are sanitized and bounded. Main Pi's native footer/editor retain architect model, thinking, context and usage indicators (main-session usage, not aggregated worker usage).

## Tokens and estimated cost

The pane header shows **Architect**, **Implementor** and combined **Total** usage for the current `/pair-enable` run. `/pair-usage` shows exact token counts split into input, output, cache read and cache write, plus each role's estimated cost. This command works in TUI/RPC, makes no model call and adds nothing to model context.

- Totals start at enable, accumulate across assignments, corrections and model/effort changes, and reset on the next enable. They are in-memory only. After disable, `/pair-usage` retains the last run until re-enable, reload or session replacement.
- Count finalized assistant responses (including failed/aborted responses with reported usage), tool results with nested model usage, and reported successful compaction usage. Streaming snapshots and tool-execution previews are not counted again. Compaction does not erase prior totals.
- Token totals include cache tokens. Reasoning tokens are already in output; one-hour cache writes are already in cache writes. These are cumulative usage, **not context-window occupancy**.
- Missing/invalid data is labelled `n/a`; partial known totals are marked `≥`. A valid reported zero remains zero. In-flight/unreported work, background cache warming and branch-summary calls are outside these totals. Calls cut off by disable or transport failure may have unreported usage.
- Dollar amounts use Pi's reported model-price estimates, **not billing or subscription charges**. Missing/zero model prices may yield zero estimated cost even when tokens were used. Model switches retain the amounts recorded at the time; earlier usage is never repriced.
- Native Pi footer and `/cost` accounting are unchanged: they cover the main session, not the worker. Do not add the pair total to native Pi totals—the architect usage overlaps. The separate combined pair total avoids double-counting.

To apply the guard/configuration and usage display to an existing session, wait for a safe handoff, then `/pair-disable`, `/reload`, and `/pair-enable`. This stops the old worker and loses its private in-memory context; the main conversation remains. Existing workers are not modified in place.

## Inspect and clean up

The implementor's tmux session mirrors sanitized text, handoffs, tool activity and errors; it is not a second interactive Pi editor. Use the session name from the pane's bottom border:

```sh
tmux -L pi-ai list-sessions
tmux -L pi-ai attach-session -r -t 'ai-KEY-implementor'
tmux -L pi-ai capture-pane -p -J -t 'ai-KEY-implementor:0.0' -S -200
```

Use read-only attachment for inspection. Disable/quit/reload/session replacement stops only owned workers and their process trees. Heartbeat leases, a bridge-death watchdog and selective orphan cleanup cover failures, including stale legacy architect sessions. Runtime files are private under `/tmp/pi-ai-<uid>/`; no worker transcript is persisted to disk by this extension.

Pi owns model retries. Exhaustion warns without discarding worker context; guide/ping it or change its model. Transport failures stop the implementor, remove delegation and notify the main conversation, which remains usable. Verify files and remote state before resubmitting uncertain work. Cleanup is best-effort under OS failure or deliberately escaped processes.

## Development

```sh
npm ci --ignore-scripts
npm run typecheck
npm test        # synthetic models; real tmux/processes and native Pi tool/review loops; no model API calls
npm run smoke   # real configured models: startup, native setters, one worker, switch/reset/shutdown; zero model turns
```

Tests cover native controls/context, real report-driven review/correction turns, informational progress without extra model turns, one-shot requested status, current-state refresh, context isolation, report ordering/retries, cancellation, timers, responsive themes/layouts, model rollback and process cleanup. Synthetic-model tests also verify implementor loop-guard warning/abort thresholds and exact per-role usage with unchanged native totals; unit tests cover partial/missing usage, caching, compaction, model changes and stale worker events. Paid-model reasoning quality is not tested.
