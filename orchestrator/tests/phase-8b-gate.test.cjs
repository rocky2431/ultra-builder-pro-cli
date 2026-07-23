'use strict';

// Phase 8B gate — end-to-end integration verifying the three PLAN gate clauses:
//
//   1. Successful worker transport does not bypass Ultra completion gates
//   2. "5-slice worktree stress → no .git/config.lock contention"
//   3. "merge-back conflicts correctly identified"
//
// All use the Test-Double command (`node -e '...'`) so there's no LLM cost;
// Phase 8A.1 LLM-backed parse_prd is out of scope here.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { initStateDb, closeStateDb } = require('../../mcp-server/lib/state-db.cjs');
const ops = require('../../mcp-server/lib/state-ops.cjs');
const { buildPlan } = require('../planner/plan-builder.cjs');
const parallelOrch = require('../parallel-orchestrator.cjs');
const wtmgr = require('../worktree-manager.cjs');

const NODE = process.execPath;
const STATE_DB_MODULE = require.resolve('../../mcp-server/lib/state-db.cjs');
const STATE_OPS_MODULE = require.resolve('../../mcp-server/lib/state-ops.cjs');

function commitScript(filename, content, { completeTask = false } = {}) {
  // Create a file (with parent dirs) in the session's CWD and commit it —
  // simulates an agent's session work.
  return [
    '-e',
    `
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const f = ${JSON.stringify(filename)};
fs.mkdirSync(path.dirname(f) || '.', { recursive: true });
fs.writeFileSync(f, ${JSON.stringify(content)});
execFileSync('git', ['add', '-A']);
execFileSync('git', ['-c', 'user.email=agent@ubp.dev', '-c', 'user.name=agent',
                     'commit', '-q', '-m', 'agent change ' + f]);
if (${JSON.stringify(completeTask)}) {
  const stateDb = require(${JSON.stringify(STATE_DB_MODULE)});
  const ops = require(${JSON.stringify(STATE_OPS_MODULE)});
  const dbPath = path.resolve(process.env.UBP_ARTIFACT_DIR, '..', '..', 'state.db');
  const { db } = stateDb.initStateDb(dbPath);
  try {
    const task = ops.readTask(db, process.env.UBP_TASK_ID);
    if (task.status === 'pending') ops.updateTaskStatus(db, task.id, 'in_progress');
    const completionCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    ops.patchTask(db, task.id, { completion_commit: completionCommit });
    ops.updateTaskStatus(db, task.id, 'completed');
  } finally {
    stateDb.closeStateDb(db);
  }
}
process.exit(0);
`,
  ];
}

function mkRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-8b-gate-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@ubp.dev'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'ubp-test'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'seed.md'), '# seed\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.ultra\n');
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

function cleanup(repoRoot, db) {
  try { if (db) closeStateDb(db); } catch (_) { /* best-effort */ }
  try { fs.rmSync(repoRoot, { recursive: true, force: true }); } catch (_) { /* best-effort */ }
}

// ─── Gate clause 1 — transport success cannot bypass workflow gates ───────

