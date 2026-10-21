---
name: rust-pragmatic-guidelines
description: >
  Source-backed Rust engineering guidance from Microsoft's Pragmatic Rust
  Guidelines. Use when writing, reviewing or refactoring Rust applications and
  libraries: errors and panics, unsafe/soundness, FFI, async, performance,
  testing/mocking, logging, macros, Cargo/features/MSRV, or documentation.
  Also use for Microsoft guideline questions and M-* IDs. Loads a small
  overview and task router, then complete applicable source rules; the full
  agent export is opt-in. Complements rust-api-guidelines for public API design;
  not a language reference or a substitute for current dependency API docs.
---

# Microsoft Pragmatic Rust Guidelines

Use the local [microsoft/rust-guidelines](https://github.com/microsoft/rust-guidelines)
checkout. Upstream already separates individual rules into `M-*.md` files;
use those directly, without loading or copying the whole agent export.

## Resolve the source

Optionally export `RUST_PRAGMATIC_GUIDELINES_REPO` as an **absolute repository
root** before launching the agent, not its `src/guidelines` subdirectory.
The default is `$HOME/git/rust-guidelines` only when the variable is **unset**.
An explicitly empty, relative, missing or invalid override must fail, never
silently fall back.

```bash
RUST_PRAGMATIC_GUIDELINES_REPO="${RUST_PRAGMATIC_GUIDELINES_REPO-$HOME/git/rust-guidelines}"
RUST_GUIDELINES_DIR="$RUST_PRAGMATIC_GUIDELINES_REPO/src/guidelines"

case "$RUST_PRAGMATIC_GUIDELINES_REPO" in
  /*) ;;
  *) printf '%s\n' 'RUST_PRAGMATIC_GUIDELINES_REPO must be a non-empty absolute repository path.' >&2; exit 1 ;;
esac
for required in README.md checklist/README.md; do
  if [ ! -f "$RUST_GUIDELINES_DIR/$required" ] || [ ! -s "$RUST_GUIDELINES_DIR/$required" ] || [ ! -r "$RUST_GUIDELINES_DIR/$required" ]; then
    printf 'Required guideline source missing, empty or unreadable: %s\n' "$RUST_GUIDELINES_DIR/$required" >&2
    exit 1
  fi
done
```

On failure, report the path and ask for the override or checkout to be corrected.
Do not invent guidance, clone or update the repository automatically. Repeat
shell-local setup in each separate search invocation; variables do not persist
between tool calls.

## Default load: overview, router, relevant rules

1. Read **all of** `$RUST_GUIDELINES_DIR/README.md` for the snapshot's version,
   applicability and must/should distinction. Also read **all of** this skill's
   `references/index.md`, resolving that path relative to the skill directory.
2. Use the router to identify applicable scopes, not just the user's exact words.
   Consider error/panic handling, public APIs, unsafe/FFI, async, performance,
   testing and build implications. For crates containing `lib.rs`, also read
   `$RUST_GUIDELINES_DIR/libs/README.md`, even inside an application workspace.
3. Read the relevant category indexes, then **complete applicable `M-*.md` files**,
   including rationale, examples and exceptions. Category READMEs are mostly
   mdBook include lists: `{{#include M-UNSAFE.md}}` is a pointer, not the rule.
   Follow linked rules needed to interpret the selected guidance; do not blindly
   traverse every cross-reference or read every category.
4. For a broad crate/design review, additionally read the complete upstream
   `checklist/README.md`, enumerate the applicable items, and read their source
   rules. Do not claim full compliance after a focused selection.
5. Reuse complete reads already in active context for the same snapshot. Continue
   truncated reads with `offset`/`limit` from the reported next line. Search hits,
   headings and summaries never substitute for complete selected rules. If a
   necessary source cannot be read, disclose that rather than guessing.

`src/agents/README.md` and `src/agents/all.txt` are **not default reads or default
prerequisites**. A checkout without the agent export remains usable for normal
rule lookup. Only when the user explicitly requests the full briefing, validate
those two files under the repository root as readable/nonempty and read both
completely. If unavailable, report it and offer a full source-rule read instead.
The generated export can lag behind individual rules; prefer the current source
file and disclose discrepancies when applying guidance.

## Search and apply

After the source setup, locate a specific rule or an unfamiliar topic:

```bash
fd --type f '^M-UNSAFE\.md$' "$RUST_GUIDELINES_DIR"
rg -l -i --glob 'M-*.md' 'panic|unwind|catch_unwind' "$RUST_GUIDELINES_DIR"
```

Set the bash tool's `timeout` parameter for searches (for example, 10 seconds).
If the router is stale for the configured checkout, use `../SUMMARY.md` relative
to `$RUST_GUIDELINES_DIR` and the actual category indexes to rediscover paths;
never fabricate a missing rule.

Cite the rule ID and source path, connect recommendations to the actual code,
and preserve must/should strength and documented exceptions. Account for the
project's MSRV, compatibility and deployment constraints; pragmatic exceptions
are not permission for unsoundness or undefined behavior.

Use `rust-api-guidelines` for public API design/review and `C-*` rules, and
`rust-cheats` for language semantics. Microsoft's `M-UPSTREAM-GUIDELINES`
complements the API Guidelines; neither collection is a language specification.
No package installation or agent export is needed for ordinary skill use.
