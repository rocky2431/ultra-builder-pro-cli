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
    legacy.prepare("DELETE FROM schema_version WHERE version = '9.1'").run();
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
    assert.equal(upgraded.schema_version, '9.1');
    assert.equal(upgraded.db.prepare("SELECT runtime FROM sessions WHERE sid = 'session-old'").get().runtime, 'codex');
    assert.equal(upgraded.db.prepare("SELECT COUNT(*) AS n FROM telemetry WHERE session_id = 'session-old'").get().n, 1);
    assert.equal(upgraded.db.prepare("SELECT COUNT(*) AS n FROM incidents WHERE session_id = 'session-old'").get().n, 1);
    assert.deepEqual(upgraded.db.pragma('foreign_key_check'), []);

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
