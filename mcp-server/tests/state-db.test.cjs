'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const stateDb = require('../lib/state-db.cjs');

test('initStateDb upgrades a v8A.1 database in place with estimated_days', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-db-upgrade-'));
  const file = path.join(dir, 'state.db');
  try {
    const db = stateDb.openStateDb(file);
    const oldSql = fs.readFileSync(stateDb.SCHEMA_FILE, 'utf8')
      .replace(/^\s*estimated_days.*\n/m, '')
      .replace(/^INSERT OR IGNORE INTO schema_version \(version, description\)\nVALUES \('8A\.2'.*\n/m, '');
    db.exec(oldSql);
    stateDb.closeStateDb(db);

    const upgraded = stateDb.initStateDb(file);
    const columns = upgraded.db.prepare('PRAGMA table_info(tasks)').all().map((row) => row.name);
    assert.ok(columns.includes('estimated_days'));
    assert.equal(upgraded.schema_version, '8A.2');
    assert.ok(upgraded.db.prepare("SELECT 1 FROM schema_version WHERE version = '8A.2'").get());
    stateDb.closeStateDb(upgraded.db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
