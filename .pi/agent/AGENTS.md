# Global instructions

## Private Obsidian vault — mandatory privacy boundary
- ALL direct access to `~/obsidian` and everything beneath it is OFF LIMITS,
  including the direct path `~/obsidian/obsidian/Atomic`. Never use those paths
  for reads, listings, searches, or other exploration.
- The ONLY approved route to Atomic notes is `~/Atomic` and its descendants.
  This user-approved symlink points to `~/obsidian/obsidian/Atomic`; it permits
  access only to that subtree's contents, never its parents or siblings.
  Always use the `~/Atomic` spelling, not its resolved target. Access it only
  when relevant to the user's task; do not explore it proactively.
- Do NOT read, list, search, traverse, index, inspect metadata, copy, or otherwise
  explore protected paths. Do not edit protected files as a way to read them.
  This applies to every tool, shell command, script, MCP server, and delegated
  agent, not just the `read` tool.
- Apart from the explicitly approved `~/Atomic` alias, NEVER bypass this
  boundary using symlinks, aliases, alternate path spellings, shell commands,
  other tools, or subagents. Do not follow links inside `~/Atomic` into private
  vault content outside its intended subtree, or change the alias to expose
  other content. Pass this boundary explicitly to any delegated agent that
  might encounter the vault.
- Do not run recursive searches or listings from `~` or another ancestor that
  would traverse the private vault. Use narrowly scoped paths outside the
  vault, or work directly through `~/Atomic` without listing or inspecting
  its target's parents.
- Do not weaken the read guard or these instructions to complete a task. If a
  task requires protected access, STOP and ask the user for explicit consent
  for the specific path and operation. Broad requests are not consent.
- The read guard is not a sandbox and does not enforce every access route.
  Treat this privacy boundary as binding even when a tool would allow access.

## Finding
- `grep` (including `egrep`/`fgrep`/`rgrep`) and `find` are hard-blocked by the
  `prefer-rg-fd` extension; such commands will fail. Do not attempt them —
  not even inside pipes, `xargs`, or command substitutions.
- Use `rg` for content search and `fd` for file-name search.
- Do not directly search `/`. Perform targeted searches. Searches directly in root can take hours
- All `fd` or `rg` commands must be time-bounded (enforced): set the bash
  tool's `timeout` parameter on the call. Do NOT use a shell `timeout`/
  `gtimeout` wrapper — GNU `timeout` is not installed on macOS, and a missing
  binary fails silently (empty result, no error) when stderr is redirected.

### Scripts executed outside the local agent
- The local `rg`/`fd` preference is not a portability requirement for authored
  scripts. CI, build, container, and remote scripts may use `grep`/`find` when
  those tools are provided by their execution environment. This does not
  authorize direct local tool calls that bypass the extension's block.
- Do not assume remote runners have tools installed on this Mac. Before adding
  `rg`, `fd`, or another nonstandard command, verify the runner image/setup
  provides it, explicitly install it, or use an available portable alternative.
- Exercise script dependencies in CI or a representative minimal environment;
  passing locally alone does not prove runner compatibility.

## GitHub
Prefer the `gh` CLI over raw `git` remote operations or direct API calls;
assume `gh` is installed and authenticated. `git` and `gh` are gated to a
read-only allowlist by the `source-control-policy` extension — load the
`source-control` skill for the allowed command list and the PR-comment
surfaces before running them.

## Python
If using Python, sandbox your scripts and environment into a `uv` project, even if temporary.

## Shell environment

The command runner uses a non-login shell and may not inherit variables configured by the user's login shell. When a required variable such as `NUCLEUS_AUTH_TOKEN` is missing, retry the command through login zsh:

    zsh -lic 'cd /absolute/path/to/project && <command>'

Check only whether secrets are present; never print their values.
