'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const childProcess = require('node:child_process');
const Database = require('better-sqlite3');

const { initStateDb, closeStateDb } = require('./state-db.cjs');
const ops = require('./state-ops.cjs');
const runtime = require('./runtime-state.cjs');
const doctor = require('./doctor.cjs');
const baselines = require('./baseline-workflow.cjs');
const changes = require('./change-workflow.cjs');
const archiveJournal = require('./archive-journal.cjs');
const workflows = require('./workflow-state.cjs');
const { researchCoverage } = require('../test-support/semantic-records.cjs');
const decisions = require('./decision-dialogue.cjs');
const artifactRegistry = require('./artifact-registry.cjs');
const planStore = require('./plan-store.cjs');
const taskLedger = require('./task-ledger.cjs');
const recovery = require('../../orchestrator/recovery.cjs');
const closeJournal = require('../../orchestrator/session-close-journal.cjs');
const { seedReadyBaseline } = require('../test-support/ready-baseline.cjs');

function fixture({ baseline = true } = {}) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-doctor-'));
  const { db } = initStateDb(
    path.join(rootDir, '.ultra', '.runtime', 'state.db'),
  );
  if (baseline) {
    seedReadyBaseline(db, { rootDir });
  }
  return { rootDir, db };
}

function cleanup({ rootDir, db }) {
  closeStateDb(db);
  fs.rmSync(rootDir, { recursive: true, force: true });
}

test('doctor reports structured health for an initialized Ultra project', async () => {
  const fx = fixture();
  try {
    const report = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir });
    assert.equal(report.status, 'healthy');
    assert.equal(report.repair_performed, false);
    assert.equal(report.checks.state_db.status, 'pass');
    assert.equal(report.checks.task_ledger.status, 'warning');
    assert.equal(report.checks.task_ledger.condition, 'missing');
    assert.equal(report.checks.external_providers.ownership, 'external');
  } finally {
    cleanup(fx);
  }
});

test('doctor reports current, drifted, and invalid team checkpoint states without semantic repair', async () => {
  const fx = fixture();
  try {
    taskLedger.publishTaskLedger(fx.db, {
      rootDir: fx.rootDir,
      reason: 'baseline_converged',
    });
    const current = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir });
    assert.equal(current.checks.task_ledger.status, 'pass');
    assert.equal(current.checks.task_ledger.condition, 'current');

    fx.db.prepare(
      "UPDATE baselines SET project_type = 'locally-drifted' WHERE status = 'ready'",
    ).run();
    const drifted = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir });
    assert.equal(drifted.checks.task_ledger.status, 'warning');
    assert.equal(drifted.checks.task_ledger.condition, 'drifted');

    const ledgerPath = taskLedger.ledgerPath(fx.rootDir);
    fs.writeFileSync(ledgerPath, '{"kind":"ultra-team-task-ledger"}\n');
    const invalid = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir });
    assert.equal(invalid.status, 'degraded');
    assert.equal(invalid.checks.task_ledger.status, 'fail');
    assert.equal(invalid.checks.task_ledger.condition, 'invalid');
    assert.equal(invalid.checks.task_ledger.code, 'TASK_LEDGER_INVALID');
    assert.equal(
      fs.readFileSync(ledgerPath, 'utf8'),
      '{"kind":"ultra-team-task-ledger"}\n',
      'read-only doctor must never regenerate semantic team authority',
    );
  } finally {
    cleanup(fx);
  }
});

