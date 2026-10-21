# Types: DSTs, zero-sized types, Sized and lifetime generics

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 5917–6104.
Section context: Types, Traits, Generics → Advanced Concepts [Advanced].
**Read first:** [generics](generics.md) (including their prerequisites; reuse complete reads).
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

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

