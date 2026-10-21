# Layout: custom types, pointer metadata and closure layout

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 2044–2454.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

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