test('doctor reports every artifact registry integrity class and exempts runtime scratch projections', async () => {
  const fx = fixture();
  try {
    const write = (relative, contents = '# artifact\n') => {
      const file = path.join(fx.rootDir, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, contents);
      return file;
    };
    const recordTerminal = (id, relative, kind) => artifactRegistry.recordArtifact(fx.db, {
      id,
      owner_type: 'project',
      owner_id: 'project',
      kind,
      path: relative,
      status: 'terminal',
      provenance: { actor: 'test' },
      source_refs: [],
      consumer_refs: [],
    }, { rootDir: fx.rootDir });

    write('.ultra/specs/stale.md', '# before\n');
    recordTerminal('artifact-stale', '.ultra/specs/stale.md', 'spec');
    write('.ultra/specs/stale.md', '# after\n');

    write('.ultra/specs/missing.md');
    recordTerminal('artifact-missing', '.ultra/specs/missing.md', 'spec');
    fs.rmSync(path.join(fx.rootDir, '.ultra/specs/missing.md'));

    write('.ultra/specs/no-consumer.md');
    artifactRegistry.recordArtifact(fx.db, {
      id: 'artifact-no-consumer',
      owner_type: 'project',
      owner_id: 'project',
      kind: 'spec',
      path: '.ultra/specs/no-consumer.md',
      provenance: { actor: 'test' },
      source_refs: [],
      consumer_refs: [],
    }, { rootDir: fx.rootDir });

    write('.ultra/specs/owner-missing.md');
    fx.db.prepare(
      `INSERT INTO artifacts
       (id, owner_type, owner_id, kind, path, digest, content_hash, after_digest,
        status, provenance_json, managed)
       VALUES ('artifact-owner-missing', 'task', 'missing-task', 'spec',
               '.ultra/specs/owner-missing.md', ?, ?, ?, 'terminal', '{}', 1)`,
    ).run(...Array(3).fill(
      artifactRegistry.digestFile(path.join(fx.rootDir, '.ultra/specs/owner-missing.md')),
    ));

    write('.ultra/specs/duplicate.md');
    fx.db.exec('DROP INDEX IF EXISTS artifacts_one_active_path');
    const duplicateDigest = artifactRegistry.digestFile(
      path.join(fx.rootDir, '.ultra/specs/duplicate.md'),
    );
    const insertDuplicate = fx.db.prepare(
      `INSERT INTO artifacts
       (id, owner_type, owner_id, kind, path, digest, content_hash, after_digest,
        status, provenance_json, managed)
       VALUES (?, 'project', 'project', ?, '.ultra/specs/duplicate.md',
               ?, ?, ?, 'terminal', '{}', 1)`,
    );
    insertDuplicate.run(
      'artifact-duplicate-a', 'spec-a', duplicateDigest, duplicateDigest, duplicateDigest,
    );
    insertDuplicate.run(
      'artifact-duplicate-b', 'spec-b', duplicateDigest, duplicateDigest, duplicateDigest,
    );

    fx.db.prepare(
      `INSERT INTO artifact_edges
       (source_type, source_id, target_type, target_id, relation)
       VALUES ('artifact', 'artifact-no-consumer', 'task', 'missing-edge-task', 'consumed_by')`,
    ).run();

    write('.ultra/specs/unregistered.md');
    write('.ultra/.runtime/debug/local.md');
    write('.ultra/scratch/local.md');
    write(
      '.ultra/tasks/contexts/task-generated.md',
      '---\ntask_id: missing\ngenerated_by: ultra-projector\n---\n',
    );
    write('.ultra/tasks/tasks.json', '{}\n');

    const report = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir });
    assert.equal(report.status, 'degraded');
    assert.equal(report.checks.artifacts.status, 'fail');
    const codes = new Set(report.checks.artifacts.issues.map((issue) => issue.code));
    for (const code of [
      'ARTIFACT_UNREGISTERED',
      'ARTIFACT_MISSING',
      'ARTIFACT_STALE',
      'ARTIFACT_OWNER_MISSING',
      'ARTIFACT_NO_CONSUMER',
      'ARTIFACT_EDGE_DANGLING',
      'ARTIFACT_DUPLICATE_AUTHORITY',
      'ARTIFACT_GHOST_PROJECTION',
    ]) {
      assert.ok(codes.has(code), `missing artifact issue ${code}`);
    }
    const issuePaths = report.checks.artifacts.issues
      .map((issue) => issue.path)
      .filter(Boolean);
    assert.ok(issuePaths.includes('.ultra/specs/unregistered.md'));
    assert.ok(!issuePaths.includes('.ultra/.runtime/debug/local.md'));
    assert.ok(!issuePaths.includes('.ultra/scratch/local.md'));
    assert.ok(issuePaths.includes('.ultra/tasks/contexts/task-generated.md'));
    assert.ok(!issuePaths.includes('.ultra/tasks/tasks.json'));
  } finally {
    cleanup(fx);
  }
});

test('doctor rejects isolated artifact cycles and exposes unmanaged compatibility authority', async () => {
  const fx = fixture();
  try {
    const insert = fx.db.prepare(
      `INSERT INTO artifacts
       (id, owner_type, owner_id, kind, path, digest, content_hash, after_digest,
        status, provenance_json, managed)
       VALUES (?, 'project', 'project', ?, ?, ?, ?, ?, ?, '{}', ?)`,
    );
    for (const [id, kind, relative, status, managed] of [
      ['cycle-a', 'cycle-a', '.ultra/specs/doctor-cycle-a.md', 'current', 1],
      ['cycle-b', 'cycle-b', '.ultra/specs/doctor-cycle-b.md', 'current', 1],
      ['legacy-row', 'legacy', '.ultra/specs/doctor-legacy.md', 'terminal', 0],
    ]) {
      const file = path.join(fx.rootDir, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `# ${id}\n`);
      const digest = artifactRegistry.digestFile(file);
      insert.run(id, kind, relative, digest, digest, digest, status, managed);
    }
    const edge = fx.db.prepare(
      `INSERT INTO artifact_edges
       (source_type, source_id, target_type, target_id, relation)
       VALUES ('artifact', ?, 'artifact', ?, 'feeds')`,
    );
    edge.run('cycle-a', 'cycle-b');
    edge.run('cycle-b', 'cycle-a');

    const report = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir });
    const codes = new Set(report.checks.artifacts.issues.map((issue) => issue.code));
    assert.equal(report.status, 'degraded');
    assert.equal(report.checks.artifacts.managed, 2);
    assert.equal(report.checks.artifacts.unmanaged, 1);
    assert.ok(codes.has('ARTIFACT_GRAPH_CYCLE'));
    assert.ok(codes.has('ARTIFACT_NO_CONSUMER'));
    assert.ok(codes.has('ARTIFACT_COMPATIBILITY_UNMANAGED'));
  } finally {
    cleanup(fx);
  }
});

test('doctor reports incomplete brownfield adoption as advisory rather than authority failure', async () => {
  const fx = fixture({ baseline: false });
  try {
    baselines.startBaseline(fx.db, {
      id: 'adoption', project_name: 'legacy', mode: 'brownfield', scope: ['.'],
    }, { rootDir: fx.rootDir, emitEvent: false });
    const report = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir });
    assert.equal(report.status, 'healthy');
    assert.equal(report.checks.baseline.status, 'warning');
    assert.equal(report.checks.baseline.mode, 'brownfield');
    assert.deepEqual(report.checks.baseline.gaps, {
      total: 0, open: 0, blocking: 0, by_category: {},
    });
    assert.ok(report.checks.baseline.blockers.includes('BASELINE_NOT_READY:adopting'));
  } finally {
    cleanup(fx);
  }
});

