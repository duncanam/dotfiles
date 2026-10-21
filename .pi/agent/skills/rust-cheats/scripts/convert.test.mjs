import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convert, makeIndex, protectCode, SHORTCODES } from './convert.mjs';
import { options, sourceRoot } from './generate.mjs';

const templates = Object.fromEntries(SHORTCODES.map(name => [name, '']));
Object.assign(templates, {
  book: '<a href="https://doc.rust-lang.org/book/{{page}}">BK</a>',
  std: '<a href="https://doc.rust-lang.org/{{page}}">STD</a>',
  ref: '<a href="https://doc.rust-lang.org/reference/{{page}}">REF</a>',
  link: '<a href="{{url}}">link</a>',
  above: '<a href="{{target}}">up</a>',
  below: '<a href="{{target}}">down</a>',
});
const clean = source => convert(source, templates);

test('literal Rust generics, comments, shortcode-looking strings and whitespace survive verbatim', () => {
  const code = '```rust\nfn f<T>(x: Vec<T>) {\n    let html = "<new-tag><!-- keep -->{{ bad() }}";  \n    let closure = |x| x;\n}\n```\n';
  const result = clean('# Example\n' + code + '\n`Vec<T>` and `a | b`\n');
  assert.ok(result.body.includes(code));
  assert.ok(result.body.includes('`Vec<T>` and `a | b`'));
  assert.equal(result.report.code.preservedFences, 1);
  assert.equal(result.report.shortcodes.bad, undefined);
});

test('variable-length backticks and tilde fences are protected', () => {
  const source = '`` `T` <b> ``\n\n~~~~rust\n```\nVec<T>\n~~~~\n';
  const frozen = protectCode(source);
  assert.equal(frozen.tokens.length, 2);
  const result = clean(source);
  assert.ok(result.body.includes('`` `T` <b> ``'));
  assert.ok(result.body.includes('~~~~rust\n```\nVec<T>\n~~~~'));
  assert.throws(() => clean('```rust\nunclosed'), /Unclosed code fence/);
});

test('blockquote and list-nested code fences retain their syntax and count as fences', () => {
  const quoted = '> ```rust\n> Vec<T>\n> ```\n';
  const nested = '    ```rust\n    Vec<T>\n    ```\n';
  const result = clean(quoted + '\n- Nested:\n' + nested);
  assert.ok(result.body.includes(quoted));
  assert.ok(result.body.includes(nested));
  assert.equal(result.report.code.sourceFences, 2);
  assert.equal(result.report.code.preservedFences, 2);
});

test('removes comments and specific chrome without dropping noprint contents', () => {
  const source = '+++\ntemplate = "index.html"\n+++\n<toc>navigation</toc><noprint>Useful text</noprint>\n<!--\n```rust\nold();\n```\n-->\n<page-controls>theme</page-controls>\n## Printing & PDF\nprint instructions\n<footer>site footer</footer>';
  const result = clean(source);
  assert.equal(result.body.trim(), 'Useful text');
  assert.equal(result.report.code.sourceFences, 0, 'Opaque comments are not displayed code');
  assert.equal(result.report.removed['HTML comment'], 1);
  assert.throws(() => clean('## Printing & PDF\nprint\n## New useful section\nkeep'), /New content follows/);
});

test('unmatched backticks in comments or HTML code cannot swallow later sections', () => {
  const { body, report } = clean('<!-- unmatched ` -->\n\n## Cargo\n`cargo build`\n\n<code>`literal {{ unknown() }}</code>\n\n## Next\n`intact`\n');
  assert.ok(body.includes('## Cargo'));
  assert.ok(body.includes('## Next'));
  assert.ok(body.includes('`` `literal {{ unknown() }} ``'));
  assert.ok(!body.includes('unmatched'));
  assert.equal(report.sourceHeadings.length, 2);
});

test('inline code cannot cross a Markdown paragraph boundary', () => {
  const { body, report } = clean('A stray `\n\n## Heading\n\n`still code`\n');
  assert.ok(body.includes('## Heading'));
  assert.equal(report.sourceHeadings.length, 1);
});

