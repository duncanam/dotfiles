# Source-control policy extension

This Pi extension enforces deterministic, read-only allowlists for agent-driven
`git` and `gh` commands. It has no interactive override.

## Policy

Allowed Git subcommands are defined in `git-policy.ts`. They inspect repository
state without intentionally changing the index, worktree, refs, configuration,
or remotes.

Allowed GitHub CLI command paths are defined in `gh-policy.ts`. The policy uses
complete paths such as `pr view`; allowing a broad family such as `pr` would
also permit mutating commands such as `pr merge`.

Notable defaults:

- `git fetch`, `branch`, `config`, `remote`, `reflog`, `tag`, and `worktree` are
  blocked because they have mutating behavior.
- `gh api` is blocked even though it can perform GET requests. Its method,
  field-driven POST behavior, and GraphQL mutations make a command-level
  read-only classification unreliable.
- `gh auth status` is allowed, but `--show-token` / `-t` is blocked.
- Unknown commands and command lines whose subcommand cannot be identified
  statically fail closed.

The shell scanner handles direct invocations, executable paths, Git/gh global
options, compound commands, pipelines, command substitutions, common wrappers
(`command`, `env`, `sudo`, and others), and literal `sh -c` scripts. Quoted prose
such as `echo 'git reset --hard'` is not treated as an invocation.

## Scope

This is a guardrail for Pi's `bash` tool, not an operating-system sandbox. It
does not prevent equivalent behavior through arbitrary scripts, libraries,
custom tools, direct `.git` writes, dynamic shell-generated executable names,
or manually entered `!` commands.

## Tests

```bash
node --test ~/.pi/agent/extensions/source-control-policy/policy.test.ts
```
