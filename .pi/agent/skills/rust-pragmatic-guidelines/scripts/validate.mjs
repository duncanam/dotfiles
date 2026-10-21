import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

export function sourceRoot(env = process.env, home = homedir()) {
  const key = 'RUST_PRAGMATIC_GUIDELINES_REPO';
  const root = Object.hasOwn(env, key) ? env[key] : join(home, 'git/rust-guidelines');
  if (!root || !isAbsolute(root)) throw new Error(`${key} must be a non-empty absolute repository path`);
  return root;
}

async function required(path) {
  let text;
  try { text = await readFile(path, 'utf8'); }
  catch (cause) { throw new Error(`Required guideline source missing or unreadable: ${path}`, {cause}); }
  if (!text.trim()) throw new Error(`Required guideline source empty: ${path}`);
  return text;
}

async function ruleFiles(root, prefix = '') {
  const found = [];
  for (const entry of await readdir(join(root, prefix), {withFileTypes:true})) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...await ruleFiles(root, path));
    else if (entry.isFile() && /^M-[A-Z0-9-]+\.md$/.test(entry.name)) found.push(path);
  }
  return found.sort(); // Do not follow symlinks outside the source tree.
}

export async function validate({ repo = sourceRoot(), indexFile = join(ROOT, 'references/index.md') } = {}) {
  if (!repo || !isAbsolute(repo)) throw new Error('Repository root must be absolute');
  const src = join(repo, 'src/guidelines');
  await required(join(src, 'README.md'));
  await required(join(src, 'checklist/README.md'));
  const index = await required(indexFile);
  const covered = new Set();
  const categories = new Map();
  const ids = new Set();
  let routes = 0;
  for (const line of index.split('\n')) {
    if (!line.startsWith('| ')) continue;
    const paths = [...line.matchAll(/`([a-z/-]+\/README\.md)`/g)].map(m => m[1]);
    if (!paths.length) continue;
    routes++;
    const localIds = new Set();
    for (const path of paths) {
      if (!categories.has(path)) {
        const text = await required(join(src, path));
        const included = [...text.matchAll(/\{\{#include\s+(M-[A-Z0-9-]+\.md)\s*\}\}/g)].map(m => m[1]);
        if (!included.length) throw new Error(`No rule includes in ${path}; review router/source structure`);
        for (const file of included) {
          const relative = `${dirname(path)}/${file}`;
          await required(join(src, relative));
          covered.add(relative);
        }
        categories.set(path, included.map(file => file.slice(0,-3)));
      }
      for (const id of categories.get(path)) localIds.add(id);
    }
    for (const match of line.matchAll(/`(M-[A-Z0-9-]+)`/g)) {
      if (!localIds.has(match[1])) throw new Error(`Starting rule ${match[1]} is not in this route's source indexes`);
      ids.add(match[1]);
    }
  }
  if (!routes) throw new Error('Router has no task rows');
  for (const path of [...index.matchAll(/`((?:[a-z-]+\/)+(?:README|M-[A-Z0-9-]+)\.md)`/g)].map(m => m[1])) await required(join(src, path));
  const actual = await ruleFiles(src);
  const missing = actual.filter(path => !covered.has(path));
  if (missing.length) throw new Error(`Rules not reachable through router categories: ${missing.join(', ')}`);
  return {routes, categories:categories.size, startingRules:ids.size, sourceRules:actual.length};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validate().then(result => console.log(JSON.stringify(result))).catch(error => {console.error(error.message); process.exitCode=1;});
}
