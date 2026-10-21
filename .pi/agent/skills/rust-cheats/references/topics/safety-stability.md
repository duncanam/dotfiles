# Guides: unsafe, unsoundness, adversarial code and API stability

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 6653–6826.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

## Unsafe, Unsound, Undefined

Unsafe leads to unsound. Unsound leads to undefined. Undefined leads to the dark side of the force.

### Safe Code

**Safe Code**

- _Safe_ has narrow meaning in Rust, vaguely 'the _intrinsic_ prevention of undefined behavior (UB)'.
- Intrinsic means the language won't allow you to use _itself_ to cause UB.
- Making an airplane crash or deleting your database is not UB, therefore 'safe' from Rust's perspective.
- Writing to `/proc/[pid]/mem` to self-modify your code is also 'safe', resulting UB not caused _intrinsincally_.

```rust
let y = x + x;  // Safe Rust only guarantees the execution of this code is consistent with
print(y);       // 'specification' (long story …). It does not guarantee that y is 2x
                // (X::add might be implemented badly) nor that y is printed (Y::fmt may panic).
```


### Unsafe Code

**Unsafe Code**

- Code marked `unsafe` has special permissions, e.g., to deref raw pointers, or invoke other `unsafe` functions.
- Along come special **promises the author _must_ uphold to the compiler**, and the compiler _will_ trust you.
- By itself `unsafe` code is not bad, but dangerous, and needed for FFI or exotic data structures.

```rust
// `x` must always point to race-free, valid, aligned, initialized u8 memory.
unsafe fn unsafe_f(x: *mut u8) {
    my_native_lib(x);
}
```


### Undefined Behavior

**Undefined Behavior (UB)**
- As mentioned, `unsafe` code implies [special promises](https://doc.rust-lang.org/stable/reference/behavior-considered-undefined.html) to the compiler (it wouldn't need be `unsafe` otherwise).
- Failure to uphold any promise makes compiler produce fallacious code, execution of which leads to UB.
- After triggering undefined behavior _anything_ can happen. Insidiously, the effects may be 1) subtle, 2) manifest far away from the site of violation or 3) be visible only under certain conditions.
- A seemingly _working_ program (incl. any number of unit tests) is no proof UB code might not fail on a whim.
- Code with UB is objectively dangerous, invalid and should never exist.

```rust
if maybe_true() {
    let r: &u8 = unsafe { &*ptr::null() };   // Once this runs, ENTIRE app is undefined. Even if
} else {                                     // line seemingly didn't do anything, app might now run
    println!("the spanish inquisition");     // both paths, corrupt database, or anything else.
}
```


### Unsound Code

**Unsound Code**
- Any _safe_ Rust that could (even only theoretically) produce UB for any user input is always **unsound**.
- As is `unsafe` code that may invoke UB on its own accord by violating above-mentioned promises.
- Unsound code is a stability and security risk, and violates basic assumption many Rust users have.

```rust
fn unsound_ref<T>(x: &T) -> &u128 {      // Signature looks safe to users. Happens to be
    unsafe { mem::transmute(x) }         // ok if invoked with an &u128, UB for practically
}                                        // everything else.
```


