import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convert, makeIndex, SHORTCODES } from './convert.mjs';
import { partition } from './topics.mjs';
import { TOKENIZER, tokenCounts } from './tokens.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const REPOSITORY = 'https://github.com/ralfbiedert/cheats.rs';
const FILES = ['content/_index.md', 'content/legal.md', ...SHORTCODES.map(name => `templates/shortcodes/${name}.html`)].sort();
const hash = data => createHash('sha256').update(data).digest('hex');
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));

export function options(args) {
  const result = { check: false, fetch: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') result.check = true;
    else if (args[i] === '--fetch') result.fetch = true;
    else if (args[i] === '--pin') {
      if (result.pin) throw new Error('--pin may only be given once');
      result.pin = args[++i];
      if (!/^[a-f0-9]{40}$/.test(result.pin ?? '')) throw new Error('--pin requires a full lowercase 40-character commit SHA');
    } else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (result.pin && result.check) throw new Error('--pin and --check cannot be combined');
  return result;
}

export function sourceRoot(env, cache, pinning) {
  if (!Object.hasOwn(env, 'RUST_CHEATS_REPO')) return cache;
  if (pinning) throw new Error('Unset RUST_CHEATS_REPO before --pin; pinning must retrieve the named upstream snapshot');
  if (!env.RUST_CHEATS_REPO || !isAbsolute(env.RUST_CHEATS_REPO)) throw new Error('RUST_CHEATS_REPO must be a non-empty absolute repository root');
  return env.RUST_CHEATS_REPO;
}

async function download(commit, cache, expected) {
  for (let start = 0; start < FILES.length; start += 6) {
    await Promise.all(FILES.slice(start, start + 6).map(async path => {
      const response = await fetch(`https://raw.githubusercontent.com/ralfbiedert/cheats.rs/${commit}/${path}`, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`Download failed: ${path}: HTTP ${response.status}`);
      const data = Buffer.from(await response.arrayBuffer());
      if (expected && hash(data) !== expected[path]) throw new Error(`Upstream hash mismatch: ${path}`);
      const target = join(cache, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, data);
    }));
  }
}

export async function generate(args = process.argv.slice(2)) {
  const opts = options(args);
  const previous = opts.pin ? null : await readJSON(join(ROOT, 'provenance.json'));
  const commit = opts.pin ?? previous.upstream.commit;
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid pinned commit');
  const cache = join(tmpdir(), 'pi-rust-cheats', commit);
  const inputRoot = sourceRoot(process.env, cache, Boolean(opts.pin));
  if (opts.fetch && Object.hasOwn(process.env, 'RUST_CHEATS_REPO')) throw new Error('--fetch cannot be combined with RUST_CHEATS_REPO');
  if (opts.fetch || opts.pin) await download(commit, cache, previous?.upstream.files);
  const inputs = {};
  const hashes = {};
  for (const path of FILES) {
    let data;
    try { data = await readFile(join(inputRoot, path)); }
    catch (error) { throw new Error(`Cannot read ${join(inputRoot, path)}. Use --fetch to fill the external cache, or set RUST_CHEATS_REPO to the matching checkout.`, { cause: error }); }
    hashes[path] = hash(data);
    if (previous && hashes[path] !== previous.upstream.files[path]) throw new Error(`Source hash mismatch: ${path}; use the pinned snapshot, or explicitly review and --pin a new revision`);
    inputs[path] = data.toString('utf8');
  }
  const templates = Object.fromEntries(SHORTCODES.map(name => [name, inputs[`templates/shortcodes/${name}.html`]]));
  const { body, report } = convert(inputs['content/_index.md'], templates);
  const sourceURL = `${REPOSITORY}/blob/${commit}/content/_index.md`;
  const header = `# Rust Language Cheat Sheet — cleaned reference\n\n` +
    `Generated from [cheats.rs Markdown source](${sourceURL}). Revision: \`${commit}\`.\n` +
    `See [provenance](../provenance.json), [conversion policy](../CONVERSION.md), and [upstream terms](../NOTICE.md).\n\n` +
    `This is a formatting adaptation, not a corrected or independently verified Rust specification.\n` +
    `Version/edition warnings and opinions describe the upstream snapshot.\n\n` +
    `**Reading diagrams:** fenced text outlines preserve source nesting, roles, byte runs, labels,\n` +
    `and flags. \`diagram-*\` coordinates/colors are drawing metadata, NOT memory addresses,\n` +
    `ABI offsets, or layout guarantees. \`hide\` denotes hidden source cells/placeholders.\n` +
    `Superscripts appear as \`^(...)\`, subscripts as \`_(...)\`; numbered notes retain their local scope.\n\n---\n\n`;
  const all = header + body;
  const sections = makeIndex(all);
  const plan = await readJSON(join(ROOT, 'topic-plan.json'));
  const { outputs: topicOutputs, manifest: topicManifest } = partition(all, plan, sourceURL);
  const coverage = {
    ...report,
    sourceBytes: Buffer.byteLength(inputs['content/_index.md']),
    outputBytes: Buffer.byteLength(all),
    outputLines: all.split('\n').length - 1,
    approximateTokensAtFourCharacters: Math.ceil(all.length / 4),
    tokenizer: TOKENIZER,
    tokens: tokenCounts(all),
    outputHeadings: sections.length,
    topicFiles: topicManifest.topics.length,
  };
  const outputs = {
    'references/all.md': all,
    'references/conversion-report.json': JSON.stringify(coverage, null, 2) + '\n',
    ...topicOutputs,
  };
  const generatorFiles = {};
  for (const path of ['scripts/convert.mjs', 'scripts/generate.mjs', 'scripts/topics.mjs', 'scripts/tokens.mjs', 'topic-plan.json', 'package-lock.json']) generatorFiles[path] = hash(await readFile(join(ROOT, path)));
  const provenance = {
    formatVersion: 1,
    upstream: { repository: REPOSITORY, commit, sourceURL, files: hashes },
    conversion: { generatorFiles, policy: 'CONVERSION.md', generatedFrom: 'Markdown source, not rendered website HTML', correctionPolicy: 'No silent factual or version corrections' },
    license: { notice: 'NOTICE.md', upstreamTerms: `${REPOSITORY}/blob/${commit}/content/legal.md`, statement: 'Upstream describes CC-BY with additional conditions/exclusions; Rust source snippets CC-0. No specific CC version is asserted.' },
    outputs: Object.fromEntries(Object.entries(outputs).map(([path, text]) => [path, { sha256: hash(text), bytes: Buffer.byteLength(text) }])),
  };
  outputs['provenance.json'] = JSON.stringify(provenance, null, 2) + '\n';
  // Do not leave obsolete topics in the search corpus, or silently delete user files.
  const topicDirectory = join(ROOT, 'references/topics');
  const existingTopics = await readdir(topicDirectory).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  for (const name of existingTopics) {
    if (name.endsWith('.md') && !Object.hasOwn(outputs, `references/topics/${name}`)) throw new Error(`Unexpected/obsolete topic file: ${name}; review and remove it explicitly`);
  }
  // Perform all conversion and validation before replacing any artifacts.
  for (const [path, text] of Object.entries(outputs)) {
    const dest = join(ROOT, path);
    if (opts.check) {
      if (await readFile(dest, 'utf8') !== text) throw new Error(`Generated file is out of date: ${path}`);
    } else {
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, text);
    }
  }
  console.log(`${opts.check ? 'Verified' : 'Generated'} rust-cheats: ${coverage.outputBytes} bytes, ${coverage.outputLines} lines, ${coverage.tokens.o200k_base} tokens (o200k_base).`);
  console.log(`${report.tabs.length} tabs, ${report.diagrams.length} diagram outlines, ${report.code.preservedFences} original code fences; ${sections.length} headings, ${topicManifest.topics.length} topic files.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generate().catch(error => { console.error(error.message); process.exitCode = 1; });
}
