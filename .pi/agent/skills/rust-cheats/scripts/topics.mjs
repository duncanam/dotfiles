import { createHash } from 'node:crypto';
import { makeIndex } from './convert.mjs';
import { TOKENIZER, tokenCounts } from './tokens.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const normalized = title => title.trim().replace(/\s+/g, ' ');

export function dependencyOrder(plan, selected) {
  const byId = new Map(plan.map(entry => [entry.id, entry]));
  if (byId.size !== plan.length) throw new Error('Duplicate topic ID');
  const visiting = new Set();
  const complete = new Set();
  const order = [];
  function visit(id) {
    if (complete.has(id)) return;
    if (visiting.has(id)) throw new Error(`Cyclic topic prerequisite: ${id}`);
    const topic = byId.get(id);
    if (!topic) throw new Error(`Unknown topic prerequisite/selection: ${id}`);
    visiting.add(id);
    for (const dependency of topic.requires ?? []) visit(dependency);
    visiting.delete(id);
    complete.add(id);
    order.push(id);
  }
  for (const id of selected) visit(id);
  return order;
}

export function partition(all, plan, sourceURL) {
  if (!all.endsWith('\n')) throw new Error('Reference must end in a newline');
  if (!plan.length) throw new Error('Empty topic plan');
  for (const topic of plan) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topic.id)) throw new Error(`Invalid topic ID: ${topic.id}`);
    if (!topic.group || !topic.description || !topic.from?.title || !Number.isInteger(topic.from.level)) throw new Error(`Incomplete topic: ${topic.id}`);
  }
  dependencyOrder(plan, plan.map(topic => topic.id));
  const sections = makeIndex(all);
  const lines = all.split('\n');
  const starts = plan.map(topic => {
    const matches = sections.filter(section => section.level === topic.from.level && normalized(section.title) === topic.from.title &&
      (!topic.from.within || sections.some(parent => normalized(parent.title) === topic.from.within && parent.start < section.start && parent.end >= section.end)));
    if (matches.length !== 1) throw new Error(`Topic boundary ${topic.id}: expected one heading, found ${matches.length}`);
    return matches[0].start;
  });
  for (let i = 1; i < starts.length; i++) if (starts[i] <= starts[i - 1]) throw new Error(`Topic boundaries out of order: ${plan[i].id}`);
  if (starts[0] <= 1) throw new Error('Expected shared reference preamble before first topic');
  const sourceSlice = (start, end) => lines.slice(start - 1, end).join('\n') + '\n';
  const common = sourceSlice(1, starts[0] - 1);
  const outputs = { 'references/common.md': common };
  const bodies = [];
  const topics = plan.map((topic, index) => {
    const start = starts[index];
    const end = starts[index + 1] ? starts[index + 1] - 1 : lines.length - 1;
    const body = sourceSlice(start, end);
    bodies.push(body);
    const parents = sections.filter(section => section.start < start && section.end >= start).map(section => normalized(section.title));
    const context = parents.slice(1).join(' → ');
    const prerequisites = topic.requires ?? [];
    const header = `# ${topic.group}: ${topic.description}\n\n` +
      `From [cheats.rs](${sourceURL}); archive lines ${start}–${end}.\n` +
      (context ? `Section context: ${context}.\n` : '') +
      (prerequisites.length ? `**Read first:** ${prerequisites.map(id => `[${id}](${id}.md)`).join(', ')} (including their prerequisites; reuse complete reads).\n` : '') +
      `Read with the [shared caveats](../common.md). [Provenance](../../provenance.json) · [Terms](../../NOTICE.md).\n\n---\n\n`;
    const file = `references/topics/${topic.id}.md`;
    const content = header + body;
    outputs[file] = content;
    return {
      id: topic.id, group: topic.group, description: topic.description, file, requires: prerequisites,
      source: { startLine: start, endLine: end, sha256: hash(body) },
      bodyStartLine: header.split('\n').length,
      bytes: Buffer.byteLength(content), bodyTokens: tokenCounts(body), tokens: tokenCounts(content),
    };
  });
  if (common + bodies.join('') !== all) throw new Error('Topic partition lost or duplicated reference content');
  let router = '# Rust reference — topic router\n\n' +
    'Read `common.md`, then the complete relevant file(s) under `topics/`, following their **Read first** prerequisites. Reuse complete reads; search is for discovery, not a substitute for reading the selected files.\n' +
    'Use `sections.md` for the optional detailed index. Read `all.md` only for an explicitly requested full-corpus load, not by default.\n';
  for (const group of [...new Set(plan.map(topic => topic.group))]) {
    router += `\n## ${group}\n\n` + topics.filter(topic => topic.group === group).map(topic => `- \`${topic.id}.md\`: ${topic.description}.`).join('\n') + '\n';
  }
  outputs['references/index.md'] = router;
  let detailed = '# Rust reference — detailed section index\n\n' +
    'Optional lookup aid, not a default full read. Select topics through [index.md](index.md); ranges below refer to [all.md](all.md), include nested subsections, and are inclusive.\n\n' +
    '| Section | Archive lines | Topic file(s) |\n| --- | --- | --- |\n';
  for (const section of sections) {
    const overlaps = topics.filter(topic => topic.source.startLine <= section.end && topic.source.endLine >= section.start);
    detailed += `| ${'↳ '.repeat(section.level - 1)}${section.title.replaceAll('|', '\\|')} | ${section.start}–${section.end} | ${overlaps.map(topic => `[${topic.id}](topics/${topic.id}.md)`).join(', ')} |\n`;
  }
  outputs['references/sections.md'] = detailed;
  const manifest = { formatVersion: 1, tokenizer: TOKENIZER, archive: { file: 'references/all.md', sha256: hash(all), tokens: tokenCounts(all) },
    common: { file: 'references/common.md', source: { startLine: 1, endLine: starts[0] - 1 }, sha256: hash(common), tokens: tokenCounts(common) },
    router: { file: 'references/index.md', tokens: tokenCounts(router) }, topics };
  outputs['references/topics.json'] = JSON.stringify(manifest, null, 2) + '\n';
  return { outputs, manifest };
}
