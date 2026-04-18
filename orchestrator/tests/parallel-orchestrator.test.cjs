'use strict';

// Phase 8B.2 — Parallel orchestrator: consumes execution-plan.json waves,
// spawns sessions via session-runner, respects parallel vs serial per wave,
// and emits wave/plan events.
//
// AC (PLAN §6 Phase 8B.2):
//   - 10 independent-file tasks run in parallel
//   - 2 tasks sharing a file serialize (plan-builder flips wave.parallel=false)
//   - wave boundary strict: wave N+1 waits on wave N close
//   - Phase 5.4 daemon tests stay green (no shared state)

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

// Test-Double rationale: we don't invoke real LLM runtimes; a short-lived
// Node subprocess is enough to exercise spawn → exit → session.close flow.
const NODE = process.execPath;
function exitOk(delayMs = 20) { return ['-e', `setTimeout(() => process.exit(0), ${delayMs})`]; }
function exitFail() { return ['-e', 'process.exit(1)']; }

function mkRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-parorch-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@ubp.dev'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'ubp-test'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'seed.md'), '# seed\n');
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

function seedTask(db, id, files_modified = [], deps = []) {
  ops.createTask(db, {
    id, title: `task ${id}`, type: 'feature', priority: 'P2',
    complexity: 2, files_modified, deps,
  });
}

function cleanup(repoRoot, db) {
  try { closeStateDb(db); } catch (_) { /* best-effort */ }
  try { fs.rmSync(repoRoot, { recursive: true, force: true }); } catch (_) { /* best-effort */ }
}

// ─── happy path ───────────────────────────────────────────────────────────

test('runPlan: 1 wave 1 task → task.status=completed + plan_completed event', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    seedTask(db, 't1');
    const plan = buildPlan([{ id: 't1', deps: [], complexity: 2 }]);
    await parallelOrch.runPlan({
      db, repoRoot: repo, plan,
      runtimes: ['claude'],
      command: NODE, commandArgs: exitOk(),
    });
    const t = ops.readTask(db, 't1');
    assert.equal(t.status, 'completed');
    const { events } = ops.subscribeEventsSince(db, 0);
    const types = events.map((e) => e.type);
    assert.ok(types.includes('wave_started'));
    assert.ok(types.includes('wave_completed'));
    assert.ok(types.includes('plan_completed'));
  } finally { cleanup(repo, db); }
});

test('runPlan: 2-wave 6-task independent files → all parallel, all completed', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    const tasks = [];
    for (let i = 1; i <= 3; i++) {
      seedTask(db, `a${i}`, [`dir/a${i}.js`]);
      tasks.push({ id: `a${i}`, deps: [], complexity: 1, files_modified: [`dir/a${i}.js`] });
    }
    for (let i = 1; i <= 3; i++) {
      seedTask(db, `b${i}`, [`dir/b${i}.js`], [`a${i}`]);
      tasks.push({ id: `b${i}`, deps: [`a${i}`], complexity: 1, files_modified: [`dir/b${i}.js`] });
    }
    const plan = buildPlan(tasks);
    assert.equal(plan.waves.length, 2, 'topo should yield 2 waves');
    assert.equal(plan.waves[0].parallel, true);
    assert.equal(plan.waves[1].parallel, true);

    await parallelOrch.runPlan({
      db, repoRoot: repo, plan,
      runtimes: ['claude'],
      command: NODE, commandArgs: exitOk(30),
    });
    for (const t of tasks) {
      assert.equal(ops.readTask(db, t.id).status, 'completed', `${t.id} should complete`);
    }
  } finally { cleanup(repo, db); }
});

test('runPlan: 2 tasks sharing one file → plan-builder flips parallel=false → serial exec', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    seedTask(db, 'c1', ['shared.js']);
    seedTask(db, 'c2', ['shared.js']);
    const plan = buildPlan([
      { id: 'c1', deps: [], complexity: 1, files_modified: ['shared.js'] },
      { id: 'c2', deps: [], complexity: 1, files_modified: ['shared.js'] },
    ]);
    assert.equal(plan.waves[0].parallel, false, 'plan-builder should detect conflict');

    await parallelOrch.runPlan({
      db, repoRoot: repo, plan,
      runtimes: ['claude'],
      command: NODE, commandArgs: exitOk(30),
    });
    assert.equal(ops.readTask(db, 'c1').status, 'completed');
    assert.equal(ops.readTask(db, 'c2').status, 'completed');
  } finally { cleanup(repo, db); }
});