test('doctor exempts only reserved baseline scaffolds before baseline readiness', async () => {
  const fx = fixture({ baseline: false });
  try {
    baselines.startBaseline(fx.db, {
      id: 'draft', project_name: 'new-project', mode: 'greenfield', scope: ['.'],
    }, { rootDir: fx.rootDir, emitEvent: false });
    for (const [relative, contents] of [
      ['.ultra/specs/discovery.md', '# Discovery Evidence\n'],
      ['.ultra/specs/orphan.md', '# Unowned specification\n'],
    ]) {
      const file = path.join(fx.rootDir, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, contents);
    }

    const report = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir });
    const unregistered = report.checks.artifacts.issues
      .filter((issue) => issue.code === 'ARTIFACT_UNREGISTERED')
      .map((issue) => issue.path);

    assert.equal(report.status, 'degraded');
    assert.deepEqual(unregistered, ['.ultra/specs/orphan.md']);
  } finally {
    cleanup(fx);
  }
});

test('doctor degrades when a ready baseline loses immutable research authority', async () => {
  const fx = fixture();
  try {
    fx.db.prepare(
      `UPDATE workflow_steps SET outputs_json = ?, updated_at = ?
       WHERE run_id = 'test-baseline-research' AND step_id = '00-problem-validation'`,
    ).run(JSON.stringify([{
      path: '.ultra/docs/research/test-baseline-research/00-problem-validation.md',
      kind: 'research-step-report', digest: '0'.repeat(64),
    }]), new Date().toISOString());
    const report = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir });
    assert.equal(report.status, 'degraded');
    assert.equal(report.checks.baseline.status, 'fail');
    assert.ok(report.checks.baseline.blockers.some((item) => item.startsWith(
      'BASELINE_RESEARCH_WORKFLOW_OUTPUT_STALE:',
    )));
  } finally {
    cleanup(fx);
  }
});

test('doctor exposes blocked workflow recovery without treating an expected pause as database corruption', async () => {
  const fx = fixture({ baseline: false });
  try {
    const baseline = baselines.startBaseline(fx.db, {
      id: 'adoption', project_name: 'legacy', mode: 'brownfield', scope: ['.'],
    }, { rootDir: fx.rootDir, emitEvent: false });
    const run = workflows.startWorkflow(fx.db, {
      id: 'research-adoption', kind: 'research', mode: 'adoption',
      baseline_id: baseline.id, subject: 'Establish current system evidence.',
      coverage: researchCoverage(),
      metadata: { selection_reason: 'The owner accepted the applicable adoption evidence areas.' },
    }, { rootDir: fx.rootDir });
    workflows.recordWorkflowStep(fx.db, {
      id: run.id, step_id: '00-problem-validation', status: 'blocked',
      blockers: ['OWNER_EVIDENCE_REQUIRED'],
    }, { rootDir: fx.rootDir });
    runtime.ensureProjectionJob(fx.db, { tool_name: 'workflow.step' });
    runtime.processProjectionJobs(fx.db, {
      rootDir: fx.rootDir,
      project: () => ({ projected: true }),
    });

    const report = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir });
    assert.equal(report.status, 'healthy');
    assert.equal(report.checks.workflows.status, 'warning');
    assert.equal(report.checks.workflows.blocked, 1);
  } finally {
    cleanup(fx);
  }
});

test('doctor reports an awaiting owner decision as recoverable workflow state', async () => {
  const fx = fixture();
  try {
    decisions.startDecisionThread(fx.db, {
      id: 'doctor-decision', baseline_id: 'test-baseline',
      purpose: 'Wait for one owner decision.', mode: 'guided',
    });
    decisions.openDecision(fx.db, {
      id: 'doctor-api', thread_id: 'doctor-decision', phase: 'research',
      question: 'Should the public API remain compatible?',
      why_now: 'The answer changes the research synthesis.',
      recommendation: 'Preserve compatibility until consumers migrate.',
      effects: { summary: 'Changes product and architecture specifications.' },
    });
    runtime.ensureProjectionJob(fx.db, { tool_name: 'decision.open' });
    runtime.processProjectionJobs(fx.db, {
      rootDir: fx.rootDir,
      project: () => ({ projected: true }),
    });
    const report = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir });
    assert.equal(report.status, 'healthy');
    assert.equal(report.checks.decisions.status, 'warning');
    assert.equal(report.checks.decisions.awaiting_owner, 1);
    assert.equal(report.checks.decisions.current.id, 'doctor-api');
  } finally {
    cleanup(fx);
  }
});

test('doctor repair is backup-first and drains projection/spec-event recovery work', async () => {
  const fx = fixture();
  try {
    ops.createTask(fx.db, {
      id: 'stale-target', title: 'Refresh context', type: 'feature', priority: 'P1',
      trace_to: '.ultra/specs/product.md#continuous-change',
    });
    ops.appendEvent(fx.db, {
      type: 'spec_changed',
      payload: { sections: ['.ultra/specs/product.md#continuous-change'] },
    });
    runtime.enqueueProjection(fx.db, { tool_name: 'task.append_event', event_cursor: 2 });

    const report = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir, repair: true });
    assert.equal(report.repair_performed, true);
    assert.ok(fs.existsSync(report.backup_path));
    assert.equal(ops.readTask(fx.db, 'stale-target').stale, true);
    assert.equal(runtime.readConsumerCursor(fx.db, 'spec-staleness'), 2);
    assert.equal(runtime.listProjectionJobs(fx.db, { status: 'pending' }).length, 0);
    assert.equal(report.status, 'healthy');
  } finally {
    cleanup(fx);
  }
});

