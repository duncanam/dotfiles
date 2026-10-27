import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ROOT, checkRouter, checkSnapshot, options, pages, sha256, upstreamFiles, validateManifest } from './snapshot.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'perf-book-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(join(ROOT, 'references'), join(root, 'references'), { recursive: true });
  for (const file of ['provenance.json', 'NOTICE.md']) await cp(join(ROOT, file), join(root, file));
  return root;
}

const manifest = JSON.parse(await readFile(join(ROOT, 'provenance.json'), 'utf8'));

test('complete unchanged snapshot has all 19 chapters, author page and full licenses', async () => {
  assert.deepEqual(await checkRouter(), { files: 25, pages: 20, chapters: 19 });
  const result = await checkSnapshot();
  assert.equal(result.pages[0].file, 'title-page.md');
  assert.equal(result.pages.at(-1).file, 'compile-times.md');
  const notice = await readFile(join(ROOT, 'NOTICE.md'), 'utf8');
  assert.match(notice, /Nicholas Nethercote and others/);
  assert.match(notice, /MIT option/);
  assert.ok(notice.includes('[LICENSE](LICENSE)'));
  assert.ok(notice.includes('continue to govern `references/book/`'));
});

test('original skill license is MIT without replacing upstream license copies', async () => {
  const license = await readFile(join(ROOT, 'LICENSE'), 'utf8');
  assert.ok(license.startsWith('MIT License\n'));
  assert.match(license, /Copyright \(c\) 2026 Duncan McGough and contributors/);
  assert.ok(license.includes('Permission is hereby granted, free of charge'));
  assert.ok(license.includes('THE SOFTWARE IS PROVIDED "AS IS"'));
  assert.notEqual(license, await readFile(join(ROOT, 'references/book/LICENSE-MIT'), 'utf8'));
  await checkSnapshot(); // Original upstream hashes, including both licenses, still match.
});

test('TOC parser rejects duplicates, traversal and unsupported forms', () => {
  assert.deepEqual(pages('# Summary\n\n- [Introduction](introduction.md)\n'), [{title:'Introduction',file:'introduction.md'}]);
  assert.throws(() => pages('- [Only](only.md)'), /Missing introduction/);
  assert.throws(() => pages('- [Introduction](introduction.md)\n- [Again](introduction.md)'), /Duplicate/);
  for (const bad of ['[Escape](../outside.md)', '[External](https://example.test/page.md)', '{{#include foo.md}}']) {
    assert.throws(() => pages(bad), /Unsupported/);
  }
});

test('manifest requires immutable identity, safe paths and both license texts', () => {
  validateManifest(manifest);
  for (const mutation of [
    m => { m.commit = 'master'; },
    m => { m.repository = 'https://example.test'; },
    m => { m.files['../escape'] = m.files['README.md']; },
    m => { delete m.files['LICENSE-MIT']; },
    m => { delete m.files['LICENSE-APACHE']; },
    m => { m.files['README.md'].sha256 = 'wrong'; },
    m => { m.files['README.md'].bytes = 0; },
  ]) {
    const changed = structuredClone(manifest);
    mutation(changed);
    assert.throws(() => validateManifest(changed));
  }
});

test('offline integrity rejects corrupted, missing and extra source files', async t => {
  const root = await fixture(t);
  const intro = join(root, 'references/book/src/introduction.md');
  await writeFile(intro, 'corrupted');
  await assert.rejects(checkSnapshot(root), /hash\/size mismatch/);
  await unlink(intro);
  await assert.rejects(checkSnapshot(root), /inventory differs/);
  await cp(join(ROOT, 'references/book/src/introduction.md'), intro);
  await writeFile(join(root, 'references/book/src/extra.md'), 'unexpected');
  await assert.rejects(checkSnapshot(root), /inventory differs/);
});

