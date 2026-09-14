# Architect / Implementor for Pi

Two long-lived, asynchronous Pi workers in tmux, with a side-by-side live log widget above the parent editor. **The parent model does not participate.** Designed and tested with Pi **0.85.1**, Node 25, and tmux on macOS; Unix-only (not tested on Linux).

## Use

This directory is installed at `~/.pi/agent/extensions/architect-implementor/` through the existing dotfiles symlink. There are no additional runtime dependencies beyond Pi and Node; dependency installation is only needed for development/tests.

Configuration: **`~/.pi/agent/architect-implementor.json`**, or `$PI_CODING_AGENT_DIR/architect-implementor.json`. This is a separate extension-specific file; Pi's main `settings.json` is unchanged. The file is strict JSON (no comments or trailing commas), re-read on each enable; project-local configuration is intentionally not loaded. Copy `architect-implementor.example.json` if needed. Models must be exact provider/model IDs available to your Pi account. Existing Pi authentication is reused; credentials are not copied into config files.

The previous local YAML configuration was converted and preserved as `architect-implementor.yaml.bak`; only the JSON file is now read. JSON does not preserve comments; configuration guidance and check examples are documented here instead.

Current local configuration:

| Role | Provider/model | Reasoning effort |
|---|---|---|
| Architect | `openai-codex/gpt-5.6-sol` | `high` |
| Implementor | `openai-codex/gpt-5.6-luna` | `max` |

Each role has independent `provider`, `model`, and `thinking`. Effort supports Pi's `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`, **only where the selected model supports it**. Startup checks both selected model and effective effort. Unsupported effort fails with a clear error; it never silently downgrades.

In interactive Pi:

```text
/reload
/pair-enable Implement the authentication change described below
...type more feedback at any time...
/pair-disable
```

`/pair-enable` without a task starts both workers but makes no model request until you send feedback. The user-facing extension commands are `/pair-enable`, `/pair-disable`, and `/pair-models`. Workflow status is shown continuously in the UI, not through a separate status command. Normal submitted text, `!shell` text, and non-pair slash commands become architect feedback, rather than running in the parent. `/pair-enable`, `/pair-disable`, `/pair-models`, `/reload`, and `/quit` remain host commands. Disable the pair to use other host slash commands normally. Pi's application keyboard shortcuts still belong to Pi; intentionally switching/resuming a parent session through those is not intercepted.

Disable other autonomous parent extensions (such as TODO runners) before enabling. Extension-injected user prompts are suppressed, but third-party extensions have full process access and can independently mutate sessions or inject custom messages outside the editor/input hooks; this extension cannot globally sandbox them.

**Lifecycle:** each role uses the same Pi process and conversation for every task/review cycle while enabled. Pi's normal automatic compaction handles long context. There is no per-task respawn/reset. `/pair-disable` kills both tmux sessions and process trees; `/pair-enable` thereafter creates a **fresh pair**, not a resumed workflow. Worker conversations are in memory (`--no-session`), not saved or copied into the parent. Disable discards pending worker feedback/history; it does not undo code changes. Parent session/model/tools are never copied or changed by the extension.

## One-off models and efforts

Use **`/pair-models`** for a role → model → effort picker. Escape cancels without changing anything. You can also specify a role or use direct arguments:

```text
/pair-models architect
/pair-models architect openai-codex/gpt-5.6-sol max
/pair-models implementor openai-codex/gpt-5.6-luna high
/pair-models architect high
/pair-models architect reset
```

- Full selections require an exact `provider/model` and effort. An effort alone keeps the role's current model. `ROLE reset` restores that role's model/effort from JSON, without reloading tools or other settings.
- Before enable, selections are staged for the next pair. While enabled, they apply to the existing worker at its next **fully settled** boundary, including retries/compaction—not in the middle of tools. The command returns immediately; that role shows `model queued` until the change completes. Already-running work is not interrupted.
- Feedback/handoffs to that role queue behind the switch. A busy-worker wait expires after 10 minutes with the previous selection retained. Duplicate pending changes for the same role are rejected; startup must finish before changing a live pair.
- Changes preserve worker processes, conversation contexts, role policies and assignment/check-in clocks. They last for the current enabled pair, across tasks, until reset or disable. **Disable/reload/session replacement clears all overrides**, including choices staged before enable.
- Neither the extension JSON nor Pi's `settings.json`, parent model, or parent conversation is changed. No model prompt is generated by this command. The pane metadata updates only after the worker confirms its exact model/effort.
- The live picker lists the selected worker's available models; before enable it uses the parent's available catalogue (not its model scope). Worker startup is authoritative for staged choices. Effort choices are checked against the selected worker model: unsupported choices are rejected, not silently downgraded. A rejected live change restores the previous model/effort; uncertain setters or failed rollback stop the pair rather than running with an unknown selection.

