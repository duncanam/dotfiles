import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { levels, roles } from './config.mjs';

export type Role = 'architect' | 'implementor';
export type Selection = { provider: string; model: string; thinking: string };
export const selection = ({ provider, model, thinking }: Selection): Selection => ({ provider, model, thinking });
export const modelLabel = (s: Selection) => `${s.provider}/${s.model} · ${s.thinking}`;
export const modelUsage = '/pair-models [architect|implementor [provider/model effort | effort | reset]]';

export function parseModelArgs(args: string): { role?: Role; reference?: string; thinking?: string; reset?: boolean } {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  if (!roles.includes(parts[0]) || parts.length > 3) throw new Error(modelUsage);
  const role = parts[0] as Role;
  if (parts.length === 1) return { role };
  if (parts.length === 2 && parts[1] === 'reset') return { role, reset: true };
  if (parts.length === 2 && levels.includes(parts[1])) return { role, thinking: parts[1] };
  if (parts.length !== 3 || !/^[^/\s\x00-\x1f]+\/[^\s\x00-\x1f]+$/.test(parts[1]) || !levels.includes(parts[2])) throw new Error(modelUsage);
  return { role, reference: parts[1], thinking: parts[2] };
}

export function fromReference(reference: string, thinking: string): Selection {
  const slash = reference.indexOf('/');
  return { provider: reference.slice(0, slash), model: reference.slice(slash + 1), thinking };
}

// Only gathers a choice. No worker or parent model is changed until every dialog completes.
export async function chooseModel(
  args: string, current: Record<Role, Selection>, ui: ExtensionContext['ui'],
  available: (role: Role) => Promise<{ provider: string; id: string }[]>,
  signal: AbortSignal,
): Promise<{ role: Role; target?: Selection; reset?: boolean } | undefined> {
  const parsed = parseModelArgs(args);
  let role = parsed.role;
  if (!role) {
    const labels = roles.map((r) => `${r}: ${modelLabel(current[r as Role])}`);
    const picked = await ui.select('One-off pair models — choose a role', labels, { signal });
    if (!picked || signal.aborted) return;
    role = roles[labels.indexOf(picked)] as Role;
    if (!role) return;
  }
  if (parsed.reset) return { role, reset: true };
  if (parsed.thinking) return { role, target: parsed.reference ? fromReference(parsed.reference, parsed.thinking) : { ...selection(current[role]), thinking: parsed.thinking } };
  const models = await available(role);
  if (signal.aborted) return;
  const keep = `Keep current: ${current[role].provider}/${current[role].model}`;
  const reset = 'Restore JSON default';
  const references = [...new Set(models.map((m) => `${m.provider}/${m.id}`))].sort();
  const reference = await ui.select(`${role} model (temporary)`, [keep, reset, ...references], { signal });
  if (!reference || signal.aborted) return;
  if (reference === reset) return { role, reset: true };
  const thinking = await ui.select(`${role} effort (validated by worker; unsupported choices are rejected)`,
    [current[role].thinking, ...levels.filter((l) => l !== current[role].thinking)], { signal });
  if (!thinking || signal.aborted) return;
  return { role, target: reference === keep ? { ...selection(current[role]), thinking } : fromReference(reference, thinking) };
}
