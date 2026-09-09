'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const register = require('../skills/ultra-delegate/scripts/pi-primary.cjs');
const slice = require('../skills/ultra-delegate/scripts/run-slice.cjs');

function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-primary-test-')));
  const handlers = {}, tools = {}, messages = [];
  const pi = { on: (name, fn) => { handlers[name] = fn; }, registerTool: (tool) => { tools[tool.name] = tool; }, sendUserMessage: (message) => messages.push(message) };
  const ctx = { cwd: root, sessionManager: { getSessionId: () => 'session' } };
  const attention = { $schema: 'ultra-attention-v1', event_key: 'run:first', run_id: 'run', slice_id: 'first', primary_session_id: 'session', reason: 'wave_terminal', counts: { finished: 2 }, attempts: [] };
  let complete, launches = 0;
  const pending = new Promise((resolve) => { complete = resolve; });
  const runtime = { ...slice, begin: () => { launches++; fs.mkdirSync(slice.directory(root, 'run', 'first'), { recursive: true }); return pending; }, status: () => attention, resume: () => Promise.resolve(attention) };
  register(pi, { runtime });
  const call = (name, params) => tools[name].execute('call', params, undefined, undefined, ctx);
  const event = (name, value = {}) => handlers[name]?.(value, ctx);
  return { root, ctx, attention, messages, tools, call, event, launches: () => launches, complete,
    receipt: () => JSON.parse(fs.readFileSync(path.join(slice.directory(root, 'run', 'first'), 'delivery.json'))),
    close: () => fs.rmSync(root, { recursive: true, force: true }) };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('W1 stays in its native tool turn, returns attention, and never sends a new input', async () => {
  const f = fixture();
  try {
    let returned = false;
    const value = f.call('ultra_slice', { action: 'run', packet: 'slice.json', delivery: 'wait' }).then((r) => { returned = true; return r; });
    await tick(); assert.equal(returned, false);
    f.complete(f.attention);
    assert.deepEqual(JSON.parse((await value).content[0].text), f.attention);
    assert.equal(f.messages.length, 0); assert.equal(f.launches(), 1);
  } finally { f.close(); }
});

test('W2 waits for native settle, suppresses duplicate input, and requires actual native delivery plus model acknowledgement', async () => {
  const f = fixture();
  try {
    await f.call('ultra_slice', { action: 'run', packet: 'slice.json', delivery: 'background' });
    f.complete(f.attention); await tick(); assert.equal(f.messages.length, 0);
    await f.event('agent_settled'); assert.equal(f.messages.length, 1);
    assert.equal(f.receipt().state, 'delivery_unknown');
    assert.deepEqual(await f.event('input', { source: 'extension', text: f.messages[0] }), { action: 'continue' });
    assert.deepEqual(await f.event('input', { source: 'extension', text: f.messages[0] }), { action: 'handled' });
    await f.event('message_start', { message: { role: 'user', content: [{ type: 'text', text: f.messages[0] }] } });
    assert.equal(f.receipt().state, 'delivered');
    await f.call('ultra_attention_ack', { event_key: f.attention.event_key });
    assert.equal(f.receipt().state, 'consumed');
    await f.event('message_end', { message: { role: 'assistant', stopReason: 'stop' } });
    await f.event('agent_settled'); assert.equal(f.receipt().state, 'consumed');
    await f.call('ultra_slice', { action: 'reconcile', run_id: 'run', slice_id: 'first', delivery: 'background' });
    await f.event('agent_settled'); await tick(); assert.equal(f.messages.length, 1);
  } finally { f.close(); }
});

test('wrong acknowledgements and failed or dead sessions never claim consumption or resend', async () => {
  const f = fixture();
  try {
    await f.call('ultra_slice', { action: 'run', packet: 'slice.json', delivery: 'background' });
    await f.event('agent_settled'); f.complete(f.attention); await tick();
    await assert.rejects(f.call('ultra_attention_ack', { event_key: 'wrong' }), /attention_not_delivered/);
    await f.event('input', { source: 'extension', text: f.messages[0] });
    await f.event('message_start', { message: { role: 'user', content: f.messages[0] } });
    await f.event('message_end', { message: { role: 'assistant', stopReason: 'error' } });
    await f.event('agent_settled'); assert.equal(f.receipt().state, 'delivery_unknown');
    await f.event('session_shutdown');
    await assert.rejects(f.call('ultra_slice', { action: 'reconcile', run_id: 'run', slice_id: 'first', delivery: 'background' }), /session_unavailable/);
    assert.equal(f.messages.length, 1);
  } finally { f.close(); }
});

test('confirmed semantic consumption stays consumed after a later turn failure and session death', async () => {
  const f = fixture();
  try {
    await f.call('ultra_slice', { action: 'run', packet: 'slice.json', delivery: 'background' });
    await f.event('agent_settled'); f.complete(f.attention); await tick();
    await f.event('input', { source: 'extension', text: f.messages[0] });
    await f.event('message_start', { message: { role: 'user', content: f.messages[0] } });
    await f.call('ultra_attention_ack', { event_key: f.attention.event_key });
    await f.event('message_end', { message: { role: 'assistant', stopReason: 'error' } });
    await f.event('agent_settled'); await f.event('session_shutdown');
    assert.equal(f.receipt().state, 'consumed'); assert.equal(f.messages.length, 1);
  } finally { f.close(); }
});
