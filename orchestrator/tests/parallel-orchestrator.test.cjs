'use strict';

// Phase 8B.2 — Parallel orchestrator: consumes current Change-scoped plan waves,
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
const planStore = require('../../mcp-server/lib/plan-store.cjs');
const contextSpine = require('../../mcp-server/lib/context-spine.cjs');
const stageCheckpoints = require('../../mcp-server/lib/stage-checkpoints.cjs');
const baselines = require('../../mcp-server/lib/baseline-workflow.cjs');
const artifactRegistry = require('../../mcp-server/lib/artifact-registry.cjs');
const taskLedger = require('../../mcp-server/lib/task-ledger.cjs');
const { buildPlan } = require('../planner/plan-builder.cjs');
const parallelOrch = require('../parallel-orchestrator.cjs');
const sessionRunner = require('../session-runner.cjs');

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
  return dir;
}

function mkDb(repoRoot) {
  const dbPath = path.join(repoRoot, '.ultra', '.runtime', 'state.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const { db } = initStateDb(dbPath);
  return db;
}

function writeLiveMigrationGate(repoRoot) {
  const gatePath = path.join(repoRoot, '.ultra', '.runtime', 'state-migration.lock');
  fs.writeFileSync(gatePath, `${JSON.stringify({
    version: 2,
    pid: process.pid,
    owner_started_at: null,
    token: `parallel-orchestrator-${process.pid}`,
  })}\n`, { mode: 0o600 });
  return gatePath;
}

function seedTask(db, id, files_modified = [], deps = []) {
  ops.createTask(db, {
    id, title: `task ${id}`, type: 'feature', priority: 'P2',
    complexity: 2, files_modified, deps,
    outcome: `${id} produces observable execution evidence.`,
    slice_kind: 'tracer_bullet',
    public_seam: `orchestrator:${id}`,
    verification_command: 'node --test orchestrator/tests/parallel-orchestrator.test.cjs',
    acceptance: [{
      id: `${id}-acceptance`,
      criterion: `${id} executes from an accepted Change Plan and Worker Packet.`,
      verification: 'node --test orchestrator/tests/parallel-orchestrator.test.cjs',
    }],
    context_refs: [{
      ref: 'seed.md',
      reason: 'Stable orchestrator fixture Context.',
      required: true,
      freshness_policy: 'existence',
    }],
    docs_impact: { status: 'none', files: [], rationale: 'No public documentation.' },
    ownership: { owner: 'test-owner', reviewers: [] },
    trace_to: 'seed.md#seed',
  });
}

function seedExecutableChangeTask(db, changeId, taskId, {
  contextRef = 'spec/mcp-tools.yaml',
} = {}) {
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
    context_refs: [{
      ref: contextRef,
      reason: 'Execution contract.',
      required: true,
      expected_digest: crypto.createHash('sha256').update('# MCP contract\n').digest('hex'),
      freshness_policy: 'digest',
    }],
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

function seedCompletedPlanWorkflow(db, repoRoot, plan, {
  implementationContexts = true,
} = {}) {
  const references = [...new Set(
    ops.listTasks(db, { change_id: plan.change_id })
      .flatMap((task) => (task.context_refs || []).map((item) => item.ref)),
  )];
  const createdTracked = [];
  for (const reference of references) {
    const referencePath = path.join(repoRoot, reference);
    if (fs.existsSync(referencePath)) continue;
    fs.mkdirSync(path.dirname(referencePath), { recursive: true });
    fs.writeFileSync(referencePath, '# MCP contract\n');
    if (!reference.startsWith('.ultra/')) createdTracked.push(reference);
  }
  if (createdTracked.length > 0) {
    execFileSync('git', ['add', ...createdTracked], { cwd: repoRoot });
    execFileSync('git', ['commit', '-q', '-m', 'add execution contract'], { cwd: repoRoot });
  }
  const checkout = baselines.gitWorktreeSnapshot(repoRoot, ['.']);
  const change = db.prepare('SELECT id, artifact_root FROM changes WHERE id = ?').get(plan.change_id);
  const contextRelativePath = path.join(
    change.artifact_root, 'contexts', 'plan-planning-test.json',
  );
  const contextAbsolutePath = path.join(repoRoot, contextRelativePath);
  fs.mkdirSync(path.dirname(contextAbsolutePath), { recursive: true });
  const contextManifest = {
    schema_version: '3.0',
    snapshot_id: `plan-context-${plan.change_id}`,
    role: 'plan',
    gate: 'planning',
    git: {
      head: checkout.head,
      worktree_digest: checkout.digest,
    },
    change: { id: plan.change_id },
    readiness: { status: 'ready', blockers: [], warnings: [] },
    context: { items: [] },
    resume: {
      task_id: null,
      change_state_digest: contextSpine.changeStateDigest(
        db.prepare('SELECT * FROM changes WHERE id = ?').get(plan.change_id),
      ),
    },
  };
  fs.writeFileSync(contextAbsolutePath, `${JSON.stringify(contextManifest, null, 2)}\n`);
  const contextDigest = crypto.createHash('sha256')
    .update(fs.readFileSync(contextAbsolutePath)).digest('hex');
  db.prepare(
    `INSERT INTO context_snapshots
     (id, change_id, task_id, manifest_path, manifest_hash, role, gate, readiness,
      blockers_json, context_json, token_estimate, token_budget)
     VALUES (?, ?, NULL, ?, ?, 'plan', 'planning', 'ready', '[]', ?, 0, 12000)`,
  ).run(
    contextManifest.snapshot_id,
    plan.change_id,
    contextRelativePath,
    contextDigest,
    JSON.stringify(contextManifest),
  );
  plan.context = {
    snapshot_id: contextManifest.snapshot_id,
    manifest_path: contextRelativePath,
    manifest_digest: contextDigest,
  };
  const planPaths = planStore.changePlanPaths(repoRoot, change);
  planStore.savePlanArtifact(plan, planPaths.json, 'json');
  planStore.savePlanArtifact(plan, planPaths.md, 'md', {
    tasks: ops.listTasks(db, { change_id: plan.change_id }),
  });
  for (const [id, kind, file] of [
    [`plan-json-${plan.change_id}`, 'execution_plan', planPaths.json],
    [`plan-md-${plan.change_id}`, 'execution_plan_markdown', planPaths.md],
  ]) {
    artifactRegistry.recordArtifact(db, {
      id,
      owner_type: 'change',
      owner_id: plan.change_id,
      kind,
      path: path.relative(repoRoot, file),
      source_refs: [
        { type: 'change', id: plan.change_id, relation: 'planned_for' },
        ...ops.listTasks(db, { change_id: plan.change_id }).map((task) => ({
          type: 'task',
          id: task.id,
          relation: 'compiled_from_task_contract',
        })),
      ],
      consumer_refs: [],
      metadata: { terminal_role: true },
      provenance: { writer: 'test-plan-fixture' },
    }, { rootDir: repoRoot });
  }
  if (implementationContexts) {
    for (const task of ops.listTasks(db, { change_id: plan.change_id })) {
      const snapshotId = `implementation-context-${plan.change_id}-${task.id}`;
      const relative = path.join(
        change.artifact_root,
        'contexts',
        `${snapshotId}.json`,
      );
      const absolute = path.join(repoRoot, relative);
      const items = (task.context_refs || []).map((item) => {
        const file = path.join(repoRoot, item.ref);
        const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
        return {
          ...item,
          kind: item.kind || 'source',
          role: 'implement',
          status: 'current',
          digest,
          estimated_tokens: 1,
        };
      });
      const manifest = {
        schema_version: '3.0',
        snapshot_id: snapshotId,
        role: 'implement',
        gate: 'implementation',
        change: { id: plan.change_id },
        git: {
          head: checkout.head,
          worktree_digest: checkout.digest,
        },
        readiness: { status: 'ready', blockers: [], warnings: [] },
        context: { items },
        execution_contract: {
          slice_kind: task.slice_kind,
          public_seam: task.public_seam,
          verification_command: task.verification_command,
          context_budget_percent: 40,
        },
        resume: {
          task_id: task.id,
          task_contract_digest: contextSpine.taskContractDigest(task),
          change_state_digest: contextSpine.changeStateDigest(
            db.prepare('SELECT * FROM changes WHERE id = ?').get(plan.change_id),
          ),
        },
      };
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, `${JSON.stringify(manifest, null, 2)}\n`);
      const digest = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
      db.prepare(
        `INSERT INTO context_snapshots
         (id, change_id, task_id, git_head, manifest_path, manifest_hash, role, gate,
          readiness, blockers_json, context_json, token_estimate, token_budget)
         VALUES (?, ?, ?, ?, ?, ?, 'implement', 'implementation', 'ready', '[]', ?, 0, 12000)`,
      ).run(
        snapshotId,
        plan.change_id,
        task.id,
        checkout.head,
        relative,
        digest,
        JSON.stringify(manifest),
      );
    }
  }
  const relativePath = path.relative(repoRoot, planPaths.json);
  const relativeMdPath = path.relative(repoRoot, planPaths.md);
  const digest = crypto.createHash('sha256').update(fs.readFileSync(planPaths.json)).digest('hex');
  const taskContractDigests = Object.fromEntries(
    ops.listTasks(db, { change_id: plan.change_id }).map((task) => [
      task.id,
      taskLedger.durableTask(task).digest,
    ]),
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
      plan_md_path: relativeMdPath,
      plan_context_path: contextRelativePath,
      plan_context_digest: contextDigest,
      plan_context_snapshot_id: contextManifest.snapshot_id,
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
    const outputs = definition.id === 'compile-context'
      ? [{ path: contextRelativePath, kind: 'context-manifest', digest: contextDigest }]
      : (definition.id === 'verify-plan'
        ? [{ path: relativePath, kind: 'execution-plan', digest }]
        : []);
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
  db.prepare(
    `INSERT INTO context_envelopes
     (id, stage, scope_type, scope_id, digest, file_digest, payload_json, artifact_path)
     VALUES (?, 'plan', 'change', ?, ?, ?, ?, ?)`,
  ).run(
    contextManifest.snapshot_id,
    plan.change_id,
    contextDigest,
    contextDigest,
    JSON.stringify(contextManifest),
    contextRelativePath,
  );
  const draft = stageCheckpoints.saveDraft(db, {
    stage: 'plan',
    scope: { change_id: plan.change_id },
    payload: {
      summary: `Accepted execution plan for ${plan.change_id}.`,
      plan: {
        task_contract_digests: taskContractDigests,
        context_envelope_id: contextManifest.snapshot_id,
        context_digest: contextDigest,
      },
    },
    evidence: [],
    diagnostics: [],
    context_envelope_id: contextManifest.snapshot_id,
    idempotency_key: `${workflowId}:checkpoint-draft`,
  });
  const checkpoint = stageCheckpoints.acceptDraft(db, {
    id: draft.id,
    idempotency_key: `${workflowId}:checkpoint-accept`,
  });
  return checkpoint.id;
}

let fixturePlanSequence = 0;

function authorizeUnscopedPlanFixture(db, repoRoot, plan) {
  parallelOrch._internal.validatePlanShape(plan);
  const taskIds = plan.waves.flatMap((wave) => wave.tasks);
  const missing = taskIds.filter((id) => !ops.readTask(db, id));
  if (missing.length > 0) return plan;
  fixturePlanSequence += 1;
  const changeId = `fixture-change-${fixturePlanSequence}`;
  db.prepare(
    `INSERT INTO changes (id, title, kind, status, intent, artifact_root)
     VALUES (?, ?, 'standard', 'active', ?, ?)`,
  ).run(
    changeId,
    `Authorized fixture ${fixturePlanSequence}`,
    'Exercise orchestrator mechanics through current v0.24 authority.',
    `.ultra/changes/active/${changeId}`,
  );
  const assign = db.prepare('UPDATE tasks SET change_id = ? WHERE id = ?');
  for (const taskId of taskIds) assign.run(changeId, taskId);
  const authorized = buildPlan(
    taskIds.map((id) => ops.readTask(db, id)),
    { changeId },
  );
  Object.keys(plan).forEach((key) => delete plan[key]);
  Object.assign(plan, authorized);
  seedCompletedPlanWorkflow(db, repoRoot, plan);
  return plan;
}

async function runPlan(options) {
  if (options.plan && !options.plan.change_id) {
    authorizeUnscopedPlanFixture(options.db, options.repoRoot, options.plan);
  }
  return parallelOrch.runPlan(options);
}

// ─── happy path ───────────────────────────────────────────────────────────

test('runPlan: successful execution leaves task in_progress for Ultra dev/test/review gates', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    seedTask(db, 't1');
    const plan = buildPlan([{ id: 't1', deps: [], complexity: 2 }]);
    await runPlan({
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

test('parallel wave reserves all tasks before start and observes all exits before settlement', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  const order = [];
  const originalSpawn = sessionRunner.spawnSession;
  const originalStart = sessionRunner.startSessionProcess;
  const originalClose = sessionRunner.closeSession;
  try {
    for (const id of ['ordered-a', 'ordered-b', 'ordered-c']) {
      seedTask(db, id, [`${id}.js`]);
    }
    const plan = buildPlan([
      { id: 'ordered-a', deps: [], files_modified: ['ordered-a.js'] },
      { id: 'ordered-b', deps: [], files_modified: ['ordered-b.js'] },
      { id: 'ordered-c', deps: [], files_modified: ['ordered-c.js'] },
    ]);
    sessionRunner.spawnSession = (options) => {
      const result = originalSpawn(options);
      order.push(`reserve:${options.task_id}`);
      return result;
    };
    sessionRunner.startSessionProcess = (options) => {
      order.push(`start:${options.sid}`);
      const proc = originalStart(options);
      proc.once('exit', () => order.push(`exit:${options.sid}`));
      return proc;
    };
    sessionRunner.closeSession = (...args) => {
      order.push(`settle:${args[0].sid}`);
      return originalClose(...args);
    };

    await runPlan({
      db,
      repoRoot: repo,
      plan,
      runtimes: ['claude'],
      command: NODE,
      commandArgs: exitOk(40),
    });

    const lastReserve = Math.max(...order.map((entry, index) => (
      entry.startsWith('reserve:') ? index : -1
    )));
    const firstStart = order.findIndex((entry) => entry.startsWith('start:'));
    const lastExit = Math.max(...order.map((entry, index) => (
      entry.startsWith('exit:') ? index : -1
    )));
    const firstSettle = order.findIndex((entry) => entry.startsWith('settle:'));
    assert.ok(lastReserve < firstStart, JSON.stringify(order));
    assert.ok(lastExit < firstSettle, JSON.stringify(order));
  } finally {
    sessionRunner.spawnSession = originalSpawn;
    sessionRunner.startSessionProcess = originalStart;
    sessionRunner.closeSession = originalClose;
    cleanup(repo, db);
  }
});

test('parallel wave command preparation failure leaves no leases, worktrees, or task mutations', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    for (const id of ['prepare-a', 'prepare-b', 'prepare-c']) {
      seedTask(db, id, [`${id}.js`]);
    }
    const plan = buildPlan([
      { id: 'prepare-a', deps: [], files_modified: ['prepare-a.js'] },
      { id: 'prepare-b', deps: [], files_modified: ['prepare-b.js'] },
      { id: 'prepare-c', deps: [], files_modified: ['prepare-c.js'] },
    ]);
    await assert.rejects(
      runPlan({
        db,
        repoRoot: repo,
        plan,
        runtimes: ['claude'],
        command: NODE,
        commandArgsFor(task) {
          if (task.id === 'prepare-b') throw new Error('injected argument failure');
          return exitOk();
        },
      }),
      /injected argument failure/,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE status = 'running'").get().count,
      0,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE status = 'in_progress'").get().count,
      0,
    );
    assert.equal(
      execFileSync('git', ['worktree', 'list', '--porcelain'], {
        cwd: repo,
        encoding: 'utf8',
      }).split(/\r?\n/).filter((line) => line.startsWith('worktree ')).length,
      1,
    );
  } finally {
    cleanup(repo, db);
  }
});

test('parallel wave reservation failure unwinds every earlier reservation', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  const originalSpawn = sessionRunner.spawnSession;
  let reservations = 0;
  try {
    for (const id of ['reserve-a', 'reserve-b', 'reserve-c']) {
      seedTask(db, id, [`${id}.js`]);
    }
    const plan = buildPlan([
      { id: 'reserve-a', deps: [], files_modified: ['reserve-a.js'] },
      { id: 'reserve-b', deps: [], files_modified: ['reserve-b.js'] },
      { id: 'reserve-c', deps: [], files_modified: ['reserve-c.js'] },
    ]);
    sessionRunner.spawnSession = (options) => {
      reservations += 1;
      if (reservations === 2) throw new Error('injected reservation failure');
      return originalSpawn(options);
    };

    await runPlan({
      db,
      repoRoot: repo,
      plan,
      runtimes: ['claude'],
      command: NODE,
      commandArgs: exitOk(),
    });

    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE status = 'running'").get().count,
      0,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE status = 'in_progress'").get().count,
      0,
    );
    assert.equal(
      db.prepare(
        "SELECT COUNT(*) AS count FROM worker_packets WHERE status = 'assigned'",
      ).get().count,
      0,
      'cancelled reservations must not leave a usable Worker Packet capability',
    );
    assert.equal(
      db.prepare(
        "SELECT COUNT(*) AS count FROM worker_packets WHERE status = 'abandoned'",
      ).get().count,
      1,
      'the cancelled packet remains as immutable audit evidence',
    );
    assert.equal(ops.readTask(db, 'reserve-a').status, 'pending');
    assert.equal(
      execFileSync('git', ['worktree', 'list', '--porcelain'], {
        cwd: repo,
        encoding: 'utf8',
      }).split(/\r?\n/).filter((line) => line.startsWith('worktree ')).length,
      1,
    );
  } finally {
    sessionRunner.spawnSession = originalSpawn;
    cleanup(repo, db);
  }
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
        runPlan({
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
      runPlan({
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
    const checkpointId = seedCompletedPlanWorkflow(db, repo, plan);
    const result = await runPlan({
      db, repoRoot: repo,
      runtimes: ['claude'],
      command: NODE, commandArgs: exitOk(),
    });
    assert.equal(result.status, 'paused');
    assert.equal(result.plan_checkpoint_id, checkpointId);
    assert.equal(ops.readTask(db, 'approved-task').status, 'in_progress');
  } finally { cleanup(repo, db); }
});

test('runPlan: compiles the exact implementation Context while reserving the Worker Packet', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    const plan = seedExecutableChangeTask(db, 'missing-implementation-context', 'missing-context-task');
    seedCompletedPlanWorkflow(db, repo, plan, { implementationContexts: false });
    const result = await runPlan({
      db, repoRoot: repo, plan,
      runtimes: ['claude'],
      command: NODE, commandArgs: exitOk(),
    });
    assert.equal(result.status, 'paused');
    assert.equal(result.results[0].status, 'completed');
    assert.equal(ops.readTask(db, 'missing-context-task').status, 'in_progress');
    assert.equal(db.prepare(
      `SELECT COUNT(*) AS count FROM worker_packets
       WHERE scope_type = 'task' AND scope_id = 'missing-context-task'`,
    ).get().count, 1);
  } finally { cleanup(repo, db); }
});

test('runPlan: rejects tracked checkout drift after Plan completion before task reservation', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    const plan = seedExecutableChangeTask(db, 'checkout-drift-change', 'checkout-drift-task');
    seedCompletedPlanWorkflow(db, repo, plan);
    fs.writeFileSync(path.join(repo, 'seed.md'), '# changed after planning\n');
    await assert.rejects(
      runPlan({
        db, repoRoot: repo, plan,
        runtimes: ['claude'],
        command: NODE, commandArgs: exitOk(),
      }),
      (error) => error.code === 'PLAN_STALE'
        && error.details?.blockers?.includes('CONTEXT_WORKTREE_STALE'),
    );
    assert.equal(ops.readTask(db, 'checkout-drift-task').status, 'pending');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
  } finally { cleanup(repo, db); }
});

