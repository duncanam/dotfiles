# Guides: async execution/caveats and closure API bounds

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 6544–6652.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

## Async-Await 101

If you are familiar with async / await in C# or TypeScript, here are some things to keep in mind:

### Basics

| Construct | Explanation |
|---------|-------------|
| `async`  | Anything declared `async` always returns an `impl Future<Output=_>`. [std](https://doc.rust-lang.org/std/future/trait.Future.html) |
| ↳  `async fn f() {}`  | Function `f` returns an `impl Future<Output=()>`. |
| ↳  `async fn f() -> S {}`  | Function `f` returns an `impl Future<Output=S>`. |
| ↳  `async { x }`  | Transforms `{ x }` into an `impl Future<Output=X>`. |
| `let sm = f();   ` | Calling `f()` that is `async` will **not** execute `f`, but produce state machine `sm`. ^(1) ^(2) |
| ↳  `sm = async { g() };`  | Likewise, does **not** execute the `{ g() }` block; produces state machine. |
| `runtime.block_on(sm);`  | Outside an `async {}`, schedules `sm` to actually run. Would execute `g()`. ^(3) ^(4)|
| `sm.await` | Inside an `async {}`, run `sm` until complete. Yield to runtime if `sm` not ready. |

**Notes:**

^(1) Technically `async` transforms following code into anonymous, compiler-generated state machine type; `f()` instantiates that machine.

^(2) The state machine always `impl Future`, possibly `Send` & co, depending on types used inside `async`.

^(3) State machine driven by worker thread invoking `Future::poll()` via runtime directly, or parent `.await` indirectly.

^(4) Rust doesn't come with runtime, need external crate instead, e.g., [tokio](https://crates.io/crates/tokio). Also, more helpers in [futures crate](https://github.com/rust-lang-nursery/futures-rs).

### Execution Flow

At each `x.await`, state machine passes control to subordinate state machine `x`. At some point a low-level state machine invoked via `.await` might not be ready. In that the case worker
thread returns all the way up to runtime so it can drive another Future. Some time later the runtime:
- **might** resume execution. It usually does, unless `sm` / `Future` dropped.
- **might** resume with the previous worker **or another** worker thread (depends on runtime).

Simplified diagram for code written inside an `async` block :

```
       consecutive_code();           consecutive_code();           consecutive_code();
START --------------------> x.await --------------------> y.await --------------------> READY
// ^                          ^     ^                               Future<Output=X> ready -^
// Invoked via runtime        |     |
// or an external .await      |     This might resume on another thread (next best available),
//                            |     or NOT AT ALL if Future was dropped.
//                            |
//                            Execute `x`. If ready: just continue execution; if not, return
//                            this thread to runtime.
```


### Caveats [Pitfall / intentionally wrong]

With the execution flow in mind, some considerations when writing code inside an `async` construct:

| Constructs ^(1) | Explanation |
|---------|-------------|
| `sleep_or_block();` | Definitely bad  **[Pitfall / intentionally wrong]** , never halt current thread, clogs executor. |
| `set_TL(a); x.await; TL();` | Definitely bad  **[Pitfall / intentionally wrong]** , `await` may return from other thread, [thread local](https://doc.rust-lang.org/std/macro.thread_local.html) invalid. |
| `s.no(); x.await; s.go();` | Maybe bad  **[Pitfall / intentionally wrong]** , `await` will [not return](http://www.randomhacks.net/2019/03/09/in-nightly-rust-await-may-never-return/) if `Future` dropped while waiting. ^(2) |
| `Rc::new(); x.await; rc();` | Non-`Send` types prevent `impl Future` from being `Send`; less compatible. |

**Notes:**

^(1) Here we assume `s` is any non-local that could temporarily be put into an invalid state;
`TL` is any thread local storage, and that the `async {}` containing the code is written
without assuming executor specifics.

^(2) Since [Drop](https://doc.rust-lang.org/std/ops/trait.Drop.html) is run in any case when `Future` is dropped, consider using drop guard that cleans up / fixes application state if it has to be left in bad condition across `.await` points.

## Closures in APIs

There is a subtrait relationship `Fn` : `FnMut` : `FnOnce`. That means a closure that
implements `Fn` [std](https://doc.rust-lang.org/std/ops/trait.Fn.html) also implements `FnMut` and `FnOnce`. Likewise a closure
that implements `FnMut` [std](https://doc.rust-lang.org/std/ops/trait.FnMut.html) also implements `FnOnce`. [std](https://doc.rust-lang.org/std/ops/trait.FnOnce.html)

From a call site perspective that means:

| Signature | Function `g` can call … |  Function `g` accepts … |
|--------| -----------| -----------|
| `g<F: FnOnce()>(f: F)`  | … `f()` at most once. |  `Fn`, `FnMut`, `FnOnce`  |
| `g<F: FnMut()>(mut f: F)`  | … `f()` multiple times. | `Fn`, `FnMut` |
| `g<F: Fn()>(f: F)`  | … `f()` multiple times.  | `Fn` |

**Notes:**

Notice how **asking** for a `Fn` closure as a function is
most restrictive for the caller; but **having** a `Fn`
closure as a caller is most compatible with any function.

From the perspective of someone defining a closure:

| Closure | Implements^(*) | Comment |
|--------| -----------| --- |
| `  \|\| { moved_s; }  ` | `FnOnce` | Caller must give up ownership of `moved_s`. |
| `  \|\| { &mut s; }  ` | `FnOnce`, `FnMut` | Allows `g()` to change caller's local state `s`. |
| `  \|\| { &s; }  ` | `FnOnce`, `FnMut`, `Fn` | May not mutate state; but can share and reuse `s`. |

^(*) Rust [prefers capturing](https://doc.rust-lang.org/stable/reference/expressions/closure-expr.html) by reference
(resulting in the most "compatible" `Fn` closures from a caller perspective), but can be
forced to capture its environment by copy or move via the
`move || {}` syntax.

That gives the following advantages and disadvantages:

| Requiring | Advantage | Disadvantage |
|--------| -----------| -----------|
| `F: FnOnce`  | **[Source: good]** Easy to satisfy as caller. | **[Source: bad]** Single use only, `g()` may call `f()` just once. |
| `F: FnMut`  | **[Source: good]** Allows `g()` to change caller state. | **[Source: bad]** Caller may not reuse captures during `g()`. |
| `F: Fn`  | **[Source: good]** Many can exist at same time. | **[Source: bad]** Hardest to produce for caller. |

