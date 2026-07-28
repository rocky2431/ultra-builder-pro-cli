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

const {
  initStateDb,
  openStateDb,
  closeStateDb,
} = require('../../mcp-server/lib/state-db.cjs');
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
  fs.writeFileSync(path.join(dir, '.gitignore'), '!.ultra/\n!.ultra/**\n.ultra/.runtime\n');
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: dir });
  return dir;
}

function mkDb(repoRoot) {
  const dbPath = path.join(repoRoot, '.ultra', '.runtime', 'state.db');
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

test('close recovery prunes an absent worktree from the Git registry before terminal state', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let handle;
  try {
    seedTask(db, 'rec-close-registry');
    handle = runner.spawnSession({
      db,
      repoRoot,
      task_id: 'rec-close-registry',
      runtime: 'codex',
    });
    runner._internal.closeJournal.prepare(repoRoot, {
      sid: handle.sid,
      task_id: 'rec-close-registry',
      requested_status: 'completed',
      worktree_path: handle.worktree_path,
    });
    fs.rmSync(handle.worktree_path, { recursive: true, force: true });
    const before = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.match(before, new RegExp(handle.worktree_path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    const result = recovery.recoverOnBoot(db, { repoRoot });

    assert.ok(result.closed.some((entry) => entry.sid === handle.sid));
    assert.equal(ops.readSession(db, handle.sid).status, 'completed');
    const after = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.doesNotMatch(after, new RegExp(handle.worktree_path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(
      runner._internal.closeJournal.read(repoRoot, handle.sid),
      null,
    );
  } finally {
    cleanup(repoRoot, db);
  }
});

test('close recovery cannot overwrite a competing terminal result after reading its journal', async () => {
  const repoRoot = mkRepo();
  const { db, dbPath } = mkDb(repoRoot);
  const competingDb = openStateDb(dbPath);
  const originalReadSession = ops.readSession;
  let handle;
  let injected = false;
  try {
    seedTask(db, 'rec-close-terminal-cas');
    handle = runner.spawnSession({
      db,
      repoRoot,
      task_id: 'rec-close-terminal-cas',
      runtime: 'codex',
      command: LONG_SLEEP_CMD,
      args: LONG_SLEEP_ARGS,
    });
    runner._internal.closeJournal.prepare(repoRoot, {
      sid: handle.sid,
      task_id: 'rec-close-terminal-cas',
      requested_status: 'crashed',
      worktree_path: handle.worktree_path,
    });
    process.kill(handle.pid, 'SIGKILL');
    await new Promise((resolve) => setTimeout(resolve, 80));
    ops.readSession = (candidateDb, sid) => {
      const row = originalReadSession(candidateDb, sid);
      if (!injected && candidateDb === db && sid === handle.sid) {
        injected = true;
        ops.updateSession(competingDb, sid, { status: 'completed' });
      }
      return row;
    };

    const result = recovery.recoverOnBoot(db, { repoRoot });

    assert.equal(originalReadSession(db, handle.sid).status, 'completed');
    assert.ok(result.close_pending.some((entry) => entry.sid === handle.sid));
    assert.equal(
      runner._internal.closeJournal.read(repoRoot, handle.sid).phase,
      'recovery_failed',
    );
    assert.equal(
      db.prepare(
        `SELECT COUNT(*) AS count FROM events
         WHERE session_id = ?
           AND type IN ('session_closed', 'session_crashed')`,
      ).get(handle.sid).count,
      1,
    );
  } finally {
    ops.readSession = originalReadSession;
    closeStateDb(competingDb);
    cleanup(repoRoot, db);
  }
});

test('close recovery removes only the exact managed registry entry', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  const unrelated = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-unrelated-prunable-'));
  let handle;
  try {
    fs.rmSync(unrelated, { recursive: true, force: true });
    execFileSync('git', ['worktree', 'add', '-q', '--detach', unrelated, 'HEAD'], {
      cwd: repoRoot,
    });
    seedTask(db, 'rec-close-exact-registry');
    handle = runner.spawnSession({
      db,
      repoRoot,
      task_id: 'rec-close-exact-registry',
      runtime: 'codex',
    });
    runner._internal.closeJournal.prepare(repoRoot, {
      sid: handle.sid,
      task_id: 'rec-close-exact-registry',
      requested_status: 'completed',
      worktree_path: handle.worktree_path,
    });
    fs.rmSync(unrelated, { recursive: true, force: true });
    fs.rmSync(handle.worktree_path, { recursive: true, force: true });

    const result = recovery.recoverOnBoot(db, { repoRoot });

    assert.ok(result.closed.some((entry) => entry.sid === handle.sid));
    const registry = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.doesNotMatch(
      registry,
      new RegExp(handle.worktree_path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
    assert.match(
      registry,
      new RegExp(unrelated.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  } finally {
    cleanup(repoRoot, db);
    fs.rmSync(unrelated, { recursive: true, force: true });
  }
});

test('close recovery reconciles Git registry before discarding an already-terminal journal', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let handle;
  try {
    seedTask(db, 'rec-close-terminal-registry');
    handle = runner.spawnSession({
      db,
      repoRoot,
      task_id: 'rec-close-terminal-registry',
      runtime: 'codex',
    });
    runner._internal.closeJournal.prepare(repoRoot, {
      sid: handle.sid,
      task_id: 'rec-close-terminal-registry',
      requested_status: 'completed',
      worktree_path: handle.worktree_path,
    });
    fs.rmSync(handle.worktree_path, { recursive: true, force: true });
    ops.updateSession(db, handle.sid, { status: 'completed' });

    const result = recovery.recoverOnBoot(db, { repoRoot });

    assert.ok(result.closed.some((entry) => (
      entry.sid === handle.sid && entry.reconciled === 'already_terminal'
    )));
    const registry = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.doesNotMatch(
      registry,
      new RegExp(handle.worktree_path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
    assert.equal(runner._internal.closeJournal.read(repoRoot, handle.sid), null);
  } finally {
    cleanup(repoRoot, db);
  }
});

test('close recovery idempotently discards completed and crashed terminal intents', () => {
  for (const requestedStatus of ['completed', 'crashed']) {
    const repoRoot = mkRepo();
    const { db } = mkDb(repoRoot);
    let handle;
    try {
      const taskId = `rec-close-terminal-${requestedStatus}`;
      seedTask(db, taskId);
      handle = runner.spawnSession({
        db,
        repoRoot,
        task_id: taskId,
        runtime: 'codex',
      });
      runner._internal.closeJournal.prepare(repoRoot, {
        sid: handle.sid,
        task_id: taskId,
        requested_status: requestedStatus,
        worktree_path: handle.worktree_path,
      });
      fs.rmSync(handle.worktree_path, { recursive: true, force: true });
      ops.updateSession(db, handle.sid, { status: requestedStatus });

      const first = recovery.recoverOnBoot(db, { repoRoot });
      assert.ok(first.closed.some((entry) => (
        entry.sid === handle.sid
          && entry.status === requestedStatus
          && entry.reconciled === 'already_terminal'
      )));
      assert.equal(runner._internal.closeJournal.read(repoRoot, handle.sid), null);

      const second = recovery.recoverOnBoot(db, { repoRoot });
      assert.equal(second.closed.some((entry) => entry.sid === handle.sid), false);
      assert.equal(ops.readSession(db, handle.sid).status, requestedStatus);
    } finally {
      cleanup(repoRoot, db);
    }
  }
});

test('close recovery binds journal identity to the exact DB session before mutation', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let handle;
  try {
    seedTask(db, 'rec-identity-owner');
    seedTask(db, 'rec-identity-forged');
    handle = runner.spawnSession({
      db,
      repoRoot,
      task_id: 'rec-identity-owner',
      runtime: 'codex',
    });
    runner._internal.closeJournal.prepare(repoRoot, {
      sid: handle.sid,
      task_id: 'rec-identity-forged',
      requested_status: 'completed',
      worktree_path: handle.worktree_path,
    });

    const result = recovery.recoverOnBoot(db, { repoRoot });

    assert.ok(result.close_pending.some((entry) => (
      entry.sid === handle.sid && entry.reason === 'journal_identity_mismatch'
    )));
    assert.equal(ops.readSession(db, handle.sid).status, 'running');
    assert.equal(fs.existsSync(handle.worktree_path), true);
    assert.equal(
      runner._internal.closeJournal.read(repoRoot, handle.sid).phase,
      'prepared',
    );
  } finally {
    cleanup(repoRoot, db);
  }
});

test('orphan crash and task-failure evidence commit atomically and exactly once', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  try {
    seedTask(db, 'rec-atomic-failure');
    insertRawSession(db, {
      sid: 'sess-atomic-failure',
      task_id: 'rec-atomic-failure',
      pid: 0x7FFFFFFE,
      status: 'orphan',
    });
    db.exec(`
      CREATE TRIGGER inject_circuit_failure
      BEFORE INSERT ON circuit_breaker
      BEGIN
        SELECT RAISE(ABORT, 'injected circuit failure');
      END
    `);

    assert.throws(
      () => recovery.recoverOnBoot(db),
      /injected circuit failure/,
    );
    assert.equal(ops.readSession(db, 'sess-atomic-failure').status, 'orphan');
    assert.equal(
      db.prepare(
        `SELECT COUNT(*) AS count FROM events
         WHERE session_id = ?
           AND type IN ('session_crashed', 'task_failure')`,
      ).get('sess-atomic-failure').count,
      0,
    );

    db.exec('DROP TRIGGER inject_circuit_failure');
    const first = recovery.recoverOnBoot(db);
    assert.equal(first.count, 1);
    assert.equal(ops.readSession(db, 'sess-atomic-failure').status, 'crashed');
    assert.equal(
      db.prepare(
        `SELECT COUNT(*) AS count FROM events
         WHERE session_id = ?
           AND type = 'task_failure'`,
      ).get('sess-atomic-failure').count,
      1,
    );
    assert.equal(
      db.prepare(
        'SELECT failure_count FROM circuit_breaker WHERE task_id = ?',
      ).get('rec-atomic-failure').failure_count,
      1,
    );

    const second = recovery.recoverOnBoot(db);
    assert.equal(second.count, 0);
    assert.equal(
      db.prepare(
        `SELECT COUNT(*) AS count FROM events
         WHERE session_id = ?
           AND type = 'task_failure'`,
      ).get('sess-atomic-failure').count,
      1,
    );
    assert.equal(
      db.prepare(
        'SELECT failure_count FROM circuit_breaker WHERE task_id = ?',
      ).get('rec-atomic-failure').failure_count,
      1,
    );
  } finally {
    cleanup(repoRoot, db);
  }
});
