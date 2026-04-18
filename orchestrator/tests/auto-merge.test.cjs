'use strict';

// Phase 8B.4 — Auto-merge back.
//
// autoMerge({ repoRoot, worktreePath, baseBranch, sid, task_id, db }):
//   • no changes (session_sha === base_sha)        → { merged:false, reason:'no_changes' }
//   • clean merge                                   → { merged:true }  + merged_back event
//   • conflict                                      → { merged:false, reason:'conflict', conflict_paths[] }
//                                                     + merge_conflict event + merge --abort
// closeSession({ autoMerge:true }) integration:
//   • autoMerge=true + conflict → worktree kept on disk (for human to resolve)
//   • autoMerge=false (default) → behavior unchanged (Phase 4.5 / 5 / 7 tests)

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { initStateDb, closeStateDb } = require('../../mcp-server/lib/state-db.cjs');
const ops = require('../../mcp-server/lib/state-ops.cjs');
const wtmgr = require('../worktree-manager.cjs');
const autoMerge = require('../auto-merge.cjs');
const runner = require('../session-runner.cjs');

function mkRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-automerge-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@ubp.dev'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'ubp-test'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'seed.md'), '# seed\n');
  // The DB and worktree dirs live under .ultra/ — keep them out of git so
  // `git status` in conflict tests isn't polluted by untracked test artifacts.
  fs.writeFileSync(path.join(dir, '.gitignore'), '.ultra/\n');
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: dir });
  return dir;
}

function mkDb(repoRoot) {
  const dbPath = path.join(repoRoot, '.ultra', 'state.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const { db } = initStateDb(dbPath);
  return db;
}

function commitInWorktree(wtPath, filename, content, msg = 'session change') {
  fs.writeFileSync(path.join(wtPath, filename), content);
  execFileSync('git', ['add', '-A'], { cwd: wtPath });
  execFileSync('git', ['-c', 'user.email=s@ubp.dev', '-c', 'user.name=s-ubp',
    'commit', '-q', '-m', msg], { cwd: wtPath });
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: wtPath, stdio: ['ignore', 'pipe', 'pipe'] })
    .toString().trim();
}

function cleanup(repoRoot, db) {
  try { if (db) closeStateDb(db); } catch (_) { /* best-effort */ }
  try { fs.rmSync(repoRoot, { recursive: true, force: true }); } catch (_) { /* best-effort */ }
}

// ─── autoMerge pure function ──────────────────────────────────────────────

test('autoMerge: no session commits → merged:false reason:no_changes', () => {
  const repo = mkRepo();
  try {
    const { worktree_path } = wtmgr.allocate({ repoRoot: repo, sid: 's-noop' });
    const r = autoMerge.autoMerge({
      repoRoot: repo, worktreePath: worktree_path,
      baseBranch: 'main', sid: 's-noop',
    });
    assert.equal(r.merged, false);
    assert.equal(r.reason, 'no_changes');
  } finally { cleanup(repo); }
});

test('autoMerge: 3 slices with independent files → all merged back to main', () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    for (const sid of ['s1', 's2', 's3']) {
      ops.createTask(db, { id: sid, title: sid, type: 'feature', priority: 'P2' });
    }
    const shas = {};
    for (const [sid, file] of [['s1', 'a.txt'], ['s2', 'b.txt'], ['s3', 'c.txt']]) {
      const { worktree_path } = wtmgr.allocate({ repoRoot: repo, sid });
      shas[sid] = commitInWorktree(worktree_path, file, `${file}\n`);
      const r = autoMerge.autoMerge({
        repoRoot: repo, worktreePath: worktree_path,
        baseBranch: 'main', sid, task_id: sid, db,
      });
      assert.equal(r.merged, true, `${sid} should merge`);
      assert.equal(r.session_sha, shas[sid]);
    }
    assert.ok(fs.existsSync(path.join(repo, 'a.txt')));
    assert.ok(fs.existsSync(path.join(repo, 'b.txt')));
    assert.ok(fs.existsSync(path.join(repo, 'c.txt')));
    const { events } = ops.subscribeEventsSince(db, 0);
    const merged = events.filter((e) => e.type === 'merged_back');
    assert.equal(merged.length, 3);
  } finally { cleanup(repo, db); }
});

