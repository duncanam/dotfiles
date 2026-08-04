# Global instructions

## Finding
- Always prefer `fd` over `find`
- Always prefer `rg` over `grep`
- Do not directly search `/`. Perform targeted searches. Searches directly in root can take hours
- The higher up in the filesystem tree you use `fd` or `rg` to discover things, consider using a timeout

## GitHub
Prefer the `gh` CLI over raw `git` remote operations or direct API calls;
assume `gh` is installed and authenticated. `git` and `gh` are gated to a
read-only allowlist by the `source-control-policy` extension — load the
`source-control` skill for the allowed command list and the PR-comment
surfaces before running them.
