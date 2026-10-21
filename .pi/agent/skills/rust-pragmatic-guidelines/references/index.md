# Pragmatic Rust — task router

Paths below are relative to **`$RUST_GUIDELINES_DIR` in the configured checkout**,
not this bundled file. Read the overview first, then select every applicable row.
Open the named source indexes and read the complete relevant `M-*.md` files they
include. Starting IDs are examples, not an exhaustive checklist or rule summaries.
Find an ID by filename if it spans several categories.

| Task / symptom | Source indexes | Useful starting rules |
| --- | --- | --- |
| Lints, verification, naming, Debug/Display, routine code hygiene | `universal/README.md` | `M-STATIC-VERIFICATION`, `M-LINT-OVERRIDE-EXPECT`, `M-PUBLIC-DEBUG`, `M-SHORT-NAMES` |
| Error types/conversion, app failures, panic vs Result, unwind/recovery | `apps/README.md`, `libs/ux/README.md`, `correctness/README.md` | `M-APP-ERROR`, `M-ERRORS-CANONICAL-STRUCTS`, `M-FROM-ERROR`, `M-PANIC-ON-BUG`, `M-PANIC-CONTINUATION` |
| Public APIs, external types, flexible inputs/I/O, escape hatches | `libs/interop/README.md`, `libs/ux/README.md` | `M-DONT-LEAK-TYPES`, `M-IMPL-IO`, `M-IMPL-ASREF`, `M-ESCAPE-HATCHES` |
| Builders, dependency injection, wrappers, newtype invariants | `libs/ux/README.md`, `libs/resilience/README.md` | `M-INIT-BUILDER`, `M-BUILD-RESULT`, `M-DI-HIERARCHY`, `M-STRONG-TYPES-GUARD` |
| Async APIs, Send, long-running tasks, large futures | `libs/ux/README.md`, `libs/interop/README.md`, `performance/README.md` | `M-ASYNC-FN`, `M-TYPES-SEND`, `M-YIELD-POINTS`, `M-ASYNC-STACK-SIZE` |
| Hot paths, allocations, collection capacity, hashing, CPU/allocator choice | `performance/README.md`, `apps/README.md` | `M-HOTPATH`, `M-MEM-REUSE`, `M-INITIAL-CAPACITY`, `M-TARGET-CPU` |
| Tests, system-call mocks, test utilities, assertions that prove nothing | `libs/resilience/README.md`, `ai/README.md` | `M-MOCKABLE-SYSCALLS`, `M-INTEGRATION-TESTS`, `M-TEST-UTIL`, `M-TAUTOLOGICAL-TESTS` |
| Unsafe, soundness, undefined behavior, FFI/DLL boundaries | `correctness/README.md`, `ffi/README.md` | `M-UNSAFE`, `M-UNSOUND`, `M-ISOLATE-DLL-STATE`, `M-FFI-TRANSLATES` |
| Cargo workspaces, editions/MSRV, features, native dependencies | `project/README.md`, `libs/building/README.md` | `M-CARGO-WORKSPACE`, `M-MSRV`, `M-FEATURES-ADDITIVE`, `M-SYS-CRATES` |
| Declarative/procedural macros, hygiene, helper/version coupling | `macros/README.md` | `M-MACRO-LAST-RESORT`, `M-MACRO-HELPERS`, `M-MACRO-VERSION-PIN` |
| Rustdoc, module docs, re-exports, ambiguous public item paths | `docs/README.md`, `ai/README.md` | `M-CANONICAL-DOCS`, `M-MODULE-DOCS`, `M-DOC-INLINE`, `M-SINGLE-ITEM-PATH` |
| Logging, telemetry and its performance cost | `universal/README.md`, `libs/resilience/README.md`, `performance/README.md` | `M-LOG-STRUCTURED`, `M-LOG-NOT-PRINT`, `M-LOG-OVERHEAD` |
| Crate/module boundaries, abstractions, AI-friendly interfaces | `universal/README.md`, `libs/ux/README.md`, `ai/README.md` | `M-SMALLER-CRATES`, `M-BALANCED-MODULES`, `M-DESIGN-FOR-AI`, `M-RUST-SHAPED` |

## Scope checks

- A crate with `lib.rs` also needs the library scope note in `libs/README.md`;
  being part of an application workspace does not make its APIs application-only.
- Public API work also invokes `rust-api-guidelines`; consult
  `universal/M-UPSTREAM-GUIDELINES.md` for Microsoft's relationship to it.
- Broad reviews start with the full `checklist/README.md`, then actual applicable
  rule files. A targeted task does not require that entire checklist or all.txt.
- This router is navigation, not a substitute for current source. The listed
  categories cover the inspected 2026.6 checkout's 90 rules; use the checkout's
  `../SUMMARY.md`, category includes and source search when its structure changes.

Maintenance: `node scripts/validate.mjs` from the skill directory verifies this
router against the configured checkout without requiring the agent export.
