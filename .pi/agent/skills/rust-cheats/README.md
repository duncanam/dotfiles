# rust-cheats maintenance

The skill reads committed Markdown; users do not need a source checkout, Node,
or Zola. The converter operates on upstream `content/_index.md` and its embedded
shortcodes/HTML, **not** a rendered web page. See [CONVERSION.md](CONVERSION.md)
for transformations and limitations, and [NOTICE.md](NOTICE.md) for terms.
Original skill/tooling code is MIT licensed under [LICENSE](LICENSE). That grant
does **not** relicense `references/`: its conditional upstream terms remain in
force. Package metadata points to `NOTICE.md` rather than advertising MIT-only
licensing; the private/publication guard remains in place.

## Files

- `SKILL.md`: selection, complete-topic loading, search and interpretation.
- `references/common.md`: shared caveats, read by default.
- `references/index.md`: compact topic router, read by default.
- `references/topics/*.md`: 32 complete topic files with prerequisite links.
- `references/topics.json`: generated body ranges, hashes and tokenizer counts.
- `references/sections.md`: optional detailed index with inclusive archive ranges.
- `references/all.md`: unchanged complete archive, loaded only on explicit request.
- `topic-plan.json`: reviewed heading-based boundaries and prerequisite graph.
- `references/conversion-report.json`: coverage and transformation inventory.
- `provenance.json`: pinned source, input/output hashes, converter/lockfile hashes.
- `scripts/convert.mjs`: Markdown/code protection and explicit markup conversion.
- `scripts/generate.mjs`: pinned input acquisition, validation, artifact generation.
- `scripts/topics.mjs`: lossless partitioning and routing/index generation.
- `scripts/context-budget.mjs`: optional context-cost measurement across all four Rust skills.
- `CONTEXT-BUDGET.md` and `context-budget.json`: measured context budgets and input hashes.
- `scripts/*.test.mjs`: regression and generated-artifact checks.

Do not hand-edit generated files. Correct the converter or explicitly update
its upstream pin, regenerate, inspect the diff, and rerun the checks.

## Reproduce and verify

Requires Node.js 22+ and npm. From this directory:

```bash
npm ci --ignore-scripts
npm test
npm run check -- --fetch
```

`--fetch` retrieves only the pinned source files from `raw.githubusercontent.com`,
checks their SHA-256 hashes, and caches them under
`<OS temporary directory>/pi-rust-cheats/<commit>/`. It does not clone, pull,
modify a source checkout, or run upstream code. Downloads have timeouts.
The cache may be removed by the OS; rerun `--fetch` if it is missing.

Subsequent offline checks and regeneration use that cache:

```bash
npm run check
npm run generate
npm test
```

`--check` compares regenerated content byte-for-byte without changing artifacts.
Normal generation fails on missing or changed inputs rather than silently using
another revision or fetching data. `npm test` does not require the input cache
or a network connection. Do not commit the installed `node_modules` directory.

### Optional source checkout

To use an existing checkout instead of the external cache:

```bash
export RUST_CHEATS_REPO="$HOME/checkouts/cheats.rs"
npm run check
```

The variable must be a non-empty **absolute repository root**, not `content/`.
Every required input must match the hashes in `provenance.json`; the directory
name or branch alone is not evidence of a matching snapshot. Empty, relative,
missing, or mismatched overrides are errors, not reasons to fall back. Do not
combine this override with `--fetch` or `--pin`. It is unnecessary for reading
the already-generated skill reference.

## Deliberately update the source

Resolve and review an upstream commit first. Within the read-only source-control
policy, its SHA can be inspected with:

```bash
gh api repos/ralfbiedert/cheats.rs/commits/master --jq .sha
```

Then, using the full SHA (not a branch name):

```bash
unset RUST_CHEATS_REPO
npm run generate -- --pin <full-40-character-commit-sha>
npm test
npm run check
```

`--pin` explicitly downloads that snapshot, records new input hashes, and
regenerates the artifacts. It does not auto-approve changes to meaning: review
new shortcodes, tags, diagram classes/styles, source terms, and representative
output. Unknown markup stops conversion; add explicit handling and regression
tests rather than dropping it. `topic-plan.json` uses unique heading titles,
levels and optional parent scopes, not hard-coded line numbers. Missing,
ambiguous or reordered boundaries fail. Review the prerequisite graph if topics
move or change. Obsolete topic Markdown files are reported, never silently
retained in search or automatically deleted; remove them explicitly after review.
Check `NOTICE.md` against the newly pinned legal
page and update its revision link and applicable terms if necessary. The snapshot
test also pins the reviewed revision and coverage counts; update those only after
checking the new source inventory, not merely to make a failing test pass.

## Review checklist

- All substantive source sections and all active tabs remain present.
- Displayed Rust examples survive, with intentional-invalid/nightly/edition
  annotations and local notes still attached.
- Diagrams retain roles, byte runs, hidden/state flags, and relationships; do
  not infer ABI guarantees from drawing dimensions.
- Native tables retain empty cells and spanning-column meaning.
- Generated Markdown parses without raw HTML; code-fence and index coverage
  agree with the report; hyperlinks have usable targets.
- Topic bodies plus the common preamble reconstruct `all.md` byte-for-byte;
  examples, diagrams and local notes stay together. All prerequisite links resolve
  without cycles. Every topic fits an ordinary read response and the tested budget.
- Reported output bytes and `o200k_base`/`cl100k_base` token counts are inspected.
  Counts use locked `gpt-tokenizer`, not characters/4 (the legacy estimate remains
  in the conversion report for comparison). Complete relevant topics, not the
  full archive, are the default. Do not silently substitute snippets.
- Both regeneration and `--check` succeed deterministically. No input dependencies
  on `rg`, `fd`, Python, or Zola are introduced by the generator.

The generator does not perform semantic Rust verification or live-link checking.
Its tests are conversion/coverage checks, not evidence that every upstream claim
is correct or every example should compile.

## Context-budget measurement

`npm run budget` prints a JSON measurement for the current local API/Pragmatic
checkouts, generated cheat topics and bundled performance-book chapters. It never
fetches or changes a checkout. The other three skills must be present as siblings;
the two guideline skills' existing
`RUST_API_GUIDELINES_REPO` and `RUST_PRAGMATIC_GUIDELINES_REPO` overrides work as
usual (absolute repository roots; explicitly empty/invalid values fail). The
Pragmatic baseline is its task router plus upstream overview and skill wrapper;
its agent export is optional and reported separately, not a default prerequisite.
The performance baseline is its wrapper, introduction and task router; required
optimization methodology and selected chapters are additional measured costs.

```bash
npm run budget
npm run budget -- --write   # refresh CONTEXT-BUDGET.md and context-budget.json
npm run budget -- --check   # verify that the recorded report matches these inputs
```

This is an optional maintenance command, not a skill-load step and not part of
ordinary `generate`/`check`: guideline checkouts are external snapshots that may
differ on another machine. See `CONTEXT-BUDGET.md` for activation versus startup
costs, task-lookup overhead, per-agent totals and exclusions. Report paths are
logical labels, not machine-specific absolute paths; SHA-256 hashes identify
exact measured inputs.
