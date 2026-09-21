import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { levels } from './config.mjs';

export type Selection = { provider: string; model: string; thinking: string };
export const selection = ({ provider, model, thinking }: Selection): Selection => ({ provider, model, thinking });
export const modelLabel = (s: Selection) => `${s.provider}/${s.model} · ${s.thinking}`;
export const modelUsage = '/pair-models [provider/model effort | effort | reset] (implementor only; use /model and /thinking for the architect)';

export function parseModelArgs(args: string): { reference?: string; thinking?: string; reset?: boolean } {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  if (parts.length === 1 && parts[0] === 'reset') return { reset: true };
  if (parts.length === 1 && levels.includes(parts[0])) return { thinking: parts[0] };
  if (parts.length !== 2 || !/^[^/\s\x00-\x1f]+\/[^\s\x00-\x1f]+$/.test(parts[0]) || !levels.includes(parts[1])) throw new Error(modelUsage);
  return { reference: parts[0], thinking: parts[1] };
}
export function fromReference(reference: string, thinking: string): Selection {
  const slash = reference.indexOf('/');
  return { provider: reference.slice(0, slash), model: reference.slice(slash + 1), thinking };
}
// Only gathers a choice. No model is changed until every dialog completes.
export async function chooseModel(
  args: string, current: Selection, ui: ExtensionContext['ui'],
  available: () => Promise<{ provider: string; id: string }[]>, signal: AbortSignal,
): Promise<{ target?: Selection; reset?: boolean } | undefined> {
  const parsed = parseModelArgs(args);
  if (parsed.reset) return { reset: true };
  if (parsed.thinking) return { target: parsed.reference ? fromReference(parsed.reference, parsed.thinking) : { ...selection(current), thinking: parsed.thinking } };
  const models = await available();
  if (signal.aborted) return;
  const keep = `Keep current: ${current.provider}/${current.model}`;
  const reset = 'Restore JSON default';
  const references = [...new Set(models.map((m) => `${m.provider}/${m.id}`))].sort();
  const reference = await ui.select('Implementor model (temporary)', [keep, reset, ...references], { signal });
  if (!reference || signal.aborted) return;
  if (reference === reset) return { reset: true };
  const thinking = await ui.select('Implementor effort (validated by worker; unsupported choices are rejected)',
    [current.thinking, ...levels.filter((l) => l !== current.thinking)], { signal });
  if (!thinking || signal.aborted) return;
  return { target: reference === keep ? { ...selection(current), thinking } : fromReference(reference, thinking) };
}

export async function initializeArchitect(pi: ExtensionAPI, ctx: ExtensionContext, target: Selection, current: () => boolean) {
  const model = ctx.modelRegistry.find(target.provider, target.model);
  if (!model) throw new Error(`Architect model unavailable: ${target.provider}/${target.model}`);
  const previous = ctx.model, effort = pi.getThinkingLevel();
  // Native extension setters are session-only, just like the built-in selectors.
  if (!await pi.setModel(model)) throw new Error(`Architect authentication unavailable: ${target.provider}/${target.model}`);
  if (!current()) return;
  pi.setThinkingLevel(target.thinking as Parameters<ExtensionAPI['setThinkingLevel']>[0]);
  if (pi.getThinkingLevel() !== target.thinking) {
    if (previous && !await pi.setModel(previous)) throw new Error('Architect effort unsupported; previous model could not be restored');
    if (current()) pi.setThinkingLevel(effort);
    throw new Error(`Architect effort ${target.thinking} unsupported${previous ? '; previous selection restored' : ''}`);
  }
}
