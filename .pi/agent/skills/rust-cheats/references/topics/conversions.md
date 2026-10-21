# Types: casts, coercions, subtyping and variance

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 6260–6443.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

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

