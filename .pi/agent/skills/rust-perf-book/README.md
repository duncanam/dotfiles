# rust-perf-book maintenance

A chapter-routed skill for Nicholas Nethercote and others' **The Rust Performance
Book**. Normal use requires no repository checkout, network access, installation,
mdBook build, environment setup or scripts. The complete English book is bundled
as original Markdown, but the skill reads only the introduction, task router and
complete relevant chapters by default. Optimization work has additional
measurement-first reads specified in `SKILL.md`.

## Layout and source

- `SKILL.md`: independently authored agent instructions.
- `references/index.md`: task router covering all 19 chapters.
- `references/book/`: 25 **unmodified** upstream files: 19 chapters, title page,
  TOC, upstream README, book metadata and two license texts.
- `provenance.json`: pinned commit, attribution, exact source paths and SHA-256
  hashes. The corresponding local file is `references/book/<source path>`.
- `LICENSE`: MIT license for original skill instructions/tooling.
- `NOTICE.md`: upstream attribution, license scope and redistribution requirements.
- `scripts/`: dependency-free Node 22+ maintenance checks; not needed to use the
  skill or to load it in Pi.

Source: <https://github.com/nnethercote/perf-book>. No summaries, rewritten
examples or generated HTML replace the source chapters. mdBook's hidden `#`
example lines, Markdown reference links, and title-page spans are preserved.
No local assets or include directives occur in the inspected chapters; a future
snapshot introducing them requires an explicit preservation plan.

## Verify and restore

From this skill directory:

```bash
node --test scripts/*.test.mjs
node scripts/snapshot.mjs --check             # offline hashes, coverage and links
node scripts/snapshot.mjs --verify-upstream   # explicit network verification
node scripts/snapshot.mjs --restore           # restore exact pinned source bytes
```

Verification does not change files. Restoration downloads only the manifest's
allowlisted files from its fixed commit, verifies **every** hash/size before
writing, and changes only `references/book/`. It never changes the pin, router,
notices or provenance, and never clones/updates a checkout. Unexpected files
are errors, not silently removed. There is deliberately no runtime source
override or automatic download fallback: missing/corrupt bundled files must be
reported and repaired explicitly.

For a deliberate upstream update, first resolve/review the desired commit and
its license declaration, authorship, license files and any new notices. Download
its Markdown and legal inputs into a temporary directory. Review TOC changes,
local links/assets/includes, code and version-sensitive recommendations. Replace
the bundled source unchanged and record the new file inventory, sizes and hashes
in `provenance.json`; update the pin in `NOTICE.md`, routing and coverage tests
as needed. Run all checks, network verification and context-budget regeneration.
Do not merely change a hash to silence unexplained corruption. Do not submit
agent-generated material upstream: the project's contribution policy rejects it.

## Context and sharing

The baseline is `SKILL.md` + `references/index.md` + the upstream introduction.
Selected chapters add their complete file cost; optimization methodology is
additional, not hidden in the baseline. See the sibling skill's reproducible
[context-budget report](../rust-cheats/CONTEXT-BUDGET.md). Maintenance/license
files and the title page are not default context reads.

Keep `LICENSE`, `NOTICE.md`, the full upstream license texts, attribution/title
page and provenance with redistributed source. Original wrapper/tooling code
is MIT licensed under `LICENSE`; the copied book uses upstream's MIT option
without removing its Apache-2.0 alternative. This scope does not extend to
unrelated dotfiles or linked third-party works. No publication or source-control
mutation is performed by these scripts.