test('all tabs become subsections; unchecked tabs are not discarded', () => {
  const source = '<tabs><tab><input checked><label>First</label><panel>A</panel></tab><tab><input><label><b>Second</b></label><panel>B</panel></tab></tabs>';
  const result = clean(source);
  assert.deepEqual(result.report.tabs, ['First', 'Second']);
  assert.match(result.body, /### First\s+A/);
  assert.match(result.body, /### Second\s+B/);
});

test('header/tab hierarchy keeps later categories out of an earlier tab range', () => {
  const { body } = clean('## Memory\n<header>Numbers</header><tabs><tab><label>Arithmetic</label><panel>A</panel></tab></tabs><header>Textual</header><tabs><tab><label>Strings</label><panel>B</panel></tab></tabs>');
  const sections = makeIndex(body);
  assert.deepEqual(sections.map(({ level, title }) => [level, title]), [[2, 'Memory'], [3, 'Numbers'], [4, 'Arithmetic'], [3, 'Textual'], [4, 'Strings']]);
  assert.ok(sections[2].end < sections[3].start);
});

test('a new Markdown section resets tab nesting left open by upstream HTML', () => {
  const { body } = clean('<tabs><tab><label>Old</label><panel>Old content\n\n## Memory\n<header>Numbers</header><tabs><tab><label>Arithmetic</label><panel>A</panel></tab></tabs>');
  assert.deepEqual(makeIndex(body).slice(1).map(({ level, title }) => [level, title]), [[2, 'Memory'], [3, 'Numbers'], [4, 'Arithmetic']]);
});

test('Cargo abbreviation highlighting survives without changing command syntax', () => {
  const { body } = clean('<code>cargo <span class="cargo-prefix">b</span>uild</code>');
  assert.ok(body.includes('`cargo build` (highlighted abbreviation: `b`)'));
});

test('shortcode link targets and semantic warnings survive', () => {
  const result = clean('{{ book(page="ch04.html#borrowing") }} {{ std(page="std/vec/struct.Vec.html") }} {{ bad() }} {{ experimental() }} {{ edition(ed="\'21") }} {{ opinionated() }} {{ tbl_risk() }} {{ todo() }}');
  assert.match(result.body, /\[Book\]\(https:\/\/doc\.rust-lang\.org\/book\/ch04.html#borrowing\)/);
  for (const phrase of ['std/vec/struct.Vec.html', 'intentionally wrong', 'Unstable / nightly', "Edition '21", 'Opinion', 'Security / correctness risk', 'Missing source / explanation']) assert.ok(result.body.includes(phrase));
});

test('fails closed for unknown tags, shortcodes, arguments, and missing templates', () => {
  assert.throws(() => clean('{{ future_flag() }}'), /Unknown shortcode/);
  assert.throws(() => clean('<new-diagram>content</new-diagram>'), /Unknown HTML element/);
  assert.throws(() => clean('<img src="diagram.svg" alt="Layout">'), /Non-logo image/);
  assert.throws(() => clean('{{ book(page=unquoted) }}'), /Unsupported shortcode arguments/);
  assert.throws(() => clean('{{ book(other="x") }}'), /Missing page/);
  assert.throws(() => clean('{{ book(page="x", extra="y") }}'), /Unexpected arguments/);
  assert.throws(() => clean('{{ book(page="x", page="y") }}'), /Duplicate shortcode argument/);
  assert.throws(() => convert('{{ book(page="x") }}', {}), /Missing shortcode template/);
});

test('semantic classes and HTML code in Markdown pipe tables survive', () => {
  const result = clean('| Code | Meaning |\n|---|---|\n| <code>&vert;x&vert; Vec&lt;T&gt;</code> | <span class="bad">Risk</span> <span class="good">Benefit</span> |');
  assert.ok(result.body.includes('`\\|x\\| Vec<T>`'));
  assert.ok(result.body.includes('[Source: bad]'));
  assert.ok(result.body.includes('[Source: good]'));
});

test('native tables retain empty cells and column-spanning relationships', () => {
  const simple = clean('<table><tr><th>A</th><th>B</th></tr><tr><td></td><td>x</td></tr></table>').body;
  assert.ok(simple.includes('|  | x |'));
  assert.ok(!clean('<code></code>').body.includes('``'), 'Empty HTML code must not create invalid backticks');
  const spanning = clean('<table><tr><th colspan="2">Both</th></tr><tr><td>X</td><td>Y</td></tr></table>').body;
  assert.ok(spanning.includes('Header, columns 1–2: Both'));
  assert.ok(spanning.includes('column 1: X'));
  assert.ok(spanning.includes('column 2: Y'));
  assert.throws(() => clean('<table><tr><td rowspan="2">x</td></tr></table>'), /Row-spanning/);
});

test('diagram roles, byte counts, state flags and arrow geometry survive', () => {
  const result = clean('<lifetime-example><memory-row><memory-backdrop><byte></byte><byte></byte><byte class="borrowed"></byte></memory-backdrop><values><value class="hide t" style="left: 20px; font-size: 8px;">S(1)</value></values><arrow style="left: 20px; width: 40px; border-color: red;"><tip>▼</tip></arrow><failed>invalid</failed></memory-row></lifetime-example>');
  for (const text of ['byte × 2', 'byte [borrowed]', 'hide, t', 'diagram-left=20px', 'diagram-width=40px', 'diagram-border-color=red', 'FAILED: invalid']) assert.ok(result.body.includes(text), text);
  assert.ok(!result.body.includes('font-size'));
  assert.ok(!result.body.includes('<byte>'));
  assert.equal(result.report.diagrams.length, 1);
  assert.throws(() => clean('<datum><new-shape /></datum>'), /Unknown diagram element/);
});

test('pointer metadata, captions, diagrams links, and source-local notes survive', () => {
  const result = clean('<datum><name><code>&amp;[T]</code></name><visual><ptr><code>ptr</code><sub>2/4/8</sub></ptr><sized><code>len</code></sized></visual><description>Length is in elements. {{ ref(page="types/slice.html") }}</description></datum><footnotes><sup>1</sup> Platform-dependent.</footnotes>');
  for (const text of ['&[T]', 'pointer:', '2/4/8', 'size field:', 'len', 'Length is in elements.', 'types/slice.html', '^(1)', 'Platform-dependent.']) assert.ok(result.body.includes(text), text);
});

test('source links remain usable after heading normalization', () => {
  const result = clean('## Pointers {#custom-id}\n[Look](#custom-id) {{ above(target="#custom-id") }}');
  assert.ok(!result.body.includes('{#custom-id}'));
  assert.ok(result.body.includes('[Look](https://cheats.rs/#custom-id)'));
  assert.ok(result.body.includes('[See section](https://cheats.rs/#custom-id)'));
  assert.throws(() => clean('{{ link(url="javascript:evil()") }}'), /Unsafe link scheme/);
});

test('topic ranges skip code headings and include nested subsections', () => {
  const md = '# Root\n## One\n```text\n# not a heading\n```\n### Child\ntext\n## Two\ntext\n';
  assert.deepEqual(makeIndex(md), [
    { level: 1, title: 'Root', start: 1, end: 9 },
    { level: 2, title: 'One', start: 2, end: 7 },
    { level: 3, title: 'Child', start: 6, end: 7 },
    { level: 2, title: 'Two', start: 8, end: 9 },
  ]);
});

test('conversion is deterministic', () => {
  const source = '## Example\n<tab><input><label>All</label><panel>Hi {{ bad() }}</panel></tab>';
  assert.deepEqual(clean(source), clean(source));
});

test('CLI and source-root overrides fail explicitly rather than falling back', () => {
  assert.equal(sourceRoot({}, '/cache', false), '/cache');
  assert.equal(sourceRoot({ RUST_CHEATS_REPO: '/path with spaces' }, '/cache', false), '/path with spaces');
  for (const invalid of ['', 'relative/path', '~/path']) assert.throws(() => sourceRoot({ RUST_CHEATS_REPO: invalid }, '/cache', false), /absolute repository root/);
  assert.throws(() => sourceRoot({ RUST_CHEATS_REPO: '/x' }, '/cache', true), /Unset RUST_CHEATS_REPO/);
  assert.throws(() => options(['--pin', 'master']), /full lowercase/);
  assert.throws(() => options(['--pin', 'a'.repeat(40), '--check']), /cannot be combined/);
  assert.throws(() => options(['--unknown']), /Unknown argument/);
  assert.deepEqual(options(['--fetch', '--check']), { check: true, fetch: true });
});