test('runPlan: revalidates required task references from implementation Context before spawn', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    const plan = seedExecutableChangeTask(
      db,
      'implementation-ref-drift',
      'implementation-ref-task',
      { contextRef: '.ultra/specs/implementation-ref.md' },
    );
    seedCompletedPlanWorkflow(db, repo, plan);
    fs.writeFileSync(
      path.join(repo, '.ultra', 'specs', 'implementation-ref.md'),
      '# changed after implementation context compile\n',
    );
    const result = await runPlan({
      db, repoRoot: repo, plan,
      runtimes: ['claude'],
      command: NODE, commandArgs: exitOk(),
    });
    assert.equal(result.status, 'paused');
    assert.equal(result.results[0].status, 'authority_blocked');
    assert.equal(result.results[0].authority_code, 'CONTEXT_REQUIRED_REF_STALE');
    assert.equal(ops.readTask(db, 'implementation-ref-task').status, 'pending');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
  } finally { cleanup(repo, db); }
});

test('runPlan: rejects a completed plan when a newer planning context supersedes its binding', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    const plan = seedExecutableChangeTask(db, 'replanned-change', 'replanned-task');
    seedCompletedPlanWorkflow(db, repo, plan);
    const change = db.prepare('SELECT * FROM changes WHERE id = ?').get('replanned-change');
    const manifest = {
      schema_version: '3.0',
      snapshot_id: 'plan-context-replanned-change-newer',
      role: 'plan',
      gate: 'planning',
      change: { id: 'replanned-change' },
      readiness: { status: 'ready', blockers: [], warnings: [] },
      context: { items: [] },
      resume: {
        task_id: null,
        change_state_digest: contextSpine.changeStateDigest(change),
      },
    };
    const relative = path.join(change.artifact_root, 'contexts', 'plan-planning-newer.json');
    const absolute = path.join(repo, relative);
    fs.writeFileSync(absolute, `${JSON.stringify(manifest, null, 2)}\n`);
    const digest = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
    db.prepare(
      `INSERT INTO context_envelopes
       (id, stage, scope_type, scope_id, digest, file_digest, payload_json, artifact_path)
       VALUES (?, 'plan', 'change', ?, ?, ?, ?, ?)`,
    ).run(
      manifest.snapshot_id,
      change.id,
      digest,
      digest,
      JSON.stringify(manifest),
      relative,
    );
    const prior = stageCheckpoints.currentCheckpoint(
      db,
      'plan',
      { change_id: change.id },
      { includeDraft: false },
    );
    const newer = stageCheckpoints.saveDraft(db, {
      stage: 'plan',
      scope: { change_id: change.id },
      payload: prior.payload,
      evidence: [],
      diagnostics: [],
      context_envelope_id: manifest.snapshot_id,
      idempotency_key: 'replanned-change:newer-draft',
    });
    stageCheckpoints.acceptDraft(db, {
      id: newer.id,
      idempotency_key: 'replanned-change:newer-accept',
    });

    await assert.rejects(
      runPlan({
        db, repoRoot: repo, changeId: change.id,
        runtimes: ['claude'],
        command: NODE, commandArgs: exitOk(),
      }),
      (error) => error.code === 'PLAN_STALE'
        && error.details.authority_code === 'PLAN_CONTEXT_MISMATCH',
    );
    assert.equal(ops.readTask(db, 'replanned-task').status, 'pending');
  } finally { cleanup(repo, db); }
});

