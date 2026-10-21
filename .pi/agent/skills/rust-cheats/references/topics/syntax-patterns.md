# Syntax: patterns, match and destructuring

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 329–388.
Section context: Hello, Rust!.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

### Pattern Matching

Constructs found in `match` or `let` expressions, or function parameters.

| Example | Explanation |
|---------|-------------|
| `match m {}` | Initiate **pattern matching**, [Book](https://doc.rust-lang.org/book/ch06-02-match.html) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/flow_control/match.html) [Reference](https://doc.rust-lang.org/reference/expressions/match-expr.html) then use match arms, _c_. next table. |
| `let S(x) = get();`  | Notably, `let` also **destructures** [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/flow_control/match/destructuring.html) similar to the table below. |
|  ↳  `let S { x } = s;` | Only `x` will be bound to value `s.x`. |
|  ↳  `let (_, b, _) = abc;` | Only `b` will be bound to value `abc.1`. |
|  ↳  `let (a, ..) = abc;` | Ignoring 'the rest' also works. |
|  ↳  `let (.., a, b) = (1, 2);` | Specific bindings take precedence over 'the rest', here `a` is `1`, `b` is `2`. |
|  ↳  `let s @ S { x } = get();`  | Bind `s` to `S` while `x` is bnd. to `s.x`, **pattern binding**, [Book](https://doc.rust-lang.org/book/ch18-03-pattern-syntax.html#-bindings) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/flow_control/match/binding.html#binding) [Reference](https://doc.rust-lang.org/reference/patterns.html#identifier-patterns) _c_. below  **[Advanced]**  |
|  ↳  `let w @ t @ f = get();`  | Stores 3 copies of `get()` result in each `w`, `t`, `f`.  **[Advanced]**  |
|  ↳  `let (\|x\| x) = get();` | Pathological or-pattern,[See section](https://cheats.rs/#pattern-matching) **not** closure. **[Pitfall / intentionally wrong]**  Same as `let x = get();`  **[Advanced]**   |
| `let Ok(x) = f();` | **Won't** work  **[Pitfall / intentionally wrong]**  if p. can be **refuted**, [Reference](https://doc.rust-lang.org/reference/expressions/if-expr.html#if-let-expressions) use `let else` or `if let` instead. |
| `let Ok(x) = f();` | But can work if alternatives uninhabited, e.g., `f` returns `Result<T, !>`  **[Edition 1.82+]**  |
| `let Ok(x) = f() else {};`  | Try to assign [RFC](https://rust-lang.github.io/rfcs/3137-let-else.html) if not `else {}` w. must `break`, `return`, `panic!`, …  **[Edition 1.65+]**   **[Useful]**  |
| `if let Ok(x) = f() {}`  | Branch if pattern can be assigned (e.g., `enum` variant), syntactic sugar. ^(*)|
| `if let … && let … { }`  | **Let chains**, [Reference](https://doc.rust-lang.org/reference/expressions/if-expr.html#r-expr.if.chains.bindings) use more than binding w.o. nesting.  **[Edition '24]** |
| `while let Ok(x) = f() {}`  | Equiv.; here keep calling `f()`, run `{}` as long as _p._ can be assigned. |
| `fn f(S { x }: S)`  | Function param. also work like `let`, here `x` bound to `s.x` of `f(s)`.  **[Advanced]**  |

**Notes:**

^(*) Desugars to `match get() { Some(x) => {}, _ => () }`.

Pattern matching arms in `match` expressions. Left side of these arms can also be found in `let` expressions.

| Within Match Arm | Explanation |
|---------|-------------|
|  `E::A => {}` | Match enum variant `A`, _c_. **pattern matching**. [Book](https://doc.rust-lang.org/book/ch06-02-match.html) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/flow_control/match.html) [Reference](https://doc.rust-lang.org/reference/expressions/match-expr.html) |
|  `E::B ( .. ) => {}` | Match enum tuple variant `B`, ignoring any index. |
|  `E::C { .. } => {}` | Match enum struct variant `C`, ignoring any field. |
|  `S { x: 0, y: 1 } => {}` | Match _s._ with specific values (only `s` with `s.x` of `0` and `s.y` of `1`). |
|  `S { x: a, y: b } => {}` | Match _s._ with _any_  **[Pitfall / intentionally wrong]**  values and bind `s.x` to `a` and `s.y` to `b`. |
|  ↳  `S { x, y } => {}` | Same, but shorthand with `s.x` and `s.y` bound as `x` and `y` respectively. |
|  `S { .. } => {}` | Match struct with any values. |
|  `D => {}` | Match enum variant `E::D` if `D` in `use`. |
|  `D => {}` | Match anything, bind `D`; possibly false friend  **[Pitfall / intentionally wrong]**  of `E::D` if `D` not in `use`. |
|  `_ => {}` | Proper wildcard that matches anything / "all the rest". |
| `0 \| 1 => {}` | Pattern alternatives, **or-patterns**. [RFC](https://rust-lang.github.io/rfcs/2535-or-patterns.html)|
| ↳   `E::A \| E::Z => {}` | Same, but on enum variants. |
| ↳   `E::C {x} \| E::D {x} => {}` | Same, but bind `x` if all variants have it. |
| ↳   `Some(A \| B) => {}` | Same, can also match alternatives deeply nested. |
| ↳   `\|x\| x => {}` | **Pathological or-pattern**,[See section](https://cheats.rs/#pattern-matching) **[Pitfall / intentionally wrong]**  leading `\|` ignored, is just `x \| x`, thus `x`.  **[Advanced]**  |
| ↳   `\|x => {}` | Similar, leading `\|` ignored.  **[Advanced]**  |
|  `(a, 0) => {}` | Match tuple with any value for `a` and `0` for second. |
|  `[a, 0] => {}` | **Slice pattern**, [Reference](https://doc.rust-lang.org/reference/patterns.html#slice-patterns) [Link](https://doc.rust-lang.org/edition-guide/rust-2018/slice-patterns.html) match array with any value for `a` and `0` for second. |
|  ↳  `[1, ..] => {}` | Match array starting with `1`, any value for rest; **subslice pattern**.  [Reference](https://doc.rust-lang.org/reference/patterns.html#rest-patterns) [RFC](https://rust-lang.github.io/rfcs/2359-subslice-pattern-syntax.html) |
|  ↳  `[1, .., 5] => {}` | Match array starting with `1`, ending with `5`. |
|  ↳  `[1, x @ .., 5] => {}` | Same, but also bind `x` to slice representing middle (_c._ pattern binding).  |
|  ↳  `[a, x @ .., b] => {}` | Same, but match any first, last, bound as `a`, `b` respectively.  |
|  `1 .. 3 => {}` | **Range pattern**, [Book](https://doc.rust-lang.org/book/ch18-03-pattern-syntax.html#matching-ranges-of-values-with-) [Reference](https://doc.rust-lang.org/reference/patterns.html#range-patterns) here matches `1` and `2`; partially unstable.  **[Unstable / nightly]**  |
|  ↳  `1 ..= 3 => {}` | Inclusive range pattern, matches `1`, `2` and `3`. |
|  ↳  `1 .. => {}` | Open range pattern, matches `1` and any larger number.  |
| `x @ 1..=5 => {}` | Bind matched to `x`; **pattern binding**, [Book](https://doc.rust-lang.org/book/ch18-03-pattern-syntax.html#-bindings) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/flow_control/match/binding.html#binding) [Reference](https://doc.rust-lang.org/reference/patterns.html#identifier-patterns) here `x` would be `1` … `5`.  |
| ↳  `Err(x @ Error {..}) => {}` | Also works nested, here `x` binds to `Error`, esp. useful with `if` below. |
| `S { x } if x > 10 => {}`  | Pattern **match guards**, [Book](https://doc.rust-lang.org/book/ch18-03-pattern-syntax.html#extra-conditionals-with-match-guards) [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/flow_control/match/guard.html#guards) [Reference](https://doc.rust-lang.org/reference/expressions/match-expr.html#match-guards) condition must be true as well to match. |

