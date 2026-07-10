---
name: ralph-reference
description: >-
  Reference context for the Ralph autonomous coding loop extension for pi.
  Covers architecture (manager + worker), commands (/ralph, /ralph-stop,
  /ralph-set), durable state files, loop termination conditions, and design
  notes. Use when the user mentions Ralph, the /ralph command, autonomous
  coding loops, or manager-worker patterns inside pi.
---

# Ralph — reference

Ralph is a **pi extension** (`~/.pi/agent/extensions/ralph/index.ts`, auto-discovered)
that implements an autonomous "Ralph Wiggum" loop.

## Architecture

- **Manager** = the parent pi session. It plans, reviews each iteration,
  and steers the next worker.
- **Workers** = ephemeral child `pi` processes spawned with
  `--mode json -a --no-extensions` (lean, fresh context every time).
  Workers read durable state from disk, do one unit of work, verify it,
  log to `.ralph/progress.md`, commit, and exit.
- After each worker, the **manager runs its own LLM call** to review the
  worker's git diff and progress, producing a verdict
  (`advancing | thrashing | stuck | complete`) and updated plan/steering.

## When the loop stops

Only the manager (or `/ralph-stop`, or convergence, or the cap) can stop
the loop — a worker can **never** self-declare "done".

- Manager verdict `stop` (complete, stuck, thrashing beyond repair)
- `/ralph-stop`
- No git changes for `noProgressLimit` (default 3) consecutive iterations
- Too many consecutive worker failures (default 5)
- `maxIterations` cap (default 1000)

## Durable state (files, not conversation)

```
.ralph/GOAL.md       the objective (human-set)
.ralph/plan.md       the manager's living, prioritized plan
.ralph/progress.md   the workers' running log (their memory)
.ralph/manager.md    the manager's review/audit trail
.ralph/steering.md   a one-off directive for the next worker
.ralph/logs/         raw per-iteration worker event streams (jsonl + stderr)
.ralph/settings.json live-mutable settings
```

## Commands

| Command | Action |
|---------|--------|
| `/ralph <goal>` | Start a new Ralph loop |
| `/ralph` | Resume existing goal from `.ralph/GOAL.md` |
| `/ralph-stop` | Stop the loop and kill the current worker |
| `/ralph-set` | Show all settings |
| `/ralph-set <key> <value>` | Change a setting mid-loop |
| `/ralph-set <key> @<file>` | Load a setting from a file |
| `/ralph-set reload` | Reload from `.ralph/settings.json` |
| `/ralph-set save` | Persist in-memory settings to disk |

## Key design notes

- Workers use the **same model** as the parent session.
- Workers explicitly load safety guards (`protected-write-paths`) even
  though discovery is off — they are not fully unconstrained.
- Cost: **two LLM calls per iteration** (worker + manager review).
- Settings are live-mutable with `/ralph-set` — no restart needed.
- Convergence detection relies on **git**. In a non-git repo, it falls
  back to the manager verdict and the iteration cap.
