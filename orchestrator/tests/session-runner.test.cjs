'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { initStateDb, closeStateDb } = require('../../mcp-server/lib/state-db.cjs');
const ops = require('../../mcp-server/lib/state-ops.cjs');
const runner = require('../session-runner.cjs');

// Short-lived child: keep the process alive until killed.
const LONG_SLEEP_CMD = process.execPath;
const LONG_SLEEP_ARGS = ['-e', 'setInterval(() => {}, 60000);'];

function mkRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-runner-repo-'));
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

function seedTask(db, id = 't-1') {
  ops.createTask(db, { id, title: 'runner target', type: 'feature', priority: 'P1' });
  return id;
}

function cleanup(repoRoot, db) {
  try { closeStateDb(db); } catch (_) { /* ignore */ }
  try { fs.rmSync(repoRoot, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

function isProcessAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (_) { return false; }
}

test('spawnSession creates worktree, child process, and sessions row', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let handle;
  try {
    seedTask(db, 'r-1');
    handle = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-1', runtime: 'claude',
      command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
    });
    assert.match(handle.sid, /^sess-/);
    assert.ok(fs.existsSync(handle.worktree_path));
    assert.ok(fs.existsSync(handle.artifact_dir));
    assert.ok(handle.pid);
    assert.ok(isProcessAlive(handle.pid));

    const row = ops.readSession(db, handle.sid);
    assert.equal(row.task_id, 'r-1');
    assert.equal(row.status, 'running');
    assert.equal(row.pid, handle.pid);
  } finally {
    if (handle && handle.pid) { try { process.kill(handle.pid, 'SIGKILL'); } catch (_) { /* ignore */ } }
    cleanup(repoRoot, db);
  }
});

test('closeSession kills child, marks completed, removes worktree', async () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let handle;
  try {
    seedTask(db, 'r-close');
    handle = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-close', runtime: 'claude',
      command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
    });
    const wt = handle.worktree_path;
    runner.closeSession(
      { db, repoRoot, sid: handle.sid },
      { status: 'completed', kill_signal: 'SIGKILL' },
    );

    const row = ops.readSession(db, handle.sid);
    assert.equal(row.status, 'completed');
    // give the kernel a tick to reap the SIGKILL
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(!isProcessAlive(handle.pid), `pid ${handle.pid} should be dead`);
    assert.ok(!fs.existsSync(wt));
  } finally {
    cleanup(repoRoot, db);
  }
});

test('spawnSession refuses second session without takeover (ADMISSION_DENIED)', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let first;
  try {
    seedTask(db, 'r-adm');
    first = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-adm', runtime: 'claude',
      command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
    });
    assert.throws(
      () => runner.spawnSession({
        db, repoRoot,
        task_id: 'r-adm', runtime: 'codex',
        command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
      }),
      (err) => err instanceof runner.SessionRunnerError && err.code === 'ADMISSION_DENIED',
    );
  } finally {
    if (first && first.pid) { try { process.kill(first.pid, 'SIGKILL'); } catch (_) { /* ignore */ } }
    cleanup(repoRoot, db);
  }
});

test('takeover=true crashes old session and spawns new one', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let first, second;
  try {
    seedTask(db, 'r-take');
    first = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-take', runtime: 'claude',
      command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
    });
    second = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-take', runtime: 'codex',
      command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
      takeover: true,
    });
    assert.notEqual(second.sid, first.sid);

    const firstRow = ops.readSession(db, first.sid);
    assert.equal(firstRow.status, 'crashed');
    const secondRow = ops.readSession(db, second.sid);
    assert.equal(secondRow.status, 'running');
    assert.equal(secondRow.runtime, 'codex');
  } finally {
    for (const h of [first, second]) {
      if (h && h.pid) { try { process.kill(h.pid, 'SIGKILL'); } catch (_) { /* ignore */ } }
    }
    cleanup(repoRoot, db);
  }
});

test('attachHeartbeat updates heartbeat_at while running', async () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let handle;
  try {
    seedTask(db, 'r-hb');
    handle = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-hb', runtime: 'claude',
      command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
    });
    const stop = runner.attachHeartbeat(db, handle.sid, { intervalMs: 20 });
    await new Promise((r) => setTimeout(r, 80));
    stop();

    const row = ops.readSession(db, handle.sid);
    assert.ok(row.heartbeat_at, 'heartbeat_at should be populated');
    // lease extended beyond initial default of started_at + 1800s? compare against start
    assert.ok(Date.parse(row.heartbeat_at) > 0);
  } finally {
    if (handle && handle.pid) { try { process.kill(handle.pid, 'SIGKILL'); } catch (_) { /* ignore */ } }
    cleanup(repoRoot, db);
  }
});

test('kill -9 child: reapOrphanSessions marks orphan after heartbeat grace expires', async () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let handle;
  try {
    seedTask(db, 'r-orphan');
    handle = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-orphan', runtime: 'claude',
      command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
    });
    // force lease + heartbeat into the past so reaper has something to grab
    ops.updateSession(db, handle.sid, {
      lease_expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
      heartbeat_at: new Date(Date.now() - 60 * 1000).toISOString(),
    });
    process.kill(handle.pid, 'SIGKILL');

    const reaped = ops.reapOrphanSessions(db, { graceSeconds: 30 });
    assert.ok(reaped.reaped.includes(handle.sid));
    const row = ops.readSession(db, handle.sid);
    assert.equal(row.status, 'orphan');
  } finally {
    cleanup(repoRoot, db);
  }
});

test('concurrent spawns on same task: only one succeeds (admission serialization)', async () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let winner;
  try {
    seedTask(db, 'r-race');

    const attempts = [0, 1, 2].map((i) =>
      Promise.resolve().then(() => {
        try {
          return runner.spawnSession({
            db, repoRoot,
            task_id: 'r-race', runtime: ['claude', 'opencode', 'codex'][i],
            command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
          });
        } catch (err) {
          return { error: err.code };
        }
      }),
    );
    const results = await Promise.all(attempts);
    const winners = results.filter((r) => r && r.sid);
    const denied = results.filter((r) => r && r.error === 'ADMISSION_DENIED');
    assert.equal(winners.length, 1, `expected 1 winner, got ${winners.length}`);
    assert.equal(denied.length, 2, `expected 2 denied, got ${denied.length}`);
    winner = winners[0];
  } finally {
    if (winner && winner.pid) { try { process.kill(winner.pid, 'SIGKILL'); } catch (_) { /* ignore */ } }
    cleanup(repoRoot, db);
  }
});

test('two sessions on different tasks get independent worktrees', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let a, b;
  try {
    seedTask(db, 'r-multi-a');
    seedTask(db, 'r-multi-b');
    a = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-multi-a', runtime: 'claude',
      command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
    });
    b = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-multi-b', runtime: 'codex',
      command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
    });
    assert.notEqual(a.sid, b.sid);
    assert.notEqual(a.worktree_path, b.worktree_path);
    assert.notEqual(a.pid, b.pid);
    assert.ok(isProcessAlive(a.pid) && isProcessAlive(b.pid));
  } finally {
    for (const h of [a, b]) {
      if (h && h.pid) { try { process.kill(h.pid, 'SIGKILL'); } catch (_) { /* ignore */ } }
    }
    cleanup(repoRoot, db);
  }
});
