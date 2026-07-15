# goalseek

An iterative, manager-supervised **goal-seeking loop**, run entirely inside pi.

The top-level pi session is the **manager**. Each iteration it spawns an **ephemeral child
`pi` process** (a *worker*) with a completely **fresh context**. The worker reads durable
state from disk, does one unit of work, verifies it, logs progress, and exits. The manager
then makes its **own LLM call** to review what the worker actually did, adapt the plan, and
steer the next worker.

Unlike a blind `while :; do cat PROMPT.md | pi -p; done`, Goalseek reasons about the
trajectory and explicitly decides whether to continue, redirect, or stop.

## Install / location

```
~/.pi/agent/extensions/goalseek/index.ts   # persistent, survives pi updates
```
Auto-discovered on startup. `/reload` picks up changes in a running session.

## Migrating existing state

This is a clean command rename; the old slash commands are not retained as aliases. To resume
state created under the previous name, rename its directory before starting Goalseek:

```bash
mv .ralph .goalseek
```

Also update any `.gitignore` entry and customized prompt strings in `settings.json` that refer
to the old state path.

## Usage

```
/goalseek <goal>              # start (writes .goalseek/GOAL.md and begins)
/goalseek                     # resume the existing goal or paused loop
/goalseek-stop                # stop and discard pause state
/goalseek-pause               # pause, kill current work, and save resume state
/goalseek-resume              # resume .goalseek/pause.json
/goalseek-set                 # show all current live settings
/goalseek-set <key> <value>   # update a setting mid-loop (no restart)
/goalseek-set <key> @<file>   # load a setting value from a file (useful for prompts)
/goalseek-set reload          # reload settings from .goalseek/settings.json
/goalseek-set save            # persist current in-memory settings to disk
```

Settings are loaded from `.goalseek/settings.json` on `/goalseek` start and can be
changed at any time via `/goalseek-set` — the loop reads the live values each
iteration, so changes take effect immediately without restarting. Simple
settings (numbers, booleans, arrays) are auto-persisted; prompt strings
(`workerPrompt`, `managerInitSys`, `managerReviewSys`) are live-only until
you run `/goalseek-set save` or edit `.goalseek/settings.json` directly and reload.

Available settings:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `maxIterations` | number | 1000 | Max loop iterations before forced stop |
| `maxConsecutiveFails` | number | 5 | Consecutive worker crashes before giving up |
| `noProgressLimit` | number | 3 | Git-no-change iterations before convergence |
| `workerTimeoutMs` | number | 2700000 (45m) | Per-worker wall-clock timeout |
| `diffBudget` | number | 6000 | Max chars of diff shown to the manager |
| `recentActions` | number | 6 | Lines in the live monitor box |
| `boxMinWidth` | number | 56 | Minimum monitor width |
| `boxMaxWidth` | number | 160 | Maximum monitor width |
| `spinnerFrames` | string[] | _(braille spinner)_ | Monitor animation frames |
| `requiredGuards` | string[] | ["protected-write-paths.ts"] | Extension filenames that must resolve (warn if missing) |
| `excludedExtensionNames` | string[] | ["goalseek", "work-plan", "todo-queue.ts"] | Extensions excluded from workers |
| `progressTailBytes` | number | 16000 | Bytes read from end of progress.md |
| `workerPrompt` | string | _(long prompt)_ | System prompt for each worker pi |
| `managerInitSys` | string | _(long prompt)_ | System prompt for initial planning |
| `managerReviewSys` | string | _(long prompt)_ | System prompt for iteration review |

Multi-line string settings like `workerPrompt` are best set by writing the
new content to a file, then running `/goalseek-set workerPrompt @my-prompt.md`.

A live monitor box above the editor shows phase (planning / working / reviewing), iteration,
elapsed time, and a rolling feed of the current worker's tool calls.

Requires a model selected in the session (the manager uses it to review each iteration).

## How each iteration works

1. **Plan (once, up front):** the manager reads the goal + repo and writes `.goalseek/plan.md`.
2. **Work:** a fresh child `pi` runs a fixed prompt — reads `GOAL.md`, `plan.md`,
   `steering.md`, `progress.md`, does the single most valuable next unit, verifies it
   (build/tests), appends to `progress.md`, commits.
3. **Review:** the manager makes an LLM call over the goal + plan + recent progress + the
   worker's **git diff**, and returns a verdict: `advancing | thrashing | stuck | complete`,
   an updated `plan.md`, optional `steering.md` for the next worker, and `continue | stop`.

## Durable state (files, not conversation)

```
.goalseek/GOAL.md       the objective (human-set)
.goalseek/plan.md       the manager's living, prioritized plan
.goalseek/progress.md   the workers' running log (their memory)
.goalseek/manager.md    the manager's review/audit trail
.goalseek/steering.md   a one-off directive for the next worker
.goalseek/pause.json    persisted pause/resume state
.goalseek/settings.json live-mutable settings
.goalseek/logs/         raw per-iteration worker event streams (jsonl + stderr)
```

## When it stops (and when it does NOT)

A **worker can never self-declare "done"** and stop the loop; that caused premature completion
in earlier designs. The loop stops only on:

- **manager verdict** `stop` (`complete` after verifying, or `stuck`/`thrashing` beyond repair),
- **/goalseek-stop**,
- **convergence** — `noProgressLimit` (3) iterations in a row with no real git changes
  (excluding `.goalseek/`),
- **too many failures** — `maxConsecutiveFails` (5) worker crashes/timeouts in a row,
- **the cap** — `maxIterations` (1000).

## Design notes / caveats

- **Workers use fresh processes** (`pi --mode json -a --no-extensions`). Automatic extension
  discovery is off; eligible global and project extensions are loaded explicitly via `-e`, while
  `excludedExtensionNames` are omitted. Missing `requiredGuards` produce a warning. Workers use
  the **same model** as the parent session.
- **Per-worker timeout** (`workerTimeoutMs`, 45m) kills a hung worker (bench/build-heavy tasks
  can be slow).
- **Durable-memory backstop:** if a worker forgets to write `progress.md`, its final summary is
  auto-captured there, and the manager review is always handed the worker's own summary too — so
  work that lands in `.goalseek/` (excluded from the git diff) is never invisible to the manager.
- **Convergence defers to the manager:** a no-git-change iteration only counts toward convergence
  when the manager isn't reporting `advancing`, so legitimate analysis/baseline iterations don't
  trip a premature stop.
- **Cost:** two LLM interactions per iteration (worker + manager review). That's the price of
  the manager being smart.
- **Convergence detection needs git.** In a non-git directory it can't tell "no changes", so
  rely on the manager verdict / `/goalseek-stop` / the cap.
- Run it in a **git repo** — the manager reviews diffs, and commits give you rollback + audit.

Tune settings live with `/goalseek-set` or persist them in `.goalseek/settings.json`.
