import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseModel, parseModelArgs, fromReference, initializeArchitect } from '../models.ts';
import { Implementor } from '../transport.mjs';
const initial = { provider: 'mock', model: 'frontier', thinking: 'high' };

test('implementor model command parses full IDs, effort-only and reset; architect uses native controls', () => {
  assert.deepEqual(parseModelArgs(''), {});
  assert.deepEqual(parseModelArgs('max'), { thinking: 'max' });
  assert.deepEqual(parseModelArgs('reset'), { reset: true });
  assert.deepEqual(parseModelArgs('other/vendor/model medium'), { reference: 'other/vendor/model', thinking: 'medium' });
  assert.deepEqual(fromReference('other/vendor/model', 'medium'), { provider: 'other', model: 'vendor/model', thinking: 'medium' });
  for (const args of ['architect', 'implementor max', 'architect mock/sol high', 'sol high', 'mock/ high', 'mock/sol extreme', 'reset high', 'high extra', 'mock/sol high extra']) assert.throws(() => parseModelArgs(args), /pair-models.*implementor only/);
});

test('model picker cancellation is non-mutating; supports keep model and reset without a role picker', async () => {
  const before = structuredClone(initial);
  const available = async () => [{ provider: 'other', id: 'vendor/model' }];
  for (const cancelAt of [0, 1]) {
    let step = 0;
    const ui = { select: async (_title, options) => step++ === cancelAt ? undefined : options[0] };
    assert.equal(await chooseModel('', initial, ui, available, new AbortController().signal), undefined);
  }
  let step = 0;
  const ui = { select: async (_title, options) => step++ === 0 ? options[0] : 'max' };
  assert.deepEqual(await chooseModel('', initial, ui, available, new AbortController().signal), { target: { ...initial, thinking: 'max' } });
  assert.deepEqual(await chooseModel('', initial, { select: async () => 'Restore JSON default' }, available, new AbortController().signal), { reset: true });
  const abort = new AbortController();
  assert.equal(await chooseModel('', initial, { select: async (_t, options) => { abort.abort(); return options[0]; } }, available, abort.signal), undefined);
  assert.deepEqual(initial, before);
});

function fakeWorker(behavior = {}) {
  let state = { model: { provider: 'mock', id: 'frontier' }, thinkingLevel: 'high', messageCount: 12 };
  const calls = [], failures = [];
  const worker = new Implementor({ implementor: { ...initial } }, '/tmp', 'model-unit-test', () => {}, (error) => failures.push(error));
  worker.stop = () => { worker.stopped = true; return Promise.resolve(); };
  worker.rpc = async (command) => {
    calls.push(command);
    if (command.type === 'get_state') return structuredClone(state);
    if (command.type === 'get_available_models') return { models: ['frontier', 'plain'].map((id) => ({ provider: 'mock', id })) };
    if (command.type === 'set_model') {
      if (behavior.timeout) throw Object.assign(new Error('setter timed out'), { code: 'RPC_TIMEOUT' });
      if (behavior.rollbackFails && command.modelId === 'frontier') throw new Error('rollback failed');
      state.model.id = command.modelId; state.thinkingLevel = 'off';
    }
    if (command.type === 'get_available_thinking_levels') return { levels: state.model.id === 'plain' ? ['off'] : ['off', 'high'] };
    if (command.type === 'set_thinking_level') state.thinkingLevel = behavior.clamp ? 'off' : command.level;
  };
  return { worker, calls, failures, state: () => state };
}

test('worker model transaction restores previous selection on unsupported effort and rejects unknown models before mutation', async () => {
  const { worker, calls, failures, state } = fakeWorker();
  await assert.rejects(worker.changeModel({ ...initial, model: 'plain', thinking: 'high' }), /unsupported.*previous model\/effort restored/);
  assert.equal(state().model.id, 'frontier'); assert.equal(state().thinkingLevel, 'high'); assert.equal(state().messageCount, 12);
  assert.deepEqual(worker.config.implementor, initial);
  const setters = calls.filter((c) => c.type === 'set_model').length;
  await assert.rejects(worker.changeModel({ ...initial, model: 'missing' }), /model unavailable/);
  assert.equal(calls.filter((c) => c.type === 'set_model').length, setters);
  assert.deepEqual(failures, []);
  await worker.changeModel({ ...initial, model: 'plain', thinking: 'off' });
  assert.equal(worker.config.implementor.model, 'plain'); assert.equal(state().messageCount, 12);
});

test('uncertain setters, failed rollback and silent effort clamping fail closed', async () => {
  for (const behavior of [{ timeout: true }, { rollbackFails: true }, { clamp: true }]) {
    const { worker, failures } = fakeWorker(behavior);
    const target = behavior.clamp ? initial : { ...initial, model: 'plain', thinking: 'high' };
    await assert.rejects(worker.changeModel(target));
    assert.equal(worker.stopped, true); assert.equal(failures.length, 1);
    assert.deepEqual(worker.config.implementor, initial);
  }
});

test('busy change expiry and stop release queued prompts without applying a stale selection', async () => {
  const { worker, calls } = fakeWorker(); worker.running = true;
  await assert.rejects(worker.changeModel(initial, 0), /expired waiting/); assert.equal(calls.length, 0);
  const change = worker.changeModel(initial), prompt = worker.prompt('not sent after stop');
  const rejected = Promise.all([assert.rejects(change, /Implementor stopped/), assert.rejects(prompt, /Implementor stopped/)]);
  await worker.stop(); await rejected; assert.equal(calls.length, 0);
});

test('architect initialization uses native setters, verifies effort and restores selection after clamping', async () => {
  let model = { provider: 'mock', id: 'original' }, thinking = 'low';
  const pi = { getThinkingLevel: () => thinking, setModel: async (next) => { model = next; return true; },
    setThinkingLevel: (next) => { thinking = model.id === 'plain' ? 'off' : next; } };
  const ctx = { get model() { return model; }, modelRegistry: { find: (provider, id) => id === 'missing' ? undefined : { provider, id } } };
  await initializeArchitect(pi, ctx, initial, () => true);
  assert.deepEqual(model, { provider: 'mock', id: 'frontier' }); assert.equal(thinking, 'high');
  await assert.rejects(initializeArchitect(pi, ctx, { ...initial, model: 'plain' }, () => true), /unsupported.*restored/);
  assert.equal(model.id, 'frontier'); assert.equal(thinking, 'high');
  await assert.rejects(initializeArchitect(pi, ctx, { ...initial, model: 'missing' }, () => true), /unavailable/);
  pi.setModel = async () => false;
  await assert.rejects(initializeArchitect(pi, ctx, initial, () => true), /authentication unavailable/);
});
