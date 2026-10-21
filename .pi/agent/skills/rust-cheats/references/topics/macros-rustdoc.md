# Tooling: macro fragments and rustdoc directives

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 4392–4438.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

## Tooling Directives

Special tokens embedded in source code used by tooling or preprocessing.

### Macro Fragments

Inside a **declarative** [Book](https://doc.rust-lang.org/book/ch19-06-macros.html#declarative-macros-with-macro_rules-for-general-metaprogramming) **macro by example** [Book](https://doc.rust-lang.org/book/ch19-06-macros.html) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/macros.html#macro_rules) [Reference](https://doc.rust-lang.org/reference/macros-by-example.html) `macro_rules!` implementation these **fragment specifiers** [Reference](https://doc.rust-lang.org/reference/macros-by-example.html#metavariables) work:

| Within Macros |  Explanation |
|---------|---------|
| `$x:ty`  | Macro capture (here a `$x` is the capture and `ty` means `x` must be type). |
| ↳  `$x:block`   | A block `{}` of statements or expressions, e.g., `{ let x = 5; }` |
| ↳  `$x:expr`    | An expression, e.g., `x`, `1 + 1`, `String::new()` or `vec![]` |
| ↳  `$x:expr_2021` | An expression that matches the behavior of Rust '21 [RFC](https://rust-lang.github.io/rfcs/3531-macro-fragment-policy.html) |
| ↳  `$x:ident`   | An identifier, for example in `let x = 0;` the identifier is `x`. |
| ↳  `$x:item`    | An item, like a function, struct, module, etc. |
| ↳  `$x:lifetime` | A lifetime (e.g., `'a`, `'static`, etc.). |
| ↳  `$x:literal` | A literal (e.g., `3`, `"foo"`, `b"bar"`, etc.). |
| ↳  `$x:meta`    | A meta item; the things that go inside `#[…]` and `#![…]` attributes. |
| ↳  `$x:pat`     | A pattern, e.g., `Some(x)`, `(17, 'a')` or `x\|x`. |
| ↳  `$x:pat_param`| Subset of patterns without top-level \|, e.g., `Some(x)` or `x`. |
| ↳  `$x:path`    | A path (e.g., `foo`, `::std::mem::replace`, `transmute::<_, int>`). |
| ↳  `$x:stmt`    | A statement, e.g., `let x = 1 + 1;`, `String::new();` or `vec![];` |
| ↳  `$x:tt`      | A single token tree, [see here](https://stackoverflow.com/a/40303308) for more details. |
| ↳  `$x:ty`      | A type, e.g., `String`, `usize` or `Vec<u8>`. |
| ↳  `$x:vis`    | A visibility modifier;  `pub`, `pub(crate)`, etc. |
| `$crate` | Special hygiene variable, crate where macros is defined.  **[Missing source / explanation]**  |

### Documentation

Inside a **doc comment** [Book](https://doc.rust-lang.org/book/ch14-02-publishing-to-crates-io.html#making-useful-documentation-comments) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/meta/doc.html#documentation) [Reference](https://doc.rust-lang.org/reference/comments.html#doc-comments) these work:

| Within Doc Comments | Explanation |
|--------|-------------|
| ` ```…``` ` | Include a [**doc test**](https://doc.rust-lang.org/rustdoc/documentation-tests.html) (doc code running on `cargo test`). |
| ` ```X,Y …``` ` | Same, and include optional configurations; with `X`, `Y` being … |
| ↳  `rust` | Make it explicit test is written in Rust; implied by Rust tooling. |
| ↳  `-` | Compile test. Run test. Fail if panic. **Default behavior**. |
| ↳  `should_panic` | Compile test. Run test. Execution should panic. If not, fail test. |
| ↳  `no_run` | Compile test. Fail test if code can't be compiled, Don't run test. |
| ↳  `compile_fail` | Compile test but fail test if code _can_ be compiled. |
| ↳  `ignore` | Do not compile. Do not run. Prefer option above instead. |
| ↳  `edition2018` | Execute code as Rust '18; default is '15. |
| `#` | Hide line from documentation (` ```   # use x::hidden; ``` `). |
| ``[`S`]`` | Create a link to struct, enum, trait, function, … `S`. |
| ``[`S`](crate::S)`` | Paths can also be used, in the form of markdown links. |

