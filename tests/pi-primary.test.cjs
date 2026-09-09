'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const register = require('../skills/ultra-delegate/scripts/pi-primary.cjs');
const slice = require('../skills/ultra-delegate/scripts/run-slice.cjs');

function fixture({ messageChannel } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-primary-test-')));
  const handlers = {}, tools = {}, messages = [];
  const pi = { on: (name, fn) => { handlers[name] = fn; }, registerTool: (tool) => { tools[tool.name] = tool; }, sendUserMessage: (message) => messages.push(message) };
  const ctx = { cwd: root, sessionManager: { getSessionId: () => 'session' } };
  const attention = { $schema: 'ultra-attention-v1', event_key: 'run:first', run_id: 'run', slice_id: 'first', primary_session_id: 'session', reason: 'wave_terminal', counts: { finished: 2 }, attempts: [] };
  let complete, launches = 0;
  const pending = new Promise((resolve) => { complete = resolve; });
  const runtime = { ...slice, begin: () => { launches++; fs.mkdirSync(slice.directory(root, 'run', 'first'), { recursive: true }); return pending; }, status: () => attention, resume: () => Promise.resolve(attention) };
  register(pi, { runtime, messageChannel });
  const call = (name, params) => tools[name].execute('call', params, undefined, undefined, ctx);
  const event = (name, value = {}) => handlers[name]?.(value, ctx);
  return { root, ctx, attention, messages, tools, call, event, launches: () => launches, complete,
    receipt: () => JSON.parse(fs.readFileSync(path.join(slice.directory(root, 'run', 'first'), 'delivery.json'))),
    close: () => fs.rmSync(root, { recursive: true, force: true }) };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('durable registration takes an owner-grant filename, never copied JSON', async () => {
  const f = fixture();
  try {
    await assert.rejects(f.call('ultra_durable', { grant: '{"mode":"durable work-package"}' }), /grant_filename_required/);
    assert.equal(f.messages.length, 0); assert.equal(f.launches(), 0);
  } finally { f.close(); }
});

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


test('W3 receives external-controller attention through the same native delivery and consumption boundary', async () => {
  let complete, cancellations = 0;
  const pending = new Promise((resolve) => { complete = resolve; });
  const f = fixture({ messageChannel: { open: () => ({ attention: pending, pid: 123, cancel: () => { cancellations++; } }) } });
  try {
    const result = await f.call('ultra_slice', { action: 'run', packet: 'slice.json', delivery: 'message' });
    assert.equal(JSON.parse(result.content[0].text).delivery, 'message');
    assert.equal(f.launches(), 0, 'W3 does not start an in-process W2 controller');
    await assert.rejects(f.call('ultra_slice', { action: 'run', packet: 'another.json', delivery: 'message' }), /background_slice_pending/);
    fs.mkdirSync(slice.directory(f.root, 'run', 'first'), { recursive: true });
    complete(f.attention); await tick(); await f.event('agent_settled');
    assert.equal(f.messages.length, 1); assert.equal(f.receipt().transport, 'w3-process-message');
    await f.event('input', { source: 'extension', text: f.messages[0] });
    await f.event('message_start', { message: { role: 'user', content: f.messages[0] } });
    await f.call('ultra_attention_ack', { event_key: 'run:first' });
    await f.event('session_shutdown');
    assert.equal(f.receipt().state, 'consumed'); assert.equal(cancellations, 0);
  } finally { f.close(); }
});

test('W3 pending controller is cancelled on native session shutdown without semantic delivery', async () => {
  let cancellations = 0;
  const f = fixture({ messageChannel: { open: () => ({ attention: new Promise(() => {}), pid: 123, cancel: () => { cancellations++; } }) } });
  try {
    await f.call('ultra_slice', { action: 'run', packet: 'slice.json', delivery: 'message' });
    await f.event('session_shutdown');
    assert.equal(cancellations, 1); assert.equal(f.messages.length, 0);
  } finally { f.close(); }
});
