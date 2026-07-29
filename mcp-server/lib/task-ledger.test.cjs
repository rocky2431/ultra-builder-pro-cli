'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { closeStateDb, initStateDb } = require('./state-db.cjs');
const ops = require('./state-ops.cjs');
const ledger = require('./task-ledger.cjs');

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-task-ledger-'));
  const dbPath = path.join(rootDir, '.ultra', '.runtime', 'state.db');
  const { db } = initStateDb(dbPath);
  return {
    rootDir,
    db,
    cleanup() {
      closeStateDb(db);
      fs.rmSync(rootDir, { recursive: true, force: true });
    },
  };
}

function executableTask(db, id, overrides = {}) {
  return ops.createTask(db, {
    id,
    title: `Deliver ${id}`,
    type: 'feature',
    priority: 'P1',
    outcome: `${id} is observable`,
    slice_kind: 'tracer_bullet',
    public_seam: `cli:${id}`,
    verification_command: `node --test ${id}.test.cjs`,
    acceptance: [{
      id: `${id}-acceptance`,
      criterion: `${id} works`,
      verification: `node --test ${id}.test.cjs`,
    }],
    context_refs: [{
      ref: 'package.json',
      reason: 'Current package contract.',
      freshness: 'existence',
    }],
    docs_impact: {
      status: 'none',
      files: [],
      rationale: 'No public documentation change.',
    },
    ownership: { owner: 'team' },
    trace_to: `.ultra/specs/product.md#${id}`,
    ...overrides,
  });
}

function sharedChange(db, id, intent) {
  db.prepare(
    `INSERT INTO changes
     (id, title, kind, status, intent, artifact_root)
     VALUES (?, ?, 'standard', 'active', ?, ?)`,
  ).run(id, `Change ${id}`, intent, `.ultra/changes/active/${id}`);
}

