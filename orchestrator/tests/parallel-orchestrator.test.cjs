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
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const { initStateDb, closeStateDb } = require('../../mcp-server/lib/state-db.cjs');
const ops = require('../../mcp-server/lib/state-ops.cjs');
const workflows = require('../../mcp-server/lib/workflow-state.cjs');
const { buildPlan } = require('../planner/plan-builder.cjs');
const parallelOrch = require('../parallel-orchestrator.cjs');

// Test-Double rationale: we don't invoke real LLM runtimes; a short-lived
// Node subprocess is enough to exercise spawn → exit → session.close flow.
const NODE = process.execPath;
function exitOk(delayMs = 20) { return ['-e', `setTimeout(() => process.exit(0), ${delayMs})`]; }
function exitFail() { return ['-e', 'process.exit(1)']; }
function missingExecutable() {
  return path.join(os.tmpdir(), `ubp-missing-worker-${process.pid}-${Date.now()}`);
}

function mkRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-parorch-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
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

function seedTask(db, id, files_modified = [], deps = []) {
  ops.createTask(db, {
    id, title: `task ${id}`, type: 'feature', priority: 'P2',
    complexity: 2, files_modified, deps,
  });
}

function seedExecutableChangeTask(db, changeId, taskId) {
  db.prepare(
    `INSERT INTO changes (id, title, kind, status, intent, artifact_root)
     VALUES (?, ?, 'standard', 'active', ?, ?)`,
  ).run(
    changeId,
    `Approved plan ${changeId}`,
    'Dispatch only the approved DB task graph.',
    `.ultra/changes/active/${changeId}`,
  );
  ops.createTask(db, {
    id: taskId,
    title: 'Execute approved scope',
    type: 'feature',
    priority: 'P1',
    complexity: 2,
    change_id: changeId,
    outcome: 'The approved task runs in one isolated worktree.',
    slice_kind: 'tracer_bullet',
    public_seam: 'approved-plan dispatch',
    verification_command: 'node --test orchestrator/tests/parallel-orchestrator.test.cjs',
    acceptance: [{
      id: 'approved-dispatch',
      criterion: 'Only the approved task graph dispatches.',
      verification: 'node --test orchestrator/tests/parallel-orchestrator.test.cjs',
    }],
    context_refs: [{ ref: 'spec/mcp-tools.yaml', reason: 'Execution contract.', required: true }],
    docs_impact: { status: 'none', files: [], rationale: 'No user-facing documentation.' },
    ownership: { owner: 'test-owner', reviewers: [] },
    trace_to: 'spec/mcp-tools.yaml#session-family',
  });
  return buildPlan(
    ops.listTasks(db, { change_id: changeId }),
    { changeId },
  );
}

function cleanup(repoRoot, db) {
  try { closeStateDb(db); } catch (_) { /* best-effort */ }
  try { fs.rmSync(repoRoot, { recursive: true, force: true }); } catch (_) { /* best-effort */ }
}