## Workflow

- Architect observes initial files/diff, chooses architecture and acceptance criteria, then uses `ai_directive assign`.
- Implementor owns local coding decisions, edits/tests, and uses `ai_report status`, `blocked`, or `done`.
- A blocker pauses implementation pending `guide` or a revised `assign` from the architect. Completion also pauses it.
- Terminal handoffs wait for `agent_settled`, so review does not race unfinished worker tool calls/retries/queued continuations. Communication calls must be alone in their tool-call batch.
- Architect reviews actual artifacts: staged/unstaged diff, status including untracked paths, file reads, and configured checks. Acceptance is rejected until **fresh `changes` plus `read` or `check` inspection** occurs after the completion report. This enforces evidence gathering, not the correctness of the model's judgment.
- Acceptance leaves the pair enabled and idle, ready for another task or `/pair-disable`.

Only explicitly structured messages, capped at 6,000 characters, cross roles. UI logs/thinking/tool results are display-only bounded tails, never forwarded wholesale. No `get_messages`, `get_entries`, log-read, or tmux-inspection tool is available to the architect. An idle implementor is **not** inferred to be done.

The timer defaults to **600 seconds from assignment start**. Tool calls, model turns, user feedback, pings, and status reports do not reset it. Further reminders stay anchored to that cycle's original start. Only a new explicit `assign` starts a new timer/cycle. Blocked/review/accepted phases do not generate reminders; same-cycle `guide` resumes the original timer. Reminders wake the architect to ping or intervene. Steering is delivered at Pi tool/turn boundaries, not in the middle of a running tool.

## Tools, extensions, and checks

Child extension, skill, prompt, and theme discovery is disabled. Project resource trust is explicitly disabled (`--no-approve`); normal global/ancestor `AGENTS.md` context remains loaded. Child roles receive an appended role policy. Only the role's explicit extension and skill paths load; paths are relative to the JSON file, with absolute paths and `~/` supported. Avoid automation/orchestration/UI-only extensions inside either worker.

- **Architect:** `ai_directive`, `ai_inspect` only by default. Inspection offers bounded file reads, directory listing, staged/unstaged Git diff/status, and named checks. No general Bash or edit/write tools. File reads canonicalize paths and reject traversal/symlink escapes outside the working directory, private runtime files, Pi session history/authentication, and raw `.git` internals. Changes can include pre-existing user edits; the architect is told to compare against its initial observation. Non-Git workspaces require file/check inspection and an explicit verification limitation.
- **Implementor:** `read`, `write`, `edit`, `bash`, `ai_report`. The installed config explicitly retains your source-control, search, and protected-path policies plus Context7 and its two tool names. No TODO/Goalseek/agent-manager/other UI automation is loaded automatically.
- `extraTools` explicitly enables tool names supplied by selected extensions. Architect extras require `allowUnsafeTools: true` because those tools may bypass its restrictions. Missing tools fail startup.

For independent test runs or endpoint probes, set the **fixed, trusted commands** in the JSON configuration's `checks` property (retain the other settings):

```json
{
  "checks": {
    "tests": {
      "command": "npm test",
      "timeoutSeconds": 120
    },
    "health": {
      "command": "curl --fail --max-time 10 http://localhost:3000/health",
      "timeoutSeconds": 15
    }
  }
}
```

Then the architect can use `ai_inspect` with `kind: check, check: tests`. It cannot supply arbitrary shell arguments. Check commands run in the workflow's working directory and default to a 60-second timeout. They are disabled by default.

**Trust boundary:** this is capability separation, **not an OS sandbox**. User-selected extensions execute arbitrary code. Fixed check commands can run repository-controlled test code, which can mutate files or read private state. The implementor's Bash also has normal user privileges. Do not enable unsafe architect extras or checks if you need strict no-write/no-history isolation; use an external sandbox for untrusted code. Protecting against malicious workers, same-user processes, hard-link/race attacks, or user-supplied scripts is outside this extension's guarantee.

