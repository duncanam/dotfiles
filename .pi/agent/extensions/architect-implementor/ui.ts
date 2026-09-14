import { stripVTControlCharacters } from 'node:util';
import type { Theme } from '@earendil-works/pi-coding-agent';
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
export function clean(text: string) {
  return stripVTControlCharacters(text).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '').replace(/\t/g, '  ');
}
export class Log {
  entries: string[] = [];
  add(text: string) {
    this.entries.push(clean(text).slice(-8000));
    this.trim();
  }
  delta(text: string) {
    if (!this.entries.length) this.entries.push('');
    this.entries[this.entries.length - 1] = (this.entries.at(-1)! + clean(text)).slice(-8000);
    this.trim();
  }
  private trim() {
    while (this.entries.length > 300 || this.entries.join('\n').length > 60000) this.entries.shift();
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
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
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
  parts.push(state.mode === 'failed' || state.mode === 'stopping' ? 'input intercepted' : 'input → Architect', '/pair-disable');
  return parts.join(' • ');
}
export function roleStatus(state: WorkflowStatus, role: 'architect' | 'implementor', busy: boolean): string {
  if (state.mode !== 'active') return state.mode;
  if (role === 'implementor') {
    if (state.phase === 'blocked') return 'paused: blocker';
    if (state.phase === 'reviewing') return 'paused: review';
    if (state.phase === 'planning') return 'awaiting assignment';
  }
  if (busy) return 'working';
  if (state.phase === 'accepted') return 'idle: accepted';
  if (role === 'architect' && state.phase === 'implementing') return 'monitoring';
  return 'idle';
}
export type PaneTheme = Pick<Theme, 'fg' | 'bold'>;
const plainTheme: PaneTheme = { fg: (_color, s) => s, bold: (s) => s };
export function workflowFooter(state: WorkflowStatus): string {
  return `Pair • ${state.mode} • ${state.mode === 'failed' || state.mode === 'stopping' ? 'input intercepted' : 'input → Architect'} • /pair-disable`;
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
export type Pane = { title: string; log: Log; role?: 'architect' | 'implementor'; status?: string; model?: string; thinking?: string; emptyMessage?: string; sessionName?: string };
function logPresentation(entry: string): { text: string; color: Parameters<Theme['fg']>[0] } {
  const text = clean(entry);
  if (/^(ERROR|Model error|Protocol rejected)/.test(text)) return { text: `! ${text}`, color: 'error' };
  const tags: [RegExp, string, Parameters<Theme['fg']>[0]][] = [
    [/^\[(?:queued )?user feedback\]\s*/, 'YOU  ', 'accent'],
    [/^\[thinking\]\s*/, 'THINK  ', 'thinkingText'],
    [/^→\s*/, 'TOOL  ', 'text'],
    [/^←\s*/, 'RESULT  ', 'toolOutput'],
    [/^\[blocked\]\s*/, 'BLOCKED  ', 'warning'],
    [/^\[accepted\]\s*/, 'VERIFIED  ', 'success'],
    [/^\[(assign|guide|ping|message|note)\]\s*/, 'HANDOFF  ', 'customMessageLabel'],
  ];
  for (const [pattern, label, color] of tags) if (pattern.test(text)) return { text: text.replace(pattern, label), color };
  return { text, color: /^(tmux:|Starting pair\.|Ready\.)/.test(text) ? 'dim' : 'text' };
}
// Preserve the configured height even when idle; split the full width evenly.
export function renderPanes(width: number, height: number, panes: Pane[], theme: PaneTheme = plainTheme): string[] {
  height = Math.max(0, Math.floor(height));
  if (!height || width <= 0) return [];
  if (width < 8) return panes.slice(0, height).map((p) => fit(inline(p.title), width));
  const box = (p: Pane, w: number, h: number): string[] => {
    if (h < 3) return h ? [fit(inline(p.title), w)] : [];
    const accent = p.role === 'implementor' ? 'customMessageLabel' : 'accent';
    const border = (s: string) => theme.fg('borderMuted', s);
    const inner = w - 2;
    const contentWidth = Math.max(1, inner - 2);
    const row = (s: string) => border('│') + pad(' ' + fit(s, contentWidth), inner) + border('│');
    const icon = p.role === 'implementor' ? '○' : '◇';
    const title = theme.bold(theme.fg(accent, `${icon} ${inline(p.title)}`));
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
    const feed = p.log.entries.filter((entry) => entry.trim()).flatMap((entry) => {
      const { text, color } = logPresentation(entry);
      return wrapTextWithAnsi(text, contentWidth).map((line) => theme.fg(color, line));
    }).slice(-bodyHeight);
    if (!feed.length) {
      const hint = p.emptyMessage ?? (p.role === 'implementor' ? 'Waiting for the architect’s plan.' : 'What would you like to build?');
      feed.push(...wrapTextWithAnsi(clean(hint), contentWidth).map((line) => theme.fg('muted', line)));
    }
    for (let i = 0; i < bodyHeight; i++) rows.push(row(feed[i] ?? ''));
    if (p.sessionName) {
      const name = truncateToWidth(inline(`tmux: ${p.sessionName}`), Math.max(0, inner - 4), '…');
      const label = ` ${name} `;
      rows.push(border('╰─') + theme.fg('dim', label) + border('─'.repeat(Math.max(0, inner - 1 - visibleWidth(label))) + '╯'));
    } else rows.push(border('╰' + '─'.repeat(inner) + '╯'));
    return rows;
  };
  if (width < 60) {
    const first = Math.floor((height - 1) / 2);
    return [...box(panes[0], width, first), ...(height > 2 ? [''] : []), ...box(panes[1], width, Math.max(0, height - first - 1))];
  }
  const leftWidth = Math.floor((width - 2) / 2);
  const left = box(panes[0], leftWidth, height);
  const right = box(panes[1], width - leftWidth - 2, height);
  return left.map((line, i) => pad(line, leftWidth) + '  ' + (right[i] ?? ''));
}
