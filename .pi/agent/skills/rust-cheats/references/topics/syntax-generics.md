# Syntax: generic syntax, bounds and higher-ranked items

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 389–463.
Section context: Hello, Rust!.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

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

