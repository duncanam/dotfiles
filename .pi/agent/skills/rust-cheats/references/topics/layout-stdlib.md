# Layout: cells, collections, strings and shared ownership layout

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 2455–3170.
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

## Standard Library Types

Rust's standard library combines the above primitive types into useful types with special semantics, e.g.:

**Diagram 57 — textual layout:**

```text
layout:
  name:
    Option<T>
    [std](https://doc.rust-lang.org/std/option/enum.Option.html)
  representation [enum]: pad: Tag
  andor: or
  representation [enum]:
    pad: Tag
    field [any, diagram-width=100px]: T
  description:
    Tag may be omitted for
    certain T, e.g.,
    NonNull
    .[std](https://doc.rust-lang.org/std/ptr/struct.NonNull.html)
```

**Diagram 58 — textual layout:**

```text
layout:
  name:
    Result<T, E>
    [std](https://doc.rust-lang.org/std/result/enum.Result.html)
  representation [enum]:
    pad: Tag
    field [any, diagram-width=50px]: E
  andor: or
  representation [enum]:
    pad: Tag
    field [any, diagram-width=100px]: T
  description:
    Either some error
    E
    or value
    of
    T
    .
```

**Diagram 59 — textual layout:**

```text
layout:
  name:
    ManuallyDrop<T>
    [std](https://doc.rust-lang.org/std/mem/struct.ManuallyDrop.html)
  representation: field [any, unsized, diagram-width=100px]: T
  description:
    Prevents
    T::drop()
    from
    being called.
```

**Diagram 60 — textual layout:**

```text
layout:
  name:
    AtomicUsize
    [std](https://doc.rust-lang.org/std/sync/atomic/index.html)
  representation [atomic]:
    pointer [atomic]:
      usize
      sub: 2/4/8
  description: Other atomic similarly.
```

**Diagram 61 — textual layout:**

```text
layout:
  name:
    MaybeUninit<T>
    span: [std](https://doc.rust-lang.org/std/mem/union.MaybeUninit.html)
  representation [enum]: field [uninit, diagram-width=100px]: U̼̟̔͛n̥͕͐͞d̛̲͔̦̳̑̓̐e̱͎͒̌fị̱͕̈̉͋ne̻̅ḓ̓
  andor: unsafe or
  representation [enum]: field [any, diagram-width=100px]: T
  description:
    Uninitialized memory or
    some
    T
    . Only legal way
    to work with uninit data.
```

**Diagram 62 — textual layout:**

```text
layout:
  name:
    PhantomData<T>
    [std](https://doc.rust-lang.org/std/marker/struct.PhantomData.html)
  representation [zst, diagram-width=15px]: 
  description:
    Zero-sized helper to hold
    otherwise unused lifetimes.
```

**Diagram 63 — textual layout:**

```text
layout:
  name:
    Pin<P>
    [std](https://doc.rust-lang.org/std/pin/struct.Pin.html)
  representation [diagram-width=90px]: field [any, diagram-width=80px]: P
  pointee [double]:
    pointer link [diagram-left=24%]: |
    memory [anymem, pinned, diagram-opacity=0.8]:
      span [diagram-right=-14px, diagram-top=-16px]: 📌
      field [any, diagram-width=130px]: P::Deref
  description:
    Signals tgt. of
    P
    is pinned 'forever'
    even past lt. of
    Pin
    . Value within
    may not be moved out (but new
    one moved in), unless
    Unpin
    .[std](https://doc.rust-lang.org/std/marker/trait.Unpin.html)
```

>  **[Pitfall / intentionally wrong]**  All depictions are for **illustrative** purposes only.
> The fields should exist in latest `stable`, but Rust makes no guarantees about their layouts, and you must not
> attempt to _unsafely_ access anything unless the docs allow it.

#### Cells

**Diagram 64 — textual layout:**

```text
layout:
  name:
    UnsafeCell<T>
    [std](https://doc.rust-lang.org/std/cell/struct.UnsafeCell.html)
  representation [cell]: field [any, unsized]: T
  description:
    Magic type allowing
    aliased mutability.
```

**Diagram 65 — textual layout:**

