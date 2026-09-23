import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig, workerArgs } from '../config.mjs';
import { Implementor } from '../transport.mjs';
const guard = fileURLToPath(new URL('../../loop-guard.ts', import.meta.url));
const provider = fileURLToPath(new URL('./mock-provider.ts', import.meta.url));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('example implementor explicitly loads the existing loop guard without expanding its tool permissions', async () => {
  const config = JSON.parse(await readFile(new URL('../architect-implementor.example.json', import.meta.url), 'utf8'));
  assert.equal(config.implementor.extensions.filter((path) => path === 'extensions/loop-guard.ts').length, 1);
  const args = workerArgs(config, '/worker.ts');
  assert.equal(args[args.indexOf('extensions/loop-guard.ts') - 1], '-e');
  assert.equal(args.at(-1), 'read,write,edit,bash,ai_report,context7_resolve_library_id,context7_get_library_docs');
});

test('real implementor loop guard warns at three identical responses and aborts at five (no API)', { timeout: 20000 }, async () => {
  const root = await mkdtemp('/tmp/pair-loop-guard-');
  const previous = process.env.PI_CODING_AGENT_DIR, offline = process.env.PI_OFFLINE;
  process.env.PI_CODING_AGENT_DIR = root; process.env.PI_OFFLINE = '1';
  const config = validateConfig({ version: 2,
    architect: { provider: 'pair-fixture', model: 'architect', thinking: 'high' },
    implementor: { provider: 'pair-fixture', model: 'loop', thinking: 'high', extensions: [guard, provider] },
  });
  const events = []; let failure;
  const worker = new Implementor(config, root, 'loop-guard-test', (e) => events.push(e), (e) => { failure = e; });
  try {
    await writeFile(join(root, 'proof.txt'), 'Read-only fixture.\n');
    await worker.start();
    await worker.prompt('/ai-control ' + Buffer.from(JSON.stringify({ mode: 'assign', cycle: 1, text: 'Read proof.txt.' })).toString('base64url'));
    const deadline = Date.now() + 12000;
    while (!events.some((e) => e.type === 'agent_settled')) {
      if (failure) throw failure;
      assert.ok(Date.now() < deadline, 'loop guard must settle the worker'); await sleep(20);
    }
    const notices = events.filter((e) => e.type === 'extension_ui_request' && e.method === 'notify').map((e) => e.message);
    assert.ok(notices.some((text) => /3 consecutive identical responses/.test(text)), JSON.stringify(notices));
    assert.ok(notices.some((text) => /aborted run after 5 identical responses/.test(text)), JSON.stringify(notices));
    const responses = events.filter((e) => e.type === 'message_end' && e.message?.role === 'assistant').map((e) => e.message);
    // Pi may finalize an empty abort/error response while unwinding the run.
    assert.equal(responses.filter((m) => m.stopReason === 'toolUse').length, 5);
    for (const message of responses.filter((m) => m.stopReason !== 'toolUse')) {
      assert.ok(message.stopReason === 'aborted' || message.stopReason === 'error' && /aborted/i.test(message.errorMessage), JSON.stringify(message));
    }
    assert.equal(events.filter((e) => e.type === 'tool_execution_start' && e.toolName === 'read').length, 5);
    assert.ok(!events.some((e) => e.type === 'extension_error'), JSON.stringify(events.filter((e) => e.type === 'extension_error')));
    assert.equal((await worker.rpc({ type: 'get_state' })).isStreaming, false);
    assert.equal(await readFile(join(root, 'proof.txt'), 'utf8'), 'Read-only fixture.\n');
  } finally {
    await worker.stop();
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    if (offline === undefined) delete process.env.PI_OFFLINE; else process.env.PI_OFFLINE = offline;
    await rm(root, { recursive: true, force: true });
  }
});