test('runPlan: rejects the retired legacy global plan path', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    seedTask(db, 'legacy-task');
    const legacyPlan = buildPlan([{ id: 'legacy-task', deps: [], complexity: 2 }]);
    fs.mkdirSync(path.join(repo, '.ultra'), { recursive: true });
    const legacyPath = path.join(repo, '.ultra', 'execution-plan.json');
    fs.writeFileSync(legacyPath, `${JSON.stringify(legacyPlan, null, 2)}\n`);

    await assert.rejects(
      runPlan({
        db, repoRoot: repo,
        runtimes: ['claude'],
        command: NODE, commandArgs: exitOk(),
      }),
      (error) => error.code === 'PLAN_NOT_FOUND',
    );
    assert.equal(ops.readTask(db, 'legacy-task').status, 'pending');

    await assert.rejects(
      runPlan({
        db, repoRoot: repo, planPath: legacyPath,
        runtimes: ['claude'],
        command: NODE, commandArgs: exitOk(),
      }),
      (error) => error.code === 'PLAN_LEGACY_RETIRED',
    );
    assert.equal(ops.readTask(db, 'legacy-task').status, 'pending');
  } finally { cleanup(repo, db); }
});

test('runPlan: requires a change id when more than one current scoped plan is executable', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    const first = seedExecutableChangeTask(db, 'first-change', 'first-task');
    const second = seedExecutableChangeTask(db, 'second-change', 'second-task');
    seedCompletedPlanWorkflow(db, repo, first);
    seedCompletedPlanWorkflow(db, repo, second);

    await assert.rejects(
      runPlan({
        db, repoRoot: repo,
        runtimes: ['claude'],
        command: NODE, commandArgs: exitOk(),
      }),
      (error) => error.code === 'PLAN_CHANGE_REQUIRED',
    );

    const result = await runPlan({
      db, repoRoot: repo, changeId: 'first-change',
      runtimes: ['claude'],
      command: NODE, commandArgs: exitOk(),
    });
    assert.equal(result.status, 'paused');
    assert.equal(ops.readTask(db, 'first-task').status, 'in_progress');
    assert.equal(ops.readTask(db, 'second-task').status, 'pending');
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
      runPlan({
        db, repoRoot: repo, plan,
        runtimes: ['claude'],
        command: NODE, commandArgs: exitOk(),
      }),
      (error) => error.code === 'PLAN_STALE'
        && error.details.authority_code === 'PLAN_TASK_CONTRACT_STALE',
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
    const { events } = ops.subscribeEventsSince(db, 0);
    assert.equal(events.some((event) => event.type === 'task_failure'), false);
    assert.equal(ops.readTask(db, 'stale-task').status, 'pending');
  } finally { cleanup(repo, db); }
});

