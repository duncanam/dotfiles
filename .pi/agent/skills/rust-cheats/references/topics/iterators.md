# Standard library: iterator construction, loops, borrowing and interoperability

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 3557–3812.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

## Iterators

Processing elements in a collection.

### Basics

There are, broadly speaking, four _styles_ of collection iteration:

| Style | Description |
| --- | --- |
| `for x in c { ... }` | _Imperative_, useful w. side effects, interdepend., or need to break flow early.  |
| `c.iter().map().filter()` | _Functional_, often much cleaner when only results of interest. |
| `c_iter.next()` | _Low-level_, via explicit `Iterator::next()` [std](https://doc.rust-lang.org/std/iter/trait.Iterator.html#tymethod.next) invocation.  **[Advanced]**  |
| `c.get(n)` | _Manual_, bypassing official iteration machinery. |

> **Opinion**  **[Opinion]**  — Functional style is often easiest to follow, but don't hesitate to use  `for` if your `.iter()` chain turns messy. When implementing containers iterator support would be ideal, but when in a hurry it can sometimes be more practical to just implement `.len()` and `.get()` and move on with your life.

### Obtaining

**Basics**

Assume you have a collection `c` of type `C` you want to use:

* **`c.into_iter()`**^(1)  — Turns collection `c` into an **`Iterator`** [std](https://doc.rust-lang.org/std/iter/trait.Iterator.html) `i` and **consumes**^(2) `c`. _Std._ way to get iterator.
* **`c.iter()`** — Courtesy method **some** collections provide, returns **borrowing** Iterator, doesn't consume `c`.
* **`c.iter_mut()`** — Same, but **mutably borrowing** Iterator that allow collection to be changed.

**The Iterator**

Once you have an `i`:

* **`i.next()`** — Returns `Some(x)` next element `c` provides, or `None` if we're done.

**For Loops**

* **`for x in c {}`** — Syntactic sugar, calls `c.into_iter()` and loops `i` until `None`.

**Notes:**

^(1) Requires **`IntoIterator`** [std](https://doc.rust-lang.org/std/iter/trait.IntoIterator.html) for `C` to be implemented. Type of item depends on what `C` was.

^(2) If it looks as if it doesn't consume `c` that's because type was `Copy`. For example, if you call `(&c).into_iter()` it will invoke `.into_iter()` on `&c` (which will consume a _copy_ of the reference and turn it into an Iterator), but the original `c` remains untouched.

### Creating

**Essentials**

Let's assume you have a `struct Collection<T> {}` you authored. You should also implement:

* **`struct IntoIter<T> {}`** — Create a struct to hold your iteration status (e.g., an index) for value iteration.
* **`impl Iterator for IntoIter<T> {}`** — Implement `Iterator::next()` so it can produce elements.

**Diagram 90 — textual relationships:**

```text
relationships: entry [wide]: type [generic, dotted]: Collection<T>
```

**Diagram 91 — textual relationships:**

```text
relationships:
  entry [wide]:
    type [generic, dotted]: IntoIter<T>
    trait implementation:
      ⌾
      Iterator
    associated type [grayed]: Item = T;
```

> At this point you have something that can behave as an **Iterator**, [std](https://doc.rust-lang.org/std/iter/trait.Iterator.html) but no way of actually obtaining it. See the next tab for how that usually works.

### For Loops

**Native Loop Support**

Many users would expect your collection to _just work_ in `for` loops. You need to implement:

* **`impl IntoIterator for Collection<T> {}`** — Now `for x in c {}` works.
* **`impl IntoIterator for &Collection<T> {}`** — Now `for x in &c {}` works.
* **`impl IntoIterator for &mut Collection<T> {}`** — Now `for x in &mut c {}` works.

**Diagram 92 — textual relationships:**

```text
relationships:
  entry [wide]:
    type [generic, dotted]: Collection<T>
    trait implementation:
      ⌾
      IntoIterator
    associated type [grayed]: Item = T;
    associated type [grayed]: To = IntoIter<T>
    note:
      Iterate over
      T
      .
```

**Diagram 93 — textual relationships:**

```text
relationships:
  entry [wide]:
    type [generic, dotted, grayed]: &Collection<T>
    trait implementation:
      ⌾
      IntoIterator
    associated type [grayed]: Item = &T;
    associated type [grayed]: To = Iter<T>
    note:
      Iterate over
      &T
      .
```

**Diagram 94 — textual relationships:**

```text
relationships:
  entry [wide]:
    type [generic, dotted, grayed]: &mut Collectn<T>
    trait implementation:
      ⌾
      IntoIterator
    associated type [grayed]: Item = &mut T;
    associated type [grayed]: To = IterMut<T>
    note:
      Iterate over
      &mut T
      .
```

> As you can see, the **IntoIterator** [std](https://doc.rust-lang.org/std/iter/trait.IntoIterator.html) trait is what actually connects your collection with the **IntoIter** struct you created in the previous tab. The two siblings of **IntoIter** (**Iter** and **IterMut**) are discussed in the next tab.

### Borrowing

**Shared & Mutable Iterators**

In addition, if you want your collection to be useful when borrowed you should implement:

* **`struct Iter<T> {}`** — Create struct holding `&Collection<T>` state for shared iteration.
* **`struct IterMut<T> {}`** — Similar, but holding `&mut Collection<T>` state for mutable iteration.
* **`impl Iterator for Iter<T> {}`** — Implement shared iteration.
* **`impl Iterator for IterMut<T> {}`** — Implement mutable iteration.

Also you might want to add convenience methods:

- `Collection::iter(&self) -> Iter`,
- `Collection::iter_mut(&mut self) -> IterMut`.

**Diagram 95 — textual relationships:**

```text
relationships:
  entry [wide]:
    type [generic, dotted]: Iter<T>
    trait implementation:
      ⌾
      Iterator
    associated type [grayed]: Item = &T;
```

**Diagram 96 — textual relationships:**

```text
relationships:
  entry [wide]:
    type [generic, dotted]: IterMut<T>
    trait implementation:
      ⌾
      Iterator
    associated type [grayed]: Item = &mut T;
```

> The code for borrowing interator support is basically just a repetition of the previous steps with a slightly different types, e.g., `&T` vs `T`.

### Interoperability

**Iterator Interoperability**

To allow **3^(rd) party iterators** to 'collect into' your collection implement:

* **`impl FromIterator for Collection<T> {}`** — Now `some_iter.collect::<Collection<_>>()` works.
* **`impl Extend for Collection<T> {}`** — Now `c.extend(other)` works.

In addition, also consider adding the extra traits from **`std::iter`** [std](https://doc.rust-lang.org/std/iter/index.html#) to your previous structs:

**Diagram 97 — textual relationships:**

```text
relationships:
  entry [wide]:
    type [generic, dotted]: Collection<T>
    trait implementation:
      ⌾
      FromIterator
    trait implementation:
      ⌾
      Extend
```

**Diagram 98 — textual relationships:**

```text
relationships:
  entry [wide]:
    type [generic, dotted]: IntoIter<T>
    trait implementation:
      ⌾
      DoubleEndedIt… 
    trait implementation:
      ⌾
      ExactSizeIt… 
    trait implementation:
      ⌾
      FusedIterator
```

**Diagram 99 — textual relationships:**

```text
relationships:
  entry [wide]:
    type [generic, dotted]: Iter<T>
    trait implementation:
      ⌾
      DoubleEndedIt… 
    trait implementation:
      ⌾
      ExactSizeIt… 
    trait implementation:
      ⌾
      FusedIterator
```

**Diagram 100 — textual relationships:**

```text
relationships:
  entry [wide]:
    type [generic, dotted]: IterMut<T>
    trait implementation:
      ⌾
      DoubleEndedIt… 
    trait implementation:
      ⌾
      ExactSizeIt… 
    trait implementation:
      ⌾
      FusedIterator
```

> Writing collections can be work. The good news is, if you followed all
> these steps your collections will feel like _first class citizens_.