>
> **Responsible use of Unsafe**  **[Opinion]**
>
> - Do not use `unsafe` unless you absolutely have to.
> - Follow the [Nomicon](https://doc.rust-lang.org/nightly/nomicon/), [Unsafe Guidelines](https://rust-lang.github.io/unsafe-code-guidelines/), **always** follow **all** safety rules, and **never** invoke [UB](https://doc.rust-lang.org/stable/reference/behavior-considered-undefined.html).
> - Minimize the use of `unsafe` and encapsulate it in small, sound modules that are easy to review.
> - Never create unsound abstractions; if you can't encapsulate `unsafe` properly, don't do it.
> - Each `unsafe` unit should be accompanied by plain-text reasoning outlining its safety.

## Adversarial Code  **[Advanced]**

_Adversarial_ code is _safe_ 3^(rd) party code that compiles but does not follow API _expectations_, and might interfere with your own (safety) guarantees.

| You author | User code may possibly … |
|---------|---------|
| `fn g<F: Fn()>(f: F) { … }` | Unexpectedly panic. |
| `struct S<X: T> { … }` | Implement `T` badly, e.g., misuse `Deref`, … |
| `macro_rules! m { … }` | Do all of the above; call site can have _weird_ scope. |

| Risk Pattern | Description |
|---------|---------|
| `#[repr(packed)]` |  Packed alignment can make reference `&s.x` invalid. |
| `impl std::… for S {}`  | Any trait `impl`, esp. `std::ops` may be broken. In particular … |
| ↳  `impl Deref for S {}` | May randomly `Deref`, e.g., `s.x != s.x`, or panic.  |
| ↳  `impl PartialEq for S {}` | May violate equality rules; panic.  |
| ↳  `impl Eq for S {}`  | May cause `s != s`; panic; must not use `s` in `HashMap` & co. |
| ↳  `impl Hash for S {}`  | May violate hashing rules; panic; must not use `s` in `HashMap` & co. |
| ↳  `impl Ord for S {}`  | May violate ordering rules; panic; must not use `s` in `BTreeMap` & co. |
| ↳  `impl Index for S {}` | May randomly index, e.g., `s[x] != s[x]`; panic. |
| ↳  `impl Drop for S {}` | May run code or panic end of scope `{}`, during assignment `s = new_s`. |
| `panic!()` | User code can panic _any_ time, resulting in abort or unwind. |
| `catch_unwind(\|\| s.f(panicky))` |  Also, caller might force observation of broken state in `s`.  |
| `let … = f();` | Variable name can affect order of `Drop` execution. ^(1)  **[Pitfall / intentionally wrong]**   |

**Notes:**

^(1) Notably, when you rename a variable from `_x` to `_` you will also change Drop behavior since you change semantics. A variable named `_x` will have `Drop::drop()` executed at the end of its scope, a variable named `_` can have it executed immediately on 'apparent' assignment ('apparent' because a binding named `_` means **wildcard** [Reference](https://doc.rust-lang.org/reference/patterns.html#wildcard-pattern) _discard this_, which will happen as soon as feasible, often right away)!

> **Implications**
>
> - Generic code **cannot be safe if safety depends on type cooperation** w.r.t. most (`std::`) traits.
> - If type cooperation is needed you must use `unsafe` traits (prob. implement your own).
> - You must consider random code execution at unexpected places (e.g., re-assignments, scope end).
> - You may still be observable after a worst-case panic.
>
> As a corollary, _safe_-but-deadly code (e.g., `airplane_speed<T>()`) should probably also follow these guides.

## API Stability

When updating an API, these changes can break client code.[RFC](https://rust-lang.github.io/rfcs/1105-api-evolution.html) Major changes (🔴) are **definitely breaking**, while minor changes (🟡) **might be breaking**:

| Crates |
|---------|
| 🔴 Making a crate that previously compiled for _stable_ require _nightly_. |
| 🔴 Removing Cargo features. |
| 🟡 Altering existing Cargo features. |

| Modules |
|---------|
| 🔴 Renaming / moving / removing any public items. |
| 🟡 Adding new public items, as this might break code that does `use your_crate::*`. |

| Structs |
|---------|
| 🔴 Adding private field when all current fields public. |
| 🔴 Adding public field when no private field exists. |
| 🟡 Adding or removing private fields when at least one already exists (before and after the change). |
| 🟡 Going from a tuple struct with all private fields (with at least one field) to a normal struct, or vice versa. |

| Enums |
|---------|
| 🔴 Adding new variants; can be mitigated with early `#[non_exhaustive]` [Reference](https://doc.rust-lang.org/reference/attributes/type_system.html#the-non_exhaustive-attribute) |
| 🔴 Adding new fields to a variant. |

| Traits |
|---------|
| 🔴 Adding a non-defaulted item, breaks all existing `impl T for S {}`. |
| 🔴 Any non-trivial change to item signatures, will affect either consumers or implementors. |
| 🔴 Implementing any "fundamental" trait, as _not_ implementing a fundamental trait already was a promise. |
| 🟡 Adding a defaulted item; might cause dispatch ambiguity with other existing trait. |
| 🟡 Adding a defaulted type parameter. |
| 🟡 Implementing any non-fundamental trait; might also cause dispatch ambiguity. |

| Inherent Implementations |
|---------|
| 🟡 Adding any inherent items; might cause clients to prefer that over trait fn and produce compile error. |

| Signatures in Type Definitions |
|---------|
| 🔴 Tightening bounds (e.g., `<T>` to `<T: Clone>`). |
| 🟡 Loosening bounds. |
| 🟡 Adding defaulted type parameters. |
| 🟡 Generalizing to generics. |

| Signatures in Functions |
|---------|
| 🔴 Adding / removing arguments. |
| 🟡 Introducing a new type parameter. |
| 🟡 Generalizing to generics. |

| Behavioral Changes |
|---------|
| 🔴 / 🟡 _Changing semantics might not cause compiler errors, but might make clients do wrong thing._ |

---