test('runPlan: semantic Task drift after wave admission remains visible without denying execution', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    const plan = seedExecutableChangeTask(db, 'racing-change', 'racing-task');
    seedCompletedPlanWorkflow(db, repo, plan);

    const errors = [];
    const result = await runPlan({
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
    assert.equal(result.results[0].status, 'completed');
    assert.equal(ops.readTask(db, 'racing-task').status, 'in_progress');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 1);
    const { events } = ops.subscribeEventsSince(db, 0);
    assert.equal(events.some((event) => event.type === 'task_failure'), false);
    assert.equal(errors.length, 0);
  } finally { cleanup(repo, db); }
});

test('runPlan: reservation failure rolls back only its packet, Context, session, and worktree', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    const plan = seedExecutableChangeTask(
      db,
      'reservation-rollback-change',
      'reservation-rollback-task',
    );
    seedCompletedPlanWorkflow(db, repo, plan);
    const unrelated = ops.appendEvent(db, {
      type: 'unrelated_reservation_evidence',
      payload: { preserved: true },
    });
    const before = {
      packets: db.prepare('SELECT COUNT(*) AS count FROM worker_packets').get().count,
      contexts: db.prepare('SELECT COUNT(*) AS count FROM context_envelopes').get().count,
      sessions: db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count,
    };
    db.exec(
      `CREATE TRIGGER fail_reservation_task_start
       BEFORE INSERT ON events
       WHEN NEW.type = 'task_started'
       BEGIN
         SELECT RAISE(ABORT, 'injected reservation failure');
       END`,
    );

    const result = await runPlan({
      db,
      repoRoot: repo,
      plan,
      runtimes: ['claude'],
      command: NODE,
      commandArgs: exitOk(),
    });

    assert.equal(result.status, 'paused');
    assert.equal(result.results[0].status, 'spawn_failed');
    assert.deepEqual({
      packets: db.prepare('SELECT COUNT(*) AS count FROM worker_packets').get().count,
      contexts: db.prepare('SELECT COUNT(*) AS count FROM context_envelopes').get().count,
      sessions: db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count,
    }, before);
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM events WHERE id = ?').get(unrelated.event_id).count,
      1,
    );
    const packetDir = path.join(repo, '.ultra', '.runtime', 'worker-packets');
    assert.deepEqual(fs.existsSync(packetDir) ? fs.readdirSync(packetDir) : [], []);
    const worktreeDir = path.join(repo, '.ultra', '.runtime', 'worktrees');
    assert.deepEqual(fs.existsSync(worktreeDir) ? fs.readdirSync(worktreeDir) : [], []);
  } finally { cleanup(repo, db); }
});

