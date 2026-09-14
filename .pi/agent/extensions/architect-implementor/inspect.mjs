import { realpath, open, readdir } from 'node:fs/promises';
import { resolve, relative, sep, join } from 'node:path';
import { agentDir } from './config.mjs';
import { runtimeRoot } from './transport.mjs';
const inside = (root, path) => path === root || path.startsWith(root + sep);
export async function inspectPath(cwd, input) {
  const root = await realpath(cwd);
  const path = await realpath(resolve(root, input.replace(/^@/, '')));
  if (!inside(root, path)) throw new Error('Architect inspection is restricted to the working directory');
  const denied = [runtimeRoot, join(agentDir(), 'sessions'), join(agentDir(), 'auth.json')];
  for (const raw of denied) {
    const protectedPath = await realpath(raw).catch(() => resolve(raw));
    if (inside(protectedPath, path)) throw new Error('Private agent state and transcripts are not available');
  }
  if (relative(root, path).split(sep).includes('.git')) throw new Error('Use changes to inspect Git; raw Git internals are unavailable');
  return path;
}
export async function inspectFile(cwd, input, offset = 1, limit = 200) {
  const path = await inspectPath(cwd, input);
  const file = await open(path, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error('Read requires a regular file of at most 2 MiB');
    const source = await file.readFile('utf8');
    if (source.includes('\0')) throw new Error('Binary file; inspect a text artifact instead');
    return source.split('\n').slice(offset - 1, offset - 1 + limit).map((line, i) => `${offset + i}: ${line}`).join('\n');
  } finally { await file.close(); }
}
export async function inspectDirectory(cwd, input) {
  const path = await inspectPath(cwd, input);
  const entries = await readdir(path, { withFileTypes: true });
  return entries.filter((e) => e.name !== '.git').slice(0, 500).map((e) => e.name + (e.isDirectory() ? '/' : e.isSymbolicLink() ? ' [symlink]' : '')).join('\n') + (entries.length > 500 ? '\n[truncated to 500 entries]' : '');
}
