# pi-loop

Autonomous, **unsupervised** work loop for [pi](https://pi.dev) — a Claude-Code-style
"keep going until it's done" loop. Give it a goal and it keeps the agent working turn after
turn, fully unattended, until the goal is verifiably complete. It never stops to ask
questions.

Inspired by the "Ralph Wiggum" / Stop-hook re-injection loops people run with Claude Code,
implemented natively on pi's extension events.

## Install / location

This is a **user extension** and lives in a persistent, user-owned location that survives
`pi update` and reinstalls:

```
~/.pi/agent/extensions/pi-loop/index.ts
```

Nothing needs to be added to the pi package itself (files inside the npm package are wiped
on update). pi auto-discovers `~/.pi/agent/extensions/*/index.ts` at startup. If pi is
already running, `/reload` picks it up.

A companion skill lives at `~/.pi/agent/skills/autonomous-loop/` and documents the
methodology; it's optional but improves discoverability.

## Usage

```
/loop [--max=N] [--minutes=N] [--compact=R] [--exit] <goal>
/loop-stop      # stop the active loop
```

Examples:

```
/loop implement the CSV export feature and make all tests pass
/loop --max=100 --exit migrate the suite from mocha to vitest; build and tests must be green
/loop --minutes=30 fix every eslint error in src/ without changing behaviour
```

Start the loop from an **idle** session (not mid-response). Progress appears automatically
in a live monitor box above the editor (see below); use `/loop-stop` to end early.

### Flags

| Flag          | Default | Meaning                                                                 |
| ------------- | ------- | ----------------------------------------------------------------------- |
| `--max=N`     | `50`    | Hard cap on iterations (turns).                                         |
| `--minutes=N` | none    | Wall-clock budget; the loop stops after N minutes.                      |
| `--compact=R` | `0.75`  | Auto-compact context when usage ≥ `R × contextWindow` (`0 < R < 1`).    |
| `--exit`      | off     | Shut pi down when the loop terminates (great for unattended runs).      |

## How it works

1. `/loop <goal>` sends a kickoff prompt that puts the agent in autonomous mode (make
   reasonable assumptions, act, verify, never ask questions).
2. After each agent turn (`agent_end`), the extension waits for the agent to become **idle**
   and then sends a normal "continue" user message (`pi.sendUserMessage(...)`), which starts
   exactly one new turn. Waiting for idle (rather than queuing a `followUp`) keeps the loop
   self-serializing — one turn at a time, with no message pileup.
3. The agent signals it's finished by calling the **`loop_done`** tool (with a summary), or
   reports a permanent blocker with **`loop_blocked`**. A `LOOP_DONE` / `LOOP_BLOCKED`
   sentinel in the final message is also honoured as a fallback.
4. Context is auto-compacted when it grows past the threshold so long runs don't exhaust the
   window (the GOAL and progress are preserved across compaction).

## Guardrails (so it terminates)

The loop stops on the first of:

- **Done** — `loop_done` called (or `LOOP_DONE` sentinel).
- **Blocked** — `loop_blocked` called (or `LOOP_BLOCKED` sentinel).
- **Max iterations** — `--max` reached (default 50).
- **Time budget** — `--minutes` elapsed.
- **Stall** — identical final output 3 turns in a row.
- **No progress** — 4 turns in a row with no tool activity.
- **Manual** — `/loop-stop`.

When it ends, a summary line is written to the session log (and shown as a notification in
the TUI). With `--exit`, pi shuts down cleanly.

## Live monitor

While a loop is active, a box is rendered above the editor (`ctx.ui.setWidget`, above-editor
placement) with a spinner, iteration count, current-turn time, total elapsed time, and the
goal:

```
╭─ pi-loop ──────────────────────────────────────────────╮
│ ⠙ iteration 3/50      working                          │
│ this turn 00:42      total 12:37                       │
│ goal  implement the CSV export feature and make all …  │
│ stop with /loop-stop                                   │
╰────────────────────────────────────────────────────────╯
```

A compact `⟳ loop 3/50 12:37` also appears in the footer status.

## Caveats

- Designed for interactive **TUI** (and RPC) sessions. In `--print` (`-p`) mode there's no
  interactive turn loop to re-inject into, so run it from a TUI session (optionally with
  `--exit` for unattended completion).
- It's genuinely unsupervised: it will make assumptions and act on them. Run it in a
  version-controlled repo, and give goals with a **verifiable finish line** ("…and all tests
  pass") for best results.
