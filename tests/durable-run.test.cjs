'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const { test } = require('node:test');
const durable = require('../skills/ultra-delegate/scripts/durable-run.cjs');
const nativeMachine = { skip: !['darwin', 'linux'].includes(process.platform) };

function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-durable-')));
  const put = (file, value) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    const bytes = typeof value === 'string' ? value : JSON.stringify(value);
    fs.writeFileSync(path.join(root, file), bytes);
    return { path: file, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  };
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  put('seed.txt', 'base'); git('add', '.'); git('commit', '-m', 'test: base');
  fs.mkdirSync(path.join(root, 'output'));
  const grant = { $schema: 'ultra-durable-grant-v1', mode: 'durable work-package', grant_id: 'grant',
    repository: root, base_revision: git('rev-parse', 'HEAD'), change_id: 'change', run_id: 'run', slice_id: 'wave',
    owner_decision: put('.ultra/decisions/owner.md', 'Explicit owner grant for one bounded recovery.'),
    intent: put('.ultra/changes/active/change/intent.md', 'Accepted local task'),
    task_refs: [put('.ultra/contexts/task.md', 'Integrate existing results')],
    permission: put('.ultra/decisions/fresh-permission.json', { $schema: 'ultra-delegation-permission-v1', writable_roots: ['output'], external_effects: [] }),
    prompt: put('.ultra/contexts/fresh.md', 'Read the retained results and finish the local report.'),
    packet: put('packet.json', { run_id: 'run', slice_id: 'wave', primary_session_id: 'old' }),
    model: 'gpt-5.6-sol', expires_at: new Date(Date.now() + 60000).toISOString(),
    revoked_path: '.ultra/decisions/grant.revoked', max_fresh_turns: 1, turn_timeout_seconds: 30 };
  let ref = put('.ultra/decisions/grant.json', grant);
  return { root, grant, put, ref: () => ref, save: () => { ref = put(ref.path, grant); },
    close: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('durable authority rejects ordinary grants, expiry, revoke, drift and writable authority before recovery', () => {
  const f = fixture();
  try {
    assert.equal(durable.authority(f.root, f.ref()).grant.grant_id, 'grant');
    const valid = JSON.stringify(f.grant);
    for (const [key, value, failure] of [
      ['mode', 'session-local', /durable_grant_required/],
      ['expires_at', new Date(0).toISOString(), /grant_expired/],
      ['max_fresh_turns', 2, /invalid_durable_grant/],
      ['repository', '/different', /repository_mismatch/],
    ]) {
      f.grant[key] = value; f.save(); assert.throws(() => durable.authority(f.root, f.ref()), failure);
      Object.assign(f.grant, JSON.parse(valid)); f.save();
    }
    f.put(f.grant.revoked_path, 'revoked'); assert.throws(() => durable.authority(f.root, f.ref()), /grant_revoked/);
    fs.unlinkSync(path.join(f.root, f.grant.revoked_path));
    f.put(f.grant.intent.path, 'changed'); assert.throws(() => durable.authority(f.root, f.ref()), /input_drift/);
    f.grant.intent = f.put(f.grant.intent.path, 'Accepted local task');
    f.grant.permission = f.put(f.grant.permission.path, { $schema: 'ultra-delegation-permission-v1', writable_roots: ['.ultra'], external_effects: [] });
    f.save(); assert.throws(() => durable.authority(f.root, f.ref()), /writable_authority/);
  } finally { f.close(); }
});

test('one durable claim survives duplicate callers and missing runtime observations never imply permission to replay', nativeMachine, () => {
  const f = fixture();
  try {
    const registration = durable.register(f.ref(), { projectRoot: f.root, sessionId: 'old', primaryPid: process.pid });
    assert.equal(registration.state, 'registered');
    assert.throws(() => durable.register(f.ref(), { projectRoot: f.root, sessionId: 'old', primaryPid: process.pid }), /already_registered/);
    const first = durable.claim(f.root, 'grant');
    assert.equal(first.acquired, true);
    assert.equal(durable.claim(f.root, 'grant').acquired, false);
    fs.unlinkSync(path.join(f.root, '.ultra/.runtime/durable/grant/claim.json'));
    assert.equal(durable.inspect('grant', { projectRoot: f.root }).state, 'delivery_unknown');
    fs.rmSync(path.join(f.root, '.ultra/.runtime/durable/grant'), { recursive: true });
    assert.throws(() => durable.register(f.ref(), { projectRoot: f.root, sessionId: 'old', primaryPid: process.pid }), /already_registered/);
    assert.throws(() => durable.status('grant', { projectRoot: f.root }), /recovery_history_missing/);
  } finally { f.close(); }
});

test('two real claimant processes and a second grant for the same event cannot create two fresh turns', nativeMachine, async () => {
  const f = fixture();
  try {
    durable.register(f.ref(), { projectRoot: f.root, sessionId: 'old', primaryPid: process.pid });
    const command = `const d=require(${JSON.stringify(require.resolve('../skills/ultra-delegate/scripts/durable-run.cjs'))}); console.log(JSON.stringify(d.claim(process.argv[1],'grant')));`;
    const invoke = () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['-e', command, f.root], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '', err = ''; child.stdout.on('data', b => { out += b; }); child.stderr.on('data', b => { err += b; });
      child.once('error', reject); child.once('close', code => code === 0 ? resolve(JSON.parse(out)) : reject(new Error(err)));
    });
    const results = await Promise.all([invoke(), invoke()]);
    assert.equal(results.filter(result => result.acquired).length, 1);
    f.grant.grant_id = 'second'; const second = f.put('.ultra/decisions/second.json', f.grant);
    durable.register(second, { projectRoot: f.root, sessionId: 'old', primaryPid: process.pid });
    assert.equal(durable.claim(f.root, 'second').acquired, false);
  } finally { f.close(); }
});

