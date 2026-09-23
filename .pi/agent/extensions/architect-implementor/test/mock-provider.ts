import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { createAssistantMessageEventStream, type AssistantMessage } from '@earendil-works/pi-ai';

// A deterministic in-process provider. No HTTP implementation or real credentials.
export default function mockProvider(pi: ExtensionAPI) {
  let turn = 0;
  pi.registerProvider('pair-fixture', {
    baseUrl: 'http://unused.invalid', apiKey: 'fixture-not-a-real-key', api: 'pair-fixture-api',
    models: ['architect', 'implementor', 'loop'].map((id) => ({ id, name: id, reasoning: true, input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 4096 })),
    streamSimple(model, context, options) {
      const stream = createAssistantMessageEventStream();
      const scale = model.id === 'architect' ? 1 : 2;
      // Synthetic usage, not paid calls: six responses per role in the native review fixture.
      const output: AssistantMessage = { role: 'assistant', api: model.api, provider: model.provider, model: model.id, content: [], timestamp: Date.now(), stopReason: 'pending',
        usage: { input: 100 * scale, output: 10 * scale, cacheRead: 30 * scale, cacheWrite: 5 * scale, totalTokens: 145 * scale,
          cost: { input: 0.006 * scale, output: 0.003 * scale, cacheRead: 0.001 * scale, cacheWrite: 0, total: 0.01 * scale } } };
      const call = (name: string, args: Record<string, unknown>) => { output.content.push({ type: 'toolCall', id: `${model.id}-${turn}`, name, arguments: args }); output.stopReason = 'toolUse'; };
      queueMicrotask(async () => {
        try {
          options?.signal?.throwIfAborted();
          const history = JSON.stringify(context.messages), step = turn++;
          // Pi 0.87 uses system messages; 0.85 supplied a separate systemPrompt.
          const system = context.systemPrompt || JSON.stringify(context.messages.filter((m) => String(m.role) === 'system'));
          assert.ok(!context.messages.some((m) => m.role === 'toolResult' && m.isError), 'all native tool calls must succeed');
          if (model.id === 'loop') call('read', { path: 'proof.txt' });
          else if (model.id === 'architect') {
            assert.match(system, /You are the ARCHITECT/);
            assert.doesNotMatch(history, /PRIVATE_WORKER_SENTINEL/);
            assert.match(history, new RegExp(`Current pair state: cycle ${step === 0 ? 0 : 1}; phase ${step === 0 ? 'planning' : step === 5 ? 'accepted' : 'reviewing'}`));
            if (step === 0) call('ai_directive', { kind: 'assign', cycle: 0, text: 'Write proof.txt with initial content, then report completion.' });
            else if (step === 1 || step === 3) { assert.match(history, /Implementor done, cycle 1/); call('read', { path: 'proof.txt' }); }
            else if (step === 2) call('ai_directive', { kind: 'guide', cycle: 1, text: 'Review correction: change proof.txt to corrected content and report again.' });
            else if (step === 4) call('ai_directive', { kind: 'accept', cycle: 1, text: 'Independently read and verified the corrected file.' });
            else { assert.equal(step, 5); output.content.push({ type: 'text', text: 'Native architect accepted the corrected fixture.' }); output.stopReason = 'stop'; }
          } else {
            assert.match(system, /You are the IMPLEMENTOR/); assert.doesNotMatch(history, /MAIN_ONLY_SENTINEL/);
            assert.ok(step < 6);
            if (step % 3 === 0) call('ai_report', { kind: 'status', cycle: 1, text: `Starting fixture pass ${step / 3 + 1}. Continuing the assigned work.` });
            else if (step % 3 === 1) {
              // Hold the worker active until the test proves progress did not wake the architect.
              const deadline = Date.now() + 10000;
              while (!(await access(`fixture-continue-${step}`).then(() => true, () => false))) {
                assert.ok(Date.now() < deadline, 'test must release the worker');
                await sleep(10, undefined, { signal: options?.signal });
              }
              call('write', { path: 'proof.txt', content: step === 1 ? 'initial\n' : 'corrected\n' });
            } else { output.content.push({ type: 'text', text: 'PRIVATE_WORKER_SENTINEL' }); call('ai_report', { kind: 'done', cycle: 1, text: 'Changed proof.txt; write succeeded.' }); }
          }
          stream.push({ type: 'start', partial: output });
          for (const [contentIndex, block] of output.content.entries()) {
            if (block.type === 'toolCall') {
              stream.push({ type: 'toolcall_start', contentIndex, partial: output });
              stream.push({ type: 'toolcall_end', contentIndex, toolCall: block, partial: output });
            } else if (block.type === 'text') {
              stream.push({ type: 'text_start', contentIndex, partial: output });
              stream.push({ type: 'text_delta', contentIndex, delta: block.text, partial: output });
              stream.push({ type: 'text_end', contentIndex, content: block.text, partial: output });
            }
          }
          stream.push({ type: 'done', reason: output.stopReason as 'stop' | 'toolUse', message: output });
        } catch (error) {
          output.stopReason = options?.signal?.aborted ? 'aborted' : 'error'; output.errorMessage = String(error);
          stream.push({ type: 'error', reason: output.stopReason, error: output });
        }
        stream.end();
      });
      return stream;
    },
  });
  pi.registerCommand('fixture-quit', { handler: async (_args, ctx) => ctx.shutdown() });
}
