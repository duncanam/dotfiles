---
name: rust-cheats
description: >
  Rust language, standard-library, and tooling reference from cheats.rs. Use
  for unfamiliar syntax, ownership and lifetimes, types and traits, generics
  and conversions, closures and async, Send/Sync and atomics, memory-layout
  illustrations, macros and attributes, or Cargo and rustdoc. Also use when
  cheats.rs or the Rust Language Cheat Sheet is named. Loads complete relevant
  topic files, not the whole encyclopedia by default. Complements
  rust-api-guidelines and rust-pragmatic-guidelines; not a language specification
  or a replacement for current dependency API documentation.
---

# Rust Language Cheat Sheet

## Default load: router plus complete relevant topics

1. Read `references/common.md` and `references/index.md` completely. They contain
   shared interpretation caveats and the compact topic router.
2. Select the relevant file(s) under `references/topics/`. Follow each file's
   **Read first** links recursively, then read **the entire selected file**,
   including examples, diagrams, warnings and notes. Reuse complete reads already
   in active context for this snapshot; do not load shared prerequisites twice.
3. Use search to discover additional relevant topics, not as a substitute for
   reading their complete files. Some questions need multiple files. Syntax
   tables and explanatory sections are complementary, not interchangeable.
4. Do **not** load every topic, `references/sections.md`, or `references/all.md`
   by default. The detailed section index is optional. If the user explicitly
   requests the full corpus, read `all.md` instead of all individual topics;
   it already contains the shared caveats.

Paths are relative to this skill directory; resolve them to absolute paths in
calls. Continue truncated reads with `offset`/`limit` from the reported next
line until complete. If context capacity prevents a required read, disclose it
and ask how to proceed; do not silently substitute excerpts or a summary.

## Search and interpretation

```bash
# Absolute directory containing this SKILL.md; search topics, not their duplicate archive.
SKILL_DIR="/absolute/path/to/rust-cheats"
rg -n -i --glob '*.md' 'variance|subtyping|coercion' "$SKILL_DIR/references/topics"
```

Set the bash tool's `timeout` parameter for searches (for example, 10 seconds).
Cite the topic heading and the pinned upstream source linked in its header.

- **Reference, not specification:** the snapshot includes opinions, simplifications
  and potentially stale feature/edition labels. Verify version-sensitive or
  safety-critical claims against official Rust docs, and crate APIs against
  current dependency docs. Edition labels are not automatically MSRV requirements.
- **Warnings matter:** never recommend a marked counterexample as correct code.
  Illustrative, invalid and unsafe snippets are not instructions to execute them.
- **Diagrams are illustrations:** `diagram-*` fields describe drawing coordinates
  and colors, not addresses, ABI offsets or Rust guarantees. See the shared caveats
  and `CONVERSION.md`; consult the linked original diagram for spatial questions.
- **Compose the guidelines:** use `rust-api-guidelines` for public API design and
  `C-*` rules, and `rust-pragmatic-guidelines` for Microsoft's `M-*` engineering
  advice. Their own baseline-loading policies still apply.

## Maintenance

Normal use needs no checkout, installation, network access or generation step.
`README.md` documents regeneration; `provenance.json` pins the source;
`references/topics.json` records sizes and prerequisites. `CONTEXT-BUDGET.md`
estimates the three Rust skills' costs against a 200k context.

`RUST_CHEATS_REPO` is an optional absolute repository-root override for
**regeneration only**; invalid or mismatched overrides fail without fallback.
Read `NOTICE.md` before redistribution: upstream's stated CC-BY terms have
additional conditions/exclusions. This adaptation does not imply endorsement.
