---
name: rust-pragmatic-guidelines
description: >
  Source-backed Rust engineering guidance from Microsoft's Pragmatic Rust
  Guidelines, using a local checkout. Loads the full upstream agent briefing
  by default alongside topic-based source lookup. Use when writing, reviewing,
  or refactoring Rust applications and libraries: error
  handling and panics, unsafe code and soundness, FFI boundaries, async API
  design, performance and allocations, testing and mocking, logging, macros,
  Cargo workspaces and features, MSRV, or documentation. Also use for explicit
  Microsoft guideline questions or M-* guideline IDs. Complements
  rust-api-guidelines for public API design; not a Rust language reference
  or a substitute for a dependency's API documentation.
---

# Microsoft Pragmatic Rust Guidelines

Use Microsoft's [Pragmatic Rust Guidelines](https://microsoft.github.io/rust-guidelines/)
from the local [microsoft/rust-guidelines](https://github.com/microsoft/rust-guidelines)
checkout. This skill combines the **full upstream agent briefing** with
**topic-based source navigation**. Load both by default when this skill is
invoked; focused searches supplement the briefing rather than replace it.

## Source location and structure

Optionally set `RUST_PRAGMATIC_GUIDELINES_REPO` to the **absolute repository root**,
not its `src/guidelines` directory. Export it before launching the agent, for example:

```bash
export RUST_PRAGMATIC_GUIDELINES_REPO="$HOME/checkouts/rust-guidelines"
```

When the variable is unset, the default is `$HOME/git/rust-guidelines`. Resolve
and validate the mdBook source directory before reading or searching:

```bash
RUST_PRAGMATIC_GUIDELINES_REPO="${RUST_PRAGMATIC_GUIDELINES_REPO-$HOME/git/rust-guidelines}"
RUST_GUIDELINES_DIR="$RUST_PRAGMATIC_GUIDELINES_REPO/src/guidelines"
RUST_GUIDELINES_AGENT_FILE="$RUST_PRAGMATIC_GUIDELINES_REPO/src/agents/all.txt"

case "$RUST_PRAGMATIC_GUIDELINES_REPO" in
  /*) ;;
  *) printf '%s\n' 'RUST_PRAGMATIC_GUIDELINES_REPO must be a non-empty absolute repository path.' >&2; exit 1 ;;
esac
if [ ! -f "$RUST_GUIDELINES_DIR/README.md" ] || [ ! -f "$RUST_GUIDELINES_DIR/checklist/README.md" ]; then
  printf 'Pragmatic Rust Guidelines source not found at %s; check RUST_PRAGMATIC_GUIDELINES_REPO.\n' "$RUST_GUIDELINES_DIR" >&2
  exit 1
fi
if [ ! -f "$RUST_GUIDELINES_AGENT_FILE" ] || [ ! -s "$RUST_GUIDELINES_AGENT_FILE" ] || [ ! -r "$RUST_GUIDELINES_AGENT_FILE" ]; then
  printf 'Agent briefing missing, empty, or unreadable at %s; restore it in RUST_PRAGMATIC_GUIDELINES_REPO.\n' "$RUST_GUIDELINES_AGENT_FILE" >&2
  exit 1
fi
```

The default applies only when the variable is **unset**; an explicitly empty or
invalid override is an error, not a reason to fall back. If validation fails,
stop and tell the user which path failed. Ask them to correct the variable or
restore/clone `https://github.com/microsoft/rust-guidelines` at the intended
location. Do not invent the contents or automatically clone or update the checkout.

All source paths below are relative to `$RUST_GUIDELINES_DIR`, **not this skill's
directory**. Resolve them to absolute paths when reading. Run the setup in the
same shell invocation as any searches below; shell-local variables do not persist
across separate tool calls.

The local checkout is the source snapshot; read `README.md` for its version and
applicability rather than assuming it is the latest upstream release.

**Important: category `README.md` files are mostly mdBook include indexes.**
A line such as `{{#include M-UNSAFE.md}}` points to the actual guideline in the
same directory. Reading the index alone does not read the guideline. Open the
relevant `M-*.md` files completely, including rationale, examples, exceptions,
and any linked rules needed to understand them.

## Default loading: agent briefing plus source lookup

1. **Load the upstream agent guidance first.** Read
   `$RUST_PRAGMATIC_GUIDELINES_REPO/src/agents/README.md`, then read the **entire**
   `$RUST_GUIDELINES_AGENT_FILE` (`src/agents/all.txt` under the resolved repository).
   This is the default baseline even for focused tasks, not an optional resource
   reserved for broad reviews.
2. **Finish the read.** The briefing exceeds a single read-tool response. Continue
   with `offset`/`limit` until the whole file has been consumed; a truncated first
   response, search excerpts, or a summary is not a full load. Reuse a complete
   read already present in the active context for the same checkout snapshot;
   otherwise load it again. If it cannot be loaded, report that and ask for the
   briefing to be restored rather than silently switching to search-only mode.
3. **Also use the source map and searches below.** The briefing provides broad
   context; task-specific source reads provide exact rules, rationale, and
   citations. The generated export can lag behind individual `M-*.md` files.
   When they differ, use the current source rule and point out the discrepancy.
   Do not omit the briefing merely to save context, or omit source lookup because
   the briefing was loaded.

## Topic → source map

Start with `README.md` for the design principles and must/should distinction.
Use `checklist/README.md` for a broad review, and `../SUMMARY.md` for the current
book structure if paths have changed. Each category index below lists its rule
files; the IDs shown are examples, not an exhaustive checklist.

| Topic | Category index | Example guideline IDs |
| --- | --- | --- |
| Static verification, lint overrides, naming, crate boundaries, Debug/Display, structured logging | `universal/README.md` | `M-STATIC-VERIFICATION`, `M-LINT-OVERRIDE-EXPECT`, `M-LOG-STRUCTURED` |
| Library interoperability: Send, external types, escape hatches, flexible inputs and I/O | `libs/interop/README.md` | `M-TYPES-SEND`, `M-DONT-LEAK-TYPES`, `M-IMPL-IO` |
| Library usability: errors, builders, dependency injection, async functions, collections, module shape | `libs/ux/README.md` | `M-ERRORS-CANONICAL-STRUCTS`, `M-INIT-BUILDER`, `M-DI-HIERARCHY`, `M-ASYNC-FN` |
| Library resilience: mocking, integration tests, test utilities, invariants, global state, telemetry | `libs/resilience/README.md` | `M-MOCKABLE-SYSCALLS`, `M-INTEGRATION-TESTS`, `M-STRONG-TYPES-GUARD`, `M-AVOID-STATICS` |
| Library builds: out-of-box use, native dependencies, additive Cargo features | `libs/building/README.md` | `M-OOBE`, `M-SYS-CRATES`, `M-FEATURES-ADDITIVE` |
| Declarative and procedural macros, helper crates, hygiene, version coupling | `macros/README.md` | `M-MACRO-LAST-RESORT`, `M-MACRO-HELPERS`, `M-MACRO-VERSION-PIN` |
| Application error handling, allocator choice, CPU targeting | `apps/README.md` | `M-APP-ERROR`, `M-MIMALLOC-APPS`, `M-TARGET-CPU` |
| FFI boundaries, DLL state, core versus binding crates | `ffi/README.md` | `M-ISOLATE-DLL-STATE`, `M-FFI-TRANSLATES`, `M-FFI-NAMING` |
| Unsafe code, soundness, undefined behavior, panic policy and recovery | `correctness/README.md` | `M-UNSAFE`, `M-UNSOUND`, `M-PANIC-ON-BUG`, `M-PANIC-CONTINUATION` |
| Profiling, throughput, allocations, indirection, hashing, async yield points and stack size | `performance/README.md` | `M-HOTPATH`, `M-MEM-REUSE`, `M-YIELD-POINTS`, `M-ASYNC-STACK-SIZE` |
| Cargo workspace layout, shared settings, editions, MSRV | `project/README.md` | `M-CARGO-WORKSPACE`, `M-CRATES-IN-WORKSPACE`, `M-LATEST-EDITION`, `M-MSRV` |
| Rustdoc summaries, module documentation, canonical sections, re-exports | `docs/README.md` | `M-FIRST-DOC-SENTENCE`, `M-MODULE-DOCS`, `M-CANONICAL-DOCS`, `M-DOC-INLINE` |
| AI-friendly APIs, unambiguous item paths, useful tests, avoiding unnecessary abstractions | `ai/README.md` | `M-DESIGN-FOR-AI`, `M-SINGLE-ITEM-PATH`, `M-TAUTOLOGICAL-TESTS`, `M-RUST-SHAPED` |

For an exact rule ID or an unfamiliar topic, search the source directly:

```bash
# Locate a rule by filename, then read the returned file completely.
fd --type f '^M-UNSAFE\.md$' "$RUST_GUIDELINES_DIR"

# Locate candidate rules by content, then read the relevant files completely.
rg -l -i --glob 'M-*.md' 'panic|unwind|catch_unwind' "$RUST_GUIDELINES_DIR"
```

Set the bash tool's `timeout` parameter for these searches (for example, 10 seconds).
Use these searches **in addition to** the default full agent-briefing read.

## Applying the guidelines

1. **Load the baseline, then identify the scope.** Complete the default loading
   above. Distinguish applications from libraries, public APIs from implementation
   details, and hot paths from ordinary code. Per
   `libs/README.md`, crates containing `lib.rs` should consider the library
   guidelines even when they belong to an application workspace.
2. **Select and read the rules.** For a focused question, use the map or search.
   For a broad review, read the full checklist first, select the applicable
   items, then read their rule files. Checklist titles are not sufficient
   evidence for a recommendation.
3. **Compose with `rust-api-guidelines`.** Microsoft's
   `universal/M-UPSTREAM-GUIDELINES.md` explicitly complements the Rust API
   Guidelines. Load that skill for public API design/review and `C-*` rules;
   use this skill for Microsoft's `M-*` rules. Do not treat either collection
   as the Rust language specification or invent a precedence between them.
4. **Preserve context and strength.** Distinguish a guideline's *must* from its
   *should*. Follow its rationale and documented exceptions, and account for
   the project's compatibility, MSRV, deployment, and performance constraints.
   Explain conflicts or justified departures rather than silently imposing
   broad API, allocator, or build-policy changes. Never treat pragmatic
   exceptions as permission for unsoundness or undefined behavior.
5. **Make recommendations traceable.** Cite the rule ID and source path, e.g.
   `M-UNSAFE` (`correctness/M-UNSAFE.md`). For reviews, connect each finding to
   concrete code, its consequence, and a proposed fix. Separate correctness
   defects from advisory design preferences; do not claim full compliance
   after only a focused review.
