# Syntax: functions, closures and control flow

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 171–251.
Section context: Hello, Rust!.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

###  Functions & Behavior

Define units of code and their abstractions.

| Example | Explanation |
|---------|-------------|
| `trait T {}`  | Define a **trait**; [Book](https://doc.rust-lang.org/book/ch10-02-traits.html) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/trait.html) [Reference](https://doc.rust-lang.org/reference/items/traits.html) common behavior types can adhere to. |
| `trait T : R {}` | `T` is subtrait of **supertrait** [Book](https://doc.rust-lang.org/book/ch19-03-advanced-traits.html#using-supertraits-to-require-one-traits-functionality-within-another-trait) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/trait/supertraits.html) [Reference](https://doc.rust-lang.org/reference/items/traits.html#supertraits) `R`. Any `S` must `impl R` before it can `impl T`. |
| `impl S {}`  | **Implementation** [Reference](https://doc.rust-lang.org/reference/items/implementations.html) of functionality for a type `S`, e.g., methods. |
| `impl T for S {}`  | Implement trait `T` for type `S`; specifies _how exactly_ `S` acts like `T`. |
| `impl !T for S {}` | Disable an automatically derived **auto trait**. [Nomicon](https://doc.rust-lang.org/nightly/nomicon/send-and-sync.html) [Reference](https://doc.rust-lang.org/reference/special-types-and-traits.html#auto-traits)  **[Unstable / nightly]**   **[Advanced]**  |
| `fn f() {}`  | Definition of a **function**; [Book](https://doc.rust-lang.org/book/ch03-03-how-functions-work.html)  [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/fn.html) [Reference](https://doc.rust-lang.org/reference/items/functions.html) or associated function if inside `impl`. |
| ↳  `fn f() -> S {}`  | Same, returning a value of type S. |
| ↳  `fn f(&self) {}`  | Define a **method**, [Book](https://doc.rust-lang.org/book/ch05-03-method-syntax.html)  [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/fn/methods.html)  [Reference](https://doc.rust-lang.org/reference/items/associated-items.html#methods)  e.g., within an `impl S {}`. |
| `struct S`  `(T);` | More arcanely, _also_[See section](https://cheats.rs/#data-structures) defines `fn S(x: T) -> S` **constructor fn**.  [RFC](https://rust-lang.github.io/rfcs/1506-adt-kinds.html#tuple-structs)  **[Advanced]**  |
| `const fn f() {}`  | Constant `fn` usable at compile time, e.g., `const X: u32 = f(Y)`. [Reference](https://doc.rust-lang.org/reference/const_eval.html#const-functions)  **[Edition '18]** |
| ↳  `const { x }`  | Used within a function, ensures `{ x }` evaluated during compilation. [Reference](https://doc.rust-lang.org/reference/expressions/block-expr.html#const-blocks) |
| `async fn f() {}`  | **Async**  [Reference](https://doc.rust-lang.org/reference/items/functions.html#async-functions)  **[Edition '18]**  function transform, [See section](https://cheats.rs/#async-await-101) makes `f` return an `impl` **`Future`**. [std](https://doc.rust-lang.org/std/future/trait.Future.html) |
| ↳  `async fn f() -> S {}`  | Same, but make `f` return an `impl Future<Output=S>`. |
| ↳  `async { x }`  | Used within a function, make `{ x }` an `impl Future<Output=X>`. [Reference](https://doc.rust-lang.org/reference/expressions/block-expr.html#async-blocks) |
| ↳  `async move { x }`  | Moves captured variables into future, _c_. move closure.  [Reference](https://doc.rust-lang.org/reference/expressions/block-expr.html#capture-modes) [See section](https://cheats.rs/#functions-behavior)  |
| `fn() -> S`  | **Function references**, ^(1) [Book](https://doc.rust-lang.org/book/ch19-05-advanced-functions-and-closures.html#function-pointers) [std](https://doc.rust-lang.org/std/primitive.fn.html) [Reference](https://doc.rust-lang.org/reference/types.html#function-pointer-types) memory holding address of a callable. |
| `Fn() -> S`  | **Callable trait** [Book](https://doc.rust-lang.org/book/ch19-05-advanced-functions-and-closures.html#returning-closures) [std](https://doc.rust-lang.org/std/ops/trait.Fn.html) (also `FnMut`, `FnOnce`), impl. by closures, fn's … |
| `AsyncFn() -> S`  | **Callable async trait** [std](https://doc.rust-lang.org/std/ops/trait.AsyncFn.html) (also `AsyncFnMut`, `AsyncFnOnce`), impl. by async _c._  |
| ` \|\| {}  ` | A **closure** [Book](https://doc.rust-lang.org/book/ch13-01-closures.html) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/fn/closures.html) [Reference](https://doc.rust-lang.org/reference/expressions/closure-expr.html) that borrows its **captures**, [See section](https://cheats.rs/#closures-data) [Reference](https://doc.rust-lang.org/reference/types/closure.html#capture-modes)  (e.g., a local variable). |
| ↳  `\|x\| {}` | Closure accepting one argument named `x`, body is block expression. |
| ↳  `\|x\| x + x` | Same, without block expression; may only consist of single expression.  |
| ↳  ` move \|x\| x + y  ` | **Move closure** [Reference](https://doc.rust-lang.org/reference/types/closure.html#capture-modes) taking ownership; i.e., `y` transferred into closure.  |
| ↳  `async \|x\| x + x` | **Async closure**. [Reference](https://doc.rust-lang.org/reference/expressions/closure-expr.html#async-closures)  Converts its result into an `impl Future<Output=X>`. |
| ↳  `async move \|x\| x + y` | **Async move closure**.  Combination of the above. |
| ↳  ` return \|\| true  ` | Closures sometimes look like logical ORs (here: return a closure). |
| `unsafe` | If you enjoy debugging segfaults; **unsafe code**. [See section](https://cheats.rs/#unsafe-unsound-undefined) [Book](https://doc.rust-lang.org/book/ch19-01-unsafe-rust.html#unsafe-superpowers) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/unsafe.html#unsafe-operations) [Nomicon](https://doc.rust-lang.org/nightly/nomicon/meet-safe-and-unsafe.html) [Reference](https://doc.rust-lang.org/reference/unsafe-blocks.html#unsafe-blocks) |
| ↳  `unsafe fn f() {}` | Means "_calling can cause UB, [See section](https://cheats.rs/#unsafe-unsound-undefined) **YOU must check** requirements_". |
| ↳  `unsafe trait T {}` | Means "_careless impl. of `T` can cause UB_; **implementor must check**".  |
| ↳  `unsafe { f(); }` | Guarantees to compiler "_**I have checked** requirements, trust me_".  |
| ↳  `unsafe impl T for S {}` | Guarantees _`S` is well-behaved w.r.t `T`_; people may use `T` on `S` safely.  |
| ↳  `unsafe extern "abi" {}` | Starting with Rust 2024 `extern "abi" {}` blocks [See section](https://cheats.rs/#organizing-code) must be `unsafe`.  |
| ↳  ↳  `pub safe fn f();`  | Inside an `unsafe extern "abi" {}`, mark `f` is actually safe to call. [RFC](https://rust-lang.github.io/rfcs/3484-unsafe-extern-blocks.html) |

**Notes:**

^(1) Most documentation calls them function **pointers**, but function **references** might be more appropriate[Link](https://users.rust-lang.org/t/why-are-function-pointers-special-no-null/87990/16) as they can't be `null` and must point to valid target.

### Control Flow

Control execution within a function.

| Example | Explanation |
|---------|-------------|
| `while x {}`  | **Loop**, [Reference](https://doc.rust-lang.org/reference/expressions/loop-expr.html#predicate-loops) run while expression `x` is true. |
| `loop {}`  | **Loop indefinitely** [Reference](https://doc.rust-lang.org/reference/expressions/loop-expr.html#infinite-loops) until `break`. Can yield value with `break x`. |
| `for x in collection {}` | Syntactic sugar to loop over **iterators**. [Book](https://doc.rust-lang.org/book/ch13-02-iterators.html) [std](https://doc.rust-lang.org/std/iter/index.html) [Reference](https://doc.rust-lang.org/reference/expressions/loop-expr.html#iterator-loops) |
|  ↳   →   `collection.into_iter()`  | Effectively converts any  **`IntoIterator`** [std](https://doc.rust-lang.org/std/iter/trait.IntoIterator.html) type into proper iterator first.  |
|  ↳   →   `iterator.next()`  | On proper **`Iterator`** [std](https://doc.rust-lang.org/std/iter/trait.Iterator.html) then `x = next()` until exhausted (first `None`).   |
| `if x {} else {}`  | **Conditional branch** [Reference](https://doc.rust-lang.org/reference/expressions/if-expr.html) if expression is true. |
| `'label: {}` | **Block label**, [RFC](https://rust-lang.github.io/rfcs/2046-label-break-value.html)  can be used with `break` to exit out of this block.  **[Edition 1.65+]**  |
| `'label: loop {}` | Similar **loop label**, [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/flow_control/loop/nested.html) [Reference](https://doc.rust-lang.org/reference/expressions/loop-expr.html#loop-labels) useful for flow control in nested loops. |
| `break`  | **Break expression** [Reference](https://doc.rust-lang.org/reference/expressions/loop-expr.html#break-expressions) to exit a labelled block or loop. |
| ↳  `break 'label x`  |  Break out of block or loop named `'label` and make `x` its value.  |
| ↳  `break 'label`  | Same, but don't produce any value. |
| ↳  `break x`  | Make `x` value of the innermost loop (only in actual `loop`). |
| `continue `  | **Continue expression** [Reference](https://doc.rust-lang.org/reference/expressions/loop-expr.html#continue-expressions) to the next loop iteration of this loop. |
| `continue 'label`  | Same but instead of this loop, enclosing loop marked with 'label. |
| `x?` | If `x` is [Err](https://doc.rust-lang.org/std/result/enum.Result.html#variant.Err) or [None](https://doc.rust-lang.org/std/option/enum.Option.html#variant.None), **return and propagate**. [Book](https://doc.rust-lang.org/book/ch09-02-recoverable-errors-with-result.html#propagating-errors) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/error/result/enter_question_mark.html) [std](https://doc.rust-lang.org/std/result/index.html#the-question-mark-operator-) [Reference](https://doc.rust-lang.org/reference/expressions/operator-expr.html#the-question-mark-operator) |
| `x.await` | Syntactic sugar to **get future, poll, yield**.  [Reference](https://doc.rust-lang.org/reference/expressions/await-expr.html#await-expressions)   **[Edition '18]**  Only inside `async`.  |
|  ↳   →  `x.into_future()`   |  Effectively converts any  **`IntoFuture`** [std](https://doc.rust-lang.org/std/future/trait.IntoFuture.html) type into proper future first.  |
|  ↳   →  `future.poll()`  |  On proper **`Future`** [std](https://doc.rust-lang.org/std/future/trait.Future.html) then `poll()` and yield flow if **`Poll::Pending`**. [std](https://doc.rust-lang.org/std/task/enum.Poll.html)  |
| `return x`  | **Early return** [Reference](https://doc.rust-lang.org/reference/expressions/return-expr.html) from fn. More idiomatic is to end with expression. |
| ↳  `{ return }`  | Inside normal `{}`-blocks `return` exits surrounding function. |
| ↳  `\|\| { return }`  | Within closures `return` exits that _c._ only, i.e., closure is _s. fn._ |
| ↳  `async { return }`  | Inside `async` a `return` **only** [Reference](https://doc.rust-lang.org/reference/expressions/block-expr.html#control-flow-operators)  **[Pitfall / intentionally wrong]**  exits that `{}`, i.e., `async {}` is _s. fn._ |
| `f()` | Invoke callable `f` (e.g., a function, closure, function pointer, `Fn`, …). |
| `x.f()` | Call member fn, requires `f` takes `self`, `&self`, … as first argument. |
| ↳  `X::f(x)` | Same as `x.f()`. Unless `impl Copy for X {}`, `f` can only be called once. |
| ↳  `X::f(&x)` | Same as `x.f()`. |
| ↳  `X::f(&mut x)` | Same as `x.f()`. |
| ↳  `S::f(&x)` | Same as `x.f()` if `X` [derefs](https://doc.rust-lang.org/std/ops/trait.Deref.html) to `S`, i.e., `x.f()` finds methods of `S`. |
| ↳  `T::f(&x)` | Same as `x.f()` if `X impl T`, i.e., `x.f()` finds methods of `T` if in scope. |
| `X::f()` | Call associated function, e.g., `X::new()`. |
| ↳  `<X as T>::f()` | Call trait method `T::f()` implemented for `X`. |

