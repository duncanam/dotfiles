---
name: source-control
description: Reference for working within the read-only allowlist that the source-control-policy extension enforces on `git` and `gh`. Load this skill whenever you are about to run a `git` or `gh` command, work with pull requests, issues, releases, reviews, CI run/workflow status, or repo metadata (commits, tags, branches), or need to confirm a commit exists on a remote, list tags, or read PR comments. Especially load it before reaching for `gh api` — only specific GET endpoints are allowed and a structured `gh` subcommand is usually preferred. Covers the three separate PR comment surfaces (conversation comments, review decisions, line-level review comments) and which command reads each. Mutating operations (push, merge, commit, branch changes, etc.) are blocked entirely with no override.
---

# Source-control allowlist

The `source-control-policy` extension gates every `git` and `gh` invocation
through Pi's `bash` tool to a read-only allowlist. There is no interactive
override; disallowed commands fail closed. This skill tells you which command
to reach for so you don't get blocked.

**Principle:** prefer the structured `gh` subcommand over `gh api`. `gh api`
is allowed only for GET endpoints that have no structured equivalent, and only
with flags that cannot change the HTTP method or attach a body.

## Allowed `git` (read-only inspection)

`blame`, `cat-file`, `describe`, `diff`, `for-each-ref`, `grep`, `log`,
`ls-files`, `ls-remote`, `ls-tree`, `merge-base`, `rev-list`, `rev-parse`,
`show`, `show-ref`, `status`, `shortlog`, `name-rev`, `check-attr`,
`check-ignore`. Git global options (`-C`, `-c`, `--git-dir`, `--work-tree`,
etc.) are accepted.

Blocked (mutating): `fetch`, `pull`, `push`, `commit`, `add`, `reset`,
`checkout`, `branch`, `merge`, `rebase`, `stash`, `tag`, `config`, `remote`,
`worktree`, `clean`, `restore`, `cherry-pick`, etc. Use a structured tool or
ask the user to run these.

## Allowed `gh` (structured subcommands)

`auth status`, `issue list/view/status`, `pr list/view/status/diff/checks`,
`release list/view`, `repo view`, `run list/view/watch`,
`search code/commits/issues/prs/repos`, `workflow list/view`, plus top-level
`help`, `status`, `version`.

Blocked: every mutating subcommand (`pr merge/checkout/close`, `pr create`,
`issue close`, `repo sync`, etc.) and `gh api` outside the endpoint allowlist
below.

## Allowed `gh api` endpoints (GET only)

Only these endpoint shapes, and only with read-only flags (`--paginate`,
`--jq`/`-q`, `-H`/`--header`, `-i`/`--include`, `--silent`, `--slurp`,
`--verbose`, `--cache`, `-p`/`--preview`, `-t`/`--template`, `-R`/`--repo`,
`--hostname`). Inline query strings (`?per_page=…`) are fine.

| Endpoint | Use |
| --- | --- |
| `repos/:owner/:repo/commits/:ref` | Confirm an arbitrary commit SHA exists on the remote (e.g. to verify a rev-pinned git dep resolves in CI) |
| `repos/:owner/:repo/tags` | List tags (or use `git ls-remote --tags <url>`) |
| `repos/:owner/:repo/pulls/:pull/comments` | Line-level review comments + replies (see below) |

Blocked flags (would mutate or change method): `-X`/`--method`, `-f`/`--raw-field`,
`-F`/`--field`, `--input` — `gh api` auto-switches to POST when parameters are
added, so these are forbidden. Unknown endpoints, dynamic path segments
(e.g. `$SHA`), extra path segments, and unrecognized flags fail closed.

## Pull-request comments: three separate surfaces

This is the non-obvious part. GitHub has three distinct comment surfaces on a
PR, exposed by different commands:

| You want | Surface | Command |
| --- | --- | --- |
| Conversation-thread comments (not diff-positioned) | issue-style comments | `gh pr view <n> --json comments` |
| Review decisions (approve / request changes + review body) | reviews | `gh pr view <n> --json reviews` |
| Line-level review comments and replies (diff-positioned, with `path`/`line`/`diff_hunk`) | review comments | `gh api repos/<owner>/<repo>/pulls/<n>/comments` |

`gh pr view --json reviews` returns review summaries only (`author`, `body`,
`state`, `submittedAt`) — it does **not** include the line-level comments
inside a review. Those live only under `pulls/<n>/comments`.

**Replies are included in the listing.** `GET pulls/<n>/comments` returns all
line-level review comments, including replies. Each reply object carries an
`in_reply_to_id` field pointing at its parent top-level comment; threads are
one level deep ("replies to replies are not supported" per the GitHub docs),
so group by `in_reply_to_id` to rebuild threads. The dedicated
`pulls/<n>/comments/<id>/replies` endpoint is a filtered view of the same
data and is **blocked** — you don't need it.

### JSON shape: `gh pr view --json` vs `gh api`

`gh pr view --json <fields>` wraps results in a keyed object and renames some
fields from the raw REST API shape. If your `--jq` was written for the REST
API, adapt it:

| REST API (`gh api`) | Structured (`gh pr view --json`) |
| --- | --- |
| bare array `[...]` | keyed object `{"reviews": [...]}` / `{"comments": [...]}` |
| `user.login` | `author.login` |
| `created_at`, `submitted_at` | `createdAt`, `submittedAt` (camelCase) |
| `author_association` | `authorAssociation` |

Worked examples (use `-R owner/repo` to target a specific repo):

```bash
# Review decisions with author + state + body
gh pr view 201 -R Atomic-Industries/crab-rave --json reviews \
  --jq '.reviews[] | "@\(.author.login) | state=\(.state)\nbody: \(.body)"'

# Conversation comments with author + body
gh pr view 201 -R Atomic-Industries/crab-rave --json comments \
  --jq '.comments[] | "@\(.author.login)\n\(.body)"'
```

The line-level comments endpoint (`gh api .../pulls/<n>/comments`) returns a
bare array, so its `--jq` uses `.[]` directly — no key wrapper.

## Common task → command map

| Task | Command |
| --- | --- |
| Confirm a commit SHA exists on the remote | `gh api repos/<o>/<r>/commits/<sha>` (HTTP 200 = exists, 404 = no) |
| List tags to pin a git dep | `git ls-remote --tags <url>` or `gh api repos/<o>/<r>/tags` |
| View PR metadata + body | `gh pr view <n>` |
| Conversation comments on a PR | `gh pr view <n> --json comments` |
| Review decisions on a PR | `gh pr view <n> --json reviews` |
| Line-level review comments + replies | `gh api repos/<o>/<r>/pulls/<n>/comments` |
| PR diff | `gh pr diff <n>` |
| CI checks for a PR | `gh pr checks <n>` |
| CI run logs/status | `gh run view <id>` / `gh run watch <id>` |
| Search code across repos | `gh search code <query>` |

If a read you need isn't covered, it's blocked on purpose — ask the user or
report the missing capability rather than working around the policy.