```text
layout:
  name:
    Cell<T>
    [std](https://doc.rust-lang.org/std/cell/struct.Cell.html)
  representation: field [any, unsized, celled]: T
  description:
    Allows
    T
    's
    to move in
    and out.
```

**Diagram 66 — textual layout:**

```text
layout:
  name:
    RefCell<T>
    [std](https://doc.rust-lang.org/std/cell/struct.RefCell.html)
  representation:
    size field [celled]: borrowed
    field [any, unsized, celled]: T
  description:
    Also support dynamic
    borrowing of
    T
    . Like
    Cell
    this
    is
    Send
    , but not
    Sync
    .
```

**Diagram 67 — textual layout:**

```text
layout:
  name:
    OnceCell<T>
    [std](https://doc.rust-lang.org/std/cell/struct.OnceCell.html)
  div [celled]:
    representation [enum]: pad: Tag
    andor: or
    representation [enum]:
      pad: Tag
      field [any, diagram-width=80px]: T
  description: Initialized at most once.
```

**Diagram 68 — textual layout:**

```text
layout:
  name:
    LazyCell<T, F>
    [std](https://doc.rust-lang.org/std/cell/struct.LazyCell.html)
  div [celled]:
    representation [enum]:
      pad: Tag
      field [any, diagram-width=80px]: Uninit<F>
    andor: or
    representation [enum]:
      pad: Tag
      field [any, diagram-width=80px]: Init<T>
    andor: or
    representation [enum]:
      pad: Tag
      field [any, diagram-width=80px]: Poisoned
  description: Initialized on first access.
```

#### Order-Preserving Collections

**Diagram 69 — textual layout:**

```text
layout:
  name:
    Box<T>
    [std](https://doc.rust-lang.org/std/boxed/struct.Box.html)
  representation:
    pointer:
      ptr
      sub: 2/4/8
    payload:
      meta
      sub: 2/4/8
  pointee:
    pointer link [diagram-left=49%]: |
    memory [heap]: field [any, unsized]: T
  description:
    For some
    T
    stack proxy may carry
    meta[See section](https://cheats.rs/#custom-types) (e.g.,
    Box<[T]>
    ).
```

**Diagram 70 — textual layout:**

```text
layout:
  name:
    Vec<T>
    [std](https://doc.rust-lang.org/std/vec/struct.Vec.html)
  representation:
    pointer:
      ptr
      sub: 2/4/8
    size field:
      len
      sub: 2/4/8
    size field:
      capacity
      sub: 2/4/8
  pointee [double]:
    pointer link [diagram-left=25%]: |
    memory [heap, capacity]:
      div:
        field [any, t]: T
        field [any, t]: T
        note: … len
      capacity:
        ←
        note: capacity
        →
  description:
    Regular
    i: growable array
    vector of single type.
```

**Diagram 71 — textual layout:**

```text
layout:
  name:
    LinkedList<T>
    [std](https://doc.rust-lang.org/std/collections/struct.LinkedList.html) **[Advanced]**
  representation:
    pointer:
      head
      sub: 2/4/8
    pointer:
      tail
      sub: 2/4/8
    size field:
      len
      sub: 2/4/8
  pointee [diagram-width=265px, diagram-left=0%, diagram-display=block]:
    pointer link [diagram-left=25%]: |
    pointer link [diagram-left=50%]: |
    memory [heap, capacity]:
      pointer:
        next
        sub: 2/4/8
      pointer:
        prev
        sub: 2/4/8
      field [any, t]: T
  description:
    Elements
    head
    and
    tail
    both
    null
    or point to nodes on
    the heap. Each node can point to its
    prev
    and
    next
    node.
    Eats your cache (just look at the thing!); don't use unless
    you evidently must. **[Pitfall / intentionally wrong]**
```

**Diagram 72 — textual layout:**

