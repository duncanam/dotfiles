# Ownership: function lifetimes and advanced borrowing

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 1284–1695.
Section context: Memory & Lifetimes.
**Read first:** [borrowing](borrowing.md) (including their prerequisites; reuse complete reads).
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

### Lifetimes in Functions

**Diagram 19 — textual state:**

```text
state:
  memory row:
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [atomic] × 4
      byte
      byte [t] × 2
      byte × 28
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 3
      byte [ptr] × 4
      byte × 27
    byte map:
      byte × 6
      byte [t, borrowed] × 2
      byte × 2
      byte [t, borrowed] × 2
      byte × 3
      byte [ptr] × 4
      byte
      byte [ptr] × 4
      byte
      byte [ptr] × 4
      byte × 13
    values:
      value [t, byte2, hide, diagram-left=38px]: S(0)
      value [t, byte2, diagram-left=79px]: S(1)
      value [t, byte2, diagram-left=119px]: S(2)
      value [ptr, byte4, diagram-left=177px]: ?
      value [ptr, byte4, diagram-left=201px]: 0x6
      value [ptr, byte4, diagram-left=224px]: 0xa
    labels:
      label [byte2, hide, diagram-left=37px]: a
      label [byte4, diagram-left=59px]: b
      label [byte2, diagram-left=81px]: c
      label [byte4, diagram-left=139px]: r
      label [byte4, diagram-left=165px]: x
      label [byte4, diagram-left=188px]: y
    subtext: Function Parameters
```

```
fn f(x: &S, y:&S) -> &u8 { … }

let b = S(1);
let c = S(2);

let r = f(&b, &c);
```


- When calling functions that take and return references two interesting things happen:
    - The used local variables are placed in a borrowed state,
    - But it is during compilation unknown which address will be returned.

**Diagram 20 — textual state:**

```text
state:
  memory row:
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [atomic] × 4
      byte
      byte [t] × 2
      byte × 28
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 3
      byte [ptr] × 4
      byte × 27
    byte map:
      byte × 2
      byte [t] × 2
      byte × 2
      byte [t, maybe-borrowed] × 2
      byte × 2
      byte [t, maybe-borrowed] × 2
      byte × 3
      byte [ptr] × 4
      byte × 23
    values:
      value [t, byte2, hide, diagram-left=38px]: S(0)
      value [t, byte2, diagram-left=79px]: S(1)
      value [t, byte2, diagram-left=119px]: S(2)
      value [ptr, byte4, diagram-left=177px]: ?
      value [ptr, byte4, hide, diagram-left=201px]: 0x6
      value [ptr, byte4, hide, diagram-left=224px]: 0xa
    labels:
      label [byte2, diagram-left=37px]: a
      label [byte4, diagram-left=59px]: b
      label [byte2, diagram-left=81px]: c
      label [byte4, diagram-left=139px]: r
      label [byte4, hide, diagram-left=165px]: x
      label [byte4, hide, diagram-left=188px]: y
    subtext: Problem of 'Borrowed' Propagation
```

```
let b = S(1);
let c = S(2);

let r = f(&b, &c);

let a = b;   // Are we allowed to do this?
let a = c;   // Which one is _really_ borrowed?

print_byte(r);
```


- Since `f` can return only one address, not in all cases `b` and `c` need to stay locked.
- In many cases we can get quality-of-life improvements.
    - Notably, when we know one parameter _couldn't_ have been used in return value anymore.

**Diagram 21 — textual state:**

```text
state:
  memory row:
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [atomic] × 4
      byte
      byte [t] × 2
      byte × 28
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 3
      byte [ptr] × 4
      byte × 27
    arrows: arrow [diagram-left=210px, diagram-width=102px]: tip: ▼
    byte map:
      byte × 2
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 2
      byte [t, borrowed] × 2
      byte × 3
      byte [ptr] × 4
      byte × 23
    values:
      value [t, byte2, diagram-left=38px]: S(1)
      value [t, byte2, hide, diagram-left=79px]: S(1)
      value [t, byte2, diagram-left=119px]: S(2)
      value [ptr, byte4, diagram-left=177px]: y + _
      value [ptr, byte4, hide, diagram-left=201px]: 0x6
      value [ptr, byte4, hide, diagram-left=224px]: 0xa
    labels:
      label [byte2, diagram-left=37px]: a
      label [byte4, diagram-left=59px]: b
      label [byte2, diagram-left=81px]: c
      label [byte4, diagram-left=139px]: r
      label [byte4, hide, diagram-left=165px]: x
      label [byte4, hide, diagram-left=188px]: y
    subtext: Lifetimes Propagate Borrowed State
```

