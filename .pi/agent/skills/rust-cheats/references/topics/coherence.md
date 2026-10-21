# Types: foreign types/traits and implementation legality

From [cheats.rs](https://github.com/ralfbiedert/cheats.rs/blob/f153e8e1da51e909fb6e1ed210013c6aadab80c2/content/_index.md); archive lines 6105–6259.
**Read first:** [types-traits](types-traits.md) (including their prerequisites; reuse complete reads).
Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).

---

## Foreign Types and Traits

A visual overview of types and traits in your crate and upstream.

**Diagram 166 — textual crate region:**

```text
crate region [diagram-height=310px]:
  group [diagram-left=6%, diagram-width=200px]:
    entry [diagram-left=100px, diagram-top=10%]: type [primitive]: u8
    entry [diagram-left=20px, diagram-top=32%]: type [primitive]: u16
    entry [diagram-left=30px, diagram-top=20%]: type [primitive]: f32
    entry [diagram-left=0px, diagram-top=7%]: type [primitive]: bool
    entry [diagram-left=120px, diagram-top=32%]: type [primitive]: char
    label [diagram-left=8px, diagram-top=43%]: Primitive Types
  group [diagram-left=50%, diagram-width=350px]:
    entry [diagram-left=110px, diagram-top=60px]: type [composed]: File
    entry [diagram-left=180px, diagram-top=34%]: type [composed]: String
    entry [diagram-left=230px, diagram-top=13%]: type [composed]: Builder
    label [diagram-left=150px, diagram-top=43%]: Composite Types
  group [diagram-left=30px, diagram-top=53%, diagram-width=200px]:
    entry [diagram-left=50px, diagram-top=8%]: type [composed]: Vec<T>
    entry [diagram-left=45px, diagram-top=9%]: type [composed]: Vec<T>
    entry [diagram-left=40px, diagram-top=10%]: type [generic, dotted]: Vec<T>
    entry [diagram-left=170px, diagram-top=2%]: type [primitive]: &'a T
    entry [diagram-left=165px, diagram-top=3%]: type [primitive]: &'a T
    entry [diagram-left=160px, diagram-top=4%]: type [generic, dotted]: &'a T
    entry [diagram-left=140px, diagram-top=18%]: type [primitive]: &mut 'a T
    entry [diagram-left=135px, diagram-top=19%]: type [primitive]: &mut 'a T
    entry [diagram-left=130px, diagram-top=20%]: type [generic, dotted]: &mut 'a T
    entry [diagram-left=40px, diagram-top=28%]: type [primitive]: [T; n]
    entry [diagram-left=35px, diagram-top=29%]: type [primitive]: [T; n]
    entry [diagram-left=30px, diagram-top=30%]: type [generic, dotted]: [T; n]
    label [diagram-left=80px, diagram-top=40%]: Type Constructors
  group [diagram-left=50%, diagram-top=53%, diagram-width=200px]:
    entry [diagram-left=10px, diagram-top=8%]: function: Vec<T>
    entry [diagram-left=5px, diagram-top=9%]: function: Vec<T>
    entry [diagram-left=0px, diagram-top=10%]: function [dotted]: f<T>() {}
    entry [diagram-left=20px, diagram-top=24%]: function: drop() {}
    label [diagram-left=10px, diagram-top=40%]: Functions
  group [grayed, diagram-left=80%, diagram-top=53%, diagram-width=140px]:
    entry [diagram-left=5px, diagram-top=15%]: macro: PI
    entry [diagram-left=0px, diagram-top=28%]: macro: dbg!
    label [diagram-left=20px, diagram-top=40%]: Other
  group [diagram-left=36%, diagram-width=30px]:
    entry [diagram-left=20px, diagram-top=20px]:
      trait implementation:
        ⌾
        Copy
    entry [diagram-left=60px, diagram-top=90px]:
      trait implementation:
        ⌾
        Deref
      associated type: type Tgt;
    entry [diagram-left=90px, diagram-top=50px]:
      trait implementation:
        ⌾
        From<T>
    entry [diagram-left=85px, diagram-top=55px]:
      trait implementation:
        ⌾
        From<T>
    entry [diagram-left=80px, diagram-top=60px]:
      trait implementation [dotted]:
        ⌾
        From<T>
    label [diagram-left=60px, diagram-top=43%]: Traits
```

Items defined in upstream crates.

**Diagram 167 — textual crate region:**

```text
crate region [your-crate, diagram-height=190px]:
  group [diagram-left=5px, diagram-width=200px]:
    entry [diagram-left=10px, diagram-top=25px]:
      trait implementation:
        ⌾
        Serialize
    entry [diagram-left=30px, diagram-top=65px]:
      trait implementation:
        ⌾
        Transport
    entry [diagram-left=15px, diagram-top=105px]:
      trait implementation:
        ⌾
        ShowHex
  group [diagram-left=150px, diagram-width=200px]:
    entry [diagram-left=0px, diagram-top=25px]:
      type [composed]: Device
      trait implementation [grayed]:
        ⌾
        From<u8>
      note: Foreign trait impl. for local type.
    entry [diagram-left=100px, diagram-top=25px]:
      type [grayed, composed]: String
      trait implementation:
        ⌾
        Serialize
      note: Local trait impl. for foreign type.
    entry [diagram-left=200px, diagram-top=25px]:
      type [composed, grayed]: String
      trait implementation [grayed]:
        ⌾
        From<u8>
      note: **[Pitfall / intentionally wrong]** Illegal, foreign trait for f. type.
    entry [diagram-left=200px, diagram-top=110px]:
      type [composed, grayed]: String
      trait implementation [grayed]:
        ⌾
        From<Port>
      note: Exception: Legal if used type local.
    entry [diagram-left=300px, diagram-top=25px]:
      type [composed]: Port
      trait implementation:
        ⌾
        From<u8>
      trait implementation:
        ⌾
        From<u16>
      note:
        Mult. impl. of trait with differing
        b: IN
        params.
    entry [diagram-left=400px, diagram-top=25px]:
      type [composed]: Container
      trait implementation:
        ⌾
        Deref
      associated type [grayed]: Tgt = u8;
      trait implementation:
        ⌾
        Deref
      associated type [grayed]: Tgt = f32;
      note:
        **[Pitfall / intentionally wrong]** Illegal impl. of trait with differing
        b: OUT
        params.
    entry [diagram-left=510px, diagram-top=15px]: type [composed]: T
    entry [diagram-left=505px, diagram-top=20px]: type [composed]: T
    entry [diagram-left=500px, diagram-top=25px]:
      type [generic, dotted]: T
      trait implementation:
        ⌾
        ShowHex
      note: Blanket impl. of trait for any type.
```

Your crate.

**Notes:**

Examples of traits and types, and which traits you can implement for which type.

