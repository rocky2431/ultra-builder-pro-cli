'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const stateDb = require('../lib/state-db.cjs');

test('initStateDb upgrades a pre-9.0 database in place with task/event change linkage', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-db-upgrade-'));
  const file = path.join(dir, 'state.db');
  try {
    const db = stateDb.openStateDb(file);
    db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        priority TEXT NOT NULL,
        complexity INTEGER,
        status TEXT NOT NULL DEFAULT 'pending',
        deps TEXT,
        files_modified TEXT,
        session_id TEXT,
        stale INTEGER NOT NULL DEFAULT 0,
        complexity_hint TEXT,
        tag TEXT,
        trace_to TEXT,
        context_file TEXT,
        completion_commit TEXT,
        parent_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        type TEXT NOT NULL,
        task_id TEXT,
        session_id TEXT,
        runtime TEXT,
        payload_json TEXT
      );
      CREATE TABLE schema_version (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        description TEXT
      );
      INSERT INTO schema_version (version, applied_at, description)
      VALUES ('8A.1', '2026-01-01T00:00:00.000Z', 'legacy fixture');
    `);
    stateDb.closeStateDb(db);

    const upgraded = stateDb.initStateDb(file);
    const columns = upgraded.db.prepare('PRAGMA table_info(tasks)').all().map((row) => row.name);
    assert.ok(columns.includes('estimated_days'));
    assert.ok(columns.includes('change_id'));
    const eventColumns = upgraded.db.prepare('PRAGMA table_info(events)').all().map((row) => row.name);
    assert.ok(eventColumns.includes('change_id'));
    assert.equal(upgraded.schema_version, '9.0');
    assert.ok(upgraded.db.prepare("SELECT 1 FROM schema_version WHERE version = '9.0'").get());
    stateDb.closeStateDb(upgraded.db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
