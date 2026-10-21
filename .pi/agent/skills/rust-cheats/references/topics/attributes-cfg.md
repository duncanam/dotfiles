# Tooling: crate/code/lint/proc-macro attributes and cfg

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 4439–4596.
Section context: Tooling Directives.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

### `#![globals]`

Attributes affecting the whole crate or app:

| Opt-Out's   | On | Explanation |
|--------|---| ----------|
| `#![no_std]` | `C` | Don't (automatically) import **`std`**[std](https://doc.rust-lang.org/std/) ; use **`core`**[std](https://doc.rust-lang.org/core/) instead. [Reference](https://doc.rust-lang.org/reference/names/preludes.html#the-no_std-attribute) |
| `#![no_implicit_prelude]` | `CM` | Don't add **`prelude`**[std](https://doc.rust-lang.org/std/prelude/index.html), need to manually import `None`, `Vec`, … [Reference](https://doc.rust-lang.org/reference/names/preludes.html#the-no_implicit_prelude-attribute) |
| `#![no_main]` |  `C` | Don't emit `main()` in apps if you do that yourself. [Reference](https://doc.rust-lang.org/reference/crates-and-source-files.html#the-no_main-attribute)|

| Opt-In's   | On | Explanation |
|--------|---| ----------|
| `#![feature(a, b, c)]` | `C` | Rely on f. that may not get stabilized, _c._ [**Unstable Book**](https://doc.rust-lang.org/unstable-book/the-unstable-book.html).  **[Unstable / nightly]**  |

| Builds | On | Explanation |
|--------|---| ----------|
| `#![crate_name = "x"]` | `C`  | Specify current crate name, e.g., when not using `cargo`.  **[Missing source / explanation]**  [Reference](https://doc.rust-lang.org/reference/crates-and-source-files.html#the-crate_name-attribute)  **[Advanced]**  |
| `#![crate_type = "bin"]` | `C`  | Specify current crate type (`bin`, `lib`, `dylib`, `cdylib`, …). [Reference](https://doc.rust-lang.org/reference/linkage.html)  **[Advanced]**  |
| `#![recursion_limit = "123"]` | `C` | Set _compile-time_ recursion limit for deref, macros, … [Reference](https://doc.rust-lang.org/reference/attributes/limits.html#the-recursion_limit-attribute)  **[Advanced]**  |
| `#![type_length_limit = "456"]` | `C` | Limits maximum number of type substitutions. [Reference](https://doc.rust-lang.org/reference/attributes/limits.html#the-type_length_limit-attribute)  **[Advanced]**  |
| `#![windows_subsystem = "x"]` | `C` | On Windows, make a `console` or `windows` app. [Reference](https://doc.rust-lang.org/reference/runtime.html#the-windows_subsystem-attribute)  **[Advanced]**  |

| Handlers | On | Explanation |
|--------|---|----------|
| `#[alloc_error_handler]` | `F` | Make some `fn(Layout) -> !` the **allocation fail. handler**. [Link](https://github.com/rust-lang/rust/issues/51540)  **[Unstable / nightly]**  |
| `#[global_allocator]` | `S` | Make static item impl. `GlobalAlloc` [std](https://doc.rust-lang.org/alloc/alloc/trait.GlobalAlloc.html) **global allocator**. [Reference](https://doc.rust-lang.org/reference/runtime.html#the-global_allocator-attribute)|
| `#[panic_handler]` | `F` | Make some `fn(&PanicInfo) -> !` app's **panic handler**. [Reference](https://doc.rust-lang.org/reference/runtime.html#the-panic_handler-attribute) |

### `#[code]`

Attributes primarily governing emitted code:

| Developer UX | On | Explanation |
|-------|---|-------------|
| `#[non_exhaustive]` | `T` | Future-proof `struct` or `enum`; hint it may grow in future. [Reference](https://doc.rust-lang.org/reference/attributes/type_system.html#the-non_exhaustive-attribute)|
| `#[path = "x.rs"]` | `M` | Get module from non-standard file. [Reference](https://doc.rust-lang.org/reference/items/modules.html#the-path-attribute)|
| `#[diagnostic::on_unimplemented]` | `X` | Give better error messages when trait not implemented. [RFC](https://rust-lang.github.io/rfcs/3368-diagnostic-attribute-namespace.html)|

| Codegen | On | Explanation |
|-------|---|-------------|
| `#[cold]` | `F` | Hint that function probably isn't going to be called. [Reference](https://doc.rust-lang.org/reference/attributes/codegen.html#the-cold-attribute)|
| `#[inline]` | `F` | Nicely suggest compiler should inline function at call sites. [Reference](https://doc.rust-lang.org/reference/attributes/codegen.html#the-inline-attribute)|
| `#[inline(always)]` | `F` | Emphatically threaten compiler to inline call, or else. [Reference](https://doc.rust-lang.org/reference/attributes/codegen.html#the-inline-attribute)|
| `#[inline(never)]` | `F` | Instruct compiler to feel sad if it still inlines the function. [Reference](https://doc.rust-lang.org/reference/attributes/codegen.html#the-inline-attribute) |
| `#[repr(X)]`^(1)  | `T`  | Use another representation instead of the default **`rust`** [Reference](https://doc.rust-lang.org/reference/type-layout.html#the-default-representation) one: |
| `#[target_feature(enable="x")]` | `F` | Enable CPU feature (e.g., `avx2`) for code of `unsafe fn`. [Reference](https://doc.rust-lang.org/reference/attributes/codegen.html#the-target_feature-attribute)|
| `#[track_caller]` | `F` | Allows `fn` to find **`caller`**[std](https://doc.rust-lang.org/core/panic/struct.Location.html#method.caller) for better panic messages. [Reference](https://doc.rust-lang.org/reference/attributes/codegen.html#the-track_caller-attribute)|
| ↳  `#[repr(C)]` | `T`  | Use a C-compatible (f. FFI), predictable (f. `transmute`) layout. [Reference](https://doc.rust-lang.org/reference/type-layout.html#the-c-representation)|
| ↳  `#[repr(C, u8)]` | `enum`  | Give `enum` discriminant the specified type. [Reference](https://doc.rust-lang.org/reference/type-layout.html#the-c-representation)|
| ↳  `#[repr(transparent)]` | `T`  | Give single-element type same layout as contained field. [Reference](https://doc.rust-lang.org/reference/type-layout.html#the-transparent-representation)|
| ↳  `#[repr(packed(1))]` | `T`  | Lower align. of struct and contained fields, mildly UB prone. [Reference](https://doc.rust-lang.org/reference/type-layout.html#the-alignment-modifiers)|
| ↳  `#[repr(align(8))]` | `T`  | Raise alignment of struct to given value, e.g., for SIMD types. [Reference](https://doc.rust-lang.org/reference/type-layout.html#the-alignment-modifiers)|

**Notes:**

^(1) Some representation modifiers can be combined, e.g., `#[repr(C, packed(1))]`.

| Linking | On | Explanation |
|-------|---|-------------|
| `#[unsafe(no_mangle)]` | `*` | Use item name directly as symbol name, instead of mangling.  [Reference](https://doc.rust-lang.org/reference/abi.html#the-no_mangle-attribute)|
| `#[unsafe(export_name = "foo")]` | `FS` | Export a `fn` or `static` under a different name. [Reference](https://doc.rust-lang.org/reference/abi.html#the-export_name-attribute)|
| `#[unsafe(link_section = ".x")]` | `FS`  | Section name of object file where item should be placed. [Reference](https://doc.rust-lang.org/reference/abi.html#the-link_section-attribute)|
| `#[link(name="x", kind="y")]` | `X`  | Native lib to link against when looking up symbol. [Reference](https://doc.rust-lang.org/reference/items/external-blocks.html#the-link-attribute)|
| `#[link_name = "foo"]` | `F`  | Name of symbol to search for resolving `extern fn`. [Reference](https://doc.rust-lang.org/reference/items/external-blocks.html#the-link_name-attribute)|
| `#[no_link]` | `X` | Don't link `extern crate` when only wanting macros. [Reference](https://doc.rust-lang.org/reference/items/extern-crates.html#the-no_link-attribute)|
| `#[used]` | `S`  | Don't optimize away `static` variable despite it looking unused. [Reference](https://doc.rust-lang.org/reference/abi.html#the-used-attribute)|

### `#[quality]`

Attributes used by Rust tools to improve code quality:

| Code Patterns | On | Explanation |
|-------|---|-------------|
| `#[allow(X)]` | `*` | Instruct `rustc` / `clippy` to ign. class `X` of possible issues. [Reference](https://doc.rust-lang.org/reference/attributes/diagnostics.html#lint-check-attributes) |
| `#[expect(X)]` ^(1) | `*` | Warn if a lint doesn't trigger. [Reference](https://doc.rust-lang.org/reference/attributes/diagnostics.html#lint-check-attributes) |
| `#[warn(X)]` ^(1) | `*` |  … emit a warning, mixes well with `clippy` lints.  **[Useful]**  [Reference](https://doc.rust-lang.org/reference/attributes/diagnostics.html#lint-check-attributes) |
| `#[deny(X)]` ^(1) | `*` |  … fail compilation. [Reference](https://doc.rust-lang.org/reference/attributes/diagnostics.html#lint-check-attributes) |
| `#[forbid(X)]` ^(1) | `*` | … fail compilation and prevent subsequent `allow` overrides. [Reference](https://doc.rust-lang.org/reference/attributes/diagnostics.html#lint-check-attributes) |
| `#[deprecated = "msg"]` | `*` | Let your users know you made a design mistake. [Reference](https://doc.rust-lang.org/reference/diagnostics.html#the-deprecated-attribute)|
| `#[must_use = "msg"]` | `FTX` |  Makes compiler check return value is _processed_ by caller.  **[Useful]**  [Reference](https://doc.rust-lang.org/reference/attributes/diagnostics.html#the-must_use-attribute)|

**Notes:**

^(1)  **[Opinion]**  There is some debate which one is the _best_ to ensure high quality crates. Actively maintained multi-dev crates probably benefit from more aggressive `deny` or `forbid` lints; less-regularly updated ones probably more from conservative use of `warn` (as future compiler or `clippy` updates may suddenly break otherwise working code with minor issues).

| Tests | On | Explanation |
|-------|---|-------------|
| `#[test]` | `F` | Marks the function as a test, run with `cargo test`.  **[Useful]**  [Reference](https://doc.rust-lang.org/reference/attributes/testing.html#the-test-attribute)|
| `#[ignore = "msg"]` | `F` | Compiles but does not execute some `#[test]` for now. [Reference](https://doc.rust-lang.org/reference/attributes/testing.html#the-ignore-attribute)|
| `#[should_panic]` | `F` | Test must `panic!()` to actually succeed. [Reference](https://doc.rust-lang.org/reference/attributes/testing.html#the-ignore-attribute)|
| `#[bench]` | `F` | Mark function in `bench/` as benchmark for `cargo bench`.  **[Unstable / nightly]**  [Reference](https://doc.rust-lang.org/reference/)|

| Formatting | On | Explanation |
|-------|---|-------------|
| `#[rustfmt::skip]` |  `*` | Prevent `cargo fmt` from cleaning up item. [Link](https://github.com/rust-lang/rustfmt)|
| `#![rustfmt::skip::macros(x)]` |  `CM` | … from cleaning up macro `x`. [Link](https://github.com/rust-lang/rustfmt)|
| `#![rustfmt::skip::attributes(x)]` |  `CM` | … from cleaning up attribute `x`. [Link](https://github.com/rust-lang/rustfmt)|

| Documentation | On | Explanation |
|-------|---|-------------|
| `#[doc = "Explanation"]` | `*` | Same as adding a `///` doc comment. [Link](https://doc.rust-lang.org/rustdoc/the-doc-attribute.html) |
| `#[doc(alias = "other")]` | `*` | Provide other name for search in docs. [Link](https://github.com/rust-lang/rust/issues/50146) |
| `#[doc(hidden)]` | `*` | Prevent item from showing up in docs. [Link](https://doc.rust-lang.org/rustdoc/write-documentation/the-doc-attribute.html#hidden) |
| `#![doc(html_favicon_url = "")]` | `C` | Sets the `favicon` for the docs. [Link](https://doc.rust-lang.org/rustdoc/write-documentation/the-doc-attribute.html#html_favicon_url)|
| `#![doc(html_logo_url  = "")]` | `C` | The logo used in the docs. [Link](https://doc.rust-lang.org/rustdoc/write-documentation/the-doc-attribute.html#html_logo_url)|
| `#![doc(html_playground_url  = "")]` | `C` | Generates `Run` buttons and uses given service. [Link](https://doc.rust-lang.org/rustdoc/write-documentation/the-doc-attribute.html#html_playground_url)|
| `#![doc(html_root_url  = "")]` | `C` | Base URL for links to external crates. [Link](https://doc.rust-lang.org/rustdoc/write-documentation/the-doc-attribute.html#html_root_url)|
| `#![doc(html_no_source)]` | `C` | Prevents source from being included in docs. [Link](https://doc.rust-lang.org/rustdoc/write-documentation/the-doc-attribute.html#html_no_source)|

### `#[macros]`

Attributes related to the creation and use of macros:

| Macros By Example | On | Explanation |
|-------|---|-------------|
| `#[macro_export]` |  `!` | Export `macro_rules!` as `pub` on crate level [Reference](https://doc.rust-lang.org/reference/macros-by-example.html#path-based-scope)|
| `#[macro_use]` | `MX` | Let macros persist past mod.; or import from `extern crate`. [Reference](https://doc.rust-lang.org/reference/macros-by-example.html#the-macro_use-attribute)|

| Proc Macros | On | Explanation |
|-------|---|-------------|
| `#[proc_macro]` | `F`  | Mark `fn` as **function-like** procedural _m._ callable as `m!()`. [Reference](https://doc.rust-lang.org/reference/procedural-macros.html#function-like-procedural-macros)|
| `#[proc_macro_derive(Foo)]` | `F`  | Mark `fn` as **derive macro** which can `#[derive(Foo)]`. [Reference](https://doc.rust-lang.org/reference/procedural-macros.html#derive-macros)|
| `#[proc_macro_attribute]` | `F`  | Mark `fn` as **attribute macro** for new `#[x]`. [Reference](https://doc.rust-lang.org/reference/procedural-macros.html#attribute-macros)|

| Derives | On | Explanation |
|-------|---|-------------|
| `#[derive(X)]` | `T` | Let some proc macro provide a goodish `impl` of `trait X`.  **[Useful]**  [Reference](https://doc.rust-lang.org/reference/)|

### `#[cfg]`

Attributes governing conditional compilation:

| Config Attributes | On | Explanation |
|-------|---|-------------|
| `#[cfg(X)]` | `*` | Include item if configuration `X` holds. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#the-cfg-attribute)|
| `#[cfg(all(X, Y, Z))]` | `*` | Include item if all options hold. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#conditional-compilation)|
| `#[cfg(any(X, Y, Z))]` | `*` | Include item if at least one option holds. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#conditional-compilation)|
| `#[cfg(not(X))]` | `*` | Include item if `X` does not hold. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#conditional-compilation)|
| `#[cfg_attr(X, foo = "msg")]` | `*` | Apply `#[foo = "msg"]` if configuration `X` holds. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#the-cfg_attr-attribute)|

> ⚠️ Note, options can generally be set multiple times, i.e., the same key can show up with multiple values. One can expect `#[cfg(target_feature = "avx")]` **and** `#[cfg(target_feature = "avx2")]` to be true at the same time.

| Known Options | On | Explanation |
|-------|---|-------------|
| `#[cfg(debug_assertions)]` | `*` | Whether `debug_assert!()` & co. would panic. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#debug_assertions)|
| `#[cfg(feature = "foo")]` | `*` | When your crate was compiled with _f._ `foo`.  **[Useful]**  [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#conditional-compilation)|
| `#[cfg(target_arch = "x86_64")]` | `*` | The CPU architecture crate is compiled for. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#target_arch)|
| `#[cfg(target_env = "msvc")]` | `*` | How DLLs and functions are interf. with on OS. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#target_env)|
| `#[cfg(target_endian = "little")]` | `*` | Main reason your new zero-cost prot. fails. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#target_endian)|
| `#[cfg(target_family = "unix")]` | `*` | Family operating system belongs to. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#target_family)|
| `#[cfg(target_feature = "avx")]` | `*` | Whether a particular class of instructions is avail. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#target_feature)|
| `#[cfg(target_os = "macos")]` | `*` | Operating system your code will run on. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#target_os)|
| `#[cfg(target_pointer_width = "64")]` | `*` | How many bits ptrs, `usize` and words have. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#target_pointer_width)|
| `#[cfg(target_vendor = "apple")]` | `*` |  Manufacturer of target. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#target_vendor)|
| `#[cfg(panic = "unwind")]` | `*` | Whether `unwind` or `abort` will happen on panic.  **[Missing source / explanation]** |
| `#[cfg(proc_macro)]` | `*` | Whether crate compiled as proc macro. [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#proc_macro)|
| `#[cfg(test)]` | `*` | Whether compiled with `cargo test`.  **[Useful]**  [Reference](https://doc.rust-lang.org/reference/conditional-compilation.html#test)|

