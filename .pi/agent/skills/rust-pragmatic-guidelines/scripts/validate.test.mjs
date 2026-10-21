import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { sourceRoot, validate } from './validate.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const key = 'RUST_PRAGMATIC_GUIDELINES_REPO';
async function put(path, text) { await mkdir(join(path, '..'), {recursive:true}); await writeFile(path, text); }

test('repository override is absolute and unset-only; explicit empty never falls back', () => {
  assert.equal(sourceRoot({}, '/home/example'), '/home/example/git/rust-guidelines');
  assert.equal(sourceRoot({[key]:'/with spaces'}, '/home/example'), '/with spaces');
  for (const value of ['', 'relative/path', '~/checkout']) assert.throws(() => sourceRoot({[key]:value}), /absolute repository path/);
});

test('documented setup works without agents/all.txt and rejects invalid/empty source roots', async () => {
  const temp = await mkdtemp(join(tmpdir(),'pragmatic setup-'));
  const repo = join(temp,'git/rust-guidelines');
  const skill = await readFile(join(root,'SKILL.md'),'utf8');
  const setup = /```bash\n([\s\S]*?)\n```/.exec(skill)[1];
  await put(join(repo,'src/guidelines/README.md'),'Overview.\n');
  await put(join(repo,'src/guidelines/checklist/README.md'),'Checklist.\n');
  const env = {...process.env,HOME:temp};
  delete env[key];
  const run = override => spawnSync('/bin/bash',['-c',setup+'\nprintf "%s\\n" "$RUST_GUIDELINES_DIR"'],{env:override === undefined ? env : {...env,[key]:override},encoding:'utf8',timeout:5000});
  try {
    for (const override of [undefined,repo]) {
      const result = run(override);
      assert.equal(result.status,0,result.stderr);
      assert.equal(result.stdout.trim(),join(repo,'src/guidelines'));
    }
    for (const override of ['', 'relative', join(temp,'missing')]) assert.equal(run(override).status,1);
    await writeFile(join(repo,'src/guidelines/README.md'),'');
    assert.equal(run(repo).status,1);
  } finally { await rm(temp,{recursive:true,force:true}); }
});

test('router validates category ownership and coverage without an agent export', async () => {
  const temp = await mkdtemp(join(tmpdir(),'pragmatic-router-'));
  const repo = join(temp,'repo');
  const src = join(repo,'src/guidelines');
  const indexFile = join(temp,'index.md');
  const row = '| Unsafe | `correctness/README.md` | `M-UNSAFE` |\n';
  try {
    await put(join(src,'README.md'),'Overview.\n');
    await put(join(src,'checklist/README.md'),'Checklist.\n');
    await put(join(src,'correctness/README.md'),'{{#include M-UNSAFE.md}}\n');
    await put(join(src,'correctness/M-UNSAFE.md'),'Full rule.\n');
    await put(indexFile,row);
    assert.deepEqual(await validate({repo,indexFile}),{routes:1,categories:1,startingRules:1,sourceRules:1});
    await writeFile(indexFile,row.replace('`M-UNSAFE`','`M-NOT-IN-CATEGORY`'));
    await assert.rejects(validate({repo,indexFile}), /not in this route/);
    await writeFile(indexFile,row);
    await put(join(src,'correctness/M-NEW.md'),'Unindexed new rule.\n');
    await assert.rejects(validate({repo,indexFile}), /not reachable/);
    await writeFile(join(src,'correctness/README.md'),'{{#include M-MISSING.md}}\n');
    await assert.rejects(validate({repo,indexFile}), /missing or unreadable/);
    await writeFile(indexFile,'No routes.\n');
    await assert.rejects(validate({repo,indexFile}), /no task rows/);
  } finally { await rm(temp,{recursive:true,force:true}); }
});

test('instructions require complete selected rules; broad reviews and full export are separate', async () => {
  const skill = await readFile(join(root,'SKILL.md'),'utf8');
  assert.ok(skill.includes('references/index.md'));
  assert.ok(skill.includes('complete applicable `M-*.md` files'));
  assert.ok(skill.includes('not default reads or default\nprerequisites'));
  assert.ok(skill.includes('user explicitly requests the full briefing'));
  assert.ok(skill.includes('broad crate/design review'));
  assert.ok(skill.includes('checklist/README.md'));
});
