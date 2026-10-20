---
name: rust-api-guidelines
description: Authoritative Rust API design guidance from the official Rust API Guidelines (rust-lang/api-guidelines). Load this whenever the user is designing, reviewing, refactoring, or critiquing a Rust crate's public API — including questions about naming conventions (C-CASE, C-CONV, C-GETTER, C-ITER), trait implementations, error handling, documentation, predictability, flexibility, type safety, dependability, debuggability, future-proofing, macros, interoperability, or the API review checklist. Loads the official overview and checklist by default, plus any upstream agent briefing provided by the checkout, and supplies a topic→file map for detailed source lookup.
---

# Rust API Guidelines

This skill exposes the official [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/) (rust-lang/api-guidelines) from a local checkout. Use it as the source of truth when designing or reviewing Rust crate APIs.

## Source location

Optionally set `RUST_API_GUIDELINES_REPO` to the **absolute repository root**, not
its `src` directory. Export it before launching the agent, for example:

```bash
export RUST_API_GUIDELINES_REPO="$HOME/checkouts/api-guidelines"
```

When the variable is unset, the default is `$HOME/git/api-guidelines`. Resolve
and validate the mdBook source directory before reading or searching:

```bash
RUST_API_GUIDELINES_REPO="${RUST_API_GUIDELINES_REPO-$HOME/git/api-guidelines}"
GUIDELINES_DIR="$RUST_API_GUIDELINES_REPO/src"

case "$RUST_API_GUIDELINES_REPO" in
  /*) ;;
  *) printf '%s\n' 'RUST_API_GUIDELINES_REPO must be a non-empty absolute repository path.' >&2; exit 1 ;;
esac
if [ ! -f "$GUIDELINES_DIR/about.md" ] || [ ! -f "$GUIDELINES_DIR/checklist.md" ]; then
  printf 'Rust API Guidelines source not found at %s; check RUST_API_GUIDELINES_REPO.\n' "$GUIDELINES_DIR" >&2
  exit 1
fi
```

The default applies only when the variable is **unset**; an explicitly empty or
invalid override is an error, not a reason to fall back. If validation fails,
stop and tell the user which path failed. Ask them to correct the variable or
restore/clone `https://github.com/rust-lang/api-guidelines` at the intended
location. Do not automatically clone or update the checkout.

All chapter paths below are relative to `$GUIDELINES_DIR`, not this skill's
directory. Run the setup in the same shell invocation as any searches below;
shell-local variables do not persist across separate tool calls.

## Default loading: baseline plus chapter lookup

On invocation, read `about.md` and `checklist.md` under `$GUIDELINES_DIR`
**completely**, even for a focused task. Keep the topic map and search workflow
below available alongside that baseline; checklist titles do not replace the
chapters' rationale, examples, and exceptions.

The inspected checkout does not provide an upstream agent skill or combined
agent export like Microsoft's `src/agents/all.txt`. If the configured checkout
provides one, read that **in full as well**, using the entry point documented by
its README or agent documentation. Do not assume Microsoft's path exists in this
repository or invent an equivalent. Continue truncated reads with `offset`/`limit`
until complete. A complete read already present in the active context for the
same checkout snapshot need not be repeated.

## Topic → file map

Each chapter is a single Markdown file under `$GUIDELINES_DIR/`. Read the file that matches the user's question completely — the guideline checklist items (`C-*` tags) are scattered throughout and partial reads miss them.

| Topic | File |
| --- | --- |
| About / overview | `about.md` |
| Full checklist of all `C-*` guidelines | `checklist.md` |
| Table of contents | `SUMMARY.md` |
| Naming conventions (C-CASE, C-CONV, C-GETTER, C-ITER, C-ITER-TY, C-FEATURE, C-WORD-ORDER) | `naming.md` |
| Interoperability (C-COMMON-TRAITS, C-CONV-TRAITS, C-COLLECT, C-SERDE, C-SEND-SYNC, C-GOOD-ERR, C-NUM-FMT, C-RW-VALUE) | `interoperability.md` |
| Macros (C-EVOCATIVE, C-MACRO-ATTR, C-ANYWHERE, C-MACRO-VIS, C-MACRO-TY) | `macros.md` |
| Documentation (C-CRATE-DOC, C-EXAMPLE, C-QUESTION-MARK, C-FAILURE, C-LINK, C-METADATA, C-HTML-ROOT, C-RELNOTES, C-HIDDEN) | `documentation.md` |
| Predictability (C-SMART-PTR, C-CONV-SPECIFIC, C-METHOD, C-NO-OUT, C-OVERLOAD, C-DEREF, C-CTOR) | `predictability.md` |
| Flexibility (C-INTERMEDIATE, C-CALLER-CONTROL, C-GENERIC, C-OBJECT) | `flexibility.md` |
| Type safety (C-NEWTYPE, C-CUSTOM-TYPE, C-BITFLAG, C-BUILDER) | `type-safety.md` |
| Dependability (C-VALIDATE, C-DTOR-FAIL, C-DTOR-BLOCK) | `dependability.md` |
| Debuggability (C-DEBUG, C-DEBUG-NONEMPTY) | `debuggability.md` |
| Future proofing (C-SEALED, C-STRUCT-PRIVATE, C-NEWTYPE-HIDE, C-STRUCT-BOUNDS) | `future-proofing.md` |
| Necessities (C-STABLE, C-PERMISSIVE) | `necessities.md` |
| Curated external reading | `external-links.md` |

## How to use this skill

1. Resolve and validate `GUIDELINES_DIR` using the source-location setup above,
   then complete the default baseline reads before task-specific chapter lookup.
2. If the user asks about a specific `C-FOO` tag and you don't already know which chapter it lives in:
   ```bash
   rg -l -F --glob '*.md' 'C-FOO' "$GUIDELINES_DIR"
   ```
   Set the bash tool's `timeout` parameter for searches (for example, 10 seconds).
3. For broad design-review questions ("review this API", "is this idiomatic?"), start with `checklist.md` to enumerate all `C-*` items, then read the chapter files relevant to the specific code.
4. **Read full files** rather than snippets — each chapter is short and the rationale/examples around a guideline matter as much as the rule itself.
5. When citing a guideline in your answer, reference both the tag (e.g. `C-GETTER`) and the chapter (e.g. `naming.md`) so the user can follow up.
6. Treat the guidelines as authoritative recommendations, not absolute mandates (the `about.md` chapter is explicit about this). Note exceptions when they're warranted by the user's domain.

## Quick checklist scan

To list guideline headings with their chapter paths and line numbers in one pass
(after running the source-location setup in the same shell invocation):

```bash
rg -n --glob '*.md' '^## .*C-[A-Z-]+' "$GUIDELINES_DIR"
```

This is useful when doing a full-crate review and you want the model to walk every applicable guideline.
