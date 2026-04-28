# work-plan

Iterative planning workflow for pi: draft a Linear ticket as a markdown
file open in your active Neovim, refine it with the agent, then upload
it to Linear with a single command.

## Setup

The first `/wp-upload` will spawn `npx -y mcp-remote@latest
https://mcp.linear.app/sse` as a subprocess, which opens a browser for
Linear OAuth and caches the token in `~/.mcp-auth/`. Subsequent uploads
are silent.

If you already use Linear's MCP from Cursor / Claude Desktop / Zed, the
cached token is reused automatically — no second OAuth.

No `LINEAR_API_KEY` needed. (Personal API keys are admin-gated in many
workspaces; OAuth via the official MCP server sidesteps that.)

The extension is auto-discovered from `~/.pi/agent/extensions/work-plan/`.
Zero runtime deps — `mcp-remote` is invoked through `npx` on demand.

Defaults are wired to the **Platform (PLAT)** team and **Savage**
project, matching `~/.claude/commands/ticket.md`. Override per-plan via
the YAML frontmatter at the top of the plan file.

## Commands

### Plan → ticket

| Command            | What it does                                                                |
|--------------------|-----------------------------------------------------------------------------|
| `/work-plan [seed]` | Create/resume a plan file, open it in the parent nvim, enter planning mode |
| `/wp-open`         | Re-open the current plan file in nvim                                       |
| `/wp-upload`       | Validate, confirm, then submit the plan as a Linear issue                   |
| `/wp-cancel`       | Exit planning mode without uploading (file stays on disk)                   |

### Ticket → implementation

| Command            | What it does                                                                |
|--------------------|-----------------------------------------------------------------------------|
| `/wp-issue <id>`   | Fetch a Linear issue (case-insensitive, e.g. `plat-456`) and start implementing it in the current agent |
| `/wp-issue`        | (no arg) Print the currently-active ticket, or a usage hint                 |

### Shared

| Command            | What it does                                                                |
|--------------------|-----------------------------------------------------------------------------|
| `/wp-clear`        | Dismiss the ticket card and exit implementing mode (if active)              |
| `/wp-mcp-tools`    | Diagnostic: list every tool exposed by the Linear MCP server                |

There's also a `--work-plan` CLI flag that auto-enters planning mode at
startup.

Planning and implementing modes are mutually exclusive. Switching either
direction prompts a `confirm` so you don't lose track of the current mode
(the plan file stays on disk either way).

## Flow

1. `/work-plan add caching to the quote endpoint`
   - Writes `~/.pi/agent/work-plans/<sessionId>.md` from a template
   - Sends `:edit <path>` to the parent nvim via `$NVIM`
   - Footer shows `📝 planning`
   - Agent gets per-turn hidden system context with the current file body:
     refine via `edit`/`write`, do not execute or run bash
2. Iterate freely. The agent edits the file each turn; you can also edit
   it directly in nvim. Both sides see each other's changes on the next
   turn.
3. `/wp-upload`
   - Parses + validates the frontmatter
   - Shows a summary and asks `confirm`
   - Calls Linear MCP `save_issue` with team/title/description/priority/
     project/assignee/labels/state
   - Renders a unicode card above your editor with identifier, title,
     project, assignee, priority, labels, state, URL

## Implementing flow

```
/wp-issue plat-456
```

- Fetches the issue via Linear MCP `get_issue` (description, title, URL,
  priority, labels, state, project, assignee — all of it)
- Sets footer status to `🛠 PLAT-456`
- Pins a `🛠 implementing` ticket card above the editor (replaces the
  uploaded card if one was up)
- Drops a visible kickoff message into the chat with a link + metadata
- Injects hidden system context every turn containing the full ticket
  body and a strict "do NOT touch git" rule. The extension also blocks
  `git ...` bash commands while implementing. Branches/commits/PRs are
  handled outside the conversation; the ticket transitions to Done
  automatically when the matching commit lands.

To swap tickets just run `/wp-issue <other-id>`. To stop, `/wp-clear`.

## Plan file schema

```markdown
---
title: <required, no placeholders>
team: 96e7d2a4-...      # team name or ID (Linear MCP resolves either)
project: 84f220b8-...   # project name, ID, or slug (or omit for none)
assignee: me            # "me" | email | name | user-ID | null (unassigned)
priority: 4             # 0 none, 1 urgent, 2 high, 3 normal, 4 low
labels:                 # any of: Feature, Bug, Improvement, Refactor,
  - Feature             # Tech Debt, Infrastructure, Operations UI, Discussion
state: Backlog          # state type, name, or ID
---

## Context
…why this matters; reference Savage if relevant…

## Requirements
1. concrete, testable item
2. …

## Acceptance Criteria
- [ ] verifiable condition
- [ ] …

## Notes / Constraints
…optional…
```

The frontmatter parser supports the small YAML subset above (scalars,
inline arrays `[a, b]`, block arrays, `null`, `# comments`). Anything
fancier and validation will reject it before uploading.

## How the nvim handoff works

When pi runs inside `:terminal` (your `<C-,>` toggle in
`~/.config/nvim/lua/configs/pi.lua`), Neovim sets `$NVIM` to its
msgpack-rpc socket. The extension drives the parent over that socket
with `--remote-expr` + `luaeval`:

```lua
-- find a non-floating, non-terminal window and :edit into it; if there
-- isn't one, fall back to a horizontal split. This avoids clobbering
-- the floating `:terminal` that pi itself is running inside.
for _, w in ipairs(vim.api.nvim_list_wins()) do
  local cfg = vim.api.nvim_win_get_config(w)
  if cfg.relative == "" then
    local b = vim.api.nvim_win_get_buf(w)
    if vim.bo[b].buftype ~= "terminal" then target = w; break end
  end
end
```

If `$NVIM` is empty (you ran pi outside nvim), the file is still
written to disk and the path is shown via `notify` — open it however
you like.

## Context handling

Planning and implementing context is appended to the system prompt for
the current turn only; it is not stored as hidden chat history. That keeps
the prompt authoritative (the plan file or ticket body is current every
turn) without accumulating stale snapshots. Older persistent hidden
context messages from previous versions are pruned before provider calls.

## Troubleshooting

- **mcp-remote failures** — stderr is teed to `~/.pi/agent/work-plans/mcp.log`.
- **Schema mismatch** — if Linear changes their MCP, run `/wp-mcp-tools`
  to see what tools / fields are exposed.
- **OAuth re-prompt** — delete `~/.mcp-auth/` and re-upload.
- **Different MCP endpoint** — set `LINEAR_MCP_URL` (default `https://mcp.linear.app/sse`).

## Files

```
~/.pi/agent/extensions/work-plan/
├── index.ts        # commands, state, lifecycle, status bar
├── linear.ts       # MCP-backed uploadPlan() + getIssue(); calls save_issue / get_issue
├── mcp-client.ts   # generic stdio JSON-RPC MCP client
├── nvim.ts         # $NVIM remote-send helpers
├── template.ts     # plan template + YAML-subset parser + validation
├── widget.ts       # post-upload ticket card renderer
└── README.md
```

State (planning mode + last uploaded ticket + active implementing ticket) is persisted via
`pi.appendEntry`, so it survives `/reload` and session resume. The MCP
subprocess is closed on `session_shutdown`.

## Verified

End-to-end against `mcp.linear.app`:
- OAuth handshake via `mcp-remote` ✓
- `tools/list` returns Linear's 37 tools ✓
- `save_issue` round-trip with all 8 fields ✓
- Response mapping populates all card fields (identifier, title, URL,
  project, assignee, priority, label, state, team key from prefix) ✓
