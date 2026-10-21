import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import MarkdownIt from 'markdown-it';
import { makeIndex } from './convert.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const provenance = JSON.parse(await readFile(join(root, 'provenance.json'), 'utf8'));
const report = JSON.parse(await readFile(join(root, 'references/conversion-report.json'), 'utf8'));
const all = await readFile(join(root, 'references/all.md'), 'utf8');
const md = new MarkdownIt({ html: true });
const tokens = md.parse(all, {});
const flatten = tokens => tokens.flatMap(token => [token, ...flatten(token.children ?? [])]);
const flat = flatten(tokens);
const sha256 = data => createHash('sha256').update(data).digest('hex');

test('reviewed snapshot inventory stays complete, not merely self-consistent', () => {
  // Deliberately review these values, along with NOTICE, when repinning.
  assert.deepEqual([provenance.upstream.commit, report.sourceHeadings.length, report.sourceTabs, report.diagrams.length, report.code.preservedFences],
    ['f153e8e1da51e909fb6e1ed210013c6aadab80c2', 60, 80, 167, 69]);
});

test('generated output hashes/sizes match provenance', async () => {
  for (const [path, expected] of Object.entries(provenance.outputs)) {
    const data = await readFile(join(root, path));
    assert.equal(data.length, expected.bytes, path);
    assert.equal(sha256(data), expected.sha256, path);
  }
  assert.match(provenance.upstream.commit, /^[a-f0-9]{40}$/);
  assert.ok(provenance.upstream.sourceURL.includes(provenance.upstream.commit));
  assert.ok((await readFile(join(root, 'NOTICE.md'), 'utf8')).includes(provenance.upstream.commit), 'Review and update NOTICE on repin');
});

test('cleaned reference parses without raw HTML or template expressions outside code', () => {
  assert.deepEqual(flat.filter(token => ['html_inline', 'html_block'].includes(token.type)).map(token => token.content), []);
  assert.deepEqual(flat.filter(token => token.type === 'text' && /\{\{\s*\w+\s*\(/.test(token.content)).map(token => token.content), []);
});

test('all original displayed fences and diagram fences parse as code', () => {
  assert.equal(tokens.filter(token => token.type === 'fence').length, report.code.preservedFences + report.diagrams.length);
  assert.equal(report.code.sourceFences, report.code.preservedFences + report.code.omittedCommentOrChromeFences);
  assert.equal(report.tabs.length, report.sourceTabs);
  assert.equal(report.diagrams.length, tokens.filter(token => token.type === 'fence' && token.info === 'text').length);
});

test('index ranges agree with parsed Markdown heading locations', () => {
  const sections = makeIndex(all);
  const parsedStarts = tokens.filter(token => token.type === 'heading_open').map(token => token.map[0] + 1);
  assert.deepEqual(sections.map(section => section.start), parsedStarts);
  assert.equal(sections.length, report.outputHeadings);
  for (const section of sections) {
    assert.ok(section.end >= section.start);
    assert.ok(section.end <= report.outputLines);
  }
});

test('reference/index/documentation links have safe schemes and existing local targets', async () => {
  const paths = [...Object.keys(provenance.outputs).filter(path => path.endsWith('.md')), 'SKILL.md', 'README.md', 'CONVERSION.md', 'NOTICE.md', 'CONTEXT-BUDGET.md'];
  for (const path of paths) {
    const parsed = flatten(md.parse(await readFile(join(root, path), 'utf8'), {}));
    for (const token of parsed.filter(token => token.type === 'link_open')) {
      const href = token.attrs.find(([name]) => name === 'href')[1];
      if (/^https?:\/\//.test(href)) { new URL(href); continue; }
      assert.ok(!isAbsolute(href) && !/^\w+:/.test(href), `Unexpected link: ${path}: ${href}`);
      const dest = resolve(dirname(join(root, path)), decodeURIComponent(href.split('#')[0]));
      assert.ok(!relative(root, dest).startsWith('..'), 'Local link must stay within skill');
      assert.ok((await stat(dest)).isFile(), `${path}: ${href}`);
    }
  }
});

test('important safety/interpretation sections and lookup facilities remain present', () => {
  for (const title of ['Thread Safety', 'Atomics & Cache', 'Type Conversions', 'Cargo', 'Cross Compilation', 'Namespaces', 'Unsafe, Unsound, Undefined', 'Adversarial Code', 'API Stability']) assert.ok(makeIndex(all).some(section => section.title.startsWith(title)), title);
  for (const warning of ['Pitfall / intentionally wrong', 'Unstable / nightly', 'Deprecated / outdated', 'Security / correctness risk', 'diagram-left=']) assert.ok(all.includes(warning), warning);
  assert.ok(tokens.filter(token => token.type === 'table_open').length > 50, 'Reference tables remain structured Markdown');
});