## UI and cleanup

The header shows the workflow phase/cycle and, during implementation, elapsed time and the next check-in countdown. The footer contains only lifecycle, input routing, and the disable command rather than duplicating the header. The countdown refreshes once per second without resetting the cycle timer. Failed/stopping states override stale activity indicators; blocked/reviewing implementors are explicitly labeled paused.

Panes use the terminal's own background: continuous, quiet borders; role accents and distinct icons (◇ Architect, ○ Implementor) in the titles; status labels adjacent to the titles; and separate model/effort metadata. User feedback, thinking, tools, handoffs and errors remain differentiated. Routine startup paths, readiness messages and decorative LIVE FEED labels are omitted. Each pane's tmux session name appears in muted text inline with its bottom border, without taking a log row or entering model context. Names truncate with an ellipsis on narrow terminals; `tmux -L pi-ai list-sessions` lists the full names. Errors and permission warnings remain visible. A labeled CHECK-IN bar represents time to the next scheduled reminder—not estimated task completion—and does not affect scheduling.

The panes use the full terminal width, split 50/50 around a small gutter. Both retain their `paneLines: 18` height even when idle. That budget adapts to terminal height; terminals under 60 columns use stacked panes. Very short layouts omit metadata to preserve log space. Logs are sanitized for terminal control sequences and bounded to 60,000 characters per role. These are live tails, not full scrollable transcripts. No raw transcripts are persisted by this extension.

Workers use a dedicated tmux server (`tmux -L pi-ai`), with session names `ai-<24-hex-hash>-architect` / `...-implementor`. The hash includes parent session ID, PID and a random nonce, preventing collisions across concurrent parents/enables. No unrelated/default tmux server or session is killed.

Cleanup has several layers:

1. Idempotent disable/shutdown hooks on quit, reload, and parent session replacement.
2. Each tmux bridge watches its private authenticated Unix socket and a 20-second heartbeat lease. Parent crash/disconnect/freeze stops the Pi child and captured descendant process trees, including detached Bash groups.
3. Worker extension watchdog detects bridge reparenting/death and aborts/shuts down the worker too.
4. Startup/enabling reaps exact stale pair names using leases older than 60 seconds in the mode-0700 `/tmp/pi-ai-<uid>/` namespace. Active leases and unrelated tmux sessions are left alone. Tokens/config metadata are mode-0600 and removed on normal stop, or during orphan reap.

TERM escalates to KILL after a grace period; disable awaits cleanup. On transport failure the mode stays **failed/intercepting**, so new input cannot accidentally activate the parent. `/pair-disable` restores input. SIGKILL of every supervisor simultaneously, kernel failure, uninterruptible tasks, or deliberately daemonized/reparented descendants cannot be guaranteed clean by an in-process extension. Never interpret session hashing as a security boundary.

## Development and verification

```sh
npm ci --ignore-scripts
npm run typecheck
npm test          # mock models, real tmux/process lifecycle; no API/model calls
npm run smoke    # configured real Pi startup, tools and effort; no model prompts
```

Tests cover JSON configuration/effort, parser errors and config-relative paths, cycle clocks, review evidence, stale/overlapping handoffs, private-path policies, UTF-8 JSONL framing, terminal width/height budgets, dark/light theme rendering and sanitization, live lifecycle/cycle/countdown status, command registration, temporary overrides/picker cancellation, settled-boundary model switches and rollback, editor routing, worker pause gates, a two-task integration preserving both conversations, RPC/UI correlation, parent SIGKILL, lease expiry, startup rollback, and selective orphan cleanup. Real Pi RPC startup and an interactive tmux TUI enable/panes/disable smoke were also verified without model calls. Actual frontier/implementor reasoning quality and paid end-to-end execution have not been tested.

Files: `index.ts` parent integration; `editor.ts`/`ui.ts` display and routing; `worker.ts` role tools/policies; `engine.mjs` pure protocol/cycle state; `transport.mjs`/`bridge.mjs` process ownership; `config.mjs` JSON validation; `models.ts` one-off model command parsing/picker; `inspect.mjs` scoped observation; `wire.mjs` bounded LF-only JSONL.