```
fn f<'b, 'c>(x: &'b S, y: &'c S) -> &'c u8 { … }

let b = S(1);
let c = S(2);

let r = f(&b, &c); // We know returned reference is `c`-based, which must stay locked,
                   // while `b` is free to move.

let a = b;

print_byte(r);
```


- Lifetime parameters in signatures, like `'c` above, solve that problem.
- Their primary purpose is:
    - **outside the function**, to explain based on which input address an output address could be generated,
    - **within the function**, to guarantee only addresses that live at least `'c` are assigned.
- The actual lifetimes `'b`, `'c` are transparently picked by the compiler at **call site**, based on the borrowed variables the developer gave.
- They are **not** equal to the _scope_ (which would be LOC from initialization to destruction) of `b` or `c`, but only a minimal subset of their scope called _lifetime_, that is, a minmal set of LOC based on how long `b` and `c` need to be borrowed to perform this call and use the obtained result.
- In some cases, like if `f` had `'c: 'b` instead, we still couldn't distinguish and both needed to stay locked.

**Diagram 22 — textual state:**

```text
state:
  memory row:
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [atomic] × 4
      byte
      byte [t] × 2
      byte × 28
    byte map [past]:
      byte × 6
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 3
      byte [ptr] × 4
      byte × 27
    byte map:
      byte × 2
      byte [t] × 2
      byte × 6
      byte [t] × 2
      byte × 30
    values:
      value [t, byte2, diagram-left=38px]: S(2)
      value [t, byte2, hide, diagram-left=79px]: S(1)
      value [t, byte2, hide, diagram-left=119px]: S(2)
      value [ptr, byte4, hide, diagram-left=177px]: y + 1
      value [ptr, byte4, hide, diagram-left=201px]: 0x6
      value [ptr, byte4, hide, diagram-left=224px]: 0xa
    labels:
      label [byte2, diagram-left=37px]: a
      label [byte4, hide, diagram-left=59px]: b
      label [byte2, diagram-left=81px]: c
      label [byte4, hide, diagram-left=139px]: r
      label [byte4, hide, diagram-left=165px]: x
      label [byte4, hide, diagram-left=188px]: y
    subtext: Unlocking
```

```
let mut c = S(2);

let r = f(&c);
let s = r;
                    // <- Not here, `s` prolongs locking of `c`.

print_byte(s);

let a = c;          // <- But here, no more use of `r` or `s`.


```

- A variable location is _unlocked_ again once the last use of any reference that may point to it ends.

### Advanced [Advanced]

**Diagram 23 — textual state:**

```text
state:
  memory row:
    arrows:
      arrow [diagram-left=53px, diagram-width=92px]: tip: ▼
      arrow [diagram-left=57px, diagram-width=104px]: tip: ▼
      arrow [diagram-left=-155px, diagram-width=320px, diagram-top=-5px, diagram-border-style=dashed]
    byte map:
      byte × 2
      byte [t] × 2
      byte × 2
      byte [ptr] × 4
      byte × 2
      byte [ptr] × 4
      byte × 2
      byte [ptr] × 4
      byte × 20
    values:
      value [t, byte2, diagram-left=38px]: S(1)
      value [ptr, byte4, diagram-left=80px]: 0x2
      value [ptr, byte4, diagram-left=120px]: 0x6
      value [ptr, byte4, diagram-left=162px]: 0x2
    labels:
      label [byte2, diagram-left=37px]: a
      label [byte4, diagram-left=79px]: ra
      label [byte2, diagram-left=139px]: rb
      label [byte2, diagram-left=216px]: rval
    subtext: References to References
```

