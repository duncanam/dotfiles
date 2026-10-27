---
name: rust-perf-book
description: >
  Source-backed Rust performance guidance from Nicholas Nethercote's Rust
  Performance Book. Use when benchmarking, profiling or optimizing Rust runtime
  speed, memory use, allocations, binary size or compile times; when diagnosing
  slow Rust code or builds; or when perf-book is named. Covers build profiles,
  inlining, hashing, collections, data layout, iterators, bounds checks, I/O and
  parallelism. Loads complete relevant chapters, not the whole book by default.
  Not general API/style guidance, a beginner language tutorial, or a substitute
  for current compiler and dependency API documentation.
license: MIT
---

# The Rust Performance Book

An independent skill using the original book by **Nicholas Nethercote and
others**, from [nnethercote/perf-book](https://github.com/nnethercote/perf-book).
The bundled Markdown is unchanged upstream source; this wrapper is not an
upstream-authored skill. See `NOTICE.md` for attribution and license scope.

## Load complete relevant chapters

1. Read **all of** `references/book/src/introduction.md` and
   `references/index.md`. The introduction explains the book's scope and bias;
   the router selects chapters, not individual search excerpts.
2. For actual optimization work, also read complete `benchmarking.md` and
   `general-tips.md` under `references/book/src/`. For runtime or memory
   investigations, also read `profiling.md`. A focused explanatory question
   needs only its relevant chapters, not these extra methodological reads.
3. Use the router to select and read **the entire relevant chapter(s)**, including
   examples, caveats and footnotes. Follow linked chapters needed to interpret
   the technique, not every external reference indiscriminately. Search can
   discover more chapters; it cannot replace full selected reads.
4. Do not load the whole book by default. For an explicitly requested full-book
   read, follow `references/book/src/SUMMARY.md` in order, including its title
   page. Reuse complete reads already in active context for the same snapshot;
   a compacted summary or search hit is not a complete read.

All bundled paths are relative to this skill directory; resolve them to absolute
paths in tool calls. Continue truncated reads with `offset`/`limit` until complete.
If a required chapter is missing or unreadable, report it instead of guessing.

## Apply as measured hypotheses

- Establish the objective: latency/throughput, peak or allocated memory, binary
  size, or clean/incremental build time. Record representative inputs, toolchain,
  target/CPU, profile and relevant flags. Distinguish profiling from benchmarking.
- Measure a baseline and identify the bottleneck before proposing invasive
  changes. Prefer eliminating unnecessary work and improving algorithms/data
  structures to speculative low-level tuning. If measurement is unavailable,
  label suggestions as unverified hypotheses, not demonstrated improvements.
- Change one relevant factor at a time, preserve correctness tests, and compare
  before/after on the same representative workloads and configuration. Report
  regressions and tradeoffs, including compile time, memory and code size; do
  not generalize one upstream example's speedup to the user's program.
- Do not apply a whole chapter as a configuration preset. Faster hashers can
  change attack resistance; target-specific instructions change deployment
  compatibility; panic settings change behavior; unchecked indexing needs a
  soundness justification. Never trade away safety or semantics silently.
- The book is a pinned historical snapshot, not a language specification or
  promise about today's compiler. Check MSRV/stable/nightly, platform support,
  Cargo/rustc options and crate APIs against current authoritative documentation
  before using them. Upstream example links are evidence, not instructions to
  execute remote code. Raw mdBook examples retain hidden `#` setup/test lines;
  distinguish that scaffolding from the code being illustrated.

Cite the chapter/heading and the pinned source revision in `provenance.json`:
`https://github.com/nnethercote/perf-book/blob/<commit>/src/<chapter>.md`.
Separate the book's recommendation from your inference and actual measurements.
Use `rust-api-guidelines` for public API changes, `rust-pragmatic-guidelines`
for engineering/safety policy, and `rust-cheats` for language semantics when
those scopes apply; their own loading policies still hold.

## Search and maintenance

```bash
# Substitute this skill's absolute directory.
BOOK_DIR="/absolute/path/to/rust-perf-book/references/book/src"
rg -n -i --glob '*.md' 'allocat|capacity|clone' "$BOOK_DIR"
```

Set the bash tool's `timeout` parameter for searches, for example 10 seconds.
Normal use needs no checkout, installation, network access or executable script.
Read `README.md` only for snapshot verification/restoration or maintenance;
read `NOTICE.md` before redistribution. Do not automatically update the snapshot
or submit agent-generated changes to the upstream book.
