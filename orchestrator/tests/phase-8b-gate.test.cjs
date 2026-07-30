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
const facade = require('../../mcp-server/lib/ultra-facade.cjs');
const { seedReadyBaseline } = require('../../mcp-server/test-support/ready-baseline.cjs');
const { completeChangeInput } = require('../../mcp-server/test-support/change-contract.cjs');
const autoMerge = require('../auto-merge.cjs');
const parallelOrch = require('../parallel-orchestrator.cjs');
const wtmgr = require('../worktree-manager.cjs');

const NODE = process.execPath;

function commitScript(filename, content) {
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
  fs.writeFileSync(
    path.join(dir, '.gitignore'),
    '!.ultra/\n'
      + '!.ultra/**\n'
      + '.ultra/.runtime\n'
      + '.ultra/[s]tate.db\n'
      + '.ultra/[s]tate.db-wal\n'
      + '.ultra/[s]tate.db-shm\n',
  );
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: dir });
  const { db } = initStateDb(path.join(dir, '.ultra', '.runtime', 'state.db'));
  seedReadyBaseline(db, { rootDir: dir });
  closeStateDb(db);
  return dir;
}

function mkDb(repoRoot) {
  const dbPath = path.join(repoRoot, '.ultra', '.runtime', 'state.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const { db } = initStateDb(dbPath);
  return db;
}

function cleanup(repoRoot, db) {
  try { if (db) closeStateDb(db); } catch (_) { /* best-effort */ }
  try { fs.rmSync(repoRoot, { recursive: true, force: true }); } catch (_) { /* best-effort */ }
}

async function authorizeChangePlan(db, repoRoot, tasks, changeId) {
  const acceptanceId = `${changeId}-acceptance`;
  const entries = [{
    kind: 'change_contract',
    action: 'open',
    data: completeChangeInput({
      id: changeId,
      title: `Accepted ${changeId} plan`,
      kind: 'standard',
      intent: 'Exercise orchestrator transport through the v0.24 persistence kernel.',
    }),
    idempotency_key: `${changeId}:open`,
  }, ...tasks.map((task) => ({
    kind: 'task_contract',
    action: 'define',
    data: {
      ...task,
      title: task.title || `Execute ${task.id}`,
      type: 'feature',
      priority: 'P2',
      complexity: task.complexity || 2,
      change_id: changeId,
      outcome: `${task.id} produces isolated Git work without writing Ultra authority.`,
      slice_kind: 'tracer_bullet',
      public_seam: `orchestrator:${task.id}`,
      verification_command: 'node --test orchestrator/tests/phase-8b-gate.test.cjs',
      acceptance: [{
        id: `${task.id}-acceptance`,
        criterion: `${task.id} executes from an accepted Plan and Worker Packet.`,
        verification: 'node --test orchestrator/tests/phase-8b-gate.test.cjs',
      }],
      context_refs: [{
        ref: 'seed.md',
        reason: 'Stable orchestrator fixture Context.',
        required: true,
        freshness_policy: 'existence',
      }],
      docs_impact: { status: 'none', files: [], rationale: 'No public documentation.' },
      ownership: { owner: 'test-owner', reviewers: [] },
      trace_to: acceptanceId,
    },
    idempotency_key: `${changeId}:${task.id}:define`,
  }))];
  const recorded = await facade.record(
    db,
    { entries },
    { rootDir: repoRoot, runtime: 'test' },
  );
  assert.equal(recorded.accepted, true);
  const checkpoint = await facade.checkpoint(db, {
    stage: 'plan',
    scope: { change_id: changeId },
    payload: { summary: `Accept ${changeId} execution plan.` },
    idempotency_key: `${changeId}:plan`,
  }, { rootDir: repoRoot, runtime: 'test' });
  assert.equal(checkpoint.accepted, true);
  return JSON.parse(fs.readFileSync(
    path.join(repoRoot, checkpoint.result.plan_path),
    'utf8',
  ));
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
      tasks.push({ id, deps: [], complexity: 2, files_modified: [file] });
    }
    const plan = await authorizeChangePlan(db, repo, tasks, 'gate-1-change');
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

test('gate 3: explicit integration detects conflicting preserved worker commits', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    const tasks = [
      { id: 'X1', deps: [], files_modified: ['declared/X1.txt'] },
      { id: 'X2', deps: [], files_modified: ['declared/X2.txt'] },
    ];
    const plan = await authorizeChangePlan(db, repo, tasks, 'gate-3-change');
    assert.equal(plan.waves[0].parallel, true);
    const execution = await parallelOrch.runPlan({
      db, repoRoot: repo, plan,
      runtimes: ['claude'],
      command: NODE,
      commandArgsFor: (task) => commitScript(
        'battle.txt',
        `${task.id}-version\n`,
      ),
    });
    assert.equal(execution.results.every((item) => item.worktree_preserved), true);
    const integrations = execution.results.map((item) => {
      const session = ops.readSession(db, item.sid);
      return autoMerge.autoMerge({
        repoRoot: repo,
        worktreePath: session.worktree_path,
        baseBranch: 'main',
        sid: item.sid,
        task_id: item.task_id,
        db,
      });
    });
    assert.equal(integrations.filter((item) => item.merged).length, 1);
    assert.equal(integrations.filter((item) => item.reason === 'conflict').length, 1);

    const { events } = ops.subscribeEventsSince(db, 0);
    const merged = events.filter((e) => e.type === 'merged_back');
    const conflict = events.filter((e) => e.type === 'merge_conflict');
    assert.equal(merged.length, 1, 'exactly one task should merge');
    assert.equal(conflict.length, 1, 'exactly one task should conflict');
    assert.ok(conflict[0].payload.conflict_paths.includes('battle.txt'));
  } finally { cleanup(repo, db); }
});
