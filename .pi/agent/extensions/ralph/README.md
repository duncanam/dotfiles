# ralph

An autonomous **"Ralph Wiggum" loop with a smart manager**, run entirely inside pi.

The top-level pi session is the **manager**. Each iteration it spawns an **ephemeral child
`pi` process** (a *worker*) with a completely **fresh context**. The worker reads durable
state from disk, does one unit of work, verifies it, logs progress, and exits. The manager
then makes its **own LLM call** to review what the worker actually did and steer the next one.

This is what makes it better than `while :; do cat PROMPT.md | pi -p; done`: the parent
*reasons about the trajectory* instead of blindly repeating.

## Install / location

```
~/.pi/agent/extensions/ralph/index.ts   # persistent, survives pi updates
```
Auto-discovered on startup. `/reload` picks up changes in a running session.

## Usage

```
/ralph <goal>     # start (writes .ralph/GOAL.md and begins)
/ralph            # resume the existing goal (uses .ralph/GOAL.md + progress)
/ralph-stop       # stop the loop and kill the current worker
/ralph-set        # show all current live settings
/ralph-set <key> <value>   # update a setting mid-loop (no restart)
/ralph-set <key> @<file>   # load a setting value from a file (useful for prompts)
/ralph-set reload           # reload settings from .ralph/settings.json
/ralph-set save             # persist current in-memory settings to disk
```

Settings are loaded from `.ralph/settings.json` on `/ralph` start and can be
changed at any time via `/ralph-set` — the loop reads the live values each
iteration, so changes take effect immediately without restarting. Simple
settings (numbers, booleans, arrays) are auto-persisted; prompt strings
(`workerPrompt`, `managerInitSys`, `managerReviewSys`) are live-only until
you run `/ralph-set save` or edit `.ralph/settings.json` directly and reload.

Available settings:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `maxIterations` | number | 1000 | Max loop iterations before forced stop |
| `maxConsecutiveFails` | number | 5 | Consecutive worker crashes before giving up |
| `noProgressLimit` | number | 3 | Git-no-change iterations before convergence |
| `workerTimeoutMs` | number | 2700000 (45m) | Per-worker wall-clock timeout |
| `diffBudget` | number | 6000 | Max chars of diff shown to the manager |
| `recentActions` | number | 6 | Lines in the live monitor box |
| `requiredGuards` | string[] | ["protected-write-paths.ts"] | Extensions loaded in workers |
| `excludedExtensionNames` | string[] | ["ralph", "work-plan"] | Extensions excluded from workers |
| `progressTailBytes` | number | 16000 | Bytes read from end of progress.md |
| `workerPrompt` | string | _(long prompt)_ | System prompt for each worker pi |
| `managerInitSys` | string | _(long prompt)_ | System prompt for initial planning |
| `managerReviewSys` | string | _(long prompt)_ | System prompt for iteration review |

Multi-line string settings like `workerPrompt` are best set by writing the
new content to a file, then running `/ralph-set workerPrompt @my-prompt.md`.

A live monitor box above the editor shows phase (planning / working / reviewing), iteration,
elapsed time, and a rolling feed of the current worker's tool calls.

Requires a model selected in the session (the manager uses it to review each iteration).

## How each iteration works

1. **Plan (once, up front):** the manager reads the goal + repo and writes `.ralph/plan.md`.
2. **Work:** a fresh child `pi` runs a fixed prompt — reads `GOAL.md`, `plan.md`,
   `steering.md`, `progress.md`, does the single most valuable next unit, verifies it
   (build/tests), appends to `progress.md`, commits.
3. **Review:** the manager makes an LLM call over the goal + plan + recent progress + the
   worker's **git diff**, and returns a verdict: `advancing | thrashing | stuck | complete`,
   an updated `plan.md`, optional `steering.md` for the next worker, and `continue | stop`.

## Durable state (files, not conversation)

```
.ralph/GOAL.md       the objective (human-set)
.ralph/plan.md       the manager's living, prioritized plan
.ralph/progress.md   the workers' running log (their memory)
.ralph/manager.md    the manager's review/audit trail
.ralph/steering.md   a one-off directive for the next worker
.ralph/logs/         raw per-iteration worker event streams (jsonl + stderr)
```

## When it stops (and when it does NOT)

Faithful to Ralph, a **worker can never self-declare "done"** and stop the loop (that caused
premature completion in earlier designs). The loop stops only on:

- **manager verdict** `stop` (`complete` after verifying, or `stuck`/`thrashing` beyond repair),
- **/ralph-stop**,
- **convergence** — `NO_PROGRESS_LIMIT` (3) iterations in a row with no real git changes
  (excluding `.ralph/`),
- **too many failures** — `MAX_CONSECUTIVE_FAILS` (5) worker crashes/timeouts in a row,
- **the cap** — `MAX_ITERATIONS` (1000).

## Design notes / caveats

- **Workers run lean** (`pi --mode json -a --no-extensions`): a fresh process each time with
  discovery off (so unrelated extensions can't hang a non-interactive worker, and cold start is
  faster). Safety guards are still loaded **explicitly** via `-e` — currently
  `protected-write-paths` (headless-safe: it blocks without prompting). Add more in the
  `WORKER_EXTENSIONS` list at the top of `index.ts` (e.g. `protected-read-paths.ts`). Workers
  use the **same model** as the parent session.
- **Per-worker timeout** (`WORKER_TIMEOUT_MS`, 45m) kills a hung worker (bench/build-heavy tasks
  can be slow).
- **Durable-memory backstop:** if a worker forgets to write `progress.md`, its final summary is
  auto-captured there, and the manager review is always handed the worker's own summary too — so
  work that lands in `.ralph/` (excluded from the git diff) is never invisible to the manager.
- **Convergence defers to the manager:** a no-git-change iteration only counts toward convergence
  when the manager isn't reporting `advancing`, so legitimate analysis/baseline iterations don't
  trip a premature stop.
- **Cost:** two LLM interactions per iteration (worker + manager review). That's the price of
  the manager being smart.
- **Convergence detection needs git.** In a non-git directory it can't tell "no changes", so
  rely on the manager verdict / `/ralph-stop` / the cap.
- Run it in a **git repo** — the manager reviews diffs, and commits give you rollback + audit.

Tune the constants at the top of `index.ts`.