test('runPlan treats a public session lease as retryable authority, not a task failure', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  let publicSession;
  try {
    seedTask(db, 'public-lease-task');
    const plan = buildPlan([
      { id: 'public-lease-task', deps: [], complexity: 1, files_modified: ['lease.js'] },
    ]);
    publicSession = sessionRunner.spawnSession({
      db,
      repoRoot: repo,
      task_id: 'public-lease-task',
      runtime: 'codex',
    });

    const errors = [];
    const result = await runPlan({
      db,
      repoRoot: repo,
      plan,
      runtimes: ['claude'],
      command: NODE,
      commandArgs: exitOk(),
      onError: (error) => errors.push(error),
    });

    assert.equal(result.status, 'paused');
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].status, 'authority_blocked');
    assert.equal(result.results[0].retryable, true);
    assert.equal(result.results[0].authority_code, 'ADMISSION_DENIED');
    assert.equal(ops.readTask(db, 'public-lease-task').status, 'pending');
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE status = 'running'").get().count,
      1,
    );
    assert.equal(
      db.prepare(
        "SELECT COUNT(*) AS count FROM events WHERE type = 'task_failure' AND task_id = 'public-lease-task'",
      ).get().count,
      0,
    );
    assert.equal(
      db.prepare(
        "SELECT COUNT(*) AS count FROM circuit_breaker WHERE task_id = 'public-lease-task'",
      ).get().count,
      0,
    );
    assert.deepEqual(errors, []);
  } finally {
    if (publicSession && ops.readSession(db, publicSession.sid)?.status === 'running') {
      sessionRunner.closeSession(
        { db, repoRoot: repo, sid: publicSession.sid },
        { status: 'crashed', remove_worktree: true },
      );
    }
    cleanup(repo, db);
  }
});