test('reviewed hash changes still require complete local links/assets/includes', async t => {
  const root = await fixture(t);
  const file = 'src/introduction.md';
  for (const [text, error] of [
    ['# Introduction\n[Missing chapter](missing.md)\n', /Unbundled local link/],
    ['# Introduction\n![Diagram](diagram.png)\n', /Review new assets/],
    ['# Introduction\n{{#include extra.rs}}\n', /Review new assets/],
  ]) {
    const changed = structuredClone(manifest);
    changed.files[file] = {bytes:Buffer.byteLength(text),sha256:sha256(text)};
    await writeFile(join(root,'provenance.json'),JSON.stringify(changed));
    await writeFile(join(root,'references/book',file),text);
    await assert.rejects(checkSnapshot(root),error);
  }
});

test('source symlinks are rejected without following them', async t => {
  const root = await fixture(t);
  const target = join(root, 'references/book/src/introduction.md');
  const link = join(root, 'references/book/src/benchmarking.md');
  await unlink(link);
  await symlink(target, link);
  await assert.rejects(checkSnapshot(root), /including symlinks/);
  await rm(join(root, 'references/book'), { recursive: true });
  await symlink(join(ROOT, 'references/book'), join(root, 'references/book'));
  await assert.rejects(checkSnapshot(root), /must not be a symlink/);
});

test('router coverage and notice pin cannot silently drift', async t => {
  const root = await fixture(t);
  const routerPath = join(root, 'references/index.md');
  const router = await readFile(routerPath, 'utf8');
  await writeFile(routerPath, router.replaceAll('book/src/hashing.md', 'book/src/missing.md'));
  await assert.rejects(checkRouter(root), /Router must cover/);
  await writeFile(routerPath, router);
  const notice = join(root, 'NOTICE.md');
  await writeFile(notice, (await readFile(notice, 'utf8')).replaceAll(manifest.commit, 'wrong'));
  await assert.rejects(checkRouter(root), /Notice must identify/);
});

test('upstream verification checks every pinned file and rejects HTTP/hash failures', async () => {
  const prefix = `https://raw.githubusercontent.com/nnethercote/perf-book/${manifest.commit}/`;
  const calls = [];
  const files = await upstreamFiles(manifest, async (url, opts) => {
    assert.ok(url.startsWith(prefix));
    assert.ok(opts.signal instanceof AbortSignal);
    const path = url.slice(prefix.length);
    calls.push(path);
    return new Response(await readFile(join(ROOT, 'references/book', path)));
  });
  assert.equal(files.size, 25);
  assert.deepEqual(calls.sort(), Object.keys(manifest.files).sort());
  await assert.rejects(upstreamFiles(manifest, async () => new Response('', {status:404})), /HTTP 404/);
  await assert.rejects(upstreamFiles(manifest, async () => new Response('wrong')), /hash\/size mismatch/);
});

test('CLI requires explicit network/restoration and rejects ambiguous flags', () => {
  assert.equal(options([]), 'check');
  assert.equal(options(['--check']), 'check');
  assert.equal(options(['--verify-upstream']), 'verify-upstream');
  assert.equal(options(['--restore']), 'restore');
  for (const args of [['--pin', 'master'], ['--fetch'], ['--check','--restore']]) assert.throws(() => options(args), /Usage/);
});

test('skill reads complete selected chapters and requires methodology for optimization', async () => {
  const skill = await readFile(join(ROOT, 'SKILL.md'), 'utf8');
  assert.ok(skill.includes('references/book/src/introduction.md'));
  assert.ok(skill.includes('references/index.md'));
  assert.ok(skill.includes('**the entire relevant chapter(s)**'));
  assert.ok(skill.includes('Do not load the whole book by default'));
  assert.match(skill, /optimization work, also read complete `benchmarking.md` and\n   `general-tips.md`/);
  assert.ok(skill.includes('also read `profiling.md`'));
  assert.ok(skill.includes('license: MIT'));
});
