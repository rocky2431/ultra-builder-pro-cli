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
