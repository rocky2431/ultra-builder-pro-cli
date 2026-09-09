'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const { test } = require('node:test');
const slice = require('../skills/ultra-delegate/scripts/run-slice.cjs');
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-slice-test-')));
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Fixture');
  write(path.join(root, 'src/base'), 'base'); git(root, 'add', '.'); git(root, 'commit', '-m', 'test: base');
  const base = git(root, 'rev-parse', 'HEAD');
  const qualification = { test_identity: 'isolated-child-fixture' };
  const ref = (file, value) => { write(path.join(root, file), value); return { path: file, sha256: sha(fs.readFileSync(path.join(root, file))) }; };
  const roles = ['left', 'right'].map((id) => ({ role_id: id, purpose: id, authority: 'scoped-write', host: 'fixture', model: null, qualification_sha256: sha(JSON.stringify(qualification)) }));
  const packet = { $schema: 'ultra-run-slice-v1', run_id: 'run', slice_id: 'first', change_id: 'change', base_revision: base, primary_session_id: 'session', intent: ref('.ultra/changes/active/change/intent.md', 'accepted fixture intent'), grant: ref('.ultra/decisions/grant.md', 'fixture owner grants this bounded wave'), profile: ref('.ultra/profiles/fixture.json', { $schema: 'ultra-role-profile-v1', profile_id: 'fixture-v1', roles }), task_refs: [{ id: 'task', ...ref('.ultra/contexts/task-task.md', 'fixture task') }], seam: ref('interface.md', 'one file per worker'), attempts: [], budget: { max_concurrency: 2, attempt_timeout_seconds: 2, deadline_at: new Date(Date.now() + 10000).toISOString() }, barrier: 'all-terminal', cancel_policy: 'cancel-unfinished' };
  for (const id of ['left', 'right']) {
    const tree = `.ultra/.runtime/trees/${id}`; fs.mkdirSync(path.dirname(path.join(root, tree)), { recursive: true }); git(root, 'worktree', 'add', '--detach', path.join(root, tree), base);
    packet.attempts.push({ id, role_id: id, task_id: 'task', host: 'fixture', model: null, worktree: tree, instruction: ref(`.ultra/.runtime/delegations/${id}/instruction.md`, `Write src/${id}.txt`), permission: ref(`.ultra/.runtime/delegations/${id}/permission.json`, { $schema: 'ultra-delegation-permission-v1', writable_roots: ['src'], external_effects: [] }) });
  }
  const file = path.join(root, 'slice.json'); write(file, packet);
  const children = [], windows = [], started = new Map();
  const deps = {
    resolveHostProfile: () => ({ enforcement: qualification, binary: process.execPath }),
    qualify: () => ({ route: 'admitted', gate: 'enforcement_qualification', transport: 'cli' }),
    chooseExecutionDriver: () => ({ driver: 'cli' }),
    launch: (_argv, options) => {
      const attempt = options.attempt, begin = Date.now();
      const child = spawn(process.execPath, ['-e', 'setTimeout(()=>{},150)'], { stdio: 'ignore' }); children.push(child); started.set(attempt.id, child);
      child.on('exit', () => windows.push({ id: attempt.id, begin, end: Date.now() }));
      return { worker_pid: child.pid };
    },
    observe: (attempt) => {
      const child = started.get(attempt.id);
      if (!child) return { state: 'not_started', result: null };
      if (child.exitCode === null && child.signalCode === null) return { state: 'running', result: null };
      return { state: child.signalCode ? 'failed' : 'finished', result: { path: `${attempt.id}/result.json`, sha256: sha(attempt.id) } };
    },
    cancelAttempt: (attempt) => started.get(attempt.id)?.kill('SIGTERM'),
  };
  return { root, file, packet, deps, windows, children, save: () => write(file, packet), close: () => { for (const c of children) if (c.exitCode === null) c.kill('SIGKILL'); fs.rmSync(root, { recursive: true, force: true }); } };
}