test('runPlan unwraps a real migration quiescence gate without counting a worker failure', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    seedTask(db, 'wrapped-quiescence');
    const plan = buildPlan([
      {
        id: 'wrapped-quiescence',
        deps: [],
        complexity: 1,
        files_modified: ['quiescence.js'],
      },
    ]);
    writeLiveMigrationGate(repo);

    let wrapped;
    try {
      sessionRunner.spawnSession({
        db,
        repoRoot: repo,
        task_id: 'wrapped-quiescence',
        runtime: 'codex',
      });
    } catch (error) {
      wrapped = error;
    }
    assert.equal(wrapped?.code, 'WORKTREE_AUTHORITY_NOT_IGNORED');
    assert.equal(wrapped?.cause?.code, 'RUNTIME_STATE_NOT_QUIESCENT');

    const errors = [];
    const result = await runPlan({
      db,
      repoRoot: repo,
      plan,
      runtimes: ['claude'],
      command: NODE,
      commandArgs: exitOk(),
      onError: (error) => errors.push(error),
    });

    assert.equal(result.status, 'paused');
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].status, 'authority_blocked');
    assert.equal(result.results[0].retryable, true);
    assert.equal(result.results[0].authority_code, 'RUNTIME_STATE_NOT_QUIESCENT');
    assert.equal(ops.readTask(db, 'wrapped-quiescence').status, 'pending');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
    assert.equal(
      db.prepare(
        "SELECT COUNT(*) AS count FROM events WHERE type = 'task_failure' AND task_id = 'wrapped-quiescence'",
      ).get().count,
      0,
    );
    assert.equal(
      db.prepare(
        "SELECT COUNT(*) AS count FROM circuit_breaker WHERE task_id = 'wrapped-quiescence'",
      ).get().count,
      0,
    );
    assert.deepEqual(errors, []);
  } finally { cleanup(repo, db); }
});