```
// Return short ('b) reference
fn f1sr<'b, 'a>(rb: &'b     &'a     S) -> &'b     S { *rb }
fn f2sr<'b, 'a>(rb: &'b     &'a mut S) -> &'b     S { *rb }
fn f3sr<'b, 'a>(rb: &'b mut &'a     S) -> &'b     S { *rb }
fn f4sr<'b, 'a>(rb: &'b mut &'a mut S) -> &'b     S { *rb }

// Return short ('b) mutable reference.
// f1sm<'b, 'a>(rb: &'b     &'a     S) -> &'b mut S { *rb } // M
// f2sm<'b, 'a>(rb: &'b     &'a mut S) -> &'b mut S { *rb } // M
// f3sm<'b, 'a>(rb: &'b mut &'a     S) -> &'b mut S { *rb } // M
fn f4sm<'b, 'a>(rb: &'b mut &'a mut S) -> &'b mut S { *rb }

// Return long ('a) reference.
fn f1lr<'b, 'a>(rb: &'b     &'a     S) -> &'a     S { *rb }
// f2lr<'b, 'a>(rb: &'b     &'a mut S) -> &'a     S { *rb } // L
fn f3lr<'b, 'a>(rb: &'b mut &'a     S) -> &'a     S { *rb }
// f4lr<'b, 'a>(rb: &'b mut &'a mut S) -> &'a     S { *rb } // L

// Return long ('a) mutable reference.
// f1lm<'b, 'a>(rb: &'b     &'a     S) -> &'a mut S { *rb } // M
// f2lm<'b, 'a>(rb: &'b     &'a mut S) -> &'a mut S { *rb } // M
// f3lm<'b, 'a>(rb: &'b mut &'a     S) -> &'a mut S { *rb } // M
// f4lm<'b, 'a>(rb: &'b mut &'a mut S) -> &'a mut S { *rb } // L

// Now assume we have a `ra` somewhere
let mut ra: &'a mut S = …;

let rval = f1sr(&&*ra);       // OK
let rval = f2sr(&&mut *ra);
let rval = f3sr(&mut &*ra);
let rval = f4sr(&mut ra);

//  rval = f1sm(&&*ra);       // Would be bad, since rval would be mutable
//  rval = f2sm(&&mut *ra);   // reference obtained from broken mutability
//  rval = f3sm(&mut &*ra);   // chain.
let rval = f4sm(&mut ra);

let rval = f1lr(&&*ra);
//  rval = f2lr(&&mut *ra);   // If this worked we'd have `rval` and `ra` …
let rval = f3lr(&mut &*ra);
//  rval = f4lr(&mut ra);     // … now (mut) aliasing `S` in compute below.

//  rval = f1lm(&&*ra);       // Same as above, fails for mut-chain reasons.
//  rval = f2lm(&&mut *ra);   //                    "
//  rval = f3lm(&mut &*ra);   //                    "
//  rval = f4lm(&mut ra);     // Same as above, fails for aliasing reasons.

// Some fictitious place where we use `ra` and `rval`, both alive.
compute(ra, rval);
```


**Notes:**

Here (`M`) means compilation fails because mutability error, (`L`) lifetime error.
Also, dereference `*rb` not strictly necessary, just added for clarity.

- `f_sr` cases always work, short reference (only living `'b`) can always be produced.
- `f_sm` cases usually fail simply because _mutable chain_ to `S` needed to return `&mut S`.
- `f_lr` cases can fail because returning `&'a S` from `&'a mut S` to caller means there would now exist two references (one mutable) to same `S` which is illegal.
- `f_lm` cases always fail for combination of reasons above.

> Note: This example is about the `f` functions, not `compute`. You can assume
> it to be defined as `fn compute(x: &S, y: &S) {}`. In that case the `ra` parameter would be automatically
> coerced [See section](https://cheats.rs/#type-conversions) from `&mut S` to `&S`, since you can't have a shared and a mutable
> reference to the same target.

**Diagram 24 — textual state:**

```text
state:
  memory row:
    byte map:
      byte × 2
      byte [t] × 2
      byte × 37
    values:
      drop:
        value [t, byte2, diagram-left=38px]: S(1)
        drop arrow [diagram-left=17px]: ▼
    labels: label [byte2, diagram-left=37px]: _
    subtext:
      Drop and
      _
```

```
{
    let f = |x, y| (S(x), S(y)); // Function returning two 'Droppables'.

    let (    x1, y) = f(1, 4);  // S(1) - Scope   S(4) - Scope
    let (    x2, _) = f(2, 5);  // S(2) - Scope   S(5) - Immediately
    let (ref x3, _) = f(3, 6);  // S(3) - Scope   S(6) - Scope

    println!("…");
}
```


**Notes:**

Here `Scope` means contained value lives until end of scope, i.e., past the `println!()`.

- Functions or expressions producing movable values must be handled by callee.
- Values stores in 'normal' bindings are kept until end of scope, then dropped.
- Values stored in `_` bindings are usually dropped right away.
- However, sometimes references (e.g., `ref x3`) can keep value (e.g., the tuple `(S(3), S(6))`) around for longer, so `S(6)`, being part of that tuple can only be dropped once reference to its `S(3)` sibling disappears).

**Notes:**

↕️ Examples expand by clicking.

---

