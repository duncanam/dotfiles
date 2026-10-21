# Ownership: moves, ownership and call stack

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 612–900.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

## Memory & Lifetimes

An illustrated guide to moves, references and lifetimes.

### Types & Moves

**Diagram 3 — textual state:**

```text
state:
  section header: Application Memory
  memory row:
    byte map: byte × 41
    values: value [t, byte2, hide, diagram-left=57px]: S(1)
    labels: label [diagram-right=10px]
    subtext: Application Memory
```

- Application memory is just array of bytes on low level.
- Operating environment usually segments that, amongst others, into:
    - **stack** (small, low-overhead memory,^(1) most _variables_ go here),
    - **heap** (large, flexible memory, but always handled via stack proxy like `Box<T>`),
    - **static** (most commonly used as resting place for `str` part of `&str`),
    - **code** (where bitcode of your functions reside).
- Most tricky part is tied to **how stack evolves**, which is **our focus**.

**Notes:**

^(1) For fixed-size values stack is trivially manageable: _take a few bytes more while you need them, discarded once you leave_. However, giving out pointers to these _transient_ locations form the very essence of why _lifetimes_ exist; and are the subject of the rest of this chapter.

**Diagram 4 — textual state:**

```text
state:
  section header: Variables
  memory row:
    byte map:
      byte × 7
      byte [t] × 2
      byte × 32
    values:
      value [t, byte2, hide, diagram-left=57px]: S(1)
      value [t, byte2, diagram-left=97.5px]: S(1)
    labels:
      label [byte2, hide, diagram-left=57px]: a
      label [byte2, diagram-left=97.5px]: t
    subtext: Variables
```

```
let t = S(1);
```


- Reserves memory location with name `t` of type `S` and the value `S(1)` stored inside.
- If declared with `let` that location lives on stack. ^(1)
- Note the **linguistic ambiguity**, in the term **_variable_**, it can mean the:
    1. **name** of the location in the source file ("rename that variable"),
    1. **location** in a compiled app, `0x7` ("tell me the address of that variable"),
    1. **value** contained within, `S(1)` ("increment that variable").
- Specifically towards the compiler `t` can mean **location of** `t`, here `0x7`, and **value within** `t`, here `S(1)`.

**Notes:**