test('doctor backup fails closed when the verified backup directory is swapped before worker start', async () => {
  const fx = fixture();
  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-doctor-backup-external-'));
  let movedBackupDir = null;
  try {
    await assert.rejects(
      doctor.runDoctor(fx.db, {
        rootDir: fx.rootDir,
        repair: true,
        _beforeBackupWorker({ backupDir }) {
          movedBackupDir = `${backupDir}.moved`;
          fs.renameSync(backupDir, movedBackupDir);
          fs.symlinkSync(externalRoot, backupDir);
        },
      }),
      (error) => error.code === 'BACKUP_FAILED',
    );
    assert.deepEqual(fs.readdirSync(externalRoot), []);
    assert.ok(movedBackupDir && fs.statSync(movedBackupDir).isDirectory());
    assert.deepEqual(fs.readdirSync(movedBackupDir), []);
  } finally {
    cleanup(fx);
    fs.rmSync(externalRoot, { recursive: true, force: true });
  }
});

test('doctor rejects a malformed backup-worker success protocol without publishing authority', async () => {
  const fx = fixture();
  const originalSpawnSync = childProcess.spawnSync;
  try {
    childProcess.spawnSync = () => ({
      status: 0,
      stdout: '{"ok":true,"result":{"output_name":"forged.db"}}\n',
      stderr: '',
    });
    await assert.rejects(
      doctor.runDoctor(fx.db, {
        rootDir: fx.rootDir,
        repair: true,
      }),
      (error) => error.code === 'BACKUP_FAILED',
    );
    const backupDir = path.join(fx.rootDir, '.ultra', '.runtime', 'backups');
    assert.deepEqual(fs.readdirSync(backupDir), []);
  } finally {
    childProcess.spawnSync = originalSpawnSync;
    cleanup(fx);
  }
});

test('doctor publishes a verified SQLite backup that restores the exact pre-repair state', async () => {
  const fx = fixture();
  const restoredPath = path.join(fx.rootDir, 'restored-doctor-state.db');
  try {
    ops.createTask(fx.db, {
      id: 'backup-restore-task',
      title: 'Restore Doctor backup',
      type: 'feature',
      priority: 'P1',
      trace_to: '.ultra/specs/product.md#backup-restore',
    });
    ops.appendEvent(fx.db, {
      type: 'spec_changed',
      payload: { sections: ['.ultra/specs/product.md#backup-restore'] },
    });

    const report = await doctor.runDoctor(fx.db, {
      rootDir: fx.rootDir,
      repair: true,
    });
    fs.copyFileSync(report.backup_path, restoredPath, fs.constants.COPYFILE_EXCL);
    const restored = new Database(restoredPath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      assert.equal(restored.pragma('quick_check', { simple: true }), 'ok');
      const task = restored.prepare(
        'SELECT id, stale FROM tasks WHERE id = ?',
      ).get('backup-restore-task');
      assert.deepEqual(task, { id: 'backup-restore-task', stale: 0 });
      assert.equal(
        restored.prepare(
          "SELECT COUNT(*) AS count FROM events WHERE type = 'spec_changed'",
        ).get().count,
        1,
      );
    } finally {
      restored.close();
    }
    assert.equal(ops.readTask(fx.db, 'backup-restore-task').stale, true);
  } finally {
    cleanup(fx);
  }
});

test('doctor repair passes the project root to close-intent recovery', async () => {
  const fx = fixture();
  const originalRecoverOnBoot = recovery.recoverOnBoot;
  let receivedOptions = null;
  try {
    recovery.recoverOnBoot = (db, options) => {
      assert.equal(db, fx.db);
      receivedOptions = options;
      return {
        recovered: [],
        count: 0,
        closed: [],
        close_pending: [],
      };
    };
    await doctor.runDoctor(fx.db, { rootDir: fx.rootDir, repair: true });
    assert.deepEqual(receivedOptions, { repoRoot: fx.rootDir });
  } finally {
    recovery.recoverOnBoot = originalRecoverOnBoot;
    cleanup(fx);
  }
});

test('doctor reports durable close intents and cannot claim healthy while one is pending', async () => {
  const fx = fixture();
  try {
    ops.createTask(fx.db, {
      id: 'doctor-close-live',
      title: 'Keep live close intent visible',
      type: 'feature',
      priority: 'P1',
    });
    ops.createSession(fx.db, {
      sid: 'doctor-close-live-session',
      task_id: 'doctor-close-live',
      runtime: 'codex',
      pid: process.pid,
      worktree_path: path.join(fx.rootDir, '.ultra', '.runtime', 'worktrees', 'doctor-close-live-session'),
      artifact_dir: path.join(fx.rootDir, '.ultra', '.runtime', 'sessions', 'doctor-close-live-session'),
    });
    closeJournal.prepare(fx.rootDir, {
      sid: 'doctor-close-live-session',
      task_id: 'doctor-close-live',
      requested_status: 'completed',
      worktree_path: path.join(fx.rootDir, '.ultra', '.runtime', 'worktrees', 'doctor-close-live-session'),
    });

    const report = doctor.inspectSystem(fx.db, { rootDir: fx.rootDir });

    assert.equal(report.status, 'degraded');
    assert.equal(report.checks.sessions.status, 'fail');
    assert.equal(report.checks.sessions.close_pending, 1);
    assert.equal(report.checks.sessions.close_intents[0].code, 'SESSION_CLOSE_PENDING');
    assert.equal(report.checks.sessions.close_intents[0].reason, 'worker_still_alive');
  } finally {
    cleanup(fx);
  }
});

