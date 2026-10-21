import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { budgetOptions, measureBudget, renderBudget, repositoryRoot } from './context-budget.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('budget flags and repository overrides reject invalid/empty values', () => {
  assert.deepEqual(budgetOptions([]), {mode:'print',contextWindow:200000});
  assert.deepEqual(budgetOptions(['--check','--context','100000']), {mode:'check',contextWindow:100000});
  for (const args of [['--check','--write'],['--context','0'],['--context','oops'],['--context'],['--unknown']]) assert.throws(() => budgetOptions(args));
  assert.equal(repositoryRoot({}, 'REPO', '/default'), '/default');
  assert.equal(repositoryRoot({REPO:'/with spaces'}, 'REPO', '/default'), '/with spaces');
  for (const value of ['', 'relative', '~/relative']) assert.throws(() => repositoryRoot({REPO:value}, 'REPO', '/default'), /absolute repository root/);
});

test('budget counts real baseline files, deduplicates prerequisites and records portable hashes', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'rust budget-'));
  const home = join(temp, 'home');
  const skillRoot = join(temp, 'skills/rust-cheats');
  async function put(path, text) { await mkdir(join(path, '..'), {recursive:true}); await writeFile(path, text); }
  try {
    for (const name of ['rust-api-guidelines','rust-pragmatic-guidelines','rust-cheats']) await put(join(temp, 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: fixture\n---\nInstructions.\n`);
    await put(join(temp,'skills/rust-pragmatic-guidelines/references/index.md'),'Task router: read complete applicable source rules.\n');
    const api = join(home, 'git/api-guidelines');
    const pragmatic = join(home, 'git/rust-guidelines');
    for (const file of ['about.md','checklist.md','naming.md']) await put(join(api, 'src', file), `# ${file}\nAPI guidance.\n`);
    await put(join(pragmatic, 'src/agents/README.md'), 'Agent export instructions.\n');
    await put(join(pragmatic, 'src/agents/all.txt'), 'Full export content.\n');
    await put(join(pragmatic, 'src/guidelines/README.md'), 'Version: fixture\n');
    await put(join(pragmatic, 'src/guidelines/checklist/README.md'), 'Checklist.\n');
    await put(join(pragmatic, 'src/guidelines/correctness/M-ONE.md'), 'A source rule with rationale.\n');
    const topics = [
      {id:'conversions',requires:[]}, {id:'projects-cargo',requires:[]},
      {id:'advanced-traits',requires:['conversions']}, {id:'borrowing',requires:['conversions']},
      {id:'function-lifetimes',requires:['borrowing','conversions']},
    ].map(t => ({...t,file:`references/topics/${t.id}.md`}));
    await put(join(skillRoot, 'references/topics.json'), JSON.stringify({topics}));
    for (const file of ['references/common.md','references/index.md','references/all.md',...topics.map(t => t.file)]) await put(join(skillRoot, file), `${file}\nContent.\n`);
    const inputs = {skillRoot,home,env:{}};
    const result = await measureBudget(inputs);
    assert.deepEqual(result, await measureBudget(inputs));
    assert.equal(result.sourceVersions.pragmatic, 'fixture');
    assert.equal(result.baselines.api.files.length, 3);
    assert.equal(result.baselines.pragmatic.files.length, 3);
    assert.ok(result.baselines.pragmatic.files.includes('skills/rust-pragmatic-guidelines/references/index.md'));
    assert.ok(!result.baselines.pragmatic.files.some(id => id.includes('/agents/')));
    assert.equal(result.optionalAgentExport.available, true);
    assert.equal(result.baselines.cheats.files.length, 3);
    const functionTopic = result.topics.find(t => t.id === 'function-lifetimes');
    assert.equal(functionTopic.withPrerequisites.files.length, 3, 'A transitive prerequisite is read once');
    assert.equal(result.optionalLookups.apiChapters.o200k_base.count, 1);
    assert.equal(result.optionalLookups.pragmaticRules.o200k_base.count, 1);
    for (const scenario of result.scenarios) {
      const sum = scenario.files.reduce((n,id) => n + result.resources.find(r => r.id === id).tokens.o200k_base, 0);
      assert.equal(sum, scenario.tokens.o200k_base);
      assert.equal(200000 - sum, scenario.remainingBeforeOtherCosts.o200k_base);
    }
    assert.ok(result.resources.every(r => /^[a-f0-9]{64}$/.test(r.sha256)));
    assert.ok(!JSON.stringify(result).includes(temp), 'No absolute local paths in report');
    assert.ok(renderBudget(result).includes('not billed dollars'));
    assert.deepEqual(result, await measureBudget({...inputs,env:{RUST_API_GUIDELINES_REPO:api,RUST_PRAGMATIC_GUIDELINES_REPO:pragmatic}}));
    for (const name of ['RUST_API_GUIDELINES_REPO','RUST_PRAGMATIC_GUIDELINES_REPO']) await assert.rejects(measureBudget({...inputs,env:{[name]:''}}), /absolute repository root/);
    await assert.rejects(measureBudget({...inputs,contextWindow:0}), /positive integer/);
    await unlink(join(pragmatic,'src/agents/all.txt'));
    const noExport = await measureBudget(inputs);
    assert.deepEqual(noExport.baselines, result.baselines);
    assert.equal(noExport.optionalAgentExport.available, false);
    assert.equal(noExport.optionalAgentExport.increment, null);
    assert.ok(!noExport.scenarios.some(s => s.name.includes('full Microsoft briefing')));
    assert.ok(renderBudget(noExport).includes('missing, empty, unreadable or incomplete'));
    await writeFile(join(pragmatic,'src/agents/all.txt'),'');
    const emptyExport = await measureBudget(inputs);
    assert.deepEqual(emptyExport.baselines, result.baselines);
    assert.ok(emptyExport.optionalAgentExport.unavailable.some(r => r.reason === 'empty'));
    await unlink(join(pragmatic,'src/agents/README.md'));
    assert.equal((await measureBudget(inputs)).optionalAgentExport.unavailable.length, 2);
    await writeFile(join(pragmatic,'src/guidelines/README.md'),'');
    await assert.rejects(measureBudget(inputs), /empty resource/);
  } finally { await rm(temp, {recursive:true,force:true}); }
});

test('recorded budget Markdown is reproducible without either external checkout', async () => {
  const data = JSON.parse(await readFile(join(root, 'context-budget.json'), 'utf8'));
  assert.equal(await readFile(join(root, 'CONTEXT-BUDGET.md'), 'utf8'), renderBudget(data));
});

test('skill defaults require complete topics, not the archive or snippets', async () => {
  const skill = await readFile(join(root, 'SKILL.md'), 'utf8');
  const router = await readFile(join(root, 'references/index.md'), 'utf8');
  assert.ok(skill.includes('references/common.md') && skill.includes('references/index.md'));
  assert.ok(skill.includes('**the entire selected file**'));
  assert.ok(skill.includes('Do **not** load every topic'));
  assert.ok(skill.includes('explicitly\n   requests the full corpus'));
  assert.ok(router.includes('not by default'));
  assert.ok(!router.includes('Read **all of [all.md]'));
});
