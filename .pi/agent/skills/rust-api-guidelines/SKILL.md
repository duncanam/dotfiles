---
name: rust-api-guidelines
description: Authoritative Rust API design guidance from the official Rust API Guidelines (rust-lang/api-guidelines). Load this whenever the user is designing, reviewing, refactoring, or critiquing a Rust crate's public API — including questions about naming conventions (C-CASE, C-CONV, C-GETTER, C-ITER), trait implementations, error handling, documentation, predictability, flexibility, type safety, dependability, debuggability, future-proofing, macros, interoperability, or the API review checklist. Provides a topic→file map into a local checkout of the guidelines.
---

# Rust API Guidelines

This skill exposes the official [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/) (rust-lang/api-guidelines) checked out locally at `~/git/api-guidelines`. Use it as the source of truth when designing or reviewing Rust crate APIs.

## Source location

The guidelines book source (mdBook format) lives at:

```
~/git/api-guidelines/src/
```

Resolve the absolute path with:

```bash
GUIDELINES_DIR="$HOME/git/api-guidelines/src"
```

If that directory does not exist, tell the user and ask them to clone https://github.com/rust-lang/api-guidelines into `~/git/api-guidelines` (or point you at a different checkout).

## Topic → file map

Each chapter is a single Markdown file under `$GUIDELINES_DIR/`. Read the file that matches the user's question completely — the guideline checklist items (`C-*` tags) are scattered throughout and partial reads miss them.

| Topic | File |
| --- | --- |
| About / overview | `about.md` |
| Full checklist of all `C-*` guidelines | `checklist.md` |
| Table of contents | `SUMMARY.md` |
| Naming conventions (C-CASE, C-CONV, C-GETTER, C-ITER, C-ITER-TY, C-FEATURE, C-WORD-ORDER) | `naming.md` |
| Interoperability (C-COMMON-TRAITS, C-CONV-TRAITS, C-COLLECT, C-SERDE, C-SEND-SYNC, C-GOOD-ERR, C-NUM-FMT, C-RW-VALUE) | `interoperability.md` |
| Macros (C-EVOCATIVE, C-MACRO-ATTR, C-ANYWHERE, C-MACRO-VIS, C-MACRO-TY) | `macros.md` |
| Documentation (C-CRATE-DOC, C-EXAMPLE, C-QUESTION-MARK, C-FAILURE, C-LINK, C-METADATA, C-HTML-ROOT, C-RELNOTES, C-HIDDEN) | `documentation.md` |
| Predictability (C-SMART-PTR, C-CONV-SPECIFIC, C-METHOD, C-NO-OUT, C-OVERLOAD, C-DEREF, C-CTOR) | `predictability.md` |
| Flexibility (C-INTERMEDIATE, C-CALLER-CONTROL, C-GENERIC, C-OBJECT) | `flexibility.md` |
| Type safety (C-NEWTYPE, C-CUSTOM-TYPE, C-BITFLAG, C-BUILDER) | `type-safety.md` |
| Dependability (C-VALIDATE, C-DTOR-FAIL, C-DTOR-BLOCK) | `dependability.md` |
| Debuggability (C-DEBUG, C-DEBUG-NONEMPTY) | `debuggability.md` |
| Future proofing (C-SEALED, C-STRUCT-PRIVATE, C-NEWTYPE-HIDE, C-STRUCT-BOUNDS) | `future-proofing.md` |
| Necessities (C-STABLE, C-PERMISSIVE) | `necessities.md` |
| Curated external reading | `external-links.md` |

## How to use this skill

1. Set `GUIDELINES_DIR="$HOME/git/api-guidelines/src"`.
2. If the user asks about a specific `C-FOO` tag and you don't already know which chapter it lives in:
   ```bash
   grep -rln "C-FOO" "$GUIDELINES_DIR"
   ```
3. For broad design-review questions ("review this API", "is this idiomatic?"), start with `checklist.md` to enumerate all `C-*` items, then read the chapter files relevant to the specific code.
4. **Read full files** rather than snippets — each chapter is short and the rationale/examples around a guideline matter as much as the rule itself.
5. When citing a guideline in your answer, reference both the tag (e.g. `C-GETTER`) and the chapter (e.g. `naming.md`) so the user can follow up.
6. Treat the guidelines as authoritative recommendations, not absolute mandates (the `about.md` chapter is explicit about this). Note exceptions when they're warranted by the user's domain.

## Quick checklist scan

To dump every guideline tag with its chapter in one pass:

```bash
grep -rn "^\s*- \[ \].*C-[A-Z-]\+" "$GUIDELINES_DIR" | sed 's|.*/||'
```

This is useful when doing a full-crate review and you want the model to walk every applicable guideline.