function seedCompletedPlanWorkflow(db, repoRoot, plan) {
  const relativePath = '.ultra/execution-plan.json';
  const absolutePath = path.join(repoRoot, relativePath);
  const contents = JSON.stringify(plan, null, 2);
  fs.writeFileSync(absolutePath, contents);
  const digest = crypto.createHash('sha256').update(contents).digest('hex');
  const taskContractDigests = Object.fromEntries(
    ops.listTasks(db, { change_id: plan.change_id }).map((task) => {
      const contract = {
        id: task.id,
        change_id: task.change_id,
        parent_id: task.parent_id,
        title: task.title,
        type: task.type,
        priority: task.priority,
        complexity: task.complexity,
        estimated_days: task.estimated_days,
        deps: task.deps || [],
        files_modified: task.files_modified || [],
        tag: task.tag,
        trace_to: task.trace_to,
        outcome: task.outcome,
        slice_kind: task.slice_kind,
        public_seam: task.public_seam,
        verification_command: task.verification_command,
        acceptance: task.acceptance || [],
        context_refs: task.context_refs || [],
        docs_impact: task.docs_impact || {},
        ownership: task.ownership || {},
      };
      return [
        task.id,
        crypto.createHash('sha256').update(JSON.stringify(contract)).digest('hex'),
      ];
    }),
  );
  const workflowId = `completed-plan-${plan.change_id}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO workflow_runs (
       id, kind, subject, definition_version, status, current_step, change_id,
       approval_json, summary_json, started_at, updated_at, completed_at
     ) VALUES (?, 'plan', ?, ?, 'completed', NULL, ?, ?, ?, ?, ?, ?)`,
  ).run(
    workflowId,
    `Completed current plan for ${plan.change_id}`,
    workflows.DEFINITION_VERSION,
    plan.change_id,
    null,
    JSON.stringify({
      plan_path: relativePath,
      plan_digest: digest,
      task_ids: plan.waves.flatMap((wave) => wave.tasks).sort(),
      task_contract_digests: taskContractDigests,
    }),
    now,
    now,
    now,
  );
  const insertStep = db.prepare(
    `INSERT INTO workflow_steps (
       run_id, step_id, position, title, required, status, evidence_json,
       outputs_json, decisions_json, semantic_records_json, blockers_json,
       completed_at, updated_at
     ) VALUES (?, ?, ?, ?, 1, 'completed', '[]', ?, '[]', '[]', '[]', ?, ?)`,
  );
  workflows.WORKFLOW_DEFINITIONS.plan.forEach((definition, position) => {
    const outputs = definition.id === 'verify-plan'
      ? [{ path: relativePath, kind: 'execution-plan', digest }]
      : [];
    insertStep.run(
      workflowId,
      definition.id,
      position,
      definition.title,
      JSON.stringify(outputs),
      now,
      now,
    );
  });
  return workflowId;
}

// ─── happy path ───────────────────────────────────────────────────────────

test('runPlan: successful execution leaves task in_progress for Ultra dev/test/review gates', async () => {
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
    assert.equal(t.status, 'in_progress');
    const { events } = ops.subscribeEventsSince(db, 0);
    const types = events.map((e) => e.type);
    assert.ok(types.includes('wave_started'));
    assert.ok(types.includes('wave_paused'));
    assert.ok(types.includes('plan_paused'));
    assert.equal(types.includes('wave_completed'), false);
    assert.equal(types.includes('plan_completed'), false);
  } finally { cleanup(repo, db); }
});

test('runPlan: rejects empty, cyclic, and duplicate-task plans before dispatch', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    const invalidPlans = [
      { waves: [] },
      { waves: [{ id: 1, tasks: ['t1'], parallel: false }], cycles: [['t1']] },
      {
        waves: [
          { id: 1, tasks: ['t1'], parallel: false },
          { id: 2, tasks: ['t1'], parallel: false },
        ],
      },
    ];
    for (const plan of invalidPlans) {
      await assert.rejects(
        parallelOrch.runPlan({
          db, repoRoot: repo, plan,
          runtimes: ['claude'],
          command: NODE, commandArgs: exitOk(),
        }),
        (error) => error.code === 'PLAN_INVALID',
      );
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM events').get().count, 0);
  } finally { cleanup(repo, db); }
});

test('runPlan: rejects a change-bound plan until its workflow is completed', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    db.prepare(
      `INSERT INTO changes (id, title, kind, status, intent, artifact_root)
       VALUES ('unapproved-change', 'Unapproved plan', 'standard', 'active',
               'Prove execution cannot bypass plan approval.',
               '.ultra/changes/active/unapproved-change')`,
    ).run();
    ops.createTask(db, {
      id: 'unapproved-task',
      title: 'Do not dispatch before approval',
      type: 'feature',
      priority: 'P1',
      complexity: 2,
      change_id: 'unapproved-change',
    });
    const plan = buildPlan(
      [{ id: 'unapproved-task', deps: [], complexity: 2 }],
      { changeId: 'unapproved-change' },
    );
    await assert.rejects(
      parallelOrch.runPlan({
        db, repoRoot: repo, plan,
        runtimes: ['claude'],
        command: NODE, commandArgs: exitOk(),
      }),
      (error) => error.code === 'PLAN_NOT_COMPLETED',
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM events').get().count, 1);
  } finally { cleanup(repo, db); }
});

