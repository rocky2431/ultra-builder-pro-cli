'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const { closeStateDb, initStateDb } = require('./state-db.cjs');
const decisions = require('./decision-records.cjs');
const ops = require('./state-ops.cjs');
const checkpoints = require('./stage-checkpoints.cjs');
const ledger = require('./task-ledger.cjs');

const taskLedgerSchema = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'spec', 'schemas', 'task-ledger.v2.schema.json'),
  'utf8',
));
const taskProjectionSchema = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'spec', 'schemas', 'tasks.v4.5.schema.json'),
  'utf8',
));
const taskContractAjv = new Ajv({ allErrors: true, strict: false });
addFormats(taskContractAjv);
const validateTaskLedgerSchema = taskContractAjv.compile(taskLedgerSchema);
const TASK_CONTRACT_FIELDS = Object.freeze([
  'id',
  'title',
  'type',
  'priority',
  'complexity',
  'estimated_days',
  'deps',
  'files_modified',
  'slice_kind',
]);
const INVALID_TASK_CONTRACT_CASES = Object.freeze([
  { field: 'type', value: 'x'.repeat(81) },
  { field: 'priority', value: 'x'.repeat(81) },
  { field: 'complexity', value: 1.5 },
  { field: 'estimated_days', value: 0 },
  { field: 'slice_kind', value: 'x'.repeat(81) },
  { field: 'id', value: 'invalid/task' },
  { field: 'title', value: 'x' },
  { field: 'deps', value: [42] },
  { field: 'files_modified', value: [42] },
]);

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

function sha256(value) {
  return crypto.createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
}

function publishContractLedger(fx, id) {
  executableTask(fx.db, id, {
    complexity: 5,
    estimated_days: 2,
    deps: [],
    files_modified: [`src/${id}.cjs`],
  });
  return ledger.publishTaskLedger(fx.db, {
    rootDir: fx.rootDir,
    reason: 'task_contract_fixture',
  }).ledger;
}

function resignTaskMutation(document, { field, value }) {
  const resigned = JSON.parse(JSON.stringify(document));
  const task = resigned.tasks[0];
  task[field] = value;
  task.digest = sha256(Object.fromEntries(
    ledger.DURABLE_TASK_FIELDS
      .filter((durableField) => task[durableField] !== undefined)
      .map((durableField) => [durableField, task[durableField]]),
  ));
  resigned.state_digest = sha256({
    baseline: resigned.baseline || null,
    changes: resigned.changes,
    decisions: resigned.decisions,
    checkpoints: resigned.checkpoints,
    tasks: resigned.tasks,
  });
  return resigned;
}

