# Layout: numeric/textual types, casts and arithmetic pitfalls

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 1696–2043.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

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

