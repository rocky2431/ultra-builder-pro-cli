'use strict';

// Bounded native-host lifecycle spike, before implementing the Run Slice controller.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { observePiIdentity } = require('../../skills/ultra-delegate/scripts/pi-native-runtime.cjs');
const { executablePath } = require('../../skills/ultra-delegate/scripts/agent-execution-driver.cjs');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');

async function main() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-pi-wake-')));
  const extensionWake = process.argv.includes('--extension-wake');
  fs.copyFileSync(__filename, path.join(root, 'coordinator-probe.cjs'));
  const identity = observePiIdentity(executablePath('pi'));
  const extension = path.join(root, 'wait.cjs');
  fs.writeFileSync(extension, `const fs = require('node:fs');
module.exports = (pi) => { pi.registerTool({
  name: 'receive_attention', label: 'Receive Attention',
  description: 'Block mechanically for one finite completion; return its bounded attention.',
  parameters: {type:'object',properties:{},additionalProperties:false},
  async execute() {
    const before = Date.now();
    await new Promise(resolve => setTimeout(resolve, 3000));
    const attention = {run_id:'wake-spike',slice_id:'w1',event_id:'wave-1',reason:'wave_terminal',counts:{finished:2},result_refs:['left.json','right.json']};
    fs.writeFileSync('wait-observation.json',JSON.stringify({before,after:Date.now(),attention})+'\\n');
    return {content:[{type:'text',text:JSON.stringify(attention)}],details:{}};
  }
});
pi.on('session_start', () => {
  pi.setActiveTools(['read','write','receive_attention','queue_attention']);
  fs.writeFileSync('active-tools.json',JSON.stringify(pi.getActiveTools())+'\\n');
});
let armed = false, seen = false;
const message = 'ULTRA_ATTENTION wake-spike/w2/wave-2: two workers finished; result refs left.json and right.json. Read both, decide whether their total is ten, and write decision.json with event_key:"wake-spike/w2/wave-2", combined_total and boolean matches_target. No other effects.';
pi.registerTool({name:'queue_attention',label:'Queue Attention',description:'Start one finite background completion after this turn settles.',parameters:{type:'object',properties:{},additionalProperties:false},async execute(){armed=true;return {content:[{type:'text',text:'started; end this turn without polling'}],details:{}};}});
pi.on('agent_settled', () => { if(armed){armed=false;setTimeout(()=>pi.sendUserMessage(message,{deliverAs:'followUp'}),3000);} });
pi.on('input', (event) => {
  if(event.source==='extension' && event.text===message){
    fs.appendFileSync('delivery-events.jsonl',JSON.stringify({at:Date.now(),status:seen?'duplicate_suppressed':'input_observed'})+'\\n');
    if(seen)return {action:'handled'};
    seen=true;
  }
  return {action:'continue'};
});
pi.registerCommand('repeat_attention',{description:'Replay the same finite wake input',handler:async()=>{pi.sendUserMessage(message,{deliverAs:'followUp'});}});
};\n`);
  save(path.join(root, 'left.json'), { total: 6 });
  save(path.join(root, 'right.json'), { total: 4 });
  const args = [identity.runtime_path, '--mode', 'rpc', '--offline', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-context-files', '--tools', 'read,write,receive_attention,queue_attention', '--extension', extension, '--session-dir', path.join(root, 'sessions')];
  const proc = spawn(identity.node_path, args, { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
  const events = [], pending = new Map(), listeners = new Set(), deliveries = new Map();
  let buffer = '', closed = false;
  const emit = (event) => { events.push(event); fs.appendFileSync(path.join(root, 'events.jsonl'), JSON.stringify({ observed_at: new Date().toISOString(), event }) + '\n'); for (const fn of listeners) fn(event); };
  proc.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      const event = JSON.parse(line); emit(event);
      if (event.type === 'response' && pending.has(event.id)) { pending.get(event.id)(event); pending.delete(event.id); }
    }
  });
  proc.stderr.on('data', (chunk) => fs.appendFileSync(path.join(root, 'stderr.log'), chunk));
  proc.on('close', (code, signal) => { closed = true; emit({ type: 'native_exit', code, signal }); });
  const wait = (predicate, timeout = 120000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { listeners.delete(onEvent); reject(new Error('bounded observation timed out')); }, timeout);
    const onEvent = (event) => { if (predicate(event)) { clearTimeout(timer); listeners.delete(onEvent); resolve(event); } };
    listeners.add(onEvent);
  });
  const request = (type, fields = {}) => {
    if (closed) return Promise.resolve({ success: false, error: 'session_unavailable' });
    const id = crypto.randomUUID();
    return new Promise((resolve) => { pending.set(id, resolve); proc.stdin.write(JSON.stringify({ id, type, ...fields }) + '\n'); });
  };
  const settledTurn = async (message) => {
    const end = wait((e) => e.type === 'agent_settled' || e.type === 'native_exit');
    const ack = await request('prompt', { message }); assert.equal(ack.success, true, JSON.stringify(ack));
    return { ack, terminal: await end };
  };
  const deliver = async (attention) => {
    const key = `${attention.run_id}/${attention.slice_id}/${attention.event_id}`;
    if (deliveries.has(key)) return { status: 'duplicate_suppressed', key };
    if (closed) return { status: 'session_unavailable', key };
    // A live adapter never resends an uncertain event. No persistence is claimed by this W2 spike.
    deliveries.set(key, 'pending');
    const turn = await settledTurn(`Completion attention: ${JSON.stringify(attention)}. Read left.json and right.json, decide whether their combined total equals ten, and write decision.json containing the exact event key "${key}", combined_total, and your boolean matches_target. This is the sole semantic application for that key. Return a short confirmation. No other effects.`);
    const messages = events.filter((e) => e.type === 'message_end' && e.message?.role === 'assistant');
    const decision = fs.existsSync(path.join(root, 'decision.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'decision.json'))) : null;
    const consumed = turn.terminal.type === 'agent_settled' && messages.at(-1)?.message?.stopReason === 'stop' && decision?.event_key === key;
    deliveries.set(key, consumed ? 'consumed' : 'delivery_unknown');
    return { status: deliveries.get(key), key, turn, decision };
  };
  const timer = setTimeout(() => { try { process.kill(-proc.pid, 'SIGKILL'); } catch {} }, 240000);
  console.log(JSON.stringify({ root, pid: proc.pid }));
  try {
    const initial = await request('get_state'); assert.equal(initial.success, true);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'active-tools.json'))).sort(), ['queue_attention', 'read', 'receive_attention', 'write']);
    const w1Start = events.length;
    const w1 = await settledTurn('Call receive_attention once, wait for its result, then confirm its event id and stop. Do not poll or read anything while waiting. No other tools or writes.');
    const w1Events = events.slice(w1Start), waitObservation = JSON.parse(fs.readFileSync(path.join(root, 'wait-observation.json')));
    assert.equal(w1Events.filter((e) => e.type === 'tool_execution_start').length, 1);
    assert.equal(w1Events.filter((e) => e.type === 'agent_start').length, 1);
    assert.ok(waitObservation.after - waitObservation.before >= 2900);
    const idleStart = events.length; await sleep(3000);
    assert.equal(events.slice(idleStart).filter((e) => e.type === 'agent_start' || e.type === 'message_start').length, 0);
    const attention = { run_id: 'wake-spike', slice_id: 'w2', event_id: 'wave-2', reason: 'wave_terminal', counts: { finished: 2 }, result_refs: ['left.json', 'right.json'] };
    let w2, duplicate;
    if (extensionWake) {
      await settledTurn('Call queue_attention once and return WAITING. Do not poll or do other work. A later real attention will supply the results.');
      const before = events.filter((e) => e.type === 'agent_start').length;
      const terminal = await wait((e) => e.type === 'agent_settled' || e.type === 'native_exit');
      const decision = JSON.parse(fs.readFileSync(path.join(root, 'decision.json')));
      assert.equal(terminal.type, 'agent_settled'); assert.equal(decision.event_key, 'wake-spike/w2/wave-2');
      w2 = { status: 'consumed', transport: 'native extension sendUserMessage', terminal, decision };
      const repeat = await request('prompt', { message: '/repeat_attention' }); assert.equal(repeat.success, true);
      await sleep(300);
      const receipts = fs.readFileSync(path.join(root, 'delivery-events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
      assert.deepEqual(receipts.map((e) => e.status), ['input_observed', 'duplicate_suppressed']);
      assert.equal(events.filter((e) => e.type === 'agent_start').length - before, 1);
      duplicate = receipts[1];
    } else {
      const before = events.filter((e) => e.type === 'agent_start').length;
      w2 = await deliver(attention); assert.equal(w2.status, 'consumed', JSON.stringify(w2));
      duplicate = await deliver(attention); assert.equal(duplicate.status, 'duplicate_suppressed');
      assert.equal(events.filter((e) => e.type === 'agent_start').length - before, 1);
    }
    assert.equal(w2.decision.combined_total, 10); assert.equal(w2.decision.matches_target, true);
    const state = await request('get_state'); assert.equal(state.data.sessionId, initial.data.sessionId);
    const nativeHistory = await request('get_messages'); save(path.join(root, 'native-history.json'), nativeHistory);
    const death = wait((e) => e.type === 'native_exit');
    const deathAck = await request('prompt', { message: 'Read left.json and right.json, then summarize. No writes.' });
    assert.equal(deathAck.success, true); process.kill(-proc.pid, 'SIGKILL'); await death;
    const afterDeath = await deliver({ ...attention, event_id: 'after-death' }); assert.equal(afterDeath.status, 'session_unavailable');
    const outcome = { root, identity, args, pid: proc.pid, session_id: initial.data.sessionId, w1, waitObservation, idle_wait_ms: 3000, idle_model_turns: 0, w2, duplicate, accepted_then_killed: { ack: deathAck, state: 'delivery_unknown', consumed: false }, afterDeath, closed, limitations: ['W1 wait and live idle interval each tested at 3 seconds, not a universal maximum.', 'Dedupe is owned by this finite live adapter; no W3/W4 durability or native exactly-once delivery is claimed.', 'This tests native lifecycle semantics, not the future production Run Slice or product delivery.'] };
    save(path.join(root, 'observation.json'), outcome);
    save(path.join(__dirname, 'stage-c-pi-wake-location.json'), { root, observation_sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'observation.json'))).digest('hex') });
    console.log(JSON.stringify(outcome));
  } finally { clearTimeout(timer); if (!closed) { const exit = wait((e) => e.type === 'native_exit', 10000); process.kill(-proc.pid, 'SIGKILL'); await exit; } }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