test('parallel deferred-start authority gates unwind leases without task failure state', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  const originalStart = sessionRunner.startSessionProcess;
  let gateWritten = false;
  try {
    for (const id of ['deferred-gate-a', 'deferred-gate-b']) {
      seedTask(db, id, [`${id}.js`]);
    }
    const plan = buildPlan([
      {
        id: 'deferred-gate-a',
        deps: [],
        complexity: 1,
        files_modified: ['deferred-gate-a.js'],
      },
      {
        id: 'deferred-gate-b',
        deps: [],
        complexity: 1,
        files_modified: ['deferred-gate-b.js'],
      },
    ]);
    assert.equal(plan.waves[0].parallel, true);
    sessionRunner.startSessionProcess = (options) => {
      if (!gateWritten) {
        writeLiveMigrationGate(repo);
        gateWritten = true;
      }
      return originalStart(options);
    };

    const errors = [];
    const result = await runPlan({
      db,
      repoRoot: repo,
      plan,
      runtimes: ['claude'],
      command: NODE,
      commandArgs: exitOk(),
      onError: (error) => errors.push(error),
    });

    assert.equal(result.status, 'paused');
    assert.equal(result.results.length, 2);
    for (const execution of result.results) {
      assert.equal(execution.status, 'authority_blocked');
      assert.equal(execution.retryable, true);
      assert.equal(execution.authority_code, 'RUNTIME_STATE_NOT_QUIESCENT');
    }
    for (const id of ['deferred-gate-a', 'deferred-gate-b']) {
      assert.equal(ops.readTask(db, id).status, 'pending');
      assert.equal(
        db.prepare(
          "SELECT COUNT(*) AS count FROM events WHERE type = 'task_failure' AND task_id = ?",
        ).get(id).count,
        0,
      );
      assert.equal(
        db.prepare(
          'SELECT COUNT(*) AS count FROM circuit_breaker WHERE task_id = ?',
        ).get(id).count,
        0,
      );
    }
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE status = 'running'").get().count,
      0,
    );
    assert.deepEqual(errors, []);
  } finally {
    sessionRunner.startSessionProcess = originalStart;
    cleanup(repo, db);
  }
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

    const first = await runPlan({
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

    await runPlan({
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

    const first = await runPlan({
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
    const second = await runPlan({
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
    await runPlan({
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
      runPlan({
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

test('runPlan: rejects an unscoped plan before it can fabricate a missing task', async () => {
  const repo = mkRepo();
  const db = mkDb(repo);
  try {
    await assert.rejects(
      runPlan({
        db,
        repoRoot: repo,
        plan: { waves: [{ id: 1, tasks: ['missing-task'], parallel: false }] },
        runtimes: ['claude'],
        command: NODE,
        commandArgs: exitOk(),
      }),
      (error) => error.code === 'PLAN_CHANGE_SCOPED_REQUIRED',
    );
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
    await runPlan({
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
    const running = runPlan({
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
