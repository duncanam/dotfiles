# Tooling: project structure, modules, Cargo and cross compilation

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 4097–4391.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

# Tooling

## Project Anatomy

Basic project layout, and common files and folders, as used by `cargo`. [See section](https://cheats.rs/#cargo)

| Entry | Code |
|--------| ---- |
| 📁 `.cargo/` | **Project-local cargo configuration**, may contain **`config.toml`**. [Link](https://doc.rust-lang.org/cargo/reference/config.html)  **[Advanced]**  |
| 📁 `benches/` | Benchmarks for your crate, run via **`cargo bench`**, requires nightly by default. ^(*)  **[Unstable / nightly]**  |
| 📁 `examples/` | Examples how to use your crate, they see your crate like external user would.  |
| ↳  ↳  `my_example.rs` | Individual examples are run like **`cargo run --example my_example`**. |
| 📁 `src/` | Actual source code for your project. |
| ↳  ↳  `main.rs` | Default entry point for applications, this is what **`cargo run`** uses. |
| ↳  ↳  `lib.rs` | Default entry point for libraries. This is where lookup for `my_crate::f()` starts. |
| 📁 `src/bin/` | Place for additional binaries, even in library projects. |
| ↳  ↳  `extra.rs` | Additional binary, run with `cargo run --bin extra`. |
| 📁 `tests/` | Integration tests go here, invoked via **`cargo test`**. Unit tests often stay in `src/` file. |
| `.rustfmt.toml` | In case you want to [**customize**](https://rust-lang.github.io/rustfmt/) how **`cargo fmt`** works. |
| `.clippy.toml` | Special configuration for certain [**clippy lints**](https://rust-lang.github.io/rust-clippy/master/index.html), utilized via **`cargo clippy`**   **[Advanced]**  |
| `build.rs` |  **Pre-build script**, [Link](https://doc.rust-lang.org/cargo/reference/build-scripts.html) useful when compiling C / FFI, … |
| `Cargo.toml` | Main **project manifest**, [Link](https://doc.rust-lang.org/cargo/reference/manifest.html) Defines dependencies, artifacts … |
| `Cargo.lock` | For reproducible builds. Add to git for apps, consider not for libs.  **[Opinion]**  [Link](https://blog.rust-lang.org/2023/08/29/committing-lockfiles.html) [Link](https://web.archive.org/web/20240108203227/https://old.reddit.com/r/rust/comments/164qfjm/change_in_guidance_on_committing_lockfiles_rust/jya8ouf/) |
| `rust-toolchain.toml` |  Define **toolchain override**[Link](https://rust-lang.github.io/rustup/overrides.html) (channel, components, targets) for this project. |

**Notes:**

^(*) On stable consider [Criterion](https://github.com/bheisler/criterion.rs).

**Minimal examples** for various entry points might look like:

### Applications

```
// src/main.rs (default application entry point)

fn main() {
    println!("Hello, world!");
}
```


### Libraries

```
// src/lib.rs (default library entry point)

pub fn f() {}      // Is a public item in root, so it's accessible from the outside.

mod m {
    pub fn g() {}  // No public path (`m` not public) from root, so `g`
}                  // is not accessible from the outside of the crate.
```


### Unit Tests

```
// src/my_module.rs (any file of your project)

fn f() -> u32 { 0 }

#[cfg(test)]
mod test {
    use super::f;           // Need to import items from parent module. Has
                            // access to non-public members.
    #[test]
    fn ff() {
        assert_eq!(f(), 0);
    }
}
```


### Integration Tests

```
// tests/sample.rs (sample integration test)

#[test]
fn my_sample() {
    assert_eq!(my_crate::f(), 123); // Integration tests (and benchmarks) 'depend' to the crate like
}                                   // a 3rd party would. Hence, they only see public items.
```


### Benchmarks [Unstable / nightly]

```
// benches/sample.rs (sample benchmark)

#![feature(test)]   // #[bench] is still experimental

extern crate test;  // Even in '18 this is needed for … reasons.
                    // Normally you don't need this in '18 code.

use test::{black_box, Bencher};

#[bench]
fn my_algo(b: &mut Bencher) {
    b.iter(|| black_box(my_crate::f())); // `black_box` prevents `f` from being optimized away.
}
```


### Build Scripts

```
// build.rs (sample pre-build script)

fn main() {
    // You need to rely on env. vars for target; `#[cfg(…)]` are for host.
    let target_os = env::var("CARGO_CFG_TARGET_OS");
}
```


^(*)[See here for list](https://doc.rust-lang.org/cargo/reference/environment-variables.html#environment-variables-cargo-sets-for-build-scripts) of environment variables set.

### Proc Macros [Advanced]

```
// src/lib.rs (default entry point for proc macros)

extern crate proc_macro;  // Apparently needed to be imported like this.

use proc_macro::TokenStream;

#[proc_macro_attribute]   // Crates can now use `#[my_attribute]`
pub fn my_attribute(_attr: TokenStream, item: TokenStream) -> TokenStream {
    item
}
```


```
// Cargo.toml

[package]
name = "my_crate"
version = "0.1.0"

[lib]
proc-macro = true
```


Module trees and imports:

### Module Trees

**Modules** [Book](https://doc.rust-lang.org/book/ch07-02-defining-modules-to-control-scope-and-privacy.html) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/mod.html#modules) [Reference](https://doc.rust-lang.org/reference/items/modules.html#modules) and **source files** work as follows:

- **Module tree** needs to be explicitly defined, is **not** implicitly built from **file system tree**. [Link](http://www.sheshbabu.com/posts/rust-module-system/)
- **Module tree root** equals library, app, … entry point (e.g., `lib.rs`).

Actual **module definitions** work as follows:
- A **`mod m {}`** defines module in-file, while **`mod m;`** will read `m.rs` or `m/mod.rs`.
- Path of `.rs` based on **nesting**, e.g., `mod a { mod b { mod c; }}}` is either `a/b/c.rs` or `a/b/c/mod.rs`.
- Files not pathed from module tree root via some `mod m;` won't be touched by compiler!  **[Pitfall / intentionally wrong]**

### Namespaces [Advanced]

Rust has three kinds of **namespaces**:

- Row 1:
  - Header, column 1: Namespace _Types_
  - Header, column 2: Namespace _Functions_
  - Header, column 3: Namespace _Macros_
- Row 2:
  - column 1: `mod X {}`
  - column 2: `fn X() {}`
  - column 3: `macro_rules! X { … }`
- Row 3:
  - column 1: `X` (crate)
  - column 2: `const X: u8 = 1;`
  - column 3: (empty)
- Row 4:
  - column 1: `trait X {}`
  - column 2: `static X: u8 = 1;`
  - column 3: (empty)
- Row 5:
  - column 1: `enum X {}`
  - column 2: (empty)
  - column 3: (empty)
- Row 6:
  - column 1: `union X {}`
  - column 2: (empty)
  - column 3: (empty)
- Row 7:
  - column 1: `struct X {}`
  - column 2: (empty)
  - column 3: (empty)
- Row 8:
  - columns 1–2: ← `struct X;`^(1) →
  - column 3: (empty)
- Row 9:
  - columns 1–2: ← `struct X();`^(2) →
  - column 3: (empty)

**Notes:**

^(1) Counts in _Types_ and in _Functions_, defines type `X` _and_ constant `X`.

^(2) Counts in _Types_ and in _Functions_, defines type `X` _and_ function `X`.

- In any given scope, for example within a module, only one item per namespace can exist, e.g.,
    - `enum X {}` and `fn X() {}` can coexist
    - `struct X;` and `const X` cannot coexist
- With a `use my_mod::X;` all items called `X` will be imported.

> Due to naming conventions (e.g., `fn` and `mod` are lowercase by convention) and _common sense_ (most developers just don't name all things `X`) you won't have to worry about these _kinds_ in most cases. They can, however, be a factor when designing macros.

## Cargo

Commands and tools that are good to know.

| Command | Description |
|--------| ---- |
| `cargo init` | Create a new project for the latest edition. |
| `cargo build` (highlighted abbreviation: `b`) | Build the project in debug mode (`--release` (highlighted abbreviation: `r`) for all optimization). |
| `cargo check` (highlighted abbreviation: `c`) | Check if project would compile (much faster). |
| `cargo test` (highlighted abbreviation: `t`) | Run tests for the project. |
| `cargo doc --no-deps --open` (highlighted abbreviation: `d`) | Locally generate documentation for your code. |
| `cargo run` (highlighted abbreviation: `r`) | Run your project, if a binary is produced (main.rs). |
| ↳  `cargo run --bin b` | Run binary `b`. Unifies feat. with other dependents (can be confusing). |
| ↳  `cargo run --package w` (highlighted abbreviation: `p`) | Run main of sub-worksp. `w`. Treats features more sanely. |
| `cargo … --timings` | Show what crates caused your build to take so long.  **[Useful]**  |
| `cargo tree` | Show dependency graph, all crates used by project, transitively. |
| ↳  `cargo tree -i foo` | Inverse dependency lookup, explain why `foo` is used. |
| `cargo info foo` | Show crate metadata for `foo` (by default for version used by this project). |
| `cargo +{nightly, stable} …`  | Use given toolchain for command, e.g., for 'nightly only' tools. |
| `cargo +1.85.0 …`  | Also accepts a specific version directly. |
| `cargo +nightly …` | Some nightly-only commands (substitute `…` with command below) |
| ↳  `rustc -- -Zunpretty=expanded` |  Show expanded macros.  **[Unstable / nightly]**  |
| `rustup doc` | Open offline Rust documentation (incl. the books), good on a plane! |

**Notes:**

Here `cargo build` (highlighted abbreviation: `b`) means you can either type `cargo build` or just `cargo b`; and `--release` (highlighted abbreviation: `r`) means it can be replaced with `-r`.

These are optional `rustup` components.
Install them with `rustup component add [tool]`.

| Tool | Description |
|--------| ---- |
| `cargo clippy` | Additional ([lints](https://rust-lang.github.io/rust-clippy/master/)) catching common API misuses and unidiomatic code. [Link](https://github.com/rust-lang/rust-clippy) |
| `cargo fmt` | Automatic code formatter (`rustup component add rustfmt`). [Link](https://github.com/rust-lang/rustfmt) |

A large number of additional cargo plugins [**can be found here**](https://crates.io/categories/development-tools::cargo-plugins?sort=downloads).

## Cross Compilation

🔘 Check [target is supported](https://doc.rust-lang.org/rustc/platform-support.html).

🔘 Install target via **`rustup target install aarch64-linux-android`** (for example).

🔘 Install native toolchain (required to _link_, depends on target).

Get from target vendor (Google, Apple, …), might not be available on all hosts (e.g., no iOS toolchain on Windows).

**Some toolchains require additional build steps** (e.g., Android's `make-standalone-toolchain.sh`).

🔘 Update **`~/.cargo/config.toml`** like this:

```
[target.aarch64-linux-android]
linker = "[PATH_TO_TOOLCHAIN]/aarch64-linux-android/bin/aarch64-linux-android-clang"
```


   or

```
[target.aarch64-linux-android]
linker = "C:/[PATH_TO_TOOLCHAIN]/prebuilt/windows-x86_64/bin/aarch64-linux-android21-clang.cmd"
```


🔘 Set **environment variables** (optional, wait until compiler complains before setting):

```
set CC=C:\[PATH_TO_TOOLCHAIN]\prebuilt\windows-x86_64\bin\aarch64-linux-android21-clang.cmd
set CXX=C:\[PATH_TO_TOOLCHAIN]\prebuilt\windows-x86_64\bin\aarch64-linux-android21-clang.cmd
set AR=C:\[PATH_TO_TOOLCHAIN]\prebuilt\windows-x86_64\bin\aarch64-linux-android-ar.exe
…
```


Whether you set them depends on how compiler complains, not necessarily all are needed.

> Some platforms / configurations can be **extremely sensitive** how paths are specified (e.g., `\` vs `/`) and quoted.

✔️ Compile with **`cargo build --target=aarch64-linux-android`**

