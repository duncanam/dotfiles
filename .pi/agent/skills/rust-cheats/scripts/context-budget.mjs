import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dependencyOrder } from './topics.mjs';
import { TOKENIZER, tokenCounts } from './tokens.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const hash = text => createHash('sha256').update(text).digest('hex');
const encodings = ['o200k_base', 'cl100k_base'];

export function repositoryRoot(env, name, fallback) {
  const root = Object.hasOwn(env, name) ? env[name] : fallback;
  if (!root || !isAbsolute(root)) throw new Error(`${name} must be a non-empty absolute repository root`);
  return root;
}

export function budgetOptions(args) {
  const opts = { mode: 'print', contextWindow: 200000 };
  for (let i = 0; i < args.length; i++) {
    if (['--write', '--check'].includes(args[i])) {
      if (opts.mode !== 'print') throw new Error('Choose only one of --write or --check');
      opts.mode = args[i].slice(2);
    } else if (args[i] === '--context') {
      opts.contextWindow = Number(args[++i]);
      if (!Number.isSafeInteger(opts.contextWindow) || opts.contextWindow <= 0) throw new Error('--context requires a positive integer');
    } else throw new Error(`Unknown argument: ${args[i]}`);
  }
  return opts;
}

async function markdownFiles(root, prefix = '') {
  const found = [];
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    // Do not follow symlinks to unrelated repositories or directories.
    if (entry.isDirectory()) found.push(...await markdownFiles(root, path));
    else if (entry.isFile() && entry.name.endsWith('.md')) found.push(path);
  }
  return found;
}

function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return { count: 0, min: 0, median: 0, max: 0, sum: 0 };
  const middle = Math.floor(sorted.length / 2);
  return { count: sorted.length, min: sorted[0], median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    max: sorted.at(-1), sum: sorted.reduce((a, b) => a + b, 0) };
}