test('doctor runs close-intent recovery first and defers conflicting repairs idempotently', async () => {
  const fx = fixture();
  const originalPlanRecovery = planStore.recoverPlanPublications;
  const originalArchiveRecovery = changes.recoverInterruptedArchives;
  const originalWorkflowRecovery = workflows.recoverUntrackedChangeWorkflows;
  const calls = [];
  try {
    ops.createTask(fx.db, {
      id: 'doctor-close-order',
      title: 'Order close recovery before other repair',
      type: 'feature',
      priority: 'P1',
    });
    ops.createSession(fx.db, {
      sid: 'doctor-close-order-session',
      task_id: 'doctor-close-order',
      runtime: 'codex',
      pid: process.pid,
      worktree_path: path.join(fx.rootDir, '.ultra', '.runtime', 'worktrees', 'doctor-close-order-session'),
      artifact_dir: path.join(fx.rootDir, '.ultra', '.runtime', 'sessions', 'doctor-close-order-session'),
    });
    closeJournal.prepare(fx.rootDir, {
      sid: 'doctor-close-order-session',
      task_id: 'doctor-close-order',
      requested_status: 'completed',
      worktree_path: path.join(fx.rootDir, '.ultra', '.runtime', 'worktrees', 'doctor-close-order-session'),
    });
    planStore.recoverPlanPublications = () => {
      calls.push('plan');
      return { recovered: 0, finalized: 0, pending: 0, issues: [] };
    };
    changes.recoverInterruptedArchives = () => {
      calls.push('archive');
      return { recovered: 0, issues: [] };
    };
    workflows.recoverUntrackedChangeWorkflows = () => {
      calls.push('workflow');
      return { recovered: 0, issues: [] };
    };

    const first = await doctor.runDoctor(fx.db, {
      rootDir: fx.rootDir,
      repair: true,
    });
    const second = await doctor.runDoctor(fx.db, {
      rootDir: fx.rootDir,
      repair: true,
    });

    assert.deepEqual(calls, []);
    for (const report of [first, second]) {
      assert.equal(report.status, 'degraded');
      assert.equal(report.repair.close_intents.close_pending[0].reason, 'worker_still_alive');
      assert.equal(report.repair.plan_publications.code, 'SESSION_CLOSE_PENDING');
      assert.equal(report.repair.plan_publications.status, 'deferred');
      assert.equal(report.repair.archives.status, 'deferred');
      assert.equal(report.repair.workflows.status, 'deferred');
      assert.equal(report.checks.sessions.close_pending, 1);
    }
    assert.ok(closeJournal.read(fx.rootDir, 'doctor-close-order-session'));
  } finally {
    planStore.recoverPlanPublications = originalPlanRecovery;
    changes.recoverInterruptedArchives = originalArchiveRecovery;
    workflows.recoverUntrackedChangeWorkflows = originalWorkflowRecovery;
    cleanup(fx);
  }
});

