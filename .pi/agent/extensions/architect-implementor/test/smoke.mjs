// Real Pi startup/tool loading/effort validation; deliberately sends NO model prompts.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig, configPath, agentDir } from '../config.mjs';
import { WorkerPair } from '../transport.mjs';
const defaults = loadConfig();
const paths = [configPath(), join(agentDir(), 'settings.json')];
const snapshot = () => Promise.all(paths.map((p) => readFile(p, 'utf8').catch((e) => { if (e.code === 'ENOENT') return undefined; throw e; })));
const settingsBefore = await snapshot();
let failure;
const pair = new WorkerPair(structuredClone(defaults), process.cwd(), 'real-startup-smoke', (role, event) => {
  if (event.type === 'extension_error') failure = new Error(`${role}: ${event.error}`);
}, (error) => { failure = error; });
try {
  await pair.start();
  for (const role of ['architect', 'implementor']) {
    const state = await pair.rpc(role, { type: 'get_state' });
    const commands = await pair.rpc(role, { type: 'get_commands' });
    if (state.messageCount !== 0) throw new Error('Startup unexpectedly created messages');
    if (!commands.commands.some((c) => c.name === 'ai-control')) throw new Error('Worker extension did not load');
    console.log(`${role}: ${state.model.provider}/${state.model.id} effort=${state.thinkingLevel}; zero messages`);
    const other = role === 'architect' ? 'implementor' : 'architect';
    await pair.changeModel(role, defaults[other]);
    await pair.changeModel(role, defaults[role]);
    const restored = await pair.rpc(role, { type: 'get_state' });
    assert.equal(restored.sessionId, state.sessionId, 'model switch preserves worker session');
    assert.equal(restored.messageCount, 0, 'model switch must not create prompts');
    assert.equal(restored.model.provider, state.model.provider);
    assert.equal(restored.model.id, state.model.id);
    assert.equal(restored.thinkingLevel, state.thinkingLevel);
    console.log(`${role}: live switch and restore verified, same session and zero messages`);
  }
  if (failure) throw failure;
  console.log('Real Pi smoke passed; no model calls.');
} finally {
  await pair.stop();
  assert.deepEqual(await snapshot(), settingsBefore, 'extension config and Pi settings remain byte-for-byte unchanged');
}
