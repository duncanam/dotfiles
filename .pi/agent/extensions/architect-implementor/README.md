# Architect / Implementor for Pi

Two long-lived Pi workers in tmux, with live side-by-side panes. The architect leads and delegates; the implementor codes. **The parent model and conversation stay untouched.** Tested with Pi 0.85.1, Node 25 and tmux on macOS; Unix-only, Linux untested.

## Use

```text
/reload
/pair-enable Implement the authentication change described below
...submit feedback to the architect...
/pair-disable
```

Enable without a task starts workers without a model call. While enabled, submitted text, `!shell` and other slash commands route to the architect. Pair commands, `/reload` and `/quit` remain host commands; application keyboard shortcuts still belong to Pi. Disable other autonomous parent extensions before enabling.

Each worker keeps its conversation across tasks until disable. **Disable/reload/session replacement kills the pair and discards worker context and temporary overrides.** Re-enable starts fresh; code changes are not undone.

## Configuration

Use `~/.pi/agent/architect-implementor.json` (or `$PI_CODING_AGENT_DIR/architect-implementor.json`), copied from `architect-implementor.example.json`. Strict JSON is read on every enable; project-local config is not loaded. Pi authentication is reused and `settings.json` is unchanged.

| Role | Provider/model | Effort |
|---|---|---|
| Architect | `openai-codex/gpt-5.6-sol` | `high` |
| Implementor | `openai-codex/gpt-5.6-luna` | `max` |

Top-level settings: `checkinSeconds` (600), `paneLines` (22), `piCommand` (`pi`), `architect` and `implementor`. Each role has independent `provider`, `model`, `thinking`, `extensions`, `skills` and `extraTools`. Resource paths are relative to the config file; absolute paths and `~/` work. Unsupported model/effort selections fail rather than silently downgrade. Old `checks` and `allowUnsafeTools` settings have been removed.

Both workers have normal **read, write, edit and Bash** tools. Their only custom tools are `ai_directive` (architect) and `ai_report` (implementor). Use ordinary tools for file inspection, tests, GitHub and research—not pair-specific wrappers. Delegation and review are role instructions, not a read-only sandbox or mandatory inspection sequence.

The installed roles share your source-control, search and protected-path extensions, source-control skill and Context7 tools. Your normal policies still apply, including read-only Git/`gh` access. Only explicitly configured extensions/skills load; automatic discovery and project resource approval are disabled, while ancestor/global `AGENTS.md` context remains. Keep other orchestration/UI extensions out of workers. Missing configured tools fail startup; Pi handles tool availability thereafter.

## One-off models

`/pair-models` opens a role/model/effort picker; Escape cancels. Direct forms:

```text
/pair-models architect openai-codex/gpt-5.6-sol max
/pair-models implementor high
/pair-models architect reset
```

An effort alone keeps the model. `ROLE reset` restores that role's model/effort from JSON. Before enable, choices apply to the next pair; while enabled, they update the existing worker without losing context or resetting its task timer. Overrides last until reset or disable, never modifying JSON.

Live changes wait for that worker to fully settle, including retries/compaction. The command returns immediately and shows `model queued`; subsequent feedback/handoffs to that role wait behind the switch. A busy wait expires after ten minutes, and duplicate pending changes for the same role are rejected. Exact model/effort is verified before updating pane metadata; rejected changes roll back, while uncertain setters or failed rollback stop the pair. Startup must finish before changing a live pair. Before enable the picker uses the parent's available catalogue; live it uses the worker's. Worker validation is authoritative.

## Workflow and UI

- Architect assigns jobs with constraints and acceptance criteria; implementor reports status, blockers or completion.
- Blocked/done pauses implementation until guidance or a new assignment. `guide` resumes the same job for review corrections (even after acceptance); `ping` only requests status and leaves coding paused. Acceptance requires a fresh completion, not a prescribed review-tool sequence.
- Communication calls run alone; handoffs wait for `agent_settled`, including model retries. Feedback racing a completion report is queued rather than rejected: the report is applied before feedback resumes work. Multiple queued directives retain their order.
- Check-ins default to 600 seconds of uninterrupted implementation. Completion or a blocker resets and pauses the clock while the implementor awaits architect feedback; acceptance keeps it paused. Resuming with `guide` starts a fresh interval in the same cycle, and a new assignment starts a new cycle. Routine activity, status, pings and guidance while already working do not reset it. The UI's elapsed time/countdown describe the current implementation stretch, not time spent waiting for review.
- Only structured assignments/reports (up to 6,000 characters) cross roles. Display logs are never forwarded wholesale. Separate model contexts are orchestration behavior, not a filesystem security boundary.
- The UI shows phase/cycle/countdown, model/effort, role activity and muted tmux session names in the pane borders. Panes retain full-width 50/50 geometry when idle, stack below 60 columns, and adapt to terminal height. Logs are bounded and sanitized; the countdown measures time to check-in, not task completion.

## Cleanup

Workers use the dedicated `pi-ai` tmux server. `tmux -L pi-ai list-sessions` lists full session names. Disable, quit, reload and session replacement stop owned workers and their process trees, never unrelated sessions. Bridge heartbeat leases, a worker bridge-death watchdog and selective orphan cleanup cover parent/bridge failures. Runtime state lives under `/tmp/pi-ai-<uid>/` with private permissions.

Model-connection retries belong to Pi. If they are exhausted, the UI warns without discarding worker context; send feedback or use `/pair-models` to continue. The pair does not automatically replay a recorded job. Transport/delivery errors stop the pair and leave input intercepted until `/pair-disable`: a missing acknowledgement does not prove the job was undelivered. Cleanup is best-effort under OS failure or deliberately escaped processes. Both workers and configured extensions have normal user privileges; this is not an OS sandbox.

## Development

```sh
npm ci --ignore-scripts
npm run typecheck
npm test        # mock models, real tmux/process lifecycle; no API/model calls
npm run smoke   # real Pi startup and live model switch/restore; zero prompts
```

Tests cover config, delegation/review, completion/feedback races, retry boundaries, uncertain delivery, timers, context continuity, input routing, UI layouts, temporary model overrides, rollback and process cleanup. Paid-model end-to-end reasoning quality has not been tested.
