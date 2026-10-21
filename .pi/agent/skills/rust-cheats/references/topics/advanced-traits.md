# Types: trait parameters and trait-authoring tradeoffs

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 5308–5916.
Section context: Types, Traits, Generics.
**Read first:** [generics](generics.md) (including their prerequisites; reuse complete reads).
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

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