```text
layout:
  name:
    VecDeque<T>
    [std](https://doc.rust-lang.org/std/collections/struct.VecDeque.html)
  representation:
    size field:
      head
      sub: 2/4/8
    size field:
      len
      sub: 2/4/8
    pointer:
      ptr
      sub: 2/4/8
    size field:
      capacity
      sub: 2/4/8
  pointee
  pointee
  pointee [double]:
    pointer link [diagram-left=25%]: |
    memory [heap, capacity]:
      div:
        field [any, t]: T
        note: … empty …
        field [any, t]: T⁣^(H)
      capacity:
        ←
        note: capacity
        →
  description:
    Index
    head
    selects in array-as-ringbuffer. This means content may be
    non-contiguous and empty in the middle, as exemplified above.
```

#### Other Collections

**Diagram 73 — textual layout:**

```text
layout:
  name:
    HashMap<K, V>
    [std](https://doc.rust-lang.org/std/collections/struct.HashMap.html)
  representation:
    size field:
      bmask
      sub: 2/4/8
    pointer:
      ctrl
      sub: 2/4/8
    size field:
      left
      sub: 2/4/8
    size field:
      len
      sub: 2/4/8
  pointee
  pointee [diagram-width=265px, diagram-left=-5%]:
    pointer link [diagram-left=25%]: |
    memory [heap, oversimplified]:
      field [any, t]: K:V
      field [any, t]: K:V
      …
      field [any, t]: K:V
      …
      field [any, t]: K:V
      capacity: note: Oversimplified!
  description:
    Stores keys and values on heap according to hash value,
    [SwissTable](https://www.youtube.com/watch?v=ncHmEUmJZf4)
    implementation via
    [hashbrown](https://github.com/rust-lang/hashbrown)
    .
    HashSet
    [std](https://doc.rust-lang.org/std/collections/struct.HashSet.html) identical to
    HashMap
    ,
    just type
    V
    disappears. Heap view grossly oversimplified. **[Pitfall / intentionally wrong]**
```

**Diagram 74 — textual layout:**

```text
layout:
  name:
    BinaryHeap<T>
    [std](https://doc.rust-lang.org/std/collections/struct.BinaryHeap.html)
  representation:
    pointer:
      ptr
      sub: 2/4/8
    size field:
      capacity
      sub: 2/4/8
    size field:
      len
      sub: 2/4/8
  pointee [diagram-width=265px]:
    pointer link [diagram-left=20%]: |
    memory [heap, capacity]:
      div:
        field [any, t]: T⁣^(0)
        field [any, t, diagram-background-color=#f9b172]: T⁣^(1)
        field [any, t, diagram-background-color=#f9b172]: T⁣^(1)
        field [any, t, diagram-background-color=#f9d372]: T⁣^(2)
        field [any, t, diagram-background-color=#f9d372]: T⁣^(2)
        note: … len
      capacity:
        ←
        note: capacity
        →
  description:
    Heap stored as array with
    2^(N)
    elements per layer. Each
    T
    can have 2 children in layer below. Each
    T
    larger than its
    children.
```

#### Owned Strings

**Diagram 75 — textual layout:**

```text
layout:
  name:
    String
    [std](https://doc.rust-lang.org/std/string/struct.String.html)
  representation:
    pointer:
      ptr
      sub: 2/4/8
    size field:
      capacity
      sub: 2/4/8
    size field:
      len
      sub: 2/4/8
  pointee [double]:
    pointer link [diagram-left=25%]: |
    memory [heap]:
      div:
        byte [bytes]: U
        byte [bytes]: T
        byte [bytes]: F
        byte [bytes]: -
        byte [bytes]: 8
        note: … len
      capacity:
        ←
        note: capacity
        →
  description:
    Observe how
    String
    differs from
    &str
    and
    &[char]
    .
```

**Diagram 76 — textual layout:**

```text
layout:
  name:
    CString
    [std](https://doc.rust-lang.org/std/ffi/struct.CString.html)
  representation:
    pointer:
      ptr
      sub: 2/4/8
    size field:
      len
      sub: 2/4/8
  pointee [double]:
    pointer link [diagram-left=25%]: |
    memory [heap]:
      div:
        byte [bytes]: A
        byte [bytes]: B
        byte [bytes]: C
        note: … len …
        byte [bytes]: ∅
  description: NUL-terminated but w/o NUL in middle.
```

**Diagram 77 — textual layout:**

