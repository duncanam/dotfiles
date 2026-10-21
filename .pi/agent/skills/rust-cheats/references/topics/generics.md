# Types: type constructors, const generics, bounds and blanket implementations

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 5024–5307.
Section context: Types, Traits, Generics.
**Read first:** [types-traits](types-traits.md) (including their prerequisites; reuse complete reads).
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

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

