import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';

export const roles = ['architect', 'implementor'];
export const roleTools = (role) => ['read', 'write', 'edit', 'bash', role === 'architect' ? 'ai_directive' : 'ai_report'];
export const levels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
export const agentDir = () => process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent');
export const configPath = () => join(agentDir(), 'architect-implementor.json');
const object = (x) => x && typeof x === 'object' && !Array.isArray(x);
function keys(value, allowed, name) {
  if (!object(value)) throw new Error(`${name} must be a mapping`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unknown ${name}.${key}`);
}
function integer(value, fallback, min, max, name) {
  value ??= fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer in ${min}..${max}`);
  return value;
}
function text(value, name) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error(`${name} must be a nonempty string`);
  return value;
}
function paths(value, base, name) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  return value.map((p) => {
    p = text(p, name);
    const path = resolve(base, p.startsWith('~/') ? join(homedir(), p.slice(2)) : p);
    if (!existsSync(path)) throw new Error(`${name}: missing ${path}`);
    return path;
  });
}
export function validateConfig(raw, base = agentDir()) {
  keys(raw, [...roles, 'checkinSeconds', 'paneLines', 'piCommand'], 'config');
  const result = {
    checkinSeconds: integer(raw.checkinSeconds, 600, 1, 86400, 'checkinSeconds'),
    paneLines: integer(raw.paneLines, 22, 5, 60, 'paneLines'),
    piCommand: text(raw.piCommand ?? 'pi', 'piCommand'),
  };
  for (const role of roles) {
    const r = raw[role];
    keys(r, ['provider', 'model', 'thinking', 'extensions', 'skills', 'extraTools'], role);
    const thinking = r.thinking ?? 'high';
    if (!levels.includes(thinking)) throw new Error(`${role}.thinking must be one of ${levels.join(', ')}`);
    const extraTools = r.extraTools ?? [];
    if (!Array.isArray(extraTools) || extraTools.some((t) => typeof t !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(t))) throw new Error(`${role}.extraTools must contain tool names`);
    result[role] = {
      provider: text(r.provider, `${role}.provider`), model: text(r.model, `${role}.model`), thinking,
      extensions: paths(r.extensions, base, `${role}.extensions`),
      skills: paths(r.skills, base, `${role}.skills`), extraTools,
    };
  }
  return result;
}
export function loadConfig(path = configPath()) {
  if (!existsSync(path)) throw new Error(`Create ${path} using architect-implementor.example.json in the extension directory`);
  const source = readFileSync(path, 'utf8');
  if (Buffer.byteLength(source, 'utf8') > 65536) throw new Error('Configuration exceeds 64 KiB');
  let raw;
  try { raw = JSON.parse(source); }
  catch (error) { throw new Error(`Invalid JSON in ${path}: ${error.message}`); }
  return validateConfig(raw, resolve(path, '..'));
}
export function workerArgs(config, role, extension) {
  const r = config[role];
  const tools = roleTools(role);
  // --no-session disables disk persistence, NOT conversation continuity: each process
  // stays alive for the entire enabled workflow and receives all its role's tasks.
  return ['--mode', 'rpc', '--no-session', '--no-approve', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes',
    '--provider', r.provider, '--model', r.model, '--thinking', r.thinking,
    ...r.extensions.flatMap((p) => ['-e', p]), '-e', extension,
    ...r.skills.flatMap((p) => ['--skill', p]), '--tools', [...new Set([...tools, ...r.extraTools])].join(',')];
}
