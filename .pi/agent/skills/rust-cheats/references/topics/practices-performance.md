# Guides: idiomatic Rust, optimization and profiling

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 6444–6543.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

# Coding Guides

## Idiomatic Rust

If you are used to Java or C, consider these.

| Idiom | Code |
|--------| ---- |
| **Think in Expressions** | `y = if x { a } else { b };` |
|  | `y = loop { break 5 };`  |
|  | `fn f() -> u32 { 0 }`  |
| **Think in Iterators** | `(1..10).map(f).collect()` |
|  | `names.iter().filter(\|x\| x.starts_with("A"))` |
| **Test Absence with `?`** | `y = try_something()?;` |
|  | `get_option()?.run()?` |
| **Use Strong Types** | `enum E { Invalid, Valid { … } }` over `ERROR_INVALID = -1` |
|  | `enum E { Visible, Hidden }` over `visible: bool` |
|  | `struct Charge(f32)` over `f32` |
| **Illegal State: Impossible** | `my_lock.write().unwrap().guaranteed_at_compile_time_to_be_locked = 10;` ^(1)|
|  | `thread::scope(\|s\| { /* Threads can't exist longer than scope() */ });` |
| **Avoid _Global_ State** | Being depended on in multiple versions can secretly duplicate statics.  **[Pitfall / intentionally wrong]**  [Link](https://doc.rust-lang.org/cargo/reference/resolver.html#version-incompatibility-hazards) |
| **Provide Builders** | `Car::builder().name("Model T").hp(20).build();` |
| **Make it Const** | Where possible mark fns. `const`; where feasible run code inside `const {}`. |
| **Don't Panic** | Panics are _not_ exceptions, they suggest immediate process abortion! |
|  | Only panic on programming error; use `Option<T>`[std](https://doc.rust-lang.org/std/option/enum.Option.html) or `Result<T,E>`[std](https://doc.rust-lang.org/std/result/enum.Result.html) otherwise. |
|  | If clearly user requested, e.g., calling `obtain()` vs. `try_obtain()`, panic ok too. |
|  | Inside `const { NonZero::new(1).unwrap() }` p. becomes compile error, ok too. |
| **Generics in Moderation** | A simple `<T: Bound>` (e.g., `AsRef<Path>`) can make your APIs nicer to use.  |
| | Complex bounds make it impossible to follow. If in doubt don't be creative with _g_.  |
| **Split Implementations** | Generics like `Point<T>` can have separate `impl` per `T` for some specialization. |
|   | `impl<T> Point<T> { /* Add common methods here */ }` |
|   | `impl Point<f32> { /* Add methods only relevant for Point<f32> */ }` |
| **Unsafe** | Avoid `unsafe {}`,[See section](https://cheats.rs/#unsafe-unsound-undefined) often safer, faster solution without it. |
| **Implement Traits** | `#[derive(Debug, Copy, …)]` and custom `impl` where needed. |
| **Tooling** | Run [**clippy**](https://github.com/rust-lang/rust-clippy) regularly to significantly improve your code quality.  **[Useful]**  |
|  | Format your code with [**rustfmt**](https://github.com/rust-lang/rustfmt) for consistency.  **[Useful]**  |
|  | Add **unit tests** [Book](https://doc.rust-lang.org/book/ch11-01-writing-tests.html) (`#[test]`) to ensure your code works. |
|  | Add **doc tests** [Book](https://doc.rust-lang.org/book/ch14-02-publishing-to-crates-io.html) (` ``` my_api::f() ``` `) to ensure docs match code. |
| **Documentation** | Annotate your APIs with doc comments that can show up on [**docs.rs**](https://docs.rs). |
|  | Don't forget to include a **summary sentence** and the **Examples** heading. |
|  | If applicable: **Panics**, **Errors**, **Safety**, **Abort** and **Undefined Behavior**. |

**Notes:**

^(1) In most cases you should prefer `?` over `.unwrap()`. In the case of locks however the returned [**`PoisonError`**](https://doc.rust-lang.org/stable/std/sync/struct.PoisonError.html) signifies a panic in another thread, so unwrapping it (thus propagating the panic) is often the better idea.

> 🔥 We **highly** recommend you also follow the
> [**API Guidelines**](https://rust-lang.github.io/api-guidelines/) and the
> [**Pragmatic Rust Guidelines**](https://microsoft.github.io/rust-guidelines/)  🔥

## Performance Tips

"My code is slow" sometimes comes up when porting microbenchmarks to Rust, or after profiling.

| Rating | Name | Description |
| --- | --- |--- |
|  **[Potential >2x boost]**  **[Easy to implement]**  | **Release Mode** [Book](https://doc.rust-lang.org/book/ch01-03-hello-cargo.html)  **[Useful]**  |  Always do `cargo build --release` for massive speed boost. |
|  **[Easy to implement]**  **[Security / correctness risk]**  | **Target Native CPU** [Link](https://doc.rust-lang.org/rustc/codegen-options/index.html#target-cpu) | Add `rustflags = ["-Ctarget-cpu=native"]` to `config.toml`. [See section](https://cheats.rs/#project-anatomy) |
|  **[Easy to implement]**  **[Costly tradeoff]**  | **Codegen Units** [Link](https://doc.rust-lang.org/rustc/codegen-options/index.html#codegen-units) | Codegen units `1` may yield faster code, slower compile. |
|  **[Easy to implement]**  | **Reserve Capacity** [std](https://doc.rust-lang.org/std/?search=with_capacity)  | Pre-allocation of collections reduces allocation pressure. |
|  **[Easy to implement]**  | **Recycle Collections** [std](https://doc.rust-lang.org/std/index.html?search=clear) | Calling `x.clear()` and reusing `x` prevents allocations. |
|  **[Easy to implement]**  | **Append to Strings** [std](https://doc.rust-lang.org/std/macro.write.html) | Using `write!(&mut s, "{}")` can prevent extra allocation. |
|  **[Easy to implement]**  **[Costly tradeoff]**  | **Global Allocator** [std](https://doc.rust-lang.org/std/alloc/index.html#the-global_allocator-attribute) | On some platforms ext. allocator (e.g., **mimalloc** [Link](https://crates.io/crates/mimalloc)) faster. |
| | **Bump Allocations** [Link](https://docs.rs/bumpalo/latest/bumpalo/) | Cheaply gets _temporary_, dynamic memory, esp. in hot loops. |
|  | **Batch APIs** | Design APIs to handle multiple similar elements at once, e.g., slices. |
|  **[Costly tradeoff]**  | **SoA** / **AoSoA** [Link](https://web.archive.org/web/20240815193855/https://www.rustsim.org/blog/2020/03/23/simd-aosoa-in-nalgebra/) | Beyond that consider _struct of arrays_ (SoA) and similar. |
|  **[Potential >2x boost]**  **[Costly tradeoff]**  | **SIMD** [std](https://doc.rust-lang.org/std/simd/index.html)  **[Unstable / nightly]**  | Inside (math heavy) batch APIs using SIMD can give 2x - 8x boost. |
|  | **Reduce Data Size**  | Small types (e.g, `u8` vs `u32`, niches **[Missing source / explanation]** ) and data have better cache use. |
|  | **Keep Data Nearby** [Link](https://en.wikipedia.org/wiki/Data-oriented_design) | Storing often-used data _nearby_ can improve memory access times. |
|  | **Pass by Size** [Link](https://github.com/isocpp/CppCoreGuidelines/blob/master/CppCoreGuidelines.md#reason-45) | Small (2-3 words) structs best passed by value, larger by reference. |
|   **[Costly tradeoff]**  | **Async-Await** [Link](https://rust-lang.github.io/async-book/01_getting_started/01_chapter.html) | If _parallel waiting_ happens a lot (e.g., server I/O) `async` good idea. |
|  | **Threading** [std](https://doc.rust-lang.org/std/thread/index.html) | Threads allow you to perform _parallel work_ on mult. items at once. |
|  **[Potential >2x boost]**  | ... **in app** | Often good for apps, as lower wait times means better UX. |
|  **[Costly tradeoff]**  | ... **inside libs** | Opaque _t._ use _inside_ lib often not good idea, can be too opinionated. |
|  **[Potential >2x boost]**  | ... **for lib callers** | However, allowing _your user_ to process _you_ in parallel excellent idea. |
|  **[Costly tradeoff]**  | **Avoid Locks**| Locks in multi-threaded code kills parallelism.  |
|  **[Costly tradeoff]**  | **Avoid Atomics**| Needless atomics (e.g., `Arc` vs `Rc`) impact other memory access. |
|  **[Costly tradeoff]**  | **Avoid False Sharing** [Link](https://en.wikipedia.org/wiki/False_sharing)| Make sure data R/W by different CPUs at least 64 bytes apart. [Link](https://igoro.com/archive/gallery-of-processor-cache-effects/)  |
|  **[Potential >2x boost]**  **[Easy to implement]**  | **Buffered I/O** [std](https://doc.rust-lang.org/std/io/index.html#bufreader-and-bufwriter)  **[Useful]**  | Raw `File` I/O highly inefficient w/o buffering. |
|  **[Easy to implement]**  **[Security / correctness risk]**  | **Faster Hasher** [Link](https://lib.rs/crates/seahash) | Default `HashMap` [std](https://doc.rust-lang.org/std/collections/struct.HashMap.html) hasher DoS attack-resilient but slow. |
|  **[Easy to implement]**  **[Security / correctness risk]**  | **Faster RNG**  | If you use a crypto RNG consider swapping for non-crypto. |
|  **[Costly tradeoff]**  | **Avoid Trait Objects** [Link](https://stackoverflow.com/questions/28621980/what-are-the-actual-runtime-performance-costs-of-dynamic-dispatch) | T.O. reduce code size, but increase memory indirection. |
|  **[Costly tradeoff]**  | **Defer Drop** [Link](https://abrams.cc/rust-dropping-things-in-another-thread) | Dropping _heavy_ objects in dump-thread can free up current one. |
|  **[Easy to implement]**  **[Security / correctness risk]**  | **Unchecked APIs**  [std](https://doc.rust-lang.org/std/?search=unchecked) | If you are 100% confident, `unsafe { unchecked_ }` skips checks. |

**Notes:**

Entries marked  **[Potential >2x boost]**  often come with a massive (> 2x) performance boost,  **[Easy to implement]**  are easy to implement even after-the-fact,  **[Costly tradeoff]**  might have costly side effects (e.g., memory, complexity),  **[Security / correctness risk]**  have special risks (e.g., security, correctness).

> **Profiling Tips**  **[Opinion]**
>
> Profilers are indispensable to identify hot spots in code. For the best experience add this to your `Cargo.toml`:
> ```cargo
> [profile.release]
> debug = true
> ```

> Then do a `cargo build --release` and run the result with [**Superluminal**](https://superluminal.eu/rust/) (Windows) or [**Instruments**](https://en.wikipedia.org/wiki/Instruments_%28software%29) (macOS).
> That said, there are many performance opportunities profilers won't find, but that need to be _designed in_.