^(1) Compare above,[See section](https://cheats.rs/#data-structures) true for fully synchronous code, but `async` stack frame might placed it on heap via runtime.

**Diagram 5 — textual state:**

```text
state:
  section header: Move Semantics
  memory row:
    byte map:
      byte × 3
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 32
    values: value [t, byte2, diagram-left=57px]: S(1)
    labels:
      label [byte2, diagram-left=57px]: a
      label [byte2, diagram-left=97.5px]: t
    subtext: Moves
```

```
let a = t;
```


- This will **move** value within `t` to location of `a`, or copy it, if `S` is `Copy`.
- After move location `t` is **invalid** and cannot be read anymore.
    - Technically the bits at that location are not really _empty_, but _undefined_.
    - If you still had access to `t` (via `unsafe`) they might still _look_ like valid `S`, but
    any attempt to use them as valid `S` is undefined behavior. [See section](https://cheats.rs/#unsafe-unsound-undefined)
- We do not cover `Copy` types explicitly here. They change the rules a bit, but not much:
    - They won't be dropped.
    - They never leave behind an 'empty' variable location.

**Diagram 6 — textual state:**

```text
state:
  section header: Type Safety
  memory row:
    byte map:
      byte × 11
      byte [t] × 2
      byte × 28
    values:
      FAILED [diagram-left=231.5px]: value [atomic, byte4]: M { … }
      DENIED [diagram-left=141px]: ⛔
    labels:
      label [byte2, diagram-left=57px]: 
      label [byte2, diagram-left=170px]: c
    subtext: Type Safety
```

```
let c: S = M::new();
```


- The **type of a variable** serves multiple important purposes, it:
    1. dictates how the underlying bits are to be interpreted,
    1. allows only well-defined operations on these bits
    1. prevents random other values or bits from being written to that location.
- Here assignment fails to compile since the bytes of `M::new()` cannot be converted to form of type `S`.
- **Conversions between types will _always_ fail** in general, **unless explicit rule allows it** (coercion, cast, …).

**Diagram 7 — textual state:**

```text
state:
  section header: Scope & Drop
  memory row:
    byte map:
      byte × 3
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 28
    values:
      drop:
        value [t, byte2, diagram-left=57px]: S(1)
        drop arrow [diagram-left=37px]: ▼
      value [t, byte2, hide, diagram-left=87.5px]: C(2)
      drop:
        value [t, byte2, diagram-left=128px]: S(2)
        drop arrow [diagram-left=107px]: ▼
      FAILED [diagram-left=-27.5px]: value [t, byte2, diagram-left=128px]: S(3)
    labels:
      label [byte2, diagram-left=57px]: 
      label [byte2, diagram-left=97.5px]: t
    subtext: Scope & Drop
```

```
{
    let mut c = S(2);
    c = S(3);  // <- Drop called on `c` before assignment.
    let t = S(1);
    let a = t;
}   // <- Scope of `a`, `t`, `c` ends here, drop called on `a`, `c`.
```


- Once the 'name' of a non-vacated variable goes out of (drop-)**scope**, the contained value is **dropped**.
    - Rule of thumb: execution reaches point where name of variable leaves `{}`-block it was defined in
    - In detail more tricky, esp. temporaries, …
- Drop also invoked when new value assigned to existing variable location.
- In that case **`Drop::drop()`** is called on the location of that value.
    - In the example above `drop()` is called on `a`, twice on `c`, but not on `t`.
- Most non-`Copy` values get dropped most of the time; exceptions include `mem::forget()`, `Rc` cycles, `abort()`.

### Call Stack

**Diagram 8 — textual state:**

```text
state:
  section header: Stack Frame
  memory row:
    byte map:
      byte × 3
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 32
    values: value [t, byte2, diagram-left=57px]: S(1)
    labels:
      label [byte2, diagram-left=57px]: a
      label [byte2, diagram-left=97.5px]: x
    subtext: Function Boundaries
```

```
fn f(x: S) { … }

let a = S(1); // <- We are here
f(a);
```


- When a **function is called**, memory for parameters (and return values) are reserved on stack.^(1)
- Here before `f` is invoked value in `a` is moved to 'agreed upon' location on stack, and during `f` works like 'local variable' `x`.

**Notes:**

^(1) Actual location depends on calling convention, might practically not end up on stack at all, but that doesn't change mental model.

**Diagram 9 — textual state:**

```text
state:
  memory row:
    byte map:
      byte × 3
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 28
    values: value [t, byte2, diagram-left=131px]: S(1)
    labels:
      label [byte2, diagram-left=57px]: a
      label [byte2, diagram-left=97.5px]: x
      label [byte2, diagram-left=136px]: x
    subtext: Nested Functions
```

```
fn f(x: S) {
    if once() { f(x) } // <- We are here (before recursion)
}

let a = S(1);
f(a);
```


- **Recursively calling** functions, or calling other functions, likewise extends the stack frame.
- Nesting too many invocations (esp. via unbounded recursion) will cause stack to grow, and eventually to overflow, terminating the app.

**Diagram 10 — textual state:**

```text
state:
  section header: Validity of Variables
  memory row:
    byte map:
      byte × 3
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 2
      byte [t, diagram-opacity=0.4]
      byte [atomic] × 4
      byte × 25
    values:
      value [t, byte2, diagram-left=131px]: S(1)
      value [atomic, byte4, diagram-left=190px]: M { }
    labels:
      label [byte2, diagram-left=57px]: a
      label [byte2, diagram-left=97.5px]: x
      label [byte2, diagram-left=174px]: m
    subtext: Repurposing Memory
```

```
fn f(x: S) {
    if once() { f(x) }
    let m = M::new() // <- We are here (after recursion)
}

let a = S(1);
f(a);
```


- Stack that previously held a certain type will be repurposed across (even within) functions.
- Here, recursing on `f` produced second `x`, which after recursion was partially reused for `m`.

> Key take away so far, there are multiple ways how memory locations that previously held a valid value of a certain type stopped doing so in the meantime.
> As we will see shortly, this has implications for pointers.

