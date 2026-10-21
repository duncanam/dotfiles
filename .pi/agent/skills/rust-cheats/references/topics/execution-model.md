# Ownership: abstract machine and language sugar

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 534–611.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

# Behind the Scenes

Arcane knowledge that may do terrible things to your mind, highly recommended.

## The Abstract Machine

Like `C` and `C++`, Rust is based on an _abstract machine_.

### Overview

**Diagram 1 — textual relationships:**

```text
relationships:
  entry: machine [bad]: Rust
  →
  entry: machine [bad]: CPU
  note: **[Pitfall / intentionally wrong]** Misleading.
```

**Diagram 2 — textual relationships:**

```text
relationships:
  entry: machine [good]: Rust
  →
  entry [diagram-width=120px]: machine [good]: Abstract Machine
  →
  entry: machine [good]: CPU
  note: Correct.
```

With rare exceptions you are never 'allowed to reason' about the actual CPU. You write code for an _abstracted_ CPU. Rust then (sort of) understands what you want, and translates that into actual RISC-V / x86 / … machine code.

This _abstract machine_
- is not a runtime, and does not have any runtime overhead, but is a _computing model abstraction_,
- contains concepts such as memory regions (_stack_, …), execution semantics, …
- _knows_ and _sees_ things your CPU might not care about,
- is de-facto a contract between you and the compiler,
- and **exploits all of the above for optimizations**.

### Misconceptions

On the left things people may incorrectly assume they _should get away with_ if Rust targeted CPU directly. On the right things you'd interfere with if in reality if you violate the AM contract.

| Without AM | With AM |
|---------|-------------|
| `0xffff_ffff` would make a valid `char`.  **[Pitfall / intentionally wrong]**  | AM may exploit _'invalid'_ bit patterns to pack unrelated data.  |
| `0xff` and `0xff` are same pointer.  **[Pitfall / intentionally wrong]**  | AM pointers can have **provenance** [std](https://doc.rust-lang.org/std/ptr/index.html#provenance) for optimization.  |
| Any r/w on pointer `0xff` always fine.  **[Pitfall / intentionally wrong]**  | AM may issue cache-friendly ops since _'no read possible'_.  |
| Reading un-init just gives random value.  **[Pitfall / intentionally wrong]**  | AM _'knows'_ read impossible, may remove all related code.  |
| Data race just gives random value.  **[Pitfall / intentionally wrong]**  | AM may split R/W, produce _impossible_ value. [See section](https://cheats.rs/#atomics-cache)  |
| Null ref. is just `0x0` in some register.  **[Pitfall / intentionally wrong]**  | Holding `0x0` in reference summons Cthulhu.  |

> This table is only to outline what the AM does. Unlike C or C++, Rust never lets you do the wrong thing unless you force it with `unsafe`. [See section](https://cheats.rs/#unsafe-unsound-undefined)

## Language Sugar

If something works that "shouldn't work now that you think about it", it might be due to one of these.

| Name | Description |
|--------| -----------|
| **Coercions** [Nomicon](https://doc.rust-lang.org/nightly/nomicon/coercions.html) | _Weakens_ types to match signature, e.g., `&mut T` to `&T`; _c_. _type conv._ [See section](https://cheats.rs/#type-conversions)  |
| **Deref** [Nomicon](https://doc.rust-lang.org/nightly/nomicon/vec-deref.html) [Link](https://stackoverflow.com/questions/28519997/what-are-rusts-exact-auto-dereferencing-rules) | [Derefs](https://doc.rust-lang.org/std/ops/trait.Deref.html) `x: T` until `*x`, `**x`, … compatible with some target `S`. |
| **Prelude** [std](https://doc.rust-lang.org/std/prelude/index.html) | Automatic import of basic items, e.g., `Option`, `drop()`, …
| **Reborrow** [Link](https://quinedot.github.io/rust-learning/st-reborrow.html) | Since `x: &mut T` can't be copied; moves new `&mut *x` instead. |
| **Lifetime Elision** [Book](https://doc.rust-lang.org/book/ch10-03-lifetime-syntax.html#lifetime-elision) [Nomicon](https://doc.rust-lang.org/nightly/nomicon/lifetime-elision.html#lifetime-elision) [Reference](https://doc.rust-lang.org/reference/lifetime-elision.html#lifetime-elision) | Allows you to write `f(x: &T)`, instead of `f<'a>(x: &'a T)`, for brevity. |
| **Lifetime Extensions** [Link](https://blog.m-ou.se/super-let/)  [Reference](https://doc.rust-lang.org/reference/destructors.html#temporary-lifetime-extension) | In `let x = &tmp().f` and similar hold on to temporary past line. |
| **Method Resolution** [Reference](https://doc.rust-lang.org/reference/expressions/method-call-expr.html) | Derefs or borrow `x` until `x.f()` works. |
| **Match Ergonomics** [RFC](https://rust-lang.github.io/rfcs/2005-match-ergonomics.html) | Repeatedly deref. [scrutinee](https://doc.rust-lang.org/stable/reference/glossary.html#scrutinee) and adds `ref` and `ref mut` to bindings. |
| **Rvalue Static Promotion** [RFC](https://rust-lang.github.io/rfcs/1414-rvalue_static_promotion.html)   **[Advanced]**  | Makes refs. to constants `'static`, e.g., `&42`, `&None`, `&mut []`. |
| **Dual Definitions** [RFC](https://rust-lang.github.io/rfcs/1506-adt-kinds.html#tuple-structs)  **[Advanced]**  | Defining one (e.g., `struct S(u8)`) implicitly def. another (e.g., `fn S`).  |
| **Drop Hidden Flow** [Reference](https://doc.rust-lang.org/reference/destructors.html)  **[Advanced]**  | At end of blocks `{ ... }` or `_` assignment, may call `T::drop()`. [std](https://doc.rust-lang.org/std/ops/trait.Drop.html) |
| **Drop Not Callable** [std](https://doc.rust-lang.org/std/ops/trait.Drop.html)  **[Advanced]**  | Compiler forbids explicit `T::drop()` call, must use `mem::drop()`. [std](https://doc.rust-lang.org/std/mem/fn.drop.html) |
| **Auto Traits** [Reference](https://doc.rust-lang.org/reference/special-types-and-traits.html#auto-traits) | Always impl'ed for your types, closures, futures if possible. |

> **Opinion**  **[Opinion]**  — These features make your life easier _using_ Rust, but stand in the way of _learning_ it. If you want to develop a _genuine understanding_, spend some extra time exploring them.

