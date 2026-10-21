# Conversion policy

The input is upstream `content/_index.md`, not the rendered site. This is a
formatting adaptation, not a summary, a Rust specification, or an editorial
update. Substantive prose (including introductions and opinions), code, tables,
all active tabs, notes, and diagram content remain available.

## Reproducibility

`provenance.json` pins a full upstream commit and SHA-256 hashes for the Markdown,
legal page, and all shortcode templates used by the converter. It also records
converter/lockfile hashes and output hashes. Normal generation rejects mismatched
inputs. Changing the pin is an explicit maintenance operation requiring review.
No timestamps or machine-specific paths are written into generated artifacts.

## Transformation rules

- Freeze fenced code and backtick spans before handling comments, shortcodes, or
  HTML. Preserve displayed source code, including whitespace, with only CRLF to
  LF normalization. Literal `<T>`, `<!-- ... -->`, and `{{ ... }}` inside code are
  not interpreted as website syntax. Comments and HTML `code` elements are also
  opaque to backtick scanning: an unmatched tick there must not consume a later
  visible section. Inline spans cannot cross a blank paragraph boundary. HTML
  `code` elements become code spans, without expanding shortcode-looking literals.
- Remove TOML frontmatter, HTML comments (including commented-out examples), the
  logo, interactive controls, duplicate TOC/legend, printing instructions, and
  site footer. Do not discard the contents of `noprint` or layout wrappers.
  Do not copy the site's operator/privacy metadata into the adaptation.
- Flatten every active tab into a named subsection, including unchecked tabs.
  Preserve the parent header/tab hierarchy so later categories do not become
  children of an earlier tab. A source/output tab-count mismatch is an error.
- Turn documentation shortcodes into ordinary links using their pinned upstream
  templates. Preserve badges as explicit text: pitfalls, nightly/unstable,
  deprecated, edition, opinion, missing explanation, and performance risks.
  Edition labels are not automatically interpreted as minimum Rust versions.
- Replace padding shortcodes with an indentation marker, and remove invisible
  emoji spacers. Keep notes local to their original section. Superscripts become
  `^(...)` and subscripts `_(...)`; these are readable notation, not new Rust
  syntax or globally numbered Markdown footnotes.
- Unwrap layout-only containers. Preserve `good`, `bad`, `unsafe`, and `warning`
  classes outside diagrams as explicit source labels. Preserve `cargo-prefix`
  highlighting as abbreviation annotations without changing the command. Convert ordinary HTML
  tables to Markdown tables without shifting empty cells. Tables with spanning
  columns become numbered rows with explicit column ranges, rather than losing
  their grouping. Unsupported row spans fail conversion.
- Convert links to upstream page fragments into absolute cheats.rs links; their
  targets may differ from the generated heading names. The local index uses
  inclusive line ranges instead of depending on a Markdown renderer's slug rules.

## Diagrams: structural text, not inferred facts

Custom `datum`, `mini-zoo`, `lifetime-example`, `thread-row`, and `region`
structures become fenced text outlines. They preserve nesting, order, roles,
labels, code, captions, links, state classes, and diagram relationships.
Consecutive identical byte cells are run-length encoded (for example,
`byte [borrowed] × 4`). Hidden cells remain marked `hide`, since deleting them
would shift the depicted byte positions or erase a source distinction.

Position, dimension, color, opacity, and visibility attributes that encode
relationships are retained with a `diagram-` prefix. Pure presentation attributes
such as font sizes and margins are dropped. Uninterpreted source classes remain
visible rather than being assigned an invented Rust meaning.

These are **textual representations of source diagrams**, not claims about Rust
ABI, actual addresses, guaranteed sizes, or inferred pointer targets. A faded
8-cell drawing of `usize`, for example, does not establish an 8-byte guarantee;
the surrounding platform-dependent explanation remains authoritative. For a
question that depends on spatial presentation, consult the linked upstream
section as well. Do not replace the text outlines with guessed summaries.

## Validation and limitations

- Unknown HTML elements or shortcodes, unknown/malformed shortcode arguments,
  missing templates, non-logo images, unsupported table spans, and unclosed code fences fail
  conversion. Newly added sections after the removed printing section also fail
  rather than being silently discarded.
- Every original Markdown code token must survive or belong to explicitly removed
  chrome. Comments are opaque, so fence-like text inside comments is not counted
  as source code. The report counts preserved/omitted active code fences, records
  tab labels and diagram groups, and inventories handled tags/shortcodes.
- Regression tests cover code protection, warnings, tabs, tables, diagrams,
  links, index ranges, and source configuration. Full-snapshot checks verify
  deterministic regeneration and inspect the generated Markdown structure.
- `normalizedInputLine` in the diagram report is a debugging location in the
  intermediate source, **not** a line number in the upstream file. Use the pinned
  source URL for attribution and the generated index for local line numbers.
- The converter deliberately does not silently correct upstream facts or feature
  status. Rust evolves, and this source includes opinions and simplifications.
  Verify version-sensitive or safety-critical claims against official docs.

## Topic partition and loading

`topic-plan.json` specifies 32 boundaries by heading title/level and optional
parent scope. All boundaries must match uniquely and occur in the reviewed
order. No generated line numbers are hard-coded as split points. A small common
preamble retains the source and diagram caveats; all remaining source content
belongs to exactly one topic body. Recombining the common preamble and those
bodies in order must reproduce `all.md` byte-for-byte. Generated topic headers
add provenance, inherited heading context and explicit prerequisite links; they
are not part of the reconstructed source bodies.

Split only at section boundaries, never inside tables, examples, diagrams or
local notes. Prerequisites preserve dependencies in progressive lifetime and
trait explanations; recursively load them once when needed. Do not detach
examples from their warnings or replace them with a summary to meet a budget.

The small router and shared caveats load by default, followed by complete relevant
topic/prerequisite files. The detailed section index and whole archive remain
optional. Token counts use the pinned `gpt-tokenizer` encodings at generation
time, so no tokenizer or Node runtime is needed when reading the skill.
