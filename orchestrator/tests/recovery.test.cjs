'use strict';

// Phase 5.1 — recoverOnBoot semantics:
//   • running + fresh heartbeat           → untouched
//   • running + lease/heartbeat expired   → orphan   (handled by 4.5 reaper)
//   • orphan  + pid is dead               → crashed + task_failure event
//   • orphan  + pid still alive           → stays orphan (might recover)
//
// "pid dead" is determined via process.kill(pid, 0) throwing ESRCH.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { initStateDb, closeStateDb } = require('../../mcp-server/lib/state-db.cjs');
const ops = require('../../mcp-server/lib/state-ops.cjs');
const runner = require('../session-runner.cjs');
const recovery = require('../recovery.cjs');

const LONG_SLEEP_CMD = process.execPath;
const LONG_SLEEP_ARGS = ['-e', 'setInterval(() => {}, 60000);'];

function mkRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-recovery-repo-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@ubp.dev'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'ubp-test'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n');
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: dir });
  return dir;
}

function mkDb(repoRoot) {
  const dbPath = path.join(repoRoot, '.ultra', 'state.db');
  const { db } = initStateDb(dbPath);
  return { db, dbPath };
}

function seedTask(db, id) {
  ops.createTask(db, { id, title: 'recovery target', type: 'feature', priority: 'P1' });
  return id;
}

function cleanup(repoRoot, db) {
  try { closeStateDb(db); } catch (_) { /* ignore */ }
  try { fs.rmSync(repoRoot, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

// Create a session row bypassing real spawn — lets us control pid precisely.
function insertRawSession(db, { sid, task_id, pid, status = 'orphan', worktree_path, artifact_dir }) {
  const row = ops.createSession(db, {
    sid, task_id, runtime: 'claude', pid,
    worktree_path: worktree_path || `/tmp/ubp-fake-wt/${sid}`,
    artifact_dir: artifact_dir || `/tmp/ubp-fake-art/${sid}`,
  });
  if (status !== 'running') ops.updateSession(db, sid, { status });
  return row;
}

test('recoverOnBoot: orphan with dead pid → crashed + task_failure event', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  try {
    seedTask(db, 'rec-1');
    // pid 0x7FFFFFFE is almost certainly not assigned; process.kill will ESRCH.
    insertRawSession(db, { sid: 'sess-dead01', task_id: 'rec-1', pid: 0x7FFFFFFE, status: 'orphan' });

    const { events: beforeEvents } = ops.subscribeEventsSince(db, { since_id: 0, limit: 500 });
    const result = recovery.recoverOnBoot(db);

    assert.equal(result.count, 1);
    assert.equal(result.recovered[0].sid, 'sess-dead01');
    assert.equal(result.recovered[0].task_id, 'rec-1');
    assert.equal(result.recovered[0].pid_alive, false);

    const row = ops.readSession(db, 'sess-dead01');
    assert.equal(row.status, 'crashed');

    const { events: afterEvents } = ops.subscribeEventsSince(db, { since_id: 0, limit: 500 });
    const newEvents = afterEvents.slice(beforeEvents.length);
    assert.ok(newEvents.some((e) => e.type === 'session_crashed' && e.session_id === 'sess-dead01'));
    assert.ok(newEvents.some((e) => e.type === 'task_failure' && e.task_id === 'rec-1'));
  } finally {
    cleanup(repoRoot, db);
  }
});

test('recoverOnBoot: orphan with alive pid → stays orphan', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  try {
    seedTask(db, 'rec-2');
    // Current process is definitely alive.
    insertRawSession(db, { sid: 'sess-alive01', task_id: 'rec-2', pid: process.pid, status: 'orphan' });

    const result = recovery.recoverOnBoot(db);
    assert.equal(result.count, 0);
    const row = ops.readSession(db, 'sess-alive01');
    assert.equal(row.status, 'orphan');
  } finally {
    cleanup(repoRoot, db);
  }
});

test('recoverOnBoot: running with fresh heartbeat → unchanged', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  try {
    seedTask(db, 'rec-3');
    // Running session that will NOT be reaped — fresh heartbeat + future lease.
    ops.createSession(db, {
      sid: 'sess-healthy',
      task_id: 'rec-3',
      runtime: 'claude',
      pid: process.pid,
      worktree_path: '/tmp/ubp-fake-wt/sess-healthy',
      artifact_dir: '/tmp/ubp-fake-art/sess-healthy',
    });
    ops.heartbeatSession(db, 'sess-healthy');

    recovery.recoverOnBoot(db);
    const row = ops.readSession(db, 'sess-healthy');
    assert.equal(row.status, 'running');
  } finally {
    cleanup(repoRoot, db);
  }
});

test('recoverOnBoot: first reaps stale running → orphan, then upgrades dead ones to crashed', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  try {
    seedTask(db, 'rec-4');
    // Running session with expired lease + dead pid.
    ops.createSession(db, {
      sid: 'sess-stale-dead',
      task_id: 'rec-4',
      runtime: 'claude',
      pid: 0x7FFFFFFE,
      worktree_path: '/tmp/ubp-fake-wt/sess-stale-dead',
      artifact_dir: '/tmp/ubp-fake-art/sess-stale-dead',
    });
    ops.updateSession(db, 'sess-stale-dead', {
      lease_expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
      heartbeat_at: new Date(Date.now() - 60 * 1000).toISOString(),
    });

    const result = recovery.recoverOnBoot(db, { graceSeconds: 30 });
    // Should have reaped to orphan first, then crashed.
    assert.equal(result.count, 1);
    assert.equal(result.recovered[0].sid, 'sess-stale-dead');
    const row = ops.readSession(db, 'sess-stale-dead');
    assert.equal(row.status, 'crashed');
  } finally {
    cleanup(repoRoot, db);
  }
});

test('integration: kill -9 real child → recoverOnBoot marks crashed', async () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let handle;
  try {
    seedTask(db, 'rec-int');
    handle = runner.spawnSession({
      db, repoRoot,
      task_id: 'rec-int', runtime: 'claude',
      command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
    });
    // Force lease/heartbeat into the past so reaper catches it.
    ops.updateSession(db, handle.sid, {
      lease_expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
      heartbeat_at: new Date(Date.now() - 60 * 1000).toISOString(),
    });
    process.kill(handle.pid, 'SIGKILL');
    // Let the kernel reap the zombie.
    await new Promise((r) => setTimeout(r, 80));

    const result = recovery.recoverOnBoot(db, { graceSeconds: 30 });
    assert.ok(result.recovered.some((r) => r.sid === handle.sid));
    const row = ops.readSession(db, handle.sid);
    assert.equal(row.status, 'crashed');
  } finally {
    cleanup(repoRoot, db);
  }
});
