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
} = require('./state-db.cjs');
const stateOps = require('./state-ops.cjs');

function tmpDbPath(prefix = 'ubp-state') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  return { dir, file: path.join(dir, 'state.db') };
}

test('initStateDb creates workflow tables without an Ultra memory store', () => {
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

test('schema 13 upgrades through 15 without demoting an established ready baseline', () => {
  const { dir, file } = tmpDbPath('ubp-schema-13-upgrade');
  try {
    const initial = initStateDb(file);
    initial.db.prepare(
      `INSERT INTO baselines
       (id, project_name, mode, status, approved_by, approval_note, converged_at)
       VALUES ('ready-13', 'fixture', 'greenfield', 'ready', 'owner',
               'Previously accepted baseline.', '2026-01-01T00:00:00.000Z')`,
    ).run();
    initial.db.prepare("DELETE FROM schema_version WHERE version IN ('14.0', '15.0')").run();
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
    legacy.prepare("DELETE FROM schema_version WHERE version IN ('9.1', '10.0', '11.0', '12.0', '13.0', '14.0', '15.0')").run();
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
      "SELECT to_version, notes FROM migration_history WHERE to_version IN ('9.1', '10.0', '11.0', '12.0', '13.0', '14.0', '15.0') ORDER BY id",
    ).all();
    assert.ok(migrations.some((row) => row.to_version === '9.1' && /Kimi/.test(row.notes)));
    assert.ok(migrations.some((row) => row.to_version === '10.0' && /Context Spine/.test(row.notes)));
    assert.ok(migrations.some((row) => row.to_version === '11.0' && /baseline adoption/i.test(row.notes)));
    assert.ok(migrations.some((row) => row.to_version === '12.0' && /gap ledger|re-adoption/i.test(row.notes)));
    assert.ok(migrations.some((row) => row.to_version === '13.0' && /workflow runs/i.test(row.notes)));
    assert.ok(migrations.some((row) => row.to_version === '14.0' && /known-red|revalidate/i.test(row.notes)));
    assert.ok(migrations.some((row) => row.to_version === '15.0' && /typed research|reconciliation/i.test(row.notes)));
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
