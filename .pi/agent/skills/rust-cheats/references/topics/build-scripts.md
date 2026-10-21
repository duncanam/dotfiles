# Tooling: build.rs and Cargo build-script instructions

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 4597–4655.
Section context: Tooling Directives.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

### `build.rs`

Environment variables and outputs related to the pre-build script. Consider **build-rs**[Link](https://docs.rs/build-rs/0.1.2/build/) instead.

| Input Environment | Explanation [Link](https://doc.rust-lang.org/cargo/reference/environment-variables.html) |
|-------|-------------|
| `CARGO_FEATURE_X` |  Environment variable set for each feature `x` activated.  |
| ↳  `CARGO_FEATURE_SOMETHING` |  If feature `something` were enabled. |
| ↳  `CARGO_FEATURE_SOME_FEATURE` | If _f._ `some-feature` were enabled; dash `-` converted to `_`. |
| `CARGO_CFG_X` | Exposes cfg's; joins mult. opts. by `,` and converts `-` to `_`.|
| ↳  `CARGO_CFG_TARGET_OS=macos` |  If `target_os` were set to `macos`. |
| ↳  `CARGO_CFG_TARGET_FEATURE=avx,avx2` |  If `target_feature` were set to `avx` and `avx2`. |
| `OUT_DIR` |  Where output should be placed. |
| `TARGET` |  Target triple being compiled for. |
| `HOST` |  Host triple (running this build script). |
| `PROFILE` |  Can be `debug` or `release`. |

**Notes:**

Available in `build.rs` via `env::var()?`. List not exhaustive.

| Output String | Explanation [Link](https://doc.rust-lang.org/cargo/reference/build-scripts.html) |
|-------|-------------|
| `cargo::rerun-if-changed=PATH` | (Only) run this `build.rs` again if `PATH` changed. |
| `cargo::rerun-if-env-changed=VAR` | (Only) run this `build.rs` again if environment `VAR` changed. |
| `cargo::rustc-cfg=KEY[="VALUE"]` | Emit given `cfg` option to be used for later compilation. |
| `cargo::rustc-cdylib-link-arg=FLAG ` | When building a `cdylib`, pass linker flag. |
| `cargo::rustc-env=VAR=VALUE ` | Emit var accessible via `env!()` in crate during compilation. |
| `cargo::rustc-flags=FLAGS` | Add special flags to compiler.  **[Missing source / explanation]**  |
| `cargo::rustc-link-lib=[KIND=]NAME` | Link native library as if via `-l` option. |
| `cargo::rustc-link-search=[KIND=]PATH` | Search path for native library as if via `-L` option. |
| `cargo::warning=MESSAGE` | Emit compiler warning. |

**Notes:**

Emitted from `build.rs` via `println!()`. List not exhaustive.

**Notes:**

For the _On_ column in attributes:

`C` means on crate level (usually given as `#![my_attr]` in the top level file).

`M` means on modules.

`F` means on functions.

`S` means on static.

`T` means on types.

`X` means something special.

`!` means on macros.

`*` means on almost any item.

---

