# Standard library: Send/Sync, threads, atomics and caches

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 3234–3556.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

## Thread Safety

Assume you hold some variables in Thread 1, and want to either **move** them to Thread 2, or pass their **references** to Thread 3.
Whether this is allowed is governed by **`Send`**[std](https://doc.rust-lang.org/std/marker/trait.Send.html) and **`Sync`**[std](https://doc.rust-lang.org/std/marker/trait.Sync.html) respectively:

**Diagram 83 — textual thread:**

```text
thread:
  thread backdrop: hr
  values:
    value [both, diagram-left=57px]:
      thread link:
        |
        |
        |
      Mutex<u32>
    value [one, diagram-left=97.5px]:
      thread link:
        |
        |
        |
      Cell<u32>
    value [one, diagram-left=137.5px]:
      thread link:
        |
        |
        |
      MutexGuard<u32>
    value [none, diagram-left=177.5px]:
      thread link:
        |
        |
        |
      Rc<u32>
  subtext: blank background: Thread 1
```

**Diagram 84 — textual thread:**

```text
thread:
  thread backdrop: hr
  values:
    value [both, diagram-left=77px]: Mutex<u32>
    value [one, diagram-left=117.5px]: Cell<u32>
    value [disabled, diagram-left=157.5px]: MutexGuard<u32>
    value [disabled, diagram-left=197.5px]: Rc<u32>
  subtext: blank background: Thread 2
```

**Diagram 85 — textual thread:**

```text
thread:
  thread backdrop: hr
  values:
    value [both, diagram-left=77px]:
      b: &
      Mutex<u32>
    value [disabled, diagram-left=117.5px]:
      b: &
      Cell<u32>
    value [one, diagram-left=157.5px]:
      b: &
      MutexGuard<u32>
    value [disabled, diagram-left=197.5px]:
      b: &
      Rc<u32>
  subtext: blank background: Thread 3
```

| Example | Explanation |
| --- | --- |
| **`Mutex<u32>`** | Both `Send` and `Sync`. You can safely pass or lend it to another thread. |
| **`Cell<u32>`** | `Send`, not `Sync`. Movable, but its reference would allow concurrent non-atomic writes. |
| **`MutexGuard<u32>`** | `Sync`, but not `Send`. Lock tied to thread, but reference use could not allow data race. |
| **`Rc<u32>`** | Neither since it is easily clonable heap-proxy with non-atomic counters. |

| Trait | `Send` | `!Send` |
| --- | --- | --- |
| `Sync` | _Most types_ … `Arc<T>`^(1,2), `Mutex<T>`^(2) | `MutexGuard<T>`^(1), `RwLockReadGuard<T>`^(1) |
| `!Sync` | `Cell<T>`^(2), `RefCell<T>`^(2) | `Rc<T>`, `&dyn Trait`, `*const T`^(3) |

**Notes:**

^(1) If `T` is `Sync`.

^(2) If `T` is `Send`.

^(3) If you need to send a raw pointer, create newtype `struct Ptr(*const u8)` and `unsafe impl Send for Ptr {}`. Just ensure you _may_ send it.

| When is ... | ... Send? |
| --- | --- |
| `T` | All contained fields are `Send`, or `unsafe` impl'ed. |
| ↳ `struct S { ... }` | All fields are `Send`, or `unsafe` impl'ed. |
| ↳ `struct S<T> { ... }` | All fields are `Send` and T is `Send`, or `unsafe` impl'ed. |
| ↳ `enum E { ... }` | All fields in all variants are `Send`, or `unsafe` impl'ed. |
| `&T` | If `T` is `Sync`. |
| `\|\| {}` | Closures are `Send` if all _captures_ are `Send`.  |
| ↳  `\|x\| { }` | `Send`, regardless of `x`.  |
| ↳  `\|x\| { Rc::new(x) }` | `Send`, since still nothing captured, despite `Rc` not being `Send`.  |
| ↳  `\|x\| { x + y }` | Only `Send` if `y` is `Send`.  |
| `async { }` | Futures are `Send` if no `!Send` is held over `.await` points.  |
| ↳  `async { Rc::new() }` | `Future` is `Send`, since the `!Send` type `Rc` is not held over `.await`.  |
| ↳  `async { rc; x.await; rc; }` ^(1) | `Future` is `!Send`, since `Rc` used across the `.await` point. |
| `async \|\| { }`  **[Unstable / nightly]**  | Async _cl_. `Send` if all cpts. `Send`, res. `Future` if also no `!Send` inside.   |
| ↳  `async \|x\| { x  + y }`  **[Unstable / nightly]**  | Async closure `Send` if `y` is `Send`. Future `Send` if `x` and `y` `Send`. |

**Notes:**

^(1) This is a bit of pseudo-code to get the point across, the idea is to have an `Rc` before an `.await` point and keep using it beyond that point.

## Atomics & Cache  **[Advanced]**

CPU cache, memory writes, and how atomics affect it.

**Diagram 86 — textual state:**

```text
state:
  memory row:
    byte map:
      byte × 4
      byte [t]: S
      byte [t]: O
      byte [t]: M
      byte [t]: E
      byte × 4
      byte [t]: D
      byte [t]: R
      byte [t]: A
      byte [t]: M
      byte × 4
      byte [t]: D
      byte [t]: A
      byte [t]: T
      byte [t]: A
      byte × 11
      line comment: Main Memory
```

**Diagram 87 — textual state:**

```text
state:
  memory row:
    byte map:
      byte [hide] × 4
      byte [cpu1]: S
      byte [cpu1]: O
      byte [cpu1]: M
      byte [cpu1]: E
      container: tag: (E)
      byte [hide] × 12
      byte [cpu1]: D
      byte [cpu1]: A
      byte [cpu1]: T
      byte [cpu1]: A
      container: tag: (S)
      byte [hide] × 9
      line comment: CPU1 Cache
  memory row:
    byte map:
      byte [hide] × 12
      byte [cpu2, borrowed]: S
      byte [cpu2]: R
      byte [cpu2]: A
      byte [cpu2]: M
      container: tag: (M)
      byte [hide] × 4
      byte [cpu2]: D
      byte [cpu2]: A
      byte [cpu2]: T
      byte [cpu2]: A
      container: tag: (S)
      byte [hide] × 9
      line comment: CPU2 Cache
```

**Notes:**

Modern CPUs don't accesses memory directly, only their cache. Each CPU has its own cache, 100x faster than RAM, but much smaller. It comes in **cache lines**,[Link](https://stackoverflow.com/questions/3928995/how-do-cache-lines-work) some _sliced_ window of bytes, which track if it's an exclusive (E), shared (S) or modified (M) [Link](https://en.wikipedia.org/wiki/MESI_protocol) view of the main memory. Caches talk to each other to ensure **coherence**,[Link](https://gfxcourses.stanford.edu/cs149/fall20content/media/cachecoherence/10_coherence.pdf)
i.e., 'small-enough' data will be 'immediately' seen by all other CPUs, but that may stall the CPU.

**Diagram 88 — textual state:**

```text
state:
  memory row:
    byte map:
      byte [hide] × 4
      byte [cpu1]: S
      byte [cpu1]: O
      byte [cpu1]: M
      byte [cpu1]: E
      byte [hide] × 12
      byte [cpu1]: D
      byte [cpu1, borrowed]: X
      byte [cpu1]: T
      byte [cpu1]: A
      container: tag: (M)
      byte [hide] × 10
      line comment: Cycle 1
    values [freestanding]: value [t, byte2, maybe-borrowed, diagram-left=96px]: O3
  memory row:
    byte map:
      byte [hide] × 4
      byte [cpu1]: S
      byte [cpu1]: O
      byte [cpu1]: M
      byte [cpu1, borrowed]: 4
      byte [hide] × 12
      byte [cpu2]: D
      byte [cpu2]: X
      byte [cpu2]: T
      byte [cpu2]: A
      byte [hide] × 9
      line comment: Cycle 2
    values [freestanding]:
      value [t, byte2, borrowed, diagram-left=96px]: 23
      value [stalled, diagram-left=350px]: STALLED
  memory row:
    byte map:
      byte [hide] × 4
      byte [cpu1, borrowed]: 1
      byte [cpu1] × 2
      byte [cpu1, borrowed]: 4
      container: tag: (M)
      byte [hide] × 12
      byte [cpu2]: D
      byte [cpu2]: X
      byte [cpu2]: T
      byte [cpu2, borrowed]: Y
      container: tag: (M)
      byte [hide] × 9
      line comment: Cycle 3
    values [freestanding]: value [t, byte2, borrowed, diagram-left=96px]: 23
```

**Notes:**

Left: Both compiler _and_ CPUs are free to **re-order** [Link](https://en.wikipedia.org/wiki/Memory_ordering) and split R/W memory access. Even if you explicitly said `write(1); write(23); write(4)`, your compiler might think it's a good idea to write `23` first; in addition your CPU might insist on splitting the write, doing `3` before `2`. Each of these steps could be observable (even the _impossible_ `O3`) by CPU2 via an `unsafe` _data race_. Reordering is also fatal for locks.

Right: Semi-related, even when two CPUs do not attempt to access each other's data (e.g., update 2 independent variables), they might still experience a significant performance loss if the underlying memory is mapped by 2 cache lines (**false sharing**).[Link](https://docs.kernel.org/kernel-hacking/false-sharing.html)

**Diagram 89 — textual state:**

```text
state:
  memory row:
    byte map:
      byte × 4
      byte [t]: 1
      byte [t]: 2
      byte [t]: 3
      byte [t]: 4
      byte × 4
      byte [t]: S
      byte [t]: R
      byte [t]: A
      byte [t]: M
      byte × 4
      byte [t]: D
      byte [t]: X
      byte [t]: T
      byte [t]: Y
      byte × 11
      line comment: Main Memory
    values [freestanding]: value [atomic, byte2, diagram-left=246px]: RA
  memory row:
    byte map:
      byte [hide] × 12
      byte [cpu2, borrowed]: 1
      byte [cpu2]: R
      byte [cpu2]: A
      byte [cpu2]: M
      byte [hide] × 17
      line comment: Cycle 4
    values [freestanding]: value [atomic, byte2, diagram-left=246px]: RA
  memory row:
    byte map:
      byte [hide] × 12
      byte [cpu2, borrowed]: 1
      byte [cpu2]: 2
      byte [cpu2]
      byte [cpu2]: M
      byte [hide] × 17
      line comment: Cycle 5
    values [freestanding]: value [atomic, byte2, borrowed, diagram-left=246px]: 23
  memory row:
    byte map:
      byte [hide] × 12
      byte [cpu2, borrowed]: 1
      byte [cpu2]: 2
      byte [cpu2]: 3
      byte [cpu2, borrowed]: 4
      container: tag: (M)
      byte [hide] × 17
      line comment: Cycle 6
    values [freestanding]: value [atomic, byte2, borrowed, diagram-left=246px]: 23
```

**Notes:**

Atomics address the above issues by doing two things, they

- make sure a read / write / update is not partially observable by temporarily locking cache lines in other CPUs,
- force both the compiler and the CPU to not re-order _'unrelated'_ access around it (i.e., act as a **fence** [std](https://doc.rust-lang.org/std/sync/atomic/fn.fence.html)). Ensuring multiple CPUs agree on the relative order of these other ops is called  **consistency**. [Link](https://gfxcourses.stanford.edu/cs149/winter19content/lectures/09_consistency/09_consistency_slides.pdf) This also comes at a cost of missed performance optimizations.

> **Note** — The above section is greatly simplified. While the issues of coherence and consistency are universal, CPU architectures differ a lot in how they implement caching and atomics, and in their performance impact.

| ↳  A. Ordering  | Explanation |
| --- | --- |
| **`Relaxed`** [std](https://doc.rust-lang.org/std/sync/atomic/enum.Ordering.html#variant.Relaxed) | Full reordering. Unrelated R/W can be freely shuffled around the atomic. |
| **`Release`** [std](https://doc.rust-lang.org/std/sync/atomic/enum.Ordering.html#variant.Release)^(, 1) | When writing, ensure other data loaded by 3^(rd) party `Acquire` is seen after this write. |
| **`Acquire`** [std](https://doc.rust-lang.org/std/sync/atomic/enum.Ordering.html#variant.Acquire)^(, 1) | When reading, ensures other data written before 3^(rd) party `Release` is seen after this read. |
| **`SeqCst`** [std](https://doc.rust-lang.org/std/sync/atomic/enum.Ordering.html#variant.SeqCst) | No reordering around atomic. All unrelated reads and writes stay on proper side. |

**Notes:**

^(1) To be clear, when synchronizing memory access with 2+ CPUs, _all_ must use `Acquire` or `Release` (or stronger). The writer must ensure that all other data it wishes to _release_ to memory are put before the atomic signal, while the readers who wish to _acquire_ this data must ensure that their other reads are only done after the atomic signal.

