import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import MarkdownIt from 'markdown-it';
import { dependencyOrder, partition } from './topics.mjs';
import { tokenCounts } from './tokens.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = '# Archive\nShared caveats.\n\n## One\nFirst.\n\n## Two\nSecond.\n';
const plan = [
  { id: 'one', group: 'G', description: 'first topic', from: {level:2,title:'One'} },
  { id: 'two', group: 'G', description: 'second topic', from: {level:2,title:'Two'}, requires:['one'] },
];
const url = 'https://example.com/source';
const body = (outputs, topic) => outputs[topic.file].split('\n').slice(topic.bodyStartLine - 1).join('\n');

test('heading-based partition survives earlier line insertions and preserves all text', () => {
  const original = partition(fixture, plan, url);
  const shifted = partition(fixture.replace('Shared caveats.', 'Shared caveats.\nMore context.'), plan, url);
  assert.equal(original.outputs['references/common.md'] + original.manifest.topics.map(t => body(original.outputs, t)).join(''), fixture);
  for (let i=0; i<plan.length; i++) assert.equal(body(original.outputs, original.manifest.topics[i]), body(shifted.outputs, shifted.manifest.topics[i]));
  assert.match(original.outputs['references/topics/two.md'], /Read first.*\[one\]\(one.md\)/);
  assert.deepEqual(original, partition(fixture, plan, url));
});

test('missing, ambiguous, reordered and unsafe topic boundaries fail closed', () => {
  assert.throws(() => partition(fixture, [], url), /Empty topic plan/);
  assert.throws(() => partition(fixture, [{...plan[0], id:'../escape'}], url), /Invalid topic ID/);
  assert.throws(() => partition(fixture, [plan[0], {...plan[1], from:{level:2,title:'Missing'}}], url), /expected one heading/);
  assert.throws(() => partition(fixture + '\n## One\nDuplicate.\n', plan, url), /found 2/);
  assert.throws(() => partition(fixture, [...plan].reverse(), url), /out of order/);
  assert.throws(() => partition(fixture, [plan[0], plan[0]], url), /Duplicate topic ID/);
});

test('prerequisites are validated, transitive and read only once per selected set', () => {
  const deps = [...plan, {id:'three', requires:['two','one']}];
  assert.deepEqual(dependencyOrder(deps, ['three','two']), ['one','two','three']);
  assert.throws(() => dependencyOrder(deps, ['missing']), /Unknown topic/);
  assert.throws(() => dependencyOrder([{id:'a',requires:['b']},{id:'b',requires:['a']}], ['a']), /Cyclic/);
  assert.throws(() => dependencyOrder([{id:'a',requires:['unknown']}], ['a']), /Unknown topic/);
});

test('generated topic bodies reconstruct the unchanged original archive byte-for-byte', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'references/topics.json'), 'utf8'));
  const all = await readFile(join(root, 'references/all.md'), 'utf8');
  assert.equal(createHash('sha256').update(all).digest('hex'), 'e228b442b2393151aaab3621ce170677d644f0e085d868a2a114102ebef3c9e2');
  assert.equal(manifest.topics.length, 32);
  let reconstructed = await readFile(join(root, manifest.common.file), 'utf8');
  for (const topic of manifest.topics) {
    const content = await readFile(join(root, topic.file), 'utf8');
    const source = content.split('\n').slice(topic.bodyStartLine - 1).join('\n');
    assert.equal(createHash('sha256').update(source).digest('hex'), topic.source.sha256);
    assert.deepEqual(tokenCounts(content), topic.tokens);
    assert.ok(topic.tokens.o200k_base <= 6000, `Review topic growth: ${topic.id}`);
    assert.ok(Buffer.byteLength(content) < 50000, 'A topic should fit in one ordinary read response');
    reconstructed += source;
  }
  assert.equal(reconstructed, all);
  assert.deepEqual(dependencyOrder(manifest.topics, ['function-lifetimes','borrowing']), ['moves-and-stack','borrowing','function-lifetimes']);
});

test('splitting preserves parsed code blocks and leaves no unresolved HTML', async () => {
  const md = new MarkdownIt({html:true});
  const manifest = JSON.parse(await readFile(join(root, 'references/topics.json'), 'utf8'));
  const original = md.parse(await readFile(join(root, 'references/all.md'), 'utf8'), {});
  const parts = [];
  const flatten = tokens => tokens.flatMap(token => [token, ...flatten(token.children ?? [])]);
  for (const topic of manifest.topics) {
    const parsed = md.parse(await readFile(join(root, topic.file), 'utf8'), {});
    assert.equal(flatten(parsed).filter(t => ['html_inline','html_block'].includes(t.type)).length, 0, topic.id);
    parts.push(...parsed);
  }
  const fences = tokens => tokens.filter(t => t.type === 'fence').map(t => [t.info, t.content]);
  assert.deepEqual(fences(parts), fences(original));
});
