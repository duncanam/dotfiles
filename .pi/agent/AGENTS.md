# Global instructions

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

## GitHub
Prefer the `gh` CLI over raw `git` remote operations or direct API calls;
assume `gh` is installed and authenticated. `git` and `gh` are gated to a
read-only allowlist by the `source-control-policy` extension — load the
`source-control` skill for the allowed command list and the PR-comment
surfaces before running them.

## Python
If using Python, sandbox your scripts and environment into a `uv` project, even if temporary.