test('gate 1: 10-task transport success preserves work until task gates converge', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    const tasks = [];
    for (let i = 1; i <= 10; i++) {
      const id = `T${String(i).padStart(2, '0')}`;
      const file = `feat/${id}.txt`;
      ops.createTask(db, {
        id, title: `feature ${i}`,
        type: 'feature', priority: 'P2',
        complexity: 2, files_modified: [file],
      });
      tasks.push({ id, deps: [], complexity: 2, files_modified: [file] });
    }
    const plan = buildPlan(tasks);
    // All files independent → single parallel wave.
    assert.equal(plan.waves.length, 1);
    assert.equal(plan.waves[0].parallel, true);

    const { results } = await parallelOrch.runPlan({
      db, repoRoot: repo, plan,
      runtimes: ['claude'],
      command: NODE,
      commandArgsFor: (task) => commitScript(task.files_modified[0], `${task.id}\n`),
      autoMerge: true,
      mergeBaseBranch: 'main',
    });

    assert.equal(results.length, tasks.length);
    assert.equal(results.every((result) => result.status === 'completed'), true);
    assert.equal(results.every((result) => result.task_status === 'in_progress'), true);
    assert.equal(tasks.every((task) => ops.readTask(db, task.id).status === 'in_progress'), true);

    // Even explicit autoMerge cannot integrate work before task completion.
    const merged = results.filter((r) => r.merge && r.merge.merged).length;
    assert.equal(merged, 0);
    assert.equal(results.every((result) => result.worktree_preserved === true), true);
    for (let i = 1; i <= 10; i++) {
      const id = `T${String(i).padStart(2, '0')}`;
      const file = path.join(repo, 'feat', `${id}.txt`);
      assert.equal(fs.existsSync(file), false, `${id} must not be merged before workflow gates`);
    }
  } finally { cleanup(repo, db); }
});

// ─── Gate clause 2 — 5-slice stress, no .git/config.lock contention ───────

test('gate 2: 5 rapid worktree allocations → no git lock errors, all tracked', () => {
  const repo = mkRepo();
  try {
    const sids = ['g2-1', 'g2-2', 'g2-3', 'g2-4', 'g2-5'];
    // Back-to-back — Node single-thread execFileSync serializes git calls.
    for (const sid of sids) wtmgr.allocate({ repoRoot: repo, sid });
    const active = wtmgr.listActive(repo);
    assert.equal(active.length, 5);
    const seenSids = new Set(active.map((a) => a.sid));
    for (const sid of sids) assert.ok(seenSids.has(sid), `missing slice ${sid}`);
    // Cleanup and re-check — releaseAll must fully drain.
    wtmgr.releaseAll(repo);
    assert.equal(wtmgr.listActive(repo).length, 0);
  } finally { cleanup(repo); }
});

// ─── Gate clause 3 — merge-back conflict identification ───────────────────

test('gate 3: 2 parallel tasks on same file → 1 merged, 1 conflict event captured', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    ops.createTask(db, {
      id: 'X1', title: 'conflict A', type: 'feature', priority: 'P2',
      files_modified: ['battle.txt'],
    });
    ops.createTask(db, {
      id: 'X2', title: 'conflict B', type: 'feature', priority: 'P2',
      files_modified: ['battle.txt'],
    });
    // Force concurrent execution so both worktrees fork from the SAME base
    // commit. (plan-builder normally serializes these, which would cause X2
    // to fork from X1's merged HEAD and fast-forward cleanly.)
    const manualPlan = {
      waves: [{
        id: 1, tasks: ['X1', 'X2'], parallel: true,
        reason: 'forced concurrent for conflict repro',
      }],
      ownership_forecast: { X1: ['battle.txt'], X2: ['battle.txt'] },
      conflict_surface: [{ files: ['battle.txt'], tasks: ['X1', 'X2'], recommend: 'sequentialize' }],
      estimated_cost_usd: 0,
      estimated_duration_min: 0,
      cycles: [],
    };

    await parallelOrch.runPlan({
      db, repoRoot: repo, plan: manualPlan,
      runtimes: ['claude'],
      command: NODE,
      commandArgsFor: (task) => commitScript(
        'battle.txt',
        `${task.id}-version\n`,
        { completeTask: true },
      ),
      autoMerge: true,
      mergeBaseBranch: 'main',
    });

    const { events } = ops.subscribeEventsSince(db, 0);
    const merged = events.filter((e) => e.type === 'merged_back');
    const conflict = events.filter((e) => e.type === 'merge_conflict');
    assert.equal(merged.length, 1, 'exactly one task should merge');
    assert.equal(conflict.length, 1, 'exactly one task should conflict');
    assert.ok(conflict[0].payload.conflict_paths.includes('battle.txt'));
  } finally { cleanup(repo, db); }
});
