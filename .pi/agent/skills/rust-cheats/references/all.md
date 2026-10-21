# Rust Language Cheat Sheet — cleaned reference

Generated from [cheats.rs Markdown source](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md). Revision: `f153e8e1da51e909fb6e1ed210013c6aadab80c2`.
See [provenance](../provenance.json), [conversion policy](../CONVERSION.md), and [upstream terms](../NOTICE.md).

This is a formatting adaptation, not a corrected or independently verified Rust specification.
Version/edition warnings and opinions describe the upstream snapshot.

**Reading diagrams:** fenced text outlines preserve source nesting, roles, byte runs, labels,
and flags. `diagram-*` coordinates/colors are drawing metadata, NOT memory addresses,
ABI offsets, or layout guarantees. `hide` denotes hidden source cells/placeholders.
Superscripts appear as `^(...)`, subscripts as `_(...)`; numbered notes retain their local scope.

---

## Hello, Rust!

If you are new to Rust, or if you want to try the things below:

### Hello World

```rust
fn main() {
    println!("Hello, world!");
}
```


### Strengths

**Things Rust does measurably really well**

- Compiled code [about same performance](https://benchmarksgame-team.pages.debian.net/benchmarksgame/box-plot-summary-charts.html) as C / C++, and excellent memory and energy efficiency.
- Can [avoid 70% of all safety issues](https://www.chromium.org/Home/chromium-security/memory-safety) present in C / C++, and most memory issues.
- Strong type system prevents [data races](https://doc.rust-lang.org/nomicon/races.html), brings ['fearless concurrency'](https://blog.rust-lang.org/2015/04/10/Fearless-Concurrency.html) (amongst others).
- Seamless C interop, and [dozens of supported platforms](https://doc.rust-lang.org/rustc/platform-support.html) (based on LLVM).
- ["Most loved or admired language"](https://survey.stackoverflow.co/2023/#section-admired-and-desired-programming-scripting-and-markup-languages) for ~~4~~ ~~5~~ ~~6~~ ~~7~~ 8 years in a row. 🤷‍♀️
- Modern tooling: `cargo` (builds _just work_), `clippy` (700+ code quality lints), `rustup` (easy toolchain mgmt).

### Weaknesses

**Points you might run into**

- Steep learning curve;^(1) compiler enforcing (esp. memory) rules that would be "best practices" elsewhere.
- Missing Rust-native libs in some domains, target platforms (esp. embedded), IDE features.^(1)
- Longer compile times than "similar" code in other languages.^(1)
- Careless (use of `unsafe` in) libraries can secretly break safety guarantees.
- ~~No formal language specification~~, [Link](https://spec.ferrocene.dev/) ~~can prevent legal use in some domains (aviation, medical, …)~~. [Link](https://ferrous-systems.com/ferrocene/)
- Rust Foundation may offensively use their IP to affect _'Rust'_ projects (e.g, forbid names, impose policies). [Link](https://devclass.com/2023/04/11/dont-call-it-rust-community-complains-about-draft-trademark-policy-restricting-use-of-word-marks/)[Link](https://web.archive.org/web/20230413161930/https://old.reddit.com/r/rust/comments/12e7tdb/rust_trademark_policy_feedback_form/)^(2)

^(1) Compare [Rust Survey](https://blog.rust-lang.org/2020/04/17/Rust-survey-2019.html#why-not-use-rust).

^(2) Avoiding their marks (e.g, in your name, URL, logo, dress) is probably sufficient.

### Installation

**Download**
- Get installer from [**rustup.rs**](https://rustup.rs/) (highly recommended) **[Useful]**

**IDEs**
- [**Rust Rover**](https://www.jetbrains.com/rust/) (free for non-commercial)
- [Visual Studio Code](https://code.visualstudio.com/) with [**rust-analyzer**](https://rust-analyzer.github.io/) (free)

### First Steps

**Modular Beginner Resources**
- [**Tour of Rust**](https://tourofrust.com/TOC_en.html) - Live code and explanations, side by side.
- [**Rust in Easy English**](https://dhghomon.github.io/easy_rust/Chapter_3.html) - 60+ concepts, simple English, example-driven.
- [**Rust for the Polyglot Programmer**](https://www.chiark.greenend.org.uk/~ianmdlvl/rust-polyglot/index.html) - A guide for the experienced programmer.

In addition consider **The Book**,[Book](https://doc.rust-lang.org/book/) **Rust by Example**,[Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/) the **Standard Library**,[std](https://doc.rust-lang.org/std) and **Learn Rust**.[Link](https://github.com/ImplFerris/LearnRust)

> **Opinion**  **[Opinion]**  — If you have never seen or used any Rust it might be good to visit one of the links above before continuing; the next chapter might feel a bit terse otherwise.

### Data Structures

Data types and memory locations defined via keywords.

| Example | Explanation |
|---------|-------------|
| `struct S {}` | Define a **struct** [Book](https://doc.rust-lang.org/book/ch05-00-structs.html) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/custom_types/structs.html) [std](https://doc.rust-lang.org/std/keyword.struct.html) [Reference](https://doc.rust-lang.org/reference/expressions/struct-expr.html) with named fields. |
| ↳  `struct S { x: T }` | Define struct with named field `x` of type `T`. |
| ↳  `struct S`  `(T);` | Define "tupled" struct with numbered field `.0` of type `T`. |
| ↳  `struct S;` | Define **zero sized** [Nomicon](https://doc.rust-lang.org/nightly/nomicon/exotic-sizes.html#zero-sized-types-zsts) unit struct. Occupies no space, optimized away. |
| `enum E {}` | Define an **enum**, [Book](https://doc.rust-lang.org/book/ch06-01-defining-an-enum.html) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/custom_types/enum.html#enums) [Reference](https://doc.rust-lang.org/reference/items/enumerations.html) _c_. [algebraic data types](https://en.wikipedia.org/wiki/Algebraic_data_type), [tagged unions](https://en.wikipedia.org/wiki/Tagged_union). |
| ↳   `enum E { A, B` `(), C {} }` | Define variants of enum; can be unit- `A`, tuple- `B`  `()` and struct-like `C{}`. |
| ↳   `enum E { A = 1 }` | Enum with explicit **discriminant values**, [Reference](https://doc.rust-lang.org/reference/items/enumerations.html#custom-discriminant-values-for-fieldless-enumerations) e.g., for FFI. |
| ↳   `enum E {}` | Enum w/o variants is **uninhabited**, [Reference](https://doc.rust-lang.org/reference/glossary.html#uninhabited) can't be created, _c._ 'never' [See section](https://cheats.rs/#miscellaneous)  **[Advanced]**  |
| `union U {}` | Unsafe C-like **union**  [Reference](https://doc.rust-lang.org/reference/items/unions.html) for FFI compatibility.  **[Advanced]**  |
| `static X: T = T();`  | **Global variable** [Book](https://doc.rust-lang.org/book/ch19-01-unsafe-rust.html#accessing-or-modifying-a-mutable-static-variable) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/custom_types/constants.html#constants) [Reference](https://doc.rust-lang.org/reference/items/static-items.html#static-items)  with `'static` lifetime, single  **[Pitfall / intentionally wrong]** ^(1) memory location. |
| `const X: T = T();`  | Defines **constant**, [Book](https://doc.rust-lang.org/book/ch03-01-variables-and-mutability.html#constants) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/custom_types/constants.html) [Reference](https://doc.rust-lang.org/reference/items/constant-items.html) copied into a temporary when used. |
| `let x: T;`  | Allocate `T` bytes on stack^(2) bound as `x`. Assignable once, not mutable.  |
| `let mut x: T;`  | Like `let`, but allow for **mutability** [Book](https://doc.rust-lang.org/book/ch03-01-variables-and-mutability.html) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/variable_bindings/mut.html) and mutable borrow.^(3) |
| ↳  `x = y;` | Moves `y` to `x`, inval. `y` if `T` is not **`Copy`**, [std](https://doc.rust-lang.org/std/marker/trait.Copy.html) and copying `y` otherwise. |

**Notes:**

^(1) In _libraries_ you might secretly end up with multiple instances of `X`, depending on how your crate is imported. [Link](https://doc.rust-lang.org/cargo/reference/resolver.html#version-incompatibility-hazards)

^(2) **Bound variables** [Book](https://doc.rust-lang.org/book/ch03-01-variables-and-mutability.html) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/variable_bindings.html) [Reference](https://doc.rust-lang.org/reference/variables.html) live on stack for synchronous code. In `async {}` they become part of async's state machine, may reside on heap.

^(3) Technically _mutable_ and _immutable_ are misnomer. Immutable binding or shared reference may still contain Cell [std](https://doc.rust-lang.org/std/cell/index.html), giving _interior mutability_.

Creating and accessing data structures; and some more _sigilic_ types.

| Example | Explanation |
|---------|-------------|
| `S { x: y }` | Create `struct S {}` or `use`'ed `enum E::S {}` with field `x` set to `y`. |
| `S { x }` | Same, but use local variable `x` for field `x`. |
| `S { ..s }` | Fill remaining fields from `s`, esp. useful with `Default::default()`. [std](https://doc.rust-lang.org/std/default/trait.Default.html) |
| `S { 0: x }` | Like `S`  `(x)` below, but set field `.0` with struct syntax.  |
| `S`  `(x)` | Create `struct S`  `(T)` or `use`'ed `enum E::S`  `()` with field `.0` set to `x`. |
| `S` | If `S` is unit `struct S;` or `use`'ed `enum E::S` create value of `S`. |
| `E::C { x: y }` | Create enum variant `C`. Other methods above also work. |
| `()` | Empty tuple, both literal and type, aka **unit**. [std](https://doc.rust-lang.org/std/primitive.unit.html) |
| `(x)` | Parenthesized expression. |
| `(x,)` | Single-element **tuple** expression. [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/primitives/tuples.html) [std](https://doc.rust-lang.org/std/primitive.tuple.html) [Reference](https://doc.rust-lang.org/reference/expressions/tuple-expr.html) |
| `(S,)` | Single-element tuple type. |
| `[S]` | Array type of unspec. length, i.e., **slice**. [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/primitives/array.html) [std](https://doc.rust-lang.org/std/primitive.slice.html) [Reference](https://doc.rust-lang.org/reference/types/slice.html) Can't live on stack. ^(*) |
| `[S; n]` | **Array type** [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/primitives/array.html)  [std](https://doc.rust-lang.org/std/primitive.array.html) [Reference](https://doc.rust-lang.org/reference/types/array.html)  of fixed length `n` holding elements of type `S`. |
| `[x; n]` | **Array instance**  [Reference](https://doc.rust-lang.org/reference/expressions/array-expr.html) (expression) with `n` copies of `x`. |
| `[x, y]` | Array instance with given elements `x` and `y`. |
| `x[0]` | Collection indexing, here w. `usize`. Impl. via [**Index**](https://doc.rust-lang.org/std/ops/trait.Index.html), [**IndexMut**](https://doc.rust-lang.org/std/ops/trait.IndexMut.html). |
| ↳  `x[..]` | Same, via range (here _full range_), also `x[a..b]`, `x[a..=b]`, … _c_. below.  |
| `a..b` | **Right-exclusive range** [std](https://doc.rust-lang.org/std/ops/struct.Range.html) [Reference](https://doc.rust-lang.org/reference/expressions/range-expr.html) creation, e.g., `1..3` means `1, 2`.  |
| `..b` | Right-exclusive **range to** [std](https://doc.rust-lang.org/std/ops/struct.RangeTo.html) without starting point.  |
| `..=b` | **Inclusive range to** [std](https://doc.rust-lang.org/std/ops/struct.RangeToInclusive.html) without starting point.  |
| `a..=b` | **Inclusive range**, [std](https://doc.rust-lang.org/std/ops/struct.RangeInclusive.html) `1..=3` means `1, 2, 3`. |
| `a..` | **Range from** [std](https://doc.rust-lang.org/std/ops/struct.RangeFrom.html) without ending point.  |
| `..` | **Full range**, [std](https://doc.rust-lang.org/std/ops/struct.RangeFull.html) usually means _the whole collection_.   |
| `s.x` | Named **field access**, [Reference](https://doc.rust-lang.org/reference/expressions/field-expr.html) might try to [Deref](https://doc.rust-lang.org/std/ops/trait.Deref.html) if `x` not part of type `S`. |
| `s.0` | Numbered field access, used for tuple types `S`  `(T)`. |

**Notes:**

^(*) For now,[RFC](https://rust-lang.github.io/rfcs/1909-unsized-rvalues.html) pending completion of [tracking issue](https://github.com/rust-lang/rust/issues/48055).

### References & Pointers

Granting access to un-owned memory. Also see section on Generics & Constraints.

| Example | Explanation |
|---------|-------------|
| `&S` | Shared **reference** [Book](https://doc.rust-lang.org/book/ch04-02-references-and-borrowing.html) [std](https://doc.rust-lang.org/std/primitive.reference.html) [Nomicon](https://doc.rust-lang.org/nightly/nomicon/references.html) [Reference](https://doc.rust-lang.org/reference/types.html#pointer-types) (type; space for holding _any_ `&s`). |
| ↳  `&[S]` | Special slice reference that contains (`addr`, `count`). |
| ↳  `&str` | Special string slice reference that contains (`addr`, `byte_len`). |
| ↳  `&mut S` | Exclusive reference to allow mutability (also `&mut [S]`, `&mut dyn S`, …). |
| ↳  `&dyn T` | Special **trait object** [Book](https://doc.rust-lang.org/book/ch17-02-trait-objects.html#using-trait-objects-that-allow-for-values-of-different-types) [Reference](https://doc.rust-lang.org/reference/types/trait-object.html) ref. as (`addr`, `vtable`); `T` must be **dyn compat.** [Reference](https://doc.rust-lang.org/reference/items/traits.html#dyn-compatibility) |
| `&s` | Shared **borrow** [Book](https://doc.rust-lang.org/book/ch04-02-references-and-borrowing.html) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/scope/borrow.html) [std](https://doc.rust-lang.org/std/borrow/trait.Borrow.html) (e.g., addr., len, vtable, … of _this_ `s`, like `0x1234`). |
| ↳  `&mut s` | Exclusive borrow that allows **mutability**. [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/scope/borrow/mut.html) |
| `*const S` | Immutable **raw pointer type** [Book](https://doc.rust-lang.org/book/ch19-01-unsafe-rust.html#dereferencing-a-raw-pointer) [std](https://doc.rust-lang.org/std/primitive.pointer.html) [Reference](https://doc.rust-lang.org/reference/types.html#raw-pointers-const-and-mut) w/o memory safety. |
| ↳  `*mut S` | Mutable raw pointer type w/o memory safety. |
| ↳  `&raw const s` | Create raw pointer w/o going through ref.; _c_. `ptr:addr_of!()` [std](https://doc.rust-lang.org/std/ptr/macro.addr_of.html)  **[Advanced]**   |
| ↳  `&raw mut s` | Same, but mutable.  **[Unstable / nightly]**  Needed for unaligned, packed fields.  **[Advanced]**  |
| `ref s` | **Bind by reference**, [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/scope/borrow/ref.html) makes binding reference type.  **[Deprecated / outdated]** |
| ↳  `let ref r = s;` | Equivalent to `let r = &s`. |
| ↳  `let S { ref mut x } = s;` | Mut. ref binding (`let x = &mut s.x`), shorthand destructuring [See section](https://cheats.rs/#pattern-matching) version. |
| `*r` | **Dereference** [Book](https://doc.rust-lang.org/book/ch15-02-deref.html) [std](https://doc.rust-lang.org/std/ops/trait.Deref.html) [Nomicon](https://doc.rust-lang.org/nightly/nomicon/vec-deref.html) a reference `r` to access what it points to. |
| ↳  `*r = s;` | If `r` is a mutable reference, move or copy `s` to target memory. |
| ↳  `s = *r;` | Make `s` a copy of whatever `r` references, if that is `Copy`. |
| ↳  `s = *r;` | Won't work  **[Pitfall / intentionally wrong]**  if `*r` is not `Copy`, as that would move and leave empty. |
| ↳  `s = *my_box;` | Special case[Link](https://web.archive.org/web/20230130111147/https://old.reddit.com/r/rust/comments/b4so6i/what_is_exactly/ej8xwg8/) for **`Box`**[std](https://doc.rust-lang.org/std/boxed/index.html) that can move out b'ed content not `Copy`. |
| `'a`  | A **lifetime parameter**, [Book](https://doc.rust-lang.org/book/ch10-00-generics.html) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/scope/lifetime.html) [Nomicon](https://doc.rust-lang.org/nightly/nomicon/lifetimes.html) [Reference](https://doc.rust-lang.org/reference/items/generics.html#type-and-lifetime-parameters) duration of a flow in static analysis. |
| ↳   `&'a S`  | Only accepts address of some `s`; address existing `'a` or longer. |
| ↳   `&'a mut S`  | Same, but allow address content to be changed. |
| ↳   `struct S<'a> {}`  | Signals this `S` will contain address with lt. `'a`. Creator of `S` decides `'a`. |
| ↳  `trait T<'a> {}` | Signals any `S`, which `impl T for S`, might contain address. |
| ↳   `fn f<'a>(t: &'a T)`  | Signals this function handles some address. Caller decides `'a`. |
| `'static`  | Special lifetime lasting the entire program execution. |

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

### Organizing Code

Segment projects into smaller units and minimize dependencies.

| Example | Explanation |
|---------|-------------|
| `mod m {}`  | Define a **module**, [Book](https://doc.rust-lang.org/book/ch07-02-defining-modules-to-control-scope-and-privacy.html) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/mod.html#modules) [Reference](https://doc.rust-lang.org/reference/items/modules.html#modules) get definition from inside `{}`. [See section](https://cheats.rs/#project-anatomy) |
| `mod m;`  | Define a module, get definition from `m.rs` or `m/mod.rs`. [See section](https://cheats.rs/#project-anatomy)|
| `a::b` | Namespace **path** [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/mod/use.html) [Reference](https://doc.rust-lang.org/reference/paths.html) to element `b` within `a` (`mod`, `enum`, …). |
| ↳  `::b` | Search `b` in **crate root**  **[Edition '15]**  [Reference](https://doc.rust-lang.org/reference/glossary.html#crate) or **ext. prelude**;  **[Edition '18]**  [Reference](https://doc.rust-lang.org/reference/names/preludes.html#extern-prelude) **global path**. [Reference](https://doc.rust-lang.org/reference/paths.html#path-qualifiers)  **[Deprecated / outdated]**   |
| ↳  `crate::b` | Search `b` in crate root.  **[Edition '18]**  |
| ↳  `self::b`  | Search `b` in current module. |
| ↳  `super::b`  | Search `b` in parent module. |
| `use a::b;`  | **Use** [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/mod/use.html#the-use-declaration) [Reference](https://doc.rust-lang.org/reference/items/use-declarations.html) `b` directly in this scope without requiring `a` anymore. |
| `use a::{b, c};` | Same, but bring `b` and `c` into scope. |
| `use a::b as x;`  | Bring `b` into scope but name `x`, like `use std::error::Error as E`. |
| `use a::b as _;`  | Bring `b` anon. into scope, useful for traits with conflicting names. |
| `use a::*;`  | Bring everything from `a` in, only recomm. if `a` is some **prelude**. [std](https://doc.rust-lang.org/std/prelude/index.html#other-preludes)  [Link](https://stackoverflow.com/questions/36384840/what-is-the-prelude) |
| `pub use a::b;`  | Bring `a::b` into scope and reexport from here. |
| `pub T`  | "Public if parent path is public" **visibility** [Book](https://doc.rust-lang.org/book/ch07-02-defining-modules-to-control-scope-and-privacy.html) [Reference](https://doc.rust-lang.org/reference/visibility-and-privacy.html) for `T`.  |
| ↳  `pub(crate) T` | Visible at most^(1) in current crate.  |
| ↳  `pub(super) T`  | Visible at most^(1) in parent.  |
| ↳  `pub(self) T`  | Visible at most^(1) in current module (default, same as no `pub`).  |
| ↳  `pub(in a::b) T`  | Visible at most^(1) in ancestor `a::b`.  |
| `extern crate a;` | Declare dependency on external **crate**; [Book](https://doc.rust-lang.org/book/ch02-00-guessing-game-tutorial.html#using-a-crate-to-get-more-functionality) [Reference](https://doc.rust-lang.org/reference/items/extern-crates.html#extern-crate-declarations)  **[Deprecated / outdated]**  just `use a::b` in  **[Edition '18]** .  |
| `extern "C" {}`  | _Declare_ external dependencies and ABI (e.g., `"C"`) from **FFI**. [Book](https://doc.rust-lang.org/book/ch19-01-unsafe-rust.html#using-extern-functions-to-call-external-code) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/std_misc/ffi.html#foreign-function-interface) [Nomicon](https://doc.rust-lang.org/nightly/nomicon/ffi.html#calling-foreign-functions) [Reference](https://doc.rust-lang.org/reference/items/external-blocks.html#external-blocks) |
| `extern "C" fn f() {}`  | _Define_ function to be exported with ABI (e.g., `"C"`) to FFI. |

**Notes:**

^(1) Items in child modules always have access to any item, regardless if `pub` or not.

### Type Aliases and Casts

Short-hand names of types, and methods to convert one type to another.

| Example | Explanation |
|---------|-------------|
| `type T = S;`  | Create a **type alias**, [Book](https://doc.rust-lang.org/book/ch19-04-advanced-types.html#creating-type-synonyms-with-type-aliases) [Reference](https://doc.rust-lang.org/reference/items/type-aliases.html#type-aliases) i.e., another name for `S`. |
| `Self`  | Type alias for **implementing type**, [Reference](https://doc.rust-lang.org/reference/types.html#self-types) e.g., `fn new() -> Self`. |
| `self`  | **Method subject** [Book](https://doc.rust-lang.org/book/ch05-03-method-syntax.html#method-syntax) [Reference](https://doc.rust-lang.org/reference/items/associated-items.html#methods) in `fn f(self) {}`, e.g., akin to `fn f(self: Self) {}`. |
|  ↳   `&self`  | Same, but refers to self as borrowed, would equal `f(self: &Self)`|
|  ↳   `&mut self`  | Same, but mutably borrowed, would equal `f(self: &mut Self)` |
|  ↳   `self: Box<Self>`  | [**Arbitrary self type**](https://github.com/withoutboats/rfcs/blob/arbitray-receivers/text/0000-century-of-the-self-type.md), add methods to smart ptrs (`my_box.f_of_self()`). |
| `<S as T>`  | **Disambiguate** [Book](https://doc.rust-lang.org/book/ch19-03-advanced-traits.html#fully-qualified-syntax-for-disambiguation-calling-methods-with-the-same-name) [Reference](https://doc.rust-lang.org/reference/expressions/call-expr.html#disambiguating-function-calls) type `S` as trait `T`, e.g., `<S as T>::f()`. |
| `a::b as c`  | In `use` of symbol, import `S` as `R`, e.g., `use a::S as R`. |
| `x as u32`  | Primitive **cast**, [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/types/cast.html#casting) [Reference](https://doc.rust-lang.org/reference/expressions/operator-expr.html#type-cast-expressions) may truncate and be a bit surprising. ^(1) [Nomicon](https://doc.rust-lang.org/nightly/nomicon/casts.html) |

**Notes:**

^(1) See [**Type Conversions**](https://cheats.rs/#type-conversions) below for all the ways to convert between types.

### Macros & Attributes

Code generation constructs expanded before the actual compilation happens.

| Example |  Explanation |
|---------|---------|
| `m!()` |  **Macro** [Book](https://doc.rust-lang.org/book/ch19-06-macros.html) [std](https://doc.rust-lang.org/std/index.html#macros) [Reference](https://doc.rust-lang.org/reference/macros.html) invocation, also `m!{}`, `m![]` (depending on macro). |
| `#[attr]`  | Outer **attribute**, [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/attribute.html) [Reference](https://doc.rust-lang.org/reference/attributes.html) annotating the following item. |
| `#![attr]` | Inner attribute, annotating the _upper_, surrounding item. |

| Inside Macros ^(1) |  Explanation |
|---------|---------|
| `$x:ty`  | Macro capture, the `:ty` **fragment specifier** [Reference](https://doc.rust-lang.org/reference/macros-by-example.html#metavariables) ^(,2) declares what `$x` may be. |
| `$x` |  Macro substitution, e.g., use the captured `$x:ty` from above. |
| `$(x),*` | Macro **repetition** [Reference](https://doc.rust-lang.org/reference/macros-by-example.html#repetitions) _zero or more times_.|
| ↳  `$(x),+` | Same, but _one or more times_. |
| ↳  `$(x)?` | Same, but _zero or one time_ (separator doesn't apply). |
| ↳  `$(x)<<+` | In fact separators other than `,` are also accepted. Here: `<<`. |

**Notes:**

^(1) Applies to **'macros by example'**. [Reference](https://doc.rust-lang.org/reference/macros-by-example.html)

^(2) See [**Tooling Directives**](https://cheats.rs/#tooling-directives) below for all fragment specifiers.

### Pattern Matching

Constructs found in `match` or `let` expressions, or function parameters.

| Example | Explanation |
|---------|-------------|
| `match m {}` | Initiate **pattern matching**, [Book](https://doc.rust-lang.org/book/ch06-02-match.html) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/flow_control/match.html) [Reference](https://doc.rust-lang.org/reference/expressions/match-expr.html) then use match arms, _c_. next table. |
| `let S(x) = get();`  | Notably, `let` also **destructures** [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/flow_control/match/destructuring.html) similar to the table below. |
|  ↳  `let S { x } = s;` | Only `x` will be bound to value `s.x`. |
|  ↳  `let (_, b, _) = abc;` | Only `b` will be bound to value `abc.1`. |
|  ↳  `let (a, ..) = abc;` | Ignoring 'the rest' also works. |
|  ↳  `let (.., a, b) = (1, 2);` | Specific bindings take precedence over 'the rest', here `a` is `1`, `b` is `2`. |
|  ↳  `let s @ S { x } = get();`  | Bind `s` to `S` while `x` is bnd. to `s.x`, **pattern binding**, [Book](https://doc.rust-lang.org/book/ch18-03-pattern-syntax.html#-bindings) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/flow_control/match/binding.html#binding) [Reference](https://doc.rust-lang.org/reference/patterns.html#identifier-patterns) _c_. below  **[Advanced]**  |
|  ↳  `let w @ t @ f = get();`  | Stores 3 copies of `get()` result in each `w`, `t`, `f`.  **[Advanced]**  |
|  ↳  `let (\|x\| x) = get();` | Pathological or-pattern,[See section](https://cheats.rs/#pattern-matching) **not** closure. **[Pitfall / intentionally wrong]**  Same as `let x = get();`  **[Advanced]**   |
| `let Ok(x) = f();` | **Won't** work  **[Pitfall / intentionally wrong]**  if p. can be **refuted**, [Reference](https://doc.rust-lang.org/reference/expressions/if-expr.html#if-let-expressions) use `let else` or `if let` instead. |
| `let Ok(x) = f();` | But can work if alternatives uninhabited, e.g., `f` returns `Result<T, !>`  **[Edition 1.82+]**  |
| `let Ok(x) = f() else {};`  | Try to assign [RFC](https://rust-lang.github.io/rfcs/3137-let-else.html) if not `else {}` w. must `break`, `return`, `panic!`, …  **[Edition 1.65+]**   **[Useful]**  |
| `if let Ok(x) = f() {}`  | Branch if pattern can be assigned (e.g., `enum` variant), syntactic sugar. ^(*)|
| `if let … && let … { }`  | **Let chains**, [Reference](https://doc.rust-lang.org/reference/expressions/if-expr.html#r-expr.if.chains.bindings) use more than binding w.o. nesting.  **[Edition '24]** |
| `while let Ok(x) = f() {}`  | Equiv.; here keep calling `f()`, run `{}` as long as _p._ can be assigned. |
| `fn f(S { x }: S)`  | Function param. also work like `let`, here `x` bound to `s.x` of `f(s)`.  **[Advanced]**  |

**Notes:**

^(*) Desugars to `match get() { Some(x) => {}, _ => () }`.

Pattern matching arms in `match` expressions. Left side of these arms can also be found in `let` expressions.

| Within Match Arm | Explanation |
|---------|-------------|
|  `E::A => {}` | Match enum variant `A`, _c_. **pattern matching**. [Book](https://doc.rust-lang.org/book/ch06-02-match.html) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/flow_control/match.html) [Reference](https://doc.rust-lang.org/reference/expressions/match-expr.html) |
|  `E::B ( .. ) => {}` | Match enum tuple variant `B`, ignoring any index. |
|  `E::C { .. } => {}` | Match enum struct variant `C`, ignoring any field. |
|  `S { x: 0, y: 1 } => {}` | Match _s._ with specific values (only `s` with `s.x` of `0` and `s.y` of `1`). |
|  `S { x: a, y: b } => {}` | Match _s._ with _any_  **[Pitfall / intentionally wrong]**  values and bind `s.x` to `a` and `s.y` to `b`. |
|  ↳  `S { x, y } => {}` | Same, but shorthand with `s.x` and `s.y` bound as `x` and `y` respectively. |
|  `S { .. } => {}` | Match struct with any values. |
|  `D => {}` | Match enum variant `E::D` if `D` in `use`. |
|  `D => {}` | Match anything, bind `D`; possibly false friend  **[Pitfall / intentionally wrong]**  of `E::D` if `D` not in `use`. |
|  `_ => {}` | Proper wildcard that matches anything / "all the rest". |
| `0 \| 1 => {}` | Pattern alternatives, **or-patterns**. [RFC](https://rust-lang.github.io/rfcs/2535-or-patterns.html)|
| ↳   `E::A \| E::Z => {}` | Same, but on enum variants. |
| ↳   `E::C {x} \| E::D {x} => {}` | Same, but bind `x` if all variants have it. |
| ↳   `Some(A \| B) => {}` | Same, can also match alternatives deeply nested. |
| ↳   `\|x\| x => {}` | **Pathological or-pattern**,[See section](https://cheats.rs/#pattern-matching) **[Pitfall / intentionally wrong]**  leading `\|` ignored, is just `x \| x`, thus `x`.  **[Advanced]**  |
| ↳   `\|x => {}` | Similar, leading `\|` ignored.  **[Advanced]**  |
|  `(a, 0) => {}` | Match tuple with any value for `a` and `0` for second. |
|  `[a, 0] => {}` | **Slice pattern**, [Reference](https://doc.rust-lang.org/reference/patterns.html#slice-patterns) [Link](https://doc.rust-lang.org/edition-guide/rust-2018/slice-patterns.html) match array with any value for `a` and `0` for second. |
|  ↳  `[1, ..] => {}` | Match array starting with `1`, any value for rest; **subslice pattern**.  [Reference](https://doc.rust-lang.org/reference/patterns.html#rest-patterns) [RFC](https://rust-lang.github.io/rfcs/2359-subslice-pattern-syntax.html) |
|  ↳  `[1, .., 5] => {}` | Match array starting with `1`, ending with `5`. |
|  ↳  `[1, x @ .., 5] => {}` | Same, but also bind `x` to slice representing middle (_c._ pattern binding).  |
|  ↳  `[a, x @ .., b] => {}` | Same, but match any first, last, bound as `a`, `b` respectively.  |
|  `1 .. 3 => {}` | **Range pattern**, [Book](https://doc.rust-lang.org/book/ch18-03-pattern-syntax.html#matching-ranges-of-values-with-) [Reference](https://doc.rust-lang.org/reference/patterns.html#range-patterns) here matches `1` and `2`; partially unstable.  **[Unstable / nightly]**  |
|  ↳  `1 ..= 3 => {}` | Inclusive range pattern, matches `1`, `2` and `3`. |
|  ↳  `1 .. => {}` | Open range pattern, matches `1` and any larger number.  |
| `x @ 1..=5 => {}` | Bind matched to `x`; **pattern binding**, [Book](https://doc.rust-lang.org/book/ch18-03-pattern-syntax.html#-bindings) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/flow_control/match/binding.html#binding) [Reference](https://doc.rust-lang.org/reference/patterns.html#identifier-patterns) here `x` would be `1` … `5`.  |
| ↳  `Err(x @ Error {..}) => {}` | Also works nested, here `x` binds to `Error`, esp. useful with `if` below. |
| `S { x } if x > 10 => {}`  | Pattern **match guards**, [Book](https://doc.rust-lang.org/book/ch18-03-pattern-syntax.html#extra-conditionals-with-match-guards) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/flow_control/match/guard.html#guards) [Reference](https://doc.rust-lang.org/reference/expressions/match-expr.html#match-guards) condition must be true as well to match. |

### Generics & Constraints

Generics combine with type constructors, traits and functions to give your users more flexibility.

| Example | Explanation |
|---------|-------------|
| `struct S<T> …`  | A **generic** [Book](https://doc.rust-lang.org/book/ch10-01-syntax.html) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/generics.html) type with a type parameter (`T` is placeholder here). |
| `S<T> where T: R`  | **Trait bound**, [Book](https://doc.rust-lang.org/book/ch10-02-traits.html#using-trait-bounds-to-conditionally-implement-methods) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/generics/bounds.html) [Reference](https://doc.rust-lang.org/reference/trait-bounds.html#trait-and-lifetime-bounds) limits allowed `T`, guarantees `T` has trait `R`. |
| ↳  `where T: R, P: S`  | **Independent trait bounds**, here one for `T` and one for (not shown) `P`.|
| ↳  `where T: R, S`  | Compile error,  **[Pitfall / intentionally wrong]**  you probably want compound bound `R + S` below. |
| ↳  `where T: R + S`  | **Compound trait bound**, [Book](https://doc.rust-lang.org/book/ch10-02-traits.html#specifying-multiple-trait-bounds-with-the--syntax) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/generics/multi_bounds.html) `T` must fulfill `R` and `S`. |
| ↳  `where T: R + 'a`  | Same, but w. lifetime. `T` must fulfill `R`, if `T` has _lt._, must outlive `'a`. |
| ↳  `where T: ?Sized` | Opt out of a pre-defined trait bound, here `Sized`.  **[Missing source / explanation]**  |
| ↳  `where T: 'a` | Type **lifetime bound**; [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/scope/lifetime/lifetime_bounds.html) if T has references, they must outlive `'a`.  |
| ↳  `where T: 'static` | Same; does _not_ mean value `t` _will_  **[Pitfall / intentionally wrong]**  live `'static`, only that it could. |
| ↳  `where 'b: 'a` | Lifetime `'b` must live at least as long as (i.e., _outlive_) `'a` bound. |
| ↳  `where u8: R<T>`  | Can also make conditional statements involving _other_ types.  **[Advanced]**  |
| `S<T: R>`  | Short hand bound, almost same as above, shorter to write. |
| `S<const N: usize>` | **Generic const bound**; [Reference](https://doc.rust-lang.org/reference/items/generics.html#const-generics) user of type `S` can provide constant value `N`. |
| ↳  `S<10>` | Where used, const bounds can be provided as primitive values. |
| ↳  `S<{5+5}>` | Expressions must be put in curly brackets. |
| `S<T = R>` | **Default parameters**; [Book](https://doc.rust-lang.org/book/ch19-03-advanced-traits.html#default-generic-type-parameters-and-operator-overloading) makes `S` a bit easier to use, but keeps flexible. |
| ↳  `S<const N: u8 = 0>` | Default parameter for constants; e.g., in `f(x: S) {}` param `N` is `0`. |
| ↳  `S<T = u8>` | Default parameter for types, e.g., in `f(x: S) {}` param `T` is `u8`. |
| `S<'_>` | Inferred **anonymous lt.**; asks compiler to _'figure it out'_ if obvious.  |
| `S<_>` | Inferred **anonymous type**, e.g., as `let x: Vec<_> = iter.collect()`  |
| `S::<T>` | **Turbofish** [std](https://doc.rust-lang.org/std/iter/trait.Iterator.html#method.collect) call site type disambiguation, e.g., `f::<u32>()`. |
| ↳  `E::<T>::A` | Generic enums can receive their type parameters on their type `E` … |
| ↳  `E::A::<T>` | … or at the variant (`A` here); allows `Ok::<R, E>(r)` and similar. |
| `trait T<X> {}`  | A trait generic over `X`. Can have multiple `impl T for S` (one per `X`). |
| `trait T { type X; }`  | Defines **associated type** [Book](https://doc.rust-lang.org/book/ch19-03-advanced-traits.html#specifying-placeholder-types-in-trait-definitions-with-associated-types) [Reference](https://doc.rust-lang.org/reference/items/associated-items.html#associated-types) [RFC](https://rust-lang.github.io/rfcs/0195-associated-items.html) `X`. Only one `impl T for S` possible. |
| `trait T { type X<G>; }`  | Defines **generic associated type** (GAT), [RFC](https://rust-lang.github.io/rfcs/1598-generic_associated_types.html) `X` can be generic `Vec<>`. |
| `trait T { type X<'a>; }`  | Defines a GAT generic over a lifetime. |
| ↳  `type X = R;`  | Set associated type within `impl T for S { type X = R; }`. |
| ↳  `type X<G> = R<G>;`  | Same for GAT, e.g., `impl T for S { type X<G> = Vec<G>; }`. |
| `impl<T> S<T> {}`  | Impl. `fn`'s for any `T` in `S<T>` **_generically_**, [Reference](https://doc.rust-lang.org/reference/items/implementations.html#generic-implementations) here `T` ty. parameter. |
| `impl S<T> {}`  | Impl. `fn`'s for exactly `S<T>` **_inherently_**, [Reference](https://doc.rust-lang.org/reference/items/implementations.html#inherent-implementations) here `T` specific type, e.g., `u8`.  |
| `fn f() -> impl T`  | **Existential types** (aka [_RPIT_](https://santiagopastorino.com/2022/10/20/what-rpits-rpitits-and-afits-and-their-relationship/)), [Book](https://doc.rust-lang.org/book/ch10-02-traits.html#returning-types-that-implement-traits) returns an unknown-to-caller `S` that `impl T`. |
| ↳  `-> impl T + 'a`  | Signals the hidden type lives at least as long as `'a`. [RFC](https://rust-lang.github.io/rfcs/3498-lifetime-capture-rules-2024.html#capturing-lifetimes)  |
| ↳  `-> impl T + use<'a>`  | Signals instead the hidden type captured lifetime `'a`, **use bound**. [Link](https://blog.rust-lang.org/2024/09/05/impl-trait-capture-rules.html)  **[Missing source / explanation]** |
| ↳  `-> impl T + use<'a, R>`  | Also signals the hidden type may have captured lifetimes from `R`. |
| ↳  `-> S<impl T>`  | The `impl T` part can also be used inside type arguments. |
| `fn f(x: &impl T)`  | Trait bound via "**impl traits**", [Book](https://doc.rust-lang.org/book/ch10-02-traits.html#trait-bound-syntax) similar to `fn f<S: T>(x: &S)` below. |
| `fn f(x: &dyn T)`  | Invoke `f` via **dynamic dispatch**, [Book](https://doc.rust-lang.org/book/ch17-02-trait-objects.html#using-trait-objects-that-allow-for-values-of-different-types) [Reference](https://doc.rust-lang.org/reference/types.html#trait-objects) `f` will not be instantiated for `x`. |
| `fn f<X: T>(x: X)`  | Fn. generic over `X`, `f` will be instantiated ('[monomorphized](https://en.wikipedia.org/wiki/Monomorphization)') per `X`. |
| `fn f() where Self: R;`  | In `trait T {}`, make `f` accessible only on types known to also `impl R`.  |
| ↳  `fn f() where Self: Sized;`  | Using `Sized` can opt `f` out of trait object vtable, enabling `dyn T`. |
| ↳  `fn f() where Self: R {}`  | Other `R` useful w. dflt. fn. (non dflt. would need be impl'ed anyway). |

### Higher-Ranked Items  **[Advanced]**

_Actual_ types and traits, abstract over something, usually lifetimes.

| Example | Explanation |
|---------|-------------|
| `for<'a>` | Marker for **higher-ranked bounds.** [Nomicon](https://doc.rust-lang.org/nightly/nomicon/hrtb.html) [Reference](https://doc.rust-lang.org/reference/trait-bounds.html#higher-ranked-trait-bounds)  **[Advanced]**  |
| ↳  `trait T: for<'a> R<'a> {}` | Any `S` that `impl T` would also have to fulfill `R` for any lifetime. |
| `fn(&'a u8)` | Function pointer type holding fn callable with **specific** lifetime `'a`. |
| `for<'a> fn(&'a u8)` | **Higher-ranked type**^(1) [Link](https://github.com/rust-lang/rust/issues/56105) holding fn call. with **any** _lt._; subtype[See section](https://cheats.rs/#type-conversions) of above. |
| ↳  `fn(&'_ u8)` | Same; automatically expanded to type `for<'a> fn(&'a u8)`. |
| ↳  `fn(&u8)` | Same; automatically expanded to type `for<'a> fn(&'a u8)`. |
| `dyn for<'a> Fn(&'a u8)` | Higher-ranked (trait-object) type, works like `fn` above. |
| ↳  `dyn Fn(&'_ u8)` | Same; automatically expanded to type `dyn for<'a> Fn(&'a u8)`. |
| ↳  `dyn Fn(&u8)` | Same; automatically expanded to type `dyn for<'a> Fn(&'a u8)`. |

**Notes:**

^(1) Yes, the `for<>` is part of the type, which is why you write `impl T for for<'a> fn(&'a u8)` below.

| Implementing Traits | Explanation |
|---------|-------------|
| `impl<'a> T for fn(&'a u8) {}` | For fn. pointer, where call accepts **specific** _lt._ `'a`, impl trait `T`.|
| `impl T for for<'a> fn(&'a u8) {}` | For fn. pointer, where call accepts **any** _lt._, impl trait `T`. |
| ↳  `impl T for fn(&u8) {}` | Same, short version. |

### Strings & Chars

Rust has several ways to create textual values.

| Example | Explanation |
|--------|-------------|
| `"..."` | **String literal**, [Reference](https://doc.rust-lang.org/reference/tokens.html#string-literals)^(, 1) a UTF-8 `&'static str`, [std](https://doc.rust-lang.org/std/primitive.str.html) supporting these escapes:  |
| ↳  `"\n\r\t\0\\"` | **Common escapes** [Reference](https://doc.rust-lang.org/reference/tokens.html#ascii-escapes), e.g., `"\n"` becomes _new line_. |
| ↳  `"\x36"` | **ASCII _e._** [Reference](https://doc.rust-lang.org/reference/tokens.html#ascii-escapes) up to `7f`, e.g., `"\x36"` would become `6`. |
| ↳  `"\u{7fff}"` | **Unicode _e._** [Reference](https://doc.rust-lang.org/reference/tokens.html#unicode-escapes) up to 6 digits, e.g., `"\u{7fff}"` becomes `翿`. |
| `r"..."` | **Raw string literal**. [Reference](https://doc.rust-lang.org/reference/tokens.html#raw-string-literals)^(, 1)UTF-8, but won't interpret any escape above. |
| `r#"..."#` | Raw string literal, UTF-8, but can also contain `"`. Number of `#` can vary.|
| `c"..."` | **C string literal**, [Reference](https://doc.rust-lang.org/reference/tokens.html#c-string-literals) a NUL-terminated `&'static CStr`, [std](https://doc.rust-lang.org/std/ffi/struct.CStr.html) for FFI.  **[Edition 1.77+]**   |
| `cr"..."`, `cr#"..."#` | Raw C string literal, combination analog to above.|
| `b"..."` | **Byte string literal**; [Reference](https://doc.rust-lang.org/reference/tokens.html#byte-and-byte-string-literals)^(, 1) constructs ASCII-only `&'static [u8; N]`. |
| `br"..."`, `br#"..."#` | Raw byte string literal, combination analog to above.|
| `b'x'` | ASCII **byte literal**, [Reference](https://doc.rust-lang.org/reference/tokens.html#byte-literals) a single `u8` byte.  |
| `'🦀'` | **Character literal**, [Reference](https://doc.rust-lang.org/reference/tokens.html#character-and-string-literals) fixed 4 byte unicode '**char**'. [std](https://doc.rust-lang.org/std/primitive.char.html) |

**Notes:**

^(1) Supports multiple lines out of the box. Just keep in mind `Debug`[See section](https://cheats.rs/#string-output) (e.g., `dbg!(x)` and `println!("{x:?}")`) might render them as `\n`, while `Display`[See section](https://cheats.rs/#string-output) (e.g., `println!("{x}")`) renders them _proper_.

### Documentation

Debuggers hate him. Avoid bugs with this one weird trick.

| Example | Explanation |
|--------|-------------|
| `///` | Outer line **doc comment**,^(1) [Book](https://doc.rust-lang.org/book/ch14-02-publishing-to-crates-io.html#making-useful-documentation-comments) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/meta/doc.html#documentation) [Reference](https://doc.rust-lang.org/reference/comments.html#doc-comments) use these on ty., traits, fn's, … |
| `//!` | Inner line doc comment, mostly used at top of file. |
| `//` | Line comment, use these to document code flow or _internals_. |
| `/* … */` | Block comment. ^(2)  **[Deprecated / outdated]**  |
| `/** … */` | Outer block doc comment. ^(2)  **[Deprecated / outdated]**  |
| `/*! … */` | Inner block doc comment. ^(2)  **[Deprecated / outdated]**  |

**Notes:**

^(1) [Tooling Directives](https://cheats.rs/#tooling-directives) outline what you can do inside doc comments.

^(2) Generally discouraged due to bad UX. If possible use equivalent line comment instead with IDE support.

### Miscellaneous

These sigils did not fit any other category but are good to know nonetheless.

| Example | Explanation |
|---------|-------------|
| `!` | Always empty **never type**. [Book](https://doc.rust-lang.org/book/ch19-04-advanced-types.html#the-never-type-that-never-returns) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/fn/diverging.html#diverging-functions) [std](https://doc.rust-lang.org/std/primitive.never.html) [Reference](https://doc.rust-lang.org/reference/types.html#never-type) |
| ↳  `fn f() -> ! {}` | Function that never ret.; compat. with any _ty._ e.g., `let x: u8 = f();` |
| ↳  `fn f() -> Result<(), !> {}` | Function that must return `Result` but signals it can never `Err`.  **[Unstable / nightly]**  |
| ↳  `fn f(x: !) {}` | Function that exists, but can never be called. Not very useful.  **[Advanced]**   **[Unstable / nightly]**  |
| `_` | Unnamed **wildcard** [Reference](https://doc.rust-lang.org/reference/patterns.html#wildcard-pattern) variable binding, e.g., `\|x, _\| {}`.|
| ↳  `let _ = x;`  | Unnamed assign. is no-op, does **not**  **[Pitfall / intentionally wrong]**  move out `x` or preserve scope! |
| ↳  `_ = x;`  | You can assign _anything_ to `_` without `let`, i.e.,  `_ = ignore_rval();`  **[Useful]**  |
| `_x` | Variable binding that won't emit _unused variable_ warnings. |
| `1_234_567` | Numeric separator for visual clarity. |
| `1_u8` | Type specifier for **numeric literals** [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/types/literals.html#literals) [Reference](https://doc.rust-lang.org/reference/tokens.html#number-literals)  (also `i8`, `u16`, …). |
| `0xBEEF`, `0o777`, `0b1001`  | Hexadecimal (`0x`), octal (`0o`) and binary (`0b`) integer literals. |
| `12.3e4`, `1E-8`  | **Scientific notation** for floating-point literals. [Reference](https://doc.rust-lang.org/reference/tokens.html#floating-point-literals) |
| `r#foo` | A **raw identifier** [Book](https://doc.rust-lang.org/book/appendix-01-keywords.html#raw-identifiers) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/compatibility/raw_identifiers.html#raw-identifiers) for edition compatibility.  **[Advanced]**  |
| `'r#a` | A **raw lifetime label**  **[Missing source / explanation]**  for edition compatibility.  **[Advanced]**  |
| `x;` | **Statement** [Reference](https://doc.rust-lang.org/reference/statements.html) terminator, _c_. **expressions** [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/expression.html) [Reference](https://doc.rust-lang.org/reference/expressions.html) |

### Common Operators

Rust supports most operators you would expect (`+`, `*`, `%`, `=`, `==`, …), including **overloading**. [std](https://doc.rust-lang.org/std/ops/index.html) Since they behave no differently in Rust we do not list them here.

---

# Behind the Scenes

Arcane knowledge that may do terrible things to your mind, highly recommended.

## The Abstract Machine

Like `C` and `C++`, Rust is based on an _abstract machine_.

### Overview

**Diagram 1 — textual relationships:**

```text
relationships:
  entry: machine [bad]: Rust
  →
  entry: machine [bad]: CPU
  note: **[Pitfall / intentionally wrong]** Misleading.
```

**Diagram 2 — textual relationships:**

```text
relationships:
  entry: machine [good]: Rust
  →
  entry [diagram-width=120px]: machine [good]: Abstract Machine
  →
  entry: machine [good]: CPU
  note: Correct.
```

With rare exceptions you are never 'allowed to reason' about the actual CPU. You write code for an _abstracted_ CPU. Rust then (sort of) understands what you want, and translates that into actual RISC-V / x86 / … machine code.

This _abstract machine_
- is not a runtime, and does not have any runtime overhead, but is a _computing model abstraction_,
- contains concepts such as memory regions (_stack_, …), execution semantics, …
- _knows_ and _sees_ things your CPU might not care about,
- is de-facto a contract between you and the compiler,
- and **exploits all of the above for optimizations**.

### Misconceptions

On the left things people may incorrectly assume they _should get away with_ if Rust targeted CPU directly. On the right things you'd interfere with if in reality if you violate the AM contract.

| Without AM | With AM |
|---------|-------------|
| `0xffff_ffff` would make a valid `char`.  **[Pitfall / intentionally wrong]**  | AM may exploit _'invalid'_ bit patterns to pack unrelated data.  |
| `0xff` and `0xff` are same pointer.  **[Pitfall / intentionally wrong]**  | AM pointers can have **provenance** [std](https://doc.rust-lang.org/std/ptr/index.html#provenance) for optimization.  |
| Any r/w on pointer `0xff` always fine.  **[Pitfall / intentionally wrong]**  | AM may issue cache-friendly ops since _'no read possible'_.  |
| Reading un-init just gives random value.  **[Pitfall / intentionally wrong]**  | AM _'knows'_ read impossible, may remove all related code.  |
| Data race just gives random value.  **[Pitfall / intentionally wrong]**  | AM may split R/W, produce _impossible_ value. [See section](https://cheats.rs/#atomics-cache)  |
| Null ref. is just `0x0` in some register.  **[Pitfall / intentionally wrong]**  | Holding `0x0` in reference summons Cthulhu.  |

> This table is only to outline what the AM does. Unlike C or C++, Rust never lets you do the wrong thing unless you force it with `unsafe`. [See section](https://cheats.rs/#unsafe-unsound-undefined)

## Language Sugar

If something works that "shouldn't work now that you think about it", it might be due to one of these.

| Name | Description |
|--------| -----------|
| **Coercions** [Nomicon](https://doc.rust-lang.org/nightly/nomicon/coercions.html) | _Weakens_ types to match signature, e.g., `&mut T` to `&T`; _c_. _type conv._ [See section](https://cheats.rs/#type-conversions)  |
| **Deref** [Nomicon](https://doc.rust-lang.org/nightly/nomicon/vec-deref.html) [Link](https://stackoverflow.com/questions/28519997/what-are-rusts-exact-auto-dereferencing-rules) | [Derefs](https://doc.rust-lang.org/std/ops/trait.Deref.html) `x: T` until `*x`, `**x`, … compatible with some target `S`. |
| **Prelude** [std](https://doc.rust-lang.org/std/prelude/index.html) | Automatic import of basic items, e.g., `Option`, `drop()`, …
| **Reborrow** [Link](https://quinedot.github.io/rust-learning/st-reborrow.html) | Since `x: &mut T` can't be copied; moves new `&mut *x` instead. |
| **Lifetime Elision** [Book](https://doc.rust-lang.org/book/ch10-03-lifetime-syntax.html#lifetime-elision) [Nomicon](https://doc.rust-lang.org/nightly/nomicon/lifetime-elision.html#lifetime-elision) [Reference](https://doc.rust-lang.org/reference/lifetime-elision.html#lifetime-elision) | Allows you to write `f(x: &T)`, instead of `f<'a>(x: &'a T)`, for brevity. |
| **Lifetime Extensions** [Link](https://blog.m-ou.se/super-let/)  [Reference](https://doc.rust-lang.org/reference/destructors.html#temporary-lifetime-extension) | In `let x = &tmp().f` and similar hold on to temporary past line. |
| **Method Resolution** [Reference](https://doc.rust-lang.org/reference/expressions/method-call-expr.html) | Derefs or borrow `x` until `x.f()` works. |
| **Match Ergonomics** [RFC](https://rust-lang.github.io/rfcs/2005-match-ergonomics.html) | Repeatedly deref. [scrutinee](https://doc.rust-lang.org/stable/reference/glossary.html#scrutinee) and adds `ref` and `ref mut` to bindings. |
| **Rvalue Static Promotion** [RFC](https://rust-lang.github.io/rfcs/1414-rvalue_static_promotion.html)   **[Advanced]**  | Makes refs. to constants `'static`, e.g., `&42`, `&None`, `&mut []`. |
| **Dual Definitions** [RFC](https://rust-lang.github.io/rfcs/1506-adt-kinds.html#tuple-structs)  **[Advanced]**  | Defining one (e.g., `struct S(u8)`) implicitly def. another (e.g., `fn S`).  |
| **Drop Hidden Flow** [Reference](https://doc.rust-lang.org/reference/destructors.html)  **[Advanced]**  | At end of blocks `{ ... }` or `_` assignment, may call `T::drop()`. [std](https://doc.rust-lang.org/std/ops/trait.Drop.html) |
| **Drop Not Callable** [std](https://doc.rust-lang.org/std/ops/trait.Drop.html)  **[Advanced]**  | Compiler forbids explicit `T::drop()` call, must use `mem::drop()`. [std](https://doc.rust-lang.org/std/mem/fn.drop.html) |
| **Auto Traits** [Reference](https://doc.rust-lang.org/reference/special-types-and-traits.html#auto-traits) | Always impl'ed for your types, closures, futures if possible. |

> **Opinion**  **[Opinion]**  — These features make your life easier _using_ Rust, but stand in the way of _learning_ it. If you want to develop a _genuine understanding_, spend some extra time exploring them.

## Memory & Lifetimes

An illustrated guide to moves, references and lifetimes.

### Types & Moves

**Diagram 3 — textual state:**

```text
state:
  section header: Application Memory
  memory row:
    byte map: byte × 41
    values: value [t, byte2, hide, diagram-left=57px]: S(1)
    labels: label [diagram-right=10px]
    subtext: Application Memory
```

- Application memory is just array of bytes on low level.
- Operating environment usually segments that, amongst others, into:
    - **stack** (small, low-overhead memory,^(1) most _variables_ go here),
    - **heap** (large, flexible memory, but always handled via stack proxy like `Box<T>`),
    - **static** (most commonly used as resting place for `str` part of `&str`),
    - **code** (where bitcode of your functions reside).
- Most tricky part is tied to **how stack evolves**, which is **our focus**.

**Notes:**

^(1) For fixed-size values stack is trivially manageable: _take a few bytes more while you need them, discarded once you leave_. However, giving out pointers to these _transient_ locations form the very essence of why _lifetimes_ exist; and are the subject of the rest of this chapter.

**Diagram 4 — textual state:**

```text
state:
  section header: Variables
  memory row:
    byte map:
      byte × 7
      byte [t] × 2
      byte × 32
    values:
      value [t, byte2, hide, diagram-left=57px]: S(1)
      value [t, byte2, diagram-left=97.5px]: S(1)
    labels:
      label [byte2, hide, diagram-left=57px]: a
      label [byte2, diagram-left=97.5px]: t
    subtext: Variables
```

```
let t = S(1);
```


- Reserves memory location with name `t` of type `S` and the value `S(1)` stored inside.
- If declared with `let` that location lives on stack. ^(1)
- Note the **linguistic ambiguity**, in the term **_variable_**, it can mean the:
    1. **name** of the location in the source file ("rename that variable"),
    1. **location** in a compiled app, `0x7` ("tell me the address of that variable"),
    1. **value** contained within, `S(1)` ("increment that variable").
- Specifically towards the compiler `t` can mean **location of** `t`, here `0x7`, and **value within** `t`, here `S(1)`.

**Notes:**

^(1) Compare above,[See section](https://cheats.rs/#data-structures) true for fully synchronous code, but `async` stack frame might placed it on heap via runtime.

**Diagram 5 — textual state:**

```text
state:
  section header: Move Semantics
  memory row:
    byte map:
      byte × 3
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 32
    values: value [t, byte2, diagram-left=57px]: S(1)
    labels:
      label [byte2, diagram-left=57px]: a
      label [byte2, diagram-left=97.5px]: t
    subtext: Moves
```

```
let a = t;
```


- This will **move** value within `t` to location of `a`, or copy it, if `S` is `Copy`.
- After move location `t` is **invalid** and cannot be read anymore.
    - Technically the bits at that location are not really _empty_, but _undefined_.
    - If you still had access to `t` (via `unsafe`) they might still _look_ like valid `S`, but
    any attempt to use them as valid `S` is undefined behavior. [See section](https://cheats.rs/#unsafe-unsound-undefined)
- We do not cover `Copy` types explicitly here. They change the rules a bit, but not much:
    - They won't be dropped.
    - They never leave behind an 'empty' variable location.

**Diagram 6 — textual state:**

```text
state:
  section header: Type Safety
  memory row:
    byte map:
      byte × 11
      byte [t] × 2
      byte × 28
    values:
      FAILED [diagram-left=231.5px]: value [atomic, byte4]: M { … }
      DENIED [diagram-left=141px]: ⛔
    labels:
      label [byte2, diagram-left=57px]: 
      label [byte2, diagram-left=170px]: c
    subtext: Type Safety
```

```
let c: S = M::new();
```


- The **type of a variable** serves multiple important purposes, it:
    1. dictates how the underlying bits are to be interpreted,
    1. allows only well-defined operations on these bits
    1. prevents random other values or bits from being written to that location.
- Here assignment fails to compile since the bytes of `M::new()` cannot be converted to form of type `S`.
- **Conversions between types will _always_ fail** in general, **unless explicit rule allows it** (coercion, cast, …).

**Diagram 7 — textual state:**

```text
state:
  section header: Scope & Drop
  memory row:
    byte map:
      byte × 3
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 28
    values:
      drop:
        value [t, byte2, diagram-left=57px]: S(1)
        drop arrow [diagram-left=37px]: ▼
      value [t, byte2, hide, diagram-left=87.5px]: C(2)
      drop:
        value [t, byte2, diagram-left=128px]: S(2)
        drop arrow [diagram-left=107px]: ▼
      FAILED [diagram-left=-27.5px]: value [t, byte2, diagram-left=128px]: S(3)
    labels:
      label [byte2, diagram-left=57px]: 
      label [byte2, diagram-left=97.5px]: t
    subtext: Scope & Drop
```

```
{
    let mut c = S(2);
    c = S(3);  // <- Drop called on `c` before assignment.
    let t = S(1);
    let a = t;
}   // <- Scope of `a`, `t`, `c` ends here, drop called on `a`, `c`.
```


- Once the 'name' of a non-vacated variable goes out of (drop-)**scope**, the contained value is **dropped**.
    - Rule of thumb: execution reaches point where name of variable leaves `{}`-block it was defined in
    - In detail more tricky, esp. temporaries, …
- Drop also invoked when new value assigned to existing variable location.
- In that case **`Drop::drop()`** is called on the location of that value.
    - In the example above `drop()` is called on `a`, twice on `c`, but not on `t`.
- Most non-`Copy` values get dropped most of the time; exceptions include `mem::forget()`, `Rc` cycles, `abort()`.

### Call Stack

**Diagram 8 — textual state:**

```text
state:
  section header: Stack Frame
  memory row:
    byte map:
      byte × 3
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 32
    values: value [t, byte2, diagram-left=57px]: S(1)
    labels:
      label [byte2, diagram-left=57px]: a
      label [byte2, diagram-left=97.5px]: x
    subtext: Function Boundaries
```

```
fn f(x: S) { … }

let a = S(1); // <- We are here
f(a);
```


- When a **function is called**, memory for parameters (and return values) are reserved on stack.^(1)
- Here before `f` is invoked value in `a` is moved to 'agreed upon' location on stack, and during `f` works like 'local variable' `x`.

**Notes:**

^(1) Actual location depends on calling convention, might practically not end up on stack at all, but that doesn't change mental model.

**Diagram 9 — textual state:**

```text
state:
  memory row:
    byte map:
      byte × 3
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 28
    values: value [t, byte2, diagram-left=131px]: S(1)
    labels:
      label [byte2, diagram-left=57px]: a
      label [byte2, diagram-left=97.5px]: x
      label [byte2, diagram-left=136px]: x
    subtext: Nested Functions
```

```
fn f(x: S) {
    if once() { f(x) } // <- We are here (before recursion)
}

let a = S(1);
f(a);
```


- **Recursively calling** functions, or calling other functions, likewise extends the stack frame.
- Nesting too many invocations (esp. via unbounded recursion) will cause stack to grow, and eventually to overflow, terminating the app.

**Diagram 10 — textual state:**

```text
state:
  section header: Validity of Variables
  memory row:
    byte map:
      byte × 3
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 2
      byte [t, diagram-opacity=0.4]
      byte [atomic] × 4
      byte × 25
    values:
      value [t, byte2, diagram-left=131px]: S(1)
      value [atomic, byte4, diagram-left=190px]: M { }
    labels:
      label [byte2, diagram-left=57px]: a
      label [byte2, diagram-left=97.5px]: x
      label [byte2, diagram-left=174px]: m
    subtext: Repurposing Memory
```

```
fn f(x: S) {
    if once() { f(x) }
    let m = M::new() // <- We are here (after recursion)
}

let a = S(1);
f(a);
```


- Stack that previously held a certain type will be repurposed across (even within) functions.
- Here, recursing on `f` produced second `x`, which after recursion was partially reused for `m`.

> Key take away so far, there are multiple ways how memory locations that previously held a valid value of a certain type stopped doing so in the meantime.
> As we will see shortly, this has implications for pointers.

### References & Pointers

**Diagram 11 — textual state:**

```text
state:
  section header [arrowed]: Reference Types
  memory row:
    arrows: arrow [diagram-left=62px, diagram-width=176px]: tip: ▼
    byte map:
      byte × 3
      byte [t] × 2
      byte × 6
      byte [ptr] × 4
      byte × 26
    values:
      value [t, byte2, diagram-left=57px]: S(1)
      value [ptr, byte4, diagram-left=171px]: 0x3
    labels:
      label [byte2, diagram-left=57px]: a
      label [byte4, diagram-left=171px]: r
    subtext: References as Pointers
```

```
let a = S(1);
let r: &S = &a;
```


- A **reference type** such as `&S` or `&mut S` can hold the **location of** some `s`.
- Here type `&S`, bound as name `r`, holds _location of_ variable `a` (`0x3`), that must be type `S`, obtained via `&a`.
- If you think of variable `c` as _specific location_, reference **`r` is a _switchboard for locations_**.
- The type of the reference, like all other types, can often be inferred, so we might omit it from now on:
    ```
    let r: &S = &a;
    let r = &a;
    ```


**Diagram 12 — textual state:**

```text
state:
  section header [arrowed]: (Mutable) References
  memory row:
    arrows: arrow [diagram-left=62px, diagram-width=176px]: tip: ▼
    byte map:
      byte × 3
      byte [t] × 2
      byte × 6
      byte [ptr] × 4
      byte × 2
      byte [t] × 2
      byte × 22
    values:
      value [t, byte2, diagram-left=57px]: S(2)
      value [ptr, byte4, diagram-left=171px]: 0x3
      value [t, byte2, diagram-left=213px]: S(1)
    labels:
      label [byte2, diagram-left=57px]: a
      label [byte4, diagram-left=171px]: r
      label [byte4, diagram-left=193px]: d
    subtext: Access to Non-Owned Memory
```

```
let mut a = S(1);
let r = &mut a;
let d = r.clone();  // Valid to clone (or copy) from r-target.
*r = S(2);          // Valid to set new S value to r-target.
```


- References can **read from**  (`&S`) and also **write to** (`&mut S`) locations they point to.
- The *dereference* `*r` means to use the **location `r` points to** (_not_ the _location of_ or _value within_ `r` itself)
- In the example, clone `d` is created from `*r`, and `S(2)` written to `*r`.
    - We assume `S` implements `Clone`, and `r.clone()` clones target-of-`r`, not `r` itself.
    - On assignment `*r = …` old value in location also dropped (not shown above).

**Diagram 13 — textual state:**

```text
state:
  memory row:
    arrows: arrow [diagram-left=62px, diagram-width=176px]: tip: ▼
    byte map:
      byte × 3
      byte [t] × 2
      byte × 6
      byte [ptr] × 4
      byte × 2
      byte [t] × 2
      byte × 22
    values:
      value [t, byte2, hide, diagram-left=57px]: S(2)
      value [ptr, byte4, diagram-left=171px]: 0x3
      value [atomic, byte4, diagram-top=-36px, diagram-left=20px]: M { x }
      DENIED [diagram-left=-71px, diagram-top=-36px]: ⛔
      DENIED [diagram-left=-131px]: ⛔
    labels:
      label [byte2, diagram-left=57px]: a
      label [byte4, diagram-left=171px]: r
      label [byte4, diagram-left=193px]: d
    subtext: References Guard Referents
```

```
let mut a = …;
let r = &mut a;
let d = *r;       // Invalid to move out value, `a` would be empty.
*r = M::new();    // invalid to store non S value, doesn't make sense.
```


- While bindings guarantee to always _hold_ valid data, references guarantee to always _point to_ valid data.
- Esp. `&mut T` must provide same guarantees as variables, and some more as they can't dissolve the target:
    - They do **not allow writing invalid** data.
    - They do **not allow moving out** data (would leave target empty w/o owner knowing).

**Diagram 14 — textual state:**

```text
state:
  memory row:
    arrows: arrow [diagram-left=62px, diagram-width=176px, diagram-border-color=red]: tip [diagram-color=red]: ▼
    byte map:
      byte × 11
      byte [ptr] × 4
      byte × 26
    values:
      value [t, byte2, hide, diagram-left=57px]: C(2)
      value [ptr, byte4, unsafe, diagram-left=171px]: 0x3
    labels:
      label [byte2, hide, diagram-left=57px]: c
      label [byte4, diagram-left=171px]: p
    subtext: Raw Pointers
```

```
let p: *const S = questionable_origin();
```


- In contrast to references, pointers come with almost no guarantees.
- They may point to invalid or non-existent data.
- Dereferencing them is `unsafe`, and treating an invalid `*p` as if it were valid is undefined behavior. [See section](https://cheats.rs/#unsafe-unsound-undefined)

### Lifetime Basics

**Diagram 15 — textual state:**

```text
state:
  memory row:
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [atomic] × 4
      byte
      byte [t] × 2
      byte × 28
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 3
      byte [ptr] × 4
      byte × 27
    byte map:
      byte × 2
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 3
      byte [ptr] × 4
      byte × 23
    values:
      value [t, byte2, hide, diagram-left=57px]: C(2)
      value [ptr, byte4, hide, diagram-left=171px]: 0x3
    labels
    subtext: "Lifetime" of Things
```

- Every entity in a program has some (temporal / spatial) extent where it is relevant, i.e., _alive_.
- Loosely speaking, this _alive time_ can be^(1)
    1. the **LOC** (lines of code) where an **item is available** (e.g., a module name).
    1. the **LOC** between when a _location_ is **initialized** with a value, and when the location is **abandoned**.
    1. the **LOC** between when a location is first **used in a certain way**, and when that **usage stops**.
    1. the **LOC (or actual time)** between when a _value_ is created, and when that value is dropped.
- Within the rest of this section, we will refer to the items above as the:
    1. **scope** of that item, irrelevant here.
    1. **scope** of that variable or location.
    1. **lifetime**^(2) of that usage.
    1. **lifetime** of that value, might be useful when discussing open file descriptors, but also irrelevant here.
- Likewise, lifetime parameters in code, e.g., `r: &'a S`, are
    - concerned with LOC any **location r _points to_** needs to be accessible or locked;
    - unrelated to the 'existence time' (as LOC) of `r` itself (well, it needs to exist shorter, that's it).
- `&'static S` means address must be _valid during all lines of code_.

> ^(1) There is sometimes ambiguity in the docs differentiating the various _scopes_ and _lifetimes_.
> We try to be pragmatic here, but suggestions are welcome.
>
> ^(2) _Live lines_ might have been a more appropriate term …

**Diagram 16 — textual state:**

```text
state:
  memory row:
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [atomic] × 4
      byte
      byte [t] × 2
      byte × 28
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 3
      byte [ptr] × 4
      byte × 27
    arrows: arrow [diagram-left=192px, diagram-width=120px]: tip: ▼
    byte map:
      byte × 10
      byte [t] × 2
      byte × 3
      byte [ptr] × 4
      byte × 23
    values:
      value [t, byte2, hide, diagram-left=38px]: S(0)
      value [t, byte2, hide, diagram-left=79px]: S(1)
      value [t, byte2, diagram-left=119px]: S(2)
      value [ptr, byte4, diagram-left=177px]: 0xa
    labels:
      label [byte2, hide, diagram-left=37px]: a
      label [byte2, hide, diagram-left=78px]: b
      label [byte2, diagram-left=118px]: c
      label [byte4, diagram-left=177px]: r
    subtext:
      Meaning of
      r: &'c S
```

- Assume you got a `r: &'c S` from somewhere it means:
    - `r` holds an address of some `S`,
    - any address `r` points to must and will exist for at least `'c`,
    - the variable `r` itself cannot live longer than `'c`.

**Diagram 17 — textual state:**

```text
state:
  memory row:
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [atomic] × 4
      byte
      byte [t] × 2
      byte × 28
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 3
      byte [ptr] × 4
      byte × 27
    arrows: arrow [diagram-left=118px, diagram-width=193px]: tip: ▼
    byte map:
      byte × 2
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 3
      byte [ptr] × 4
      byte × 23
    values:
      value [t, byte2, diagram-left=38px]: S(0)
      value [t, byte2, diagram-left=79px]: S(3)
      value [t, byte2, diagram-left=119px]: S(2)
      value [ptr, byte4, diagram-left=177px]: 0x6
      DENIED [diagram-left=-125px, diagram-top=-25px]: ⛔
    labels:
      label [byte2, diagram-left=37px]: a
      label [byte2, diagram-left=78px]: b
      label [byte2, diagram-left=118px]: c
      label [byte4, diagram-left=177px]: r
    subtext: Typelikeness of Lifetimes
```

```
{
    let b = S(3);
    {
        let c = S(2);
        let r: &'c S = &c;      // Does not quite work since we can't name lifetimes of local
        {                       // variables in a function body, but very same principle applies
            let a = S(0);       // to functions next page.

            r = &a;             // Location of `a` does not live sufficient many lines -> not ok.
            r = &b;             // Location of `b` lives all lines of `c` and more -> ok.
        }
    }
}
```


- Assume you got a `mut r: &mut 'c S` from somewhere.
    - That is, a mutable location that can hold a mutable reference.
- As mentioned, that reference must guard the targeted memory.
- However, the **`'c` part**, like a type, also **guards what is allowed into `r`**.
- Here assigning `&b` (`0x6`) to `r` is valid, but `&a` (`0x3`) would not, as only `&b` lives equal or longer than `&c`.

**Diagram 18 — textual state:**

```text
state:
  memory row:
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [atomic] × 4
      byte
      byte [t] × 2
      byte × 28
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 3
      byte [ptr] × 4
      byte × 27
    arrows: arrow [diagram-left=118px, diagram-width=193px]: tip: ▼
    byte map:
      byte × 6
      byte [t, borrowed] × 2
      byte × 7
      byte [ptr] × 4
      byte × 23
    values:
      value [t, byte2, hide, diagram-left=38px]: S(0)
      value [t, byte2, diagram-left=79px]
      value [t, byte2, hide, diagram-left=119px]: S(2)
      value [ptr, byte4, diagram-left=177px]: 0x6
      FAILED [diagram-left=-40px]: value [t, bytes]: S(4)
      DENIED [diagram-left=-83px]: ⛔
    labels:
      label [byte2, hide, diagram-left=37px]: a
      label [byte2, diagram-left=78px]: b
      label [byte2, hide, diagram-left=118px]: c
      label [byte4, hide, diagram-left=177px]: 
    subtext: Borrowed State
```

```
let mut b = S(0);
let r = &mut b;

b = S(4);   // Will fail since `b` in borrowed state.

print_byte(r);
```


- Once the address of a variable is taken via `&b` or `&mut b` the variable is marked as **borrowed**.
- While borrowed, the content of the address cannot be modified anymore via original binding `b`.
- Once address taken via `&b` or `&mut b` stops being used (in terms of LOC) original binding `b` works again.

### Lifetimes in Functions

**Diagram 19 — textual state:**

```text
state:
  memory row:
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [atomic] × 4
      byte
      byte [t] × 2
      byte × 28
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 3
      byte [ptr] × 4
      byte × 27
    byte map:
      byte × 6
      byte [t, borrowed] × 2
      byte × 2
      byte [t, borrowed] × 2
      byte × 3
      byte [ptr] × 4
      byte
      byte [ptr] × 4
      byte
      byte [ptr] × 4
      byte × 13
    values:
      value [t, byte2, hide, diagram-left=38px]: S(0)
      value [t, byte2, diagram-left=79px]: S(1)
      value [t, byte2, diagram-left=119px]: S(2)
      value [ptr, byte4, diagram-left=177px]: ?
      value [ptr, byte4, diagram-left=201px]: 0x6
      value [ptr, byte4, diagram-left=224px]: 0xa
    labels:
      label [byte2, hide, diagram-left=37px]: a
      label [byte4, diagram-left=59px]: b
      label [byte2, diagram-left=81px]: c
      label [byte4, diagram-left=139px]: r
      label [byte4, diagram-left=165px]: x
      label [byte4, diagram-left=188px]: y
    subtext: Function Parameters
```

```
fn f(x: &S, y:&S) -> &u8 { … }

let b = S(1);
let c = S(2);

let r = f(&b, &c);
```


- When calling functions that take and return references two interesting things happen:
    - The used local variables are placed in a borrowed state,
    - But it is during compilation unknown which address will be returned.

**Diagram 20 — textual state:**

```text
state:
  memory row:
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [atomic] × 4
      byte
      byte [t] × 2
      byte × 28
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 3
      byte [ptr] × 4
      byte × 27
    byte map:
      byte × 2
      byte [t] × 2
      byte × 2
      byte [t, maybe-borrowed] × 2
      byte × 2
      byte [t, maybe-borrowed] × 2
      byte × 3
      byte [ptr] × 4
      byte × 23
    values:
      value [t, byte2, hide, diagram-left=38px]: S(0)
      value [t, byte2, diagram-left=79px]: S(1)
      value [t, byte2, diagram-left=119px]: S(2)
      value [ptr, byte4, diagram-left=177px]: ?
      value [ptr, byte4, hide, diagram-left=201px]: 0x6
      value [ptr, byte4, hide, diagram-left=224px]: 0xa
    labels:
      label [byte2, diagram-left=37px]: a
      label [byte4, diagram-left=59px]: b
      label [byte2, diagram-left=81px]: c
      label [byte4, diagram-left=139px]: r
      label [byte4, hide, diagram-left=165px]: x
      label [byte4, hide, diagram-left=188px]: y
    subtext: Problem of 'Borrowed' Propagation
```

```
let b = S(1);
let c = S(2);

let r = f(&b, &c);

let a = b;   // Are we allowed to do this?
let a = c;   // Which one is _really_ borrowed?

print_byte(r);
```


- Since `f` can return only one address, not in all cases `b` and `c` need to stay locked.
- In many cases we can get quality-of-life improvements.
    - Notably, when we know one parameter _couldn't_ have been used in return value anymore.

**Diagram 21 — textual state:**

```text
state:
  memory row:
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [atomic] × 4
      byte
      byte [t] × 2
      byte × 28
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 3
      byte [ptr] × 4
      byte × 27
    arrows: arrow [diagram-left=210px, diagram-width=102px]: tip: ▼
    byte map:
      byte × 2
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 2
      byte [t, borrowed] × 2
      byte × 3
      byte [ptr] × 4
      byte × 23
    values:
      value [t, byte2, diagram-left=38px]: S(1)
      value [t, byte2, hide, diagram-left=79px]: S(1)
      value [t, byte2, diagram-left=119px]: S(2)
      value [ptr, byte4, diagram-left=177px]: y + _
      value [ptr, byte4, hide, diagram-left=201px]: 0x6
      value [ptr, byte4, hide, diagram-left=224px]: 0xa
    labels:
      label [byte2, diagram-left=37px]: a
      label [byte4, diagram-left=59px]: b
      label [byte2, diagram-left=81px]: c
      label [byte4, diagram-left=139px]: r
      label [byte4, hide, diagram-left=165px]: x
      label [byte4, hide, diagram-left=188px]: y
    subtext: Lifetimes Propagate Borrowed State
```

```
fn f<'b, 'c>(x: &'b S, y: &'c S) -> &'c u8 { … }

let b = S(1);
let c = S(2);

let r = f(&b, &c); // We know returned reference is `c`-based, which must stay locked,
                   // while `b` is free to move.

let a = b;

print_byte(r);
```


- Lifetime parameters in signatures, like `'c` above, solve that problem.
- Their primary purpose is:
    - **outside the function**, to explain based on which input address an output address could be generated,
    - **within the function**, to guarantee only addresses that live at least `'c` are assigned.
- The actual lifetimes `'b`, `'c` are transparently picked by the compiler at **call site**, based on the borrowed variables the developer gave.
- They are **not** equal to the _scope_ (which would be LOC from initialization to destruction) of `b` or `c`, but only a minimal subset of their scope called _lifetime_, that is, a minmal set of LOC based on how long `b` and `c` need to be borrowed to perform this call and use the obtained result.
- In some cases, like if `f` had `'c: 'b` instead, we still couldn't distinguish and both needed to stay locked.

**Diagram 22 — textual state:**

```text
state:
  memory row:
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [atomic] × 4
      byte
      byte [t] × 2
      byte × 28
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 3
      byte [ptr] × 4
      byte × 27
    byte map:
      byte × 2
      byte [t] × 2
      byte × 6
      byte [t] × 2
      byte × 30
    values:
      value [t, byte2, diagram-left=38px]: S(2)
      value [t, byte2, hide, diagram-left=79px]: S(1)
      value [t, byte2, hide, diagram-left=119px]: S(2)
      value [ptr, byte4, hide, diagram-left=177px]: y + 1
      value [ptr, byte4, hide, diagram-left=201px]: 0x6
      value [ptr, byte4, hide, diagram-left=224px]: 0xa
    labels:
      label [byte2, diagram-left=37px]: a
      label [byte4, hide, diagram-left=59px]: b
      label [byte2, diagram-left=81px]: c
      label [byte4, hide, diagram-left=139px]: r
      label [byte4, hide, diagram-left=165px]: x
      label [byte4, hide, diagram-left=188px]: y
    subtext: Unlocking
```

```
let mut c = S(2);

let r = f(&c);
let s = r;
                    // <- Not here, `s` prolongs locking of `c`.

print_byte(s);

let a = c;          // <- But here, no more use of `r` or `s`.


```

- A variable location is _unlocked_ again once the last use of any reference that may point to it ends.

### Advanced [Advanced]

**Diagram 23 — textual state:**

```text
state:
  memory row:
    arrows:
      arrow [diagram-left=53px, diagram-width=92px]: tip: ▼
      arrow [diagram-left=57px, diagram-width=104px]: tip: ▼
      arrow [diagram-left=-155px, diagram-width=320px, diagram-top=-5px, diagram-border-style=dashed]
    byte map:
      byte × 2
      byte [t] × 2
      byte × 2
      byte [ptr] × 4
      byte × 2
      byte [ptr] × 4
      byte × 2
      byte [ptr] × 4
      byte × 20
    values:
      value [t, byte2, diagram-left=38px]: S(1)
      value [ptr, byte4, diagram-left=80px]: 0x2
      value [ptr, byte4, diagram-left=120px]: 0x6
      value [ptr, byte4, diagram-left=162px]: 0x2
    labels:
      label [byte2, diagram-left=37px]: a
      label [byte4, diagram-left=79px]: ra
      label [byte2, diagram-left=139px]: rb
      label [byte2, diagram-left=216px]: rval
    subtext: References to References
```

```
// Return short ('b) reference
fn f1sr<'b, 'a>(rb: &'b     &'a     S) -> &'b     S { *rb }
fn f2sr<'b, 'a>(rb: &'b     &'a mut S) -> &'b     S { *rb }
fn f3sr<'b, 'a>(rb: &'b mut &'a     S) -> &'b     S { *rb }
fn f4sr<'b, 'a>(rb: &'b mut &'a mut S) -> &'b     S { *rb }

// Return short ('b) mutable reference.
// f1sm<'b, 'a>(rb: &'b     &'a     S) -> &'b mut S { *rb } // M
// f2sm<'b, 'a>(rb: &'b     &'a mut S) -> &'b mut S { *rb } // M
// f3sm<'b, 'a>(rb: &'b mut &'a     S) -> &'b mut S { *rb } // M
fn f4sm<'b, 'a>(rb: &'b mut &'a mut S) -> &'b mut S { *rb }

// Return long ('a) reference.
fn f1lr<'b, 'a>(rb: &'b     &'a     S) -> &'a     S { *rb }
// f2lr<'b, 'a>(rb: &'b     &'a mut S) -> &'a     S { *rb } // L
fn f3lr<'b, 'a>(rb: &'b mut &'a     S) -> &'a     S { *rb }
// f4lr<'b, 'a>(rb: &'b mut &'a mut S) -> &'a     S { *rb } // L

// Return long ('a) mutable reference.
// f1lm<'b, 'a>(rb: &'b     &'a     S) -> &'a mut S { *rb } // M
// f2lm<'b, 'a>(rb: &'b     &'a mut S) -> &'a mut S { *rb } // M
// f3lm<'b, 'a>(rb: &'b mut &'a     S) -> &'a mut S { *rb } // M
// f4lm<'b, 'a>(rb: &'b mut &'a mut S) -> &'a mut S { *rb } // L

// Now assume we have a `ra` somewhere
let mut ra: &'a mut S = …;

let rval = f1sr(&&*ra);       // OK
let rval = f2sr(&&mut *ra);
let rval = f3sr(&mut &*ra);
let rval = f4sr(&mut ra);

//  rval = f1sm(&&*ra);       // Would be bad, since rval would be mutable
//  rval = f2sm(&&mut *ra);   // reference obtained from broken mutability
//  rval = f3sm(&mut &*ra);   // chain.
let rval = f4sm(&mut ra);

let rval = f1lr(&&*ra);
//  rval = f2lr(&&mut *ra);   // If this worked we'd have `rval` and `ra` …
let rval = f3lr(&mut &*ra);
//  rval = f4lr(&mut ra);     // … now (mut) aliasing `S` in compute below.

//  rval = f1lm(&&*ra);       // Same as above, fails for mut-chain reasons.
//  rval = f2lm(&&mut *ra);   //                    "
//  rval = f3lm(&mut &*ra);   //                    "
//  rval = f4lm(&mut ra);     // Same as above, fails for aliasing reasons.

// Some fictitious place where we use `ra` and `rval`, both alive.
compute(ra, rval);
```


**Notes:**

Here (`M`) means compilation fails because mutability error, (`L`) lifetime error.
Also, dereference `*rb` not strictly necessary, just added for clarity.

- `f_sr` cases always work, short reference (only living `'b`) can always be produced.
- `f_sm` cases usually fail simply because _mutable chain_ to `S` needed to return `&mut S`.
- `f_lr` cases can fail because returning `&'a S` from `&'a mut S` to caller means there would now exist two references (one mutable) to same `S` which is illegal.
- `f_lm` cases always fail for combination of reasons above.

> Note: This example is about the `f` functions, not `compute`. You can assume
> it to be defined as `fn compute(x: &S, y: &S) {}`. In that case the `ra` parameter would be automatically
> coerced [See section](https://cheats.rs/#type-conversions) from `&mut S` to `&S`, since you can't have a shared and a mutable
> reference to the same target.

**Diagram 24 — textual state:**

```text
state:
  memory row:
    byte map:
      byte × 2
      byte [t] × 2
      byte × 37
    values:
      drop:
        value [t, byte2, diagram-left=38px]: S(1)
        drop arrow [diagram-left=17px]: ▼
    labels: label [byte2, diagram-left=37px]: _
    subtext:
      Drop and
      _
```

```
{
    let f = |x, y| (S(x), S(y)); // Function returning two 'Droppables'.

    let (    x1, y) = f(1, 4);  // S(1) - Scope   S(4) - Scope
    let (    x2, _) = f(2, 5);  // S(2) - Scope   S(5) - Immediately
    let (ref x3, _) = f(3, 6);  // S(3) - Scope   S(6) - Scope

    println!("…");
}
```


**Notes:**

Here `Scope` means contained value lives until end of scope, i.e., past the `println!()`.

- Functions or expressions producing movable values must be handled by callee.
- Values stores in 'normal' bindings are kept until end of scope, then dropped.
- Values stored in `_` bindings are usually dropped right away.
- However, sometimes references (e.g., `ref x3`) can keep value (e.g., the tuple `(S(3), S(6))`) around for longer, so `S(6)`, being part of that tuple can only be dropped once reference to its `S(3)` sibling disappears).

**Notes:**

↕️ Examples expand by clicking.

---

# Memory Layout

Byte representations of common types.

## Basic Types

Essential types built into the core of the language.

#### Boolean [Reference](https://doc.rust-lang.org/reference/types/boolean.html) and Numeric Types [Reference](https://doc.rust-lang.org/reference/types/numeric.html)

**Diagram 25 — textual layout:**

```text
layout:
  name: bool
  representation [bool]: byte:
```

**Diagram 26 — textual layout:**

```text
layout:
  name:
    u8
    ,
    i8
  representation [bytes]: byte:
```

**Diagram 27 — textual layout:**

```text
layout:
  name:
    u16
    ,
    i16
  representation [bytes]: byte: × 2
```

**Diagram 28 — textual layout:**

```text
layout:
  name:
    u32
    ,
    i32
  representation [bytes]: byte: × 4
```

**Diagram 29 — textual layout:**

```text
layout:
  name:
    u64
    ,
    i64
  representation [bytes]: byte: × 8
```

**Diagram 30 — textual layout:**

```text
layout:
  name:
    u128
    ,
    i128
  representation [bytes]: byte: × 16
```

**Diagram 31 — textual layout:**

```text
layout:
  name:
    usize
    ,
    isize
  representation [sized]:
    byte: × 2
    byte [diagram-border-color=#888]: × 2
    byte [diagram-border-color=#aaa]: × 4
  zoom:
    Same as
    ptr
    on platform.
```

**Diagram 32 — textual layout:**

```text
layout:
  name:
    f16
    **[Unstable / nightly]**
  representation [float]: byte: × 2
```

**Diagram 33 — textual layout:**

```text
layout:
  name: f32
  representation [float]: byte: × 4
```

**Diagram 34 — textual layout:**

```text
layout:
  name: f64
  representation [float]: byte: × 8
```

**Diagram 35 — textual layout:**

```text
layout:
  name:
    f128
    **[Unstable / nightly]**
  representation [float]: byte: × 16
```

##### Unsigned Types

|Type|Max Value|
|---|---|
|`u8`| `255` |
|`u16` | `65_535` |
|`u32`| `4_294_967_295` |
|`u64`| `18_446_744_073_709_551_615` |
|`u128`| `340_282_366_920_938_463_463_374_607_431_768_211_455` |
|`usize`| Depending on platform pointer size, same as `u16`, `u32`, or `u64`. |

##### Signed Types

|Type |Max Value|
|---|---|
|`i8`| `127` |
|`i16` | `32_767` |
|`i32`| `2_147_483_647` |
|`i64`| `9_223_372_036_854_775_807` |
|`i128`| `170_141_183_460_469_231_731_687_303_715_884_105_727` |
|`isize`| Depending on platform pointer size, same as `i16`, `i32`, or `i64`. |

|Type |Min Value|
|---|---|
|`i8`| `-128` |
|`i16` | `-32_768` |
|`i32`| `-2_147_483_648` |
|`i64`| `-9_223_372_036_854_775_808` |
|`i128`| `-170_141_183_460_469_231_731_687_303_715_884_105_728` |
|`isize`| Depending on platform pointer size, same as `i16`, `i32`, or `i64`. |

##### Float Types

| Type | Max value | Min pos value | Max lossless integer^(1) |
|---|---|---| ---|
| `f16`  **[Unstable / nightly]**  | 65504.0 | 6.10 ⋅ 10 ^(-5) | `2048`  |
| `f32` | 3.40 ⋅ 10 ^(38) | 3.40 ⋅ 10 ^(-38) | `16_777_216` |
| `f64` | 1.79 ⋅ 10 ^(308) | 2.23 ⋅ 10 ^(-308) | `9_007_199_254_740_992` |
| `f128`  **[Unstable / nightly]**  | 1.19 ⋅ 10 ^(4932)  |  3.36 ⋅ 10 ^(-4932) | 2.07 ⋅ 10 ^(34) |

**Notes:**

^(1) The maximum integer `M` so that all other integers `0 <= X <= M` can be
losslessly represented in that type. In other words, there might be larger integers
that could still be represented losslessly (e.g., `65504` for `f16`), but up until that
value a lossless representation is guaranteed.

> Float values approximated for visual clarity. Negative limits are values multipled with -1.

##### Float Internals [Advanced]

Sample bit representation^(*) for a `f32`:

**Diagram 36 — textual layout:**

```text
layout [diagram-opacity=0.7]:
  representation [float]:
    bitgroup: bit: S
    bitgroup:
      bit: E
      bit: E
      bit: E
      bit: E
      bit: E
      bit: E
      bit: E
      bit: E
    bitgroup:
      bit: F
      bit: F
      bit: F
      bit: F
      bit: F
      bit: F
      bit: F
      bit: F
      bit: F
      bit: F
      bit: F
      bit: F
      bit: F
      bit: F
      bit: F
      bit: F
      bit: F
      bit: F
      bit: F
      bit: F
      bit: F
      bit: F
      bit: F
```

Explanation:

| f32 | S (1) | E (8) | F (23) | Value |
|------| ---------| ---------| ---------| ---------|
| Normalized number | ± | 1 to 254 | any | ±(1.F)_(2) * 2^(E-127)  |
| Denormalized number | ± | 0 | non-zero | ±(0.F)_(2) * 2^(-126)  |
| Zero | ± | 0 | 0 | ±0  |
| Infinity | ± | 255 | 0 | ±∞  |
| NaN | ± | 255 | non-zero | NaN  |

Similarly, for `f64` types this would look like:

| f64 | S (1) | E (11) | F (52) | Value |
|------| ---------| ---------| ---------| ---------|
| Normalized number | ± | 1 to 2046 | any | ±(1.F)_(2) * 2^(E-1023)  |
| Denormalized number | ± | 0 | non-zero | ±(0.F)_(2) * 2^(-1022)  |
| Zero | ± | 0 | 0 | ±0  |
| Infinity | ± | 2047 | 0 | ±∞  |
| NaN | ± | 2047 | non-zero | NaN  |

**Notes:**

^(*) Float types follow [IEEE 754-2008](https://en.wikipedia.org/wiki/IEEE_754-2008_revision) and depend on platform endianness.

##### Casting Pitfalls [Pitfall / intentionally wrong]

| Cast^(1) | Gives | Note |
| --- | --- | --- |
| `3.9_f32 as u8` | `3` | Truncates, consider `x.round()` first. |
| `314_f32 as u8` | `255` | Takes closest available number. |
| `f32::INFINITY as u8` | `255` | Same, treats `INFINITY` as _really_ large number.|
| `f32::NAN as u8` | `0` | - |
| `_314 as u8` | `58` | Truncates excess bits. |
| `_257 as i8` | `1` | Truncates excess bits. |
| `_200 as i8` | `-56` | Truncates excess bits, MSB might then also signal negative. |

##### Arithmetic Pitfalls [Pitfall / intentionally wrong]

| Operation^(1) | Gives | Note |
| --- | --- | --- |
| `200_u8 / 0_u8` | Compile error. | - |
| `200_u8 / _0` ^(d, r) | Panic. | Regular math may panic; here: division by zero. |
| `200_u8 + 200_u8` |  Compile error. | - |
| `200_u8 + _200` ^(d) | Panic. | Consider `checked_`, `wrapping_`, … instead. [std](https://doc.rust-lang.org/std/primitive.isize.html#method.checked_add)|
| `200_u8 + _200` ^(r) | `144` | In release mode this will overflow. |
| `-128_i8 * -1` | Compile error. | Would overflow (`128_i8` doesn't exist). |
| `-128_i8 * _1neg` ^(d) | Panic. | - |
| `-128_i8 * _1neg` ^(r) | `-128` | Overflows back to `-128` in release mode. |
| `1_u8 / 2_u8` | `0` | Other integer division truncates. |
| `0.8_f32 + 0.1_f32` | `0.90000004` | - |
| `1.0_f32 / 0.0_f32` | `f32::INFINITY` | - |
| `0.0_f32 / 0.0_f32` | `f32::NAN` | - |
| `x < f32::NAN` | `false` | `NAN` comparisons always return false. |
| `x > f32::NAN` | `false` | `NAN` comparisons always return false. |
| `f32::NAN == f32::NAN` | `false` | Use `f32::is_nan()` [std](https://doc.rust-lang.org/std/primitive.f32.html#method.is_nan) instead. |

**Notes:**

^(1) Expression `_100` means anything that might contain the value `100`, e.g., `100_i32`, but is opaque to compiler.

^(d) Debug build.

^(r) Release build.

#### Textual Types [Reference](https://doc.rust-lang.org/reference/types/textual.html)

**Diagram 37 — textual layout:**

```text
layout:
  name: char
  representation [char]: byte: × 4
  description: Any Unicode scalar.
```

**Diagram 38 — textual layout:**

```text
layout:
  name: str
  representation:
    note: …
    byte [bytes]: U
    byte [bytes]: T
    byte [bytes]: F
    byte [bytes]: -
    byte [bytes]: 8
    note: … unspecified times
  description:
    Rarely seen alone, but as
    &str
    instead.
```

##### Basics

| Type | Description |
|---------|-------------|
| `char` | Always 4 bytes and only holds a single Unicode **scalar value** [Link](https://www.unicode.org/glossary/#unicode_scalar_value). |
| `str` | An `u8`-array of unknown length guaranteed to hold **UTF-8 encoded code points**. |

##### Usage

| Chars | Description |
|---------|-------------|
| `let c = 'a';` | Often a `char` (unicode scalar) can coincide with your intuition of _character_. |
| `let c = '❤';` | It can also hold many Unicode symbols. |
| `let c = '❤️';` | But not always. Given emoji is **two** `char` (see Encoding) and **can't**  **[Pitfall / intentionally wrong]**  be held by `c`.^(1) |
| `c = 0xffff_ffff;` | Also, chars are **not allowed**  **[Pitfall / intentionally wrong]**  to hold arbitrary bit patterns. |

**Notes:**

^(1) Fun fact, due to the [Zero-width joiner](https://en.wikipedia.org/wiki/Zero-width_joiner) (⨝) what the user _perceives as a character_ can get even more unpredictable: 👨‍👩‍👧 is in fact 5 chars 👨⨝👩⨝👧, and rendering engines are free to either show them fused as one, or separately as three, depending on their abilities.

| Strings | Description |
|---------|-------------|
| `let s = "a";` | A `str` is usually never held directly, but as `&str`, like `s` here. |
| `let s = "❤❤️";` | It can hold arbitrary text, has variable length per _c._, and is hard to index. |

##### Encoding [Advanced]

`let s = "I ❤ Rust"; `

`let t = "I ❤️ Rust";`

| Variant | Memory Representation^(2^(| |---------|-------------| | `s.as_bytes()` | `49` `20` **`e2 9d a4`** `20 52 75 73 74` ^(3^(| | `t.as_bytes()` | `49` `20` **`e2 9d a4`** **`ef b8 8f`** `20 52 75 73 74` ^(4^(| | `s.chars()`^(1^(| `49 00 00 00 20 00 00 00` **`64 27 00 00` ** `20 00 00 00 52 00 00 00 75 00 00 00 73 00` … | | `t.chars()`^(1^(| `49 00 00 00 20 00 00 00` **`64 27 00 00`** **`0f fe 00 00`** `20 00 00 00 52 00 00 00 75 00` … | **Notes:** ^(1) Result then collected into array and transmuted to bytes, [compare here](https://play.rust-lang.org/?version=stable&mode=debug&edition=2024&gist=4303e6e40f3e971901409552bae88ac0). ^(2) Values given in hex, on x86. ^(3) Notice how `❤`, having [Unicode Code Point (U+2764)](https://codepoints.net/U+2764), is represented as **64 27 00 00** inside the `char`, but got [UTF-8 encoded to](https://en.wikipedia.org/wiki/UTF-8#Description) **e2 9d a4** in the `str`. ^(4) Also observe how the emoji [Red Heart `❤️`](https://emojipedia.org/red-heart/), is a combination of `❤` and the [U+FE0F Variation Selector-16](https://codepoints.net/U+FE0F), thus `t` has a higher char count than `s`. **Notes:** > ^(⚠️) For what seem to be browser bugs Safari and Edge render the hearts in Footnote 3 and 4 wrong, despite being able to differentiate them correctly in `s` and `t` above.))))))))))

## Custom Types

Basic types definable by users. Actual **layout** [Reference](https://doc.rust-lang.org/reference/type-layout.html) is subject to **representation**; [Reference](https://doc.rust-lang.org/reference/type-layout.html#representations) padding can be present.

**Diagram 39 — textual layout:**

```text
layout:
  name [nogrow]: T
  name [hidden]: x
  representation: field [any, t]: T
  description: Sized type.
```

**Diagram 40 — textual layout:**

```text
layout:
  name: T: ?Sized
  representation: field [any, unsized]: T
  description: Maybe sized.
```

**Diagram 41 — textual layout:**

```text
layout:
  name: [T; n]
  representation:
    field [any, t]: T
    field [any, t]: T
    field [any, t]: T
    note: … n times
  description:
    Fixed array of
    n
    elements.
```

**Diagram 42 — textual layout:**

```text
layout:
  name: [T]
  representation:
    note: …
    field [any, t]: T
    field [any, t]: T
    field [any, t]: T
    note: … unspecified times
  description:
    b: Slice type
    of unknown-many elements. Neither
    Sized
    (nor carries
    len
    information), and most
    often lives behind reference as
    &[T]
    . [See section](https://cheats.rs/#references-pointers-ui)
```

**Diagram 43 — textual layout:**

```text
layout [diagram-width=70px]:
  name [nogrow]: struct S;
  name [hidden]: ;
  representation [zst, diagram-width=15px]: 
  description: Zero-sized type.
```

**Diagram 44 — textual layout:**

```text
layout:
  name: (A, B, C)
  representation [diagram-width=182px]:
    field [any]: A
    field [any, diagram-width=100px]: B
    field [any, diagram-width=50px]: C
  andor: or maybe
  representation [diagram-width=182px]:
    field [any, diagram-width=100px]: B
    field [any]: A
    field [any, diagram-width=50px]: C
  description:
    Unless a representation is forced
    (e.g., via
    #[repr(C)]
    ), type layout
    unspecified.
```

**Diagram 45 — textual layout:**

```text
layout:
  name: struct S { b: B, c: C }
  representation [diagram-width=166px]:
    field [any, diagram-width=100px]: B
    field [any, diagram-width=50px]: C
  andor: or maybe
  representation:
    field [any, diagram-width=50px]: C
    pad: ↦
    field [any, diagram-width=100px]: B
  description: Compiler may also add padding.
```

> **Notes:**
>
> Also note, two types `A(X, Y)` and `B(X, Y)` with exactly the same fields can still have differing layout; never `transmute()` [std](https://doc.rust-lang.org/std/mem/fn.transmute.html) without representation guarantees.

These **sum types** hold a value of one of their sub types:

**Diagram 46 — textual layout:**

```text
layout:
  name: enum E { A, B, C }
  representation [enum]:
    pad: Tag
    field [any]: A
  andor: exclusive or
  representation [enum]:
    pad: Tag
    field [any, diagram-width=100px]: B
  andor: exclusive or
  representation [enum]:
    pad: Tag
    field [any, diagram-width=50px]: C
  description:
    Safely holds A or B or C, also
    called 'tagged union', though
    compiler may squeeze tag
    into 'unused' bits.
```

**Diagram 47 — textual layout:**

```text
layout:
  name: union { … }
  representation: field [any]: A
  andor: unsafe or
  representation: field [any, diagram-width=100px]: B
  andor: unsafe or
  representation: field [any, diagram-width=50px]: C
  description:
    Can unsafely reinterpret
    memory. Result might
    be undefined.
```

## References & Pointers

References give safe access to 3^(rd) party memory, raw pointers `unsafe` access.
The corresponding `mut` types have an identical data layout to their immutable counterparts.

**Diagram 48 — textual layout:**

```text
layout:
  name: &'a T
  representation:
    pointer:
      ptr
      sub: 2/4/8
    payload:
      meta
      sub: 2/4/8
  pointee:
    pointer link [diagram-left=46%]: |
    memory [anymem]: field [any, unsized]: T
  description:
    Must target some valid
    t
    of
    T
    ,
    and any such target must exist for
    at least
    'a
    .
```

**Diagram 49 — textual layout:**

```text
layout:
  name: *const T
  representation [unsafe]:
    pointer:
      ptr
      sub: 2/4/8
    payload:
      meta
      sub: 2/4/8
  zoom: No guarantees.
```

### Pointer Meta

Many reference and pointer types can carry an extra field, **pointer metadata**. [std](https://doc.rust-lang.org/nightly/std/ptr/trait.Pointee.html#pointer-metadata)
It can be the element- or byte-length of the target, or a pointer to a _vtable_. Pointers with meta are called **fat**, otherwise **thin**.

**Diagram 50 — textual layout:**

```text
layout:
  name: &'a T
  representation:
    pointer:
      ptr
      sub: 2/4/8
  pointee:
    pointer link [diagram-left=46%]: |
    memory [anymem]: field [any, t]: T
  description:
    No meta for
    sized target.
    (pointer is thin).
```

**Diagram 51 — textual layout:**

```text
layout:
  name: &'a T
  representation:
    pointer:
      ptr
      sub: 2/4/8
    size field:
      len
      sub: 2/4/8
  pointee:
    pointer link [diagram-left=46%]: |
    memory [anymem]: field [any, unsized]: T
  description:
    If
    T
    is a DST
    struct
    such as
    S { x: [u8] }
    meta field
    len
    is
    count of dyn. sized content.
```

**Diagram 52 — textual layout:**

```text
layout:
  name: &'a [T]
  representation:
    pointer:
      ptr
      sub: 2/4/8
    size field:
      len
      sub: 2/4/8
  pointee [double]:
    pointer link [diagram-left=24%]: |
    memory [anymem]:
      …
      field [any, diagram-width=30px]: T
      field [any, diagram-width=30px]: T
      …
  description:
    Regular
    b: slice reference
    (i.e., the
    reference type of a slice type
    [T]
    ) [See section](https://cheats.rs/#custom-types)
    often seen as
    &[T]
    if
    'a
    elided.
```

**Diagram 53 — textual layout:**

```text
layout:
  name: &'a str
  representation:
    pointer:
      ptr
      sub: 2/4/8
    size field:
      len
      sub: 2/4/8
  pointee [double]:
    pointer link [diagram-left=24%]: |
    memory [anymem]:
      …
      byte [bytes]: U
      byte [bytes]: T
      byte [bytes]: F
      byte [bytes]: -
      byte [bytes]: 8
      …
  description:
    b: String slice reference
    (i.e., the
    reference type of string type
    str
    ),
    with meta
    len
    being byte length.
```

**Diagram 54 — textual layout:**

```text
layout:
  name: &'a dyn Trait
  representation:
    pointer:
      ptr
      sub: 2/4/8
    pointer:
      ptr
      sub: 2/4/8
  pointee:
    pointer link [diagram-left=49%]: |
    memory [anymem]: field [any, unsized]: T
  pointee [diagram-width=220px]:
    pointer link [diagram-left=22%]: |
    memory [static-vtable, diagram-width=210px]:
      table:
        tr [vtable]: td: *Drop::drop(&mut T)
        tr [vtable]: td: size
        tr [vtable]: td: align
        tr [vtable]: td: *Trait::f(&T, …)
        tr [vtable]: td: *Trait::g(&T, …)
    description:
      Meta points to vtable, where
      *Drop::drop()
      ,
      *Trait::f()
      , … are pointers to their respective
      impl
      for
      T
      .
```

## Closures

Ad-hoc functions with an automatically managed data block **capturing** [Reference](https://doc.rust-lang.org/reference/types/closure.html#capture-modes)^(, 1)
environment where closure was defined. For example, if you had:

```rust
let y = ...;
let z = ...;

with_closure(move |x| x + y.f() + z); // y and z are moved into closure instance (of type C1)
with_closure(     |x| x + y.f() + z); // y and z are pointed at from closure instance (of type C2)
```


Then the generated, anonymous closures types `C1` and `C2` passed to `with_closure()` would look like:

**Diagram 55 — textual layout:**

```text
layout [doublespaced]:
  name: move |x| x + y.f() + z
  representation:
    field [any, diagram-width=100px]: Y
    field [any, diagram-width=50px]: Z
  zoom: Anonymous closure type C1
```

**Diagram 56 — textual layout:**

```text
layout:
  name: |x| x + y.f() + z
  representation:
    pointer:
      ptr
      sub: 2/4/8
    pointer:
      ptr
      sub: 2/4/8
  zoom: Anonymous closure type C2
  pointee:
    pointer link [diagram-left=44%]: |
    memory [anymem]: field [any, diagram-width=30px]: Y
  pointee:
    pointer link [diagram-left=44%]: |
    memory [anymem]: field [any, diagram-width=30px]: Z
```

> **Notes:**
>
> Also produces anonymous `fn` such as `f_(c1)(C1, X)` or `f_(c2)(&C2, X)`. Details depend on which `FnOnce`, `FnMut`, `Fn` ... is supported, based on properties of captured types.

**Notes:**

^(1) A bit oversimplified a closure is a convenient-to-write 'mini function' that accepts parameters _but also_ needs some local variables to do its job. It is therefore a type (containing the needed locals) and a function. _'Capturing the environment'_ is a fancy way of saying that and how the closure type holds on to these locals, either _by moved value_, or _by pointer_. See **Closures in APIs** [See section](https://cheats.rs/#closures-in-apis) for various implications.

## Standard Library Types

Rust's standard library combines the above primitive types into useful types with special semantics, e.g.:

**Diagram 57 — textual layout:**

```text
layout:
  name:
    Option<T>
    [std](https://doc.rust-lang.org/std/option/enum.Option.html)
  representation [enum]: pad: Tag
  andor: or
  representation [enum]:
    pad: Tag
    field [any, diagram-width=100px]: T
  description:
    Tag may be omitted for
    certain T, e.g.,
    NonNull
    .[std](https://doc.rust-lang.org/std/ptr/struct.NonNull.html)
```

**Diagram 58 — textual layout:**

```text
layout:
  name:
    Result<T, E>
    [std](https://doc.rust-lang.org/std/result/enum.Result.html)
  representation [enum]:
    pad: Tag
    field [any, diagram-width=50px]: E
  andor: or
  representation [enum]:
    pad: Tag
    field [any, diagram-width=100px]: T
  description:
    Either some error
    E
    or value
    of
    T
    .
```

**Diagram 59 — textual layout:**

```text
layout:
  name:
    ManuallyDrop<T>
    [std](https://doc.rust-lang.org/std/mem/struct.ManuallyDrop.html)
  representation: field [any, unsized, diagram-width=100px]: T
  description:
    Prevents
    T::drop()
    from
    being called.
```

**Diagram 60 — textual layout:**

```text
layout:
  name:
    AtomicUsize
    [std](https://doc.rust-lang.org/std/sync/atomic/index.html)
  representation [atomic]:
    pointer [atomic]:
      usize
      sub: 2/4/8
  description: Other atomic similarly.
```

**Diagram 61 — textual layout:**

```text
layout:
  name:
    MaybeUninit<T>
    span: [std](https://doc.rust-lang.org/std/mem/union.MaybeUninit.html)
  representation [enum]: field [uninit, diagram-width=100px]: U̼̟̔͛n̥͕͐͞d̛̲͔̦̳̑̓̐e̱͎͒̌fị̱͕̈̉͋ne̻̅ḓ̓
  andor: unsafe or
  representation [enum]: field [any, diagram-width=100px]: T
  description:
    Uninitialized memory or
    some
    T
    . Only legal way
    to work with uninit data.
```

**Diagram 62 — textual layout:**

```text
layout:
  name:
    PhantomData<T>
    [std](https://doc.rust-lang.org/std/marker/struct.PhantomData.html)
  representation [zst, diagram-width=15px]: 
  description:
    Zero-sized helper to hold
    otherwise unused lifetimes.
```

**Diagram 63 — textual layout:**

```text
layout:
  name:
    Pin<P>
    [std](https://doc.rust-lang.org/std/pin/struct.Pin.html)
  representation [diagram-width=90px]: field [any, diagram-width=80px]: P
  pointee [double]:
    pointer link [diagram-left=24%]: |
    memory [anymem, pinned, diagram-opacity=0.8]:
      span [diagram-right=-14px, diagram-top=-16px]: 📌
      field [any, diagram-width=130px]: P::Deref
  description:
    Signals tgt. of
    P
    is pinned 'forever'
    even past lt. of
    Pin
    . Value within
    may not be moved out (but new
    one moved in), unless
    Unpin
    .[std](https://doc.rust-lang.org/std/marker/trait.Unpin.html)
```

>  **[Pitfall / intentionally wrong]**  All depictions are for **illustrative** purposes only.
> The fields should exist in latest `stable`, but Rust makes no guarantees about their layouts, and you must not
> attempt to _unsafely_ access anything unless the docs allow it.

#### Cells

**Diagram 64 — textual layout:**

```text
layout:
  name:
    UnsafeCell<T>
    [std](https://doc.rust-lang.org/std/cell/struct.UnsafeCell.html)
  representation [cell]: field [any, unsized]: T
  description:
    Magic type allowing
    aliased mutability.
```

**Diagram 65 — textual layout:**

```text
layout:
  name:
    Cell<T>
    [std](https://doc.rust-lang.org/std/cell/struct.Cell.html)
  representation: field [any, unsized, celled]: T
  description:
    Allows
    T
    's
    to move in
    and out.
```

**Diagram 66 — textual layout:**

```text
layout:
  name:
    RefCell<T>
    [std](https://doc.rust-lang.org/std/cell/struct.RefCell.html)
  representation:
    size field [celled]: borrowed
    field [any, unsized, celled]: T
  description:
    Also support dynamic
    borrowing of
    T
    . Like
    Cell
    this
    is
    Send
    , but not
    Sync
    .
```

**Diagram 67 — textual layout:**

```text
layout:
  name:
    OnceCell<T>
    [std](https://doc.rust-lang.org/std/cell/struct.OnceCell.html)
  div [celled]:
    representation [enum]: pad: Tag
    andor: or
    representation [enum]:
      pad: Tag
      field [any, diagram-width=80px]: T
  description: Initialized at most once.
```

**Diagram 68 — textual layout:**

```text
layout:
  name:
    LazyCell<T, F>
    [std](https://doc.rust-lang.org/std/cell/struct.LazyCell.html)
  div [celled]:
    representation [enum]:
      pad: Tag
      field [any, diagram-width=80px]: Uninit<F>
    andor: or
    representation [enum]:
      pad: Tag
      field [any, diagram-width=80px]: Init<T>
    andor: or
    representation [enum]:
      pad: Tag
      field [any, diagram-width=80px]: Poisoned
  description: Initialized on first access.
```

#### Order-Preserving Collections

**Diagram 69 — textual layout:**

```text
layout:
  name:
    Box<T>
    [std](https://doc.rust-lang.org/std/boxed/struct.Box.html)
  representation:
    pointer:
      ptr
      sub: 2/4/8
    payload:
      meta
      sub: 2/4/8
  pointee:
    pointer link [diagram-left=49%]: |
    memory [heap]: field [any, unsized]: T
  description:
    For some
    T
    stack proxy may carry
    meta[See section](https://cheats.rs/#custom-types) (e.g.,
    Box<[T]>
    ).
```

**Diagram 70 — textual layout:**

```text
layout:
  name:
    Vec<T>
    [std](https://doc.rust-lang.org/std/vec/struct.Vec.html)
  representation:
    pointer:
      ptr
      sub: 2/4/8
    size field:
      len
      sub: 2/4/8
    size field:
      capacity
      sub: 2/4/8
  pointee [double]:
    pointer link [diagram-left=25%]: |
    memory [heap, capacity]:
      div:
        field [any, t]: T
        field [any, t]: T
        note: … len
      capacity:
        ←
        note: capacity
        →
  description:
    Regular
    i: growable array
    vector of single type.
```

**Diagram 71 — textual layout:**

```text
layout:
  name:
    LinkedList<T>
    [std](https://doc.rust-lang.org/std/collections/struct.LinkedList.html) **[Advanced]**
  representation:
    pointer:
      head
      sub: 2/4/8
    pointer:
      tail
      sub: 2/4/8
    size field:
      len
      sub: 2/4/8
  pointee [diagram-width=265px, diagram-left=0%, diagram-display=block]:
    pointer link [diagram-left=25%]: |
    pointer link [diagram-left=50%]: |
    memory [heap, capacity]:
      pointer:
        next
        sub: 2/4/8
      pointer:
        prev
        sub: 2/4/8
      field [any, t]: T
  description:
    Elements
    head
    and
    tail
    both
    null
    or point to nodes on
    the heap. Each node can point to its
    prev
    and
    next
    node.
    Eats your cache (just look at the thing!); don't use unless
    you evidently must. **[Pitfall / intentionally wrong]**
```

**Diagram 72 — textual layout:**

```text
layout:
  name:
    VecDeque<T>
    [std](https://doc.rust-lang.org/std/collections/struct.VecDeque.html)
  representation:
    size field:
      head
      sub: 2/4/8
    size field:
      len
      sub: 2/4/8
    pointer:
      ptr
      sub: 2/4/8
    size field:
      capacity
      sub: 2/4/8
  pointee
  pointee
  pointee [double]:
    pointer link [diagram-left=25%]: |
    memory [heap, capacity]:
      div:
        field [any, t]: T
        note: … empty …
        field [any, t]: T⁣^(H)
      capacity:
        ←
        note: capacity
        →
  description:
    Index
    head
    selects in array-as-ringbuffer. This means content may be
    non-contiguous and empty in the middle, as exemplified above.
```

#### Other Collections

**Diagram 73 — textual layout:**

```text
layout:
  name:
    HashMap<K, V>
    [std](https://doc.rust-lang.org/std/collections/struct.HashMap.html)
  representation:
    size field:
      bmask
      sub: 2/4/8
    pointer:
      ctrl
      sub: 2/4/8
    size field:
      left
      sub: 2/4/8
    size field:
      len
      sub: 2/4/8
  pointee
  pointee [diagram-width=265px, diagram-left=-5%]:
    pointer link [diagram-left=25%]: |
    memory [heap, oversimplified]:
      field [any, t]: K:V
      field [any, t]: K:V
      …
      field [any, t]: K:V
      …
      field [any, t]: K:V
      capacity: note: Oversimplified!
  description:
    Stores keys and values on heap according to hash value,
    [SwissTable](https://www.youtube.com/watch?v=ncHmEUmJZf4)
    implementation via
    [hashbrown](https://github.com/rust-lang/hashbrown)
    .
    HashSet
    [std](https://doc.rust-lang.org/std/collections/struct.HashSet.html) identical to
    HashMap
    ,
    just type
    V
    disappears. Heap view grossly oversimplified. **[Pitfall / intentionally wrong]**
```

**Diagram 74 — textual layout:**

```text
layout:
  name:
    BinaryHeap<T>
    [std](https://doc.rust-lang.org/std/collections/struct.BinaryHeap.html)
  representation:
    pointer:
      ptr
      sub: 2/4/8
    size field:
      capacity
      sub: 2/4/8
    size field:
      len
      sub: 2/4/8
  pointee [diagram-width=265px]:
    pointer link [diagram-left=20%]: |
    memory [heap, capacity]:
      div:
        field [any, t]: T⁣^(0)
        field [any, t, diagram-background-color=#f9b172]: T⁣^(1)
        field [any, t, diagram-background-color=#f9b172]: T⁣^(1)
        field [any, t, diagram-background-color=#f9d372]: T⁣^(2)
        field [any, t, diagram-background-color=#f9d372]: T⁣^(2)
        note: … len
      capacity:
        ←
        note: capacity
        →
  description:
    Heap stored as array with
    2^(N)
    elements per layer. Each
    T
    can have 2 children in layer below. Each
    T
    larger than its
    children.
```

#### Owned Strings

**Diagram 75 — textual layout:**

```text
layout:
  name:
    String
    [std](https://doc.rust-lang.org/std/string/struct.String.html)
  representation:
    pointer:
      ptr
      sub: 2/4/8
    size field:
      capacity
      sub: 2/4/8
    size field:
      len
      sub: 2/4/8
  pointee [double]:
    pointer link [diagram-left=25%]: |
    memory [heap]:
      div:
        byte [bytes]: U
        byte [bytes]: T
        byte [bytes]: F
        byte [bytes]: -
        byte [bytes]: 8
        note: … len
      capacity:
        ←
        note: capacity
        →
  description:
    Observe how
    String
    differs from
    &str
    and
    &[char]
    .
```

**Diagram 76 — textual layout:**

```text
layout:
  name:
    CString
    [std](https://doc.rust-lang.org/std/ffi/struct.CString.html)
  representation:
    pointer:
      ptr
      sub: 2/4/8
    size field:
      len
      sub: 2/4/8
  pointee [double]:
    pointer link [diagram-left=25%]: |
    memory [heap]:
      div:
        byte [bytes]: A
        byte [bytes]: B
        byte [bytes]: C
        note: … len …
        byte [bytes]: ∅
  description: NUL-terminated but w/o NUL in middle.
```

**Diagram 77 — textual layout:**

```text
layout:
  name:
    OsString
    [std](https://doc.rust-lang.org/std/ffi/struct.OsString.html)
  representation [platformdefined]: Platform Defined
  pointee [double]:
    pointer link [diagram-left=25%]: |
    memory [heap]:
      div:
        byte [bytes]: × 2
        /
        word [bytes]: 
        word [bytes]: 
  description:
    Encapsulates how operating system
    represents strings (e.g.,
    [WTF-8](https://simonsapin.github.io/wtf-8/)
    on
    Windows).
```

**Diagram 78 — textual layout:**

```text
layout:
  name:
    PathBuf
    [std](https://doc.rust-lang.org/std/path/struct.PathBuf.html)
  representation [platformdefined, diagram-width=100px]: payload: OsString
  pointee [double]:
    pointer link [diagram-left=40%]: |
    memory [heap]:
      div:
        byte [bytes]: × 2
        /
        word [bytes]: 
        word [bytes]: 
  description:
    Encapsulates how operating system
    represents paths.
```

#### Shared Ownership

If the type does not contain a `Cell` for `T`, these are often combined with one of the `Cell` types above to allow shared de-facto mutability.

**Diagram 79 — textual layout:**

```text
layout:
  name:
    Rc<T>
    [std](https://doc.rust-lang.org/std/rc/struct.Rc.html)
  representation [diagram-width=180px]:
    pointer:
      ptr
      sub: 2/4/8
    payload:
      meta
      sub: 2/4/8
  div:
    pointee [quad]:
      pointer link [diagram-left=15%]: |
      memory [heap]:
        size field [celled]:
          strng
          sub: 2/4/8
        size field [celled]:
          weak
          sub: 2/4/8
        field [any, unsized]: T
  description:
    Share ownership of
    T
    in same thread. Needs nested
    Cell
    or
    RefCell
    to allow mutation. Is neither
    Send
    nor
    Sync
    .
```

**Diagram 80 — textual layout:**

```text
layout:
  name:
    Arc<T>
    [std](https://doc.rust-lang.org/std/sync/struct.Arc.html)
  representation [diagram-width=180px]:
    pointer:
      ptr
      sub: 2/4/8
    payload:
      meta
      sub: 2/4/8
  div [diagram-width=0px]:
    pointee [quad]:
      pointer link [diagram-left=15%]: |
      memory [heap]:
        size field [atomicx]:
          strng
          sub: 2/4/8
        size field [atomicx]:
          weak
          sub: 2/4/8
        field [any, unsized]: T
  description:
    Same, but allow sharing between threads IF contained
    T
    itself is
    Send
    and
    Sync
    .
```

**Diagram 81 — textual layout:**

```text
layout:
  name:
    Mutex<T>
    [std](https://doc.rust-lang.org/std/sync/struct.Mutex.html) /
    RwLock<T>
    [std](https://doc.rust-lang.org/std/sync/struct.RwLock.html)
  representation [diagram-width=230px]:
    payload: inner
    size field [atomicx]:
      poison
      sub: 2/4/8
    field [any, unsized, celled]: T
  description:
    Inner fields depend on platform. Needs to be
    held in
    Arc
    to be shared between decoupled
    threads, or via
    scope()
    [std](https://doc.rust-lang.org/std/thread/fn.scope.html) for scoped threads.
```

**Diagram 82 — textual layout:**

```text
layout:
  name:
    Cow<'a, T>
    [std](https://doc.rust-lang.org/std/borrow/enum.Cow.html)
  representation [enum]:
    pad: Tag
    field [any, unsized, diagram-width=100px]: T::Owned
  andor: or
  representation [enum]:
    pad: Tag
    field [ptr, diagram-width=50px]:
      ptr
      sub: 2/4/8
  div:
    pointee [diagram-width=40px]
    pointee:
      pointer link [diagram-left=15%]: |
      memory [anymem]: field [any, unsized]: T
  description:
    Holds read-only reference to
    some
    T
    , or owns its
    ToOwned
    [std](https://doc.rust-lang.org/std/borrow/trait.ToOwned.html)
    analog.
```

---

# Standard Library

## One-Liners

Snippets that are common, but still easy to forget. See **Rust Cookbook** [Link](https://rust-lang-nursery.github.io/rust-cookbook/) for more.

### Strings

| Intent | Snippet |
|---------|-------------|
| Concatenate strings (any `Display`[See section](https://cheats.rs/#string-output) that is).  [std](https://doc.rust-lang.org/std/fmt/index.html) ^(1)   **[Edition '21]**  | `format!("{x}{y}")` |
| Append string (any `Display` to any `Write`).   **[Edition '21]**  [std](https://doc.rust-lang.org/std/fmt/index.html#write) | `write!(x, "{y}")` |
| Split by separator pattern. [std](https://doc.rust-lang.org/std/str/pattern/trait.Pattern.html) [Link](https://stackoverflow.com/a/38138985) | `s.split(pattern)` |
| ↳  … with `&str` | `s.split("abc")` |
| ↳  … with `char` | `s.split('/')` |
| ↳  … with closure | `s.split(char::is_numeric)`|
| Split by whitespace.  [std](https://doc.rust-lang.org/std/primitive.str.html#method.split_whitespace) | `s.split_whitespace()` |
| Split by newlines.  [std](https://doc.rust-lang.org/std/primitive.str.html#method.lines)  | `s.lines()` |
| Split by regular expression. [Link](https://docs.rs/regex/latest/regex/struct.Regex.html#method.split) ^(2) | ` Regex::new(r"\s")?.split("one two three")` |

**Notes:**

^(1) Allocates; if `x` or `y` are not going to be used afterwards consider using `write!` or `std::ops::Add`.

^(2) Requires [regex](https://crates.io/crates/regex) crate.

### I/O

| Intent | Snippet |
|---------|-------------|
| Create a new file [std](https://doc.rust-lang.org/std/fs/struct.File.html#method.open) | `File::create(PATH)?`  |
| ↳   Same, via OpenOptions | `OpenOptions::new().create(true).write(true).truncate(true).open(PATH)?` |
| Read file as `String` [std](https://doc.rust-lang.org/std/fs/fn.read_to_string.html) | `read_to_string(path)?` |

### Macros

| Intent | Snippet |
|---------|-------------|
| Macro w. variable arguments | `macro_rules! var_args { ($($args:expr),*) => {{ }} }` |
| ↳  Using `args`, e.g., calling `f` multiple times. | ↳  ` $( f($args); )*` |

### Transforms [Useful]

| Starting Type | Resource |
|---------|-------------|
| `Option<T> -> …` | See the [Type-Based Cheat Sheet](https://upsuper.github.io/rust-cheatsheet/) |
| `Result<T, R> -> …` | See the [Type-Based Cheat Sheet](https://upsuper.github.io/rust-cheatsheet/) |
| `Iterator<Item=T> -> …` | See the [Type-Based Cheat Sheet](https://upsuper.github.io/rust-cheatsheet/) |
| `&[T] -> …` | See the [Type-Based Cheat Sheet](https://upsuper.github.io/rust-cheatsheet/) |
| `Future<T> -> …` | See the [Futures Cheat Sheet](https://rufflewind.com/img/rust-futures-cheatsheet.html) |

### Esoterics [Advanced]

| Intent | Snippet |
|---------|-------------|
| Cleaner closure captures | `wants_closure({ let c = outer.clone(); move \|\| use_clone(c) })` |
| Fix inference in '`try`' closures | `iter.try_for_each(\|x\| { Ok::<(), Error>(()) })?;` |
| Iterate _and_ edit `&mut [T]` if `T` Copy. | `Cell::from_mut(mut_slice).as_slice_of_cells()` |
| Get subslice with length. | `&original_slice[offset..][..length]` |
| Canary so trait `T` is **dyn compatible**. [Reference](https://doc.rust-lang.org/reference/items/traits.html#dyn-compatibility) | `const _: Option<&dyn T> = None;` |
| _Semver trick_ to unify types. [Link](https://github.com/dtolnay/semver-trick) | `my_crate = "next.version"` in `Cargo.toml` + re-export types. |
| Use macro inside own crate. [Link](https://users.rust-lang.org/t/use-macro-inside-proc-macro-crate/61095/4) | `macro_rules! internal_macro {}` with `pub(crate) use internal_macro;` |

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

## Iterators

Processing elements in a collection.

### Basics

There are, broadly speaking, four _styles_ of collection iteration:

| Style | Description |
| --- | --- |
| `for x in c { ... }` | _Imperative_, useful w. side effects, interdepend., or need to break flow early.  |
| `c.iter().map().filter()` | _Functional_, often much cleaner when only results of interest. |
| `c_iter.next()` | _Low-level_, via explicit `Iterator::next()` [std](https://doc.rust-lang.org/std/iter/trait.Iterator.html#tymethod.next) invocation.  **[Advanced]**  |
| `c.get(n)` | _Manual_, bypassing official iteration machinery. |

> **Opinion**  **[Opinion]**  — Functional style is often easiest to follow, but don't hesitate to use  `for` if your `.iter()` chain turns messy. When implementing containers iterator support would be ideal, but when in a hurry it can sometimes be more practical to just implement `.len()` and `.get()` and move on with your life.

### Obtaining

**Basics**

Assume you have a collection `c` of type `C` you want to use:

* **`c.into_iter()`**^(1)  — Turns collection `c` into an **`Iterator`** [std](https://doc.rust-lang.org/std/iter/trait.Iterator.html) `i` and **consumes**^(2) `c`. _Std._ way to get iterator.
* **`c.iter()`** — Courtesy method **some** collections provide, returns **borrowing** Iterator, doesn't consume `c`.
* **`c.iter_mut()`** — Same, but **mutably borrowing** Iterator that allow collection to be changed.

**The Iterator**

Once you have an `i`:

* **`i.next()`** — Returns `Some(x)` next element `c` provides, or `None` if we're done.

**For Loops**

* **`for x in c {}`** — Syntactic sugar, calls `c.into_iter()` and loops `i` until `None`.

**Notes:**

^(1) Requires **`IntoIterator`** [std](https://doc.rust-lang.org/std/iter/trait.IntoIterator.html) for `C` to be implemented. Type of item depends on what `C` was.

^(2) If it looks as if it doesn't consume `c` that's because type was `Copy`. For example, if you call `(&c).into_iter()` it will invoke `.into_iter()` on `&c` (which will consume a _copy_ of the reference and turn it into an Iterator), but the original `c` remains untouched.

### Creating

**Essentials**

Let's assume you have a `struct Collection<T> {}` you authored. You should also implement:

* **`struct IntoIter<T> {}`** — Create a struct to hold your iteration status (e.g., an index) for value iteration.
* **`impl Iterator for IntoIter<T> {}`** — Implement `Iterator::next()` so it can produce elements.

**Diagram 90 — textual relationships:**

```text
relationships: entry [wide]: type [generic, dotted]: Collection<T>
```

**Diagram 91 — textual relationships:**

```text
relationships:
  entry [wide]:
    type [generic, dotted]: IntoIter<T>
    trait implementation:
      ⌾
      Iterator
    associated type [grayed]: Item = T;
```

> At this point you have something that can behave as an **Iterator**, [std](https://doc.rust-lang.org/std/iter/trait.Iterator.html) but no way of actually obtaining it. See the next tab for how that usually works.

### For Loops

**Native Loop Support**

Many users would expect your collection to _just work_ in `for` loops. You need to implement:

* **`impl IntoIterator for Collection<T> {}`** — Now `for x in c {}` works.
* **`impl IntoIterator for &Collection<T> {}`** — Now `for x in &c {}` works.
* **`impl IntoIterator for &mut Collection<T> {}`** — Now `for x in &mut c {}` works.

**Diagram 92 — textual relationships:**

```text
relationships:
  entry [wide]:
    type [generic, dotted]: Collection<T>
    trait implementation:
      ⌾
      IntoIterator
    associated type [grayed]: Item = T;
    associated type [grayed]: To = IntoIter<T>
    note:
      Iterate over
      T
      .
```

**Diagram 93 — textual relationships:**

```text
relationships:
  entry [wide]:
    type [generic, dotted, grayed]: &Collection<T>
    trait implementation:
      ⌾
      IntoIterator
    associated type [grayed]: Item = &T;
    associated type [grayed]: To = Iter<T>
    note:
      Iterate over
      &T
      .
```

**Diagram 94 — textual relationships:**

```text
relationships:
  entry [wide]:
    type [generic, dotted, grayed]: &mut Collectn<T>
    trait implementation:
      ⌾
      IntoIterator
    associated type [grayed]: Item = &mut T;
    associated type [grayed]: To = IterMut<T>
    note:
      Iterate over
      &mut T
      .
```

> As you can see, the **IntoIterator** [std](https://doc.rust-lang.org/std/iter/trait.IntoIterator.html) trait is what actually connects your collection with the **IntoIter** struct you created in the previous tab. The two siblings of **IntoIter** (**Iter** and **IterMut**) are discussed in the next tab.

### Borrowing

**Shared & Mutable Iterators**

In addition, if you want your collection to be useful when borrowed you should implement:

* **`struct Iter<T> {}`** — Create struct holding `&Collection<T>` state for shared iteration.
* **`struct IterMut<T> {}`** — Similar, but holding `&mut Collection<T>` state for mutable iteration.
* **`impl Iterator for Iter<T> {}`** — Implement shared iteration.
* **`impl Iterator for IterMut<T> {}`** — Implement mutable iteration.

Also you might want to add convenience methods:

- `Collection::iter(&self) -> Iter`,
- `Collection::iter_mut(&mut self) -> IterMut`.

**Diagram 95 — textual relationships:**

```text
relationships:
  entry [wide]:
    type [generic, dotted]: Iter<T>
    trait implementation:
      ⌾
      Iterator
    associated type [grayed]: Item = &T;
```

**Diagram 96 — textual relationships:**

```text
relationships:
  entry [wide]:
    type [generic, dotted]: IterMut<T>
    trait implementation:
      ⌾
      Iterator
    associated type [grayed]: Item = &mut T;
```

> The code for borrowing interator support is basically just a repetition of the previous steps with a slightly different types, e.g., `&T` vs `T`.

### Interoperability

**Iterator Interoperability**

To allow **3^(rd) party iterators** to 'collect into' your collection implement:

* **`impl FromIterator for Collection<T> {}`** — Now `some_iter.collect::<Collection<_>>()` works.
* **`impl Extend for Collection<T> {}`** — Now `c.extend(other)` works.

In addition, also consider adding the extra traits from **`std::iter`** [std](https://doc.rust-lang.org/std/iter/index.html#) to your previous structs:

**Diagram 97 — textual relationships:**

```text
relationships:
  entry [wide]:
    type [generic, dotted]: Collection<T>
    trait implementation:
      ⌾
      FromIterator
    trait implementation:
      ⌾
      Extend
```

**Diagram 98 — textual relationships:**

```text
relationships:
  entry [wide]:
    type [generic, dotted]: IntoIter<T>
    trait implementation:
      ⌾
      DoubleEndedIt… 
    trait implementation:
      ⌾
      ExactSizeIt… 
    trait implementation:
      ⌾
      FusedIterator
```

**Diagram 99 — textual relationships:**

```text
relationships:
  entry [wide]:
    type [generic, dotted]: Iter<T>
    trait implementation:
      ⌾
      DoubleEndedIt… 
    trait implementation:
      ⌾
      ExactSizeIt… 
    trait implementation:
      ⌾
      FusedIterator
```

**Diagram 100 — textual relationships:**

```text
relationships:
  entry [wide]:
    type [generic, dotted]: IterMut<T>
    trait implementation:
      ⌾
      DoubleEndedIt… 
    trait implementation:
      ⌾
      ExactSizeIt… 
    trait implementation:
      ⌾
      FusedIterator
```

> Writing collections can be work. The good news is, if you followed all
> these steps your collections will feel like _first class citizens_.

## Number Conversions

As-**correct**-as-it-currently-gets number conversions.

| ↓ Have / Want → | `u8` … `i128` |  `f32` / `f64` | String |
| --- | --- |  --- |--- |
| `u8` … `i128` | `u8::try_from(x)?` ^(1) |  `x as f32` ^(3) | `x.to_string()` |
| `f32` / `f64` | `x as u8` ^(2) |  `x as f32` | `x.to_string()` |
| `String` | `x.parse::<u8>()?` | `x.parse::<f32>()?` | `x` |

**Notes:**

^(1) If type true subset `from()` works directly, e.g., `u32::from(my_u8)`.

^(2) Truncating (`11.9_f32 as u8` gives `11`) and saturating (`1024_f32 as u8` gives `255`); _c_. below.

^(3) Might misrepresent number (`u64::MAX as f32`) or produce `Inf` (`u128::MAX as f32`).

> Also see **Casting-** and **Arithmetic Pitfalls** [See section](https://cheats.rs/#numeric-types) for more things that can go wrong working with numbers.

## String Conversions

If you **want** a string of type …

### `String`

| If you **have** `x` of type …| Use this … |
| --- | --- |
|`String`|`x`|
|`CString`|`x.into_string()?` |
|`OsString`|`x.to_str()?.to_string()`|
|`PathBuf`|`x.to_str()?.to_string()`|
|`Vec<u8>` ^(1) |`String::from_utf8(x)?`|
|`&str`|`x.to_string()` ^(`i`) |
|`&CStr`|`x.to_str()?.to_string()` |
|`&OsStr`|`x.to_str()?.to_string()`|
|`&Path`|`x.to_str()?.to_string()`|
|`&[u8]` ^(1) |`String::from_utf8_lossy(x).to_string()`|

### `CString`

| If you **have** `x` of type …| Use this … |
| --- | --- |
|`String`|`CString::new(x)?`|
|`CString`|`x`|
|`OsString` |`CString::new(x.to_str()?)?`|
|`PathBuf`|`CString::new(x.to_str()?)?`|
|`Vec<u8>` ^(1) |`CString::new(x)?`|
|`&str`|`CString::new(x)?`|
|`&CStr`|`x.to_owned()` ^(`i`) |
|`&OsStr` |`CString::new(x.to_os_string().into_string()?)?`|
|`&Path`|`CString::new(x.to_str()?)?`|
|`&[u8]` ^(1) |`CString::new(Vec::from(x))?`|
|`*mut c_char` ^(2) |`unsafe { CString::from_raw(x) }`|

### `OsString`

| If you **have** `x` of type …| Use this … |
| --- | --- |
|`String`|`OsString::from(x)` ^(`i`) |
|`CString`|`OsString::from(x.to_str()?)`|
|`OsString`|`x`|
|`PathBuf`|`x.into_os_string()`|
|`Vec<u8>` ^(1) |`unsafe { OsString::from_encoded_bytes_unchecked(x) }`|
|`&str`|`OsString::from(x)` ^(`i`)|
|`&CStr`|`OsString::from(x.to_str()?)`|
|`&OsStr`|`OsString::from(x)` ^(`i`)|
|`&Path`|`x.as_os_str().to_owned()`|
|`&[u8]` ^(1) |`unsafe { OsString::from_encoded_bytes_unchecked(x.to_vec()) }`|

### `PathBuf`

| If you **have** `x` of type …| Use this … |
| --- | --- |
|`String`|`PathBuf::from(x)` ^(`i`)|
|`CString`|`PathBuf::from(x.to_str()?)`|
|`OsString`|`PathBuf::from(x)` ^(`i`)|
|`PathBuf`|`x`|
|`Vec<u8>` ^(1) |`unsafe { PathBuf::from(OsString::from_encoded_bytes_unchecked(x)) }` |
|`&str`|`PathBuf::from(x)` ^(`i`)|
|`&CStr`|`PathBuf::from(x.to_str()?)`|
|`&OsStr`|`PathBuf::from(x)` ^(`i`)|
|`&Path`|`PathBuf::from(x)` ^(`i`)|
|`&[u8]` ^(1) |`unsafe { PathBuf::from(OsString::from_encoded_bytes_unchecked(x.to_vec())) }` |

### `Vec<u8>`

| If you **have** `x` of type …| Use this … |
| --- | --- |
|`String`|`x.into_bytes()`|
|`CString`|`x.into_bytes()`|
|`OsString`|`x.into_encoded_bytes()`|
|`PathBuf`|`x.into_os_string().into_encoded_bytes()`|
|`Vec<u8>` ^(1) |`x`|
|`&str`|`Vec::from(x.as_bytes())`|
|`&CStr`|`Vec::from(x.to_bytes_with_nul())`|
|`&OsStr`|`Vec::from(x.as_encoded_bytes())`|
|`&Path`|`Vec::from(x.as_os_str().as_encoded_bytes())`|
|`&[u8]` ^(1) |`x.to_vec()`|

### `&str`

| If you **have** `x` of type …| Use this … |
| --- | --- |
|`String`|`x.as_str()`|
|`CString`|`x.to_str()?`|
|`OsString`|`x.to_str()?`|
|`PathBuf`|`x.to_str()?`|
|`Vec<u8>` ^(1) |`std::str::from_utf8(&x)?`|
|`&str`|`x`|
|`&CStr`|`x.to_str()?`|
|`&OsStr`|`x.to_str()?`|
|`&Path`|`x.to_str()?`|
|`&[u8]` ^(1) |`std::str::from_utf8(x)?`|

### `&CStr`

| If you **have** `x` of type …| Use this … |
| --- | --- |
|`String`|`CString::new(x)?.as_c_str()`|
|`CString`|`x.as_c_str()`|
|`OsString`|`x.to_str()?`|
|`PathBuf`|  **[Missing source / explanation]** ^(,3) |
|`Vec<u8>` ^(1)^(,4) |`CStr::from_bytes_with_nul(&x)?`|
|`&str`|  **[Missing source / explanation]** ^(,3) |
|`&CStr`|`x`|
|`&OsStr` |  **[Missing source / explanation]**  |
|`&Path`|  **[Missing source / explanation]**  |
|`&[u8]` ^(1)^(,4) |`CStr::from_bytes_with_nul(x)?`|
|`*const c_char` ^(1) |`unsafe { CStr::from_ptr(x) }`|

### `&OsStr`

| If you **have** `x` of type …| Use this … |
| --- | --- |
|`String`|`OsStr::new(&x)`|
|`CString`|  **[Missing source / explanation]**  |
|`OsString`|`x.as_os_str()`|
|`PathBuf`|`x.as_os_str()`|
|`Vec<u8>` ^(1) |`unsafe { OsStr::from_encoded_bytes_unchecked(&x) }`|
|`&str`|`OsStr::new(x)`|
|`&CStr`|  **[Missing source / explanation]**  |
|`&OsStr`|`x`|
|`&Path`|`x.as_os_str()`|
|`&[u8]` ^(1) | `unsafe { OsStr::from_encoded_bytes_unchecked(x) }` |

### `&Path`

| If you **have** `x` of type …| Use this … |
| --- | --- |
|`String`|`Path::new(x)` ^(`r`)|
|`CString`|`Path::new(x.to_str()?)` |
|`OsString`|`Path::new(x.to_str()?)` ^(`r`)|
|`PathBuf`|`Path::new(x.to_str()?)` ^(`r`)|
|`Vec<u8>` ^(1) |`unsafe { Path::new(OsStr::from_encoded_bytes_unchecked(&x)) }`|
|`&str`|`Path::new(x)` ^(`r`)|
|`&CStr`|`Path::new(x.to_str()?)` |
|`&OsStr`|`Path::new(x)` ^(`r`)|
|`&Path`|`x`|
|`&[u8]` ^(1) |`unsafe { Path::new(OsStr::from_encoded_bytes_unchecked(x)) }` |

### `&[u8]`

| If you **have** `x` of type …| Use this … |
| --- | --- |
|`String`|`x.as_bytes()`|
|`CString`|`x.as_bytes()`|
|`OsString`|`x.as_encoded_bytes()`|
|`PathBuf`|`x.as_os_str().as_encoded_bytes()`|
|`Vec<u8>` ^(1) |`&x`|
|`&str`|`x.as_bytes()`|
|`&CStr`|`x.to_bytes_with_nul()`|
|`&OsStr`|`x.as_encoded_bytes()`|
|`&Path`|`x.as_os_str().as_encoded_bytes()`|
|`&[u8]` ^(1) |`x`|

### Other

| You **want** | And **have** `x` | Use this … |
| --- | --- | --- |
|**`*const c_char`**|**`CString`**|`x.as_ptr()`|

**Notes:**

^(i) Short form `x.into()` possible if type can be inferred.

^(r) Short form `x.as_ref()` possible if type can be inferred.

^(1) You must ensure `x` comes with a valid representation for the string type (e.g., UTF-8 data for a `String`).

^(2) The `c_char` **must** have come from a previous `CString`. If it comes from FFI see `&CStr` instead.

^(3) No known shorthand as `x` will lack terminating `0x0`. Best way to probably go via `CString`.

^(4) Must ensure `x` actually ends with `0x0`.

## String Output

How to convert types into a `String`, or output them.

### APIs

Rust has, among others, these APIs to convert types to stringified output, collectively called _format_ macros:

| Macro | Output | Notes |
| --- | --- | --- |
|`format!(fmt)` | `String` | Bread-and-butter "to `String`" converter. |
|`print!(fmt)`| Console | Writes to standard output. |
|`println!(fmt)`| Console | Writes to standard output. |
| `eprint!(fmt)`| Console | Writes to standard error. |
|`eprintln!(fmt)`| Console | Writes to standard error. |
|`write!(dst, fmt)` | Buffer | Don't forget to also `use std::io::Write;` |
|`writeln!(dst, fmt)` | Buffer | Don't forget to also `use std::io::Write;` |

| Method | Notes |
| --- | --- |
|`x.to_string()` [std](https://doc.rust-lang.org/std/string/trait.ToString.html) | Produces `String`, implemented for any `Display` type. |

Here `fmt` is string literal such as `"hello {}"`, that specifies output (compare "Formatting" tab) and additional parameters.

### Printable Types

In `format!` and friends, types convert via trait `Display` `"{}"` [std](https://doc.rust-lang.org/std/fmt/trait.Display.html) or `Debug` `"{:?}"` [std](https://doc.rust-lang.org/std/fmt/trait.Debug.html) , non exhaustive list:

| Type | Implements |  |
| --- | --- | --- |
|`String`| `Debug, Display` | |
|`CString`| `Debug` | |
|`OsString`| `Debug` | |
|`PathBuf`| `Debug` |  |
|`Vec<u8>` | `Debug` | |
|`&str`|`Debug, Display` | |
|`&CStr`|`Debug` | |
|`&OsStr`| `Debug` | |
|`&Path`| `Debug` | |
|`&[u8]` |`Debug` | |
|`bool` |`Debug, Display` | |
|`char` |`Debug, Display` | |
|`u8` … `i128` |`Debug, Display` | |
|`f32`, `f64` |`Debug, Display` | |
|`!` |`Debug, Display` | |
|`()` |`Debug` | |

In short, pretty much everything is `Debug`; more _special_ types might need special handling or conversion [See section](https://cheats.rs/#string-conversions) to `Display`.

### Formatting

Each argument designator in format macro is either empty `{}`, `{argument}`, or follows a basic [**syntax**](https://doc.rust-lang.org/std/fmt/index.html#syntax):

```
{ [argument] ':' [[fill] align] [sign] ['#'] [width [$]] ['.' precision [$]] [type] }
```


| Element |  Meaning |
|---------| ---------|
| `argument` |  Number (`0`, `1`, …), variable  **[Edition '21]**  or name, **[Edition '18]**  e.g., `print!("{x}")`. |
| `fill` | The character to fill empty spaces with (e.g., `0`), if `width` is specified. |
| `align` | Left (`<`), center (`^`), or right (`>`), if width is specified. |
| `sign` | Can be `+` for sign to always be printed. |
| `#` | [Alternate formatting](https://doc.rust-lang.org/std/fmt/index.html#sign0), e.g., prettify `Debug`[std](https://doc.rust-lang.org/std/fmt/trait.Debug.html) formatter `?` or prefix hex with `0x`. |
| `width` | Minimum width (≥ 0), padding with `fill` (default to space). If starts with `0`, zero-padded. |
| `precision` | Decimal digits (≥ 0) for numerics, or max width for non-numerics. |
| `$` | Interpret `width` or `precision` as argument identifier instead to allow for dynamic formatting. |
| **`type`** | `Debug`[std](https://doc.rust-lang.org/std/fmt/trait.Debug.html) (`?`) formatting, hex (`x`), binary (`b`), octal (`o`), pointer (`p`), exp (`e`) … [see more](https://doc.rust-lang.org/std/fmt/index.html#traits). |

| Format Example | Explanation |
|---------|-------------|
| `{}` | Print the next argument using `Display`.[std](https://doc.rust-lang.org/std/fmt/trait.Display.html) |
| `{x}` | Same, but use variable `x` from scope.  **[Edition '21]**  |
| `{:?}` | Print the next argument using `Debug`.[std](https://doc.rust-lang.org/std/fmt/trait.Debug.html) |
| `{2:#?}` | Pretty-print the 3^(rd) argument with `Debug`[std](https://doc.rust-lang.org/std/fmt/trait.Debug.html) formatting. |
| `{val:^2$}` | Center the `val` named argument, width specified by the 3^(rd) argument. |
| `{:<10.3}` | Left align with width 10 and a precision of 3.|
| `{val:#x}` | Format `val` argument as hex, with a leading `0x` (alternate format for `x`). |

| Full Example | Explanation |
|---------|-------------|
| `println!("{}", x)` | Print `x` using `Display`[std](https://doc.rust-lang.org/std/fmt/trait.Display.html) on std. out and append new line.  **[Edition '15]**   **[Deprecated / outdated]**  |
| `println!("{x}")` | Same, but use variable `x` from scope.  **[Edition '21]**   |
| `format!("{a:.3} {b:?}")` | Convert `a` with 3 digits, add space, `b` with `Debug` [std](https://doc.rust-lang.org/std/fmt/trait.Debug.html), return `String`.   **[Edition '21]**  |

---

# Tooling

## Project Anatomy

Basic project layout, and common files and folders, as used by `cargo`. [See section](https://cheats.rs/#cargo)

| Entry | Code |
|--------| ---- |
| 📁 `.cargo/` | **Project-local cargo configuration**, may contain **`config.toml`**. [Link](https://doc.rust-lang.org/cargo/reference/config.html)  **[Advanced]**  |
| 📁 `benches/` | Benchmarks for your crate, run via **`cargo bench`**, requires nightly by default. ^(*)  **[Unstable / nightly]**  |
| 📁 `examples/` | Examples how to use your crate, they see your crate like external user would.  |
| ↳  ↳  `my_example.rs` | Individual examples are run like **`cargo run --example my_example`**. |
| 📁 `src/` | Actual source code for your project. |
| ↳  ↳  `main.rs` | Default entry point for applications, this is what **`cargo run`** uses. |
| ↳  ↳  `lib.rs` | Default entry point for libraries. This is where lookup for `my_crate::f()` starts. |
| 📁 `src/bin/` | Place for additional binaries, even in library projects. |
| ↳  ↳  `extra.rs` | Additional binary, run with `cargo run --bin extra`. |
| 📁 `tests/` | Integration tests go here, invoked via **`cargo test`**. Unit tests often stay in `src/` file. |
| `.rustfmt.toml` | In case you want to [**customize**](https://rust-lang.github.io/rustfmt/) how **`cargo fmt`** works. |
| `.clippy.toml` | Special configuration for certain [**clippy lints**](https://rust-lang.github.io/rust-clippy/master/index.html), utilized via **`cargo clippy`**   **[Advanced]**  |
| `build.rs` |  **Pre-build script**, [Link](https://doc.rust-lang.org/cargo/reference/build-scripts.html) useful when compiling C / FFI, … |
| `Cargo.toml` | Main **project manifest**, [Link](https://doc.rust-lang.org/cargo/reference/manifest.html) Defines dependencies, artifacts … |
| `Cargo.lock` | For reproducible builds. Add to git for apps, consider not for libs.  **[Opinion]**  [Link](https://blog.rust-lang.org/2023/08/29/committing-lockfiles.html) [Link](https://web.archive.org/web/20240108203227/https://old.reddit.com/r/rust/comments/164qfjm/change_in_guidance_on_committing_lockfiles_rust/jya8ouf/) |
| `rust-toolchain.toml` |  Define **toolchain override**[Link](https://rust-lang.github.io/rustup/overrides.html) (channel, components, targets) for this project. |

**Notes:**

^(*) On stable consider [Criterion](https://github.com/bheisler/criterion.rs).

**Minimal examples** for various entry points might look like:

### Applications

```
// src/main.rs (default application entry point)

fn main() {
    println!("Hello, world!");
}
```


### Libraries

```
// src/lib.rs (default library entry point)

pub fn f() {}      // Is a public item in root, so it's accessible from the outside.

mod m {
    pub fn g() {}  // No public path (`m` not public) from root, so `g`
}                  // is not accessible from the outside of the crate.
```


### Unit Tests

```
// src/my_module.rs (any file of your project)

fn f() -> u32 { 0 }

#[cfg(test)]
mod test {
    use super::f;           // Need to import items from parent module. Has
                            // access to non-public members.
    #[test]
    fn ff() {
        assert_eq!(f(), 0);
    }
}
```


### Integration Tests

```
// tests/sample.rs (sample integration test)

#[test]
fn my_sample() {
    assert_eq!(my_crate::f(), 123); // Integration tests (and benchmarks) 'depend' to the crate like
}                                   // a 3rd party would. Hence, they only see public items.
```


### Benchmarks [Unstable / nightly]

```
// benches/sample.rs (sample benchmark)

#![feature(test)]   // #[bench] is still experimental

extern crate test;  // Even in '18 this is needed for … reasons.
                    // Normally you don't need this in '18 code.

use test::{black_box, Bencher};

#[bench]
fn my_algo(b: &mut Bencher) {
    b.iter(|| black_box(my_crate::f())); // `black_box` prevents `f` from being optimized away.
}
```


### Build Scripts

```
// build.rs (sample pre-build script)

fn main() {
    // You need to rely on env. vars for target; `#[cfg(…)]` are for host.
    let target_os = env::var("CARGO_CFG_TARGET_OS");
}
```


^(*)[See here for list](https://doc.rust-lang.org/cargo/reference/environment-variables.html#environment-variables-cargo-sets-for-build-scripts) of environment variables set.

### Proc Macros [Advanced]

```
// src/lib.rs (default entry point for proc macros)

extern crate proc_macro;  // Apparently needed to be imported like this.

use proc_macro::TokenStream;

#[proc_macro_attribute]   // Crates can now use `#[my_attribute]`
pub fn my_attribute(_attr: TokenStream, item: TokenStream) -> TokenStream {
    item
}
```


```
// Cargo.toml

[package]
name = "my_crate"
version = "0.1.0"

[lib]
proc-macro = true
```


Module trees and imports:

### Module Trees

**Modules** [Book](https://doc.rust-lang.org/book/ch07-02-defining-modules-to-control-scope-and-privacy.html) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/mod.html#modules) [Reference](https://doc.rust-lang.org/reference/items/modules.html#modules) and **source files** work as follows:

- **Module tree** needs to be explicitly defined, is **not** implicitly built from **file system tree**. [Link](http://www.sheshbabu.com/posts/rust-module-system/)
- **Module tree root** equals library, app, … entry point (e.g., `lib.rs`).

Actual **module definitions** work as follows:
- A **`mod m {}`** defines module in-file, while **`mod m;`** will read `m.rs` or `m/mod.rs`.
- Path of `.rs` based on **nesting**, e.g., `mod a { mod b { mod c; }}}` is either `a/b/c.rs` or `a/b/c/mod.rs`.
- Files not pathed from module tree root via some `mod m;` won't be touched by compiler!  **[Pitfall / intentionally wrong]**

### Namespaces [Advanced]

Rust has three kinds of **namespaces**:

- Row 1:
  - Header, column 1: Namespace _Types_
  - Header, column 2: Namespace _Functions_
  - Header, column 3: Namespace _Macros_
- Row 2:
  - column 1: `mod X {}`
  - column 2: `fn X() {}`
  - column 3: `macro_rules! X { … }`
- Row 3:
  - column 1: `X` (crate)
  - column 2: `const X: u8 = 1;`
  - column 3: (empty)
- Row 4:
  - column 1: `trait X {}`
  - column 2: `static X: u8 = 1;`
  - column 3: (empty)
- Row 5:
  - column 1: `enum X {}`
  - column 2: (empty)
  - column 3: (empty)
- Row 6:
  - column 1: `union X {}`
  - column 2: (empty)
  - column 3: (empty)
- Row 7:
  - column 1: `struct X {}`
  - column 2: (empty)
  - column 3: (empty)
- Row 8:
  - columns 1–2: ← `struct X;`^(1) →
  - column 3: (empty)
- Row 9:
  - columns 1–2: ← `struct X();`^(2) →
  - column 3: (empty)

**Notes:**

^(1) Counts in _Types_ and in _Functions_, defines type `X` _and_ constant `X`.

^(2) Counts in _Types_ and in _Functions_, defines type `X` _and_ function `X`.

- In any given scope, for example within a module, only one item per namespace can exist, e.g.,
    - `enum X {}` and `fn X() {}` can coexist
    - `struct X;` and `const X` cannot coexist
- With a `use my_mod::X;` all items called `X` will be imported.

> Due to naming conventions (e.g., `fn` and `mod` are lowercase by convention) and _common sense_ (most developers just don't name all things `X`) you won't have to worry about these _kinds_ in most cases. They can, however, be a factor when designing macros.

## Cargo

Commands and tools that are good to know.

| Command | Description |
|--------| ---- |
| `cargo init` | Create a new project for the latest edition. |
| `cargo build` (highlighted abbreviation: `b`) | Build the project in debug mode (`--release` (highlighted abbreviation: `r`) for all optimization). |
| `cargo check` (highlighted abbreviation: `c`) | Check if project would compile (much faster). |
| `cargo test` (highlighted abbreviation: `t`) | Run tests for the project. |
| `cargo doc --no-deps --open` (highlighted abbreviation: `d`) | Locally generate documentation for your code. |
| `cargo run` (highlighted abbreviation: `r`) | Run your project, if a binary is produced (main.rs). |
| ↳  `cargo run --bin b` | Run binary `b`. Unifies feat. with other dependents (can be confusing). |
| ↳  `cargo run --package w` (highlighted abbreviation: `p`) | Run main of sub-worksp. `w`. Treats features more sanely. |
| `cargo … --timings` | Show what crates caused your build to take so long.  **[Useful]**  |
| `cargo tree` | Show dependency graph, all crates used by project, transitively. |
| ↳  `cargo tree -i foo` | Inverse dependency lookup, explain why `foo` is used. |
| `cargo info foo` | Show crate metadata for `foo` (by default for version used by this project). |
| `cargo +{nightly, stable} …`  | Use given toolchain for command, e.g., for 'nightly only' tools. |
| `cargo +1.85.0 …`  | Also accepts a specific version directly. |
| `cargo +nightly …` | Some nightly-only commands (substitute `…` with command below) |
| ↳  `rustc -- -Zunpretty=expanded` |  Show expanded macros.  **[Unstable / nightly]**  |
| `rustup doc` | Open offline Rust documentation (incl. the books), good on a plane! |

**Notes:**

Here `cargo build` (highlighted abbreviation: `b`) means you can either type `cargo build` or just `cargo b`; and `--release` (highlighted abbreviation: `r`) means it can be replaced with `-r`.

These are optional `rustup` components.
Install them with `rustup component add [tool]`.

| Tool | Description |
|--------| ---- |
| `cargo clippy` | Additional ([lints](https://rust-lang.github.io/rust-clippy/master/)) catching common API misuses and unidiomatic code. [Link](https://github.com/rust-lang/rust-clippy) |
| `cargo fmt` | Automatic code formatter (`rustup component add rustfmt`). [Link](https://github.com/rust-lang/rustfmt) |

A large number of additional cargo plugins [**can be found here**](https://crates.io/categories/development-tools::cargo-plugins?sort=downloads).

## Cross Compilation

🔘 Check [target is supported](https://doc.rust-lang.org/rustc/platform-support.html).

🔘 Install target via **`rustup target install aarch64-linux-android`** (for example).

🔘 Install native toolchain (required to _link_, depends on target).

Get from target vendor (Google, Apple, …), might not be available on all hosts (e.g., no iOS toolchain on Windows).

**Some toolchains require additional build steps** (e.g., Android's `make-standalone-toolchain.sh`).

🔘 Update **`~/.cargo/config.toml`** like this:

```
[target.aarch64-linux-android]
linker = "[PATH_TO_TOOLCHAIN]/aarch64-linux-android/bin/aarch64-linux-android-clang"
```


   or

```
[target.aarch64-linux-android]
linker = "C:/[PATH_TO_TOOLCHAIN]/prebuilt/windows-x86_64/bin/aarch64-linux-android21-clang.cmd"
```


🔘 Set **environment variables** (optional, wait until compiler complains before setting):

```
set CC=C:\[PATH_TO_TOOLCHAIN]\prebuilt\windows-x86_64\bin\aarch64-linux-android21-clang.cmd
set CXX=C:\[PATH_TO_TOOLCHAIN]\prebuilt\windows-x86_64\bin\aarch64-linux-android21-clang.cmd
set AR=C:\[PATH_TO_TOOLCHAIN]\prebuilt\windows-x86_64\bin\aarch64-linux-android-ar.exe
…
```


Whether you set them depends on how compiler complains, not necessarily all are needed.

> Some platforms / configurations can be **extremely sensitive** how paths are specified (e.g., `\` vs `/`) and quoted.

✔️ Compile with **`cargo build --target=aarch64-linux-android`**

## Tooling Directives

Special tokens embedded in source code used by tooling or preprocessing.

### Macro Fragments

Inside a **declarative** [Book](https://doc.rust-lang.org/book/ch19-06-macros.html#declarative-macros-with-macro_rules-for-general-metaprogramming) **macro by example** [Book](https://doc.rust-lang.org/book/ch19-06-macros.html) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/macros.html#macro_rules) [Reference](https://doc.rust-lang.org/reference/macros-by-example.html) `macro_rules!` implementation these **fragment specifiers** [Reference](https://doc.rust-lang.org/reference/macros-by-example.html#metavariables) work:

| Within Macros |  Explanation |
|---------|---------|
| `$x:ty`  | Macro capture (here a `$x` is the capture and `ty` means `x` must be type). |
| ↳  `$x:block`   | A block `{}` of statements or expressions, e.g., `{ let x = 5; }` |
| ↳  `$x:expr`    | An expression, e.g., `x`, `1 + 1`, `String::new()` or `vec![]` |
| ↳  `$x:expr_2021` | An expression that matches the behavior of Rust '21 [RFC](https://rust-lang.github.io/rfcs/3531-macro-fragment-policy.html) |
| ↳  `$x:ident`   | An identifier, for example in `let x = 0;` the identifier is `x`. |
| ↳  `$x:item`    | An item, like a function, struct, module, etc. |
| ↳  `$x:lifetime` | A lifetime (e.g., `'a`, `'static`, etc.). |
| ↳  `$x:literal` | A literal (e.g., `3`, `"foo"`, `b"bar"`, etc.). |
| ↳  `$x:meta`    | A meta item; the things that go inside `#[…]` and `#![…]` attributes. |
| ↳  `$x:pat`     | A pattern, e.g., `Some(x)`, `(17, 'a')` or `x\|x`. |
| ↳  `$x:pat_param`| Subset of patterns without top-level \|, e.g., `Some(x)` or `x`. |
| ↳  `$x:path`    | A path (e.g., `foo`, `::std::mem::replace`, `transmute::<_, int>`). |
| ↳  `$x:stmt`    | A statement, e.g., `let x = 1 + 1;`, `String::new();` or `vec![];` |
| ↳  `$x:tt`      | A single token tree, [see here](https://stackoverflow.com/a/40303308) for more details. |
| ↳  `$x:ty`      | A type, e.g., `String`, `usize` or `Vec<u8>`. |
| ↳  `$x:vis`    | A visibility modifier;  `pub`, `pub(crate)`, etc. |
| `$crate` | Special hygiene variable, crate where macros is defined.  **[Missing source / explanation]**  |

### Documentation

Inside a **doc comment** [Book](https://doc.rust-lang.org/book/ch14-02-publishing-to-crates-io.html#making-useful-documentation-comments) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/meta/doc.html#documentation) [Reference](https://doc.rust-lang.org/reference/comments.html#doc-comments) these work:

| Within Doc Comments | Explanation |
|--------|-------------|
| ` ```…``` ` | Include a [**doc test**](https://doc.rust-lang.org/rustdoc/documentation-tests.html) (doc code running on `cargo test`). |
| ` ```X,Y …``` ` | Same, and include optional configurations; with `X`, `Y` being … |
| ↳  `rust` | Make it explicit test is written in Rust; implied by Rust tooling. |
| ↳  `-` | Compile test. Run test. Fail if panic. **Default behavior**. |
| ↳  `should_panic` | Compile test. Run test. Execution should panic. If not, fail test. |
| ↳  `no_run` | Compile test. Fail test if code can't be compiled, Don't run test. |
| ↳  `compile_fail` | Compile test but fail test if code _can_ be compiled. |
| ↳  `ignore` | Do not compile. Do not run. Prefer option above instead. |
| ↳  `edition2018` | Execute code as Rust '18; default is '15. |
| `#` | Hide line from documentation (` ```   # use x::hidden; ``` `). |
| ``[`S`]`` | Create a link to struct, enum, trait, function, … `S`. |
| ``[`S`](crate::S)`` | Paths can also be used, in the form of markdown links. |

### `#![globals]`

Attributes affecting the whole crate or app:

| Opt-Out's   | On | Explanation |
|--------|---| ----------|
| `#![no_std]` | `C` | Don't (automatically) import **`std`**[std](https://doc.rust-lang.org/std/) ; use **`core`**[std](https://doc.rust-lang.org/core/) instead. [Reference](https://doc.rust-lang.org/reference/names/preludes.html#the-no_std-attribute) |
| `#![no_implicit_prelude]` | `CM` | Don't add **`prelude`**[std](https://doc.rust-lang.org/std/prelude/index.html), need to manually import `None`, `Vec`, … [Reference](https://doc.rust-lang.org/reference/names/preludes.html#the-no_implicit_prelude-attribute) |
| `#![no_main]` |  `C` | Don't emit `main()` in apps if you do that yourself. [Reference](https://doc.rust-lang.org/reference/crates-and-source-files.html#the-no_main-attribute)|

| Opt-In's   | On | Explanation |
|--------|---| ----------|
| `#![feature(a, b, c)]` | `C` | Rely on f. that may not get stabilized, _c._ [**Unstable Book**](https://doc.rust-lang.org/unstable-book/the-unstable-book.html).  **[Unstable / nightly]**  |

| Builds | On | Explanation |
|--------|---| ----------|
| `#![crate_name = "x"]` | `C`  | Specify current crate name, e.g., when not using `cargo`.  **[Missing source / explanation]**  [Reference](https://doc.rust-lang.org/reference/crates-and-source-files.html#the-crate_name-attribute)  **[Advanced]**  |
| `#![crate_type = "bin"]` | `C`  | Specify current crate type (`bin`, `lib`, `dylib`, `cdylib`, …). [Reference](https://doc.rust-lang.org/reference/linkage.html)  **[Advanced]**  |
| `#![recursion_limit = "123"]` | `C` | Set _compile-time_ recursion limit for deref, macros, … [Reference](https://doc.rust-lang.org/reference/attributes/limits.html#the-recursion_limit-attribute)  **[Advanced]**  |
| `#![type_length_limit = "456"]` | `C` | Limits maximum number of type substitutions. [Reference](https://doc.rust-lang.org/reference/attributes/limits.html#the-type_length_limit-attribute)  **[Advanced]**  |
| `#![windows_subsystem = "x"]` | `C` | On Windows, make a `console` or `windows` app. [Reference](https://doc.rust-lang.org/reference/runtime.html#the-windows_subsystem-attribute)  **[Advanced]**  |

| Handlers | On | Explanation |
|--------|---|----------|
| `#[alloc_error_handler]` | `F` | Make some `fn(Layout) -> !` the **allocation fail. handler**. [Link](https://github.com/rust-lang/rust/issues/51540)  **[Unstable / nightly]**  |
| `#[global_allocator]` | `S` | Make static item impl. `GlobalAlloc` [std](https://doc.rust-lang.org/alloc/alloc/trait.GlobalAlloc.html) **global allocator**. [Reference](https://doc.rust-lang.org/reference/runtime.html#the-global_allocator-attribute)|
| `#[panic_handler]` | `F` | Make some `fn(&PanicInfo) -> !` app's **panic handler**. [Reference](https://doc.rust-lang.org/reference/runtime.html#the-panic_handler-attribute) |

### `#[code]`

Attributes primarily governing emitted code:

| Developer UX | On | Explanation |
|-------|---|-------------|
| `#[non_exhaustive]` | `T` | Future-proof `struct` or `enum`; hint it may grow in future. [Reference](https://doc.rust-lang.org/reference/attributes/type_system.html#the-non_exhaustive-attribute)|
| `#[path = "x.rs"]` | `M` | Get module from non-standard file. [Reference](https://doc.rust-lang.org/reference/items/modules.html#the-path-attribute)|
| `#[diagnostic::on_unimplemented]` | `X` | Give better error messages when trait not implemented. [RFC](https://rust-lang.github.io/rfcs/3368-diagnostic-attribute-namespace.html)|

| Codegen | On | Explanation |
|-------|---|-------------|
| `#[cold]` | `F` | Hint that function probably isn't going to be called. [Reference](https://doc.rust-lang.org/reference/attributes/codegen.html#the-cold-attribute)|
| `#[inline]` | `F` | Nicely suggest compiler should inline function at call sites. [Reference](https://doc.rust-lang.org/reference/attributes/codegen.html#the-inline-attribute)|
| `#[inline(always)]` | `F` | Emphatically threaten compiler to inline call, or else. [Reference](https://doc.rust-lang.org/reference/attributes/codegen.html#the-inline-attribute)|
| `#[inline(never)]` | `F` | Instruct compiler to feel sad if it still inlines the function. [Reference](https://doc.rust-lang.org/reference/attributes/codegen.html#the-inline-attribute) |
| `#[repr(X)]`^(1)  | `T`  | Use another representation instead of the default **`rust`** [Reference](https://doc.rust-lang.org/reference/type-layout.html#the-default-representation) one: |
| `#[target_feature(enable="x")]` | `F` | Enable CPU feature (e.g., `avx2`) for code of `unsafe fn`. [Reference](https://doc.rust-lang.org/reference/attributes/codegen.html#the-target_feature-attribute)|
| `#[track_caller]` | `F` | Allows `fn` to find **`caller`**[std](https://doc.rust-lang.org/core/panic/struct.Location.html#method.caller) for better panic messages. [Reference](https://doc.rust-lang.org/reference/attributes/codegen.html#the-track_caller-attribute)|
| ↳  `#[repr(C)]` | `T`  | Use a C-compatible (f. FFI), predictable (f. `transmute`) layout. [Reference](https://doc.rust-lang.org/reference/type-layout.html#the-c-representation)|
| ↳  `#[repr(C, u8)]` | `enum`  | Give `enum` discriminant the specified type. [Reference](https://doc.rust-lang.org/reference/type-layout.html#the-c-representation)|
| ↳  `#[repr(transparent)]` | `T`  | Give single-element type same layout as contained field. [Reference](https://doc.rust-lang.org/reference/type-layout.html#the-transparent-representation)|
| ↳  `#[repr(packed(1))]` | `T`  | Lower align. of struct and contained fields, mildly UB prone. [Reference](https://doc.rust-lang.org/reference/type-layout.html#the-alignment-modifiers)|
| ↳  `#[repr(align(8))]` | `T`  | Raise alignment of struct to given value, e.g., for SIMD types. [Reference](https://doc.rust-lang.org/reference/type-layout.html#the-alignment-modifiers)|

**Notes:**

^(1) Some representation modifiers can be combined, e.g., `#[repr(C, packed(1))]`.

| Linking | On | Explanation |
|-------|---|-------------|
| `#[unsafe(no_mangle)]` | `*` | Use item name directly as symbol name, instead of mangling.  [Reference](https://doc.rust-lang.org/reference/abi.html#the-no_mangle-attribute)|
| `#[unsafe(export_name = "foo")]` | `FS` | Export a `fn` or `static` under a different name. [Reference](https://doc.rust-lang.org/reference/abi.html#the-export_name-attribute)|
| `#[unsafe(link_section = ".x")]` | `FS`  | Section name of object file where item should be placed. [Reference](https://doc.rust-lang.org/reference/abi.html#the-link_section-attribute)|
| `#[link(name="x", kind="y")]` | `X`  | Native lib to link against when looking up symbol. [Reference](https://doc.rust-lang.org/reference/items/external-blocks.html#the-link-attribute)|
| `#[link_name = "foo"]` | `F`  | Name of symbol to search for resolving `extern fn`. [Reference](https://doc.rust-lang.org/reference/items/external-blocks.html#the-link_name-attribute)|
| `#[no_link]` | `X` | Don't link `extern crate` when only wanting macros. [Reference](https://doc.rust-lang.org/reference/items/extern-crates.html#the-no_link-attribute)|
| `#[used]` | `S`  | Don't optimize away `static` variable despite it looking unused. [Reference](https://doc.rust-lang.org/reference/abi.html#the-used-attribute)|

### `#[quality]`

Attributes used by Rust tools to improve code quality:

| Code Patterns | On | Explanation |
|-------|---|-------------|
| `#[allow(X)]` | `*` | Instruct `rustc` / `clippy` to ign. class `X` of possible issues. [Reference](https://doc.rust-lang.org/reference/attributes/diagnostics.html#lint-check-attributes) |
| `#[expect(X)]` ^(1) | `*` | Warn if a lint doesn't trigger. [Reference](https://doc.rust-lang.org/reference/attributes/diagnostics.html#lint-check-attributes) |
| `#[warn(X)]` ^(1) | `*` |  … emit a warning, mixes well with `clippy` lints.  **[Useful]**  [Reference](https://doc.rust-lang.org/reference/attributes/diagnostics.html#lint-check-attributes) |
| `#[deny(X)]` ^(1) | `*` |  … fail compilation. [Reference](https://doc.rust-lang.org/reference/attributes/diagnostics.html#lint-check-attributes) |
| `#[forbid(X)]` ^(1) | `*` | … fail compilation and prevent subsequent `allow` overrides. [Reference](https://doc.rust-lang.org/reference/attributes/diagnostics.html#lint-check-attributes) |
| `#[deprecated = "msg"]` | `*` | Let your users know you made a design mistake. [Reference](https://doc.rust-lang.org/reference/diagnostics.html#the-deprecated-attribute)|
| `#[must_use = "msg"]` | `FTX` |  Makes compiler check return value is _processed_ by caller.  **[Useful]**  [Reference](https://doc.rust-lang.org/reference/attributes/diagnostics.html#the-must_use-attribute)|

**Notes:**

^(1)  **[Opinion]**  There is some debate which one is the _best_ to ensure high quality crates. Actively maintained multi-dev crates probably benefit from more aggressive `deny` or `forbid` lints; less-regularly updated ones probably more from conservative use of `warn` (as future compiler or `clippy` updates may suddenly break otherwise working code with minor issues).

| Tests | On | Explanation |
|-------|---|-------------|
| `#[test]` | `F` | Marks the function as a test, run with `cargo test`.  **[Useful]**  [Reference](https://doc.rust-lang.org/reference/attributes/testing.html#the-test-attribute)|
| `#[ignore = "msg"]` | `F` | Compiles but does not execute some `#[test]` for now. [Reference](https://doc.rust-lang.org/reference/attributes/testing.html#the-ignore-attribute)|
| `#[should_panic]` | `F` | Test must `panic!()` to actually succeed. [Reference](https://doc.rust-lang.org/reference/attributes/testing.html#the-ignore-attribute)|
| `#[bench]` | `F` | Mark function in `bench/` as benchmark for `cargo bench`.  **[Unstable / nightly]**  [Reference](https://doc.rust-lang.org/reference/)|

| Formatting | On | Explanation |
|-------|---|-------------|
| `#[rustfmt::skip]` |  `*` | Prevent `cargo fmt` from cleaning up item. [Link](https://github.com/rust-lang/rustfmt)|
| `#![rustfmt::skip::macros(x)]` |  `CM` | … from cleaning up macro `x`. [Link](https://github.com/rust-lang/rustfmt)|
| `#![rustfmt::skip::attributes(x)]` |  `CM` | … from cleaning up attribute `x`. [Link](https://github.com/rust-lang/rustfmt)|

| Documentation | On | Explanation |
|-------|---|-------------|
| `#[doc = "Explanation"]` | `*` | Same as adding a `///` doc comment. [Link](https://doc.rust-lang.org/rustdoc/the-doc-attribute.html) |
| `#[doc(alias = "other")]` | `*` | Provide other name for search in docs. [Link](https://github.com/rust-lang/rust/issues/50146) |
| `#[doc(hidden)]` | `*` | Prevent item from showing up in docs. [Link](https://doc.rust-lang.org/rustdoc/write-documentation/the-doc-attribute.html#hidden) |
| `#![doc(html_favicon_url = "")]` | `C` | Sets the `favicon` for the docs. [Link](https://doc.rust-lang.org/rustdoc/write-documentation/the-doc-attribute.html#html_favicon_url)|
| `#![doc(html_logo_url  = "")]` | `C` | The logo used in the docs. [Link](https://doc.rust-lang.org/rustdoc/write-documentation/the-doc-attribute.html#html_logo_url)|
| `#![doc(html_playground_url  = "")]` | `C` | Generates `Run` buttons and uses given service. [Link](https://doc.rust-lang.org/rustdoc/write-documentation/the-doc-attribute.html#html_playground_url)|
| `#![doc(html_root_url  = "")]` | `C` | Base URL for links to external crates. [Link](https://doc.rust-lang.org/rustdoc/write-documentation/the-doc-attribute.html#html_root_url)|
| `#![doc(html_no_source)]` | `C` | Prevents source from being included in docs. [Link](https://doc.rust-lang.org/rustdoc/write-documentation/the-doc-attribute.html#html_no_source)|

### `#[macros]`

Attributes related to the creation and use of macros:

| Macros By Example | On | Explanation |
|-------|---|-------------|
| `#[macro_export]` |  `!` | Export `macro_rules!` as `pub` on crate level [Reference](https://doc.rust-lang.org/reference/macros-by-example.html#path-based-scope)|
| `#[macro_use]` | `MX` | Let macros persist past mod.; or import from `extern crate`. [Reference](https://doc.rust-lang.org/reference/macros-by-example.html#the-macro_use-attribute)|

| Proc Macros | On | Explanation |
|-------|---|-------------|
| `#[proc_macro]` | `F`  | Mark `fn` as **function-like** procedural _m._ callable as `m!()`. [Reference](https://doc.rust-lang.org/reference/procedural-macros.html#function-like-procedural-macros)|
| `#[proc_macro_derive(Foo)]` | `F`  | Mark `fn` as **derive macro** which can `#[derive(Foo)]`. [Reference](https://doc.rust-lang.org/reference/procedural-macros.html#derive-macros)|
| `#[proc_macro_attribute]` | `F`  | Mark `fn` as **attribute macro** for new `#[x]`. [Reference](https://doc.rust-lang.org/reference/procedural-macros.html#attribute-macros)|

| Derives | On | Explanation |
|-------|---|-------------|
| `#[derive(X)]` | `T` | Let some proc macro provide a goodish `impl` of `trait X`.  **[Useful]**  [Reference](https://doc.rust-lang.org/reference/)|

### `#[cfg]`

Attributes governing conditional compilation:

| Config Attributes | On | Explanation |
|-------|---|-------------|
| `#[cfg(X)]` | `*` | Include item if configuration `X` holds. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#the-cfg-attribute)|
| `#[cfg(all(X, Y, Z))]` | `*` | Include item if all options hold. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#conditional-compilation)|
| `#[cfg(any(X, Y, Z))]` | `*` | Include item if at least one option holds. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#conditional-compilation)|
| `#[cfg(not(X))]` | `*` | Include item if `X` does not hold. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#conditional-compilation)|
| `#[cfg_attr(X, foo = "msg")]` | `*` | Apply `#[foo = "msg"]` if configuration `X` holds. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#the-cfg_attr-attribute)|

> ⚠️ Note, options can generally be set multiple times, i.e., the same key can show up with multiple values. One can expect `#[cfg(target_feature = "avx")]` **and** `#[cfg(target_feature = "avx2")]` to be true at the same time.

| Known Options | On | Explanation |
|-------|---|-------------|
| `#[cfg(debug_assertions)]` | `*` | Whether `debug_assert!()` & co. would panic. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#debug_assertions)|
| `#[cfg(feature = "foo")]` | `*` | When your crate was compiled with _f._ `foo`.  **[Useful]**  [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#conditional-compilation)|
| `#[cfg(target_arch = "x86_64")]` | `*` | The CPU architecture crate is compiled for. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#target_arch)|
| `#[cfg(target_env = "msvc")]` | `*` | How DLLs and functions are interf. with on OS. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#target_env)|
| `#[cfg(target_endian = "little")]` | `*` | Main reason your new zero-cost prot. fails. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#target_endian)|
| `#[cfg(target_family = "unix")]` | `*` | Family operating system belongs to. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#target_family)|
| `#[cfg(target_feature = "avx")]` | `*` | Whether a particular class of instructions is avail. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#target_feature)|
| `#[cfg(target_os = "macos")]` | `*` | Operating system your code will run on. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#target_os)|
| `#[cfg(target_pointer_width = "64")]` | `*` | How many bits ptrs, `usize` and words have. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#target_pointer_width)|
| `#[cfg(target_vendor = "apple")]` | `*` |  Manufacturer of target. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#target_vendor)|
| `#[cfg(panic = "unwind")]` | `*` | Whether `unwind` or `abort` will happen on panic.  **[Missing source / explanation]** |
| `#[cfg(proc_macro)]` | `*` | Whether crate compiled as proc macro. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#proc_macro)|
| `#[cfg(test)]` | `*` | Whether compiled with `cargo test`.  **[Useful]**  [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#test)|

### `build.rs`

Environment variables and outputs related to the pre-build script. Consider **build-rs**[Link](https://docs.rs/build-rs/0.1.2/build/) instead.

| Input Environment | Explanation [Link](https://doc.rust-lang.org/cargo/reference/environment-variables.html) |
|-------|-------------|
| `CARGO_FEATURE_X` |  Environment variable set for each feature `x` activated.  |
| ↳  `CARGO_FEATURE_SOMETHING` |  If feature `something` were enabled. |
| ↳  `CARGO_FEATURE_SOME_FEATURE` | If _f._ `some-feature` were enabled; dash `-` converted to `_`. |
| `CARGO_CFG_X` | Exposes cfg's; joins mult. opts. by `,` and converts `-` to `_`.|
| ↳  `CARGO_CFG_TARGET_OS=macos` |  If `target_os` were set to `macos`. |
| ↳  `CARGO_CFG_TARGET_FEATURE=avx,avx2` |  If `target_feature` were set to `avx` and `avx2`. |
| `OUT_DIR` |  Where output should be placed. |
| `TARGET` |  Target triple being compiled for. |
| `HOST` |  Host triple (running this build script). |
| `PROFILE` |  Can be `debug` or `release`. |

**Notes:**

Available in `build.rs` via `env::var()?`. List not exhaustive.

| Output String | Explanation [Link](https://doc.rust-lang.org/cargo/reference/build-scripts.html) |
|-------|-------------|
| `cargo::rerun-if-changed=PATH` | (Only) run this `build.rs` again if `PATH` changed. |
| `cargo::rerun-if-env-changed=VAR` | (Only) run this `build.rs` again if environment `VAR` changed. |
| `cargo::rustc-cfg=KEY[="VALUE"]` | Emit given `cfg` option to be used for later compilation. |
| `cargo::rustc-cdylib-link-arg=FLAG ` | When building a `cdylib`, pass linker flag. |
| `cargo::rustc-env=VAR=VALUE ` | Emit var accessible via `env!()` in crate during compilation. |
| `cargo::rustc-flags=FLAGS` | Add special flags to compiler.  **[Missing source / explanation]**  |
| `cargo::rustc-link-lib=[KIND=]NAME` | Link native library as if via `-l` option. |
| `cargo::rustc-link-search=[KIND=]PATH` | Search path for native library as if via `-L` option. |
| `cargo::warning=MESSAGE` | Emit compiler warning. |

**Notes:**

Emitted from `build.rs` via `println!()`. List not exhaustive.

**Notes:**

For the _On_ column in attributes:

`C` means on crate level (usually given as `#![my_attr]` in the top level file).

`M` means on modules.

`F` means on functions.

`S` means on static.

`T` means on types.

`X` means something special.

`!` means on macros.

`*` means on almost any item.

---

# Working with Types

## Types, Traits, Generics

Allowing users to _bring their own types_ and avoid code duplication.

### Types & Traits

#### Types

**Diagram 101 — textual relationships:**

```text
relationships:
  entry: type [primitive]: u8
  entry: type [composed]: String
  entry: type [composed]: Device
```

- Set of values with given semantics, layout, …

| Type |   Values |
| --- | --- |
| `u8`  |  `{ 0_(u8), 1_(u8), …, 255_(u8) }` |
| `char`  | `{ 'a', 'b', … '🦀' }` |
| `struct S(u8, char)`  | `{ (0_(u8), 'a'), … (255_(u8), '🦀') }` |

Sample types and sample values.

#### Type Equivalence and Conversions

**Diagram 102 — textual relationships:**

```text
relationships:
  entry: type [primitive]: u8
  entry: type [primitive]: &u8
  entry: type [primitive]: &mut u8
  entry: type [primitive]: [u8; 1]
  entry: type [composed]: String
```

- It may be obvious but   `u8`,    `&u8`,    `&mut u8`, are entirely different from each other
- Any `t: T` only accepts values from exactly `T`, e.g.,
    - `f(0_u8)` can't be called with `f(&0_u8)`,
    - `f(&mut my_u8)` can't be called with `f(&my_u8)`,
    - `f(0_u8)` can't be called with `f(0_i8)`.

>  Yes, `0 != 0` (in a mathematical sense) when it comes to types! In a language sense, the operation  `==(0_(u8), 0_(u16))` just isn't defined to prevent happy little accidents.

| Type | Values |
| --- | --- |
| `u8`  | `{ 0_(u8), 1_(u8), …, 255_(u8) }` |
| `u16`  | `{ 0_(u16), 1_(u16), …, 65_535_(u16) }` |
| `&u8`  | `{ 0xffaa_(&u8), 0xffbb_(&u8), … }` |
| `&mut u8`  | `{ 0xffaa_(&mut u8), 0xffbb_(&mut u8), … }` |

How values differ between types.

- However, Rust might sometimes help to **convert between types**^(1)
    - **casts** manually convert values of types, `0_i8 as u8`
    - **coercions**  [See section](https://cheats.rs/#language-sugar) automatically convert types if safe^(2), `let x: &u8 = &mut 0_u8;`

**Notes:**

^(1) Casts and coercions convert values from one set (e.g., `u8`) to another (e.g., `u16`), possibly adding CPU instructions to do so; and in such differ from **subtyping**, which would imply type and subtype are part of the same set (e.g., `u8` being subtype of `u16` and `0_u8` being the same as `0_u16`) where such a conversion would be purely a compile time check. Rust does not use subtyping for regular types (and `0_u8` _does_ differ from `0_u16`) but sort-of for lifetimes. [Link](https://featherweightmusings.blogspot.com/2014/03/subtyping-and-coercion-in-rust.html)

^(2) Safety here is not just physical concept (e.g., `&u8` can't be coerced to `&u128`), but also whether 'history has shown that such a conversion would lead to programming errors'.

#### Implementations — `impl S { }`

**Diagram 103 — textual relationships:**

```text
relationships:
  entry:
    type [primitive]: u8
    impl: impl { … }
  entry:
    type [composed]: String
    impl: impl { … }
  entry:
    type [composed]: Port
    impl: impl { … }
```

```
impl Port {
    fn f() { … }
}
```


- Types usually come with **inherent implementations**, [Reference](https://doc.rust-lang.org/reference/items/implementations.html#inherent-implementations) e.g., `impl Port {}`, behavior _related_ to type:
    - **associated functions** `Port::new(80)`
    - **methods** `port.close()`

> What's considered _related_ is more philosophical than technical, nothing (except good taste) would prevent a `u8::play_sound()` from happening.

#### Traits — `trait T { }`

**Diagram 104 — textual relationships:**

```text
relationships:
  entry:
    trait implementation:
      ⌾
      Copy
  entry:
    trait implementation:
      ⌾
      Clone
  entry:
    trait implementation:
      ⌾
      Sized
  entry:
    trait implementation:
      ⌾
      ShowHex
```

- **Traits** …
    - are way to "abstract" behavior,
    - trait author declares semantically _this trait means X_,
    - other can implement ("subscribe to") that behavior for their type.
- Think about trait as "membership list" for types:

| Copy Trait |
| --- |
| **[subheader]** `Self` |
| `u8` |
| `u16` |
| `…` |

| Clone Trait |
| --- |
| **[subheader]** `Self` |
| `u8` |
| `String` |
| `…` |

| Sized Trait |
| --- |
| **[subheader]** `Self` |
| `char` |
| `Port` |
| `…` |

Traits as membership tables, `Self` refers to the type included.

- **Whoever is part of that membership list will adhere to behavior of list.**
- Traits can also include associated methods, functions, …

```
trait ShowHex {
    // Must be implemented according to documentation.
    fn as_hex() -> String;

    // Provided by trait author.
    fn print_hex() {}
}
```


**Diagram 105 — textual relationships:**

```text
relationships:
  entry:
    trait implementation:
      ⌾
      Copy
```

```
trait Copy { }
```


- Traits without methods often called **marker traits**.
- `Copy` is example marker trait, meaning _memory may be copied bitwise_.

**Diagram 106 — textual relationships:**

```text
relationships:
  entry:
    trait implementation:
      ⌾
      Sized
```

- Some traits entirely outside explicit control
- `Sized` provided by compiler for types with _known size_; either this is, or isn't

#### Implementing Traits for Types — `impl T for S { }`

```
impl ShowHex for Port { … }
```

- Traits are implemented for types 'at some point'.
- Implementation `impl A for B` add type `B` to the trait membership list:

| ShowHex Trait |
| --- |
| **[subheader]** `Self` |
| `Port` |

- Visually, you can think of the type getting a "badge" for its membership:

**Diagram 107 — textual relationships:**

```text
relationships:
  entry:
    type [primitive]: u8
    impl: impl { … }
    trait implementation:
      ⌾
      Sized
    trait implementation:
      ⌾
      Clone
    trait implementation:
      ⌾
      Copy
  entry:
    type [composed]: Device
    impl: impl { … }
    trait implementation:
      ⌾
      Transport
  entry:
    type [composed]: Port
    impl: impl { … }
    trait implementation:
      ⌾
      Sized
    trait implementation:
      ⌾
      Clone
    trait implementation:
      ⌾
      ShowHex
```

#### Traits vs. Interfaces

**Diagram 108 — textual relationships:**

```text
relationships:
  person: 👩‍🦰
  entry:
    trait implementation:
      ⌾
      Eat
```

**Diagram 109 — textual relationships:**

```text
relationships:
  person: 🧔
  entry:
    type [composed]: Venison
    trait implementation:
      ⌾
      Eat
```

**Diagram 110 — textual relationships:**

```text
relationships [diagram-width=130px]:
  person
  entry:
```

**Diagram 111 — textual relationships:**

```text
relationships:
  person: 🎅
  entry: venison.eat()
```

**Interfaces**

- In **Java**, Alice creates interface `Eat`.
- When Bob authors `Venison`, he must decide if `Venison` implements `Eat` or not.
- In other words, all membership must be exhaustively declared during type definition.
- When using `Venison`, Santa can make use of behavior provided by `Eat`:

```
// Santa imports `Venison` to create it, can `eat()` if he wants.
import food.Venison;

new Venison("rudolph").eat();
```


**Diagram 112 — textual relationships:**

```text
relationships:
  person: 👩‍🦰
  entry:
    trait implementation:
      ⌾
      Eat
```

**Diagram 113 — textual relationships:**

```text
relationships:
  person: 🧔
  entry: type [composed]: Venison
```

**Diagram 114 — textual relationships:**

```text
relationships:
  person: 👩‍🦰
  /
  person: 🧔
  entry:
    type [composed]: Venison
    +
    trait implementation:
      ⌾
      Eat
```

**Diagram 115 — textual relationships:**

```text
relationships:
  person: 🎅
  entry: venison.eat()
```

**Traits**

- In **Rust**, Alice creates trait `Eat`.
- Bob creates type `Venison` and decides not to implement `Eat` (he might not even know about `Eat`).
- Someone^(*) later decides adding `Eat` to `Venison` would be a really good idea.
- When using `Venison` Santa must import `Eat` separately:

```
// Santa needs to import `Venison` to create it, and import `Eat` for trait method.
use food::Venison;
use tasks::Eat;

// Ho ho ho
Venison::new("rudolph").eat();
```


**Notes:**

^(*) To prevent two persons from implementing `Eat` differently Rust limits that choice to either Alice or Bob; that is, an `impl Eat for Venison` may only happen in the crate of `Venison` or in the crate of `Eat`. For details see coherence.  **[Missing source / explanation]**

### Generics

#### Type Constructors — `Vec<>`

**Diagram 116 — textual relationships:**

```text
relationships:
  entry: type [composed]: Vec<u8>
  entry: type [composed]: Vec<char>
```

- `Vec<u8>` is type "vector of bytes"; `Vec<char>` is type "vector of chars", but what is `Vec<>`?

| Construct |   Values |
| --- | --- |
| `Vec<u8>`  |  `{ [], [1], [1, 2, 3], … }` |
| `Vec<char>`  |  `{ [], ['a'], ['x', 'y', 'z'], … }` |
| `Vec<>`  |  - |

Types vs type constructors.

**Diagram 117 — textual relationships:**

```text
relationships: entry: type [generic, dotted]: Vec<>
```

- `Vec<>` is no type, does not occupy memory, can't even be translated to code.
- `Vec<>` is **type constructor**, a "template" or "recipe to create types"
    - allows 3^(rd) party to construct concrete type via parameter,
    - only then would this `Vec<UserType>` become real type itself.

#### Generic Parameters — `<T>`

**Diagram 118 — textual relationships:**

```text
relationships:
  entry: type [generic, dotted]: Vec<T>
  entry: type [generic, dotted]: [T; 128]
  entry: type [generic, dotted]: &T
  entry: type [generic, dotted]: &mut T
  entry: type [generic, dotted]: S<T>
```

- Parameter for `Vec<>` often named `T` therefore `Vec<T>`.
- `T` "variable name for type" for user to plug in something specific, `Vec<f32>`, `S<u8>`, …

| Type Constructor |  Produces Family |
| --- | --- |
| `struct Vec<T> {}`  |  `Vec<u8>`, `Vec<f32>`, `Vec<Vec<u8>>`, … |
| `[T; 128]`  |  `[u8; 128]`, `[char; 128]`, `[Port; 128]` … |
| `&T`  |  `&u8`, `&u16`, `&str`,  … |

Type vs type constructors.

```
// S<> is type constructor with parameter T; user can supply any concrete type for T.
struct S<T> {
    x: T
}

// Within 'concrete' code an existing type must be given for T.
fn f() {
    let x: S<f32> = S::new(0_f32);
}

```


#### Const Generics — `[T; N]` and `S<const N: usize>`

**Diagram 119 — textual relationships:**

```text
relationships:
  entry: type [generic, dotted]: [T; n]
  entry: type [generic, dotted]: S<const N>
```

- Some type constructors not only accept specific type, but also **specific constant**.
- `[T; n]` constructs array type holding `T` type `n` times.
- For custom types declared as `MyArray<T, const N: usize>`.

| Type Constructor |  Produces Family |
| --- | --- |
| `[u8; N]`  |  `[u8; 0]`, `[u8; 1]`, `[u8; 2]`, … |
| `struct S<const N: usize> {}`  |  `S<1>`, `S<6>`, `S<123>`,  … |

Type constructors based on constant.

```
let x: [u8; 4]; // "array of 4 bytes"
let y: [f32; 16]; // "array of 16 floats"

// `MyArray` is type constructor requiring concrete type `T` and
// concrete usize `N` to construct specific type.
struct MyArray<T, const N: usize> {
    data: [T; N],
}
```


#### Bounds (Simple) — `where T: X`

**Diagram 120 — textual relationships:**

```text
relationships:
  person: 🧔
  entry: type [generic, dotted]: Num<T>
  narrow entry: →
  person: 🎅
  entry: type [composed]: Num<u8>
  entry: type [composed]: Num<f32>
  entry: type [composed]: Num<Cmplx>
  narrow entry: 
  entry:
    type [primitive]: u8
    trait implementation:
      ⌾
      Absolute
    trait implementation:
      ⌾
      Dim
    trait implementation:
      ⌾
      Mul
  entry [grayed]:
    type [composed]: Port
    trait implementation:
      ⌾
      Clone
    trait implementation:
      ⌾
      ShowHex
```

- If `T` can be any type, how can we _reason_ about (write code) for such a `Num<T>`?
- Parameter **bounds**:
    - limit what types (**trait bound**) or values (**const bound**  **[Missing source / explanation]** ) allowed,
    - we now can make use of these limits!
- Trait bounds act as "membership check":

```
// Type can only be constructed for some `T` if that
// T is part of `Absolute` membership list.
struct Num<T> where T: Absolute {
    …
}

```


| Absolute Trait |
| --- |
| **[subheader]** `Self` |
| `u8` |
| `u16` |
| `…` |

**Notes:**

We add bounds to the struct here. In practice it's nicer add bounds to the respective impl blocks instead, see later this section.

#### Bounds (Compound) — `where T: X + Y`

**Diagram 121 — textual relationships:**

```text
relationships:
  entry [grayed]:
    type [primitive]: u8
    trait implementation:
      ⌾
      Absolute
    trait implementation:
      ⌾
      Dim
    trait implementation:
      ⌾
      Mul
  entry [grayed]:
    type [primitive]: f32
    trait implementation:
      ⌾
      Absolute
    trait implementation:
      ⌾
      Mul
  entry [grayed]: type [primitive]: char
  entry:
    type [composed]: Cmplx
    trait implementation:
      ⌾
      Absolute
    trait implementation:
      ⌾
      Dim
    trait implementation:
      ⌾
      Mul
    trait implementation:
      ⌾
      DirName
    trait implementation:
      ⌾
      TwoD
  entry [grayed]:
    type [composed]: Car
    trait implementation:
      ⌾
      DirName
```

```
struct S<T>
where
    T: Absolute + Dim + Mul + DirName + TwoD
{ … }
```


- Long trait bounds can look intimidating.
- In practice, each `+ X` addition to a bound merely cuts down space of eligible types.

#### Implementing Families — `impl<>`

When we write:
```
impl<T> S<T> where T: Absolute + Dim + Mul {
    fn f(&self, x: T) { … };
}
```

It can be read as:
- here is an implementation recipe for any type `T` (the `impl <T>` part),
- where that type must be member of the `Absolute + Dim + Mul` traits,
- you may add an implementation block to the type family `S<>`,
- containing the methods …

You can think of such `impl<T> … {} ` code as **abstractly implementing a family of behaviors**. [Reference](https://doc.rust-lang.org/reference/items/implementations.html#generic-implementations) Most notably, they allow 3^(rd) parties to transparently materialize implementations similarly to how type constructors materialize types:

```
// If compiler encounters this, it will
// - check `0` and `x` fulfill the membership requirements of `T`
// - create two new version of `f`, one for `char`, another one for `u32`.
// - based on "family implementation" provided
s.f(0_u32);
s.f('x');
```


#### Blanket Implementations — `impl<T> X for T { … }`

Can also write "family implementations" so they apply trait to many types:

```
// Also implements Serialize for any type if that type already implements ToHex
impl<T> Serialize for T where T: ToHex { … }
```


These are called **blanket implementations**.

| ToHex |
| --- |
| **[subheader]** `Self` |
| `Port` |
| `Device` |
| `…` |

→  Whatever was in left table, may be added to right table, based on the following recipe (`impl`) →

| Serialize Trait |
| --- |
| **[subheader]** `Self` |
| `u8` |
| `Port` |
| `…` |

They can be neat way to give foreign types functionality in a modular way if they just implement another interface.

### Advanced Concepts [Advanced]

#### Trait Parameters — ` Trait<In> { type Out; }  `

Notice how some traits can be "attached" multiple times, but others just once?

**Diagram 122 — textual relationships:**

```text
relationships:
  entry [diagram-left=300px, diagram-top=25px]:
    type [composed]: Port
    trait implementation:
      ⌾
      From<u8>
    trait implementation:
      ⌾
      From<u16>
  entry [diagram-left=400px, diagram-top=25px]:
    type [composed]: Port
    trait implementation:
      ⌾
      Deref
    associated type [grayed]: type u8;
```

Why is that?

- Traits themselves can be generic over two **kinds of parameters**:
    - `trait From<I> {}`
    - `trait Deref { type O; }`
- Remember we said traits are "membership lists" for types and called the list `Self`?
- Turns out, parameters `I` (for **input**) and `O` (for **output**) are just more _columns_ to that trait's list:

```
impl From<u8> for u16 {}
impl From<u16> for u32 {}
impl Deref for Port { type O = u8; }
impl Deref for String { type O = str; }
```


- Row 1:
  - Header, columns 1–2: From
- Row 2 [subheader]:
  - Header, column 1: `Self`
  - Header, column 2: `I`
- Row 3:
  - column 1: `u16`
  - column 2: `u8`
- Row 4:
  - column 1: `u32`
  - column 2: `u16`
- Row 5:
  - columns 1–2: `…`

- Row 1:
  - Header, columns 1–2: Deref
- Row 2 [subheader]:
  - Header, column 1: `Self`
  - Header, column 2: `O`
- Row 3:
  - column 1: `Port`
  - column 2: `u8`
- Row 4:
  - column 1: `String`
  - column 2: `str`
- Row 5:
  - columns 1–2: `…`

Input and output parameters.

Now here's the twist,
- **any output `O` parameters must be uniquely determined by input parameters `I`**,
- (in the same way as a relation `X Y` would represent a function),
- `Self` counts as an input.

A more complex example:

```
trait Complex<I1, I2> {
    type O1;
    type O2;
}
```


- this creates a relation of types named `Complex`,
- with 3 inputs (`Self` is always one) and 2 outputs, and it holds `(Self, I1, I2) => (O1, O2)`

- Row 1:
  - Header, columns 1–5: Complex
- Row 2 [subheader]:
  - Header, column 1: `Self [I]`
  - Header, column 2: `I1`
  - Header, column 3: `I2`
  - Header, column 4: `O1`
  - Header, column 5: `O2`
- Row 3:
  - column 1: `Player`
  - column 2: `u8`
  - column 3: `char`
  - column 4: `f32`
  - column 5: `f32`
- Row 4:
  - column 1: `EvilMonster`
  - column 2: `u16`
  - column 3: `str`
  - column 4: `u8`
  - column 5: `u8`
- Row 5:
  - column 1: `EvilMonster`
  - column 2: `u16`
  - column 3: `String`
  - column 4: `u8`
  - column 5: `u8`
- Row 6:
  - column 1: `NiceMonster`
  - column 2: `u16`
  - column 3: `String`
  - column 4: `u8`
  - column 5: `u8`
- Row 7:
  - column 1: `NiceMonster`^(**[Pitfall / intentionally wrong]**)
  - column 2: `u16`
  - column 3: `String`
  - column 4: `u8`
  - column 5: `u16`

Various trait implementations. The last one is not valid as `(NiceMonster, u16, String)` has
 already uniquely determined the outputs.

#### Trait Authoring Considerations (Abstract)

**Diagram 123 — textual relationships:**

```text
relationships:
  person: 👩‍🦰
  entry:
    trait implementation [dotted]:
      ⌾
      A<I>
```

**Diagram 124 — textual relationships:**

```text
relationships:
  person: 🧔
  entry: type [composed]: Car
```

**Diagram 125 — textual relationships:**

```text
relationships:
  person: 👩‍🦰
  /
  person: 🧔
  entry:
    type [composed]: Car
    trait implementation [dotted]:
      ⌾
      A<I>
```

**Diagram 126 — textual relationships:**

```text
relationships:
  person: 🎅
  entry:
    car.a(0_u8)
    car.a(0_f32)
```

**Diagram 127 — textual relationships:**

```text
relationships:
  person: 👩‍🦰
  entry:
    trait implementation:
      ⌾
      B
    associated type: type O;
```

**Diagram 128 — textual relationships:**

```text
relationships:
  person: 🧔
  entry: type [composed]: Car
```

**Diagram 129 — textual relationships:**

```text
relationships:
  person: 👩‍🦰
  /
  person: 🧔
  entry:
    type [composed]: Car
    trait implementation:
      ⌾
      B
    associated type: T = u8;
```

**Diagram 130 — textual relationships:**

```text
relationships:
  person: 🎅
  entry:
    car.b(0_u8)
    car.b(0_f32)
```

- Parameter choice (input vs. output) also determines who may be allowed to add members:
    - `I` parameters allow "familes of implementations" be forwarded to user (Santa),
    - `O` parameters must be determined by trait implementor (Alice or Bob).

```
trait A<I> { }
trait B { type O; }

// Implementor adds (X, u32) to A.
impl A<u32> for X { }

// Implementor adds family impl. (X, …) to A, user can materialze.
impl<T> A<T> for Y { }

// Implementor must decide specific entry (X, O) added to B.
impl B for X { type O = u32; }
```


- Row 1:
  - Header, columns 1–2: A
- Row 2 [subheader]:
  - Header, column 1: `Self`
  - Header, column 2: `I`
- Row 3:
  - column 1: `X`
  - column 2: `u32`
- Row 4:
  - column 1: `Y`
  - column 2: `…`

Santa may add more members by providing his own type for `T`.

- Row 1:
  - Header, columns 1–2: B
- Row 2 [subheader]:
  - Header, column 1: `Self`
  - Header, column 2: `O`
- Row 3:
  - column 1: `Player`
  - column 2: `String`
- Row 4:
  - column 1: `X`
  - column 2: `u32`

For given set of inputs (here `Self`), implementor must pre-select `O`.

#### Trait Authoring Considerations (Example)

**Diagram 131 — textual relationships:**

```text
relationships:
  entry:
    trait implementation:
      ⌾
      Query
```

**Diagram 132 — textual relationships:**

```text
relationships: narrow entry: vs.
```

**Diagram 133 — textual relationships:**

```text
relationships:
  entry:
    trait implementation [dotted]:
      ⌾
      Query<I>
```

**Diagram 134 — textual relationships:**

```text
relationships: narrow entry: vs.
```

**Diagram 135 — textual relationships:**

```text
relationships:
  entry:
    trait implementation:
      ⌾
      Query
    associated type: type O;
```

**Diagram 136 — textual relationships:**

```text
relationships: narrow entry: vs.
```

**Diagram 137 — textual relationships:**

```text
relationships:
  entry:
    trait implementation [dotted]:
      ⌾
      Query<I>
    associated type: type O;
```

Choice of parameters goes along with purpose trait has to fill.

---

**No Additional Parameters**

```
trait Query {
    fn search(&self, needle: &str);
}

impl Query for PostgreSQL { … }
impl Query for Sled { … }

postgres.search("SELECT …");
```


**Diagram 138 — textual relationships:**

```text
relationships:
  person: 👩‍🦰
  entry:
    trait implementation:
      ⌾
      Query
```

**Diagram 139 — textual relationships:**

```text
relationships: narrow entry: →
```

**Diagram 140 — textual relationships:**

```text
relationships:
  person: 🧔
  entry:
    type [composed]: PostgreSQL
    trait implementation:
      ⌾
      Query
```

**Diagram 141 — textual relationships:**

```text
relationships:
  entry:
    type [composed]: Sled
    trait implementation:
      ⌾
      Query
```

Trait author assumes:
- neither implementor nor user need to customize API.

---

**Input Parameters**

```
trait Query<I> {
    fn search(&self, needle: I);
}

impl Query<&str> for PostgreSQL { … }
impl Query<String> for PostgreSQL { … }
impl<T> Query<T> for Sled where T: ToU8Slice { … }

postgres.search("SELECT …");
postgres.search(input.to_string());
sled.search(file);
```


**Diagram 142 — textual relationships:**

```text
relationships:
  person: 👩‍🦰
  entry:
    trait implementation [dotted]:
      ⌾
      Query<I>
```

**Diagram 143 — textual relationships:**

```text
relationships: narrow entry: →
```

**Diagram 144 — textual relationships:**

```text
relationships:
  person: 🧔
  entry:
    type [composed]: PostgreSQL
    trait implementation:
      ⌾
      Query<&str>
    trait implementation:
      ⌾
      Query<String>
```

**Diagram 145 — textual relationships:**

```text
relationships:
  entry:
    type [composed]: Sled
    trait implementation [dotted]:
      ⌾
      Query<T>
    note:
      span [diagram-display=inline-block]: ↲
      where
      T
      is
      ToU8Slice
      .
```

Trait author assumes:
- implementor would customize API in multiple ways for same `Self` type,
- users may want ability to decide for which `I`-types behavior should be possible.

---

**Output Parameters**

```
trait Query {
    type O;
    fn search(&self, needle: Self::O);
}

impl Query for PostgreSQL { type O = String; …}
impl Query for Sled { type O = Vec<u8>; … }

postgres.search("SELECT …".to_string());
sled.search(vec![0, 1, 2, 4]);
```


**Diagram 146 — textual relationships:**

```text
relationships:
  person: 👩‍🦰
  entry:
    trait implementation:
      ⌾
      Query
    associated type: type O;
```

**Diagram 147 — textual relationships:**

```text
relationships: narrow entry: →
```

**Diagram 148 — textual relationships:**

```text
relationships:
  person: 🧔
  entry:
    type [composed]: PostgreSQL
    trait implementation:
      ⌾
      Query
    associated type: O = String;
```

**Diagram 149 — textual relationships:**

```text
relationships:
  entry:
    type [composed]: Sled
    trait implementation:
      ⌾
      Query
    associated type: O = Vec<u8>;
```

Trait author assumes:
- implementor would customize API for `Self` type (but in only one way),
- users do not need, or should not have, ability to influence customization for specific `Self`.

> As you can see here, the term **input** or **output** does **not** (necessarily) have anything to do with whether `I` or `O` are inputs or outputs to an actual function!

---

**Multiple In- and Output Parameters**

```
trait Query<I> {
    type O;
    fn search(&self, needle: I) -> Self::O;
}

impl Query<&str> for PostgreSQL { type O = String; … }
impl Query<CString> for PostgreSQL { type O = CString; … }
impl<T> Query<T> for Sled where T: ToU8Slice { type O = Vec<u8>; … }

postgres.search("SELECT …").to_uppercase();
sled.search(&[1, 2, 3, 4]).pop();
```


**Diagram 150 — textual relationships:**

```text
relationships:
  person: 👩‍🦰
  entry:
    trait implementation [dotted]:
      ⌾
      Query<I>
    associated type: type O;
```

**Diagram 151 — textual relationships:**

```text
relationships: narrow entry: →
```

**Diagram 152 — textual relationships:**

```text
relationships:
  person: 🧔
  entry:
    type [composed]: PostgreSQL
    trait implementation:
      ⌾
      Query<&str>
    associated type: O = String;
    trait implementation:
      ⌾
      Query<CString>
    associated type: O = CString;
```

**Diagram 153 — textual relationships:**

```text
relationships:
  entry:
    type [composed]: Sled
    trait implementation [dotted]:
      ⌾
      Query<T>
    associated type: O = Vec<u8>;
    note:
      span [diagram-display=inline-block]: ↲
      where
      T
      is
      ToU8Slice
      .
```

Like examples above, in particular trait author assumes:
- users may want ability to decide for which `I`-types ability should be possible,
- for given inputs, implementor should determine resulting output type.

#### Dynamic / Zero Sized Types

**Diagram 154 — textual relationships:**

```text
relationships:
  entry:
    type [composed]: MostTypes
    trait implementation:
      ⌾
      Sized
    note: Normal types.
```

**Diagram 155 — textual relationships:**

```text
relationships: narrow entry [diagram-width=60px]: vs.
```

**Diagram 156 — textual relationships:**

```text
relationships:
  entry:
    type [zero]: Z
    trait implementation:
      ⌾
      Sized
    note: Zero sized.
```

**Diagram 157 — textual relationships:**

```text
relationships: narrow entry [diagram-width=60px]: vs.
```

**Diagram 158 — textual relationships:**

```text
relationships:
  entry:
    type [primitive]: str
    trait implementation [grayed]:
      ⌾
      Sized
    note: Dynamically sized.
```

**Diagram 159 — textual relationships:**

```text
relationships:
  entry:
    type [primitive]: [u8]
    trait implementation [grayed]:
      ⌾
      Sized
```

**Diagram 160 — textual relationships:**

```text
relationships:
  entry:
    type [primitive]: dyn Trait
    trait implementation [grayed]:
      ⌾
      Sized
```

**Diagram 161 — textual relationships:**

```text
relationships:
  entry:
    type [primitive]: …
    trait implementation [grayed]:
      ⌾
      Sized
```

- A type `T` is **`Sized`** [std](https://doc.rust-lang.org/std/marker/trait.Sized.html) if at compile time it is known how many bytes it occupies, `u8` and `&[u8]` are, `[u8]` isn't.
- Being `Sized` means `impl Sized for T {}` holds. Happens automatically and cannot be user impl'ed.
- Types not `Sized` are called **dynamically sized types** [Book](https://doc.rust-lang.org/book/ch19-04-advanced-types.html#dynamically-sized-types-and-the-sized-trait) [Nomicon](https://doc.rust-lang.org/nightly/nomicon/exotic-sizes.html#dynamically-sized-types-dsts)  [Reference](https://doc.rust-lang.org/reference/dynamically-sized-types.html#dynamically-sized-types) (DSTs), sometimes **unsized**.
- Types without data are called **zero sized types** [Nomicon](https://doc.rust-lang.org/nightly/nomicon/exotic-sizes.html#zero-sized-types-zsts) (ZSTs), do not occupy space.

| Example | Explanation |
|---------|-------------|
| `struct A { x: u8 }` | Type `A` is sized, i.e., `impl Sized for A` holds, this is a 'regular' type. |
| `struct B { x: [u8] }` | Since `[u8]` is a DST, `B` in turn becomes DST, i.e., does not `impl Sized`. |
| `struct C<T> { x: T }` | Type params **have** implicit `T: Sized` bound, e.g., `C<A>` is valid, `C<B>` is not. |
| `struct D<T: ?Sized> { x: T }` | Using **`?Sized`** [Reference](https://doc.rust-lang.org/reference/trait-bounds.html#sized) allows opt-out of that bound, i.e., `D<B>` is also valid. |
| `struct E;` | Type `E` is zero-sized (and also sized) and will not consume memory. |
| `trait F { fn f(&self); }` | Traits **do not have** an implicit `Sized` bound, i.e., `impl F for B {}` is valid.  |
| ↳  `trait F: Sized {}` | Traits can however opt into `Sized` via supertraits.[See section](https://cheats.rs/#functions-behavior) |
| `trait G { fn g(self); }` | For `Self`-like params DST `impl` may still fail as params can't go on stack.  |

#### `?Sized`

**Diagram 162 — textual relationships:**

```text
relationships:
  entry: type [generic, dotted]: S<T>
  narrow entry: →
  entry: type [composed]: S<u8>
  entry: type [composed]: S<char>
  entry: type [composed, grayed]: S<str>
```

```
struct S<T> { … }
```


- `T` can be any concrete type.
- However, there exists invisible default bound `T: Sized`, so `S<str>` is not possible out of box.
- Instead we have to add `T : ?Sized` to opt-out of that bound:

**Diagram 163 — textual relationships:**

```text
relationships:
  entry: type [generic, dotted]: S<T>
  narrow entry: →
  entry: type [composed]: S<u8>
  entry: type [composed]: S<char>
  entry: type [composed]: S<str>
```

```
struct S<T> where T: ?Sized { … }
```


#### Generics and Lifetimes — `<'a>`

**Diagram 164 — textual relationships:**

```text
relationships:
  entry: type [generic, dotted]: S<'a>
  entry: type [generic, dotted]: &'a f32
  entry: type [generic, dotted]: &'a mut u8
```

- Lifetimes act^(*) as type parameters:
    - user must provide specific `'a` to instantiate type (compiler will help within methods),
    - `S<'p>` and `S<'q>` are different types, just like `Vec<f32>` and `Vec<u8>` are
    - meaning you can't just assign value of type `S<'a>` to variable expecting `S<'b>` (exception: subtype relationship for lifetimes, i.e., `'a` outlives `'b`).

**Diagram 165 — textual relationships:**

```text
relationships:
  entry: type [generic, dotted]: S<'a>
  narrow entry: →
  entry: type [composed]: S<'auto>
  entry: type [composed]: S<'static>
```

- `'static` is only globally available type of the lifetimes _kind_.

```
// `'a is free parameter here (user can pass any specific lifetime)
struct S<'a> {
    x: &'a u32
}

// In non-generic code, 'static is the only nameable lifetime we can explicitly put in here.
let a: S<'static>;

// Alternatively, in non-generic code we can (often must) omit 'a and have Rust determine
// the right value for 'a automatically.
let b: S;
```


**Notes:**

^(*) There are subtle differences, for example you can create an explicit instance `0` of a type `u32`, but with the exception of `'static` you can't really create a lifetime, e.g., "lines 80 - 100", the compiler will do that for you. [Link](https://medium.com/nearprotocol/understanding-rust-lifetimes-e813bcd405fa)

**Notes:**

Examples expand by clicking.

## Foreign Types and Traits

A visual overview of types and traits in your crate and upstream.

**Diagram 166 — textual crate region:**

```text
crate region [diagram-height=310px]:
  group [diagram-left=6%, diagram-width=200px]:
    entry [diagram-left=100px, diagram-top=10%]: type [primitive]: u8
    entry [diagram-left=20px, diagram-top=32%]: type [primitive]: u16
    entry [diagram-left=30px, diagram-top=20%]: type [primitive]: f32
    entry [diagram-left=0px, diagram-top=7%]: type [primitive]: bool
    entry [diagram-left=120px, diagram-top=32%]: type [primitive]: char
    label [diagram-left=8px, diagram-top=43%]: Primitive Types
  group [diagram-left=50%, diagram-width=350px]:
    entry [diagram-left=110px, diagram-top=60px]: type [composed]: File
    entry [diagram-left=180px, diagram-top=34%]: type [composed]: String
    entry [diagram-left=230px, diagram-top=13%]: type [composed]: Builder
    label [diagram-left=150px, diagram-top=43%]: Composite Types
  group [diagram-left=30px, diagram-top=53%, diagram-width=200px]:
    entry [diagram-left=50px, diagram-top=8%]: type [composed]: Vec<T>
    entry [diagram-left=45px, diagram-top=9%]: type [composed]: Vec<T>
    entry [diagram-left=40px, diagram-top=10%]: type [generic, dotted]: Vec<T>
    entry [diagram-left=170px, diagram-top=2%]: type [primitive]: &'a T
    entry [diagram-left=165px, diagram-top=3%]: type [primitive]: &'a T
    entry [diagram-left=160px, diagram-top=4%]: type [generic, dotted]: &'a T
    entry [diagram-left=140px, diagram-top=18%]: type [primitive]: &mut 'a T
    entry [diagram-left=135px, diagram-top=19%]: type [primitive]: &mut 'a T
    entry [diagram-left=130px, diagram-top=20%]: type [generic, dotted]: &mut 'a T
    entry [diagram-left=40px, diagram-top=28%]: type [primitive]: [T; n]
    entry [diagram-left=35px, diagram-top=29%]: type [primitive]: [T; n]
    entry [diagram-left=30px, diagram-top=30%]: type [generic, dotted]: [T; n]
    label [diagram-left=80px, diagram-top=40%]: Type Constructors
  group [diagram-left=50%, diagram-top=53%, diagram-width=200px]:
    entry [diagram-left=10px, diagram-top=8%]: function: Vec<T>
    entry [diagram-left=5px, diagram-top=9%]: function: Vec<T>
    entry [diagram-left=0px, diagram-top=10%]: function [dotted]: f<T>() {}
    entry [diagram-left=20px, diagram-top=24%]: function: drop() {}
    label [diagram-left=10px, diagram-top=40%]: Functions
  group [grayed, diagram-left=80%, diagram-top=53%, diagram-width=140px]:
    entry [diagram-left=5px, diagram-top=15%]: macro: PI
    entry [diagram-left=0px, diagram-top=28%]: macro: dbg!
    label [diagram-left=20px, diagram-top=40%]: Other
  group [diagram-left=36%, diagram-width=30px]:
    entry [diagram-left=20px, diagram-top=20px]:
      trait implementation:
        ⌾
        Copy
    entry [diagram-left=60px, diagram-top=90px]:
      trait implementation:
        ⌾
        Deref
      associated type: type Tgt;
    entry [diagram-left=90px, diagram-top=50px]:
      trait implementation:
        ⌾
        From<T>
    entry [diagram-left=85px, diagram-top=55px]:
      trait implementation:
        ⌾
        From<T>
    entry [diagram-left=80px, diagram-top=60px]:
      trait implementation [dotted]:
        ⌾
        From<T>
    label [diagram-left=60px, diagram-top=43%]: Traits
```

Items defined in upstream crates.

**Diagram 167 — textual crate region:**

```text
crate region [your-crate, diagram-height=190px]:
  group [diagram-left=5px, diagram-width=200px]:
    entry [diagram-left=10px, diagram-top=25px]:
      trait implementation:
        ⌾
        Serialize
    entry [diagram-left=30px, diagram-top=65px]:
      trait implementation:
        ⌾
        Transport
    entry [diagram-left=15px, diagram-top=105px]:
      trait implementation:
        ⌾
        ShowHex
  group [diagram-left=150px, diagram-width=200px]:
    entry [diagram-left=0px, diagram-top=25px]:
      type [composed]: Device
      trait implementation [grayed]:
        ⌾
        From<u8>
      note: Foreign trait impl. for local type.
    entry [diagram-left=100px, diagram-top=25px]:
      type [grayed, composed]: String
      trait implementation:
        ⌾
        Serialize
      note: Local trait impl. for foreign type.
    entry [diagram-left=200px, diagram-top=25px]:
      type [composed, grayed]: String
      trait implementation [grayed]:
        ⌾
        From<u8>
      note: **[Pitfall / intentionally wrong]** Illegal, foreign trait for f. type.
    entry [diagram-left=200px, diagram-top=110px]:
      type [composed, grayed]: String
      trait implementation [grayed]:
        ⌾
        From<Port>
      note: Exception: Legal if used type local.
    entry [diagram-left=300px, diagram-top=25px]:
      type [composed]: Port
      trait implementation:
        ⌾
        From<u8>
      trait implementation:
        ⌾
        From<u16>
      note:
        Mult. impl. of trait with differing
        b: IN
        params.
    entry [diagram-left=400px, diagram-top=25px]:
      type [composed]: Container
      trait implementation:
        ⌾
        Deref
      associated type [grayed]: Tgt = u8;
      trait implementation:
        ⌾
        Deref
      associated type [grayed]: Tgt = f32;
      note:
        **[Pitfall / intentionally wrong]** Illegal impl. of trait with differing
        b: OUT
        params.
    entry [diagram-left=510px, diagram-top=15px]: type [composed]: T
    entry [diagram-left=505px, diagram-top=20px]: type [composed]: T
    entry [diagram-left=500px, diagram-top=25px]:
      type [generic, dotted]: T
      trait implementation:
        ⌾
        ShowHex
      note: Blanket impl. of trait for any type.
```

Your crate.

**Notes:**

Examples of traits and types, and which traits you can implement for which type.

## Type Conversions

How to get `B` when you have `A`?

### Intro

```
fn f(x: A) -> B {
    // How can you obtain B from A?
}
```


| Method | Explanation |
|--------| -----------|
| **Identity** | Trivial case, `B` **is exactly** `A`. |
| **Computation** | Create and manipulate instance of `B` by **writing code** transforming data. |
| **Casts** | **On-demand** conversion between types where caution is advised. |
| **Coercions** | **Automatic** conversion within _'weakening ruleset'_.^(1) |
| **Subtyping** | **Automatic** conversion within _'same-layout-different-lifetimes ruleset'_.^(1) |

**Notes:**

^(1) While both convert `A` to `B`, **coercions** generally link to an _unrelated_ `B` (a type "one could reasonably expect to have different methods"),
while **subtyping** links to a `B` differing only in lifetimes.

### Computation (Traits)

```
fn f(x: A) -> B {
    x.into()
}
```


_Bread and butter_ way to get `B` from `A`. Some traits provide canonical, user-computable type relations:

| Trait | Example | Trait implies … |
|--------| -----------|-----------|
| `impl From<A> for B {}` | `a.into()` | _Obvious_, always-valid relation. |
| `impl TryFrom<A> for B {}` | `a.try_into()?` | _Obvious_, sometimes-valid relation. |
| `impl Deref for A {}` | `*a` | `A` is smart pointer carrying `B`; also enables coercions.  |
| `impl AsRef<B> for A {}` | `a.as_ref()` | `A` can be _viewed_ as `B`. |
| `impl AsMut<B> for A {}` | `a.as_mut()` | `A` can be mutably viewed as `B`. |
| `impl Borrow<B> for A {}` | `a.borrow()` | `A` has borrowed _analog_ `B` (behaving same under `Eq`, …). |
| `impl ToOwned for A { … }` | `a.to_owned()` | `A` has owned analog `B`. |

### Casts

```
fn f(x: A) -> B {
    x as B
}
```


Convert types **with keyword `as`** if conversion _relatively obvious_ but **might cause issues**. [Nomicon](https://doc.rust-lang.org/nightly/nomicon/casts.html)

|  A | B | Example | Explanation |
|----|----| ----| -----------|
| `Pointer` | `Pointer` | `device_ptr as *const u8` | If `*A`, `*B` are `Sized`. |
| `Pointer` | `Integer` | `device_ptr as usize` |  |
| `Integer` | `Pointer` | `my_usize as *const Device` |  |
| `Number` | `Number` | `my_u8 as u16` | Often surprising behavior. [See section](https://cheats.rs/#numeric-types-ref) |
| `enum` w/o fields | `Integer` | `E::A as u8` |  |
| `bool` | `Integer` | `true as u8` |  |
| `char` | `Integer` | `'A' as u8` |  |
| `&[T; N]` | `*const T` | `my_ref as *const u8` |  |
| `fn(…)` | `Pointer` | `f as *const u8` | If `Pointer` is `Sized`.  |
| `fn(…)` | `Integer` | `f as usize` |  |

Where `Pointer`, `Integer`, `Number` are just used for brevity and actually mean:
- `Pointer` any `*const T` or `*mut T`;
- `Integer` any countable `u8` … `i128`;
- `Number` any `Integer`, `f32`, `f64`.

> **Opinion**  **[Opinion]**  — Casts, esp. `Number - Number`, can easily go wrong.
> If you are concerned with correctness, consider more explicit methods instead.

### Coercions

```
fn f(x: A) -> B {
    x
}
```


Automatically **weaken** type `A` to `B`; types can be _substantially_^(1) different. [Nomicon](https://doc.rust-lang.org/nightly/nomicon/coercions.html)

|  A | B |  Explanation |
|----|----| -----------|
| `&mut T` | `&T` | **Pointer weakening**. |
| `&mut T` | `*mut T` | - |
| `&T` | `*const T` | - |
| `*mut T` | `*const T` | - |
| `&T` | `&U` | **Deref**, if `impl Deref<Target=U> for T`. |
| `T` | `U` | **Unsizing**, if `impl CoerceUnsized<U> for T`.^(2)  **[Unstable / nightly]**  |
| `T` | `V` | **Transitivity**, if `T` coerces to `U` and `U` to `V`. |
| `\|x\| x + x` | `fn(u8) -> u8` | **Non-capturing closure**, to equivalent `fn` pointer. |

^(1) _Substantially_ meaning one can regularly expect a coercion result `B` to be _an entirely different type_ (i.e., have entirely different methods) than the original type `A`.

^(2) Does not quite work in example above as unsized can't be on stack; imagine `f(x: &A) -> &B` instead. Unsizing works by default for:
- `[T; n]` to `[T]`
- `T` to `dyn Trait` if `impl Trait for T {}`.
- `Foo<…, T, …>` to `Foo<…, U, …>` under arcane [Link](https://doc.rust-lang.org/nomicon/coercions.html) circumstances.

### Subtyping [Advanced]

```
fn f(x: A) -> B {
    x
}
```


Automatically converts `A` to `B` for types **only differing in lifetimes** [Nomicon](https://doc.rust-lang.org/nightly/nomicon/subtyping.html) - subtyping **examples**:

| A^((subtype))  | B^((supertype)) | Explanation |
|--------| -----------| -----------|
| `&'static u8` | `&'a u8` | Valid, _forever-_pointer is also _transient-_pointer. |
| `&'a u8` | `&'static u8` |  **[Pitfall / intentionally wrong]**  Invalid, transient should not be forever. |
| `&'a &'b u8` | `&'a &'b u8` | Valid, same thing. **But now things get interesting. Read on.** |
| `&'a &'static u8` | `&'a &'b u8` | Valid, `&'static u8` is also `&'b u8`; **covariant** inside `&`.  |
| `&'a mut &'static u8` | `&'a mut &'b u8` |  **[Pitfall / intentionally wrong]**  Invalid and surprising; **invariant** inside `&mut`. |
| `Box<&'static u8>` | `Box<&'a u8>` | Valid, `Box` with forever is also box with transient; covariant. |
| `Box<&'a u8>` | `Box<&'static u8>` |  **[Pitfall / intentionally wrong]**  Invalid, `Box` with transient may not be with forever. |
| `Box<&'a mut u8>` | `Box<&'a u8>` |  **[Pitfall / intentionally wrong]**  ^(⚡) Invalid, see table below, `&mut u8` never _was a_ `&u8`. |
| `Cell<&'static u8>` | `Cell<&'a u8>` |  **[Pitfall / intentionally wrong]**  Invalid, `Cell` are **never** something else; invariant. |
| `fn(&'static u8)` | `fn(&'a u8)` |  **[Pitfall / intentionally wrong]**  If `fn` needs forever it may choke on transients; **contravar.**|
| `fn(&'a u8)` | `fn(&'static u8)` |  But sth. that eats transients **can be**(!) sth. that eats forevers. |
| `for<'r> fn(&'r u8)` | `fn(&'a u8)` | Higher-ranked type `for<'r> fn(&'r u8)` is also `fn(&'a u8).` |

In contrast, these are **not** **[Pitfall / intentionally wrong]**  examples of subtyping:

|  A | B |  Explanation |
|----|----| -----------|
| `u16` | `u8` |  **[Pitfall / intentionally wrong]**  **Obviously invalid**; `u16` should never automatically be `u8`. |
| `u8` | `u16` |  **[Pitfall / intentionally wrong]**  Invalid **by design**; types w. different data still never subtype even if they _could_. |
| `&'a mut u8` | `&'a u8` |  **[Pitfall / intentionally wrong]**  Trojan horse, not subtyping; but coercion (still works, just not subtyping). |

### Variance [Advanced]

```
fn f(x: A) -> B {
    x
}
```


Automatically converts `A` to `B` for types **only differing in lifetimes** [Nomicon](https://doc.rust-lang.org/nightly/nomicon/subtyping.html) -  subtyping **variance rules**:

- A longer lifetime `'a` that outlives a shorter `'b` is a subtype of `'b`.
- Implies `'static` is subtype of all other lifetimes `'a`.
- Whether types with parameters (e.g., `&'a T`) are subtypes of each other the following variance table is used:

| Construct^(1) | `'a` | `T` | `U` |
|--------| -----------| -------| -------|
| `&'a T` | covariant | covariant |  |
| `&'a mut T` | covariant | invariant |  |
| `Box<T>` |  | covariant |  |
| `Cell<T>` |  | invariant |  |
| `fn(T) -> U` |  | **contra**variant | covariant |
| `*const T` |  | covariant |  |
| `*mut T` |  | invariant |  |

**Notes:**

**Covariant** means if `A` is subtype of `B`, then `T[A]` is subtype of `T[B]`.

**Contravariant** means if `A` is subtype of `B`, then **`T[B]`** is subtype of `T[A]`.

**Invariant** means even if `A` is subtype of `B`, neither `T[A]` nor `T[B]` will be subtype of the other.

^(1) Compounds like `struct S<T> {}` obtain variance through their used fields, usually becoming invariant if multiple variances are mixed.

> 💡 **In other words**, 'regular' types are never subtypes of each other (e.g., `u8` is not subtype of `u16`),
> and a `Box<u32>` would never be sub- or supertype of anything.
> However, generally a `Box<A>`, _can_ be subtype of `Box<B>` (via covariance) if `A` is a subtype
> of `B`, which can only happen if `A` and `B` are 'sort of the same type that only differed in lifetimes', e.g., `A` being `&'static u32` and `B` being `&'a u32`.

---

# Coding Guides

## Idiomatic Rust

If you are used to Java or C, consider these.

| Idiom | Code |
|--------| ---- |
| **Think in Expressions** | `y = if x { a } else { b };` |
|  | `y = loop { break 5 };`  |
|  | `fn f() -> u32 { 0 }`  |
| **Think in Iterators** | `(1..10).map(f).collect()` |
|  | `names.iter().filter(\|x\| x.starts_with("A"))` |
| **Test Absence with `?`** | `y = try_something()?;` |
|  | `get_option()?.run()?` |
| **Use Strong Types** | `enum E { Invalid, Valid { … } }` over `ERROR_INVALID = -1` |
|  | `enum E { Visible, Hidden }` over `visible: bool` |
|  | `struct Charge(f32)` over `f32` |
| **Illegal State: Impossible** | `my_lock.write().unwrap().guaranteed_at_compile_time_to_be_locked = 10;` ^(1)|
|  | `thread::scope(\|s\| { /* Threads can't exist longer than scope() */ });` |
| **Avoid _Global_ State** | Being depended on in multiple versions can secretly duplicate statics.  **[Pitfall / intentionally wrong]**  [Link](https://doc.rust-lang.org/cargo/reference/resolver.html#version-incompatibility-hazards) |
| **Provide Builders** | `Car::builder().name("Model T").hp(20).build();` |
| **Make it Const** | Where possible mark fns. `const`; where feasible run code inside `const {}`. |
| **Don't Panic** | Panics are _not_ exceptions, they suggest immediate process abortion! |
|  | Only panic on programming error; use `Option<T>`[std](https://doc.rust-lang.org/std/option/enum.Option.html) or `Result<T,E>`[std](https://doc.rust-lang.org/std/result/enum.Result.html) otherwise. |
|  | If clearly user requested, e.g., calling `obtain()` vs. `try_obtain()`, panic ok too. |
|  | Inside `const { NonZero::new(1).unwrap() }` p. becomes compile error, ok too. |
| **Generics in Moderation** | A simple `<T: Bound>` (e.g., `AsRef<Path>`) can make your APIs nicer to use.  |
| | Complex bounds make it impossible to follow. If in doubt don't be creative with _g_.  |
| **Split Implementations** | Generics like `Point<T>` can have separate `impl` per `T` for some specialization. |
|   | `impl<T> Point<T> { /* Add common methods here */ }` |
|   | `impl Point<f32> { /* Add methods only relevant for Point<f32> */ }` |
| **Unsafe** | Avoid `unsafe {}`,[See section](https://cheats.rs/#unsafe-unsound-undefined) often safer, faster solution without it. |
| **Implement Traits** | `#[derive(Debug, Copy, …)]` and custom `impl` where needed. |
| **Tooling** | Run [**clippy**](https://github.com/rust-lang/rust-clippy) regularly to significantly improve your code quality.  **[Useful]**  |
|  | Format your code with [**rustfmt**](https://github.com/rust-lang/rustfmt) for consistency.  **[Useful]**  |
|  | Add **unit tests** [Book](https://doc.rust-lang.org/book/ch11-01-writing-tests.html) (`#[test]`) to ensure your code works. |
|  | Add **doc tests** [Book](https://doc.rust-lang.org/book/ch14-02-publishing-to-crates-io.html) (` ``` my_api::f() ``` `) to ensure docs match code. |
| **Documentation** | Annotate your APIs with doc comments that can show up on [**docs.rs**](https://docs.rs). |
|  | Don't forget to include a **summary sentence** and the **Examples** heading. |
|  | If applicable: **Panics**, **Errors**, **Safety**, **Abort** and **Undefined Behavior**. |

**Notes:**

^(1) In most cases you should prefer `?` over `.unwrap()`. In the case of locks however the returned [**`PoisonError`**](https://doc.rust-lang.org/stable/std/sync/struct.PoisonError.html) signifies a panic in another thread, so unwrapping it (thus propagating the panic) is often the better idea.

> 🔥 We **highly** recommend you also follow the
> [**API Guidelines**](https://rust-lang.github.io/api-guidelines/) and the
> [**Pragmatic Rust Guidelines**](https://microsoft.github.io/rust-guidelines/)  🔥

## Performance Tips

"My code is slow" sometimes comes up when porting microbenchmarks to Rust, or after profiling.

| Rating | Name | Description |
| --- | --- |--- |
|  **[Potential >2x boost]**  **[Easy to implement]**  | **Release Mode** [Book](https://doc.rust-lang.org/book/ch01-03-hello-cargo.html)  **[Useful]**  |  Always do `cargo build --release` for massive speed boost. |
|  **[Easy to implement]**  **[Security / correctness risk]**  | **Target Native CPU** [Link](https://doc.rust-lang.org/rustc/codegen-options/index.html#target-cpu) | Add `rustflags = ["-Ctarget-cpu=native"]` to `config.toml`. [See section](https://cheats.rs/#project-anatomy) |
|  **[Easy to implement]**  **[Costly tradeoff]**  | **Codegen Units** [Link](https://doc.rust-lang.org/rustc/codegen-options/index.html#codegen-units) | Codegen units `1` may yield faster code, slower compile. |
|  **[Easy to implement]**  | **Reserve Capacity** [std](https://doc.rust-lang.org/std/?search=with_capacity)  | Pre-allocation of collections reduces allocation pressure. |
|  **[Easy to implement]**  | **Recycle Collections** [std](https://doc.rust-lang.org/std/index.html?search=clear) | Calling `x.clear()` and reusing `x` prevents allocations. |
|  **[Easy to implement]**  | **Append to Strings** [std](https://doc.rust-lang.org/std/macro.write.html) | Using `write!(&mut s, "{}")` can prevent extra allocation. |
|  **[Easy to implement]**  **[Costly tradeoff]**  | **Global Allocator** [std](https://doc.rust-lang.org/std/alloc/index.html#the-global_allocator-attribute) | On some platforms ext. allocator (e.g., **mimalloc** [Link](https://crates.io/crates/mimalloc)) faster. |
| | **Bump Allocations** [Link](https://docs.rs/bumpalo/latest/bumpalo/) | Cheaply gets _temporary_, dynamic memory, esp. in hot loops. |
|  | **Batch APIs** | Design APIs to handle multiple similar elements at once, e.g., slices. |
|  **[Costly tradeoff]**  | **SoA** / **AoSoA** [Link](https://web.archive.org/web/20240815193855/https://www.rustsim.org/blog/2020/03/23/simd-aosoa-in-nalgebra/) | Beyond that consider _struct of arrays_ (SoA) and similar. |
|  **[Potential >2x boost]**  **[Costly tradeoff]**  | **SIMD** [std](https://doc.rust-lang.org/std/simd/index.html)  **[Unstable / nightly]**  | Inside (math heavy) batch APIs using SIMD can give 2x - 8x boost. |
|  | **Reduce Data Size**  | Small types (e.g, `u8` vs `u32`, niches **[Missing source / explanation]** ) and data have better cache use. |
|  | **Keep Data Nearby** [Link](https://en.wikipedia.org/wiki/Data-oriented_design) | Storing often-used data _nearby_ can improve memory access times. |
|  | **Pass by Size** [Link](https://github.com/isocpp/CppCoreGuidelines/blob/master/CppCoreGuidelines.md#reason-45) | Small (2-3 words) structs best passed by value, larger by reference. |
|   **[Costly tradeoff]**  | **Async-Await** [Link](https://rust-lang.github.io/async-book/01_getting_started/01_chapter.html) | If _parallel waiting_ happens a lot (e.g., server I/O) `async` good idea. |
|  | **Threading** [std](https://doc.rust-lang.org/std/thread/index.html) | Threads allow you to perform _parallel work_ on mult. items at once. |
|  **[Potential >2x boost]**  | ... **in app** | Often good for apps, as lower wait times means better UX. |
|  **[Costly tradeoff]**  | ... **inside libs** | Opaque _t._ use _inside_ lib often not good idea, can be too opinionated. |
|  **[Potential >2x boost]**  | ... **for lib callers** | However, allowing _your user_ to process _you_ in parallel excellent idea. |
|  **[Costly tradeoff]**  | **Avoid Locks**| Locks in multi-threaded code kills parallelism.  |
|  **[Costly tradeoff]**  | **Avoid Atomics**| Needless atomics (e.g., `Arc` vs `Rc`) impact other memory access. |
|  **[Costly tradeoff]**  | **Avoid False Sharing** [Link](https://en.wikipedia.org/wiki/False_sharing)| Make sure data R/W by different CPUs at least 64 bytes apart. [Link](https://igoro.com/archive/gallery-of-processor-cache-effects/)  |
|  **[Potential >2x boost]**  **[Easy to implement]**  | **Buffered I/O** [std](https://doc.rust-lang.org/std/io/index.html#bufreader-and-bufwriter)  **[Useful]**  | Raw `File` I/O highly inefficient w/o buffering. |
|  **[Easy to implement]**  **[Security / correctness risk]**  | **Faster Hasher** [Link](https://lib.rs/crates/seahash) | Default `HashMap` [std](https://doc.rust-lang.org/std/collections/struct.HashMap.html) hasher DoS attack-resilient but slow. |
|  **[Easy to implement]**  **[Security / correctness risk]**  | **Faster RNG**  | If you use a crypto RNG consider swapping for non-crypto. |
|  **[Costly tradeoff]**  | **Avoid Trait Objects** [Link](https://stackoverflow.com/questions/28621980/what-are-the-actual-runtime-performance-costs-of-dynamic-dispatch) | T.O. reduce code size, but increase memory indirection. |
|  **[Costly tradeoff]**  | **Defer Drop** [Link](https://abrams.cc/rust-dropping-things-in-another-thread) | Dropping _heavy_ objects in dump-thread can free up current one. |
|  **[Easy to implement]**  **[Security / correctness risk]**  | **Unchecked APIs**  [std](https://doc.rust-lang.org/std/?search=unchecked) | If you are 100% confident, `unsafe { unchecked_ }` skips checks. |

**Notes:**

Entries marked  **[Potential >2x boost]**  often come with a massive (> 2x) performance boost,  **[Easy to implement]**  are easy to implement even after-the-fact,  **[Costly tradeoff]**  might have costly side effects (e.g., memory, complexity),  **[Security / correctness risk]**  have special risks (e.g., security, correctness).

> **Profiling Tips**  **[Opinion]**
>
> Profilers are indispensable to identify hot spots in code. For the best experience add this to your `Cargo.toml`:
> ```cargo
> [profile.release]
> debug = true
> ```

> Then do a `cargo build --release` and run the result with [**Superluminal**](https://superluminal.eu/rust/) (Windows) or [**Instruments**](https://en.wikipedia.org/wiki/Instruments_%28software%29) (macOS).
> That said, there are many performance opportunities profilers won't find, but that need to be _designed in_.

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

## Unsafe, Unsound, Undefined

Unsafe leads to unsound. Unsound leads to undefined. Undefined leads to the dark side of the force.

### Safe Code

**Safe Code**

- _Safe_ has narrow meaning in Rust, vaguely 'the _intrinsic_ prevention of undefined behavior (UB)'.
- Intrinsic means the language won't allow you to use _itself_ to cause UB.
- Making an airplane crash or deleting your database is not UB, therefore 'safe' from Rust's perspective.
- Writing to `/proc/[pid]/mem` to self-modify your code is also 'safe', resulting UB not caused _intrinsincally_.

```rust
let y = x + x;  // Safe Rust only guarantees the execution of this code is consistent with
print(y);       // 'specification' (long story …). It does not guarantee that y is 2x
                // (X::add might be implemented badly) nor that y is printed (Y::fmt may panic).
```


### Unsafe Code

**Unsafe Code**

- Code marked `unsafe` has special permissions, e.g., to deref raw pointers, or invoke other `unsafe` functions.
- Along come special **promises the author _must_ uphold to the compiler**, and the compiler _will_ trust you.
- By itself `unsafe` code is not bad, but dangerous, and needed for FFI or exotic data structures.

```rust
// `x` must always point to race-free, valid, aligned, initialized u8 memory.
unsafe fn unsafe_f(x: *mut u8) {
    my_native_lib(x);
}
```


### Undefined Behavior

**Undefined Behavior (UB)**
- As mentioned, `unsafe` code implies [special promises](https://doc.rust-lang.org/stable/reference/behavior-considered-undefined.html) to the compiler (it wouldn't need be `unsafe` otherwise).
- Failure to uphold any promise makes compiler produce fallacious code, execution of which leads to UB.
- After triggering undefined behavior _anything_ can happen. Insidiously, the effects may be 1) subtle, 2) manifest far away from the site of violation or 3) be visible only under certain conditions.
- A seemingly _working_ program (incl. any number of unit tests) is no proof UB code might not fail on a whim.
- Code with UB is objectively dangerous, invalid and should never exist.

```rust
if maybe_true() {
    let r: &u8 = unsafe { &*ptr::null() };   // Once this runs, ENTIRE app is undefined. Even if
} else {                                     // line seemingly didn't do anything, app might now run
    println!("the spanish inquisition");     // both paths, corrupt database, or anything else.
}
```


### Unsound Code

**Unsound Code**
- Any _safe_ Rust that could (even only theoretically) produce UB for any user input is always **unsound**.
- As is `unsafe` code that may invoke UB on its own accord by violating above-mentioned promises.
- Unsound code is a stability and security risk, and violates basic assumption many Rust users have.

```rust
fn unsound_ref<T>(x: &T) -> &u128 {      // Signature looks safe to users. Happens to be
    unsafe { mem::transmute(x) }         // ok if invoked with an &u128, UB for practically
}                                        // everything else.
```


>
> **Responsible use of Unsafe**  **[Opinion]**
>
> - Do not use `unsafe` unless you absolutely have to.
> - Follow the [Nomicon](https://doc.rust-lang.org/nightly/nomicon/), [Unsafe Guidelines](https://rust-lang.github.io/unsafe-code-guidelines/), **always** follow **all** safety rules, and **never** invoke [UB](https://doc.rust-lang.org/stable/reference/behavior-considered-undefined.html).
> - Minimize the use of `unsafe` and encapsulate it in small, sound modules that are easy to review.
> - Never create unsound abstractions; if you can't encapsulate `unsafe` properly, don't do it.
> - Each `unsafe` unit should be accompanied by plain-text reasoning outlining its safety.

## Adversarial Code  **[Advanced]**

_Adversarial_ code is _safe_ 3^(rd) party code that compiles but does not follow API _expectations_, and might interfere with your own (safety) guarantees.

| You author | User code may possibly … |
|---------|---------|
| `fn g<F: Fn()>(f: F) { … }` | Unexpectedly panic. |
| `struct S<X: T> { … }` | Implement `T` badly, e.g., misuse `Deref`, … |
| `macro_rules! m { … }` | Do all of the above; call site can have _weird_ scope. |

| Risk Pattern | Description |
|---------|---------|
| `#[repr(packed)]` |  Packed alignment can make reference `&s.x` invalid. |
| `impl std::… for S {}`  | Any trait `impl`, esp. `std::ops` may be broken. In particular … |
| ↳  `impl Deref for S {}` | May randomly `Deref`, e.g., `s.x != s.x`, or panic.  |
| ↳  `impl PartialEq for S {}` | May violate equality rules; panic.  |
| ↳  `impl Eq for S {}`  | May cause `s != s`; panic; must not use `s` in `HashMap` & co. |
| ↳  `impl Hash for S {}`  | May violate hashing rules; panic; must not use `s` in `HashMap` & co. |
| ↳  `impl Ord for S {}`  | May violate ordering rules; panic; must not use `s` in `BTreeMap` & co. |
| ↳  `impl Index for S {}` | May randomly index, e.g., `s[x] != s[x]`; panic. |
| ↳  `impl Drop for S {}` | May run code or panic end of scope `{}`, during assignment `s = new_s`. |
| `panic!()` | User code can panic _any_ time, resulting in abort or unwind. |
| `catch_unwind(\|\| s.f(panicky))` |  Also, caller might force observation of broken state in `s`.  |
| `let … = f();` | Variable name can affect order of `Drop` execution. ^(1)  **[Pitfall / intentionally wrong]**   |

**Notes:**

^(1) Notably, when you rename a variable from `_x` to `_` you will also change Drop behavior since you change semantics. A variable named `_x` will have `Drop::drop()` executed at the end of its scope, a variable named `_` can have it executed immediately on 'apparent' assignment ('apparent' because a binding named `_` means **wildcard** [Reference](https://doc.rust-lang.org/reference/patterns.html#wildcard-pattern) _discard this_, which will happen as soon as feasible, often right away)!

> **Implications**
>
> - Generic code **cannot be safe if safety depends on type cooperation** w.r.t. most (`std::`) traits.
> - If type cooperation is needed you must use `unsafe` traits (prob. implement your own).
> - You must consider random code execution at unexpected places (e.g., re-assignments, scope end).
> - You may still be observable after a worst-case panic.
>
> As a corollary, _safe_-but-deadly code (e.g., `airplane_speed<T>()`) should probably also follow these guides.

## API Stability

When updating an API, these changes can break client code.[RFC](https://rust-lang.github.io/rfcs/1105-api-evolution.html) Major changes (🔴) are **definitely breaking**, while minor changes (🟡) **might be breaking**:

| Crates |
|---------|
| 🔴 Making a crate that previously compiled for _stable_ require _nightly_. |
| 🔴 Removing Cargo features. |
| 🟡 Altering existing Cargo features. |

| Modules |
|---------|
| 🔴 Renaming / moving / removing any public items. |
| 🟡 Adding new public items, as this might break code that does `use your_crate::*`. |

| Structs |
|---------|
| 🔴 Adding private field when all current fields public. |
| 🔴 Adding public field when no private field exists. |
| 🟡 Adding or removing private fields when at least one already exists (before and after the change). |
| 🟡 Going from a tuple struct with all private fields (with at least one field) to a normal struct, or vice versa. |

| Enums |
|---------|
| 🔴 Adding new variants; can be mitigated with early `#[non_exhaustive]` [Reference](https://doc.rust-lang.org/reference/attributes/type_system.html#the-non_exhaustive-attribute) |
| 🔴 Adding new fields to a variant. |

| Traits |
|---------|
| 🔴 Adding a non-defaulted item, breaks all existing `impl T for S {}`. |
| 🔴 Any non-trivial change to item signatures, will affect either consumers or implementors. |
| 🔴 Implementing any "fundamental" trait, as _not_ implementing a fundamental trait already was a promise. |
| 🟡 Adding a defaulted item; might cause dispatch ambiguity with other existing trait. |
| 🟡 Adding a defaulted type parameter. |
| 🟡 Implementing any non-fundamental trait; might also cause dispatch ambiguity. |

| Inherent Implementations |
|---------|
| 🟡 Adding any inherent items; might cause clients to prefer that over trait fn and produce compile error. |

| Signatures in Type Definitions |
|---------|
| 🔴 Tightening bounds (e.g., `<T>` to `<T: Clone>`). |
| 🟡 Loosening bounds. |
| 🟡 Adding defaulted type parameters. |
| 🟡 Generalizing to generics. |

| Signatures in Functions |
|---------|
| 🔴 Adding / removing arguments. |
| 🟡 Introducing a new type parameter. |
| 🟡 Generalizing to generics. |

| Behavioral Changes |
|---------|
| 🔴 / 🟡 _Changing semantics might not cause compiler errors, but might make clients do wrong thing._ |

---

# Misc

## Links & Services

Specialty books, also see [Little Book of Rust Books](https://lborb.github.io/book/title-page.html).

| Topic ️📚  | Description |
|--------| -----------|
| [API Guidelines](https://rust-lang.github.io/api-guidelines/) | How to write idiomatic and re-usable Rust. |
| [Asynchronous Programming](https://rust-lang.github.io/async-book/)   **[Unstable / nightly]**  | Explains `async` code, `Futures`, … |
| [Cargo](https://doc.rust-lang.org/cargo/) | How to use `cargo` and write `Cargo.toml`. |
| [CLIs](https://rust-lang-nursery.github.io/cli-wg/) | Information about creating CLI tools. |
| [Cookbook](https://rust-lang-nursery.github.io/rust-cookbook/) | Collection of simple examples that demonstrate good practices. |
| [Design Patterns](https://rust-unofficial.github.io/patterns//) | Idioms, Patterns, Anti-Patterns. |
| [Edition Guide](https://doc.rust-lang.org/nightly/edition-guide/) | Working with Rust 2015, Rust 2018, and beyond.  |
| [Embedded](https://docs.rust-embedded.org/book/intro/index.html) | Working with embedded and `#![no_std]` devices. |
| [Functional Jargon](https://github.com/JasonShin/functional-programming-jargon.rs)  **[Advanced]**  | A collection of functional programming jargon explained in Rust.  |
| [Guide to Rustc Development](https://rustc-dev-guide.rust-lang.org/index.html)  **[Advanced]**  | Explains how the compiler works internally. |
| [Little Book of Rust Macros](https://veykril.github.io/tlborm/introduction.html) | Community's collective knowledge of Rust macros. |
| [Performance](https://nnethercote.github.io/perf-book/) | Techniques to improve the speed and memory usage. |
| [Pragmatic Rust Guidelines](https://microsoft.github.io/rust-guidelines/) | Pragmatic design guidelines for idiomatic Rust that scales. |
| [RFCs](https://rust-lang.github.io/rfcs/)  **[Advanced]**  | Look up accepted RFCs and how they change the language. |
| [Rustdoc](https://doc.rust-lang.org/stable/rustdoc/) | Tips how to customize `cargo doc` and `rustdoc`. |
| [Unsafe Code Guidelines](https://rust-lang.github.io/unsafe-code-guidelines/)  **[Unstable / nightly]**  | Concise information about writing `unsafe` code. |
| [Unstable](https://doc.rust-lang.org/unstable-book/index.html)   **[Advanced]**  | Information about unstable items, e.g, `#![feature(…)]`.  |

Comprehensive lookup tables for common components.

| Table 📋| Description |
|--------| -----------|
| [Rust Forge](https://forge.rust-lang.org/) | Lists release train and links for people working on the compiler. |
| ↳  [Supported Platforms](https://doc.rust-lang.org/rustc/platform-support.html) | All supported platforms and their Tier. |
| ↳  [Component History](https://rust-lang.github.io/rustup-components-history/)  **[Unstable / nightly]**  | Check **nightly** status of various Rust tools for a platform. |
| [Clippy Lints](https://rust-lang.github.io/rust-clippy/master/) | All the [**clippy**](https://github.com/rust-lang/rust-clippy) lints you might be interested in. |
| [Rustfmt Config](https://rust-lang.github.io/rustfmt/) | All [**rustfmt**](https://github.com/rust-lang/rustfmt) options you can use in `.rustfmt.toml`. |

Online services which provide information or tooling.

| Service ⚙️ | Description |
|--------| -----------|
| [Rust Playground](https://play.rust-lang.org/) | Try and share snippets of Rust code. |
| [crates.io](https://crates.io/) | All 3^(rd) party libraries for Rust. |
| [lib.rs](https://lib.rs/) | Unofficial overview of quality Rust libraries and applications. |
| [blessed.rs](https://blessed.rs/)  **[Opinionated.]**  | An unofficial guide to the Rust ecosystem, even more opinionated. |
| [std.rs](https://std.rs/) | Shortcut to `std` documentation. |
| [stdrs.dev](https://stdrs.dev/)   **[Advanced]**  | Shortcut to `std` documentation including compiler-internal modules. |
| [docs.rs](https://docs.rs/) | Documentation for 3^(rd) party libraries, automatically generated from source. |
| [releases.rs](https://releases.rs/) | Release notes for previous and upcoming versions. |
