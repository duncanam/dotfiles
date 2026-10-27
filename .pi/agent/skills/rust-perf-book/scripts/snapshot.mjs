import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const REPOSITORY = 'https://github.com/nnethercote/perf-book';
const ROOT_FILES = ['README.md', 'book.toml', 'LICENSE-MIT', 'LICENSE-APACHE', 'src/SUMMARY.md'];
export const sha256 = data => createHash('sha256').update(data).digest('hex');

export function pages(summary) {
  const result = [];
  for (const line of summary.split('\n')) {
    if (!line.trim() || line === '# Summary') continue;
    const match = /^(?:- )?\[([^\]]+)\]\(([a-z][a-z-]*\.md)\)$/.exec(line);
    if (!match) throw new Error(`Unsupported TOC entry: ${line}`);
    if (result.some(page => page.file === match[2])) throw new Error(`Duplicate TOC page: ${match[2]}`);
    result.push({ title: match[1], file: match[2] });
  }
  if (!result.some(page => page.file === 'introduction.md')) throw new Error('Missing introduction in TOC');
  return result;
}

export function validateManifest(manifest) {
  if (manifest.formatVersion !== 1 || manifest.repository !== REPOSITORY || !/^[a-f0-9]{40}$/.test(manifest.commit)) {
    throw new Error('Invalid snapshot identity');
  }
  if (!manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) throw new Error('Missing source inventory');
  for (const [path, info] of Object.entries(manifest.files)) {
    if (!ROOT_FILES.includes(path) && !/^src\/[a-z][a-z-]*\.md$/.test(path)) throw new Error(`Unsafe/unsupported source path: ${path}`);
    if (!/^[a-f0-9]{64}$/.test(info?.sha256) || !Number.isSafeInteger(info?.bytes) || info.bytes <= 0) throw new Error(`Invalid source hash/size: ${path}`);
  }
  for (const file of ROOT_FILES) if (!Object.hasOwn(manifest.files, file)) throw new Error(`Missing required source: ${file}`);
}

function verifyBytes(file, data, expected) {
  if (data.length !== expected.bytes || sha256(data) !== expected.sha256) throw new Error(`Source hash/size mismatch: ${file}`);
}

async function fileInventory(root, prefix = '') {
  const found = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isFile()) found.push(path);
    else if (entry.isDirectory() && path === 'src') found.push(...await fileInventory(root, path));
    else throw new Error(`Unexpected source entry (including symlinks): ${path}`);
  }
  return found.sort();
}

async function checkSourceDirectories(root) {
  for (const path of ['references', 'references/book', 'references/book/src']) {
    try {
      if (!(await lstat(join(root, path))).isDirectory()) throw new Error(`Source directory must not be a symlink/file: ${path}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

export async function checkSnapshot(root = ROOT) {
  await checkSourceDirectories(root);
  const manifest = JSON.parse(await readFile(join(root, 'provenance.json'), 'utf8'));
  validateManifest(manifest);
  const bookRoot = join(root, 'references/book');
  const inventory = await fileInventory(bookRoot);
  if (JSON.stringify(inventory) !== JSON.stringify(Object.keys(manifest.files).sort())) throw new Error('Bundled file inventory differs from provenance');
  const contents = new Map();
  for (const [file, expected] of Object.entries(manifest.files)) {
    const data = await readFile(join(bookRoot, file));
    verifyBytes(file, data, expected);
    contents.set(file, data.toString('utf8'));
  }
  const toc = pages(contents.get('src/SUMMARY.md'));
  const expectedFiles = [...ROOT_FILES, ...toc.map(page => `src/${page.file}`)].sort();
  if (JSON.stringify(inventory) !== JSON.stringify(expectedFiles)) throw new Error('Snapshot does not contain exactly the TOC pages and required attribution/license files');
  // The inspected Markdown has no local images or mdBook include directives.
  // A future snapshot using them needs an explicit asset/include inventory.
  for (const page of toc) {
    const text = contents.get(`src/${page.file}`);
    if (/(?:^|[\s(])!\[|<img\b|\{\{#(?:include|rustdoc_include|playground)/im.test(text)) throw new Error(`Review new assets/includes in ${page.file}`);
    const links = [...text.matchAll(/\]\(([^\s)]+)\)/g), ...text.matchAll(/^\[[^\]\n]+\]:[ \t]+(\S+)/gm)];
    for (const [, target] of links) {
      if (/^(?:https?:\/\/|#)/.test(target)) continue;
      const [file] = target.split('#');
      if (!toc.some(other => other.file === file)) throw new Error(`Unbundled local link in ${page.file}: ${target}`);
    }
  }
  return { manifest, pages: toc };
}

export async function checkRouter(root = ROOT) {
  const snapshot = await checkSnapshot(root);
  const router = await readFile(join(root, 'references/index.md'), 'utf8');
  const links = [...router.matchAll(/\]\(book\/src\/([a-z][a-z-]*\.md)\)/g)].map(match => match[1]);
  const expected = snapshot.pages.filter(page => page.file !== 'title-page.md').map(page => page.file).sort();
  if (JSON.stringify([...new Set(links)].sort()) !== JSON.stringify(expected)) throw new Error('Router must cover every chapter and no nonexistent chapter');
  const notice = await readFile(join(root, 'NOTICE.md'), 'utf8');
  if (!notice.includes(snapshot.manifest.commit) || !notice.includes('LICENSE-MIT') || !notice.includes('LICENSE-APACHE')) throw new Error('Notice must identify this snapshot and both license files');
  return { files: Object.keys(snapshot.manifest.files).length, pages: snapshot.pages.length, chapters: expected.length };
}

export async function upstreamFiles(manifest, fetcher = fetch) {
  validateManifest(manifest);
  const contents = new Map();
  for (const [file, expected] of Object.entries(manifest.files)) {
    const url = `https://raw.githubusercontent.com/nnethercote/perf-book/${manifest.commit}/${file}`;
    const response = await fetcher(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Cannot read pinned upstream ${file}: HTTP ${response.status}`);
    const data = Buffer.from(await response.arrayBuffer());
    verifyBytes(file, data, expected);
    contents.set(file, data);
  }
  return contents;
}

export function options(args) {
  if (!args.length || (args.length === 1 && args[0] === '--check')) return 'check';
  if (args.length === 1 && ['--verify-upstream', '--restore'].includes(args[0])) return args[0].slice(2);
  throw new Error('Usage: node scripts/snapshot.mjs [--check | --verify-upstream | --restore]');
}

export async function main(args = process.argv.slice(2)) {
  const mode = options(args);
  if (mode !== 'check') {
    const manifest = JSON.parse(await readFile(join(ROOT, 'provenance.json'), 'utf8'));
    // Fetch and verify every byte before writing anything. Restoration never
    // changes the pinned revision, notices, router or provenance.
    const contents = await upstreamFiles(manifest);
    if (mode === 'restore') {
      await checkSourceDirectories(ROOT);
      try {
        for (const file of await fileInventory(join(ROOT, 'references/book'))) {
          if (!contents.has(file)) throw new Error(`Unexpected source file; review/remove explicitly: ${file}`);
        }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      for (const [file, data] of contents) {
        const path = join(ROOT, 'references/book', file);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, data);
      }
    }
  }
  console.log(JSON.stringify(await checkRouter()));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
