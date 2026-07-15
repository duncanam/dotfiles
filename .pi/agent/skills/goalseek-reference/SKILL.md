---
name: goalseek-reference
description: >-
  Reference for the specific Goalseek extension for pi: its manager-worker
  architecture, /goalseek commands, .goalseek state, settings, and termination
  behavior. Use only when the user explicitly mentions Goalseek, /goalseek, or
  .goalseek, or clearly asks to operate or debug this installed extension.
---

# Goalseek — reference

Goalseek is a **pi extension** (`~/.pi/agent/extensions/goalseek/index.ts`, auto-discovered)
that implements an iterative, manager-supervised goal-seeking loop.

## Architecture

- **Manager** = the parent pi session. It plans, reviews each iteration,
  and steers the next worker.
- **Workers** = ephemeral child `pi` processes spawned with
  `--mode json -a --no-extensions` (lean, fresh context every time).
  Workers read durable state from disk, do one unit of work, verify it,
  log to `.goalseek/progress.md`, commit, and exit.
- After each worker, the **manager runs its own LLM call** to review the
  worker's git diff and progress, producing a verdict
  (`advancing | thrashing | stuck | complete`) and updated plan/steering.

## When the loop stops

Only the manager (or `/goalseek-stop`, or convergence, or the cap) can stop
the loop — a worker can **never** self-declare "done".

- Manager verdict `stop` (complete, stuck, thrashing beyond repair)
- `/goalseek-stop`
- No git changes for `noProgressLimit` (default 3) consecutive iterations
- Too many consecutive worker failures (default 5)
- `maxIterations` cap (default 1000)

## Durable state (files, not conversation)

```
.goalseek/GOAL.md       the objective (human-set)
.goalseek/plan.md       the manager's living, prioritized plan
.goalseek/progress.md   the workers' running log (their memory)
.goalseek/manager.md    the manager's review/audit trail
.goalseek/steering.md   a one-off directive for the next worker
.goalseek/pause.json    persisted pause/resume state
.goalseek/logs/         raw per-iteration worker event streams (jsonl + stderr)
.goalseek/settings.json live-mutable settings
```

## Commands

| Command | Action |
|---------|--------|
| `/goalseek <goal>` | Start a new Goalseek loop |
| `/goalseek` | Resume existing goal from `.goalseek/GOAL.md` |
| `/goalseek-stop` | Stop the loop and kill the current worker |
| `/goalseek-pause` | Pause the loop and persist resume state |
| `/goalseek-resume` | Resume from `.goalseek/pause.json` |
| `/goalseek-set` | Show all settings |
| `/goalseek-set <key> <value>` | Change a setting mid-loop |
| `/goalseek-set <key> @<file>` | Load a setting from a file |
| `/goalseek-set reload` | Reload from `.goalseek/settings.json` |
| `/goalseek-set save` | Persist in-memory settings to disk |

## Key design notes

- Workers use the **same model** as the parent session.
- Workers disable automatic extension discovery, then explicitly load eligible
  global and project extensions; configured exclusions are omitted.
- Cost: **two LLM calls per iteration** (worker + manager review).
- Settings are live-mutable with `/goalseek-set` — no restart needed.
- Convergence detection relies on **git**. In a non-git repo, it falls
  back to the manager verdict and the iteration cap.
