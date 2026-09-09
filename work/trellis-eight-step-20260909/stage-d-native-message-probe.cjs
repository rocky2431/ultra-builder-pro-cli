'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { StringDecoder } = require('node:string_decoder');
const { execFileSync, spawn } = require('node:child_process');
const { hostProfile } = require('../../skills/ultra-delegate/scripts/host-profile.cjs');
const { observePiIdentity } = require('../../skills/ultra-delegate/scripts/pi-native-runtime.cjs');
const { executablePath } = require('../../skills/ultra-delegate/scripts/agent-execution-driver.cjs');
const { HOSTS } = require('../../bin/run.cjs');
const save = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n'); };
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (file) => JSON.parse(fs.readFileSync(file));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const fault = process.argv.includes('--before-consumption') ? 'before' : process.argv.includes('--after-consumption') ? 'after' : process.argv.includes('--lost-channel') ? 'lost' : null;
  const repo = path.resolve(__dirname, '../..'), root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-native-message-')));
  save(path.join(root, 'coordinator.cjs'), fs.readFileSync(__filename, 'utf8'));
  const identity = observePiIdentity(executablePath('pi'));
  const sources = ['run-slice.cjs', 'pi-primary.cjs', 'slice-channel.cjs', 'slice-workspace.cjs', 'delegate.cjs', 'host-profile.cjs'];
  const digests = Object.fromEntries(sources.map((name) => {
    const source = fs.readFileSync(path.join(repo, 'skills/ultra-delegate/scripts', name));
    save(path.join(root, 'source', name), source.toString()); return [name, sha(source)];
  }));
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.email', 'probe@example.invalid'); git(root, 'config', 'user.name', 'Isolated Probe');
  save(path.join(root, 'src/base.txt'), 'base\n'); save(path.join(root, '.gitignore'), '.ultra/.runtime/\n');
  git(root, 'add', 'src/base.txt', '.gitignore'); git(root, 'commit', '-m', 'test: native slice base');
  const base = git(root, 'rev-parse', 'HEAD');
  const ref = (file, value) => { save(path.join(root, file), value); return { path: file, sha256: sha(fs.readFileSync(path.join(root, file))) }; };
  const roles = ['left', 'right'].map((name) => ({ role_id: name, purpose: `Produce the ${name} numeric artifact`, authority: 'scoped-write', host: 'pi', model: name === 'left' ? 'gpt-5.6-luna' : 'gpt-5.6-terra', qualification_sha256: sha(JSON.stringify(hostProfile('pi').enforcement)) }));
  const profile = ref('.ultra/profiles/native-pi-v1.json', { $schema: 'ultra-role-profile-v1', profile_id: 'native-pi-v1', roles });
  const intent = ref('.ultra/changes/active/native-slice/intent.md', 'Run three finite native lifecycle waves. Each pair produces independent numeric files. The existing native Primary reads both and writes its decision. Owner-authorized local experiment; no external effects beyond existing provider calls.');
  const grant = ref('.ultra/decisions/native-slice.md', 'Coordinator carries the existing owner authorization for this finite isolated experiment, including native Pi experimental transport. The current explicit prompt activates each exact packet. No file alone activates work.');
  const seam = ref('interface.md', 'Each delegate writes exactly src/value.json with {"total": number}; left six, right four. Primary reads both immutable results and those files and records whether combined total is ten.');
  const task = { id: 'native-slice', ...ref('.ultra/contexts/task-native-slice.md', 'Verify current production W1/W2/W3, external process identity, overlap and consumption. This is a lifecycle task, not Stage D product acceptance.') };
  const replay = path.join(root, 'replay.cjs');
  save(replay, `module.exports=pi=>{pi.registerCommand('replay_attention',{description:'Replay one test input through native extension delivery',handler:async args=>pi.sendUserMessage(Buffer.from(args,'base64').toString('utf8'),{deliverAs:'followUp'})});pi.registerTool({name:'pause_for_death',label:'Pause for death probe',description:'Wait for the coordinator to terminate this native session during an authorized lifecycle test.',parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>{await new Promise(resolve=>setTimeout(resolve,60000));return{content:[{type:'text',text:'Probe did not terminate in time'}],details:{}};}});};\n`);
  const hostArgs = ['--mode', 'rpc', '--offline', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-context-files', '--tools', 'read,write,ultra_slice,ultra_attention_ack,pause_for_death', '--extension', replay, '--session-dir', path.join(root, 'sessions'), '--model', 'gpt-5.6-luna'];
  const entryArgs = HOSTS.pi.argv({ pluginRoot: repo, prompt: '', hostArgs });
  entryArgs.splice(-2); // RPC receives explicit prompts after its real session id is known.
  const proc = spawn(identity.node_path, [identity.runtime_path, ...entryArgs], { cwd: root, env: { ...process.env, PRIMARY_CHANNEL_SECRET_CANARY: 'W3_MUST_NOT_REACH_WORKERS' }, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const events = [], listeners = new Set(), pending = new Map(), decoder = new StringDecoder('utf8');
  let buffer = '', closed = false;
  const emit = (event) => { events.push(event); fs.appendFileSync(path.join(root, 'events.jsonl'), JSON.stringify({ at: Date.now(), event }) + '\n'); for (const fn of listeners) fn(event); };
  proc.stdout.on('data', (chunk) => {
    buffer += decoder.write(chunk);
    for (;;) {
      const n = buffer.indexOf('\n'); if (n < 0) break;
      const line = buffer.slice(0, n); buffer = buffer.slice(n + 1); if (!line.trim()) continue;
      let event; try { event = JSON.parse(line); } catch { emit({ type: 'protocol_error', line }); continue; }
      emit(event);
      if (event.type === 'response' && pending.has(event.id)) pending.get(event.id)(event);
    }
  });
  proc.stderr.on('data', (chunk) => fs.appendFileSync(path.join(root, 'stderr.log'), chunk));
  proc.on('close', (code, signal) => { closed = true; emit({ type: 'native_exit', code, signal }); for (const resolve of pending.values()) resolve({ success: false, error: 'session_unavailable' }); });
  const request = (type, fields = {}) => new Promise((resolve) => {
    if (closed) { resolve({ success: false, error: 'session_unavailable' }); return; }
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { pending.delete(id); resolve({ success: false, error: 'rpc_timeout' }); }, 15000);
    pending.set(id, (value) => { clearTimeout(timer); pending.delete(id); resolve(value); });
    proc.stdin.write(JSON.stringify({ id, type, ...fields }) + '\n');
  });
  const wait = (predicate, from = events.length, timeout = 240000) => new Promise((resolve, reject) => {
    const existing = events.slice(from).find(predicate); if (existing) { resolve(existing); return; }
    const timer = setTimeout(() => { listeners.delete(onEvent); reject(new Error('native observation timeout')); }, timeout);
    const onEvent = (event) => { if (predicate(event)) { clearTimeout(timer); listeners.delete(onEvent); resolve(event); } };
    listeners.add(onEvent);
  });
  const settled = (from) => wait((e) => e.type === 'agent_settled' || e.type === 'native_exit', from);
  const watchdog = setTimeout(() => { try { process.kill(-proc.pid, 'SIGKILL'); } catch {} }, 600000);
  save(path.join(__dirname, 'stage-d-native-message-location.json'), { root, pid: proc.pid, digests });
  fs.appendFileSync(path.join(__dirname, 'stage-d-native-message-attempts.jsonl'), JSON.stringify({ root, pid: proc.pid, digests, fault }) + '\n');
  console.log(JSON.stringify({ root, pid: proc.pid }));
  try {
    const initial = await request('get_state'); assert.equal(initial.success, true, JSON.stringify(initial));
    save(path.join(root, 'initial-state.json'), initial);
    const outcomes = [];
    for (const [wave, delivery] of fault ? [['w3', 'message']] : [['w1', 'wait'], ['w2', 'background'], ['w3', 'message']]) {
      const packet = { $schema: 'ultra-run-slice-v1', run_id: 'native', slice_id: wave, change_id: 'native-slice', base_revision: base, primary_session_id: initial.data.sessionId,
        intent, grant, profile, seam, task_refs: [task], attempts: [], experimental_ack: true,
        budget: { max_concurrency: 2, attempt_timeout_seconds: 180, deadline_at: new Date(Date.now() + 210000).toISOString() }, barrier: 'all-terminal', cancel_policy: 'cancel-unfinished' };
      for (const role of roles) {
        const id = `${wave}-${role.role_id}`, tree = `.ultra/.runtime/trees/${id}`;
        fs.mkdirSync(path.dirname(path.join(root, tree)), { recursive: true }); git(root, 'worktree', 'add', '--detach', path.join(root, tree), base);
        packet.attempts.push({ id, role_id: role.role_id, task_id: task.id, host: role.host, model: role.model, worktree: tree,
          instruction: ref(`.ultra/.runtime/delegations/${id}/instruction.md`, `Use write to create src/value.json containing {"total":${role.role_id === 'left' ? 6 : 4}} followed by a newline. Read that file once to confirm. Return exactly the required result JSON with changed_files and evidence each listing src/value.json, checks empty. Do not use other tools or effects.`),
          permission: ref(`.ultra/.runtime/delegations/${id}/permission.json`, { $schema: 'ultra-delegation-permission-v1', writable_roots: ['src'], external_effects: [] }) });
      }
      save(path.join(root, `${wave}.json`), packet);
      const start = events.length;
      const decisionInstruction = `Read each attempt result reference and then its worktree src/value.json (paths: ${packet.attempts.map((a) => `${a.worktree}/src/value.json`).join(', ')}). Write decision-${wave}.json with event_key "native:${wave}", combined_total and matches_target boolean for whether the total equals ten. ${delivery !== 'wait' ? 'Then call ultra_attention_ack with the exact event_key.' : ''}`;
      const continuation = fault === 'before' ? 'Immediately call pause_for_death. Do not read, decide or acknowledge before that pause; the coordinator is testing pre-consumption death.' : `${decisionInstruction} ${fault === 'after' ? 'After the acknowledgement tool has returned consumed, call pause_for_death to let the coordinator test post-consumption death.' : 'Finish with a short confirmation.'}`;
      const prompt = `Run exactly ${wave}.json using ultra_slice action run and delivery ${delivery}. The packet names your real native session. Do not poll, inspect runtime status, use bash, modify the packet or launch any other work. ${delivery !== 'wait' ? 'After the tool returns, answer WAITING and end this turn. The later completion attention will continue this same session.' : 'Stay in this tool turn until it returns.'} After receiving the attention: ${continuation} This is an authorized isolated native lifecycle experiment, including the explicit experimental transport acknowledgement.`;
      const ack = await request('prompt', { message: prompt }); assert.equal(ack.success, true, JSON.stringify(ack));
      const first = await settled(start); assert.equal(first.type, 'agent_settled');
      if (fault === 'lost') {
        const tool = events.slice(start).find(e => e.type === 'tool_execution_end' && e.toolName === 'ultra_slice' && !e.isError);
        const waiting = JSON.parse(tool.result.content.find(p => p.type === 'text').text);
        assert.ok(Number.isInteger(waiting.controller_pid)); assert.notEqual(waiting.controller_pid, proc.pid);
        process.kill(waiting.controller_pid, 'SIGKILL');
        const lossFrom = events.length; await sleep(1500);
        assert.equal(events.slice(lossFrom).filter(e => e.type === 'agent_start').length, 0);
        assert.ok(!fs.existsSync(path.join(root, '.ultra/.runtime/runs/native/w3/delivery.json')));
        const receipts = packet.attempts.map(a => read(path.join(root, path.dirname(a.instruction.path), 'receipt.json')));
        const recoveryFrom = events.length;
        const recoveryPrompt = `The explicitly authorized lifecycle experiment killed the original controller before attention. Reconcile the same run native / slice w3 using ultra_slice action reconcile and delivery message. Do not run a new slice or worker. Answer WAITING after the tool returns. On the later completion, ${decisionInstruction} Finish with a short confirmation.`;
        assert.equal((await request('prompt', { message: recoveryPrompt })).success, true);
        const recoveryWait = await settled(recoveryFrom); assert.equal(recoveryWait.type, 'agent_settled');
        assert.equal((await settled(events.indexOf(recoveryWait) + 1)).type, 'agent_settled');
        const receipt = read(path.join(root, '.ultra/.runtime/runs/native/w3/delivery.json'));
        assert.equal(receipt.state, 'consumed'); assert.equal(receipt.transport, 'w3-process-message');
        assert.equal(read(path.join(root, 'decision-w3.json')).combined_total, 10);
        assert.deepEqual(packet.attempts.map(a => read(path.join(root, path.dirname(a.instruction.path), 'receipt.json'))), receipts);
        save(path.join(root, 'observation.json'), { root, fault, identity, digests, session_id: initial.data.sessionId, primary_pid: proc.pid, killed_controller_pid: waiting.controller_pid, initial_delivery: 'unknown', lost_channel_idle_model_turns: 0, recovery: 'explicit same-session reconcile', final_receipt: receipt, duplicate_workers: 0, original_receipts: receipts, limitations: ['Controller death was injected before message delivery; reconciliation was explicitly requested, not autonomous W4.'] });
        console.log(JSON.stringify({ fault, root, delivery: receipt.state, duplicate_workers: 0 }));
        return;
      }
      if (delivery !== 'wait') {
        const next = events.indexOf(first) + 1;
        if (fault) {
          await wait((e) => e.type === 'tool_execution_start' && e.toolName === 'pause_for_death', next);
          const receipt = read(path.join(root, `.ultra/.runtime/runs/native/${wave}/delivery.json`));
          assert.equal(receipt.state, fault === 'after' ? 'consumed' : 'delivered');
          const deathFrom = events.length; process.kill(-proc.pid, 'SIGKILL'); await wait((e) => e.type === 'native_exit', deathFrom, 10000);
          assert.equal((await request('get_state')).error, 'session_unavailable');
          assert.deepEqual(read(path.join(root, `.ultra/.runtime/runs/native/${wave}/delivery.json`)), receipt);
          if (fault === 'after') assert.equal(read(path.join(root, `decision-${wave}.json`)).combined_total, 10);
          save(path.join(root, 'observation.json'), { root, fault, identity, digests, session_id: initial.data.sessionId, receipt_before_death: receipt, derived_delivery_after_death: fault === 'after' ? 'consumed' : 'delivery_unknown', native_exit: true, resend_count: 0, limitation: 'Abrupt death preserves the last receipt bytes; unconsumed delivery is unknown, not a safe retry. No W4 recovery is claimed.' });
          console.log(JSON.stringify({ fault, before: receipt.state, after: fault === 'after' ? 'consumed' : 'delivery_unknown', root }));
          return;
        }
        assert.equal((await settled(next)).type, 'agent_settled');
      }
      const attention = read(path.join(root, `.ultra/.runtime/runs/native/${wave}/attention.json`));
      assert.deepEqual(attention.counts, { finished: 2 }, JSON.stringify(attention));
      const decision = read(path.join(root, `decision-${wave}.json`));
      assert.equal(decision.event_key, `native:${wave}`); assert.equal(decision.combined_total, 10); assert.equal(decision.matches_target, true);
      const nativeTurns = events.slice(start).filter((e) => e.type === 'agent_start').length;
      assert.equal(nativeTurns, delivery !== 'wait' ? 2 : 1);
      const workerResults = packet.attempts.map((a) => read(path.join(root, path.dirname(a.instruction.path), 'result.json')));
      assert.ok(Math.max(...workerResults.map((r) => Date.parse(r.started_at))) < Math.min(...workerResults.map((r) => Date.parse(r.finished_at))));
      let receipt = null;
      if (delivery !== 'wait') {
        receipt = read(path.join(root, `.ultra/.runtime/runs/native/${wave}/delivery.json`)); assert.equal(receipt.state, 'consumed');
        const history = await request('get_messages'); save(path.join(root, 'native-history.json'), history);
        const message = events.slice(start).filter((e) => e.type === 'message_start' && e.message?.role === 'user')
          .flatMap((e) => e.message.content || []).find((part) => part.type === 'text' && part.text.startsWith('Ultra completion attention ')).text;
        const before = events.filter((e) => e.type === 'agent_start').length;
        assert.equal((await request('prompt', { message: `/replay_attention ${Buffer.from(message).toString('base64')}` })).success, true);
        await sleep(400); assert.equal(events.filter((e) => e.type === 'agent_start').length, before);
      }
      const toolResults = events.slice(start).filter(e => e.type === 'tool_execution_end' && e.toolName === 'ultra_slice').flatMap(e => e.result?.content || []).filter(p => p.type === 'text').map(p => { try { return JSON.parse(p.text); } catch { return null; } });
      const controller = toolResults.find(v => v?.delivery === 'message');
      if (delivery === 'message') { assert.ok(Number.isInteger(controller?.controller_pid)); assert.notEqual(controller.controller_pid, proc.pid); assert.equal(receipt.transport, 'w3-process-message'); }
      outcomes.push({ controller_pid: controller?.controller_pid || null, primary_pid: proc.pid, wave, delivery, attention, decision, nativeTurns, receipt, worker_native_sessions: workerResults.map((r) => r.native_terminal), overlap: true });
      console.log(JSON.stringify(outcomes.at(-1)));
    }
    const idleFrom = events.length; await sleep(3000); assert.equal(events.slice(idleFrom).filter((e) => ['agent_start', 'message_start'].includes(e.type)).length, 0);
    assert.equal((await request('get_state')).data.sessionId, initial.data.sessionId);
    const final = { root, identity, session_id: initial.data.sessionId, args: entryArgs, digests, outcomes, idle_ms: 3000, idle_model_turns: 0, source_unchanged: sources.every((n) => sha(fs.readFileSync(path.join(repo, 'skills/ultra-delegate/scripts', n))) === digests[n]), limitations: ['Production lifecycle proof only; Stage D product repetition, operational repair and fair comparison remain separate.', 'Native exactly-once delivery is not claimed.'] };
    assert.equal(final.source_unchanged, true); save(path.join(root, 'observation.json'), final);
  } finally {
    clearTimeout(watchdog);
    if (!closed) { const from = events.length; process.kill(-proc.pid, 'SIGKILL'); await wait((e) => e.type === 'native_exit', from, 10000); }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
