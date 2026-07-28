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
const baselines = require('../../mcp-server/lib/baseline-workflow.cjs');
const ops = require('../../mcp-server/lib/state-ops.cjs');
const workflows = require('../../mcp-server/lib/workflow-state.cjs');
const wtmgr = require('../worktree-manager.cjs');
const autoMerge = require('../auto-merge.cjs');
const runner = require('../session-runner.cjs');

function mkRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-automerge-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@ubp.dev'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'ubp-test'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'seed.md'), '# seed\n');
  // Mutable DB and worktree state lives under .ultra/.runtime — keep it out of git so
  // `git status` in conflict tests isn't polluted by untracked test artifacts.
  fs.writeFileSync(path.join(dir, '.gitignore'), '.ultra/.runtime\n');
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: dir });
  closeStateDb(initStateDb(
    path.join(dir, '.ultra', '.runtime', 'state.db'),
  ).db);
  return dir;
}

function mkDb(repoRoot) {
  const dbPath = path.join(repoRoot, '.ultra', '.runtime', 'state.db');
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

function completeTask(db, taskId, completionCommit = null) {
  ops.updateTaskStatus(db, taskId, 'in_progress');
  if (completionCommit) ops.patchTask(db, taskId, { completion_commit: completionCommit });
  ops.updateTaskStatus(db, taskId, 'completed');
}

function seedWorkflowState(db, {
  id, kind, changeId, taskId, status, summary = {},
}) {
  const definition = workflows.WORKFLOW_DEFINITIONS[kind];
  db.prepare(
    `INSERT INTO workflow_runs
       (id, kind, subject, definition_version, status, current_step,
        change_id, task_id, summary_json, completed_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
  ).run(
    id,
    kind,
    `${kind} fixture`,
    workflows.DEFINITION_VERSION,
    status,
    changeId,
    taskId,
    JSON.stringify(summary),
    status === 'completed' ? new Date().toISOString() : null,
  );
  const insertStep = db.prepare(
    `INSERT INTO workflow_steps
       (run_id, step_id, position, title, required, status, evidence_json)
     VALUES (?, ?, ?, ?, 1, 'completed', '[]')`,
  );
  definition.forEach((step, position) => {
    insertStep.run(id, step.id, position, step.title);
  });
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

test('closeSession autoMerge=true preserves work before task convergence', () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    ops.createTask(db, { id: 'cs-not-ready', title: 'x', type: 'feature', priority: 'P2' });
    const handle = runner.spawnSession({
      db, repoRoot: repo,
      task_id: 'cs-not-ready', runtime: 'claude',
      command: process.execPath, args: ['-e', 'process.exit(0)'],
    });
    commitInWorktree(handle.worktree_path, 'not-ready.txt', 'hi\n');

    const result = runner.closeSession(
      { db, repoRoot: repo, sid: handle.sid },
      { autoMerge: true, mergeBaseBranch: 'main' },
    );
    assert.equal(result.merge.merged, false);
    assert.equal(result.merge.reason, 'task_not_completed');
    assert.equal(result.worktree_preserved, true);
    assert.equal(fs.existsSync(path.join(repo, 'not-ready.txt')), false);
  } finally { cleanup(repo, db); }
});

test('closeSession does not auto-merge a change task with open dev workflow gates', () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    db.prepare(
      `INSERT INTO changes (id, title, kind, status, intent, artifact_root)
       VALUES ('merge-gated-change', 'Merge gated change', 'standard', 'active',
               'Require workflow evidence before integration.',
               '.ultra/changes/active/merge-gated-change')`,
    ).run();
    ops.createTask(db, {
      id: 'cs-change-gated',
      title: 'change-owned merge target',
      type: 'feature',
      priority: 'P1',
      change_id: 'merge-gated-change',
    });
    const { worktree_path: worktreePath } = wtmgr.allocate({
      repoRoot: repo, sid: 'sess-change-gated',
    });
    const completionCommit = commitInWorktree(worktreePath, 'gated.txt', 'gated\n');
    completeTask(db, 'cs-change-gated', completionCommit);
    ops.createSession(db, {
      sid: 'sess-change-gated',
      task_id: 'cs-change-gated',
      runtime: 'codex',
      worktree_path: worktreePath,
      artifact_dir: path.join(
        repo,
        '.ultra',
        '.runtime',
        'sessions',
        'sess-change-gated',
      ),
    });

    const result = runner.closeSession(
      { db, repoRoot: repo, sid: 'sess-change-gated' },
      { autoMerge: true, mergeBaseBranch: 'main' },
    );
    assert.equal(result.merge.merged, false);
    assert.equal(result.merge.reason, 'workflow_gates_open');
    assert.equal(result.merge.blocker, 'DEV_WORKFLOW_NOT_READY');
    assert.equal(result.worktree_preserved, true);
    assert.equal(fs.existsSync(path.join(repo, 'gated.txt')), false);
  } finally { cleanup(repo, db); }
});

test('closeSession auto-merges a change task only after current dev and review evidence', () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    db.prepare(
      `INSERT INTO changes (id, title, kind, status, intent, artifact_root)
       VALUES ('merge-ready-change', 'Merge ready change', 'standard', 'active',
               'Integrate only current reviewed work.',
               '.ultra/changes/active/merge-ready-change')`,
    ).run();
    ops.createTask(db, {
      id: 'cs-change-ready',
      title: 'reviewed merge target',
      type: 'feature',
      priority: 'P1',
      change_id: 'merge-ready-change',
    });
    const { worktree_path: worktreePath } = wtmgr.allocate({
      repoRoot: repo, sid: 'sess-change-ready',
    });
    const completionCommit = commitInWorktree(worktreePath, 'ready.txt', 'ready\n');
    completeTask(db, 'cs-change-ready', completionCommit);
    const snapshot = baselines.gitWorktreeSnapshot(worktreePath, ['.']);
    seedWorkflowState(db, {
      id: 'dev-change-ready',
      kind: 'dev',
      changeId: 'merge-ready-change',
      taskId: 'cs-change-ready',
      status: 'ready',
    });
    seedWorkflowState(db, {
      id: 'review-change-ready',
      kind: 'review',
      changeId: 'merge-ready-change',
      taskId: 'cs-change-ready',
      status: 'completed',
      summary: {
        mode: 'task',
        verdict: 'APPROVE',
        axes: {
          spec_fidelity: { verdict: 'PASS' },
          engineering_standards: { verdict: 'PASS' },
        },
        git_commit: snapshot.head,
        worktree_digest: snapshot.digest,
      },
    });
    ops.createSession(db, {
      sid: 'sess-change-ready',
      task_id: 'cs-change-ready',
      runtime: 'codex',
      worktree_path: worktreePath,
      artifact_dir: path.join(
        repo,
        '.ultra',
        '.runtime',
        'sessions',
        'sess-change-ready',
      ),
    });

    const result = runner.closeSession(
      { db, repoRoot: repo, sid: 'sess-change-ready' },
      { autoMerge: true, mergeBaseBranch: 'main' },
    );
    assert.equal(result.merge.merged, true);
    assert.equal(result.worktree_preserved, false);
    assert.equal(fs.readFileSync(path.join(repo, 'ready.txt'), 'utf8'), 'ready\n');
  } finally { cleanup(repo, db); }
});

test('closeSession autoMerge=true + completed task + clean merge → worktree removed', () => {
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
    const completionCommit = commitInWorktree(handle.worktree_path, 'new.txt', 'hi\n');
    completeTask(db, 'cs-clean', completionCommit);
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

test('closeSession autoMerge=true + completed task + conflict → worktree kept', () => {
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
    const completionCommit = commitInWorktree(
      handle.worktree_path,
      'shared.txt',
      'session-version\n',
    );
    completeTask(db, 'cs-cflict', completionCommit);

    const result = runner.closeSession(
      { db, repoRoot: repo, sid: handle.sid },
      { autoMerge: true, mergeBaseBranch: 'main' },
    );
    assert.equal(result.merge && result.merge.merged, false);
    assert.equal(result.merge.reason, 'conflict');
    assert.ok(fs.existsSync(handle.worktree_path), 'conflict → worktree preserved for resolution');
  } finally { cleanup(repo, db); }
});

test('closeSession autoMerge=false preserves committed but unintegrated work', () => {
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
    assert.equal(result.worktree_preserved, true);
    assert.equal(fs.existsSync(handle.worktree_path), true, 'unintegrated worktree must remain recoverable');
    // main must still be at seed (no merge happened)
    assert.equal(fs.existsSync(path.join(repo, 'n.txt')), false);
  } finally { cleanup(repo, db); }
});

test('closeSession autoMerge=true preserves uncommitted changes instead of reporting no changes', () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    ops.createTask(db, { id: 'cs-dirty', title: 'x', type: 'feature', priority: 'P2' });
    const handle = runner.spawnSession({
      db, repoRoot: repo,
      task_id: 'cs-dirty', runtime: 'claude',
      command: process.execPath, args: ['-e', 'process.exit(0)'],
    });
    fs.writeFileSync(path.join(handle.worktree_path, 'dirty.txt'), 'uncommitted\n');
    completeTask(db, 'cs-dirty');

    const result = runner.closeSession(
      { db, repoRoot: repo, sid: handle.sid },
      { autoMerge: true, mergeBaseBranch: 'main' },
    );

    assert.equal(result.merge.merged, false);
    assert.equal(result.merge.reason, 'uncommitted_changes');
    assert.equal(result.worktree_preserved, true);
    assert.ok(fs.existsSync(handle.worktree_path));
    assert.equal(fs.existsSync(path.join(repo, 'dirty.txt')), false);
  } finally { cleanup(repo, db); }
});