```text
layout:
  name:
    OsString
    [std](https://doc.rust-lang.org/std/ffi/struct.OsString.html)
  representation [platformdefined]: Platform Defined
  pointee [double]:
    pointer link [diagram-left=25%]: |
    memory [heap]:
      div:
        byte [bytes]: × 2
        /
        word [bytes]: 
        word [bytes]: 
  description:
    Encapsulates how operating system
    represents strings (e.g.,
    [WTF-8](https://simonsapin.github.io/wtf-8/)
    on
    Windows).
```

**Diagram 78 — textual layout:**

```text
layout:
  name:
    PathBuf
    [std](https://doc.rust-lang.org/std/path/struct.PathBuf.html)
  representation [platformdefined, diagram-width=100px]: payload: OsString
  pointee [double]:
    pointer link [diagram-left=40%]: |
    memory [heap]:
      div:
        byte [bytes]: × 2
        /
        word [bytes]: 
        word [bytes]: 
  description:
    Encapsulates how operating system
    represents paths.
```

#### Shared Ownership

If the type does not contain a `Cell` for `T`, these are often combined with one of the `Cell` types above to allow shared de-facto mutability.

**Diagram 79 — textual layout:**

```text
layout:
  name:
    Rc<T>
    [std](https://doc.rust-lang.org/std/rc/struct.Rc.html)
  representation [diagram-width=180px]:
    pointer:
      ptr
      sub: 2/4/8
    payload:
      meta
      sub: 2/4/8
  div:
    pointee [quad]:
      pointer link [diagram-left=15%]: |
      memory [heap]:
        size field [celled]:
          strng
          sub: 2/4/8
        size field [celled]:
          weak
          sub: 2/4/8
        field [any, unsized]: T
  description:
    Share ownership of
    T
    in same thread. Needs nested
    Cell
    or
    RefCell
    to allow mutation. Is neither
    Send
    nor
    Sync
    .
```

**Diagram 80 — textual layout:**

```text
layout:
  name:
    Arc<T>
    [std](https://doc.rust-lang.org/std/sync/struct.Arc.html)
  representation [diagram-width=180px]:
    pointer:
      ptr
      sub: 2/4/8
    payload:
      meta
      sub: 2/4/8
  div [diagram-width=0px]:
    pointee [quad]:
      pointer link [diagram-left=15%]: |
      memory [heap]:
        size field [atomicx]:
          strng
          sub: 2/4/8
        size field [atomicx]:
          weak
          sub: 2/4/8
        field [any, unsized]: T
  description:
    Same, but allow sharing between threads IF contained
    T
    itself is
    Send
    and
    Sync
    .
```

**Diagram 81 — textual layout:**

```text
layout:
  name:
    Mutex<T>
    [std](https://doc.rust-lang.org/std/sync/struct.Mutex.html) /
    RwLock<T>
    [std](https://doc.rust-lang.org/std/sync/struct.RwLock.html)
  representation [diagram-width=230px]:
    payload: inner
    size field [atomicx]:
      poison
      sub: 2/4/8
    field [any, unsized, celled]: T
  description:
    Inner fields depend on platform. Needs to be
    held in
    Arc
    to be shared between decoupled
    threads, or via
    scope()
    [std](https://doc.rust-lang.org/std/thread/fn.scope.html) for scoped threads.
```

**Diagram 82 — textual layout:**

```text
layout:
  name:
    Cow<'a, T>
    [std](https://doc.rust-lang.org/std/borrow/enum.Cow.html)
  representation [enum]:
    pad: Tag
    field [any, unsized, diagram-width=100px]: T::Owned
  andor: or
  representation [enum]:
    pad: Tag
    field [ptr, diagram-width=50px]:
      ptr
      sub: 2/4/8
  div:
    pointee [diagram-width=40px]
    pointee:
      pointer link [diagram-left=15%]: |
      memory [anymem]: field [any, unsized]: T
  description:
    Holds read-only reference to
    some
    T
    , or owns its
    ToOwned
    [std](https://doc.rust-lang.org/std/borrow/trait.ToOwned.html)
    analog.
```

---

