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
  statusRequested = false;
  constructor(intervalMs = 600000) { this.intervalMs = intervalMs; }
  directive(raw, now = Date.now()) {
    const d = communication(raw, ['assign', 'guide', 'ping', 'accept']);
    if (d.cycle !== this.cycle) throw new Error(`Stale cycle ${d.cycle}; use current cycle ${this.cycle} in the next directive.`);
    if (d.kind === 'assign') {
      if (this.phase === 'implementing') throw new Error('Implementation is active. Guide it or wait; do not replace an active assignment.');
      this.cycle++;
      this.statusRequested = false;
      this.phase = 'implementing';
      this.startedAt = now;
      this.nextPing = now + this.intervalMs;
      return [{ role: 'implementor', mode: 'assign', cycle: this.cycle, text: d.text }];
    }
    if (d.kind === 'accept') {
      if (this.phase !== 'reviewing') throw new Error('Wait for the implementor completion report before accepting.');
      this.statusRequested = false;
      this.phase = 'accepted';
      return [{ role: 'architect', mode: 'accepted', text: d.text }];
    }
    if (!this.cycle) throw new Error('No assignment yet. Use assign to start work before guide or ping.');
    this.statusRequested = d.kind === 'ping';
    // Resuming paused work gets a fresh interval, not a new assignment cycle.
    if (d.kind === 'guide' && this.phase !== 'implementing') {
      this.phase = 'implementing';
      this.startedAt = now;
      this.nextPing = now + this.intervalMs;
    }
    return [{ role: 'implementor', mode: d.kind === 'guide' ? 'guide' : 'ping', cycle: this.cycle, text: d.text }];
  }
  report(raw) {
    const r = communication(raw, ['status', 'blocked', 'done']);
    if (r.cycle !== this.cycle || !this.cycle || (r.kind !== 'status' && !['implementing', 'blocked'].includes(this.phase))) throw new Error(`Stale or unexpected implementor report; current cycle ${this.cycle}, phase ${this.phase}.`);
    // Routine progress is visible context, not authorization for a second agent
    // to start the delegated job. A ping requests one status-driven assessment.
    const triggerTurn = r.kind !== 'status' || this.statusRequested;
    this.statusRequested = false;
    if (r.kind === 'blocked') this.phase = 'blocked';
    if (r.kind === 'done') this.phase = 'reviewing';
    if (r.kind !== 'status') this.startedAt = this.nextPing = 0;
    const instruction = r.kind === 'done'
      ? 'Worker is paused. Independently review the work using appropriate files, diffs, tests or CI. Use your judgment rather than a prescribed tool sequence. Then accept, guide corrections in this cycle, or assign a new job, explaining what you verified and any limitations.'
      : r.kind === 'blocked' ? 'Worker is paused. Diagnose the blocker and send guide (same cycle) or assign a revised plan (new cycle).'
      : triggerTurn ? 'Requested status: assess this report or answer the user, guiding only if intervention is needed. The delegated scope remains with the implementor; do not repeat its investigation or implementation. If nothing actionable, end your turn and wait. Do not request a transcript or another status just because this report arrived.'
      : 'Informational progress only; no architect action requested. The implementor retains the delegated scope, including any investigation. Do not duplicate that work. Wait for completion, a blocker, user input or a check-in.';
    return [{ role: 'architect', mode: 'message', triggerTurn, text: `Implementor ${r.kind}, cycle ${r.cycle}:\n${r.text}\n\n${instruction}` }];
  }
  tick(now = Date.now()) {
    if (this.phase !== 'implementing' || now < this.nextPing) return [];
    // Anchor checks to the current implementation stretch, excluding review/blocker waits.
    this.nextPing = this.startedAt + (Math.floor((now - this.startedAt) / this.intervalMs) + 1) * this.intervalMs;
    return [{ role: 'architect', mode: 'message', text: `Cycle ${this.cycle} has been implementing for ${Math.floor((now - this.startedAt) / 1000)}s since starting/resuming. Assess whether an update is needed using the latest report. Do not immediately duplicate recent guidance or a recent status request. Ping for a concise update only if needed, or guide if intervention is warranted. This reminder does not reset the check-in schedule.` }];
  }
}