test('doctor stops after unresolved Plan recovery and defers every later mutation idempotently', async () => {
  for (const scenario of [
    {
      name: 'pending',
      result: { recovered: 0, finalized: 0, pending: 1, issues: [] },
      expectedStatus: 'deferred',
    },
    {
      name: 'conflict',
      result: {
        recovered: 0,
        finalized: 0,
        pending: 1,
        issues: [{ code: 'PLAN_RECOVERY_CONFLICT', message: 'changed Plan bytes' }],
      },
      expectedStatus: 'blocked',
    },
  ]) {
    const fx = fixture();
    const originals = {
      close: recovery.recoverOnBoot,
      plan: planStore.recoverPlanPublications,
      archive: changes.recoverInterruptedArchives,
      workflow: workflows.recoverUntrackedChangeWorkflows,
      readCursor: runtime.readConsumerCursor,
      consume: ops.consumeSpecChangedEvents,
      writeCursor: runtime.writeConsumerCursor,
      interrupted: runtime.requeueInterruptedProjections,
      requeued: runtime.requeueFailedProjections,
      ensured: runtime.ensureProjectionJob,
      projections: runtime.processProjectionJobs,
    };
    const calls = [];
    try {
      recovery.recoverOnBoot = () => {
        calls.push('close');
        return { recovered: [], count: 0, closed: [], close_pending: [] };
      };
      planStore.recoverPlanPublications = () => {
        calls.push('plan');
        return structuredClone(scenario.result);
      };
      changes.recoverInterruptedArchives = () => calls.push('archive');
      workflows.recoverUntrackedChangeWorkflows = () => calls.push('workflow');
      runtime.readConsumerCursor = () => calls.push('read-cursor');
      ops.consumeSpecChangedEvents = () => calls.push('consume');
      runtime.writeConsumerCursor = () => calls.push('write-cursor');
      runtime.requeueInterruptedProjections = () => calls.push('interrupted');
      runtime.requeueFailedProjections = () => calls.push('requeued');
      runtime.ensureProjectionJob = () => calls.push('ensured');
      runtime.processProjectionJobs = () => calls.push('projections');

      const first = await doctor.runDoctor(fx.db, {
        rootDir: fx.rootDir,
        repair: true,
        project: () => calls.push('project'),
      });
      const second = await doctor.runDoctor(fx.db, {
        rootDir: fx.rootDir,
        repair: true,
        project: () => calls.push('project'),
      });

      assert.deepEqual(calls, ['close', 'plan', 'close', 'plan'], scenario.name);
      for (const report of [first, second]) {
        assert.equal(report.status, 'degraded', scenario.name);
        assert.equal(
          report.repair.plan_publications.status,
          scenario.expectedStatus,
          scenario.name,
        );
        assert.equal(
          report.repair.plan_publications.code,
          'PLAN_RECOVERY_REQUIRED',
          scenario.name,
        );
        for (const key of [
          'archives',
          'workflows',
          'spec_events',
          'interrupted',
          'requeued',
          'ensured',
          'projections',
        ]) {
          assert.equal(report.repair[key].status, 'deferred', `${scenario.name}:${key}`);
          assert.equal(
            report.repair[key].blocked_by,
            'plan_publications',
            `${scenario.name}:${key}`,
          );
        }
      }
    } finally {
      recovery.recoverOnBoot = originals.close;
      planStore.recoverPlanPublications = originals.plan;
      changes.recoverInterruptedArchives = originals.archive;
      workflows.recoverUntrackedChangeWorkflows = originals.workflow;
      runtime.readConsumerCursor = originals.readCursor;
      ops.consumeSpecChangedEvents = originals.consume;
      runtime.writeConsumerCursor = originals.writeCursor;
      runtime.requeueInterruptedProjections = originals.interrupted;
      runtime.requeueFailedProjections = originals.requeued;
      runtime.ensureProjectionJob = originals.ensured;
      runtime.processProjectionJobs = originals.projections;
      cleanup(fx);
    }
  }
});

test('doctor stops after unresolved archive recovery and defers every later mutation idempotently', async () => {
  const fx = fixture();
  const originals = {
    close: recovery.recoverOnBoot,
    plan: planStore.recoverPlanPublications,
    archive: changes.recoverInterruptedArchives,
    workflow: workflows.recoverUntrackedChangeWorkflows,
    readCursor: runtime.readConsumerCursor,
    consume: ops.consumeSpecChangedEvents,
    writeCursor: runtime.writeConsumerCursor,
    interrupted: runtime.requeueInterruptedProjections,
    requeued: runtime.requeueFailedProjections,
    ensured: runtime.ensureProjectionJob,
    projections: runtime.processProjectionJobs,
  };
  const calls = [];
  try {
    recovery.recoverOnBoot = () => {
      calls.push('close');
      return { recovered: [], count: 0, closed: [], close_pending: [] };
    };
    planStore.recoverPlanPublications = () => {
      calls.push('plan');
      return { recovered: 0, finalized: 0, pending: 0, issues: [] };
    };
    changes.recoverInterruptedArchives = () => {
      calls.push('archive');
      return {
        found: 1, resumed: 0, rolled_back: 0, cleaned: 0, failed: 1,
        items: [{ change_id: 'unsafe-archive', status: 'failed', error: 'ARCHIVE_PATH_UNSAFE' }],
      };
    };
    workflows.recoverUntrackedChangeWorkflows = () => calls.push('workflow');
    runtime.readConsumerCursor = () => calls.push('read-cursor');
    ops.consumeSpecChangedEvents = () => calls.push('consume');
    runtime.writeConsumerCursor = () => calls.push('write-cursor');
    runtime.requeueInterruptedProjections = () => calls.push('interrupted');
    runtime.requeueFailedProjections = () => calls.push('requeued');
    runtime.ensureProjectionJob = () => calls.push('ensured');
    runtime.processProjectionJobs = () => calls.push('projections');

    const first = await doctor.runDoctor(fx.db, {
      rootDir: fx.rootDir,
      repair: true,
      project: () => calls.push('project'),
    });
    const second = await doctor.runDoctor(fx.db, {
      rootDir: fx.rootDir,
      repair: true,
      project: () => calls.push('project'),
    });

    assert.deepEqual(
      calls,
      ['close', 'plan', 'archive', 'close', 'plan', 'archive'],
    );
    for (const report of [first, second]) {
      assert.equal(report.status, 'degraded');
      assert.equal(report.repair.archives.status, 'blocked');
      assert.equal(report.repair.archives.code, 'ARCHIVE_RECOVERY_REQUIRED');
      assert.equal(report.repair.archives.failed, 1);
      for (const key of [
        'workflows',
        'spec_events',
        'interrupted',
        'requeued',
        'ensured',
        'projections',
      ]) {
        assert.equal(report.repair[key].status, 'deferred', key);
        assert.equal(report.repair[key].blocked_by, 'archives', key);
      }
    }
  } finally {
    recovery.recoverOnBoot = originals.close;
    planStore.recoverPlanPublications = originals.plan;
    changes.recoverInterruptedArchives = originals.archive;
    workflows.recoverUntrackedChangeWorkflows = originals.workflow;
    runtime.readConsumerCursor = originals.readCursor;
    ops.consumeSpecChangedEvents = originals.consume;
    runtime.writeConsumerCursor = originals.writeCursor;
    runtime.requeueInterruptedProjections = originals.interrupted;
    runtime.requeueFailedProjections = originals.requeued;
    runtime.ensureProjectionJob = originals.ensured;
    runtime.processProjectionJobs = originals.projections;
    cleanup(fx);
  }
});

