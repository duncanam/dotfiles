# Syntax: modules, aliases, casts, macros and attributes

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 252–328.
Section context: Hello, Rust!.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

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

