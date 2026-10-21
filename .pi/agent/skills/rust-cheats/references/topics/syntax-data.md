# Syntax: structs, enums, references and pointers

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 75–170.
Section context: Hello, Rust!.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

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

