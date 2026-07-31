'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  EXPECTED_VERSION,
  REQUIRED_TABLES,
  SCHEMA_FILE,
  initStateDb,
  closeStateDb,
  openStateDb,
  applyPragmas,
  tableNames,
  ActiveSessionLeaseConflictError,
} = require('./state-db.cjs');
const stateOps = require('./state-ops.cjs');

function tmpDbPath(prefix = 'ubp-state') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  return { dir, file: path.join(dir, 'state.db') };
}

test('initStateDb creates workflow-memory tables without a general memory-provider store', () => {
  const { dir, file } = tmpDbPath();
  try {
    const init = initStateDb(file);
    assert.equal(init.created, true);
    assert.equal(init.schema_version, EXPECTED_VERSION);
    for (const t of REQUIRED_TABLES) {
      assert.ok(init.tables.includes(t), `missing table ${t}`);
    }
    assert.ok(!init.tables.includes('memory_entries'));
    assert.ok(!init.tables.includes('memory_fts'));
    const taskColumns = init.db.prepare('PRAGMA table_info(tasks)').all().map((row) => row.name);
    assert.ok(!taskColumns.includes('complexity_hint'), 'fresh authority must not encode Claude model tiers');
    const decisionThreadColumns = init.db.prepare('PRAGMA table_info(decision_threads)').all()
      .map((row) => row.name);
    assert.ok(decisionThreadColumns.includes('completed_at'));
    assert.match(
      init.db.prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'decision_threads'",
      ).get().sql,
      /'completed'/,
    );
    closeStateDb(init.db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('initStateDb applies WAL + busy_timeout + foreign_keys pragmas', () => {
  const { dir, file } = tmpDbPath();
  try {
    const { db } = initStateDb(file);
    assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
    assert.equal(db.pragma('busy_timeout', { simple: true }), 5000);
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('applyPragmas fails closed when SQLite cannot establish WAL mode', () => {
  const db = {
    pragma(statement) {
      if (statement === 'journal_mode = WAL') return 'delete';
      return null;
    },
  };
  assert.throws(
    () => applyPragmas(db),
    (error) => error.code === 'STATE_DB_WAL_UNAVAILABLE' && /delete/.test(error.message),
  );
});

test('initStateDb is idempotent — second call does not duplicate seed rows', () => {
  const { dir, file } = tmpDbPath();
  try {
    const first = initStateDb(file);
    const firstRows = first.db.prepare('SELECT COUNT(*) AS n FROM schema_version').get().n;
    closeStateDb(first.db);

    const second = initStateDb(file);
    assert.equal(second.created, false, 'second init should not recreate schema');
    assert.equal(second.schema_version, EXPECTED_VERSION);

    const secondRows = second.db.prepare('SELECT COUNT(*) AS n FROM schema_version').get().n;
    assert.equal(secondRows, firstRows, 'schema_version row count must not grow on re-init');
    closeStateDb(second.db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('schema 22 semantic enums upgrade backup-first to open vocabulary and successor links', () => {
  const { dir, file } = tmpDbPath('ubp-semantic-kernel-upgrade');
  try {
    const initialized = initStateDb(file);
    initialized.db.prepare(
      `INSERT INTO changes (id, title, kind, status, intent, artifact_root)
       VALUES ('legacy-change', 'Legacy change', 'standard', 'active',
               'Preserve legacy authority.', '.ultra/changes/active/legacy-change')`,
    ).run();
    initialized.db.prepare(
      `INSERT INTO tasks (id, title, type, priority, change_id)
       VALUES ('legacy-task', 'Legacy task', 'feature', 'P1', 'legacy-change')`,
    ).run();
    initialized.db.prepare("DELETE FROM schema_version WHERE version = '23.0'").run();
    initialized.db.prepare("DELETE FROM migration_history WHERE to_version = '23.0'").run();
    const changesSql = initialized.db.prepare(
      "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'changes'",
    ).get().sql.replace(
      'kind TEXT NOT NULL CHECK (length(trim(kind)) BETWEEN 1 AND 80)',
      "kind TEXT NOT NULL CHECK (kind IN ('quick', 'standard', 'major', 'incident'))",
    );
    const tasksSql = initialized.db.prepare(
      "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'tasks'",
    ).get().sql
      .replace(
        'type TEXT NOT NULL CHECK (length(trim(type)) BETWEEN 1 AND 80)',
        "type TEXT NOT NULL CHECK (type IN ('architecture', 'feature', 'bugfix'))",
      )
      .replace(
        'priority TEXT NOT NULL CHECK (length(trim(priority)) BETWEEN 1 AND 80)',
        "priority TEXT NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3'))",
      )
      .replace(
        /slice_kind TEXT CHECK \(\s*slice_kind IS NULL OR length\(trim\(slice_kind\)\) BETWEEN 1 AND 80\s*\)/,
        "slice_kind TEXT CHECK (slice_kind IS NULL OR slice_kind IN ('tracer_bullet', 'integration_checkpoint'))",
      );
    initialized.db.unsafeMode(true);
    initialized.db.pragma('writable_schema = ON');
    initialized.db.prepare(
      "UPDATE sqlite_schema SET sql = ? WHERE type = 'table' AND name = 'changes'",
    ).run(changesSql);
    initialized.db.prepare(
      "UPDATE sqlite_schema SET sql = ? WHERE type = 'table' AND name = 'tasks'",
    ).run(tasksSql);
    initialized.db.pragma('writable_schema = OFF');
    initialized.db.unsafeMode(false);
    closeStateDb(initialized.db);

    const upgraded = initStateDb(file);
    assert.equal(upgraded.schema_version, EXPECTED_VERSION);
    assert.ok(upgraded.backup_path);
    assert.ok(fs.existsSync(upgraded.backup_path));
    assert.equal(
      upgraded.db.prepare('SELECT title FROM changes WHERE id = ?').get('legacy-change').title,
      'Legacy change',
    );
    assert.equal(
      upgraded.db.prepare('SELECT title FROM tasks WHERE id = ?').get('legacy-task').title,
      'Legacy task',
    );
    upgraded.db.prepare(
      `INSERT INTO changes
       (id, title, kind, status, intent, artifact_root, supersedes_id)
       VALUES ('custom-change', 'Custom change', 'migration-experiment', 'active',
               'Use repository-local business vocabulary.',
               '.ultra/changes/active/custom-change', 'legacy-change')`,
    ).run();
    upgraded.db.prepare(
      `INSERT INTO tasks
       (id, title, type, priority, slice_kind, change_id)
       VALUES ('custom-task', 'Custom task', 'toolchain-port', 'release-blocker',
               'compatibility-proof', 'custom-change')`,
    ).run();
    assert.deepEqual(upgraded.db.pragma('foreign_key_check'), []);
    assert.match(
      upgraded.db.prepare(
        "SELECT notes FROM migration_history WHERE to_version = '23.0' ORDER BY id DESC LIMIT 1",
      ).get().notes,
      /vocabulary|successor/i,
    );
    closeStateDb(upgraded.db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('v0.22 and v0.23 schema 20 authority upgrades backup-first to the v0.24 kernel', () => {
  for (const release of ['0.22.0', '0.23.0']) {
    const { dir, file } = tmpDbPath(`ubp-${release}-upgrade`);
    try {
      const initialized = initStateDb(file);
      initialized.db.prepare(
        "INSERT INTO tasks (id, title, type, priority) VALUES (?, ?, 'feature', 'P1')",
      ).run(`task-${release}`, `Preserve ${release} task`);
      initialized.db.prepare(
        `INSERT INTO sessions
         (sid, task_id, runtime, worktree_path, artifact_dir, lease_expires_at)
         VALUES (?, ?, 'codex', '/tmp/worktree', '/tmp/artifacts',
                 '2099-01-01T00:00:00.000Z')`,
      ).run(`session-${release}`, `task-${release}`);
      initialized.db.prepare(
        "INSERT INTO events (type, task_id, runtime) VALUES ('legacy-event', ?, 'codex')",
      ).run(`task-${release}`);
      initialized.db.pragma('foreign_keys = OFF');
      initialized.db.exec(`
        DROP TABLE worker_packets;
        DROP TABLE stage_checkpoints;
        DROP TABLE decision_records;
        DROP TABLE context_envelopes;
        ALTER TABLE baselines DROP COLUMN research_checkpoint_id;
        DELETE FROM schema_version WHERE version IN ('21.0', '22.0', '23.0');
      `);
      initialized.db.unsafeMode(true);
      initialized.db.pragma('writable_schema = ON');
      initialized.db.prepare(
        `UPDATE sqlite_schema
         SET sql = replace(sql, ?, '')
         WHERE type = 'table' AND name IN ('events', 'sessions')`,
      ).run(", 'grok'");
      initialized.db.pragma('writable_schema = OFF');
      initialized.db.unsafeMode(false);
      closeStateDb(initialized.db);

      const legacy = openStateDb(file);
      assert.equal(tableNames(legacy).includes('stage_checkpoints'), false);
      assert.equal(
        legacy.prepare('PRAGMA table_info(baselines)').all()
          .some((column) => column.name === 'research_checkpoint_id'),
        false,
      );
      assert.throws(
        () => legacy.prepare(
          "INSERT INTO events (type, runtime) VALUES ('grok-before-upgrade', 'grok')",
        ).run(),
        /CHECK constraint failed/,
      );
      closeStateDb(legacy);

      const upgraded = initStateDb(file);
      assert.equal(upgraded.schema_version, EXPECTED_VERSION);
      assert.ok(upgraded.backup_path);
      assert.ok(fs.existsSync(upgraded.backup_path));
      for (const table of [
        'stage_checkpoints', 'decision_records', 'context_envelopes', 'worker_packets',
      ]) {
        assert.ok(tableNames(upgraded.db).includes(table), `${release} missing ${table}`);
      }
      assert.ok(
        upgraded.db.prepare('PRAGMA table_info(baselines)').all()
          .some((column) => column.name === 'research_checkpoint_id'),
      );
      assert.equal(
        upgraded.db.prepare('SELECT title FROM tasks WHERE id = ?')
          .get(`task-${release}`).title,
        `Preserve ${release} task`,
      );
      assert.equal(
        upgraded.db.prepare('SELECT runtime FROM sessions WHERE sid = ?')
          .get(`session-${release}`).runtime,
        'codex',
      );
      assert.equal(
        upgraded.db.prepare("SELECT COUNT(*) AS count FROM events WHERE type = 'legacy-event'")
          .get().count,
        1,
      );
      upgraded.db.prepare(
        "INSERT INTO events (type, runtime) VALUES ('grok-after-upgrade', 'grok')",
      ).run();
      assert.deepEqual(upgraded.db.pragma('foreign_key_check'), []);
      closeStateDb(upgraded.db);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('schema 13 upgrades through the current authority without demoting an established ready baseline', () => {
  const { dir, file } = tmpDbPath('ubp-schema-13-upgrade');
  try {
    const initial = initStateDb(file);
    initial.db.prepare(
      `INSERT INTO baselines
       (id, project_name, mode, status, approved_by, approval_note, converged_at)
       VALUES ('ready-13', 'fixture', 'greenfield', 'ready', 'owner',
               'Previously accepted baseline.', '2026-01-01T00:00:00.000Z')`,
    ).run();
    initial.db.prepare(
      "DELETE FROM schema_version WHERE version IN ('14.0', '15.0', '16.0', '17.0', '18.0', '19.0', '20.0', '21.0', '22.0', '23.0')",
    ).run();
    initial.db.exec('ALTER TABLE baselines DROP COLUMN known_red_accepted');
    closeStateDb(initial.db);

    const upgraded = initStateDb(file);
    assert.equal(upgraded.schema_version, EXPECTED_VERSION);
    assert.ok(upgraded.backup_path);
    assert.ok(
      upgraded.db.prepare('PRAGMA table_info(baselines)').all()
        .some((column) => column.name === 'known_red_accepted'),
    );
    assert.deepEqual(
      upgraded.db.prepare("SELECT mode, status FROM baselines WHERE id = 'ready-13'").get(),
      { mode: 'greenfield', status: 'ready' },
    );
    const migration = upgraded.db.prepare(
      "SELECT notes FROM migration_history WHERE to_version = '14.0' ORDER BY id DESC LIMIT 1",
    ).get();
    assert.match(migration.notes, /known-red|revalidate/i);
    closeStateDb(upgraded.db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('schema 15 adds decision dialogue authority without forcing baseline re-adoption', () => {
  const { dir, file } = tmpDbPath('ubp-schema-15-upgrade');
  try {
    const initial = initStateDb(file);
    initial.db.prepare(
      `INSERT INTO baselines
       (id, project_name, mode, status, approved_by, approval_note, converged_at)
       VALUES ('ready-15', 'fixture', 'greenfield', 'ready', 'owner',
               'Previously accepted baseline.', '2026-01-01T00:00:00.000Z')`,
    ).run();
    initial.db.prepare(
      "DELETE FROM schema_version WHERE version IN ('16.0', '17.0', '18.0', '19.0', '20.0', '21.0', '22.0', '23.0')",
    ).run();
    initial.db.exec('DROP TABLE decision_items; DROP TABLE decision_threads');
    closeStateDb(initial.db);

    const upgraded = initStateDb(file);
    assert.equal(upgraded.schema_version, EXPECTED_VERSION);
    assert.ok(upgraded.backup_path);
    assert.deepEqual(
      upgraded.db.prepare("SELECT mode, status FROM baselines WHERE id = 'ready-15'").get(),
      { mode: 'greenfield', status: 'ready' },
    );
    assert.ok(tableNames(upgraded.db).includes('decision_threads'));
    assert.ok(tableNames(upgraded.db).includes('decision_items'));
    const migration = upgraded.db.prepare(
      "SELECT notes FROM migration_history WHERE to_version = '16.0' ORDER BY id DESC LIMIT 1",
    ).get();
    assert.match(migration.notes, /decision dialogue|checkpoint/i);
    closeStateDb(upgraded.db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('schema 17 adds the unborn Git baseline state without losing established authority', () => {
  const { dir, file } = tmpDbPath('ubp-schema-16-git-upgrade');
  try {
    const initial = initStateDb(file);
    initial.db.prepare(
      `INSERT INTO baselines
       (id, project_name, mode, status, approved_by, approval_note, converged_at)
       VALUES ('ready-16', 'fixture', 'greenfield', 'ready', 'owner',
               'Previously accepted baseline.', '2026-01-01T00:00:00.000Z')`,
    ).run();
    // Reproduce the exact v16 table constraint. Editing sqlite_schema is
    // restricted to this disposable fixture and is validated on reopen.
    initial.db.unsafeMode(true);
    initial.db.pragma('writable_schema = ON');
    const baselineSql = initial.db.prepare(
      "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'baselines'",
    ).get().sql;
    initial.db.prepare(
      "UPDATE sqlite_schema SET sql = ? WHERE type = 'table' AND name = 'baselines'",
    ).run(baselineSql.replace(", 'unborn'", ''));
    initial.db.pragma('writable_schema = OFF');
    initial.db.unsafeMode(false);
    initial.db.prepare(
      "DELETE FROM schema_version WHERE version IN ('17.0', '18.0', '19.0', '20.0', '21.0', '22.0', '23.0')",
    ).run();
    closeStateDb(initial.db);

    const legacy = openStateDb(file);
    assert.equal(
      legacy.prepare(
        "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'baselines'",
      ).get().sql.includes("'unborn'"),
      false,
    );
    assert.throws(
      () => legacy.prepare(
        "UPDATE baselines SET worktree_state = 'unborn' WHERE id = 'ready-16'",
      ).run(),
      /CHECK constraint failed/,
    );
    closeStateDb(legacy);

    const upgraded = initStateDb(file);
    assert.equal(upgraded.schema_version, EXPECTED_VERSION);
    assert.ok(upgraded.backup_path);
    assert.deepEqual(
      upgraded.db.prepare("SELECT mode, status FROM baselines WHERE id = 'ready-16'").get(),
      { mode: 'greenfield', status: 'ready' },
    );
    assert.doesNotThrow(() => {
      upgraded.db.prepare(
        "UPDATE baselines SET worktree_state = 'unborn' WHERE id = 'ready-16'",
      ).run();
    });
    const migration = upgraded.db.prepare(
      "SELECT notes FROM migration_history WHERE to_version = '17.0' ORDER BY id DESC LIMIT 1",
    ).get();
    assert.match(migration.notes, /unborn Git|checkpoint/i);
    closeStateDb(upgraded.db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('schema 18 migrates active rigid workflows into recoverable adaptive capability state', () => {
  const { dir, file } = tmpDbPath('ubp-schema-17-adaptive-upgrade');
  try {
    const initial = initStateDb(file);
    initial.db.prepare(
      `INSERT INTO baselines (id, project_name, mode, status)
       VALUES ('adaptive-baseline', 'fixture', 'greenfield', 'draft')`,
    ).run();
    initial.db.prepare(
      `INSERT INTO changes
       (id, title, kind, status, intent, contract_json, classification_json,
        research_disposition_json, artifact_root)
       VALUES ('adaptive-change', 'Adaptive migration', 'standard', 'active',
               'Preserve accepted change intent while removing rigid routing.',
               '{"outcome":"preserve intent","acceptance":[{"id":"a1","criterion":"state survives","verification":"read state"}],"non_goals":["release"],"public_seams":["state.db"],"recovery":{"strategy":"restore backup","verification":"reopen database"},"unresolved_decisions":[]}',
               '{"rationale":"standard state migration","risk_flags":[]}',
               '{"status":"none","mode":null,"selected_steps":[],"rationale":"no semantic gap"}',
               '.ultra/changes/active/adaptive-change')`,
    ).run();
    const insertRun = initial.db.prepare(
      `INSERT INTO workflow_runs
       (id, kind, subject, definition_version, status, baseline_id, change_id, current_step)
       VALUES (?, ?, ?, '1.1', 'active', 'adaptive-baseline', ?, ?)`,
    );
    insertRun.run('legacy-init', 'init', 'Legacy initialization.', null, 'establish-baseline');
    insertRun.run('legacy-change', 'change', 'Legacy change capture.', 'adaptive-change', 'plan-change');
    insertRun.run('legacy-plan', 'plan', 'Legacy plan.', 'adaptive-change', 'approve-plan');
    insertRun.run('legacy-deliver', 'deliver', 'Legacy delivery.', 'adaptive-change', 'release-if-authorized');
    const insertStep = initial.db.prepare(
      `INSERT INTO workflow_steps
       (run_id, step_id, position, title, required, status, evidence_json,
        outputs_json, decisions_json, blockers_json)
       VALUES (?, ?, ?, ?, 1, ?, '[]', '[]', '[]', '[]')`,
    );
    for (const [position, stepId] of [
      [0, 'inspect-authority'], [1, 'classify-repository'], [2, 'scaffold-authority'],
    ]) insertStep.run('legacy-init', stepId, position, stepId, 'completed');
    insertStep.run('legacy-init', 'establish-baseline', 3, 'establish-baseline', 'pending');
    insertStep.run('legacy-init', 'verify-initialization', 4, 'verify-initialization', 'pending');
    for (const [position, stepId] of [
      [0, 'bind-baseline'], [1, 'classify-change'], [2, 'record-intent'],
    ]) insertStep.run('legacy-change', stepId, position, stepId, 'completed');
    for (const [position, stepId] of [
      [3, 'plan-change'], [4, 'compile-context'], [5, 'verify-readiness'],
    ]) insertStep.run('legacy-change', stepId, position, stepId, 'pending');
    insertStep.run('legacy-plan', 'approve-plan', 6, 'approve-plan', 'pending');
    insertStep.run('legacy-deliver', 'release-if-authorized', 5, 'release-if-authorized', 'pending');
    initial.db.prepare(
      `INSERT INTO context_snapshots
       (id, change_id, manifest_path, manifest_hash, next_action)
       VALUES ('legacy-context', 'adaptive-change', '.ultra/context.json', 'legacy-hash',
               'Run an owner-selected workflow.')`,
    ).run();
    initial.db.prepare("DELETE FROM schema_version WHERE version IN ('18.0', '19.0', '20.0', '21.0', '22.0', '23.0')").run();
    initial.db.prepare("DELETE FROM migration_history WHERE to_version IN ('18.0', '19.0', '20.0')").run();
    closeStateDb(initial.db);

    const upgraded = initStateDb(file);
    assert.equal(upgraded.schema_version, EXPECTED_VERSION);
    assert.ok(upgraded.backup_path);
    const contextColumns = new Set(
      upgraded.db.prepare('PRAGMA table_info(context_snapshots)').all().map((row) => row.name),
    );
    assert.ok(contextColumns.has('allowed_transitions_json'));
    assert.ok(contextColumns.has('required_transition'));
    assert.deepEqual(
      upgraded.db.prepare(
        "SELECT status, current_step, definition_version FROM workflow_runs WHERE id = 'legacy-init'",
      ).get(),
      { status: 'completed', current_step: null, definition_version: '2.0' },
    );
    assert.deepEqual(
      upgraded.db.prepare(
        "SELECT status, current_step, definition_version FROM workflow_runs WHERE id = 'legacy-change'",
      ).get(),
      { status: 'completed', current_step: null, definition_version: '2.0' },
    );
    for (const [runId, stepId] of [
      ['legacy-init', 'establish-baseline'],
      ['legacy-change', 'plan-change'],
      ['legacy-change', 'compile-context'],
      ['legacy-change', 'verify-readiness'],
      ['legacy-plan', 'approve-plan'],
      ['legacy-deliver', 'release-if-authorized'],
    ]) {
      assert.deepEqual(
        upgraded.db.prepare(
          'SELECT required, status FROM workflow_steps WHERE run_id = ? AND step_id = ?',
        ).get(runId, stepId),
        { required: 0, status: 'skipped' },
      );
    }
    const migratedContext = upgraded.db.prepare(
      `SELECT allowed_transitions_json, required_transition
       FROM context_snapshots WHERE id = 'legacy-context'`,
    ).get();
    assert.deepEqual(JSON.parse(migratedContext.allowed_transitions_json), []);
    assert.equal(migratedContext.required_transition, null);
    assert.match(
      upgraded.db.prepare(
        "SELECT notes FROM migration_history WHERE to_version = '18.0' ORDER BY id DESC LIMIT 1",
      ).get().notes,
      /adaptive|capability|transition/i,
    );
    closeStateDb(upgraded.db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('schema 19 completes settled decision threads without fabricating approval evidence', () => {
  const { dir, file } = tmpDbPath('ubp-schema-18-decision-completion');
  try {
    const initial = initStateDb(file);
    initial.db.prepare(
      `INSERT INTO baselines (id, project_name, mode, status)
       VALUES ('decision-baseline', 'fixture', 'greenfield', 'draft')`,
    ).run();
    initial.db.prepare(
      `INSERT INTO decision_threads
       (id, purpose, mode, status, baseline_id)
       VALUES ('settled-thread', 'Preserve normalized intent.', 'fast', 'active',
               'decision-baseline')`,
    ).run();
    initial.db.prepare(
      `INSERT INTO decision_items
       (id, thread_id, sequence, phase, question, why_now, recommendation,
        effects_json, blocking, status, resolution_json)
       VALUES ('settled-item', 'settled-thread', 1, 'planning-posture',
               'Should planning hold scope?', 'The answer fixes scope.',
               'Hold accepted scope.', '{"summary":"Fix planning scope."}', 1,
               'answered',
               '{"authority":"owner","decision":"Hold scope.","rationale":"Accepted scope is complete."}')`,
    ).run();
    initial.db.exec(`
      INSERT INTO decision_threads
        (id, purpose, mode, status, baseline_id, confirmed_at)
      VALUES
        ('open-thread', 'Preserve an unanswered choice.', 'guided', 'active',
         'decision-baseline', NULL),
        ('deferred-thread', 'Preserve a blocking deferral.', 'guided', 'active',
         'decision-baseline', NULL),
        ('confirmed-thread', 'Preserve confirmed checkpoint authority.', 'guided',
         'confirmed', 'decision-baseline', '2026-07-28T00:00:00.000Z');

      INSERT INTO decision_items
        (id, thread_id, sequence, phase, question, why_now, recommendation,
         effects_json, blocking, status, resolution_json)
      VALUES
        ('open-item', 'open-thread', 1, 'research-route',
         'Which research route should run?', 'The route is unresolved.',
         'Use focused coverage.', '{"summary":"Research scope remains pending."}', 1,
         'open', '{}'),
        ('deferred-item', 'deferred-thread', 1, 'delivery-risk',
         'Should the blocking delivery risk be accepted?', 'Delivery cannot continue.',
         'Resolve the risk first.', '{"summary":"Delivery remains blocked."}', 1,
         'deferred',
         '{"authority":"owner","decision":"Defer.","consequence":"Delivery remains blocked."}'),
        ('confirmed-item', 'confirmed-thread', 1, 'baseline-scope',
         'Is the baseline scope accepted?', 'The checkpoint binds the baseline.',
         'Accept current scope.', '{"summary":"Baseline scope is current."}', 1,
         'answered',
         '{"authority":"owner","decision":"Accept scope.","rationale":"Evidence is current."}');
    `);
    initial.db.pragma('foreign_keys = OFF');
    initial.db.exec(`
      CREATE TABLE decision_threads_schema18 (
        id                 TEXT PRIMARY KEY,
        purpose            TEXT NOT NULL,
        mode               TEXT NOT NULL DEFAULT 'guided'
                             CHECK (mode IN ('guided', 'fast', 'autonomous', 'diagnostic')),
        status             TEXT NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'checkpoint_ready', 'confirmed', 'cancelled')),
        baseline_id        TEXT REFERENCES baselines(id) ON DELETE SET NULL,
        change_id          TEXT REFERENCES changes(id) ON DELETE CASCADE,
        workflow_run_id    TEXT REFERENCES workflow_runs(id) ON DELETE CASCADE,
        summary_json       TEXT NOT NULL DEFAULT '{}',
        checkpoint_json    TEXT NOT NULL DEFAULT '{}',
        started_at         TEXT NOT NULL,
        updated_at         TEXT NOT NULL,
        confirmed_at       TEXT,
        CHECK (baseline_id IS NOT NULL OR change_id IS NOT NULL OR workflow_run_id IS NOT NULL)
      );
      INSERT INTO decision_threads_schema18 (
        id, purpose, mode, status, baseline_id, change_id, workflow_run_id,
        summary_json, checkpoint_json, started_at, updated_at, confirmed_at
      )
      SELECT
        id, purpose, mode, status, baseline_id, change_id, workflow_run_id,
        summary_json, checkpoint_json, started_at, updated_at, confirmed_at
      FROM decision_threads;
      DROP TABLE decision_threads;
      ALTER TABLE decision_threads_schema18 RENAME TO decision_threads;
      CREATE INDEX decision_threads_status ON decision_threads(status, updated_at);
      CREATE INDEX decision_threads_authority
        ON decision_threads(baseline_id, change_id, workflow_run_id, status);
    `);
    initial.db.pragma('foreign_keys = ON');
    initial.db.prepare("DELETE FROM schema_version WHERE version IN ('19.0', '20.0', '21.0', '22.0', '23.0')").run();
    initial.db.prepare("DELETE FROM migration_history WHERE to_version IN ('19.0', '20.0')").run();
    closeStateDb(initial.db);

    const upgraded = initStateDb(file);
    assert.equal(upgraded.schema_version, EXPECTED_VERSION);
    assert.ok(upgraded.backup_path);
    assert.deepEqual(
      upgraded.db.prepare(
        "SELECT status, completed_at, confirmed_at FROM decision_threads WHERE id = 'settled-thread'",
      ).get(),
      {
        status: 'completed',
        completed_at: upgraded.db.prepare(
          "SELECT updated_at FROM decision_threads WHERE id = 'settled-thread'",
        ).get().updated_at,
        confirmed_at: null,
      },
    );
    const summary = JSON.parse(upgraded.db.prepare(
      "SELECT summary_json FROM decision_threads WHERE id = 'settled-thread'",
    ).get().summary_json);
    assert.equal(summary.completion_kind, 'migrated_settled_thread');
    assert.deepEqual(
      JSON.parse(upgraded.db.prepare(
        "SELECT resolution_json FROM decision_items WHERE id = 'settled-item'",
      ).get().resolution_json),
      {
        authority: 'owner',
        decision: 'Hold scope.',
        rationale: 'Accepted scope is complete.',
      },
    );
    assert.deepEqual(
      upgraded.db.prepare(
        `SELECT id, status, completed_at, confirmed_at
         FROM decision_threads
         WHERE id IN ('open-thread', 'deferred-thread', 'confirmed-thread')
         ORDER BY id`,
      ).all(),
      [
        {
          id: 'confirmed-thread',
          status: 'confirmed',
          completed_at: null,
          confirmed_at: '2026-07-28T00:00:00.000Z',
        },
        {
          id: 'deferred-thread',
          status: 'active',
          completed_at: null,
          confirmed_at: null,
        },
        {
          id: 'open-thread',
          status: 'active',
          completed_at: null,
          confirmed_at: null,
        },
      ],
    );
    assert.deepEqual(
      upgraded.db.prepare(
        `SELECT id, status, resolution_json
         FROM decision_items
         WHERE id IN ('open-item', 'deferred-item', 'confirmed-item')
         ORDER BY id`,
      ).all().map((row) => ({ ...row, resolution: JSON.parse(row.resolution_json) }))
        .map(({ resolution_json, ...row }) => row),
      [
        {
          id: 'confirmed-item',
          status: 'answered',
          resolution: {
            authority: 'owner',
            decision: 'Accept scope.',
            rationale: 'Evidence is current.',
          },
        },
        {
          id: 'deferred-item',
          status: 'deferred',
          resolution: {
            authority: 'owner',
            decision: 'Defer.',
            consequence: 'Delivery remains blocked.',
          },
        },
        { id: 'open-item', status: 'open', resolution: {} },
      ],
    );
    assert.deepEqual(upgraded.db.pragma('foreign_key_check'), []);
    assert.match(
      upgraded.db.prepare(
        "SELECT notes FROM migration_history WHERE to_version = '19.0' ORDER BY id DESC LIMIT 1",
      ).get().notes,
      /decision completion|settled active threads/i,
    );
    closeStateDb(upgraded.db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('openStateDb on an empty file produces no tables until schema is applied', () => {
  const { dir, file } = tmpDbPath();
  try {
    const db = openStateDb(file);
    assert.deepEqual(tableNames(db), []);
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('initStateDb preserves schema 11 evidence but requires research-backed re-adoption', () => {
  const { dir, file } = tmpDbPath('ubp-schema-11-upgrade');
  try {
    const legacy = openStateDb(file);
    legacy.exec(`
      CREATE TABLE schema_version (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        description TEXT
      );
      CREATE TABLE migration_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_version TEXT NOT NULL,
        to_version TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('forward', 'rollback')),
        ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'dry_run')),
        notes TEXT
      );
      CREATE TABLE baselines (
        id TEXT PRIMARY KEY,
        project_name TEXT NOT NULL,
        project_type TEXT,
        stack TEXT,
        mode TEXT NOT NULL CHECK (mode IN ('greenfield', 'brownfield', 'migrated')),
        status TEXT NOT NULL CHECK (status IN ('draft', 'adopting', 'blocked', 'ready', 'superseded')),
        repository_root TEXT NOT NULL DEFAULT '.',
        scope_json TEXT NOT NULL DEFAULT '["."]',
        repository_revision TEXT,
        spec_refs_json TEXT NOT NULL DEFAULT '[]',
        evidence_json TEXT NOT NULL DEFAULT '[]',
        verification_json TEXT NOT NULL DEFAULT '[]',
        unknowns_json TEXT NOT NULL DEFAULT '[]',
        provider_refs_json TEXT NOT NULL DEFAULT '{}',
        approved_by TEXT,
        approval_note TEXT,
        started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        converged_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE changes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('quick', 'standard', 'major', 'incident')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'ready', 'archived', 'cancelled')),
        intent TEXT NOT NULL,
        docs_impact_json TEXT NOT NULL DEFAULT '{}',
        provider_refs_json TEXT NOT NULL DEFAULT '{}',
        base_commit TEXT,
        artifact_root TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        closed_at TEXT
      );
      INSERT INTO schema_version (version, description) VALUES ('11.0', 'baseline authority');
      INSERT INTO baselines
        (id, project_name, mode, status, approved_by, approval_note, converged_at)
      VALUES
        ('approved-baseline', 'legacy-project', 'brownfield', 'ready', 'owner', 'approved',
         '2026-07-01T00:00:00.000Z');
    `);
    closeStateDb(legacy);

    let upgraded;
    try {
      upgraded = initStateDb(file);
    } catch (error) {
      assert.fail(`schema 11 upgrade failed: ${error.message}\n${error.stack || ''}`);
    }
    try {
      assert.equal(upgraded.schema_version, EXPECTED_VERSION);
      assert.ok(fs.existsSync(upgraded.backup_path));
      const baseline = upgraded.db.prepare(
        'SELECT id, mode, status, worktree_state, gaps_json, classification_json, approved_by FROM baselines',
      ).get();
      assert.equal(baseline.id, 'approved-baseline');
      assert.equal(baseline.mode, 'migrated');
      assert.equal(baseline.status, 'adopting');
      assert.equal(baseline.worktree_state, 'unavailable');
      assert.equal(baseline.approved_by, null);
      assert.equal(JSON.parse(baseline.gaps_json)[0].id, 'legacy-rebaseline-required');
      assert.deepEqual(JSON.parse(baseline.classification_json).migration, {
        previous_mode: 'brownfield', previous_status: 'ready', from_schema: '11.0',
        requires_research_workflow: true,
      });
      assert.equal(
        upgraded.db.prepare("SELECT COUNT(*) AS count FROM baselines WHERE mode = 'migrated'").get().count,
        1,
      );
      const changeColumns = upgraded.db.prepare('PRAGMA table_info(changes)').all().map((row) => row.name);
      assert.ok(changeColumns.includes('baseline_bypass_json'));
    } finally { closeStateDb(upgraded.db); }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('initStateDb exposes its pre-migration backup when an incompatible legacy schema fails', () => {
  const { dir, file } = tmpDbPath('ubp-schema-upgrade-failure');
  try {
    const legacy = openStateDb(file);
    legacy.exec(`
      CREATE TABLE schema_version (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        description TEXT
      );
      CREATE TABLE migration_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_version TEXT NOT NULL,
        to_version TEXT NOT NULL,
        direction TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        status TEXT NOT NULL,
        notes TEXT
      );
      INSERT INTO schema_version (version, description) VALUES ('11.0', 'incompatible fixture');
    `);
    closeStateDb(legacy);

    let failure;
    try {
      initStateDb(file);
    } catch (error) {
      failure = error;
    }
    assert.ok(failure, 'the incompatible migration_history table must fail schema application');
    assert.match(failure.message, /no such column: ts/);
    assert.ok(failure.migration_backup_path, 'failure must retain the backup location for recovery');
    assert.ok(fs.existsSync(failure.migration_backup_path));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Phase 8A.1 schema: tasks.parent_id column + tasks_parent partial index + seed row', () => {
  const { dir, file } = tmpDbPath();
  try {
    const { db } = initStateDb(file);

    const cols = db.prepare("PRAGMA table_info(tasks)").all();
    const parentCol = cols.find((c) => c.name === 'parent_id');
    assert.ok(parentCol, 'tasks.parent_id column must exist');
    assert.equal(parentCol.type, 'TEXT');
    assert.equal(parentCol.notnull, 0, 'parent_id must be nullable (top-level tasks)');

    const indexRow = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'tasks_parent'")
      .get();
    assert.ok(indexRow, 'tasks_parent index must exist');

    const seedRow = db
      .prepare("SELECT version, description FROM schema_version WHERE version = '8A.1'")
      .get();
    assert.ok(seedRow, 'schema_version row for 8A.1 must be seeded');
    assert.match(seedRow.description, /parent_id/);

    const fkInfo = db.prepare("PRAGMA foreign_key_list(tasks)").all();
    const parentFk = fkInfo.find((fk) => fk.from === 'parent_id');
    assert.ok(parentFk, 'parent_id must declare a foreign key to tasks(id)');
    assert.equal(parentFk.table, 'tasks');
    assert.equal(parentFk.to, 'id');
    assert.equal(parentFk.on_delete, 'SET NULL');

    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('initStateDb migrates existing runtime constraints to Kimi without losing references', () => {
  const { dir, file } = tmpDbPath('ubp-kimi-runtime-upgrade');
  try {
    const legacy = openStateDb(file);
    const legacySchema = fs.readFileSync(SCHEMA_FILE, 'utf8').replaceAll(", 'kimi'", '');
    legacy.exec(legacySchema);
    legacy.prepare(
      "DELETE FROM schema_version WHERE version IN ('9.1', '10.0', '11.0', '12.0', '13.0', '14.0', '15.0', '16.0', '17.0', '18.0', '19.0', '20.0', '21.0', '22.0', '23.0')",
    ).run();
    legacy.prepare(
      "INSERT INTO tasks (id, title, type, priority) VALUES ('task-old', 'Old', 'feature', 'P1')",
    ).run();
    legacy.prepare(
      `INSERT INTO sessions
       (sid, task_id, runtime, worktree_path, artifact_dir, lease_expires_at)
       VALUES ('session-old', 'task-old', 'codex', '/tmp/worktree', '/tmp/artifacts', '2099-01-01T00:00:00.000Z')`,
    ).run();
    legacy.prepare(
      "INSERT INTO telemetry (session_id, event_type, tool_name) VALUES ('session-old', 'tool_call', 'task.list')",
    ).run();
    legacy.prepare(
      `INSERT INTO incidents
       (id, code, severity, message, session_id)
       VALUES ('incident-old', 'OLD', 'warning', 'preserve me', 'session-old')`,
    ).run();
    legacy.prepare(
      "INSERT INTO events (type, session_id, runtime) VALUES ('session_spawned', 'session-old', 'codex')",
    ).run();
    closeStateDb(legacy);

    const upgraded = initStateDb(file);
    assert.equal(upgraded.schema_version, EXPECTED_VERSION);
    assert.ok(upgraded.backup_path);
    assert.ok(fs.existsSync(upgraded.backup_path));
    assert.equal(upgraded.db.prepare("SELECT runtime FROM sessions WHERE sid = 'session-old'").get().runtime, 'codex');
    assert.equal(upgraded.db.prepare("SELECT COUNT(*) AS n FROM telemetry WHERE session_id = 'session-old'").get().n, 1);
    assert.equal(upgraded.db.prepare("SELECT COUNT(*) AS n FROM incidents WHERE session_id = 'session-old'").get().n, 1);
    assert.deepEqual(upgraded.db.pragma('foreign_key_check'), []);
    const migrations = upgraded.db.prepare(
      "SELECT to_version, notes FROM migration_history WHERE to_version IN ('9.1', '10.0', '11.0', '12.0', '13.0', '14.0', '15.0', '16.0', '17.0', '18.0', '19.0', '20.0') ORDER BY id",
    ).all();
    assert.ok(migrations.some((row) => row.to_version === '9.1' && /Kimi/.test(row.notes)));
    assert.ok(migrations.some((row) => row.to_version === '10.0' && /Context Spine/.test(row.notes)));
    assert.ok(migrations.some((row) => row.to_version === '11.0' && /baseline adoption/i.test(row.notes)));
    assert.ok(migrations.some((row) => row.to_version === '12.0' && /gap ledger|re-adoption/i.test(row.notes)));
    assert.ok(migrations.some((row) => row.to_version === '13.0' && /workflow runs/i.test(row.notes)));
    assert.ok(migrations.some((row) => row.to_version === '14.0' && /known-red|revalidate/i.test(row.notes)));
    assert.ok(migrations.some((row) => row.to_version === '16.0' && /decision dialogue|checkpoint/i.test(row.notes)));
    assert.ok(migrations.some((row) => row.to_version === '17.0' && /unborn Git|checkpoint/i.test(row.notes)));
    assert.ok(migrations.some((row) => row.to_version === '18.0' && /adaptive|capability/i.test(row.notes)));
    assert.ok(migrations.some((row) => row.to_version === '15.0' && /typed research|reconciliation/i.test(row.notes)));
    assert.ok(migrations.some((row) => row.to_version === '20.0' && /artifact registry|dependency/i.test(row.notes)));
    assert.deepEqual(
      upgraded.db.prepare("SELECT mode, status FROM baselines WHERE id = 'migrated-baseline'").get(),
      { mode: 'migrated', status: 'adopting' },
    );

    upgraded.db.prepare(
      "INSERT INTO tasks (id, title, type, priority) VALUES ('task-kimi', 'Kimi', 'feature', 'P1')",
    ).run();
    const session = stateOps.createSession(upgraded.db, {
      sid: 'session-kimi',
      task_id: 'task-kimi',
      runtime: 'kimi',
      worktree_path: '/tmp/kimi-worktree',
      artifact_dir: '/tmp/kimi-artifacts',
    });
    assert.equal(session.runtime, 'kimi');
    const event = stateOps.appendEvent(upgraded.db, { type: 'kimi-ready', runtime: 'kimi' });
    assert.ok(event.event_id > 0);
    closeStateDb(upgraded.db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('active lease index upgrade fails safely and reports every duplicate task lease', () => {
  const { dir, file } = tmpDbPath('ubp-active-lease-upgrade');
  try {
    const initialized = initStateDb(file);
    initialized.db.exec('DROP INDEX sessions_one_active_task');
    initialized.db.prepare(
      "INSERT INTO tasks (id, title, type, priority) VALUES ('duplicate-task', 'Duplicate', 'feature', 'P0')",
    ).run();
    const insert = initialized.db.prepare(
      `INSERT INTO sessions
       (sid, task_id, runtime, worktree_path, artifact_dir, status, lease_expires_at)
       VALUES (?, 'duplicate-task', 'codex', ?, ?, 'running', '2099-01-01T00:00:00.000Z')`,
    );
    insert.run('duplicate-a', '/tmp/duplicate-a', '/tmp/duplicate-a-artifacts');
    insert.run('duplicate-b', '/tmp/duplicate-b', '/tmp/duplicate-b-artifacts');
    initialized.db.prepare(
      'DELETE FROM schema_version WHERE version = ?',
    ).run(EXPECTED_VERSION);
    closeStateDb(initialized.db);

    let failure;
    assert.throws(
      () => initStateDb(file),
      (error) => {
        failure = error;
        return error.code === 'ACTIVE_SESSION_LEASE_CONFLICT'
          && error.message.includes('duplicate-task=[duplicate-a,duplicate-b]');
      },
    );
    assert.ok(failure.migration_backup_path);
    assert.ok(fs.existsSync(failure.migration_backup_path));

    const preserved = openStateDb(file);
    try {
      assert.deepEqual(
        preserved.prepare(
          "SELECT sid FROM sessions WHERE task_id = 'duplicate-task' ORDER BY sid",
        ).all(),
        [{ sid: 'duplicate-a' }, { sid: 'duplicate-b' }],
      );
      assert.equal(
        preserved.prepare(
          "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name = 'sessions_one_active_task'",
        ).get().count,
        0,
      );
    } finally {
      closeStateDb(preserved);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('old runtime schema reports all duplicate leases before rebuilding sessions', () => {
  const { dir, file } = tmpDbPath('ubp-old-runtime-active-lease-upgrade');
  try {
    const initialized = initStateDb(file);
    const db = initialized.db;
    db.pragma('foreign_keys = OFF');
    db.exec(`
      DROP INDEX sessions_one_active_task;
      DROP INDEX sessions_active;
      DROP INDEX sessions_lease;
      ALTER TABLE sessions RENAME TO sessions_current;
      CREATE TABLE sessions (
        sid               TEXT PRIMARY KEY,
        task_id           TEXT NOT NULL REFERENCES tasks(id),
        runtime           TEXT NOT NULL CHECK (runtime IN ('claude', 'opencode', 'codex')),
        pid               INTEGER,
        worktree_path     TEXT NOT NULL,
        artifact_dir      TEXT NOT NULL,
        status            TEXT NOT NULL DEFAULT 'running'
                            CHECK (status IN ('running', 'completed', 'crashed', 'orphan')),
        lease_expires_at  TEXT NOT NULL,
        heartbeat_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        started_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      DROP TABLE sessions_current;
      CREATE INDEX sessions_active ON sessions(status, task_id);
      CREATE INDEX sessions_lease ON sessions(lease_expires_at) WHERE status = 'running';
      DELETE FROM schema_version;
      INSERT INTO schema_version (version, description)
      VALUES ('9.0', 'pre-Kimi runtime constraints');
      INSERT INTO tasks (id, title, type, priority) VALUES
        ('duplicate-a-task', 'Duplicate A', 'feature', 'P0'),
        ('duplicate-b-task', 'Duplicate B', 'feature', 'P0');
      INSERT INTO sessions
        (sid, task_id, runtime, worktree_path, artifact_dir, status, lease_expires_at)
      VALUES
        ('a-claude', 'duplicate-a-task', 'claude', '/tmp/a-claude', '/tmp/a-claude-art', 'running', '2099-01-01T00:00:00.000Z'),
        ('a-codex', 'duplicate-a-task', 'codex', '/tmp/a-codex', '/tmp/a-codex-art', 'running', '2099-01-01T00:00:00.000Z'),
        ('b-claude', 'duplicate-b-task', 'claude', '/tmp/b-claude', '/tmp/b-claude-art', 'running', '2099-01-01T00:00:00.000Z'),
        ('b-opencode', 'duplicate-b-task', 'opencode', '/tmp/b-opencode', '/tmp/b-opencode-art', 'running', '2099-01-01T00:00:00.000Z');
    `);
    const originalSessionSql = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sessions'",
    ).get().sql;
    db.pragma('foreign_keys = ON');
    closeStateDb(db);

    let failure;
    assert.throws(
      () => initStateDb(file),
      (error) => {
        failure = error;
        return error instanceof ActiveSessionLeaseConflictError
          && error.code === 'ACTIVE_SESSION_LEASE_CONFLICT';
      },
    );
    assert.ok(failure.migration_backup_path);
    assert.ok(fs.existsSync(failure.migration_backup_path));
    assert.deepEqual(failure.details.conflicts, [
      {
        task_id: 'duplicate-a-task',
        lease_count: 2,
        session_ids: ['a-claude', 'a-codex'],
      },
      {
        task_id: 'duplicate-b-task',
        lease_count: 2,
        session_ids: ['b-claude', 'b-opencode'],
      },
    ]);

    const preserved = openStateDb(file);
    try {
      assert.equal(
        preserved.prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sessions'",
        ).get().sql,
        originalSessionSql,
      );
      assert.equal(
        preserved.prepare(
          "SELECT COUNT(*) AS count FROM sqlite_master WHERE name IN ('sessions_runtime_upgrade', 'events_runtime_upgrade')",
        ).get().count,
        0,
      );
      assert.deepEqual(
        preserved.prepare(
          "SELECT sid FROM sessions WHERE status = 'running' ORDER BY sid",
        ).all(),
        [
          { sid: 'a-claude' },
          { sid: 'a-codex' },
          { sid: 'b-claude' },
          { sid: 'b-opencode' },
        ],
      );
    } finally {
      closeStateDb(preserved);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('schema 19 artifact rows migrate losslessly into the typed registry with a recovery backup', () => {
  const { dir, file } = tmpDbPath('ubp-schema-19-artifact-upgrade');
  try {
    const initialized = initStateDb(file);
    const db = initialized.db;
    db.prepare(
      `INSERT INTO changes (id, title, kind, status, intent, artifact_root)
       VALUES ('legacy-change', 'Legacy artifact', 'quick', 'active',
               'Preserve the registered file.', '.ultra/changes/active/legacy-change')`,
    ).run();
    db.pragma('foreign_keys = OFF');
    db.exec(`
      DROP TABLE IF EXISTS artifact_edges;
      DROP INDEX IF EXISTS artifacts_change;
      ALTER TABLE artifacts RENAME TO artifacts_current;
      CREATE TABLE artifacts (
        id            TEXT PRIMARY KEY,
        change_id     TEXT NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
        task_id       TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        kind          TEXT NOT NULL,
        path          TEXT NOT NULL,
        content_hash  TEXT,
        metadata_json TEXT,
        status        TEXT NOT NULL DEFAULT 'current'
                        CHECK (status IN ('current', 'archived')),
        created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE(change_id, kind, path)
      );
      INSERT INTO artifacts
        (id, change_id, kind, path, content_hash, metadata_json, status)
      VALUES
        ('legacy-artifact', 'legacy-change', 'intent',
         '.ultra/changes/active/legacy-change/intent.md',
         'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
         '{"legacy":true}', 'current');
      DROP TABLE artifacts_current;
      CREATE INDEX artifacts_change ON artifacts(change_id, kind);
      DELETE FROM schema_version WHERE version IN ('20.0', '21.0', '22.0', '23.0');
    `);
    db.pragma('foreign_keys = ON');
    closeStateDb(db);

    const upgraded = initStateDb(file);
    assert.equal(upgraded.schema_version, EXPECTED_VERSION);
    assert.ok(upgraded.backup_path);
    assert.ok(fs.existsSync(upgraded.backup_path));
    const columns = new Set(
      upgraded.db.prepare('PRAGMA table_info(artifacts)').all().map((row) => row.name),
    );
    for (const column of [
      'owner_type', 'owner_id', 'digest', 'before_digest', 'after_digest',
      'provenance_json', 'managed',
    ]) {
      assert.ok(columns.has(column), `missing artifacts.${column}`);
    }
    assert.ok(tableNames(upgraded.db).includes('artifact_edges'));
    assert.deepEqual(
      upgraded.db.prepare(
        `SELECT id, owner_type, owner_id, digest, after_digest, managed
         FROM artifacts WHERE id = 'legacy-artifact'`,
      ).get(),
      {
        id: 'legacy-artifact',
        owner_type: 'change',
        owner_id: 'legacy-change',
        digest: 'a'.repeat(64),
        after_digest: 'a'.repeat(64),
        managed: 0,
      },
    );
    const migration = upgraded.db.prepare(
      "SELECT notes FROM migration_history WHERE to_version = '20.0' ORDER BY id DESC LIMIT 1",
    ).get();
    assert.match(migration.notes, /artifact registry|dependency/i);
    closeStateDb(upgraded.db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('artifact migration preflight reports canonical duplicate authority without changing legacy rows', () => {
  const { dir, file } = tmpDbPath('ubp-schema-19-artifact-duplicate');
  try {
    const initialized = initStateDb(file);
    const db = initialized.db;
    db.exec(`
      INSERT INTO changes (id, title, kind, status, intent, artifact_root)
      VALUES
        ('duplicate-change-a', 'Duplicate A', 'quick', 'active', 'A',
         '.ultra/changes/active/duplicate-change-a'),
        ('duplicate-change-b', 'Duplicate B', 'quick', 'active', 'B',
         '.ultra/changes/active/duplicate-change-b');
    `);
    db.pragma('foreign_keys = OFF');
    db.exec(`
      DROP TABLE IF EXISTS artifact_edges;
      DROP INDEX IF EXISTS artifacts_change;
      DROP INDEX IF EXISTS artifacts_owner;
      DROP INDEX IF EXISTS artifacts_path;
      ALTER TABLE artifacts RENAME TO artifacts_current;
      CREATE TABLE artifacts (
        id            TEXT PRIMARY KEY,
        change_id     TEXT NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
        task_id       TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        kind          TEXT NOT NULL,
        path          TEXT NOT NULL,
        content_hash  TEXT,
        metadata_json TEXT,
        status        TEXT NOT NULL DEFAULT 'current'
                        CHECK (status IN ('current', 'archived')),
        created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE(change_id, kind, path)
      );
      INSERT INTO artifacts
        (id, change_id, kind, path, content_hash, status)
      VALUES
        ('duplicate-artifact-a', 'duplicate-change-a', 'intent',
         './.ultra/specs/shared.md',
         'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
         'current'),
        ('duplicate-artifact-b', 'duplicate-change-b', 'evidence',
         '.ultra/specs/shared.md',
         'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
         'current');
      DROP TABLE artifacts_current;
      CREATE INDEX artifacts_change ON artifacts(change_id, kind);
      DELETE FROM schema_version WHERE version IN ('20.0', '21.0', '22.0', '23.0');
    `);
    db.pragma('foreign_keys = ON');
    closeStateDb(db);

    let failure;
    try {
      initStateDb(file);
    } catch (error) {
      failure = error;
    }
    assert.equal(failure?.code, 'ARTIFACT_AUTHORITY_CONFLICT');
    assert.deepEqual(
      failure?.details?.conflicts?.[0]?.artifact_ids,
      ['duplicate-artifact-a', 'duplicate-artifact-b'],
    );

    const preserved = openStateDb(file);
    try {
      assert.deepEqual(
        preserved.prepare('SELECT id, path FROM artifacts ORDER BY id').all(),
        [
          { id: 'duplicate-artifact-a', path: './.ultra/specs/shared.md' },
          { id: 'duplicate-artifact-b', path: '.ultra/specs/shared.md' },
        ],
      );
      assert.equal(
        preserved.prepare(
          "SELECT COUNT(*) AS count FROM pragma_table_info('artifacts') WHERE name = 'owner_type'",
        ).get().count,
        0,
      );
    } finally {
      closeStateDb(preserved);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
