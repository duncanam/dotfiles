# Standard library: number/string conversions and formatting

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 3813–4096.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

## Number Conversions

As-**correct**-as-it-currently-gets number conversions.

| ↓ Have / Want → | `u8` … `i128` |  `f32` / `f64` | String |
| --- | --- |  --- |--- |
| `u8` … `i128` | `u8::try_from(x)?` ^(1) |  `x as f32` ^(3) | `x.to_string()` |
| `f32` / `f64` | `x as u8` ^(2) |  `x as f32` | `x.to_string()` |
| `String` | `x.parse::<u8>()?` | `x.parse::<f32>()?` | `x` |

**Notes:**

^(1) If type true subset `from()` works directly, e.g., `u32::from(my_u8)`.

^(2) Truncating (`11.9_f32 as u8` gives `11`) and saturating (`1024_f32 as u8` gives `255`); _c_. below.

^(3) Might misrepresent number (`u64::MAX as f32`) or produce `Inf` (`u128::MAX as f32`).

> Also see **Casting-** and **Arithmetic Pitfalls** [See section](https://cheats.rs/#numeric-types) for more things that can go wrong working with numbers.

## String Conversions

If you **want** a string of type …

### `String`

| If you **have** `x` of type …| Use this … |
| --- | --- |
|`String`|`x`|
|`CString`|`x.into_string()?` |
|`OsString`|`x.to_str()?.to_string()`|
|`PathBuf`|`x.to_str()?.to_string()`|
|`Vec<u8>` ^(1) |`String::from_utf8(x)?`|
|`&str`|`x.to_string()` ^(`i`) |
|`&CStr`|`x.to_str()?.to_string()` |
|`&OsStr`|`x.to_str()?.to_string()`|
|`&Path`|`x.to_str()?.to_string()`|
|`&[u8]` ^(1) |`String::from_utf8_lossy(x).to_string()`|

### `CString`

| If you **have** `x` of type …| Use this … |
| --- | --- |
|`String`|`CString::new(x)?`|
|`CString`|`x`|
|`OsString` |`CString::new(x.to_str()?)?`|
|`PathBuf`|`CString::new(x.to_str()?)?`|
|`Vec<u8>` ^(1) |`CString::new(x)?`|
|`&str`|`CString::new(x)?`|
|`&CStr`|`x.to_owned()` ^(`i`) |
|`&OsStr` |`CString::new(x.to_os_string().into_string()?)?`|
|`&Path`|`CString::new(x.to_str()?)?`|
|`&[u8]` ^(1) |`CString::new(Vec::from(x))?`|
|`*mut c_char` ^(2) |`unsafe { CString::from_raw(x) }`|

### `OsString`

| If you **have** `x` of type …| Use this … |
| --- | --- |
|`String`|`OsString::from(x)` ^(`i`) |
|`CString`|`OsString::from(x.to_str()?)`|
|`OsString`|`x`|
|`PathBuf`|`x.into_os_string()`|
|`Vec<u8>` ^(1) |`unsafe { OsString::from_encoded_bytes_unchecked(x) }`|
|`&str`|`OsString::from(x)` ^(`i`)|
|`&CStr`|`OsString::from(x.to_str()?)`|
|`&OsStr`|`OsString::from(x)` ^(`i`)|
|`&Path`|`x.as_os_str().to_owned()`|
|`&[u8]` ^(1) |`unsafe { OsString::from_encoded_bytes_unchecked(x.to_vec()) }`|

### `PathBuf`

| If you **have** `x` of type …| Use this … |
| --- | --- |
|`String`|`PathBuf::from(x)` ^(`i`)|
|`CString`|`PathBuf::from(x.to_str()?)`|
|`OsString`|`PathBuf::from(x)` ^(`i`)|
|`PathBuf`|`x`|
|`Vec<u8>` ^(1) |`unsafe { PathBuf::from(OsString::from_encoded_bytes_unchecked(x)) }` |
|`&str`|`PathBuf::from(x)` ^(`i`)|
|`&CStr`|`PathBuf::from(x.to_str()?)`|
|`&OsStr`|`PathBuf::from(x)` ^(`i`)|
|`&Path`|`PathBuf::from(x)` ^(`i`)|
|`&[u8]` ^(1) |`unsafe { PathBuf::from(OsString::from_encoded_bytes_unchecked(x.to_vec())) }` |

### `Vec<u8>`

| If you **have** `x` of type …| Use this … |
| --- | --- |
|`String`|`x.into_bytes()`|
|`CString`|`x.into_bytes()`|
|`OsString`|`x.into_encoded_bytes()`|
|`PathBuf`|`x.into_os_string().into_encoded_bytes()`|
|`Vec<u8>` ^(1) |`x`|
|`&str`|`Vec::from(x.as_bytes())`|
|`&CStr`|`Vec::from(x.to_bytes_with_nul())`|
|`&OsStr`|`Vec::from(x.as_encoded_bytes())`|
|`&Path`|`Vec::from(x.as_os_str().as_encoded_bytes())`|
|`&[u8]` ^(1) |`x.to_vec()`|

### `&str`

| If you **have** `x` of type …| Use this … |
| --- | --- |
|`String`|`x.as_str()`|
|`CString`|`x.to_str()?`|
|`OsString`|`x.to_str()?`|
|`PathBuf`|`x.to_str()?`|
|`Vec<u8>` ^(1) |`std::str::from_utf8(&x)?`|
|`&str`|`x`|
|`&CStr`|`x.to_str()?`|
|`&OsStr`|`x.to_str()?`|
|`&Path`|`x.to_str()?`|
|`&[u8]` ^(1) |`std::str::from_utf8(x)?`|

### `&CStr`

| If you **have** `x` of type …| Use this … |
| --- | --- |
|`String`|`CString::new(x)?.as_c_str()`|
|`CString`|`x.as_c_str()`|
|`OsString`|`x.to_str()?`|
|`PathBuf`|  **[Missing source / explanation]** ^(,3) |
|`Vec<u8>` ^(1)^(,4) |`CStr::from_bytes_with_nul(&x)?`|
|`&str`|  **[Missing source / explanation]** ^(,3) |
|`&CStr`|`x`|
|`&OsStr` |  **[Missing source / explanation]**  |
|`&Path`|  **[Missing source / explanation]**  |
|`&[u8]` ^(1)^(,4) |`CStr::from_bytes_with_nul(x)?`|
|`*const c_char` ^(1) |`unsafe { CStr::from_ptr(x) }`|

### `&OsStr`

| If you **have** `x` of type …| Use this … |
| --- | --- |
|`String`|`OsStr::new(&x)`|
|`CString`|  **[Missing source / explanation]**  |
|`OsString`|`x.as_os_str()`|
|`PathBuf`|`x.as_os_str()`|
|`Vec<u8>` ^(1) |`unsafe { OsStr::from_encoded_bytes_unchecked(&x) }`|
|`&str`|`OsStr::new(x)`|
|`&CStr`|  **[Missing source / explanation]**  |
|`&OsStr`|`x`|
|`&Path`|`x.as_os_str()`|
|`&[u8]` ^(1) | `unsafe { OsStr::from_encoded_bytes_unchecked(x) }` |

### `&Path`

| If you **have** `x` of type …| Use this … |
| --- | --- |
|`String`|`Path::new(x)` ^(`r`)|
|`CString`|`Path::new(x.to_str()?)` |
|`OsString`|`Path::new(x.to_str()?)` ^(`r`)|
|`PathBuf`|`Path::new(x.to_str()?)` ^(`r`)|
|`Vec<u8>` ^(1) |`unsafe { Path::new(OsStr::from_encoded_bytes_unchecked(&x)) }`|
|`&str`|`Path::new(x)` ^(`r`)|
|`&CStr`|`Path::new(x.to_str()?)` |
|`&OsStr`|`Path::new(x)` ^(`r`)|
|`&Path`|`x`|
|`&[u8]` ^(1) |`unsafe { Path::new(OsStr::from_encoded_bytes_unchecked(x)) }` |

### `&[u8]`

| If you **have** `x` of type …| Use this … |
| --- | --- |
|`String`|`x.as_bytes()`|
|`CString`|`x.as_bytes()`|
|`OsString`|`x.as_encoded_bytes()`|
|`PathBuf`|`x.as_os_str().as_encoded_bytes()`|
|`Vec<u8>` ^(1) |`&x`|
|`&str`|`x.as_bytes()`|
|`&CStr`|`x.to_bytes_with_nul()`|
|`&OsStr`|`x.as_encoded_bytes()`|
|`&Path`|`x.as_os_str().as_encoded_bytes()`|
|`&[u8]` ^(1) |`x`|

### Other

| You **want** | And **have** `x` | Use this … |
| --- | --- | --- |
|**`*const c_char`**|**`CString`**|`x.as_ptr()`|

**Notes:**

^(i) Short form `x.into()` possible if type can be inferred.

^(r) Short form `x.as_ref()` possible if type can be inferred.

^(1) You must ensure `x` comes with a valid representation for the string type (e.g., UTF-8 data for a `String`).

^(2) The `c_char` **must** have come from a previous `CString`. If it comes from FFI see `&CStr` instead.

^(3) No known shorthand as `x` will lack terminating `0x0`. Best way to probably go via `CString`.

^(4) Must ensure `x` actually ends with `0x0`.

## String Output

How to convert types into a `String`, or output them.

### APIs

Rust has, among others, these APIs to convert types to stringified output, collectively called _format_ macros:

| Macro | Output | Notes |
| --- | --- | --- |
|`format!(fmt)` | `String` | Bread-and-butter "to `String`" converter. |
|`print!(fmt)`| Console | Writes to standard output. |
|`println!(fmt)`| Console | Writes to standard output. |
| `eprint!(fmt)`| Console | Writes to standard error. |
|`eprintln!(fmt)`| Console | Writes to standard error. |
|`write!(dst, fmt)` | Buffer | Don't forget to also `use std::io::Write;` |
|`writeln!(dst, fmt)` | Buffer | Don't forget to also `use std::io::Write;` |

| Method | Notes |
| --- | --- |
|`x.to_string()` [std](https://doc.rust-lang.org/std/string/trait.ToString.html) | Produces `String`, implemented for any `Display` type. |

Here `fmt` is string literal such as `"hello {}"`, that specifies output (compare "Formatting" tab) and additional parameters.

### Printable Types

In `format!` and friends, types convert via trait `Display` `"{}"` [std](https://doc.rust-lang.org/std/fmt/trait.Display.html) or `Debug` `"{:?}"` [std](https://doc.rust-lang.org/std/fmt/trait.Debug.html) , non exhaustive list:

| Type | Implements |  |
| --- | --- | --- |
|`String`| `Debug, Display` | |
|`CString`| `Debug` | |
|`OsString`| `Debug` | |
|`PathBuf`| `Debug` |  |
|`Vec<u8>` | `Debug` | |
|`&str`|`Debug, Display` | |
|`&CStr`|`Debug` | |
|`&OsStr`| `Debug` | |
|`&Path`| `Debug` | |
|`&[u8]` |`Debug` | |
|`bool` |`Debug, Display` | |
|`char` |`Debug, Display` | |
|`u8` … `i128` |`Debug, Display` | |
|`f32`, `f64` |`Debug, Display` | |
|`!` |`Debug, Display` | |
|`()` |`Debug` | |

In short, pretty much everything is `Debug`; more _special_ types might need special handling or conversion [See section](https://cheats.rs/#string-conversions) to `Display`.

### Formatting

Each argument designator in format macro is either empty `{}`, `{argument}`, or follows a basic [**syntax**](https://doc.rust-lang.org/std/fmt/index.html#syntax):

```
{ [argument] ':' [[fill] align] [sign] ['#'] [width [$]] ['.' precision [$]] [type] }
```


| Element |  Meaning |
|---------| ---------|
| `argument` |  Number (`0`, `1`, …), variable  **[Edition '21]**  or name, **[Edition '18]**  e.g., `print!("{x}")`. |
| `fill` | The character to fill empty spaces with (e.g., `0`), if `width` is specified. |
| `align` | Left (`<`), center (`^`), or right (`>`), if width is specified. |
| `sign` | Can be `+` for sign to always be printed. |
| `#` | [Alternate formatting](https://doc.rust-lang.org/std/fmt/index.html#sign0), e.g., prettify `Debug`[std](https://doc.rust-lang.org/std/fmt/trait.Debug.html) formatter `?` or prefix hex with `0x`. |
| `width` | Minimum width (≥ 0), padding with `fill` (default to space). If starts with `0`, zero-padded. |
| `precision` | Decimal digits (≥ 0) for numerics, or max width for non-numerics. |
| `$` | Interpret `width` or `precision` as argument identifier instead to allow for dynamic formatting. |
| **`type`** | `Debug`[std](https://doc.rust-lang.org/std/fmt/trait.Debug.html) (`?`) formatting, hex (`x`), binary (`b`), octal (`o`), pointer (`p`), exp (`e`) … [see more](https://doc.rust-lang.org/std/fmt/index.html#traits). |

| Format Example | Explanation |
|---------|-------------|
| `{}` | Print the next argument using `Display`.[std](https://doc.rust-lang.org/std/fmt/trait.Display.html) |
| `{x}` | Same, but use variable `x` from scope.  **[Edition '21]**  |
| `{:?}` | Print the next argument using `Debug`.[std](https://doc.rust-lang.org/std/fmt/trait.Debug.html) |
| `{2:#?}` | Pretty-print the 3^(rd) argument with `Debug`[std](https://doc.rust-lang.org/std/fmt/trait.Debug.html) formatting. |
| `{val:^2$}` | Center the `val` named argument, width specified by the 3^(rd) argument. |
| `{:<10.3}` | Left align with width 10 and a precision of 3.|
| `{val:#x}` | Format `val` argument as hex, with a leading `0x` (alternate format for `x`). |

| Full Example | Explanation |
|---------|-------------|
| `println!("{}", x)` | Print `x` using `Display`[std](https://doc.rust-lang.org/std/fmt/trait.Display.html) on std. out and append new line.  **[Edition '15]**   **[Deprecated / outdated]**  |
| `println!("{x}")` | Same, but use variable `x` from scope.  **[Edition '21]**   |
| `format!("{a:.3} {b:?}")` | Convert `a` with 3 digits, add space, `b` with `Debug` [std](https://doc.rust-lang.org/std/fmt/trait.Debug.html), return `String`.   **[Edition '21]**  |

---