test('runPlan: dispatches the exact current plan after its workflow is completed', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    const plan = seedExecutableChangeTask(db, 'approved-change', 'approved-task');
    const workflowId = seedCompletedPlanWorkflow(db, repo, plan);
    const result = await parallelOrch.runPlan({
      db, repoRoot: repo, plan,
      runtimes: ['claude'],
      command: NODE, commandArgs: exitOk(),
    });
    assert.equal(result.status, 'paused');
    assert.equal(result.plan_workflow_id, workflowId);
    assert.equal(ops.readTask(db, 'approved-task').status, 'in_progress');
  } finally { cleanup(repo, db); }
});

test('runPlan: authority already stale at admission is rejected without counting a worker failure', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    const plan = seedExecutableChangeTask(db, 'stale-change', 'stale-task');
    seedCompletedPlanWorkflow(db, repo, plan);
    ops.patchTask(db, 'stale-task', { stale: true });

    await assert.rejects(
      parallelOrch.runPlan({
        db, repoRoot: repo, plan,
        runtimes: ['claude'],
        command: NODE, commandArgs: exitOk(),
      }),
      (error) => error.code === 'PLAN_STALE'
        && error.details.authority_code === 'WORKFLOW_PLAN_TASK_CONTRACT_STALE',
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
    const { events } = ops.subscribeEventsSince(db, 0);
    assert.equal(events.some((event) => event.type === 'task_failure'), false);
    assert.equal(ops.readTask(db, 'stale-task').status, 'pending');
  } finally { cleanup(repo, db); }
});

test('runPlan: authority drift between wave admission and spawn is not a worker failure', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    const plan = seedExecutableChangeTask(db, 'racing-change', 'racing-task');
    seedCompletedPlanWorkflow(db, repo, plan);

    const errors = [];
    const result = await parallelOrch.runPlan({
      db, repoRoot: repo, plan,
      runtimes: ['claude'],
      command: NODE,
      commandArgsFor: () => {
        ops.patchTask(db, 'racing-task', {
          outcome: 'The task contract changed after wave admission.',
        });
        return exitOk();
      },
      onError: (error) => errors.push(error),
    });

    assert.equal(result.status, 'paused');
    assert.equal(result.results[0].status, 'authority_blocked');
    assert.equal(result.results[0].authority_code, 'WORKFLOW_PLAN_TASK_CONTRACT_STALE');
    assert.equal(ops.readTask(db, 'racing-task').status, 'pending');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
    const { events } = ops.subscribeEventsSince(db, 0);
    assert.equal(events.some((event) => event.type === 'task_failure'), false);
    assert.equal(errors.length, 0);
  } finally { cleanup(repo, db); }
});

test('runPlan: a later dependency wave stays pending until the prior Ultra tasks complete', async () => {
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

    const first = await parallelOrch.runPlan({
      db, repoRoot: repo, plan,
      runtimes: ['claude'],
      command: NODE, commandArgs: exitOk(30),
    });
    assert.equal(first.status, 'paused');
    assert.equal(first.paused_wave_id, 1);
    assert.equal(first.results.length, 3);
    for (const task of tasks.filter((item) => item.id.startsWith('a'))) {
      assert.equal(ops.readTask(db, task.id).status, 'in_progress', `${task.id} awaits workflow gates`);
    }
    for (const task of tasks.filter((item) => item.id.startsWith('b'))) {
      assert.equal(ops.readTask(db, task.id).status, 'pending', `${task.id} must not start early`);
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
    assert.equal(ops.readTask(db, 'c1').status, 'in_progress');
    assert.equal(ops.readTask(db, 'c2').status, 'in_progress');
  } finally { cleanup(repo, db); }
});

