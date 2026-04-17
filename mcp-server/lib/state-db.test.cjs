'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  EXPECTED_VERSION,
  REQUIRED_TABLES,
  initStateDb,
  closeStateDb,
  openStateDb,
  tableNames,
} = require('./state-db.cjs');

function tmpDbPath(prefix = 'ubp-state') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  return { dir, file: path.join(dir, 'state.db') };
}

test('initStateDb creates the seven required tables on a fresh file', () => {
  const { dir, file } = tmpDbPath();
  try {
    const init = initStateDb(file);
    assert.equal(init.created, true);
    assert.equal(init.schema_version, EXPECTED_VERSION);
    for (const t of REQUIRED_TABLES) {
      assert.ok(init.tables.includes(t), `missing table ${t}`);
    }
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
