import { clean } from './wire.mjs';
export { clean } from './wire.mjs';
import type { Theme } from '@earendil-works/pi-coding-agent';
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
import { usageRows, usageSummary, type PairUsage } from './usage.ts';
export class Log {
  entries: string[] = [];
  private stream = -1;
  start(text: string) { this.add(text); this.stream = this.entries.length - 1; }
  add(text: string) {
    this.entries.push(clean(text).slice(-8000));
    this.trim();
  }
  delta(text: string) {
    if (this.stream < 0) this.start('');
    this.entries[this.stream] = (this.entries[this.stream] + clean(text)).slice(-8000);
    this.trim();
  }
  private trim() {
    while (this.entries.length > 300 || this.entries.join('\n').length > 60000) { this.entries.shift(); this.stream--; }
  }
}
export type WorkflowStatus = {
  mode: 'off' | 'starting' | 'active' | 'failed' | 'stopping';
  phase: string;
  cycle: number;
  startedAt: number;
  nextPing: number;
  checkinMs?: number;
};
function duration(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60), tail = String(seconds % 60).padStart(2, '0');
  return minutes < 60 ? `${minutes}:${tail}` : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${tail}`;
}
export function workflowSummary(state: WorkflowStatus, now = Date.now()): string {
  const parts = ['Pair', state.mode];
  if (state.cycle > 0) parts.push(`cycle ${state.cycle}`);
  if (state.mode === 'active') {
    parts.push(state.phase);
    if (state.phase === 'implementing') {
      parts.push(`elapsed ${duration(now - state.startedAt)}`);
      parts.push(state.nextPing <= now ? 'check-in due' : `next check-in ${duration(state.nextPing - now)}`);
    }
  }
  parts.push('Architect in main Pi', '/pair-disable');
  return parts.join(' • ');
}
export function implementorStatus(state: WorkflowStatus, busy: boolean): string {
  if (state.mode !== 'active') return state.mode;
  if (state.phase === 'blocked') return 'paused: blocker';
  if (state.phase === 'reviewing') return 'paused: review';
  if (state.phase === 'planning') return 'awaiting assignment';
  if (busy) return 'working';
  return state.phase === 'accepted' ? 'idle: accepted' : 'idle: task open';
}
export type PaneTheme = Pick<Theme, 'fg' | 'bold'>;
const plainTheme: PaneTheme = { fg: (_color, s) => s, bold: (s) => s };
export function workflowFooter(state: WorkflowStatus): string {
  return `◇ Architect (main) • Pair ${state.mode} • /pair-disable`;
}
const inline = (s: string) => clean(s).replace(/\s+/g, ' ').trim();
const fit = (s: string, w: number) => truncateToWidth(s, Math.max(0, w), '');
const pad = (s: string, w: number) => { const t = fit(s, w); return t + ' '.repeat(Math.max(0, w - visibleWidth(t))); };
function statusColor(status: string): Parameters<Theme['fg']>[0] {
  if (/failed|error/.test(status)) return 'error';
  if (/blocked|paused|stopping/.test(status)) return 'warning';
  if (/accepted/.test(status)) return 'success';
  if (/working|active|monitoring/.test(status)) return 'accent';
  return 'muted';
}
export function renderWorkflowStatus(width: number, state: WorkflowStatus, now = Date.now(), theme: PaneTheme = plainTheme): string[] {
  if (width <= 0) return [];
  const parts = ['Pair'];
  if (state.mode !== 'active') parts.push(state.mode);
  if (state.cycle > 0) parts.push(`cycle ${state.cycle}`);
  if (state.mode === 'active') {
    parts.push(state.phase);
    if (state.phase === 'implementing') parts.push(`elapsed ${duration(now - state.startedAt)}`);
  }
  const summary = parts.map((part, i) => i === 0 ? theme.bold(theme.fg('text', part))
    : theme.fg(statusColor(part), part)).join(theme.fg('borderMuted', ' • '));
  const lines = wrapTextWithAnsi(summary, width);
  if (state.mode === 'active' && state.phase === 'implementing' && width >= 40) {
    const interval = Math.max(1, state.checkinMs ?? state.nextPing - state.startedAt);
    const fraction = Math.max(0, Math.min(1, 1 - (state.nextPing - now) / interval));
    const cells = Math.min(24, width - 32);
    const filled = Math.floor(fraction * cells);
    const bar = theme.fg('accent', '━'.repeat(filled)) + theme.fg('borderMuted', '─'.repeat(cells - filled));
    const label = state.nextPing <= now ? 'due now' : `${duration(state.nextPing - now)} remaining`;
    lines.push(fit(theme.fg('dim', '  CHECK-IN  ') + bar + theme.fg('muted', `  ${label}`), width));
  }
  return lines;
}
export function renderUsageStatus(width: number, usage: PairUsage, theme: PaneTheme = plainTheme): string[] {
  if (width <= 0) return [];
  const text = 'Usage (pair, est.) • ' + usageRows(usage).map(([role, total]) => `${role} ${usageSummary(total)}`).join(' • ');
  return wrapTextWithAnsi(theme.fg('muted', text), width);
}
export type Pane = { log: Log; status?: string; model?: string; thinking?: string; emptyMessage?: string; sessionName?: string };
function logPresentation(entry: string): { text: string; color: Parameters<Theme['fg']>[0] } {
  const text = clean(entry);
  if (/^(ERROR|Model error|Protocol rejected)/.test(text)) return { text: `! ${text}`, color: 'error' };
  const tags: [RegExp, string, Parameters<Theme['fg']>[0]][] = [
    [/^\[thinking\]\s*/, 'THINK  ', 'thinkingText'],
    [/^\[queued (assign|guide|ping|accept|status|blocked|done)\]\s*/, 'QUEUED $1  ', 'customMessageLabel'],
    [/^→\s*/, 'TOOL  ', 'text'],
    [/^←\s*/, 'RESULT  ', 'toolOutput'],
    [/^\[blocked\]\s*/, 'BLOCKED  ', 'warning'],
    [/^\[accepted\]\s*/, 'VERIFIED  ', 'success'],
    [/^\[(assign|guide|ping|message|note)\]\s*/, 'HANDOFF  ', 'customMessageLabel'],
  ];
  for (const [pattern, label, color] of tags) if (pattern.test(text)) return { text: text.replace(pattern, label), color };
  return { text, color: /^(tmux:|Starting pair\.|Ready\.)/.test(text) ? 'dim' : 'text' };
}
// One full-width implementor pane; the architect uses Pi's native transcript.
export function renderPane(width: number, height: number, p: Pane, theme: PaneTheme = plainTheme): string[] {
    const h = Math.max(0, Math.floor(height));
    if (!h || width <= 0) return [];
    if (h < 3 || width < 8) return [fit('○ Implementor', width)];
    const border = (s: string) => theme.fg('borderMuted', s);
    const inner = width - 2;
    const contentWidth = Math.max(1, inner - 2);
    const row = (s: string) => border('│') + pad(' ' + fit(s, contentWidth), inner) + border('│');
    const title = theme.bold(theme.fg('customMessageLabel', '○ Implementor'));
    const status = inline(p.status ?? 'idle');
    const label = fit(' ' + title + border(' · ') + theme.fg(statusColor(status), status) + ' ', inner - 1);
    const top = border('╭─') + label + border('─'.repeat(Math.max(0, inner - 1 - visibleWidth(label))) + '╮');
    const rows: string[] = [top];
    if (h >= 5) {
      const model = theme.fg('muted', inline(p.model ?? ''));
      const effort = p.thinking ? theme.fg('dim', '  ·  effort ') + theme.fg('muted', inline(p.thinking)) : '';
      rows.push(row(model + effort));
      if (h >= 6) rows.push(row(''));
    }
    const bodyHeight = h - rows.length - 1;
    const feed = p.log.entries.filter((entry) => entry.trim() && !/^\[thinking\]\s*$/.test(entry)).flatMap((entry) => {
      const { text, color } = logPresentation(entry);
      return wrapTextWithAnsi(text, contentWidth).map((line) => theme.fg(color, line));
    }).slice(-bodyHeight);
    if (!feed.length) {
      const hint = p.emptyMessage ?? 'Waiting for the architect’s plan in the main conversation.';
      feed.push(...wrapTextWithAnsi(clean(hint), contentWidth).map((line) => theme.fg('muted', line)));
    }
    for (let i = 0; i < bodyHeight; i++) rows.push(row(feed[i] ?? ''));
    if (p.sessionName) {
      const name = truncateToWidth(inline(`tmux: ${p.sessionName}`), Math.max(0, inner - 4), '…');
      const label = ` ${name} `;
      rows.push(border('╰─') + theme.fg('dim', label) + border('─'.repeat(Math.max(0, inner - 1 - visibleWidth(label))) + '╯'));
    } else rows.push(border('╰' + '─'.repeat(inner) + '╯'));
    return rows;
}