test('runPlan: rerun resumes at the first unfinished wave after dependency convergence', async () => {
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

    const first = await parallelOrch.runPlan({
      db, repoRoot: repo, plan,
      runtimes: ['claude'],
      command: NODE, commandArgs: exitOk(40),
    });
    assert.equal(first.status, 'paused');
    assert.equal(first.paused_wave_id, 1);
    assert.equal(ops.readTask(db, 'w2').status, 'pending');
    let events = ops.subscribeEventsSince(db, 0).events;
    assert.equal(
      events.some((event) => event.type === 'session_spawned' && event.task_id === 'w2'),
      false,
    );

    ops.updateTaskStatus(db, 'w1', 'completed');
    const second = await parallelOrch.runPlan({
      db, repoRoot: repo, plan,
      runtimes: ['claude'],
      command: NODE, commandArgs: exitOk(40),
    });
    assert.equal(second.status, 'paused');
    assert.equal(second.paused_wave_id, 2);
    assert.equal(ops.readTask(db, 'w2').status, 'in_progress');

    events = ops.subscribeEventsSince(db, 0).events;
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

test('runPlan: task exits non-zero → session crashed and task is blocked for recovery', async () => {
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
    assert.equal(t.status, 'blocked', 'failed task requires explicit recovery');
    const { events } = ops.subscribeEventsSince(db, 0);
    const crashed = events.find((e) => e.type === 'session_crashed');
    assert.ok(crashed, 'session_crashed event expected');
    const failure = events.find((e) => e.type === 'task_failure');
    assert.ok(failure, 'task_failure event expected');
    assert.equal(failure.session_id, crashed.session_id);
  } finally { cleanup(repo, db); }
});

test('runPlan: worker spawn errors settle, block the task, and preserve failure evidence', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    seedTask(db, 'spawn-fail');
    const plan = buildPlan([{ id: 'spawn-fail', deps: [] }]);
    const result = await Promise.race([
      parallelOrch.runPlan({
        db, repoRoot: repo, plan,
        runtimes: ['claude'],
        command: missingExecutable(), commandArgs: [],
      }),
      new Promise((_, reject) => setTimeout(
        () => reject(new Error('runPlan hung after worker spawn error')),
        1000,
      )),
    ]);
    assert.equal(result.status, 'paused');
    assert.equal(ops.readTask(db, 'spawn-fail').status, 'blocked');
    const { events } = ops.subscribeEventsSince(db, 0);
    const failure = events.find((event) => event.type === 'task_failure');
    assert.ok(failure);
    assert.match(failure.payload.reason, /spawn|ENOENT/i);
  } finally { cleanup(repo, db); }
});

test('runPlan: a task missing from DB pauses the plan instead of fabricating completion', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    const result = await parallelOrch.runPlan({
      db,
      repoRoot: repo,
      plan: { waves: [{ id: 1, tasks: ['missing-task'], parallel: false }] },
      runtimes: ['claude'],
      command: NODE,
      commandArgs: exitOk(),
    });
    assert.equal(result.status, 'paused');
    assert.equal(result.paused_wave_id, 1);
    assert.deepEqual(result.awaiting_workflow_gates, [{
      id: 'missing-task',
      status: 'missing',
      stale: false,
    }]);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
    const { events } = ops.subscribeEventsSince(db, 0);
    assert.equal(events.some((event) => event.type === 'plan_completed'), false);
  } finally { cleanup(repo, db); }
});

test('runPlan: one task fails in wave while successful executions await workflow gates', async () => {
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
    assert.equal(ops.readTask(db, 'ok1').status, 'in_progress');
    assert.equal(ops.readTask(db, 'ok2').status, 'in_progress');
    assert.equal(ops.readTask(db, 'bad1').status, 'blocked');
  } finally { cleanup(repo, db); }
});

test('runPlan: emits wave_completed and plan_completed only after DB task convergence', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    seedTask(db, 'e1');
    seedTask(db, 'e2', [], ['e1']);
    const plan = buildPlan([
      { id: 'e1', deps: [] },
      { id: 'e2', deps: ['e1'] },
    ]);
    const running = parallelOrch.runPlan({
      db, repoRoot: repo, plan,
      runtimes: ['claude'],
      command: NODE, commandArgs: exitOk(150),
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(ops.readTask(db, 'e1').status, 'in_progress');
    ops.updateTaskStatus(db, 'e1', 'completed');
    await new Promise((resolve) => setTimeout(resolve, 170));
    assert.equal(ops.readTask(db, 'e2').status, 'in_progress');
    ops.updateTaskStatus(db, 'e2', 'completed');
    const result = await running;
    assert.equal(result.status, 'completed');
    const { events } = ops.subscribeEventsSince(db, 0);
    const waveStarts = events.filter((e) => e.type === 'wave_started');
    const waveCloses = events.filter((e) => e.type === 'wave_completed');
    const planCloses = events.filter((e) => e.type === 'plan_completed');
    assert.equal(waveStarts.length, 2);
    assert.equal(waveCloses.length, 2);
    assert.equal(planCloses.length, 1);
    assert.equal(events.filter((e) => e.type === 'plan_paused').length, 0);
  } finally { cleanup(repo, db); }
});