test('doctor restores Change plan authority after a real process dies between file publish and SQLite commit', async () => {
  const fx = fixture();
  const dbPath = path.join(fx.rootDir, '.ultra', '.runtime', 'state.db');
  try {
    const change = {
      id: 'doctor-plan-crash',
      artifact_root: '.ultra/changes/active/doctor-plan-crash',
    };
    fx.db.prepare(
      `INSERT INTO changes (id, title, kind, status, intent, artifact_root)
       VALUES (?, 'Recover plan crash', 'standard', 'active',
               'Restore file and registry authority after process death.', ?)`,
    ).run(change.id, change.artifact_root);
    const paths = planStore.changePlanPaths(fx.rootDir, change);
    fs.mkdirSync(path.dirname(paths.json), { recursive: true });
    const priorJson = '{"prior":"registered-json"}\n';
    const priorMd = '# Prior registered markdown\n';
    fs.writeFileSync(paths.json, priorJson);
    fs.writeFileSync(paths.md, priorMd);
    for (const [id, kind, file] of [
      ['doctor-plan-json', 'execution_plan', paths.json],
      ['doctor-plan-md', 'execution_plan_markdown', paths.md],
    ]) {
      artifactRegistry.recordArtifact(fx.db, {
        id,
        owner_type: 'change',
        owner_id: change.id,
        kind,
        path: path.relative(fx.rootDir, file),
        source_refs: [{ type: 'change', id: change.id, relation: 'planned_for' }],
        consumer_refs: [],
        metadata: { terminal_role: true },
        provenance: { writer: 'fixture' },
      }, { rootDir: fx.rootDir });
    }
    closeStateDb(fx.db);
    fx.db = null;

    const childSource = `
      const { initStateDb } = require(${JSON.stringify(
        path.join(__dirname, 'state-db.cjs'),
      )});
      const planStore = require(${JSON.stringify(
        path.join(__dirname, 'plan-store.cjs'),
      )});
      const db = initStateDb(${JSON.stringify(dbPath)}).db;
      const change = db.prepare('SELECT id, artifact_root FROM changes WHERE id = ?')
        .get('doctor-plan-crash');
      const publication = planStore.prepareChangePlanPublication({
        schema_version: '1.0',
        change_id: change.id,
        waves: [{ id: 1, tasks: ['new-task'], parallel: false }],
        ownership_forecast: { 'new-task': ['src/new.js'] },
        conflict_surface: [],
        estimated_cost_usd: null,
        estimated_duration_min: 1,
        cycles: []
      }, {
        rootDir: ${JSON.stringify(fx.rootDir)},
        change,
        tasks: [],
        context: {
          snapshot_id: 'doctor-plan-crash-context',
          manifest_path: change.artifact_root + '/contexts/context.json',
          manifest_digest: '${'3'.repeat(64)}'
        }
      });
      db.exec('BEGIN IMMEDIATE');
      db.prepare("INSERT INTO events (type, payload_json) VALUES ('crash_marker', '{}')").run();
      publication.publish();
      process.stdout.write('PUBLISHED\\n');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 600000);
    `;
    const child = spawn(process.execPath, ['-e', childSource], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        if (stdout.includes('PUBLISHED\n')) resolve();
      });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (!stdout.includes('PUBLISHED\n')) {
          reject(new Error(`publisher exited before crash point: ${code}/${signal}: ${stderr}`));
        }
      });
    });
    child.kill('SIGKILL');
    await new Promise((resolve) => child.once('exit', resolve));

    fx.db = initStateDb(dbPath).db;
    assert.notEqual(fs.readFileSync(paths.json, 'utf8'), priorJson);
    assert.notEqual(fs.readFileSync(paths.md, 'utf8'), priorMd);
    assert.equal(
      fx.db.prepare("SELECT COUNT(*) AS count FROM events WHERE type = 'crash_marker'").get().count,
      0,
    );
    const before = doctor.inspectSystem(fx.db, { rootDir: fx.rootDir });
    assert.equal(before.checks.plan_publications.status, 'fail');
    assert.equal(before.checks.plan_publications.pending, 1);

    const repaired = await doctor.runDoctor(fx.db, {
      rootDir: fx.rootDir,
      repair: true,
    });
    assert.equal(repaired.repair.plan_publications.recovered, 1);
    assert.equal(fs.readFileSync(paths.json, 'utf8'), priorJson);
    assert.equal(fs.readFileSync(paths.md, 'utf8'), priorMd);
    assert.deepEqual(
      fs.readdirSync(path.dirname(paths.json))
        .filter((name) => name.startsWith('.plan-publish-')),
      [],
    );
    const second = await doctor.runDoctor(fx.db, {
      rootDir: fx.rootDir,
      repair: true,
    });
    assert.equal(second.repair.plan_publications.recovered, 0);
    assert.equal(second.checks.plan_publications.pending, 0);
  } finally {
    if (fx.db) cleanup(fx);
    else fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('doctor reports running projection work and repairs only stale interrupted jobs', async () => {
  const fx = fixture();
  try {
    ops.appendEvent(fx.db, { type: 'spec_changed', payload: { sections: [] } });
    const job = runtime.enqueueProjection(fx.db, { tool_name: 'task.append_event', event_cursor: 1 });
    fx.db.prepare("UPDATE projection_jobs SET status = 'running', updated_at = ? WHERE id = ?")
      .run('2000-01-01T00:00:00.000Z', job.id);

    const before = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir });
    assert.equal(before.status, 'degraded');
    assert.equal(before.checks.projections.running, 1);

    const after = await doctor.runDoctor(fx.db, {
      rootDir: fx.rootDir,
      repair: true,
      projectionStaleAfterMs: 0,
    });
    assert.equal(after.repair.interrupted.requeued, 1);
    assert.equal(after.checks.projections.running, 0);
    assert.equal(after.status, 'healthy');
  } finally {
    cleanup(fx);
  }
});

