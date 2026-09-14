#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { jsonLines } from '../wire.mjs';
import { appendFileSync } from 'node:fs';
const output = (data) => process.stdout.write(JSON.stringify(data) + '\n');
if (process.env.MOCK_AUDIT) appendFileSync(process.env.MOCK_AUDIT, JSON.stringify({ type: 'spawn', pid: process.pid }) + '\n');
const option = (name) => process.argv[process.argv.indexOf(name) + 1];
const role = process.env.MOCK_ROLE ?? JSON.parse(process.env.PI_AI_WORKER || '{}').role ?? 'architect';
let provider = process.env.MOCK_PROVIDER ?? option('--provider');
let model = process.env.MOCK_MODEL ?? option('--model');
let thinking = process.env.MOCK_THINKING ?? option('--thinking');
let busy = false, messageCount = 0;
const models = [
  ...['frontier', 'small', 'replacement', 'plain'].map((id) => ({ provider: 'mock', id })),
  { provider: 'other', id: 'vendor/model' },
];
let cycle = 0;
let assigned = false;
if (process.env.MOCK_DESCENDANT_FILE) {
  const child = spawn('/bin/sleep', ['120'], { detached: true, stdio: 'ignore' });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(process.env.MOCK_DESCENDANT_FILE, String(child.pid));
}
function tool(name, details) {
  output({ type: 'tool_execution_end', toolName: name, result: { content: [{ type: 'text', text: 'OK' }], details }, isError: false });
}
jsonLines(process.stdin, (c) => {
  let data;
  if (c.type === 'get_state') data = { model: { id: model, provider }, thinkingLevel: thinking, isStreaming: busy && !process.env.MOCK_RETRY_GAP, messageCount, sessionId: `mock-${process.pid}` };
  if (c.type === 'get_available_models') data = { models };
  if (c.type === 'get_available_thinking_levels') data = { levels: model === 'plain' ? ['off'] : ['off', 'low', 'medium', 'high'] };
  if (c.type === 'set_model') {
    if (!models.some((m) => m.provider === c.provider && m.id === c.modelId)) {
      output({ type: 'response', command: c.type, id: c.id, success: false, error: 'Model not found' }); return;
    }
    provider = c.provider; model = c.modelId; thinking = 'off';
  }
  if (c.type === 'set_thinking_level') thinking = model === 'plain' ? 'off' : c.level;
  if (c.type === 'extension_ui_response') { output({ type: 'test_ui_response', value: c }); return; }
  output({ type: 'response', command: c.type, id: c.id, success: true, data });
  if (c.type !== 'prompt') return;
  messageCount++;
  output({ type: 'test_prompt', role, message: c.message, provider, model, thinking });
  if (process.env.MOCK_AUDIT) appendFileSync(process.env.MOCK_AUDIT, JSON.stringify({ type: 'prompt', role, message: c.message, pid: process.pid, provider, model, thinking }) + '\n');
  if (process.env.MOCK_BUSY_MS) {
    busy = true;
    output({ type: 'agent_start' });
    if (process.env.MOCK_RETRY_GAP) output({ type: 'agent_end', willRetry: true });
    setTimeout(() => { busy = false; output({ type: 'agent_settled' }); }, Number(process.env.MOCK_BUSY_MS));
    return;
  }
  if (process.env.MOCK_PASSIVE) return;
  let control;
  if (c.message.startsWith('/ai-control ')) {
    control = JSON.parse(Buffer.from(c.message.slice('/ai-control '.length), 'base64url').toString('utf8'));
    cycle = control.cycle;
    if (control.mode === 'note') return;
  }
  output({ type: 'agent_start' });
  output({ type: 'message_update', assistantMessageEvent: { type: 'text_start' } });
  output({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: role === 'implementor' ? 'PRIVATE_TRANSCRIPT_NOT_FOR_ARCHITECT' : 'Planning or reviewing' } });
  if (role === 'architect' && (!assigned || c.message.startsWith('[User feedback]'))) {
    assigned = true;
    tool('ai_directive', { ai: { kind: 'assign', cycle, text: 'Implement a focused change; run tests.' } });
  } else if (role === 'implementor' && control?.mode === 'assign') {
    tool('ai_report', { ai: { kind: 'done', cycle, text: 'Changed src/a.ts. Tests passed.' } });
  } else if (role === 'architect' && c.message.includes('Implementor done')) {
    tool('ai_inspect', { inspection: 'changes' });
    tool('ai_inspect', { inspection: 'read' });
    tool('ai_directive', { ai: { kind: 'accept', cycle, text: 'Independently verified.' } });
  }
  output({ type: 'agent_settled' });
}, () => process.exit(1));
