# Standard library: common string, I/O and transformation idioms

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 3171–3233.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

# Standard Library

## One-Liners

Snippets that are common, but still easy to forget. See **Rust Cookbook** [Link](https://rust-lang-nursery.github.io/rust-cookbook/) for more.

### Strings

| Intent | Snippet |
|---------|-------------|
| Concatenate strings (any `Display`[See section](https://cheats.rs/#string-output) that is).  [std](https://doc.rust-lang.org/std/fmt/index.html) ^(1)   **[Edition '21]**  | `format!("{x}{y}")` |
| Append string (any `Display` to any `Write`).   **[Edition '21]**  [std](https://doc.rust-lang.org/std/fmt/index.html#write) | `write!(x, "{y}")` |
| Split by separator pattern. [std](https://doc.rust-lang.org/std/str/pattern/trait.Pattern.html) [Link](https://stackoverflow.com/a/38138985) | `s.split(pattern)` |
| ↳  … with `&str` | `s.split("abc")` |
| ↳  … with `char` | `s.split('/')` |
| ↳  … with closure | `s.split(char::is_numeric)`|
| Split by whitespace.  [std](https://doc.rust-lang.org/std/primitive.str.html#method.split_whitespace) | `s.split_whitespace()` |
| Split by newlines.  [std](https://doc.rust-lang.org/std/primitive.str.html#method.lines)  | `s.lines()` |
| Split by regular expression. [Link](https://docs.rs/regex/latest/regex/struct.Regex.html#method.split) ^(2) | ` Regex::new(r"\s")?.split("one two three")` |

**Notes:**

^(1) Allocates; if `x` or `y` are not going to be used afterwards consider using `write!` or `std::ops::Add`.

^(2) Requires [regex](https://crates.io/crates/regex) crate.

### I/O

| Intent | Snippet |
|---------|-------------|
| Create a new file [std](https://doc.rust-lang.org/std/fs/struct.File.html#method.open) | `File::create(PATH)?`  |
| ↳   Same, via OpenOptions | `OpenOptions::new().create(true).write(true).truncate(true).open(PATH)?` |
| Read file as `String` [std](https://doc.rust-lang.org/std/fs/fn.read_to_string.html) | `read_to_string(path)?` |

### Macros

| Intent | Snippet |
|---------|-------------|
| Macro w. variable arguments | `macro_rules! var_args { ($($args:expr),*) => {{ }} }` |
| ↳  Using `args`, e.g., calling `f` multiple times. | ↳  ` $( f($args); )*` |

### Transforms [Useful]

| Starting Type | Resource |
|---------|-------------|
| `Option<T> -> …` | See the [Type-Based Cheat Sheet](https://upsuper.github.io/rust-cheatsheet/) |
| `Result<T, R> -> …` | See the [Type-Based Cheat Sheet](https://upsuper.github.io/rust-cheatsheet/) |
| `Iterator<Item=T> -> …` | See the [Type-Based Cheat Sheet](https://upsuper.github.io/rust-cheatsheet/) |
| `&[T] -> …` | See the [Type-Based Cheat Sheet](https://upsuper.github.io/rust-cheatsheet/) |
| `Future<T> -> …` | See the [Futures Cheat Sheet](https://rufflewind.com/img/rust-futures-cheatsheet.html) |

### Esoterics [Advanced]

| Intent | Snippet |
|---------|-------------|
| Cleaner closure captures | `wants_closure({ let c = outer.clone(); move \|\| use_clone(c) })` |
| Fix inference in '`try`' closures | `iter.try_for_each(\|x\| { Ok::<(), Error>(()) })?;` |
| Iterate _and_ edit `&mut [T]` if `T` Copy. | `Cell::from_mut(mut_slice).as_slice_of_cells()` |
| Get subslice with length. | `&original_slice[offset..][..length]` |
| Canary so trait `T` is **dyn compatible**. [Reference](https://doc.rust-lang.org/reference/items/traits.html#dyn-compatibility) | `const _: Option<&dyn T> = None;` |
| _Semver trick_ to unify types. [Link](https://github.com/dtolnay/semver-trick) | `my_crate = "next.version"` in `Cargo.toml` + re-export types. |
| Use macro inside own crate. [Link](https://users.rust-lang.org/t/use-macro-inside-proc-macro-crate/61095/4) | `macro_rules! internal_macro {}` with `pub(crate) use internal_macro;` |