export async function measureBudget({ skillRoot = ROOT, env = process.env, home = homedir(), contextWindow = 200000 } = {}) {
  if (!Number.isSafeInteger(contextWindow) || contextWindow <= 0) throw new Error('Context window must be a positive integer');
  const apiRoot = repositoryRoot(env, 'RUST_API_GUIDELINES_REPO', join(home, 'git/api-guidelines'));
  const pragmaticRoot = repositoryRoot(env, 'RUST_PRAGMATIC_GUIDELINES_REPO', join(home, 'git/rust-guidelines'));
  const resources = new Map();
  const contents = new Map();
  const unavailable = [];
  async function add(id, path, { optional = false } = {}) {
    let text;
    try { text = await readFile(path, 'utf8'); }
    catch (cause) {
      if (optional) { unavailable.push({ id, reason: cause.code ?? 'unreadable' }); return null; }
      throw new Error(`Cannot measure ${id} at ${path}; check the matching skill/source override`, { cause });
    }
    if (!text.trim()) {
      if (optional) { unavailable.push({ id, reason: 'empty' }); return null; }
      throw new Error(`Cannot measure empty resource: ${id}`);
    }
    resources.set(id, { id, bytes: Buffer.byteLength(text), sha256: hash(text), tokens: tokenCounts(text) });
    contents.set(id, text);
    return id;
  }
  function total(ids) {
    const files = [...new Set(ids)];
    const tokens = Object.fromEntries(encodings.map(encoding => [encoding, files.reduce((sum, id) => {
      if (!resources.has(id)) throw new Error(`Unmeasured resource: ${id}`);
      return sum + resources.get(id).tokens[encoding];
    }, 0)]));
    return { files, tokens, percentOfContext: Object.fromEntries(encodings.map(e => [e, Math.round(tokens[e] / contextWindow * 10000) / 100])),
      remainingBeforeOtherCosts: Object.fromEntries(encodings.map(e => [e, contextWindow - tokens[e]])) };
  }
  const wrappers = {};
  for (const skill of ['rust-api-guidelines', 'rust-pragmatic-guidelines', 'rust-cheats']) {
    wrappers[skill] = await add(`skills/${skill}/SKILL.md`, join(dirname(skillRoot), skill, 'SKILL.md'));
  }
  const apiFiles = [];
  for (const file of await markdownFiles(join(apiRoot, 'src'))) apiFiles.push(await add(`api/src/${file}`, join(apiRoot, 'src', file)));
  const pragmaticFiles = [];
  for (const file of await markdownFiles(join(pragmaticRoot, 'src/guidelines'))) pragmaticFiles.push(await add(`pragmatic/src/guidelines/${file}`, join(pragmaticRoot, 'src/guidelines', file)));
  const pragmaticRouter = await add('skills/rust-pragmatic-guidelines/references/index.md', join(dirname(skillRoot), 'rust-pragmatic-guidelines/references/index.md'));
  const agentExportFiles = ['pragmatic/src/agents/README.md', 'pragmatic/src/agents/all.txt'];
  await add(agentExportFiles[0], join(pragmaticRoot, 'src/agents/README.md'), { optional: true });
  await add(agentExportFiles[1], join(pragmaticRoot, 'src/agents/all.txt'), { optional: true });
  const exportAvailable = agentExportFiles.every(id => resources.has(id));
  const topicManifest = JSON.parse(await readFile(join(skillRoot, 'references/topics.json'), 'utf8'));
  for (const file of ['references/common.md', 'references/index.md', 'references/all.md', ...topicManifest.topics.map(t => t.file)]) {
    await add(`cheats/${file}`, join(skillRoot, file));
  }
  const baselines = {
    api: total([wrappers['rust-api-guidelines'], 'api/src/about.md', 'api/src/checklist.md']),
    pragmatic: total([wrappers['rust-pragmatic-guidelines'], pragmaticRouter, 'pragmatic/src/guidelines/README.md']),
    cheats: total([wrappers['rust-cheats'], 'cheats/references/common.md', 'cheats/references/index.md']),
  };
  const baseFiles = Object.values(baselines).flatMap(b => b.files);
  const byId = new Map(topicManifest.topics.map(topic => [topic.id, topic]));
  const topicFiles = ids => dependencyOrder(topicManifest.topics, ids).map(id => `cheats/${byId.get(id).file}`);
  const topics = topicManifest.topics.map(topic => ({id:topic.id, direct:total([`cheats/${topic.file}`]),
    withPrerequisites:total(topicFiles([topic.id]))}));
  const apiChapters = apiFiles.filter(id => !['about.md','checklist.md','SUMMARY.md','external-links.md'].some(name => id === `api/src/${name}`));
  const pragmaticRules = pragmaticFiles.filter(id => /\/M-[^/]+\.md$/.test(id));
  const pragmaticIndexes = pragmaticFiles.filter(id => id.endsWith('/README.md') && id !== 'pragmatic/src/guidelines/README.md');
  const lookupStats = files => ({ files, ...Object.fromEntries(encodings.map(e => [e, distribution(files.map(id => resources.get(id).tokens[e]))])) });
  const scenarios = [
    { name: 'All three baselines, before cheat topics or source lookup', ...total(baseFiles) },
    { name: 'All three + conversions topic', ...total([...baseFiles, ...topicFiles(['conversions'])]) },
    { name: 'All three + projects/Cargo topic', ...total([...baseFiles, ...topicFiles(['projects-cargo'])]) },
    { name: 'All three + advanced traits and prerequisites', ...total([...baseFiles, ...topicFiles(['advanced-traits'])]) },
    { name: 'All three + function lifetimes and prerequisites', ...total([...baseFiles, ...topicFiles(['function-lifetimes'])]) },
    { name: 'All three baselines + explicit full cheat archive instead of topics', ...total([...baseFiles, 'cheats/references/all.md']) },
  ];
  if (exportAvailable) scenarios.push({ name: 'All three baselines + explicitly requested full Microsoft briefing', ...total([...baseFiles, ...agentExportFiles]) });
  const frontmatter = Object.values(wrappers).map(id => /^---\r?\n[\s\S]*?\r?\n---/.exec(contents.get(id))?.[0] ?? '').join('\n');
  const tooling = {};
  for (const path of ['scripts/context-budget.mjs', 'scripts/tokens.mjs', 'package-lock.json']) tooling[path] = hash(await readFile(join(ROOT, path)));
  return {
    formatVersion: 1, contextWindow,
    method: { tokenizer: TOKENIZER, encodings, unit: 'Sum of raw UTF-8 file-text token counts; the same file ID counted once per scenario',
      excludes: ['tool/chat framing', 'agent/system instructions outside these three SKILL.md files', 'conversation and task code', 'reasoning/output reserve', 'other skill activations'],
      assumptions: ['API baseline has no additional agent export in the inspected checkout; any future/custom briefing must be added explicitly.',
        'Default file lists implement the measured SKILL.md policies; review this script when those policies change.',
        'Task-specific source rules are additional required reads for the selected scope; a router or checklist is not the guidance itself.',
        'The Microsoft agent export is optional; its availability and cost are reported separately, never included in the default baseline.',
        'Tokenizer counts are not universal provider counts, token prices, or exact Pi prompt measurements.'] },
    sourceVersions: { pragmatic: /^Version:\s*(.+)$/m.exec(contents.get('pragmatic/src/guidelines/README.md'))?.[1] ?? 'unspecified; see input hashes' },
    tooling,
    availability: { frontmatterTextProxy: tokenCounts(frontmatter), note: 'Only names/descriptions/paths are advertised before activation. This raw-frontmatter proxy excludes actual Pi formatting and paths; it is not the full baseline.' },
    baselines, topics,
    optionalAgentExport: { available: exportAvailable, files: agentExportFiles, unavailable, increment: exportAvailable ? total(agentExportFiles) : null },
    topicDistribution: {
      direct: Object.fromEntries(encodings.map(e => [e, distribution(topics.map(t => t.direct.tokens[e]))])),
      withPrerequisites: Object.fromEntries(encodings.map(e => [e, distribution(topics.map(t => t.withPrerequisites.tokens[e]))])),
    },
    optionalLookups: { apiChapters: lookupStats(apiChapters), pragmaticRules: lookupStats(pragmaticRules), pragmaticIndexes: lookupStats(pragmaticIndexes) },
    scenarios,
    resources: [...resources.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  };
}

export function renderBudget(report) {
  const n = value => value.toLocaleString('en-US', { maximumFractionDigits: 1 });
  const resource = id => report.resources.find(r => r.id === id).tokens.o200k_base;
  const topic = report.topicDistribution.direct.o200k_base;
  const prerequisites = report.topicDistribution.withPrerequisites.o200k_base;
  const exportCost = report.resources.find(r => r.id === 'pragmatic/src/agents/all.txt')?.tokens.o200k_base;
  const exportStatus = report.optionalAgentExport.available ? 'The optional briefing and its README are available.' : 'The optional briefing is missing, empty, unreadable or incomplete; see optionalAgentExport in the JSON report.';
  let text = '# Rust skill context budget\n\nGenerated by `npm run budget -- --write`; do not hand-edit the numeric report.\n\n' +
    `Budget: **${n(report.contextWindow)} tokens per agent**. Counts use ${report.method.tokenizer}; the tables use \`o200k_base\`, with \`cl100k_base\` alongside where useful. These are raw file-text input counts, not billed dollars or exact provider prompt usage.\n\n` +
    '## Availability is not activation\n\nPi advertises skill names, descriptions and paths; it does not load every skill body or reference at startup. ' +
    `The three frontmatters together are ${n(report.availability.frontmatterTextProxy.o200k_base)} tokens as a rough advertisement-text proxy (actual formatting/path overhead differs). The larger costs below occur when the skills are invoked.\n\n` +
    '## Default activation costs\n\n| Skill | o200k tokens | cl100k tokens | % of context | Included |\n| --- | ---: | ---: | ---: | --- |\n';
  const descriptions = { api: ['Rust API Guidelines', 'SKILL.md + about.md + checklist.md'], pragmatic: ['Microsoft Pragmatic Guidelines', 'SKILL.md + task router + guidelines README; source rules extra'], cheats: ['Rust cheats: routing baseline', 'SKILL.md + common caveats + compact router; topics extra'] };
  for (const [id, baseline] of Object.entries(report.baselines)) text += `| ${descriptions[id][0]} | ${n(baseline.tokens.o200k_base)} | ${n(baseline.tokens.cl100k_base)} | ${baseline.percentOfContext.o200k_base}% | ${descriptions[id][1]} |\n`;
  text += `\nMicrosoft's \`src/agents/all.txt\` is **not loaded by default**${exportCost === undefined ? '' : `; that file alone would add **${n(exportCost)} tokens**`}. ${exportStatus} Normal routing does not depend on it. The API skill does **not** load its entire book: its about/checklist baseline is ${n(resource('api/src/about.md') + resource('api/src/checklist.md'))} tokens before the skill wrapper. No extra API agent export exists in the inspected checkout; a future/custom export would add cost.\n\n` +
    '## Cheat topics\n\n' +
    `The ${topic.count} generated topic files (including their headers) range from **${n(topic.min)}–${n(topic.max)} tokens**, median **${n(topic.median)}**. After recursively including prerequisites once, the per-selection increment ranges from **${n(prerequisites.min)}–${n(prerequisites.max)}**, median **${n(prerequisites.median)}**. Add the routing baseline above. These increments describe one selected topic; multi-topic questions need the union of their file sets.\n\n` +
    `The full cheat archive is **${n(resource('cheats/references/all.md'))} tokens** and is no longer a default read. Do not read it as well as the topic copies.\n\n` +
    '## Combined scenarios\n\nThese totals include all three skill baselines and the named cheat topics/prerequisites or explicitly requested exports, but **exclude task-specific API chapters and Microsoft source rules**. The full-archive example conservatively includes the already-read common preamble again inside the archive.\n\n' +
    '| Loaded material | Tokens | % of context | Remainder before other costs |\n| --- | ---: | ---: | ---: |\n';
  for (const scenario of report.scenarios) text += `| ${scenario.name} | ${n(scenario.tokens.o200k_base)} | ${scenario.percentOfContext.o200k_base}% | ${n(scenario.remainingBeforeOtherCosts.o200k_base)} |\n`;
  text += '\nThe remainder is **not** all free working space: agent/system prompts, tools, conversation, code, other skills, and reasoning/output reserve still need to fit. These are per-agent budgets; several agents do not share one 200k window.\n\n' +
    '## Additional source lookup costs\n\nFull relevant source reads remain required by the guideline skills: the task router and checklist are not substitutes. Even an explicitly requested export does not make separately read source rules free. Files below are **not all loaded by default**, but selected applicable rules are mandatory.\n\n' +
    '| Task-specific lookup collection | Files | Median per file | Largest file | All files combined |\n| --- | ---: | ---: | ---: | ---: |\n';
  for (const [id, label] of [['apiChapters','API chapters (excluding baseline, TOC and external links)'],['pragmaticRules','Microsoft M-* source rules'],['pragmaticIndexes','Microsoft category/checklist READMEs']]) {
    const stats = report.optionalLookups[id].o200k_base;
    text += `| ${label} | ${stats.count} | ${n(stats.median)} | ${n(stats.max)} | ${n(stats.sum)} |\n`;
  }
  text += '\n## Practical choice for 200k agents\n\n' +
    '- Keep the small API baseline and topic-based cheats. Complete relevant files retain their warnings and exceptions without the full encyclopedia cost.\n' +
    '- Microsoft now uses its small overview and task router, then complete relevant source files. The full agent briefing is opt-in. This trades broad always-present coverage for deliberate scope selection; consider cross-cutting safety, API, testing and build concerns before narrowing.\n' +
    '- Broad Microsoft reviews additionally load the upstream checklist and all applicable source rules. Add those lookup costs to the examples above; the smaller baseline is not a claim that a thorough review is free.\n' +
    '- Reuse complete reads already in active context. Do not reread the same prerequisites or append both a topic set and its full archive. A compacted summary is not a complete source read.\n' +
    '- Prompt caching may reduce billing or latency, but does not reclaim context capacity. Dollar cost depends on provider/model and cache pricing, which this report does not assume.\n\n' +
    '## Snapshot and reproduction\n\n' +
    `Microsoft source version: **${report.sourceVersions.pragmatic}**. Exact measured file sizes, SHA-256 hashes, both tokenizer counts, prerequisite closures and baseline file lists are in [context-budget.json](context-budget.json). No machine-specific absolute paths or timestamps are recorded.\n\n` +
    'After `npm ci --ignore-scripts`, run `npm run budget` to inspect current JSON, `npm run budget -- --write` to refresh this report, or `npm run budget -- --check` to verify it. The two guideline skills must be siblings of this one; configure their absolute repository roots with `RUST_API_GUIDELINES_REPO` and `RUST_PRAGMATIC_GUIDELINES_REPO`, or use their documented defaults. Empty, missing, unreadable or invalid required inputs fail rather than falling back. Optional agent-export availability is reported without blocking the normal baseline measurement. Use `--context 200000` to change the modeled window explicitly.\n\n' +
    'The budget command is optional maintenance, never a skill-load step. Ordinary cheat generation/checks do not require either guideline checkout. Counts are sums of file text without read-tool envelopes, repeated truncation notices or chat framing. Different provider tokenizers can differ; neither encoding is asserted to be Claude\'s tokenizer.\n';
  return text;
}

export async function budget(args = process.argv.slice(2)) {
  const opts = budgetOptions(args);
  const report = await measureBudget({ contextWindow: opts.contextWindow });
  const outputs = { 'context-budget.json': JSON.stringify(report, null, 2) + '\n', 'CONTEXT-BUDGET.md': renderBudget(report) };
  if (opts.mode === 'print') { console.log(outputs['context-budget.json']); return; }
  for (const [path, text] of Object.entries(outputs)) {
    if (opts.mode === 'check') {
      if (await readFile(join(ROOT, path), 'utf8') !== text) throw new Error(`Context budget is out of date: ${path}`);
    } else await writeFile(join(ROOT, path), text);
  }
  console.log(`${opts.mode === 'check' ? 'Verified' : 'Wrote'} context budget for ${report.contextWindow} tokens.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  budget().catch(error => { console.error(error.message); process.exitCode = 1; });
}