test('whole-slice admission rejects changed inputs, overlap, unqualified hosts and unknown semantics before launch', () => {
  const fx = fixture();
  try {
    const options = { projectRoot: fx.root, sessionId: 'session', ...fx.deps };
    assert.equal(slice.prepare(fx.file, options).packet.attempts.length, 2);
    fx.packet.next_step = 'repair'; fx.save(); assert.throws(() => slice.prepare(fx.file, options), /incompatible_contract/); delete fx.packet.next_step;
    fx.packet.attempts[1].worktree = fx.packet.attempts[0].worktree; fx.save(); assert.throws(() => slice.prepare(fx.file, options), /overlap/); fx.packet.attempts[1].worktree = '.ultra/.runtime/trees/right'; fx.save();
    assert.throws(() => slice.prepare(fx.file, { ...options, qualify: () => ({ route: 'admitted', gate: null }) }), /host_unqualified/);
    assert.throws(() => slice.prepare(fx.file, { ...options, sessionId: 'another' }), /session_mismatch/);
    assert.throws(() => slice.prepare(fx.file, { ...options, resolveHostProfile: () => ({ ...fx.deps.resolveHostProfile(), transportMaturity: 'experimental' }) }), /experimental_ack_required/);
    const grant = fx.packet.grant;
    fx.packet.grant = { path: '.ultra/decisions/../../interface.md', sha256: fx.packet.seam.sha256 }; fx.save();
    assert.throws(() => slice.prepare(fx.file, options), /invalid_path/);
    fx.packet.grant = grant; fx.save();
    fs.appendFileSync(path.join(fx.root, 'interface.md'), 'drift'); assert.throws(() => slice.prepare(fx.file, options), /input_drift/);
    assert.equal(fx.children.length, 0);
  } finally { fx.close(); }
});

test('one finite concurrent wave returns one bounded attention and restart never relaunches', async () => {
  const fx = fixture();
  try {
    const options = { projectRoot: fx.root, sessionId: 'session', intervalMs: 10, ...fx.deps };
    const attention = await slice.start(fx.file, options);
    assert.deepEqual(attention.counts, { finished: 2 });
    assert.equal(attention.reason, 'wave_terminal'); assert.equal(fx.windows.length, 2);
    assert.ok(Math.max(...fx.windows.map((w) => w.begin)) < Math.min(...fx.windows.map((w) => w.end)));
    assert.equal(fx.children.length, 2);
    const retained = fs.readFileSync(path.join(fx.root, '.ultra/.runtime/runs/run/first/attention.json'));
    assert.deepEqual(await slice.resume('run', 'first', options), attention);
    await assert.rejects(slice.start(fx.file, options), /slice_exists/);
    assert.equal(fx.children.length, 2); assert.deepEqual(fs.readFileSync(path.join(fx.root, '.ultra/.runtime/runs/run/first/attention.json')), retained);
    assert.ok(!JSON.stringify(attention).match(/stdout|stderr|transcript|next_step|summary/));
  } finally { fx.close(); }
});

test('unknown attempts freeze the slice without relaunch or fabricated completion', async () => {
  const fx = fixture();
  try {
    const options = { projectRoot: fx.root, sessionId: 'session', ...fx.deps, observe: () => ({ state: 'outcome_unknown', result: null }) };
    const result = await slice.start(fx.file, options);
    assert.equal(result.reason, 'operator_attention'); assert.equal(result.counts.outcome_unknown, 2);
    const launched = fx.children.length; await slice.resume('run', 'first', options); assert.equal(fx.children.length, launched);
  } finally { fx.close(); }
});

test('cancel reaches existing workers and a dead-controller recovery never starts missing attempts', async () => {
  const fx = fixture();
  try {
    const options = { projectRoot: fx.root, sessionId: 'session', intervalMs: 10, ...fx.deps };
    const result = slice.start(fx.file, options);
    await slice.cancel('run', 'first', options);
    const attention = await result; assert.ok(attention.counts.failed >= 1);
    assert.equal(fx.children.length, 2);
    fs.unlinkSync(path.join(fx.root, '.ultra/.runtime/runs/run/first/attention.json'));
    const recovered = await slice.resume('run', 'first', { ...options, observe: () => ({ state: 'not_started', result: null }) });
    assert.equal(recovered.reason, 'operator_attention'); assert.equal(recovered.counts.not_started, 2); assert.equal(fx.children.length, 2);
  } finally { fx.close(); }
});
