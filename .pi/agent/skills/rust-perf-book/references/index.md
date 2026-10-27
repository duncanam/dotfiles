# Performance task router

Read selected chapters completely. All links point to unchanged bundled source;
this task grouping is an independent addition, not part of the upstream book.
For optimization work, the skill additionally requires Benchmarking and General
Tips, plus Profiling for runtime/memory investigations. Deduplicate those reads.

| Task or symptom | Complete chapters |
| --- | --- |
| Scope, audience, what this book does and does not cover (default) | [Introduction](book/src/introduction.md) |
| Compare versions, design representative workloads, choose metrics or a benchmark harness | [Benchmarking](book/src/benchmarking.md) |
| Locate hot code or allocations; missing symbols/stacks, debug info or frame pointers | [Profiling](book/src/profiling.md) |
| Release vs debug, runtime speed, binary size, LTO/PGO, codegen units, allocator, target CPU, panic/strip, linker or profile tuning | [Build Configuration](book/src/build-configuration.md) |
| Clippy performance checks; prevent unwanted hasher/type choices | [Linting](book/src/linting.md) |
| Function call overhead, inline hints, outlining cold code | [Inlining](book/src/inlining.md), [Machine Code](book/src/machine-code.md) |
| HashMap/HashSet cost, alternative hashers, collision-attack tradeoffs, byte-wise hashing | [Hashing](book/src/hashing.md) |
| Too many allocations, Vec/String capacity and reuse, cloning, Cow, small collections, allocation regression tests | [Heap Allocations](book/src/heap-allocations.md) |
| Memory footprint/cache locality, struct/enum size, padding, boxed slices, representation regressions | [Type Sizes](book/src/type-sizes.md) |
| Vec initialization, eager vs lazy Option/Result work, Rc/Arc, synchronization primitives | [Standard Library Types](book/src/standard-library-types.md) |
| collect/extend, chaining, chunks, copied, loop/iterator code generation | [Iterators](book/src/iterators.md) |
| Indexing overhead, elimination of bounds checks, unsafe tradeoffs | [Bounds Checks](book/src/bounds-checks.md), [Machine Code](book/src/machine-code.md) |
| Slow stdin/stdout/files, locking, buffering, line reading, raw bytes | [I/O](book/src/io.md); also [Heap Allocations](book/src/heap-allocations.md) for allocating line readers |
| Output/logging cost, debug assertions, debug-only work | [Logging and Debugging](book/src/logging-and-debugging.md) |
| Repeated checks/locks through Option, RefCell, Mutex or RwLock wrappers | [Wrapper Types](book/src/wrapper-types.md) |
| Inspect assembly/LLVM output to test a code-generation hypothesis | [Machine Code](book/src/machine-code.md) |
| Parallel work, Rayon, measured scalability | [Parallelism](book/src/parallelism.md) |
| Prioritize optimizations, algorithms/data structures, case frequencies, caching and explanatory comments | [General Tips](book/src/general-tips.md) |
| Slow clean/incremental builds, dependency/build timing, macro expansion or LLVM IR volume | [Compile Times](book/src/compile-times.md), [Build Configuration](book/src/build-configuration.md) |

The book is terse; linked external documentation may be needed for tool details.
The full upstream reading order and author/title page are in
[SUMMARY.md](book/src/SUMMARY.md), for explicit full-book reads, not the default.
