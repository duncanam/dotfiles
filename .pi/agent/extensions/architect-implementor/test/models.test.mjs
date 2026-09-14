import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseModel, parseModelArgs, fromReference } from '../models.ts';
import { WorkerPair } from '../transport.mjs';
const initial = { provider: 'mock', model: 'frontier', thinking: 'high' };
const current = { architect: initial, implementor: { provider: 'mock', model: 'small', thinking: 'low' } };

test('model command parses full IDs, effort-only and reset, rejecting ambiguous or extra arguments', () => {
  assert.deepEqual(parseModelArgs(''), {});
  assert.deepEqual(parseModelArgs('architect'), { role: 'architect' });
  assert.deepEqual(parseModelArgs('implementor max'), { role: 'implementor', thinking: 'max' });
  assert.deepEqual(parseModelArgs('architect reset'), { role: 'architect', reset: true });
  assert.deepEqual(parseModelArgs('architect other/vendor/model medium'), { role: 'architect', reference: 'other/vendor/model', thinking: 'medium' });
  assert.deepEqual(fromReference('other/vendor/model', 'medium'), { provider: 'other', model: 'vendor/model', thinking: 'medium' });
  for (const args of ['both high', 'architect sol high', 'architect mock/ high', 'architect mock/sol extreme', 'architect reset high', 'architect high extra', 'architect mock/sol high extra']) assert.throws(() => parseModelArgs(args), /pair-models/);
});

test('model picker cancellation at every dialog is non-mutating; supports keep model and reset', async () => {
  const before = structuredClone(current);
  const available = async () => [{ provider: 'other', id: 'vendor/model' }];
  for (const cancelAt of [0, 1, 2]) {
    let step = 0;
    const ui = { select: async (_title, options) => step++ === cancelAt ? undefined : options[0] };
    assert.equal(await chooseModel('', current, ui, available, new AbortController().signal), undefined);
  }
  let step = 0;
  const ui = { select: async (_title, options) => step++ === 0 ? options[0] : 'max' };
  assert.deepEqual(await chooseModel('architect', current, ui, available, new AbortController().signal), { role: 'architect', target: { ...initial, thinking: 'max' } });
  assert.deepEqual(await chooseModel('architect', current, { select: async () => 'Restore JSON default' }, available, new AbortController().signal), { role: 'architect', reset: true });
  const abort = new AbortController();
  assert.equal(await chooseModel('', current, { select: async (_t, options) => { abort.abort(); return options[0]; } }, available, abort.signal), undefined);
  assert.deepEqual(current, before);
});

function fakePair(behavior = {}) {
  let state = { model: { provider: 'mock', id: 'frontier' }, thinkingLevel: 'high', messageCount: 12 };
  const calls = [], failures = [];
  const pair = new WorkerPair(structuredClone(current), '/tmp', 'model-unit-test', () => {}, (error) => failures.push(error));
  pair.stop = () => { pair.stopped = true; return Promise.resolve(); };
  pair.rpc = async (_role, command) => {
    calls.push(command);
    if (command.type === 'get_state') return structuredClone(state);
    if (command.type === 'get_available_models') return { models: ['frontier', 'plain'].map((id) => ({ provider: 'mock', id })) };
    if (command.type === 'set_model') {
      if (behavior.timeout) throw Object.assign(new Error('setter timed out'), { code: 'RPC_TIMEOUT' });
      if (behavior.rollbackFails && command.modelId === 'frontier') throw new Error('rollback failed');
      state.model.id = command.modelId;
      state.thinkingLevel = 'off';
    }
    if (command.type === 'get_available_thinking_levels') return { levels: state.model.id === 'plain' ? ['off'] : ['off', 'high'] };
    if (command.type === 'set_thinking_level') state.thinkingLevel = behavior.clamp ? 'off' : command.level;
  };
  return { pair, calls, failures, state: () => state };
}

test('model transaction restores previous state on unsupported effort and rejects unknown models before mutation', async () => {
  const { pair, calls, failures, state } = fakePair();
  await assert.rejects(pair.changeModel('architect', { ...initial, model: 'plain', thinking: 'high' }), /unsupported.*previous model\/effort restored/);
  assert.equal(state().model.id, 'frontier');
  assert.equal(state().thinkingLevel, 'high');
  assert.equal(state().messageCount, 12);
  assert.deepEqual(pair.config.architect, initial);
  const setters = calls.filter((c) => c.type === 'set_model').length;
  await assert.rejects(pair.changeModel('architect', { ...initial, model: 'missing' }), /model unavailable/);
  assert.equal(calls.filter((c) => c.type === 'set_model').length, setters);
  assert.deepEqual(failures, []);
  await pair.changeModel('architect', { ...initial, model: 'plain', thinking: 'off' });
  assert.equal(pair.config.architect.model, 'plain');
  assert.equal(state().messageCount, 12);
});

test('uncertain setters, failed rollback and silent effort clamping fail closed', async () => {
  for (const behavior of [{ timeout: true }, { rollbackFails: true }, { clamp: true }]) {
    const { pair, failures } = fakePair(behavior);
    const target = behavior.clamp ? initial : { ...initial, model: 'plain', thinking: 'high' };
    await assert.rejects(pair.changeModel('architect', target));
    assert.equal(pair.stopped, true);
    assert.equal(failures.length, 1);
    assert.deepEqual(pair.config.architect, initial);
  }
});

test('busy change expiry and stop release queued prompts without applying a stale selection', async () => {
  const { pair, calls } = fakePair();
  pair.running.add('architect');
  await assert.rejects(pair.changeModel('architect', initial, 0), /expired waiting/);
  assert.equal(calls.length, 0);
  const change = pair.changeModel('architect', initial);
  const prompt = pair.prompt('architect', 'not sent after stop');
  const rejected = Promise.all([assert.rejects(change, /Workers stopped/), assert.rejects(prompt, /Workers stopped/)]);
  await pair.stop();
  await rejected;
  assert.equal(calls.length, 0);
});
