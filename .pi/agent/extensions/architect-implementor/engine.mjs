export function communication(value, allowed) {
  if (!value || !allowed.includes(value.kind) || !Number.isSafeInteger(value.cycle) || value.cycle < 0 || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 6000) {
    throw new Error('Invalid communication: kind, current cycle, and 1..6000 characters of text required');
  }
  return { kind: value.kind, cycle: value.cycle, text: value.text };
}

// Pure orchestration: UI transcripts never enter this state machine.
export class Engine {
  cycle = 0;
  phase = 'planning';
  startedAt = 0;
  nextPing = 0;
  evidence = new Set();
  constructor(intervalMs = 600000) { this.intervalMs = intervalMs; }
  directive(raw, now = Date.now()) {
    const d = communication(raw, ['assign', 'guide', 'ping', 'accept']);
    if (d.cycle !== this.cycle) throw new Error(`Stale cycle ${d.cycle}; current cycle is ${this.cycle}`);
    if (d.kind === 'assign') {
      if (this.phase === 'implementing') throw new Error('Implementation is active. Guide it or wait; do not replace an active assignment.');
      this.cycle++;
      this.phase = 'implementing';
      this.startedAt = now;
      this.nextPing = now + this.intervalMs;
      this.evidence.clear();
      return [{ role: 'implementor', mode: 'assign', cycle: this.cycle, text: d.text }, { role: 'architect', mode: 'note', cycle: this.cycle, text: `Assignment cycle ${this.cycle} started. Await report or user feedback.` }];
    }
    if (d.kind === 'accept') {
      if (this.phase !== 'reviewing' || !this.evidence.has('changes') || !(this.evidence.has('read') || this.evidence.has('check'))) throw new Error('Before accepting, independently run ai_inspect changes and read or check after the completion report.');
      this.phase = 'accepted';
      return [{ role: 'architect', mode: 'accepted', text: d.text }];
    }
    if (!['implementing', 'blocked'].includes(this.phase)) throw new Error('No active implementation to guide/ping.');
    if (d.kind === 'guide' && this.phase === 'blocked') this.phase = 'implementing';
    return [{ role: 'implementor', mode: d.kind === 'guide' ? 'guide' : 'ping', cycle: this.cycle, text: d.text }];
  }
  report(raw) {
    const r = communication(raw, ['status', 'blocked', 'done']);
    if (r.cycle !== this.cycle || !['implementing', 'blocked'].includes(this.phase)) throw new Error('Stale or unexpected implementor report');
    if (r.kind === 'blocked') this.phase = 'blocked';
    if (r.kind === 'done') { this.phase = 'reviewing'; this.evidence.clear(); }
    const instruction = r.kind === 'done'
      ? 'Worker is paused. Independently inspect ai_inspect changes AND read files or run checks. Do not infer correctness from the summary. Then accept or assign corrections.'
      : r.kind === 'blocked' ? 'Worker is paused. Diagnose the blocker and send guide (same cycle) or assign a revised plan (new cycle).' : 'Assess progress; intervene with guide if needed. Do not request a transcript.';
    return [{ role: 'architect', mode: 'message', text: `Implementor ${r.kind}, cycle ${r.cycle}:\n${r.text}\n\n${instruction}` }];
  }
  inspected(kind) { if (this.phase === 'reviewing') this.evidence.add(kind); }
  tick(now = Date.now()) {
    if (this.phase !== 'implementing' || now < this.nextPing) return [];
    // Anchor all checks to assignment start. Status, feedback, and tool activity never reset it.
    this.nextPing = this.startedAt + (Math.floor((now - this.startedAt) / this.intervalMs) + 1) * this.intervalMs;
    return [{ role: 'architect', mode: 'message', text: `Cycle ${this.cycle} has run for ${Math.floor((now - this.startedAt) / 1000)}s. Use ai_directive ping for a concise status/blocker report, or guide if intervention is needed. This check does not reset the cycle timer.` }];
  }
}
