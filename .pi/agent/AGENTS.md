# Global instructions

## GitHub
Prefer the `gh` CLI over raw `git` remote operations or direct API calls;
assume `gh` is installed and authenticated. `git` and `gh` are gated to a
read-only allowlist by the `source-control-policy` extension — load the
`source-control` skill for the allowed command list and the PR-comment
surfaces before running them.