test('tampered registration, symlinked authority, machine change and revoked restart fail before claiming', nativeMachine, () => {
  const f = fixture();
  const hostname = os.hostname;
  try {
    const record = durable.register(f.ref(), { projectRoot: f.root, sessionId: 'old', primaryPid: process.pid });
    const file = '.ultra/.runtime/durable/grant/registration.json';
    f.put(file, { ...record, primary_pid: process.pid + 1 });
    assert.throws(() => durable.status('grant', { projectRoot: f.root }), /recovery_history_mismatch/);
    f.put(file, record);
    os.hostname = () => hostname() + '-different-machine';
    assert.throws(() => durable.claim(f.root, 'grant'), /machine_identity_changed/); os.hostname = hostname;
    fs.renameSync(path.join(f.root, f.grant.intent.path), path.join(f.root, 'intent-original.md'));
    fs.symlinkSync(path.join(f.root, 'intent-original.md'), path.join(f.root, f.grant.intent.path));
    assert.throws(() => durable.claim(f.root, 'grant'), /symlink_path/);
    fs.unlinkSync(path.join(f.root, f.grant.intent.path)); fs.renameSync(path.join(f.root, 'intent-original.md'), path.join(f.root, f.grant.intent.path));
    f.put(f.grant.revoked_path, 'revoked'); assert.throws(() => durable.claim(f.root, 'grant'), /grant_revoked/);
    assert.equal(fs.existsSync(path.join(f.root, '.ultra/.runtime/durable/grant/claim.json')), false);
  } finally { os.hostname = hostname; f.close(); }
});

