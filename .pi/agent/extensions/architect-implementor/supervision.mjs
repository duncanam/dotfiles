import { writeFileSync, renameSync } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { clean } from './wire.mjs';

export const watchdogIntervalMs = 500;
export function heartbeatLease(leaseMs, now = () => Number(process.hrtime.bigint() / 1_000_000n)) {
  let checkedAt = now(), heartbeatAt = checkedAt;
  return {
    heartbeat() { heartbeatAt = now(); },
    expired() {
      const current = now();
      // The observer was suspended/stalled too: let the parent resume, even if
      // this overdue timer runs before queued heartbeats. No wall-clock expiry.
      if (current - checkedAt > 4 * watchdogIntervalMs) heartbeatAt = current;
      checkedAt = current;
      return current - heartbeatAt > leaseMs;
    },
  };
}

const brief = (value) => clean(String(value)).replace(/\s+/g, ' ').trim().slice(0, 1000);
export function recordShutdown(dir, reason) {
  const record = { at: new Date().toISOString(), pid: process.pid, reason: brief(reason) };
  const path = join(dir, 'shutdown.json');
  try {
    writeFileSync(`${path}.tmp`, JSON.stringify(record), { mode: 0o600 });
    renameSync(`${path}.tmp`, path);
  } catch { record.reason = `${record.reason.slice(0, 950)} (shutdown record unavailable)`; }
  return record;
}
export async function readShutdownReason(dir) {
  try {
    const path = join(dir, 'shutdown.json'), stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) return;
    const record = JSON.parse(await readFile(path, 'utf8'));
    if (typeof record?.reason === 'string') return brief(record.reason) || undefined;
  } catch {}
}
