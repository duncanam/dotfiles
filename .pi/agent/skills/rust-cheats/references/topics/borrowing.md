# Ownership: references, pointers and lifetime basics

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 901–1283.
Section context: Memory & Lifetimes.
**Read first:** [moves-and-stack](moves-and-stack.md) (including their prerequisites; reuse complete reads).
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

### References & Pointers

**Diagram 11 — textual state:**

```text
state:
  section header [arrowed]: Reference Types
  memory row:
    arrows: arrow [diagram-left=62px, diagram-width=176px]: tip: ▼
    byte map:
      byte × 3
      byte [t] × 2
      byte × 6
      byte [ptr] × 4
      byte × 26
    values:
      value [t, byte2, diagram-left=57px]: S(1)
      value [ptr, byte4, diagram-left=171px]: 0x3
    labels:
      label [byte2, diagram-left=57px]: a
      label [byte4, diagram-left=171px]: r
    subtext: References as Pointers
```

```
let a = S(1);
let r: &S = &a;
```


- A **reference type** such as `&S` or `&mut S` can hold the **location of** some `s`.
- Here type `&S`, bound as name `r`, holds _location of_ variable `a` (`0x3`), that must be type `S`, obtained via `&a`.
- If you think of variable `c` as _specific location_, reference **`r` is a _switchboard for locations_**.
- The type of the reference, like all other types, can often be inferred, so we might omit it from now on:
    ```
    let r: &S = &a;
    let r = &a;
    ```


**Diagram 12 — textual state:**

```text
state:
  section header [arrowed]: (Mutable) References
  memory row:
    arrows: arrow [diagram-left=62px, diagram-width=176px]: tip: ▼
    byte map:
      byte × 3
      byte [t] × 2
      byte × 6
      byte [ptr] × 4
      byte × 2
      byte [t] × 2
      byte × 22
    values:
      value [t, byte2, diagram-left=57px]: S(2)
      value [ptr, byte4, diagram-left=171px]: 0x3
      value [t, byte2, diagram-left=213px]: S(1)
    labels:
      label [byte2, diagram-left=57px]: a
      label [byte4, diagram-left=171px]: r
      label [byte4, diagram-left=193px]: d
    subtext: Access to Non-Owned Memory
```

```
let mut a = S(1);
let r = &mut a;
let d = r.clone();  // Valid to clone (or copy) from r-target.
*r = S(2);          // Valid to set new S value to r-target.
```


- References can **read from**  (`&S`) and also **write to** (`&mut S`) locations they point to.
- The *dereference* `*r` means to use the **location `r` points to** (_not_ the _location of_ or _value within_ `r` itself)
- In the example, clone `d` is created from `*r`, and `S(2)` written to `*r`.
    - We assume `S` implements `Clone`, and `r.clone()` clones target-of-`r`, not `r` itself.
    - On assignment `*r = …` old value in location also dropped (not shown above).

**Diagram 13 — textual state:**

```text
state:
  memory row:
    arrows: arrow [diagram-left=62px, diagram-width=176px]: tip: ▼
    byte map:
      byte × 3
      byte [t] × 2
      byte × 6
      byte [ptr] × 4
      byte × 2
      byte [t] × 2
      byte × 22
    values:
      value [t, byte2, hide, diagram-left=57px]: S(2)
      value [ptr, byte4, diagram-left=171px]: 0x3
      value [atomic, byte4, diagram-top=-36px, diagram-left=20px]: M { x }
      DENIED [diagram-left=-71px, diagram-top=-36px]: ⛔
      DENIED [diagram-left=-131px]: ⛔
    labels:
      label [byte2, diagram-left=57px]: a
      label [byte4, diagram-left=171px]: r
      label [byte4, diagram-left=193px]: d
    subtext: References Guard Referents
```

```
let mut a = …;
let r = &mut a;
let d = *r;       // Invalid to move out value, `a` would be empty.
*r = M::new();    // invalid to store non S value, doesn't make sense.
```


- While bindings guarantee to always _hold_ valid data, references guarantee to always _point to_ valid data.
- Esp. `&mut T` must provide same guarantees as variables, and some more as they can't dissolve the target:
    - They do **not allow writing invalid** data.
    - They do **not allow moving out** data (would leave target empty w/o owner knowing).

**Diagram 14 — textual state:**

```text
state:
  memory row:
    arrows: arrow [diagram-left=62px, diagram-width=176px, diagram-border-color=red]: tip [diagram-color=red]: ▼
    byte map:
      byte × 11
      byte [ptr] × 4
      byte × 26
    values:
      value [t, byte2, hide, diagram-left=57px]: C(2)
      value [ptr, byte4, unsafe, diagram-left=171px]: 0x3
    labels:
      label [byte2, hide, diagram-left=57px]: c
      label [byte4, diagram-left=171px]: p
    subtext: Raw Pointers
```

```
let p: *const S = questionable_origin();
```