function readyBaseline(db, {
  id = 'shared-baseline',
  projectType = 'service',
  approvalNote = 'accepted',
} = {}) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO baselines
     (id, project_name, project_type, mode, status, scope_json, repository_revision,
      worktree_state, worktree_digest, worktree_accepted, known_red_accepted,
      spec_refs_json, evidence_json, verification_json, unknowns_json, gaps_json,
      approved_by, approval_note, converged_at)
     VALUES (?, 'Shared project', ?, 'brownfield', 'ready', '["."]',
             '0123456789012345678901234567890123456789', 'clean',
             'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
             1, 1, '[]', '[]', '[]', '[]', '[]', 'owner', ?, ?)`,
  ).run(id, projectType, approvalNote, now);
}

test('published ledger is durable while in-progress session state remains local', () => {
  const fx = fixture();
  try {
    executableTask(fx.db, 'task-a');
    const first = ledger.publishTaskLedger(fx.db, {
      rootDir: fx.rootDir,
      reason: 'plan_accepted',
    });
    assert.equal(first.changed, true);
    assert.equal(first.ledger.generation, 1);
    assert.equal(first.ledger.tasks[0].status, 'pending');
    assert.equal(first.ledger.tasks[0].session_id, undefined);

    ops.patchTask(fx.db, 'task-a', {
      status: 'in_progress',
      session_id: 'local-session',
    });
    const second = ledger.publishTaskLedger(fx.db, {
      rootDir: fx.rootDir,
      reason: 'manual_checkpoint',
    });
    assert.equal(second.changed, false);
    assert.equal(second.ledger.generation, 1);
    assert.equal(second.ledger.tasks[0].status, 'pending');
    assert.equal(second.ledger.tasks[0].session_id, undefined);

    ops.patchTask(fx.db, 'task-a', { status: 'completed' });
    const completed = ledger.publishTaskLedger(fx.db, {
      rootDir: fx.rootDir,
      reason: 'task_completed',
    });
    assert.equal(completed.changed, true);
    assert.equal(completed.ledger.generation, 2);
    assert.equal(completed.ledger.tasks[0].status, 'completed');
    assert.match(completed.ledger.parent_digest, /^[0-9a-f]{64}$/);
    assert.match(completed.ledger.state_digest, /^[0-9a-f]{64}$/);
  } finally {
    fx.cleanup();
  }
});

test('ledger import fast-forwards clean task state and rejects active same-task work', () => {
  const source = fixture();
  const target = fixture();
  try {
    executableTask(source.db, 'task-shared');
    ledger.publishTaskLedger(source.db, {
      rootDir: source.rootDir,
      reason: 'plan_accepted',
    });
    fs.mkdirSync(path.join(target.rootDir, '.ultra', 'tasks'), { recursive: true });
    fs.copyFileSync(
      ledger.ledgerPath(source.rootDir),
      ledger.ledgerPath(target.rootDir),
    );

    const imported = ledger.importTaskLedger(target.db, { rootDir: target.rootDir });
    assert.equal(imported.imported, 1);
    assert.equal(ops.readTask(target.db, 'task-shared').status, 'pending');

    ops.patchTask(target.db, 'task-shared', {
      status: 'in_progress',
      session_id: 'target-session',
    });
    ops.patchTask(source.db, 'task-shared', { status: 'in_progress' });
    ops.patchTask(source.db, 'task-shared', { status: 'completed' });
    ledger.publishTaskLedger(source.db, {
      rootDir: source.rootDir,
      reason: 'task_completed',
    });
    fs.copyFileSync(
      ledger.ledgerPath(source.rootDir),
      ledger.ledgerPath(target.rootDir),
    );

    assert.throws(
      () => ledger.importTaskLedger(target.db, { rootDir: target.rootDir }),
      (error) => error.code === 'TASK_LEDGER_ACTIVE_TASK_CONFLICT',
    );
    assert.equal(ops.readTask(target.db, 'task-shared').status, 'in_progress');
  } finally {
    source.cleanup();
    target.cleanup();
  }
});

test('ledger import applies descendant task deletion but preserves conflicting local work', () => {
  const source = fixture();
  const target = fixture();
  try {
    executableTask(source.db, 'task-delete');
    ledger.publishTaskLedger(source.db, {
      rootDir: source.rootDir,
      reason: 'plan_accepted',
    });
    fs.mkdirSync(path.join(target.rootDir, '.ultra', 'tasks'), { recursive: true });
    fs.copyFileSync(ledger.ledgerPath(source.rootDir), ledger.ledgerPath(target.rootDir));
    ledger.importTaskLedger(target.db, { rootDir: target.rootDir });

    ops.deleteTask(source.db, 'task-delete');
    ledger.publishTaskLedger(source.db, {
      rootDir: source.rootDir,
      reason: 'plan_revised',
    });
    fs.copyFileSync(ledger.ledgerPath(source.rootDir), ledger.ledgerPath(target.rootDir));
    const removed = ledger.importTaskLedger(target.db, { rootDir: target.rootDir });
    assert.equal(removed.deleted, 1);
    assert.equal(ops.readTask(target.db, 'task-delete'), null);

    executableTask(source.db, 'task-conflicting-delete');
    ledger.publishTaskLedger(source.db, {
      rootDir: source.rootDir,
      reason: 'plan_revised',
    });
    fs.copyFileSync(ledger.ledgerPath(source.rootDir), ledger.ledgerPath(target.rootDir));
    ledger.importTaskLedger(target.db, { rootDir: target.rootDir });
    ops.patchTask(target.db, 'task-conflicting-delete', {
      outcome: 'Local retained outcome',
    });
    ops.deleteTask(source.db, 'task-conflicting-delete');
    ledger.publishTaskLedger(source.db, {
      rootDir: source.rootDir,
      reason: 'plan_revised',
    });
    fs.copyFileSync(ledger.ledgerPath(source.rootDir), ledger.ledgerPath(target.rootDir));

    assert.throws(
      () => ledger.importTaskLedger(target.db, { rootDir: target.rootDir }),
      (error) => error.code === 'TASK_LEDGER_CONFLICT',
    );
    assert.equal(
      ops.readTask(target.db, 'task-conflicting-delete').outcome,
      'Local retained outcome',
    );
  } finally {
    source.cleanup();
    target.cleanup();
  }
});

test('imported ready baseline requires checkout-local revalidation', () => {
  const source = fixture();
  const target = fixture();
  try {
    readyBaseline(source.db);
    executableTask(source.db, 'task-baseline');
    ledger.publishTaskLedger(source.db, {
      rootDir: source.rootDir,
      reason: 'plan_accepted',
    });
    fs.mkdirSync(path.join(target.rootDir, '.ultra', 'tasks'), { recursive: true });
    fs.copyFileSync(ledger.ledgerPath(source.rootDir), ledger.ledgerPath(target.rootDir));

    const result = ledger.importTaskLedger(target.db, { rootDir: target.rootDir });
    const imported = target.db.prepare(
      `SELECT status, worktree_accepted, known_red_accepted, research_run_id,
              approved_by, approval_note, converged_at, gaps_json
       FROM baselines WHERE id = 'shared-baseline'`,
    ).get();
    assert.equal(result.requires_baseline_revalidation, true);
    assert.equal(imported.status, 'adopting');
    assert.equal(imported.worktree_accepted, 0);
    assert.equal(imported.known_red_accepted, 0);
    assert.equal(imported.research_run_id, null);
    assert.equal(imported.approved_by, null);
    assert.equal(imported.approval_note, null);
    assert.equal(imported.converged_at, null);
    assert.equal(JSON.parse(imported.gaps_json)[0].id, 'team-ledger-revalidation-required');
    assert.equal(
      ledger.inspectTaskLedger(target.db, { rootDir: target.rootDir }).status,
      'revalidation_required',
    );
    const checkpointBefore = fs.readFileSync(ledger.ledgerPath(target.rootDir));
    assert.throws(
      () => ledger.publishTaskLedger(target.db, {
        rootDir: target.rootDir,
        reason: 'premature_local_publish',
      }),
      (error) => error.code === 'TASK_LEDGER_REVALIDATION_REQUIRED',
    );
    assert.equal(
      fs.readFileSync(ledger.ledgerPath(target.rootDir)).equals(checkpointBefore),
      true,
    );
  } finally {
    source.cleanup();
    target.cleanup();
  }
});

test('ledger import fast-forwards a shared baseline but rejects concurrent baseline edits', () => {
  const source = fixture();
  const target = fixture();
  try {
    readyBaseline(source.db);
    executableTask(source.db, 'task-baseline-merge');
    ledger.publishTaskLedger(source.db, {
      rootDir: source.rootDir,
      reason: 'baseline_converged',
    });
    fs.mkdirSync(path.join(target.rootDir, '.ultra', 'tasks'), { recursive: true });
    fs.copyFileSync(ledger.ledgerPath(source.rootDir), ledger.ledgerPath(target.rootDir));
    ledger.importTaskLedger(target.db, { rootDir: target.rootDir });

    source.db.prepare(
      "UPDATE baselines SET project_type = 'desktop' WHERE id = 'shared-baseline'",
    ).run();
    ledger.publishTaskLedger(source.db, {
      rootDir: source.rootDir,
      reason: 'baseline_refreshed',
    });
    fs.copyFileSync(ledger.ledgerPath(source.rootDir), ledger.ledgerPath(target.rootDir));
    const refreshed = ledger.importTaskLedger(target.db, { rootDir: target.rootDir });
    const imported = target.db.prepare(
      "SELECT project_type, status FROM baselines WHERE id = 'shared-baseline'",
    ).get();
    assert.equal(refreshed.imported_baseline, true);
    assert.equal(refreshed.requires_baseline_revalidation, true);
    assert.deepEqual(imported, { project_type: 'desktop', status: 'adopting' });

    target.db.prepare(
      "UPDATE baselines SET project_type = 'local-desktop' WHERE id = 'shared-baseline'",
    ).run();
    source.db.prepare(
      "UPDATE baselines SET project_type = 'remote-desktop' WHERE id = 'shared-baseline'",
    ).run();
    ledger.publishTaskLedger(source.db, {
      rootDir: source.rootDir,
      reason: 'baseline_refreshed',
    });
    fs.copyFileSync(ledger.ledgerPath(source.rootDir), ledger.ledgerPath(target.rootDir));
    assert.throws(
      () => ledger.importTaskLedger(target.db, { rootDir: target.rootDir }),
      (error) => error.code === 'TASK_LEDGER_BASELINE_CONFLICT',
    );
    assert.equal(
      target.db.prepare(
        "SELECT project_type FROM baselines WHERE id = 'shared-baseline'",
      ).get().project_type,
      'local-desktop',
    );
  } finally {
    source.cleanup();
    target.cleanup();
  }
});

test('re-importing the same checkpoint is read-only and does not append another event', () => {
  const source = fixture();
  const target = fixture();
  try {
    executableTask(source.db, 'task-idempotent-import');
    ledger.publishTaskLedger(source.db, {
      rootDir: source.rootDir,
      reason: 'plan_accepted',
    });
    fs.mkdirSync(path.join(target.rootDir, '.ultra', 'tasks'), { recursive: true });
    fs.copyFileSync(ledger.ledgerPath(source.rootDir), ledger.ledgerPath(target.rootDir));
    ledger.importTaskLedger(target.db, { rootDir: target.rootDir });
    const before = target.db.prepare(
      "SELECT COUNT(*) AS count FROM events WHERE type = 'task_ledger_imported'",
    ).get().count;

    const repeated = ledger.importTaskLedger(target.db, { rootDir: target.rootDir });
    const after = target.db.prepare(
      "SELECT COUNT(*) AS count FROM events WHERE type = 'task_ledger_imported'",
    ).get().count;
    assert.equal(repeated.already_current, true);
    assert.equal(before, 1);
    assert.equal(after, before);
  } finally {
    source.cleanup();
    target.cleanup();
  }
});

test('ledger import rejects a stale checkpoint instead of reverting local authority', () => {
  const source = fixture();
  const target = fixture();
  try {
    executableTask(source.db, 'task-stale-ledger');
    const first = ledger.publishTaskLedger(source.db, {
      rootDir: source.rootDir,
      reason: 'plan_accepted',
    });
    const firstBytes = fs.readFileSync(ledger.ledgerPath(source.rootDir));
    fs.mkdirSync(path.join(target.rootDir, '.ultra', 'tasks'), { recursive: true });
    fs.copyFileSync(ledger.ledgerPath(source.rootDir), ledger.ledgerPath(target.rootDir));
    ledger.importTaskLedger(target.db, { rootDir: target.rootDir });

    ops.patchTask(source.db, 'task-stale-ledger', { status: 'in_progress' });
    ops.patchTask(source.db, 'task-stale-ledger', { status: 'completed' });
    const second = ledger.publishTaskLedger(source.db, {
      rootDir: source.rootDir,
      reason: 'task_completed',
    });
    assert.equal(second.ledger.generation, first.ledger.generation + 1);
    assert.ok(second.ledger.ancestors.includes(first.ledger.state_digest));
    fs.copyFileSync(ledger.ledgerPath(source.rootDir), ledger.ledgerPath(target.rootDir));
    ledger.importTaskLedger(target.db, { rootDir: target.rootDir });
    assert.equal(ops.readTask(target.db, 'task-stale-ledger').status, 'completed');

    fs.writeFileSync(ledger.ledgerPath(target.rootDir), firstBytes);
    assert.throws(
      () => ledger.importTaskLedger(target.db, { rootDir: target.rootDir }),
      (error) => error.code === 'TASK_LEDGER_STALE',
    );
    assert.equal(ops.readTask(target.db, 'task-stale-ledger').status, 'completed');
  } finally {
    source.cleanup();
    target.cleanup();
  }
});

test('ledger publish reconciles a newer Git checkpoint before writing local state', () => {
  const source = fixture();
  const target = fixture();
  try {
    executableTask(source.db, 'task-prepublish-sync');
    ledger.publishTaskLedger(source.db, {
      rootDir: source.rootDir,
      reason: 'plan_accepted',
    });
    fs.mkdirSync(path.join(target.rootDir, '.ultra', 'tasks'), { recursive: true });
    fs.copyFileSync(ledger.ledgerPath(source.rootDir), ledger.ledgerPath(target.rootDir));
    ledger.importTaskLedger(target.db, { rootDir: target.rootDir });

    ops.patchTask(target.db, 'task-prepublish-sync', {
      outcome: 'Local concurrent outcome',
    });
    ops.patchTask(source.db, 'task-prepublish-sync', {
      outcome: 'Remote concurrent outcome',
    });
    ledger.publishTaskLedger(source.db, {
      rootDir: source.rootDir,
      reason: 'task_contract_updated',
    });
    fs.copyFileSync(ledger.ledgerPath(source.rootDir), ledger.ledgerPath(target.rootDir));
    const remoteBytes = fs.readFileSync(ledger.ledgerPath(target.rootDir));

    assert.throws(
      () => ledger.publishTaskLedger(target.db, {
        rootDir: target.rootDir,
        reason: 'task_contract_updated',
      }),
      (error) => error.code === 'TASK_LEDGER_CONFLICT',
    );
    assert.equal(
      fs.readFileSync(ledger.ledgerPath(target.rootDir)).equals(remoteBytes),
      true,
    );
    assert.equal(
      ops.readTask(target.db, 'task-prepublish-sync').outcome,
      'Local concurrent outcome',
    );
  } finally {
    source.cleanup();
    target.cleanup();
  }
});

test('ledger import fast-forwards shared Change authority and rejects concurrent edits', () => {
  const source = fixture();
  const target = fixture();
  try {
    sharedChange(source.db, 'change-shared', 'Initial shared intent.');
    executableTask(source.db, 'task-change', { change_id: 'change-shared' });
    ledger.publishTaskLedger(source.db, {
      rootDir: source.rootDir,
      reason: 'plan_accepted',
    });
    fs.mkdirSync(path.join(target.rootDir, '.ultra', 'tasks'), { recursive: true });
    fs.copyFileSync(ledger.ledgerPath(source.rootDir), ledger.ledgerPath(target.rootDir));
    const first = ledger.importTaskLedger(target.db, { rootDir: target.rootDir });
    assert.equal(first.imported_changes, 1);

    source.db.prepare(
      "UPDATE changes SET intent = 'Remote revised intent.' WHERE id = 'change-shared'",
    ).run();
    ledger.publishTaskLedger(source.db, {
      rootDir: source.rootDir,
      reason: 'plan_revised',
    });
    fs.copyFileSync(ledger.ledgerPath(source.rootDir), ledger.ledgerPath(target.rootDir));
    const revised = ledger.importTaskLedger(target.db, { rootDir: target.rootDir });
    assert.equal(revised.imported_changes, 1);
    assert.equal(revised.requires_plan_revalidation, true);
    assert.equal(
      target.db.prepare("SELECT intent FROM changes WHERE id = 'change-shared'").get().intent,
      'Remote revised intent.',
    );

    target.db.prepare(
      "UPDATE changes SET intent = 'Local competing intent.' WHERE id = 'change-shared'",
    ).run();
    source.db.prepare(
      "UPDATE changes SET intent = 'Second remote intent.' WHERE id = 'change-shared'",
    ).run();
    ledger.publishTaskLedger(source.db, {
      rootDir: source.rootDir,
      reason: 'plan_revised',
    });
    fs.copyFileSync(ledger.ledgerPath(source.rootDir), ledger.ledgerPath(target.rootDir));
    assert.throws(
      () => ledger.importTaskLedger(target.db, { rootDir: target.rootDir }),
      (error) => error.code === 'TASK_LEDGER_CHANGE_CONFLICT',
    );
    assert.equal(
      target.db.prepare("SELECT intent FROM changes WHERE id = 'change-shared'").get().intent,
      'Local competing intent.',
    );
  } finally {
    source.cleanup();
    target.cleanup();
  }
});

test('ledger publishes and imports an active Change before it has tasks', () => {
  const source = fixture();
  const target = fixture();
  try {
    sharedChange(source.db, 'change-intent-only', 'Accepted intent before planning.');
    const published = ledger.publishTaskLedger(source.db, {
      rootDir: source.rootDir,
      reason: 'change_created',
    });
    assert.equal(published.ledger.tasks.length, 0);
    assert.deepEqual(
      published.ledger.changes.map((change) => change.id),
      ['change-intent-only'],
    );

    fs.mkdirSync(path.join(target.rootDir, '.ultra', 'tasks'), { recursive: true });
    fs.copyFileSync(ledger.ledgerPath(source.rootDir), ledger.ledgerPath(target.rootDir));
    const imported = ledger.importTaskLedger(target.db, { rootDir: target.rootDir });
    assert.equal(imported.imported_changes, 1);
    assert.equal(
      target.db.prepare(
        "SELECT intent FROM changes WHERE id = 'change-intent-only'",
      ).get().intent,
      'Accepted intent before planning.',
    );
  } finally {
    source.cleanup();
    target.cleanup();
  }
});

test('ledger publish migrates a matching legacy projection with a local recovery copy', () => {
  const fx = fixture();
  try {
    executableTask(fx.db, 'task-legacy');
    fs.mkdirSync(path.dirname(ledger.ledgerPath(fx.rootDir)), { recursive: true });
    fs.writeFileSync(ledger.ledgerPath(fx.rootDir), JSON.stringify({
      schema_version: '4.5',
      source: '.ultra/.runtime/state.db',
      tasks: [{ id: 'task-legacy' }],
    }));

    const published = ledger.publishTaskLedger(fx.db, {
      rootDir: fx.rootDir,
      reason: 'upgrade_checkpoint',
    });
    assert.equal(published.migrated_legacy_projection, true);
    assert.equal(published.ledger.kind, 'ultra-team-task-ledger');
    assert.equal(published.ledger.generation, 1);
    assert.equal(fs.existsSync(published.legacy_backup_path), true);
    assert.match(
      fs.readFileSync(published.legacy_backup_path, 'utf8'),
      /"schema_version":"4\.5"/,
    );
  } finally {
    fx.cleanup();
  }
});

test('ledger publish refuses to replace a divergent legacy projection', () => {
  const fx = fixture();
  try {
    executableTask(fx.db, 'task-current');
    fs.mkdirSync(path.dirname(ledger.ledgerPath(fx.rootDir)), { recursive: true });
    const legacyBytes = JSON.stringify({
      schema_version: '4.5',
      source: '.ultra/.runtime/state.db',
      tasks: [{ id: 'task-other' }],
    });
    fs.writeFileSync(ledger.ledgerPath(fx.rootDir), legacyBytes);

    assert.throws(
      () => ledger.publishTaskLedger(fx.db, {
        rootDir: fx.rootDir,
        reason: 'upgrade_checkpoint',
      }),
      (error) => error.code === 'TASK_LEDGER_LEGACY_CONFLICT',
    );
    assert.equal(fs.readFileSync(ledger.ledgerPath(fx.rootDir), 'utf8'), legacyBytes);
  } finally {
    fx.cleanup();
  }
});

test('ledger publish refuses a legacy projection whose durable task state drifted', () => {
  const fx = fixture();
  try {
    executableTask(fx.db, 'task-legacy-state');
    fs.mkdirSync(path.dirname(ledger.ledgerPath(fx.rootDir)), { recursive: true });
    const legacyBytes = JSON.stringify({
      schema_version: '4.5',
      source: '.ultra/.runtime/state.db',
      tasks: [{
        id: 'task-legacy-state',
        title: 'Deliver task-legacy-state',
        type: 'feature',
        priority: 'P1',
        status: 'completed',
      }],
    });
    fs.writeFileSync(ledger.ledgerPath(fx.rootDir), legacyBytes);

    assert.throws(
      () => ledger.publishTaskLedger(fx.db, {
        rootDir: fx.rootDir,
        reason: 'upgrade_checkpoint',
      }),
      (error) => error.code === 'TASK_LEDGER_LEGACY_CONFLICT',
    );
    assert.equal(fs.readFileSync(ledger.ledgerPath(fx.rootDir), 'utf8'), legacyBytes);
  } finally {
    fx.cleanup();
  }
});

test('live task projection cannot overwrite the Git-facing ledger', () => {
  const fx = fixture();
  try {
    executableTask(fx.db, 'task-projection');
    ledger.publishTaskLedger(fx.db, {
      rootDir: fx.rootDir,
      reason: 'plan_accepted',
    });
    const before = fs.readFileSync(ledger.ledgerPath(fx.rootDir), 'utf8');

    const projector = require('./projector.cjs');
    const result = projector.projectAll(fx.db, { rootDir: fx.rootDir });
    assert.equal(
      result.tasks_json.path,
      path.join(fx.rootDir, '.ultra', '.runtime', 'projections', 'tasks.json'),
    );
    assert.equal(fs.readFileSync(ledger.ledgerPath(fx.rootDir), 'utf8'), before);
  } finally {
    fx.cleanup();
  }
});