test('the fresh native effect handler rejects an actual write after revocation and keeps out-of-scope tools denied', nativeMachine, async () => {
  const f = fixture(), prior = process.env.UBP_PI_DURABLE_CONFIG;
  try {
    const record = durable.register(f.ref(), { projectRoot: f.root, sessionId: 'old', primaryPid: process.pid });
    const claimed = durable.claim(f.root, 'grant');
    f.put('tools.cjs', 'exports.createAllToolDefinitions=()=>Object.fromEntries(["bash","edit","find","grep","ls","powershell","read","write"].map(name=>[name,{name}]));');
    process.env.UBP_PI_DURABLE_CONFIG = JSON.stringify({ root: f.root, grant_id: 'grant', registration_nonce: record.nonce,
      claim_nonce: claimed.claim.nonce, native_tools_module: path.join(f.root, 'tools.cjs') });
    const handlers = {}, tools = [];
    const pi = { on: (name, fn) => { handlers[name] = fn; }, registerTool: tool => tools.push(tool), getAllTools: () => tools,
      setActiveTools() {}, getActiveTools: () => tools.map(tool => tool.name) };
    await require('../skills/ultra-delegate/scripts/pi-durable-primary.cjs')(pi);
    const ctx = { cwd: f.root, sessionManager: { getSessionId: () => 'fresh' } };
    const write = { toolName: 'write', toolCallId: 'first', input: { path: 'output/allowed.txt' } };
    assert.equal(handlers.tool_call(write, ctx), undefined); fs.writeFileSync(write.input.path, 'allowed');
    assert.equal(handlers.tool_call({ toolName: 'bash', toolCallId: 'shell', input: { command: 'echo unauthorized' } }, ctx).block, true);
    f.put(f.grant.revoked_path, 'revoked');
    const denied = handlers.tool_call({ toolName: 'write', toolCallId: 'second', input: { path: 'output/denied.txt' } }, ctx);
    assert.equal(denied.block, true); assert.match(denied.reason, /grant_revoked/);
    assert.equal(fs.existsSync(path.join(f.root, 'output/denied.txt')), false);
    assert.equal(fs.readFileSync(path.join(f.root, 'output/allowed.txt'), 'utf8'), 'allowed');
  } finally {
    if (prior === undefined) delete process.env.UBP_PI_DURABLE_CONFIG; else process.env.UBP_PI_DURABLE_CONFIG = prior;
    f.close();
  }
});


test('public status and repeated revoke preserve the same explicit revocation and reject wake', nativeMachine, async () => {
  const f = fixture(), options = { projectRoot: f.root };
  try {
    durable.register(f.ref(), { ...options, sessionId: 'old', primaryPid: process.pid });
    assert.equal((await durable.handle(['status', '--grant', 'grant'], options)).authority, 'valid');
    assert.equal((await durable.handle(['revoke', '--grant', 'grant'], options)).authority, 'grant_revoked');
    const first = fs.readFileSync(path.join(f.root, f.grant.revoked_path), 'utf8');
    await durable.handle(['revoke', '--grant', 'grant'], options);
    assert.equal(fs.readFileSync(path.join(f.root, f.grant.revoked_path), 'utf8'), first);
    await assert.rejects(durable.handle(['wake', '--grant', 'grant'], options), /grant_revoked/);
    await assert.rejects(durable.handle(['status', '--grant', '../bad'], options), /invalid_arguments/);
    assert.match((await durable.handle(['--help'])).usage, /status\|wake\|revoke/);
  } finally { f.close(); }
});

test('notification is opt-in and a failed OS request cannot be automatically retried', { skip: process.platform !== 'darwin' }, () => {
  const f = fixture();
  try {
    f.grant.notification = 'macos'; f.save();
    durable.register(f.ref(), { projectRoot: f.root, sessionId: 'old', primaryPid: process.pid });
    let calls = 0;
    const options = { projectRoot: f.root, execute: (file, args) => {
      calls++; assert.equal(file, '/usr/bin/osascript'); assert.match(args.at(-1), /needs your attention/);
      throw Object.assign(new Error('unavailable'), { code: 'ENOENT' });
    } };
    assert.equal(durable.notify('grant', { status: 'owner_attention' }, options).status, 'notification_unavailable');
    assert.equal(durable.notify('grant', { status: 'owner_attention' }, options).status, 'already_requested');
    assert.equal(calls, 1);
  } finally { f.close(); }
});