- In contrast to references, pointers come with almost no guarantees.
- They may point to invalid or non-existent data.
- Dereferencing them is `unsafe`, and treating an invalid `*p` as if it were valid is undefined behavior. [See section](https://cheats.rs/#unsafe-unsound-undefined)

### Lifetime Basics

**Diagram 15 — textual state:**

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
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 3
      byte [ptr] × 4
      byte × 23
    values:
      value [t, byte2, hide, diagram-left=57px]: C(2)
      value [ptr, byte4, hide, diagram-left=171px]: 0x3
    labels
    subtext: "Lifetime" of Things
```

- Every entity in a program has some (temporal / spatial) extent where it is relevant, i.e., _alive_.
- Loosely speaking, this _alive time_ can be^(1)
    1. the **LOC** (lines of code) where an **item is available** (e.g., a module name).
    1. the **LOC** between when a _location_ is **initialized** with a value, and when the location is **abandoned**.
    1. the **LOC** between when a location is first **used in a certain way**, and when that **usage stops**.
    1. the **LOC (or actual time)** between when a _value_ is created, and when that value is dropped.
- Within the rest of this section, we will refer to the items above as the:
    1. **scope** of that item, irrelevant here.
    1. **scope** of that variable or location.
    1. **lifetime**^(2) of that usage.
    1. **lifetime** of that value, might be useful when discussing open file descriptors, but also irrelevant here.
- Likewise, lifetime parameters in code, e.g., `r: &'a S`, are
    - concerned with LOC any **location r _points to_** needs to be accessible or locked;
    - unrelated to the 'existence time' (as LOC) of `r` itself (well, it needs to exist shorter, that's it).
- `&'static S` means address must be _valid during all lines of code_.

> ^(1) There is sometimes ambiguity in the docs differentiating the various _scopes_ and _lifetimes_.
> We try to be pragmatic here, but suggestions are welcome.
>
> ^(2) _Live lines_ might have been a more appropriate term …

**Diagram 16 — textual state:**

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
    arrows: arrow [diagram-left=192px, diagram-width=120px]: tip: ▼
    byte map:
      byte × 10
      byte [t] × 2
      byte × 3
      byte [ptr] × 4
      byte × 23
    values:
      value [t, byte2, hide, diagram-left=38px]: S(0)
      value [t, byte2, hide, diagram-left=79px]: S(1)
      value [t, byte2, diagram-left=119px]: S(2)
      value [ptr, byte4, diagram-left=177px]: 0xa
    labels:
      label [byte2, hide, diagram-left=37px]: a
      label [byte2, hide, diagram-left=78px]: b
      label [byte2, diagram-left=118px]: c
      label [byte4, diagram-left=177px]: r
    subtext:
      Meaning of
      r: &'c S
```

- Assume you got a `r: &'c S` from somewhere it means:
    - `r` holds an address of some `S`,
    - any address `r` points to must and will exist for at least `'c`,
    - the variable `r` itself cannot live longer than `'c`.

**Diagram 17 — textual state:**

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
    arrows: arrow [diagram-left=118px, diagram-width=193px]: tip: ▼
    byte map:
      byte × 2
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 2
      byte [t] × 2
      byte × 3
      byte [ptr] × 4
      byte × 23
    values:
      value [t, byte2, diagram-left=38px]: S(0)
      value [t, byte2, diagram-left=79px]: S(3)
      value [t, byte2, diagram-left=119px]: S(2)
      value [ptr, byte4, diagram-left=177px]: 0x6
      DENIED [diagram-left=-125px, diagram-top=-25px]: ⛔
    labels:
      label [byte2, diagram-left=37px]: a
      label [byte2, diagram-left=78px]: b
      label [byte2, diagram-left=118px]: c
      label [byte4, diagram-left=177px]: r
    subtext: Typelikeness of Lifetimes
```

```
{
    let b = S(3);
    {
        let c = S(2);
        let r: &'c S = &c;      // Does not quite work since we can't name lifetimes of local
        {                       // variables in a function body, but very same principle applies
            let a = S(0);       // to functions next page.

            r = &a;             // Location of `a` does not live sufficient many lines -> not ok.
            r = &b;             // Location of `b` lives all lines of `c` and more -> ok.
        }
    }
}
```


- Assume you got a `mut r: &mut 'c S` from somewhere.
    - That is, a mutable location that can hold a mutable reference.
- As mentioned, that reference must guard the targeted memory.
- However, the **`'c` part**, like a type, also **guards what is allowed into `r`**.
- Here assigning `&b` (`0x6`) to `r` is valid, but `&a` (`0x3`) would not, as only `&b` lives equal or longer than `&c`.

**Diagram 18 — textual state:**

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
    arrows: arrow [diagram-left=118px, diagram-width=193px]: tip: ▼
    byte map:
      byte × 6
      byte [t, borrowed] × 2
      byte × 7
      byte [ptr] × 4
      byte × 23
    values:
      value [t, byte2, hide, diagram-left=38px]: S(0)
      value [t, byte2, diagram-left=79px]
      value [t, byte2, hide, diagram-left=119px]: S(2)
      value [ptr, byte4, diagram-left=177px]: 0x6
      FAILED [diagram-left=-40px]: value [t, bytes]: S(4)
      DENIED [diagram-left=-83px]: ⛔
    labels:
      label [byte2, hide, diagram-left=37px]: a
      label [byte2, diagram-left=78px]: b
      label [byte2, hide, diagram-left=118px]: c
      label [byte4, hide, diagram-left=177px]: 
    subtext: Borrowed State
```

```
let mut b = S(0);
let r = &mut b;

b = S(4);   // Will fail since `b` in borrowed state.

print_byte(r);
```


- Once the address of a variable is taken via `&b` or `&mut b` the variable is marked as **borrowed**.
- While borrowed, the content of the address cannot be modified anymore via original binding `b`.
- Once address taken via `&b` or `&mut b` stops being used (in terms of LOC) original binding `b` works again.

