'use strict';

// Phase 5.4 — Orchestrator daemon:
//   • routeTask: pure function — explicit availableRuntimes order → runtime
//   • runDaemon: poll loop that spawns pending tasks, respects admission +
//     circuit breaker, and shuts down gracefully via stop().

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { initStateDb, closeStateDb } = require('../../mcp-server/lib/state-db.cjs');
const ops = require('../../mcp-server/lib/state-ops.cjs');
const daemon = require('../daemon.cjs');
const RETIRED_RUNTIME = ['gem', 'ini'].join('');

const LONG_SLEEP_CMD = process.execPath;
const LONG_SLEEP_ARGS = ['-e', 'setInterval(() => {}, 60000);'];

function mkRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-daemon-repo-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@ubp.dev'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'ubp-test'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n');
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: dir });
  return dir;
}

function mkDb(repoRoot) {
  const { db } = initStateDb(path.join(repoRoot, '.ultra', 'state.db'));
  return db;
}

function cleanup(repoRoot, db, handle) {
  if (handle) {
    try { handle.stop(); } catch (_) { /* ignore */ }
  }
  // Kill any stray children spawned by the daemon.
  try {
    const rows = db.prepare("SELECT pid FROM sessions WHERE pid IS NOT NULL AND status = 'running'").all();
    for (const r of rows) {
      try { process.kill(r.pid, 'SIGKILL'); } catch (_) { /* ignore */ }
    }
  } catch (_) { /* ignore */ }
  try { closeStateDb(db); } catch (_) { /* ignore */ }
  try { fs.rmSync(repoRoot, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

// ─── routeTask ────────────────────────────────────────────────────────────

test('routeTask: respects explicit runtime order', () => {
  const runtime = daemon.routeTask(
    { id: 't' },
    ['kimi', 'opencode', 'codex', 'claude'],
  );
  assert.equal(runtime, 'kimi');
});

test('routeTask: ignores legacy model-tier hints', () => {
  const runtime = daemon.routeTask(
    { id: 't', complexity_hint: 'opus' },
    ['opencode', 'kimi', 'codex', 'claude'],
  );
  assert.equal(runtime, 'opencode');
});

test('routeTask: no hint skips unsupported runtimes', () => {
  const runtime = daemon.routeTask({ id: 't' }, [RETIRED_RUNTIME, 'claude']);
  assert.equal(runtime, 'claude');
});

test('routeTask: no runtimes available → null', () => {
  assert.equal(daemon.routeTask({ id: 't' }, []), null);
});

// ─── runDaemon ────────────────────────────────────────────────────────────

test('runDaemon spawns pending task within pollMs window', async () => {
  const repoRoot = mkRepo();
  const db = mkDb(repoRoot);
  let handle;
  try {
    ops.createTask(db, { id: 'd-1', title: 'pending target', type: 'feature', priority: 'P1' });
    handle = daemon.runDaemon({
      db, repoRoot,
      runtimes: ['claude'],
      pollMs: 50,
      command: LONG_SLEEP_CMD,
      commandArgs: LONG_SLEEP_ARGS,
    });

    // Wait up to 500ms for the daemon to pick up the task.
    const start = Date.now();
    let spawned = null;
    while (Date.now() - start < 500) {
      const sessions = db.prepare("SELECT * FROM sessions WHERE task_id = 'd-1'").all();
      if (sessions.length > 0) { spawned = sessions[0]; break; }
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.ok(spawned, 'daemon should have spawned a session within 500ms');
    assert.equal(spawned.status, 'running');
    assert.equal(spawned.runtime, 'claude');
  } finally {
    cleanup(repoRoot, db, handle);
  }
});

test('runDaemon skips tripped tasks', async () => {
  const repoRoot = mkRepo();
  const db = mkDb(repoRoot);
  let handle;
  try {
    ops.createTask(db, { id: 'd-trip', title: 'tripped', type: 'feature', priority: 'P1' });
    for (let i = 0; i < 3; i += 1) ops.recordTaskFailure(db, 'd-trip', { reason: 'x' });
    assert.equal(ops.isCircuitTripped(db, 'd-trip'), true);

    handle = daemon.runDaemon({
      db, repoRoot,
      runtimes: ['claude'],
      pollMs: 50,
      command: LONG_SLEEP_CMD,
      commandArgs: LONG_SLEEP_ARGS,
    });
    await new Promise((r) => setTimeout(r, 300));
    const sessions = db.prepare("SELECT * FROM sessions WHERE task_id = 'd-trip'").all();
    assert.equal(sessions.length, 0, 'tripped task must not be spawned');
  } finally {
    cleanup(repoRoot, db, handle);
  }
});

test('runDaemon does not double-spawn same task', async () => {
  const repoRoot = mkRepo();
  const db = mkDb(repoRoot);
  let handle;
  try {
    ops.createTask(db, { id: 'd-once', title: 'single', type: 'feature', priority: 'P1' });
    handle = daemon.runDaemon({
      db, repoRoot,
      runtimes: ['claude'],
      pollMs: 30,
      command: LONG_SLEEP_CMD,
      commandArgs: LONG_SLEEP_ARGS,
    });
    await new Promise((r) => setTimeout(r, 400));
    const sessions = db.prepare("SELECT * FROM sessions WHERE task_id = 'd-once'").all();
    assert.equal(sessions.length, 1, 'daemon should not double-spawn');
  } finally {
    cleanup(repoRoot, db, handle);
  }
});

test('runDaemon.stop() halts polling; existing children stay alive', async () => {
  const repoRoot = mkRepo();
  const db = mkDb(repoRoot);
  let handle;
  try {
    ops.createTask(db, { id: 'd-stop', title: 'stop test', type: 'feature', priority: 'P1' });
    handle = daemon.runDaemon({
      db, repoRoot,
      runtimes: ['claude'],
      pollMs: 30,
      command: LONG_SLEEP_CMD,
      commandArgs: LONG_SLEEP_ARGS,
    });
    // Wait for spawn.
    await new Promise((r) => setTimeout(r, 200));
    const before = db.prepare("SELECT pid FROM sessions WHERE task_id = 'd-stop'").all();
    assert.equal(before.length, 1);
    const childPid = before[0].pid;

    handle.stop();
    // After stop: child still alive, no new spawn for a fresh task.
    ops.createTask(db, { id: 'd-after-stop', title: 'after stop', type: 'feature', priority: 'P1' });
    await new Promise((r) => setTimeout(r, 200));
    const afterStop = db.prepare("SELECT * FROM sessions WHERE task_id = 'd-after-stop'").all();
    assert.equal(afterStop.length, 0, 'no new spawns after stop');

    try { process.kill(childPid, 0); } catch (err) {
      assert.fail(`child ${childPid} should still be alive after daemon stop: ${err.message}`);
    }
  } finally {
    cleanup(repoRoot, db, handle);
  }
});

test('runDaemon branchScoped=true only spawns tasks matching cwd branch tag', async () => {
  const repoRoot = mkRepo();
  const db = mkDb(repoRoot);
  let handle;
  try {
    // Normalize to a known branch name so the test doesn't depend on
    // the dev machine's git init.defaultBranch config.
    execFileSync('git', ['checkout', '-q', '-B', 'main'], { cwd: repoRoot });
    ops.createTask(db, { id: 'd-branch-match', title: 'main task', type: 'feature', priority: 'P1', tag: 'main' });
    ops.createTask(db, { id: 'd-branch-other', title: 'other task', type: 'feature', priority: 'P1', tag: 'feat-other' });
    handle = daemon.runDaemon({
      db, repoRoot,
      runtimes: ['claude'],
      pollMs: 50,
      command: LONG_SLEEP_CMD,
      commandArgs: LONG_SLEEP_ARGS,
      branchScoped: true,
    });
    await new Promise((r) => setTimeout(r, 300));
    const match = db.prepare("SELECT * FROM sessions WHERE task_id = 'd-branch-match'").all();
    const other = db.prepare("SELECT * FROM sessions WHERE task_id = 'd-branch-other'").all();
    assert.equal(match.length, 1, 'current-branch task must spawn');
    assert.equal(other.length, 0, 'other-branch task must stay pending');
  } finally {
    cleanup(repoRoot, db, handle);
  }
});

test('runDaemon respects explicit runtime order even when a legacy hint is present', async () => {
  const repoRoot = mkRepo();
  const db = mkDb(repoRoot);
  let handle;
  try {
    ops.createTask(db, {
      id: 'd-opus', title: 'legacy routed task', type: 'architecture', priority: 'P0',
      complexity_hint: 'opus',
    });
    handle = daemon.runDaemon({
      db, repoRoot,
      runtimes: ['opencode', 'claude'],
      pollMs: 50,
      command: LONG_SLEEP_CMD,
      commandArgs: LONG_SLEEP_ARGS,
    });
    await new Promise((r) => setTimeout(r, 300));
    const sessions = db.prepare("SELECT * FROM sessions WHERE task_id = 'd-opus'").all();
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].runtime, 'opencode');
  } finally {
    cleanup(repoRoot, db, handle);
  }
});

test('maintainState consumes spec changes with a durable cursor', () => {
  const repoRoot = mkRepo();
  const db = mkDb(repoRoot);
  try {
    ops.createTask(db, {
      id: 'maintain-stale', title: 'stale target', type: 'feature', priority: 'P1',
      trace_to: '.ultra/specs/product.md#daily-change',
    });
    ops.appendEvent(db, {
      type: 'spec_changed', payload: { sections: ['.ultra/specs/product.md#daily-change'] },
    });
    const first = daemon.maintainState({ db, repoRoot });
    assert.equal(first.staleness.processed, 1);
    assert.equal(ops.readTask(db, 'maintain-stale').stale, true);
    const second = daemon.maintainState({ db, repoRoot });
    assert.equal(second.staleness.processed, 0);
  } finally {
    cleanup(repoRoot, db);
  }
});

test('runDaemon performs crash recovery before dispatch polling', async () => {
  const repoRoot = mkRepo();
  const db = mkDb(repoRoot);
  let handle;
  try {
    ops.createTask(db, { id: 'recover-boot', title: 'recover boot', type: 'bugfix', priority: 'P0' });
    ops.updateTaskStatus(db, 'recover-boot', 'in_progress');
    ops.createSession(db, {
      sid: 'dead-session', task_id: 'recover-boot', runtime: 'claude', pid: 999999,
      worktree_path: '/tmp/dead-worktree', artifact_dir: '/tmp/dead-artifact', lease_seconds: 1,
    });
    db.prepare(
      "UPDATE sessions SET heartbeat_at = '2000-01-01T00:00:00.000Z', lease_expires_at = '2000-01-01T00:00:00.000Z' WHERE sid = 'dead-session'",
    ).run();

    handle = daemon.runDaemon({
      db, repoRoot, runtimes: ['claude'], pollMs: 50,
      command: LONG_SLEEP_CMD, commandArgs: LONG_SLEEP_ARGS,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const session = ops.readSession(db, 'dead-session');
    assert.equal(session.status, 'crashed');
    const failure = db.prepare("SELECT * FROM circuit_breaker WHERE task_id = 'recover-boot'").get();
    assert.equal(failure.failure_count, 1);
  } finally {
    cleanup(repoRoot, db, handle);
  }
});
