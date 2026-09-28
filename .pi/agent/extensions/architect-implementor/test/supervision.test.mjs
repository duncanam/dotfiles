import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { heartbeatLease, recordShutdown, readShutdownReason } from '../supervision.mjs';
import { Implementor } from '../transport.mjs';

function clock() {
  let time = 0;
  const lease = heartbeatLease(20000, () => time);
  const tick = (ms = 500) => { time += ms; return lease.expired(); };
  return { lease, tick, advance: (ms) => { time += ms; } };
}

test('responsive watchdog expires a missing heartbeat, but regular heartbeats extend the lease', () => {
  const { lease, tick } = clock();
  for (let i = 1; i <= 120; i++) { assert.equal(tick(), false); if (i % 4 === 0) lease.heartbeat(); }
  for (let i = 0; i < 40; i++) assert.equal(tick(), false);
  assert.equal(tick(), true);
});

test('suspension with an advancing or paused monotonic clock permits timer-first and heartbeat-first resumption', () => {
  for (const gap of [0, 900000]) for (const heartbeatFirst of [false, true]) {
    const { lease, tick, advance } = clock();
    for (let i = 0; i < 4; i++) assert.equal(tick(), false);
    lease.heartbeat(); advance(gap);
    if (heartbeatFirst) lease.heartbeat();
    assert.equal(lease.expired(), false, 'an overdue observer grants a fresh lease, not a death verdict');
    for (let i = 0; i < 3; i++) assert.equal(tick(), false, 'the other process may resume later');
    lease.heartbeat();
    for (let i = 0; i < 40; i++) assert.equal(tick(), false);
    assert.equal(tick(), true, 'grace is bounded if heartbeats never resume');
  }
});

test('a suspension near expiry resets the entire lease; small timer jitter does not forgive a stalled parent', () => {
  const { tick } = clock();
  for (let i = 0; i < 39; i++) assert.equal(tick(), false);
  assert.equal(tick(900000), false);
  for (let i = 0; i < 40; i++) assert.equal(tick(), false);
  assert.equal(tick(), true);
  const jitter = clock();
  for (let i = 0; i < 20; i++) assert.equal(jitter.tick(1000), false);
  assert.equal(jitter.tick(1000), true);
});

test('the default clock ignores wall-clock jumps and still ages when Date.now is frozen', async (t) => {
  let wall = 1000; t.mock.method(Date, 'now', () => wall);
  const lease = heartbeatLease(0);
  wall += 900000; lease.heartbeat(); wall -= 1800000;
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(lease.expired(), true, 'monotonic time must still expire despite wall-clock rollback');
});

test('shutdown diagnostics are sanitized, bounded, private metadata; unreadable/invalid records stay unknown', async () => {
  const root = await mkdtemp('/tmp/ai-shutdown-test-'), path = join(root, 'shutdown.json');
  try {
    const record = recordShutdown(root, '\x1b[31mCause\x00\n' + '界'.repeat(5000));
    const text = await readFile(path, 'utf8');
    assert.deepEqual(JSON.parse(text), record); assert.deepEqual(Object.keys(record).sort(), ['at', 'pid', 'reason']);
    assert.match(record.reason, /^Cause /); assert.ok(record.reason.length <= 1000); assert.doesNotMatch(text, /\\u0000|\\u001b/);
    assert.ok((await stat(path)).size < 4096); assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal(await readShutdownReason(root), record.reason);
    let failure; const connection = { dir: root, fail: (error) => { failure = error; } };
    await Implementor.prototype.disconnected.call(connection, new Error('read ECONNRESET'));
    assert.equal(failure.message, `Implementor disconnected: ${record.reason}`, 'recorded cause wins over the socket symptom');
    for (const text of ['bad JSON', '{"reason":42}', '{}', '{"reason":""}', 'x'.repeat(4097)]) {
      await writeFile(path, text); assert.equal(await readShutdownReason(root), undefined);
    }
    await rm(path); const target = join(root, 'other.json');
    await writeFile(target, '{"reason":"Do not follow symlinks"}'); await symlink(target, path);
    assert.equal(await readShutdownReason(root), undefined);
    await rm(path); assert.equal(await readShutdownReason(root), undefined);
    await Implementor.prototype.disconnected.call(connection, new Error('read ECONNRESET'));
    assert.match(failure.message, /cause unknown.*socket error: read ECONNRESET/);
    assert.match(recordShutdown(join(root, 'missing'), 'Original reason').reason, /Original reason.*record unavailable/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