test('unsupported platforms fail with a typed machine qualification error', { skip: ['darwin', 'linux'].includes(process.platform) }, () => {
  assert.throws(() => durable.machine(), /durable_host_unsupported/);
});

test('changed execution dependencies invalidate a registered checkpoint before process recovery', nativeMachine, () => {
  const f = fixture();
  try {
    const copy = path.join(f.root, 'runtime-source');
    fs.cpSync(path.dirname(require.resolve('../skills/ultra-delegate/scripts/durable-run.cjs')), copy, { recursive: true });
    const local = require(path.join(copy, 'durable-run.cjs'));
    local.register(f.ref(), { projectRoot: f.root, sessionId: 'old', primaryPid: process.pid });
    fs.appendFileSync(path.join(copy, 'agent-execution-driver.cjs'), '\n// Changed execution dependency.\n');
    assert.throws(() => local.ready(f.root, 'grant'), /durable_source_changed/);
  } finally { f.close(); }
});

test('the fresh extension retains an abnormal exit even without the conductor error handler', nativeMachine, () => {
  const f = fixture();
  try {
    const record = durable.register(f.ref(), { projectRoot: f.root, sessionId: 'old', primaryPid: process.pid });
    const claimed = durable.claim(f.root, 'grant');
    f.put('tools.cjs', 'exports.createAllToolDefinitions=()=>Object.fromEntries(["bash","edit","find","grep","ls","powershell","read","write"].map(name=>[name,{name}]));');
    const config = { root: f.root, grant_id: 'grant', registration_nonce: record.nonce,
      claim_nonce: claimed.claim.nonce, native_tools_module: path.join(f.root, 'tools.cjs') };
    const command = `const hooks={}, definitions=[]; const pi={on:(name,fn)=>hooks[name]=fn, registerTool:t=>definitions.push(t), getAllTools:()=>definitions, setActiveTools(){},getActiveTools:()=>definitions.map(t=>t.name)};
      require(${JSON.stringify(require.resolve('../skills/ultra-delegate/scripts/pi-durable-primary.cjs'))})(pi).then(()=>{hooks.session_start({}, {cwd:process.cwd(),sessionManager:{getSessionId:()=> 'fresh'}});process.exit(2);});`;
    const { spawnSync } = require('node:child_process');
    const result = spawnSync(process.execPath, ['-e', command], { cwd: f.root,
      env: { ...process.env, UBP_PI_DURABLE_CONFIG: JSON.stringify(config) }, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 2, result.stderr);
    const observation = durable.inspect('grant', { projectRoot: f.root });
    assert.equal(observation.state, 'owner_attention');
    assert.equal(observation.attention.reason, 'fresh_process_exited_without_consumption');
    assert.equal(observation.outcome, null);
    assert.equal(fs.existsSync(path.join(f.root, '.ultra/evidence/durable/grant/notification-request.json')), false);
  } finally { f.close(); }
});

test('consumption publication rechecks revocation, expiry and the fresh deadline after native close', nativeMachine, () => {
  const f = fixture(), now = Date.now;
  try {
    const record = durable.register(f.ref(), { projectRoot: f.root, sessionId: 'old', primaryPid: process.pid });
    const dir = durable.paths(f.root, 'grant').dir, outcome = { status: 'consumed' };
    const publish = (deadline = now() + 30000) => durable.recordConsumption(f.root, record, dir, outcome, deadline);
    assert.throws(() => publish(now() - 1), /fresh_turn_deadline/);
    f.put(f.grant.revoked_path, 'revoked after native close');
    assert.throws(() => publish(), /grant_revoked/);
    fs.unlinkSync(path.join(f.root, f.grant.revoked_path));
    Date.now = () => Date.parse(f.grant.expires_at) + 1;
    assert.throws(() => publish(), /grant_expired/);
    Date.now = now;
    assert.equal(fs.existsSync(path.join(dir, 'outcome.json')), false);
    assert.deepEqual(publish(), outcome);
  } finally { Date.now = now; f.close(); }
});
