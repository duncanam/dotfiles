# Types: types, implementations, traits and interfaces

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 4656–5023.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

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