test('doctor repair resumes an archive journal left after a process crash', async () => {
  const fx = fixture();
  try {
    const activeRoot = path.join(fx.rootDir, '.ultra', 'changes', 'active', 'doctor-archive');
    fs.mkdirSync(activeRoot, { recursive: true });
    fs.writeFileSync(path.join(activeRoot, 'intent.md'), '# Authorized archive\n');
    const reconciliationPath = '.ultra/changes/active/doctor-archive/baseline-reconciliation.json';
    const reconciliationManifest = {
      $schema: 'ultra-baseline-reconciliation-v1', change_id: 'doctor-archive',
      baseline_id: 'test-baseline', baseline_updates: [], semantic_changes: [],
      resolved_gap_ids: [], resolved_unknowns: [],
      verification: [{ name: 'read-back', command: 'ubp status', status: 'pass', evidence: 'Verified.' }],
      semantic_no_change_reason: 'No baseline content changed.',
    };
    fs.writeFileSync(
      path.join(fx.rootDir, reconciliationPath), `${JSON.stringify(reconciliationManifest)}\n`,
    );
    fx.db.prepare(
      `INSERT INTO changes
       (id, title, kind, status, intent, docs_impact_json, provider_refs_json, artifact_root)
       VALUES ('doctor-archive', 'Recover archive', 'quick', 'ready', 'Recover it',
               '{"status":"none","files":[],"rationale":"recovery"}', '{}',
               '.ultra/changes/active/doctor-archive')`,
    ).run();
    artifactRegistry.recordArtifact(fx.db, {
      id: 'doctor-archive-baseline-reconciliation',
      owner_type: 'change',
      owner_id: 'doctor-archive',
      kind: 'baseline_reconciliation',
      path: reconciliationPath,
      provenance: { writer: 'doctor-recovery-fixture' },
      source_refs: [{
        type: 'change', id: 'doctor-archive', relation: 'produced_for',
      }],
      consumer_refs: [],
      metadata: { terminal_role: true },
    }, { rootDir: fx.rootDir });
    const prepared = archiveJournal.prepareArchiveMove({
      rootDir: fx.rootDir, change: changes.readChange(fx.db, 'doctor-archive'),
      summary: 'Resume the authorized archive.', baselineUpdates: [],
      noBaselineChangeReason: 'No baseline content changed.',
      reconciliationPath,
      reconciliationDigest: require('node:crypto').createHash('sha256')
        .update(fs.readFileSync(path.join(fx.rootDir, reconciliationPath))).digest('hex'),
      reconciliationManifest,
    });
    assert.equal(fs.existsSync(prepared.source), false);
    const before = doctor.inspectSystem(fx.db, { rootDir: fx.rootDir });
    assert.equal(before.status, 'degraded');
    assert.equal(before.checks.archive_recovery.pending, 1);

    const after = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir, repair: true });
    assert.equal(after.repair.archives.resumed, 1);
    assert.equal(changes.readChange(fx.db, 'doctor-archive').status, 'archived');
    assert.equal(after.checks.archive_recovery.pending, 0);
    assert.equal(fs.existsSync(path.join(prepared.destination, archiveJournal.INTENT_FILE)), false);
  } finally {
    cleanup(fx);
  }
});

test('doctor repair creates a blocked recovery workflow for a legacy untracked change', async () => {
  const fx = fixture();
  try {
    const artifactRoot = path.join(fx.rootDir, '.ultra', 'changes', 'active', 'legacy-change');
    fs.mkdirSync(artifactRoot, { recursive: true });
    fx.db.prepare(
      `INSERT INTO changes (id, title, kind, status, intent, artifact_root)
       VALUES ('legacy-change', 'Legacy active change', 'standard', 'active',
               'Preserve and recover this pre-workflow change.',
               '.ultra/changes/active/legacy-change')`,
    ).run();
    const before = doctor.inspectSystem(fx.db, { rootDir: fx.rootDir });
    assert.equal(before.status, 'degraded');
    assert.equal(before.checks.workflows.status, 'fail');
    assert.deepEqual(before.checks.workflows.untracked_active_changes, ['legacy-change']);

    const after = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir, repair: true });
    assert.equal(after.repair.workflows.created, 1);
    const recovered = workflows.listWorkflows(
      fx.db, { kind: 'change', change_id: 'legacy-change' }, { rootDir: fx.rootDir },
    )[0];
    assert.equal(recovered.status, 'blocked');
    assert.equal(recovered.current_step, 'bind-baseline');
    assert.deepEqual(recovered.blockers, ['LEGACY_CHANGE_PROVENANCE_REQUIRED']);
    assert.deepEqual(after.checks.workflows.untracked_active_changes, []);
  } finally {
    cleanup(fx);
  }
});
