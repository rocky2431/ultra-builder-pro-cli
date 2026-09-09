'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');
const durable = require('../../skills/ultra-delegate/scripts/durable-run.cjs');
const { hostProfile } = require('../../skills/ultra-delegate/scripts/host-profile.cjs');
const { observePiIdentity } = require('../../skills/ultra-delegate/scripts/pi-native-runtime.cjs');
const { executablePath, signalOutcome } = require('../../skills/ultra-delegate/scripts/agent-execution-driver.cjs');
const { HOSTS } = require('../../bin/run.cjs');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (file) => JSON.parse(fs.readFileSync(file));

async function main() {
  const scenario = process.argv[2] || 'normal';
  assert.ok(['normal', 'revoke-before-fresh', 'revoke-during-fresh', 'conductor-death', 'source-review'].includes(scenario));
  const repo = path.resolve(__dirname, '../..');
  const reviewing = scenario === 'source-review';
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-durable-native-')));
  const put = (file, value) => {
    const f = path.join(root, file); fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
    return { path: file, sha256: sha(fs.readFileSync(f)) };
  };
  put('probe-source.cjs', fs.readFileSync(__filename, 'utf8'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main'); git('config', 'user.name', 'Isolated native probe'); git('config', 'user.email', 'probe@example.invalid');
  put('src/base.txt', 'bounded native outputs\n'); put('output/.keep', ''); put('.gitignore', '.ultra/.runtime/\n');
  if (reviewing) {
    for (const name of Object.keys(durable.sourceHashes())) put(`review-source/${name}`, fs.readFileSync(path.join(repo, 'skills/ultra-delegate/scripts', name), 'utf8'));
    for (const name of ['pi-native-permissions.cjs', 'delegate.cjs', 'agent-execution-driver.cjs']) put(`review-source/${name}`, fs.readFileSync(path.join(repo, 'skills/ultra-delegate/scripts', name), 'utf8'));
    put('interface.md', 'Each QA writes src/value.json with lens, findings (array of severity, file, evidence, consequence), and limitations. Do not edit any product source or tests.');
    put('review-source/contract.md', fs.readFileSync(path.join(repo, 'skills/ultra-delegate/references/durable-checkpoint.md'), 'utf8'));
    for (const name of ['finite-run-slice.md', 'delegation-contract.md']) put(`review-source/${name}`, fs.readFileSync(path.join(repo, 'skills/ultra-delegate/references', name), 'utf8'));
    put('review-source/architecture.md', fs.readFileSync(path.join(repo, '.ultra/specs/architecture.md'), 'utf8'));
    put('review-source/owner.md', fs.readFileSync(path.join(repo, '.ultra/decisions/2026-09-09-root-independent-implementation.md'), 'utf8'));
  }
  git('add', '.'); git('commit', '-m', 'test: durable lifecycle base'); const base = git('rev-parse', 'HEAD');
  const identity = observePiIdentity(executablePath('pi'));
  const args = HOSTS.pi.argv({ pluginRoot: repo, prompt: '', hostArgs: ['--mode', 'rpc', '--offline', '--no-extensions',
    '--no-skills', '--no-prompt-templates', '--no-context-files', '--tools', 'read,ultra_durable',
    '--session-dir', path.join(root, 'old-sessions')] }); args.splice(-2);
  const child = spawn(identity.node_path, [identity.runtime_path, ...args], { cwd: root, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const events = [], pending = new Map(), decoder = new StringDecoder('utf8'); let buffer = '', closed = false;
  child.stdout.on('data', chunk => {
    buffer += decoder.write(chunk);
    for (;;) { const n = buffer.indexOf('\n'); if (n < 0) break; const line = buffer.slice(0, n); buffer = buffer.slice(n + 1);
      if (!line.trim()) continue; const e = JSON.parse(line); events.push(e); fs.appendFileSync(path.join(root, 'old-events.jsonl'), JSON.stringify(e) + '\n');
      if (e.type === 'response') pending.get(e.id)?.(e);
    }
  });
  child.stderr.on('data', chunk => fs.appendFileSync(path.join(root, 'old-stderr.log'), chunk));
  child.on('close', (code, signal) => { closed = true; put('old-exit.json', { code, signal, at: Date.now() }); });
  const request = (type, fields = {}) => new Promise((resolve, reject) => {
    const id = crypto.randomUUID(), timer = setTimeout(() => { pending.delete(id); reject(new Error('old_rpc_timeout')); }, 15000);
    pending.set(id, r => { clearTimeout(timer); pending.delete(id); resolve(r); }); child.stdin.write(JSON.stringify({ id, type, ...fields }) + '\n');
  });
  const watchdog = setTimeout(() => { if (!closed) process.kill(-child.pid, 'SIGKILL'); }, 120000);
  try {
    const initial = await request('get_state'); assert.equal(initial.success, true); const session = initial.data.sessionId;
    const intent = put('.ultra/changes/active/durable-checkpoint/intent.md', reviewing ? 'Accepted isolated source review: independent QA examines current durable implementation; a fresh Primary integrates both actual reports after the old Primary and Supervisor stop. Codex alone authors product code/tests. No acceptance is implied by transport completion.' : 'Accepted isolated lifecycle test: two already authorized native Workers produce six and four; one fresh native Primary computes ten after the original Primary and finite Supervisor stop. No product finalization.');
    const owner = put('.ultra/decisions/owner.md', 'Owner requests all eight implementation steps, including bounded native Pi tests; Codex authors code/tests and Pi may execute isolated product trials. This fixture exercises one exact durable work-package grant, one fresh Pi Sol turn, local output/ writes, no external effects except existing authorized provider calls. This is isolated test authority, not a production continuation grant.');
    const task = { id: 'checkpoint', ...put('.ultra/contexts/task-checkpoint.md', 'Retain original result identities; determine the sum in a fresh native session.') };
    const seam = put('interface.md', reviewing ? 'Each QA writes src/value.json with lens, findings (array of severity, file, evidence, consequence), and limitations. Do not edit any product source or tests.' : 'Each scoped Worker writes src/value.json with a total integer. Left six, right four.');
    const profile = put('.ultra/profiles/durable-native.json', { $schema: 'ultra-role-profile-v1', profile_id: 'durable-native', roles:
      ['left', 'right'].map((name) => ({ role_id: name, purpose: 'Produce one independent value', authority: 'scoped-write', host: 'pi',
        model: reviewing ? 'gpt-5.6-sol' : 'gpt-5.6-luna', qualification_sha256: sha(JSON.stringify(hostProfile('pi').enforcement)) })) });
    const attempts = ['left', 'right'].map((id, index) => {
      const tree = `.ultra/.runtime/worktrees/${id}`; fs.mkdirSync(path.dirname(path.join(root, tree)), { recursive: true }); git('worktree', 'add', '--detach', tree, base);
      return { id, role_id: id, task_id: task.id, host: 'pi', model: reviewing ? 'gpt-5.6-sol' : 'gpt-5.6-luna', worktree: tree,
        instruction: put(`.ultra/.runtime/delegations/${id}/instruction.md`, reviewing ? `Act as independent QA. Read review-source/owner.md for the original user constraints, review-source/contract.md, and the referenced finite-run-slice.md, delegation-contract.md and architecture.md contracts in review-source/. Review the exact frozen product source in review-source/. Your lens is ${index ? 'process death, claim persistence, replay and liveness' : 'owner authority, input binding and native permission enforcement'}. Inspect dependencies needed to substantiate findings. Report only concrete defects with source locations and a reproducible scenario; separate uncertainties and untested behavior. Do not implement code or tests. Use native read/ls/grep/find/write; Bash is outside this fixture permission. Write your actual review to src/value.json using the interface.md format. Then return the canonical typed result with changed_files/evidence/questions/residual_risks as string arrays and checks as object array. This is source review, not independent test execution or product acceptance.` : `Using native write, create src/value.json with {"total":${index ? 4 : 6}}. Read it back. Do not use Bash or any command. Return the canonical typed result using arrays of strings for changed_files/evidence/questions/residual_risks and an array of objects for checks. This is the entire bounded task.`),
        permission: put(`.ultra/.runtime/delegations/${id}/permission.json`, { $schema: 'ultra-delegation-permission-v1', writable_roots: ['src'], external_effects: [] }) };
    });
    const packet = put('packet.json', { $schema: 'ultra-run-slice-v1', run_id: 'durable', slice_id: 'checkpoint', change_id: 'durable-checkpoint', base_revision: base,
      primary_session_id: session, intent, grant: owner, profile, task_refs: [task], seam, attempts,
      budget: { max_concurrency: 2, attempt_timeout_seconds: reviewing ? 360 : 90, deadline_at: new Date(Date.now() + (reviewing ? 480000 : 180000)).toISOString() },
      barrier: 'all-terminal', cancel_policy: 'cancel-unfinished', experimental_ack: true });
    const grant = put('.ultra/decisions/durable-grant.json', { $schema: 'ultra-durable-grant-v1', mode: 'durable work-package', grant_id: 'checkpoint',
      repository: root, base_revision: base, change_id: 'durable-checkpoint', run_id: 'durable', slice_id: 'checkpoint', owner_decision: owner,
      intent, task_refs: [{ path: task.path, sha256: task.sha256 }], packet,
      permission: put('.ultra/decisions/fresh-permission.json', { $schema: 'ultra-delegation-permission-v1', writable_roots: ['output'], external_effects: [] }),
      prompt: put('.ultra/contexts/fresh.md', reviewing ? 'Read the exact original owner grant, task references and both Worker typed results. Read the actual src/value.json reports in .ultra/.runtime/worktrees/left and right, and cited review-source files if needed. Write a concise output/decision.json with reports (two objects each citing the actual report path and accurately summarizing its findings), decision (your evidence-based synthesis), and remaining_work (an array). Raw reports remain separately retained; do not copy their entire text into the aggregate. Preserve independent findings and disagreements; do not invent missing reviews or claim product acceptance. Use native read/write only. Do not modify product code/tests. Finish with the required consumption object after writing the real output.' : 'Read both exact original Worker results and their src/value.json files under .ultra/.runtime/worktrees/left and right. Determine the sum and write output/decision.json containing combined_total, matches_target (target ten), and a brief evidence-based decision. Use native read/write only. Preserve the original result/receipt files. Finish with the required consumption object after the actual file write.'),
      model: 'gpt-5.6-sol', expires_at: new Date(Date.now() + (reviewing ? 840000 : 360000)).toISOString(), revoked_path: '.ultra/decisions/checkpoint.revoked', max_fresh_turns: 1, turn_timeout_seconds: reviewing ? 360 : 90, ...(['source-review', 'conductor-death'].includes(scenario) ? { notification: 'macos' } : {}) });
    put('location.json', { root, scenario, fixture_revision: 4, old_primary_model: 'native configured default', grant, old_primary_pid: child.pid, old_session_id: session, identity, source_hashes: durable.sourceHashes() });
    for (const name of Object.keys(durable.sourceHashes())) put(`bound-product-source/${name}`, fs.readFileSync(path.join(repo, 'skills/ultra-delegate/scripts', name), 'utf8'));
    fs.appendFileSync(path.join(__dirname, 'stage-e-native-durable-attempts.jsonl'), JSON.stringify({ root, scenario, at: new Date().toISOString() }) + '\n');
    console.log(JSON.stringify({ root, scenario, state: 'starting' }));
    const started = await request('prompt', { message: 'The owner explicitly authorizes this isolated durable test. Read .ultra/decisions/durable-grant.json and the referenced owner decision; register exactly that grant using ultra_durable. Do not create or change files, run ultra_slice, or start another Worker. After registration returns, answer WAITING and finish. The test coordinator will close this old session; the registered lifecycle process must do the fresh continuation.' });
    assert.equal(started.success, true);
    const until = Date.now() + 110000;
    while (!events.some(e => e.type === 'agent_settled') && Date.now() < until) await delay(200);
    assert.ok(events.some(e => e.type === 'agent_settled'));
    const result = events.filter(e => e.type === 'tool_execution_end' && e.toolName === 'ultra_durable' && !e.isError).at(-1);
    assert.ok(result, 'The native Primary must use the shipped durable registration tool');
    const registered = JSON.parse(result.result.content.find(c => c.type === 'text').text); assert.equal(registered.status, 'durable_waiting');
    put('registration-result.json', registered);
    if (scenario === 'revoke-before-fresh') put('.ultra/decisions/checkpoint.revoked', 'Owner test revocation before fresh dispatch.');
    process.kill(-child.pid, 'SIGTERM'); while (!closed) await delay(50); assert.equal(signalOutcome(child.pid), 'dead');
    const dir = durable.paths(root, 'checkpoint').dir, deadline = Date.now() + (reviewing ? 720000 : 240000);
    if (['revoke-during-fresh', 'conductor-death'].includes(scenario)) {
      while (!fs.existsSync(path.join(dir, 'native-start.json')) && !fs.existsSync(path.join(dir, 'attention-required.json')) && Date.now() < deadline) await delay(100);
      const native = read(path.join(dir, 'native-start.json'));
      if (scenario === 'revoke-during-fresh') {
        while (!fs.readFileSync(path.join(dir, 'native.jsonl'), 'utf8').includes('tool_execution_start') && Date.now() < deadline) await delay(50);
        put('.ultra/decisions/checkpoint.revoked', 'Owner test revocation during fresh native processing.');
      } else {
        process.kill(-registered.conductor_pid, 'SIGKILL');
        while (signalOutcome(native.pid) !== 'dead' && Date.now() < deadline) await delay(100);
        assert.equal(signalOutcome(native.pid), 'dead');
        const before = fs.readFileSync(path.join(dir, 'native.jsonl'));
        assert.equal((await durable.wake('checkpoint', { projectRoot: root })).status, 'delivery_unknown');
        assert.deepEqual(fs.readFileSync(path.join(dir, 'native.jsonl')), before);
        assert.equal(fs.existsSync(path.join(dir, 'outcome.json')), false);
        const notification = read(path.join(dir, 'notification-result.json'));
        assert.equal(notification.status, 'os_request_accepted');
        assert.equal(read(path.join(dir, 'attention-required.json')).status, 'owner_attention');
        put('observation.json', { root, scenario, original_controller_stopped: true, fresh_stopped: true,
          delivery: 'unknown', retry_started: false, notification, source_unchanged: JSON.stringify(durable.sourceHashes()) === JSON.stringify(read(path.join(root, 'location.json')).source_hashes) });
        console.log(JSON.stringify({ root, scenario, delivery: 'unknown', retry_started: false })); return;
      }
    }
    while (!fs.existsSync(path.join(dir, 'outcome.json')) && !fs.existsSync(path.join(dir, 'attention-required.json')) && Date.now() < deadline) await delay(250);
    if (scenario.startsWith('revoke-')) {
      const attention = read(path.join(dir, 'attention-required.json')); assert.match(attention.reason, /grant_revoked|fresh_turn_unknown/);
      assert.equal(fs.existsSync(path.join(dir, 'outcome.json')), false); assert.equal(fs.existsSync(path.join(root, 'output/decision.json')), false);
      if (scenario === 'revoke-before-fresh') assert.equal(fs.existsSync(path.join(dir, 'native-start.json')), false);
      else assert.equal(signalOutcome(read(path.join(dir, 'native-start.json')).pid), 'dead');
      put('observation.json', { root, scenario, attention, output_absent: true, fresh_started: scenario === 'revoke-during-fresh',
        no_consumption_claim: true, source_unchanged: JSON.stringify(durable.sourceHashes()) === JSON.stringify(read(path.join(root, 'location.json')).source_hashes) });
      console.log(JSON.stringify({ root, scenario, stopped: true, reason: attention.reason })); return;
    }
    const failure = path.join(dir, 'attention-required.json'); assert.equal(fs.existsSync(failure), false, fs.existsSync(failure) ? fs.readFileSync(failure, 'utf8') : '');
    const outcome = read(path.join(dir, 'outcome.json')); assert.equal(outcome.status, 'consumed'); assert.notEqual(outcome.session_id, session);
    const decision = read(path.join(root, 'output/decision.json')); if (reviewing) { assert.equal(decision.reports.length, 2); assert.equal(typeof decision.decision, 'string'); assert.ok(Array.isArray(decision.remaining_work)); }
    else { assert.equal(decision.combined_total, 10); assert.equal(decision.matches_target, true); }
    const receipts = attempts.map(a => ({ path: path.dirname(a.instruction.path) + '/receipt.json', sha256: sha(fs.readFileSync(path.join(root, path.dirname(a.instruction.path), 'receipt.json'))) }));
    assert.equal((await durable.wake('checkpoint', { projectRoot: root })).status, 'consumed');
    for (const r of receipts) assert.equal(sha(fs.readFileSync(path.join(root, r.path))), r.sha256);
    assert.deepEqual(durable.sourceHashes(), read(path.join(root, 'location.json')).source_hashes);
    put('observation.json', { root, outcome, decision, receipts, repeated_wake: 'original_consumed', duplicate_workers: 0,
      old_primary_stopped: true, pre_dispatch: read(path.join(dir, 'pre-dispatch.json')), source_unchanged: true,
      limitation: 'One real native checkpoint; not full Stage E acceptance, reboot proof, product delivery or strategy promotion.' });
    console.log(JSON.stringify({ root, outcome: outcome.status, combined_total: decision.combined_total, duplicate_workers: 0 }));
  } finally { clearTimeout(watchdog); if (!closed) process.kill(-child.pid, 'SIGKILL'); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