test('autoMerge: 2 slices on same file → first merges, second conflict + event', () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    ops.createTask(db, { id: 'cf1', title: 'cf1', type: 'feature', priority: 'P2' });
    ops.createTask(db, { id: 'cf2', title: 'cf2', type: 'feature', priority: 'P2' });
    const { worktree_path: w1 } = wtmgr.allocate({ repoRoot: repo, sid: 'cf1' });
    const { worktree_path: w2 } = wtmgr.allocate({ repoRoot: repo, sid: 'cf2' });
    commitInWorktree(w1, 'conflict.txt', 'version-A\n');
    commitInWorktree(w2, 'conflict.txt', 'version-B\n');

    const r1 = autoMerge.autoMerge({
      repoRoot: repo, worktreePath: w1, baseBranch: 'main', sid: 'cf1', task_id: 'cf1', db,
    });
    assert.equal(r1.merged, true);
    const r2 = autoMerge.autoMerge({
      repoRoot: repo, worktreePath: w2, baseBranch: 'main', sid: 'cf2', task_id: 'cf2', db,
    });
    assert.equal(r2.merged, false);
    assert.equal(r2.reason, 'conflict');
    assert.ok(Array.isArray(r2.conflict_paths));
    assert.ok(r2.conflict_paths.includes('conflict.txt'));

    // main HEAD rolled back to r1's merge commit, not mid-conflict
    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd: repo, stdio: ['ignore', 'pipe', 'pipe'],
    }).toString();
    assert.equal(status.trim(), '', 'working tree must be clean after abort');

    const { events } = ops.subscribeEventsSince(db, 0);
    const conflict = events.find((e) => e.type === 'merge_conflict');
    assert.ok(conflict, 'merge_conflict event expected');
    assert.deepEqual(conflict.payload.conflict_paths, ['conflict.txt']);
  } finally { cleanup(repo, db); }
});

// ─── closeSession integration ─────────────────────────────────────────────

test('closeSession autoMerge=true + clean merge → worktree removed', () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    ops.createTask(db, { id: 'cs-clean', title: 'x', type: 'feature', priority: 'P2' });
    const handle = runner.spawnSession({
      db, repoRoot: repo,
      task_id: 'cs-clean', runtime: 'claude',
      command: process.execPath, args: ['-e', 'process.exit(0)'],
    });
    // Simulate agent commit inside worktree
    commitInWorktree(handle.worktree_path, 'new.txt', 'hi\n');
    // Wait for child to exit so closeSession can kill cleanly (it already did)
    if (handle.process) { try { handle.process.kill('SIGTERM'); } catch (_) { /* noop */ } }

    const result = runner.closeSession(
      { db, repoRoot: repo, sid: handle.sid },
      { autoMerge: true, mergeBaseBranch: 'main' },
    );
    assert.equal(result.merge && result.merge.merged, true);
    assert.equal(fs.existsSync(handle.worktree_path), false, 'clean merge → worktree removed');
  } finally { cleanup(repo, db); }
});

test('closeSession autoMerge=true + conflict → worktree kept', () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    ops.createTask(db, { id: 'cs-cflict', title: 'x', type: 'feature', priority: 'P2' });

    // Spawn FIRST so the worktree forks at seed commit (before main diverges).
    const handle = runner.spawnSession({
      db, repoRoot: repo,
      task_id: 'cs-cflict', runtime: 'claude',
      command: process.execPath, args: ['-e', 'process.exit(0)'],
    });
    // Advance main with a conflicting version of shared.txt.
    fs.writeFileSync(path.join(repo, 'shared.txt'), 'main-version\n');
    execFileSync('git', ['add', '-A'], { cwd: repo });
    execFileSync('git', ['commit', '-q', '-m', 'main change'], { cwd: repo });
    // Session worktree forks off seed and writes its own version of the same file.
    commitInWorktree(handle.worktree_path, 'shared.txt', 'session-version\n');

    const result = runner.closeSession(
      { db, repoRoot: repo, sid: handle.sid },
      { autoMerge: true, mergeBaseBranch: 'main' },
    );
    assert.equal(result.merge && result.merge.merged, false);
    assert.equal(result.merge.reason, 'conflict');
    assert.ok(fs.existsSync(handle.worktree_path), 'conflict → worktree preserved for resolution');
  } finally { cleanup(repo, db); }
});

test('closeSession autoMerge=false (default) → no merge, legacy behavior', () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    ops.createTask(db, { id: 'cs-off', title: 'x', type: 'feature', priority: 'P2' });
    const handle = runner.spawnSession({
      db, repoRoot: repo,
      task_id: 'cs-off', runtime: 'claude',
      command: process.execPath, args: ['-e', 'process.exit(0)'],
    });
    commitInWorktree(handle.worktree_path, 'n.txt', 'x\n');

    const result = runner.closeSession(
      { db, repoRoot: repo, sid: handle.sid },
      {}, // autoMerge not set
    );
    assert.equal(result.merge, undefined, 'no merge when opt-in disabled');
    assert.equal(fs.existsSync(handle.worktree_path), false, 'worktree removed normally');
    // main must still be at seed (no merge happened)
    assert.equal(fs.existsSync(path.join(repo, 'n.txt')), false);
  } finally { cleanup(repo, db); }
});