test('runPlan: wave boundary — wave 2 does not start until wave 1 closes', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    seedTask(db, 'w1');
    seedTask(db, 'w2', [], ['w1']);
    const plan = buildPlan([
      { id: 'w1', deps: [] },
      { id: 'w2', deps: ['w1'] },
    ]);
    assert.equal(plan.waves.length, 2);

    await parallelOrch.runPlan({
      db, repoRoot: repo, plan,
      runtimes: ['claude'],
      command: NODE, commandArgs: exitOk(40),
    });

    const { events } = ops.subscribeEventsSince(db, 0);
    const spawns = events.filter((e) => e.type === 'session_spawned');
    const closes = events.filter((e) => e.type === 'session_closed');
    const w2SpawnIdx = events.findIndex((e) => e.type === 'session_spawned' && e.task_id === 'w2');
    const w1CloseIdx = events.findIndex((e) => e.type === 'session_closed' && e.task_id === 'w1');
    assert.ok(w1CloseIdx > -1 && w2SpawnIdx > -1, 'both events should exist');
    assert.ok(w1CloseIdx < w2SpawnIdx, 'w1 must close before w2 spawns');
    assert.equal(spawns.length, 2);
    assert.equal(closes.length, 2);
  } finally { cleanup(repo, db); }
});

// ─── failure path ─────────────────────────────────────────────────────────

test('runPlan: task exits non-zero → session crashed, task stays pending', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    seedTask(db, 'fail1');
    const plan = buildPlan([{ id: 'fail1', deps: [] }]);
    await parallelOrch.runPlan({
      db, repoRoot: repo, plan,
      runtimes: ['claude'],
      command: NODE, commandArgs: exitFail(),
    });
    const t = ops.readTask(db, 'fail1');
    assert.equal(t.status, 'pending', 'failed task stays pending for recovery');
    const { events } = ops.subscribeEventsSince(db, 0);
    const crashed = events.find((e) => e.type === 'session_crashed');
    assert.ok(crashed, 'session_crashed event expected');
  } finally { cleanup(repo, db); }
});

test('runPlan: one task fails in wave, others still complete (no short-circuit)', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    seedTask(db, 'ok1', ['f1.js']);
    seedTask(db, 'bad1', ['f2.js']);
    seedTask(db, 'ok2', ['f3.js']);
    const plan = buildPlan([
      { id: 'ok1', deps: [], files_modified: ['f1.js'] },
      { id: 'bad1', deps: [], files_modified: ['f2.js'] },
      { id: 'ok2', deps: [], files_modified: ['f3.js'] },
    ]);
    await parallelOrch.runPlan({
      db, repoRoot: repo, plan,
      runtimes: ['claude'],
      command: NODE,
      commandArgsFor: (task) => (task.id === 'bad1' ? exitFail() : exitOk(20)),
    });
    assert.equal(ops.readTask(db, 'ok1').status, 'completed');
    assert.equal(ops.readTask(db, 'ok2').status, 'completed');
    assert.equal(ops.readTask(db, 'bad1').status, 'pending');
  } finally { cleanup(repo, db); }
});

test('runPlan: emits wave_started/wave_completed per wave + one plan_completed', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    seedTask(db, 'e1');
    seedTask(db, 'e2', [], ['e1']);
    const plan = buildPlan([
      { id: 'e1', deps: [] },
      { id: 'e2', deps: ['e1'] },
    ]);
    await parallelOrch.runPlan({
      db, repoRoot: repo, plan,
      runtimes: ['claude'],
      command: NODE, commandArgs: exitOk(20),
    });
    const { events } = ops.subscribeEventsSince(db, 0);
    const waveStarts = events.filter((e) => e.type === 'wave_started');
    const waveCloses = events.filter((e) => e.type === 'wave_completed');
    const planCloses = events.filter((e) => e.type === 'plan_completed');
    assert.equal(waveStarts.length, 2);
    assert.equal(waveCloses.length, 2);
    assert.equal(planCloses.length, 1);
  } finally { cleanup(repo, db); }
});