function writeTaskLedger(rootDir, document) {
  const file = ledger.ledgerPath(rootDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
}

function assertInvalidTaskContract(operation, field) {
  assert.throws(
    operation,
    (error) => error?.code === 'TASK_LEDGER_INVALID',
    `${field} must be rejected as TASK_LEDGER_INVALID`,
  );
}

function schemaConstraint(schema, field) {
  const property = schema.$defs.task.properties[field];
  assert.ok(property, `${field} must exist in ${schema.$id}`);
  const constraint = {};
  for (const key of [
    'type',
    'pattern',
    'minLength',
    'maxLength',
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'enum',
  ]) {
    if (property[key] !== undefined) constraint[key] = property[key];
  }
  if (property.items?.type) constraint.items = { type: property.items.type };
  return constraint;
}

function sqlEnumConstraint(sql, field) {
  const match = sql.match(new RegExp(`\\b${field}\\s+IN\\s*\\(([^)]*)\\)`));
  assert.ok(match, `tasks table must constrain ${field} with an enum`);
  return Array.from(match[1].matchAll(/'([^']+)'/g), ([, value]) => value);
}

function sqlVocabularyConstraint(sql, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = sql.match(new RegExp(
    `length\\s*\\(\\s*trim\\s*\\(\\s*${escaped}\\s*\\)\\s*\\)\\s+BETWEEN\\s+(\\d+)\\s+AND\\s+(\\d+)`,
    'i',
  ));
  assert.ok(match, `tasks table must bound ${field} as open vocabulary`);
  return {
    minLength: Number(match[1]),
    maxLength: Number(match[2]),
  };
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

test('task contract: published schemas and runtime storage constraints remain aligned', () => {
  for (const field of TASK_CONTRACT_FIELDS) {
    assert.deepEqual(
      schemaConstraint(taskLedgerSchema, field),
      schemaConstraint(taskProjectionSchema, field),
      `${field} drifted between the Git ledger and live task projection schemas`,
    );
  }

  const fx = fixture();
  try {
    const tasksTable = fx.db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tasks'",
    ).get().sql;
    for (const field of ['type', 'priority', 'slice_kind']) {
      assert.deepEqual(
        sqlVocabularyConstraint(tasksTable, field),
        {
          minLength: taskLedgerSchema.$defs.task.properties[field].minLength,
          maxLength: taskLedgerSchema.$defs.task.properties[field].maxLength,
        },
        `${field} drifted between SQLite and the Git ledger schema`,
      );
    }
    assert.deepEqual(
      taskLedgerSchema.$defs.task.properties.status.enum,
      sqlEnumConstraint(tasksTable, 'status').filter((status) => status !== 'in_progress'),
      'the durable ledger status enum must exclude checkout-local in_progress',
    );
    assert.deepEqual(
      taskProjectionSchema.$defs.task.properties.status.enum,
      sqlEnumConstraint(tasksTable, 'status'),
      'the live projection status enum must match SQLite',
    );

    const complexity = tasksTable.match(
      /\bcomplexity\s+BETWEEN\s+(-?\d+(?:\.\d+)?)\s+AND\s+(-?\d+(?:\.\d+)?)/,
    );
    assert.ok(complexity, 'tasks table must bound complexity');
    assert.deepEqual(
      [Number(complexity[1]), Number(complexity[2])],
      [
        taskLedgerSchema.$defs.task.properties.complexity.minimum,
        taskLedgerSchema.$defs.task.properties.complexity.maximum,
      ],
    );

    const estimatedDays = tasksTable.match(
      /\bestimated_days\s*>\s*(-?\d+(?:\.\d+)?)/,
    );
    assert.ok(estimatedDays, 'tasks table must bound estimated_days');
    assert.equal(
      Number(estimatedDays[1]),
      taskLedgerSchema.$defs.task.properties.estimated_days.exclusiveMinimum,
    );
  } finally {
    fx.cleanup();
  }
});

for (const invalidCase of INVALID_TASK_CONTRACT_CASES) {
  test(`task contract: validateLedger rejects re-signed invalid ${invalidCase.field}`, () => {
    const fx = fixture();
    try {
      const valid = publishContractLedger(fx, `validate-${invalidCase.field}`);
      const invalid = resignTaskMutation(valid, invalidCase);
      assert.equal(
        validateTaskLedgerSchema(invalid),
        false,
        `published schema unexpectedly accepted invalid ${invalidCase.field}`,
      );
      assertInvalidTaskContract(
        () => ledger.validateLedger(invalid),
        invalidCase.field,
      );
    } finally {
      fx.cleanup();
    }
  });

  test(`task contract: importTaskLedger rejects re-signed invalid ${invalidCase.field} before mutation`, () => {
    const source = fixture();
    const target = fixture();
    try {
      const valid = publishContractLedger(source, `import-${invalidCase.field}`);
      const invalid = resignTaskMutation(valid, invalidCase);
      writeTaskLedger(target.rootDir, invalid);

      assertInvalidTaskContract(
        () => ledger.importTaskLedger(target.db, { rootDir: target.rootDir }),
        invalidCase.field,
      );
      assert.equal(
        target.db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count,
        0,
        `invalid ${invalidCase.field} must not mutate SQLite`,
      );
    } finally {
      source.cleanup();
      target.cleanup();
    }
  });

  test(`task contract: publishTaskLedger rejects invalid runtime ${invalidCase.field} before replacement`, () => {
    const fx = fixture();
    try {
      const taskId = `publish-${invalidCase.field}`;
      publishContractLedger(fx, taskId);
      const file = ledger.ledgerPath(fx.rootDir);
      const before = fs.readFileSync(file);
      const dbValue = Array.isArray(invalidCase.value)
        ? JSON.stringify(invalidCase.value)
        : invalidCase.value;

      fx.db.pragma('ignore_check_constraints = ON');
      try {
        const result = fx.db.prepare(
          `UPDATE tasks SET ${invalidCase.field} = ? WHERE id = ?`,
        ).run(dbValue, taskId);
        assert.equal(result.changes, 1);
      } finally {
        fx.db.pragma('ignore_check_constraints = OFF');
      }

      assertInvalidTaskContract(
        () => ledger.publishTaskLedger(fx.db, {
          rootDir: fx.rootDir,
          reason: `invalid_${invalidCase.field}`,
        }),
        invalidCase.field,
      );
      assert.deepEqual(
        fs.readFileSync(file),
        before,
        `invalid ${invalidCase.field} must not replace the Git ledger`,
      );
    } finally {
      fx.cleanup();
    }
  });
}

test('task contract: valid ledger passes schema, validation, import, and publish', () => {
  const source = fixture();
  const target = fixture();
  try {
    const published = publishContractLedger(source, 'valid-contract-task');
    assert.equal(
      validateTaskLedgerSchema(published),
      true,
      taskContractAjv.errorsText(validateTaskLedgerSchema.errors),
    );
    assert.equal(ledger.validateLedger(published), published);

    writeTaskLedger(target.rootDir, published);
    const imported = ledger.importTaskLedger(target.db, { rootDir: target.rootDir });
    assert.equal(imported.imported, 1);
    assert.equal(ops.readTask(target.db, 'valid-contract-task').complexity, 5);

    const republished = ledger.publishTaskLedger(target.db, {
      rootDir: target.rootDir,
      reason: 'valid_contract_round_trip',
    });
    assert.equal(republished.changed, false);
  } finally {
    source.cleanup();
    target.cleanup();
  }
});

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

test('v0.22 and v0.23 team ledger v1 migrates byte-for-byte backup-first to v2', () => {
  for (const release of ['0.22.0', '0.23.0']) {
    const releaseKey = release.replaceAll('.', '-');
    const fx = fixture();
    try {
      readyBaseline(fx.db, {
        id: `baseline-${release}`,
        approvalNote: `Accepted by Ultra Builder Pro ${release}.`,
      });
      sharedChange(fx.db, `change-${release}`, `Preserve ${release} authority.`);
      executableTask(fx.db, `task-${releaseKey}`, {
        change_id: `change-${release}`,
      });
      const current = ledger.publishTaskLedger(fx.db, {
        rootDir: fx.rootDir,
        reason: 'legacy_fixture',
      }).ledger;
      const legacy = {
        ...current,
        schema_version: '1.0',
        baseline: current.baseline
          ? Object.fromEntries(
            Object.entries(current.baseline)
              .filter(([key]) => key !== 'research_checkpoint_id'),
          )
          : null,
      };
      delete legacy.decisions;
      delete legacy.checkpoints;
      legacy.state_digest = crypto.createHash('sha256')
        .update(JSON.stringify({
          baseline: legacy.baseline,
          changes: legacy.changes,
          tasks: legacy.tasks,
        }))
        .digest('hex');
      const legacyBytes = Buffer.from(`${JSON.stringify(legacy, null, 2)}\n`);
      fs.writeFileSync(ledger.ledgerPath(fx.rootDir), legacyBytes);

      const migrated = ledger.publishTaskLedger(fx.db, {
        rootDir: fx.rootDir,
        reason: `migrate_${release}`,
      });

      assert.equal(migrated.changed, true);
      assert.equal(migrated.ledger.schema_version, '2.0');
      assert.equal(migrated.ledger.parent_digest, legacy.state_digest);
      assert.ok(migrated.legacy_backup_path);
      assert.deepEqual(
        fs.readFileSync(migrated.legacy_backup_path),
        legacyBytes,
      );
      assert.equal(ledger.readTaskLedger(fx.rootDir).schema_version, '2.0');
    } finally {
      fx.cleanup();
    }
  }
});

test('v0.23 ledger with research_run_id validates under its original digest contract', () => {
  const fx = fixture();
  try {
    readyBaseline(fx.db, {
      id: 'baseline-v0.23-research',
      approvalNote: 'Accepted by Ultra Builder Pro 0.23.0.',
    });
    fx.db.prepare(
      "UPDATE baselines SET research_checkpoint_id = 'research-run-v0.23' WHERE id = ?",
    ).run('baseline-v0.23-research');
    const current = ledger.publishTaskLedger(fx.db, {
      rootDir: fx.rootDir,
      reason: 'legacy_fixture',
    }).ledger;
    const legacyBaseline = {
      ...current.baseline,
      research_run_id: current.baseline.research_checkpoint_id,
    };
    delete legacyBaseline.research_checkpoint_id;
    legacyBaseline.digest = crypto.createHash('sha256')
      .update(JSON.stringify(Object.fromEntries([
        'id',
        'project_name',
        'project_type',
        'stack',
        'mode',
        'status',
        'scope',
        'repository_revision',
        'repository_branch',
        'worktree_state',
        'worktree_digest',
        'worktree_accepted',
        'known_red_accepted',
        'spec_refs',
        'evidence',
        'verification',
        'unknowns',
        'gaps',
        'classification',
        'provider_refs',
        'research_run_id',
        'approved_by',
        'approval_note',
        'converged_at',
      ].filter((field) => legacyBaseline[field] !== undefined)
        .map((field) => [field, legacyBaseline[field]]))))
      .digest('hex');
    const legacy = {
      ...current,
      schema_version: '1.0',
      baseline: legacyBaseline,
    };
    delete legacy.decisions;
    delete legacy.checkpoints;
    legacy.state_digest = crypto.createHash('sha256')
      .update(JSON.stringify({
        baseline: legacy.baseline,
        changes: legacy.changes,
        tasks: legacy.tasks,
      }))
      .digest('hex');
    const legacyBytes = Buffer.from(`${JSON.stringify(legacy, null, 2)}\n`);
    fs.writeFileSync(ledger.ledgerPath(fx.rootDir), legacyBytes);

    const migrated = ledger.publishTaskLedger(fx.db, {
      rootDir: fx.rootDir,
      reason: 'migrate_v0.23_research',
    });

    assert.equal(migrated.ledger.schema_version, '2.0');
    assert.equal(
      migrated.ledger.baseline.research_checkpoint_id,
      'research-run-v0.23',
    );
    assert.deepEqual(fs.readFileSync(migrated.legacy_backup_path), legacyBytes);
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
      `SELECT status, worktree_accepted, known_red_accepted, research_checkpoint_id,
              approved_by, approval_note, converged_at, gaps_json
       FROM baselines WHERE id = 'shared-baseline'`,
    ).get();
    assert.equal(result.requires_baseline_revalidation, true);
    assert.equal(imported.status, 'adopting');
    assert.equal(imported.worktree_accepted, 0);
    assert.equal(imported.known_red_accepted, 0);
    assert.equal(imported.research_checkpoint_id, null);
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

test('team ledger recreates accepted decisions and Stage Checkpoints on a clean clone', () => {
  const source = fixture();
  const target = fixture();
  try {
    readyBaseline(source.db);
    sharedChange(source.db, 'change-shared-context', 'Share accepted intent and checkpoints.');
    executableTask(source.db, 'task-shared-context', {
      change_id: 'change-shared-context',
    });
    const decision = decisions.acceptDecision(source.db, {
      id: 'decision-shared-context',
      scope: { change_id: 'change-shared-context' },
      question: 'Which component owns semantic judgment?',
      recommendation: 'Keep semantic judgment in the host model.',
      selection: 'Use MCP only as persistence and safety kernel.',
      effects: { workflow: 'adaptive' },
      non_goals: ['Do not persist raw transcripts.'],
      owner: 'project-owner',
      source: 'explicit-owner-intent',
      provenance: { runtime: 'codex' },
      applied_refs: [],
    }, { rootDir: source.rootDir });
    const draft = checkpoints.saveDraft(source.db, {
      stage: 'plan',
      scope: { change_id: 'change-shared-context' },
      payload: { summary: 'One accepted team Plan checkpoint.' },
      evidence: [{ ref: '.ultra/changes/active/change-shared-context/intent.md' }],
      diagnostics: [],
      idempotency_key: 'shared-plan-draft',
    });
    checkpoints.acceptDraft(source.db, {
      id: draft.id,
      idempotency_key: 'shared-plan-accept',
    });
    const published = ledger.publishTaskLedger(source.db, {
      rootDir: source.rootDir,
      reason: 'share_context_authority',
    });
    assert.equal(published.ledger.schema_version, '2.0');
    assert.equal(published.ledger.decisions[0].artifact_digest, decision.digest);
    assert.equal(published.ledger.checkpoints[0].stage, 'plan');

    fs.mkdirSync(path.join(target.rootDir, '.ultra', 'tasks'), { recursive: true });
    fs.mkdirSync(
      path.join(target.rootDir, '.ultra', 'changes', 'active', 'change-shared-context'),
      { recursive: true },
    );
    fs.copyFileSync(
      ledger.ledgerPath(source.rootDir),
      ledger.ledgerPath(target.rootDir),
    );
    fs.cpSync(
      path.join(source.rootDir, '.ultra', 'changes', 'active', 'change-shared-context'),
      path.join(target.rootDir, '.ultra', 'changes', 'active', 'change-shared-context'),
      { recursive: true },
    );

    const imported = ledger.importTaskLedger(target.db, { rootDir: target.rootDir });
    assert.equal(imported.imported_decisions, 1);
    assert.equal(imported.imported_checkpoints, 1);
    assert.equal(
      decisions.readDecision(target.db, decision.id).selection,
      'Use MCP only as persistence and safety kernel.',
    );
    assert.equal(
      checkpoints.currentCheckpoint(
        target.db,
        'plan',
        { change_id: 'change-shared-context' },
        { includeDraft: false },
      ).status,
      'accepted',
    );
  } finally {
    source.cleanup();
    target.cleanup();
  }
});

test('runtime ledger validation rejects top-level authority excluded by the exact schema', () => {
  const fx = fixture();
  try {
    publishContractLedger(fx, 'ledger-exact-fields');
    const file = ledger.ledgerPath(fx.rootDir);
    const document = JSON.parse(fs.readFileSync(file, 'utf8'));
    document.unexpected_authority = 'must-not-be-trusted';
    fs.writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);

    assert.throws(
      () => ledger.readTaskLedger(fx.rootDir, { optional: false }),
      (error) => (
        error.code === 'TASK_LEDGER_INVALID'
        && /unexpected_authority|additional propert/i.test(error.message)
      ),
    );
  } finally {
    fx.cleanup();
  }
});
