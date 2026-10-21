# Syntax: strings, characters, documentation and operators

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 464–533.
Section context: Hello, Rust!.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

### Strings & Chars

Rust has several ways to create textual values.

| Example | Explanation |
|--------|-------------|
| `"..."` | **String literal**, [Reference](https://doc.rust-lang.org/reference/tokens.html#string-literals)^(, 1) a UTF-8 `&'static str`, [std](https://doc.rust-lang.org/std/primitive.str.html) supporting these escapes:  |
| ↳  `"\n\r\t\0\\"` | **Common escapes** [Reference](https://doc.rust-lang.org/reference/tokens.html#ascii-escapes), e.g., `"\n"` becomes _new line_. |
| ↳  `"\x36"` | **ASCII _e._** [Reference](https://doc.rust-lang.org/reference/tokens.html#ascii-escapes) up to `7f`, e.g., `"\x36"` would become `6`. |
| ↳  `"\u{7fff}"` | **Unicode _e._** [Reference](https://doc.rust-lang.org/reference/tokens.html#unicode-escapes) up to 6 digits, e.g., `"\u{7fff}"` becomes `翿`. |
| `r"..."` | **Raw string literal**. [Reference](https://doc.rust-lang.org/reference/tokens.html#raw-string-literals)^(, 1)UTF-8, but won't interpret any escape above. |
| `r#"..."#` | Raw string literal, UTF-8, but can also contain `"`. Number of `#` can vary.|
| `c"..."` | **C string literal**, [Reference](https://doc.rust-lang.org/reference/tokens.html#c-string-literals) a NUL-terminated `&'static CStr`, [std](https://doc.rust-lang.org/std/ffi/struct.CStr.html) for FFI.  **[Edition 1.77+]**   |
| `cr"..."`, `cr#"..."#` | Raw C string literal, combination analog to above.|
| `b"..."` | **Byte string literal**; [Reference](https://doc.rust-lang.org/reference/tokens.html#byte-and-byte-string-literals)^(, 1) constructs ASCII-only `&'static [u8; N]`. |
| `br"..."`, `br#"..."#` | Raw byte string literal, combination analog to above.|
| `b'x'` | ASCII **byte literal**, [Reference](https://doc.rust-lang.org/reference/tokens.html#byte-literals) a single `u8` byte.  |
| `'🦀'` | **Character literal**, [Reference](https://doc.rust-lang.org/reference/tokens.html#character-and-string-literals) fixed 4 byte unicode '**char**'. [std](https://doc.rust-lang.org/std/primitive.char.html) |

**Notes:**

^(1) Supports multiple lines out of the box. Just keep in mind `Debug`[See section](https://cheats.rs/#string-output) (e.g., `dbg!(x)` and `println!("{x:?}")`) might render them as `\n`, while `Display`[See section](https://cheats.rs/#string-output) (e.g., `println!("{x}")`) renders them _proper_.

### Documentation

Debuggers hate him. Avoid bugs with this one weird trick.

| Example | Explanation |
|--------|-------------|
| `///` | Outer line **doc comment**,^(1) [Book](https://doc.rust-lang.org/book/ch14-02-publishing-to-crates-io.html#making-useful-documentation-comments) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/meta/doc.html#documentation) [Reference](https://doc.rust-lang.org/reference/comments.html#doc-comments) use these on ty., traits, fn's, … |
| `//!` | Inner line doc comment, mostly used at top of file. |
| `//` | Line comment, use these to document code flow or _internals_. |
| `/* … */` | Block comment. ^(2)  **[Deprecated / outdated]**  |
| `/** … */` | Outer block doc comment. ^(2)  **[Deprecated / outdated]**  |
| `/*! … */` | Inner block doc comment. ^(2)  **[Deprecated / outdated]**  |

**Notes:**

^(1) [Tooling Directives](https://cheats.rs/#tooling-directives) outline what you can do inside doc comments.

^(2) Generally discouraged due to bad UX. If possible use equivalent line comment instead with IDE support.

### Miscellaneous

These sigils did not fit any other category but are good to know nonetheless.

| Example | Explanation |
|---------|-------------|
| `!` | Always empty **never type**. [Book](https://doc.rust-lang.org/book/ch19-04-advanced-types.html#the-never-type-that-never-returns) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/fn/diverging.html#diverging-functions) [std](https://doc.rust-lang.org/std/primitive.never.html) [Reference](https://doc.rust-lang.org/reference/types.html#never-type) |
| ↳  `fn f() -> ! {}` | Function that never ret.; compat. with any _ty._ e.g., `let x: u8 = f();` |
| ↳  `fn f() -> Result<(), !> {}` | Function that must return `Result` but signals it can never `Err`.  **[Unstable / nightly]**  |
| ↳  `fn f(x: !) {}` | Function that exists, but can never be called. Not very useful.  **[Advanced]**   **[Unstable / nightly]**  |
| `_` | Unnamed **wildcard** [Reference](https://doc.rust-lang.org/reference/patterns.html#wildcard-pattern) variable binding, e.g., `\|x, _\| {}`.|
| ↳  `let _ = x;`  | Unnamed assign. is no-op, does **not**  **[Pitfall / intentionally wrong]**  move out `x` or preserve scope! |
| ↳  `_ = x;`  | You can assign _anything_ to `_` without `let`, i.e.,  `_ = ignore_rval();`  **[Useful]**  |
| `_x` | Variable binding that won't emit _unused variable_ warnings. |
| `1_234_567` | Numeric separator for visual clarity. |
| `1_u8` | Type specifier for **numeric literals** [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/types/literals.html#literals) [Reference](https://doc.rust-lang.org/reference/tokens.html#number-literals)  (also `i8`, `u16`, …). |
| `0xBEEF`, `0o777`, `0b1001`  | Hexadecimal (`0x`), octal (`0o`) and binary (`0b`) integer literals. |
| `12.3e4`, `1E-8`  | **Scientific notation** for floating-point literals. [Reference](https://doc.rust-lang.org/reference/tokens.html#floating-point-literals) |
| `r#foo` | A **raw identifier** [Book](https://doc.rust-lang.org/book/appendix-01-keywords.html#raw-identifiers) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/compatibility/raw_identifiers.html#raw-identifiers) for edition compatibility.  **[Advanced]**  |
| `'r#a` | A **raw lifetime label**  **[Missing source / explanation]**  for edition compatibility.  **[Advanced]**  |
| `x;` | **Statement** [Reference](https://doc.rust-lang.org/reference/statements.html) terminator, _c_. **expressions** [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/expression.html) [Reference](https://doc.rust-lang.org/reference/expressions.html) |

### Common Operators

Rust supports most operators you would expect (`+`, `*`, `%`, `=`, `==`, …), including **overloading**. [std](https://doc.rust-lang.org/std/ops/index.html) Since they behave no differently in Rust we do not list them here.

---

