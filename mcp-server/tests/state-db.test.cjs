'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const stateDb = require('../lib/state-db.cjs');
const stateOps = require('../lib/state-ops.cjs');

test('initStateDb upgrades a pre-10.0 database through Context Spine into baseline authority', () => {
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
      INSERT INTO tasks
        (id, title, type, priority, status, stale, complexity_hint, created_at, updated_at)
      VALUES
        ('legacy-tier', 'Legacy model-tier task', 'feature', 'P2', 'pending', 0,
         'opus', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    `);
    stateDb.closeStateDb(db);

    const upgraded = stateDb.initStateDb(file);
    const columns = upgraded.db.prepare('PRAGMA table_info(tasks)').all().map((row) => row.name);
    assert.ok(columns.includes('estimated_days'));
    assert.ok(columns.includes('change_id'));
    assert.equal(upgraded.db.prepare("SELECT complexity_hint FROM tasks WHERE id = 'legacy-tier'").get().complexity_hint, 'opus');
    assert.equal('complexity_hint' in stateOps.readTask(upgraded.db, 'legacy-tier'), false);
    const eventColumns = upgraded.db.prepare('PRAGMA table_info(events)').all().map((row) => row.name);
    assert.ok(eventColumns.includes('change_id'));
    assert.equal(upgraded.schema_version, stateDb.EXPECTED_VERSION);
    assert.ok(upgraded.backup_path);
    assert.ok(fs.existsSync(upgraded.backup_path));
    assert.ok(upgraded.db.prepare("SELECT 1 FROM schema_version WHERE version = '10.0'").get());
    const contextColumns = upgraded.db.prepare('PRAGMA table_info(context_snapshots)').all()
      .map((row) => row.name);
    for (const column of ['role', 'gate', 'next_action', 'readiness', 'context_json', 'token_budget']) {
      assert.ok(contextColumns.includes(column), column);
    }
    assert.ok(upgraded.db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'spec_learning_candidates'",
    ).get());
    const baseline = upgraded.db.prepare(
      "SELECT mode, status FROM baselines WHERE id = 'migrated-baseline'",
    ).get();
    assert.deepEqual(baseline, { mode: 'migrated', status: 'adopting' });
    const contextMigration = upgraded.db.prepare(
      "SELECT from_version, to_version, notes FROM migration_history WHERE to_version = '10.0' ORDER BY id DESC LIMIT 1",
    ).get();
    assert.equal(contextMigration.from_version, '9.1');
    assert.equal(contextMigration.to_version, '10.0');
    assert.match(contextMigration.notes, /Context Spine/);
    const baselineMigration = upgraded.db.prepare(
      "SELECT from_version, to_version, notes FROM migration_history WHERE to_version = '11.0' ORDER BY id DESC LIMIT 1",
    ).get();
    assert.equal(baselineMigration.from_version, '10.0');
    assert.match(baselineMigration.notes, /baseline adoption/i);
    const adoptionMigration = upgraded.db.prepare(
      "SELECT from_version, to_version, notes FROM migration_history WHERE to_version = '12.0' ORDER BY id DESC LIMIT 1",
    ).get();
    assert.equal(adoptionMigration.from_version, '11.0');
    assert.match(adoptionMigration.notes, /gap ledger|re-adoption/i);
    const migrated = upgraded.db.prepare(
      "SELECT gaps_json, worktree_state FROM baselines WHERE id = 'migrated-baseline'",
    ).get();
    assert.equal(migrated.worktree_state, 'unavailable');
    assert.equal(JSON.parse(migrated.gaps_json)[0].category, 'baseline_blocker');
    assert.ok(upgraded.db.prepare(
      "SELECT 1 FROM migration_history WHERE from_version = '8A.1' AND to_version = '9.1' AND notes LIKE '%Kimi%'",
    ).get());
    stateDb.closeStateDb(upgraded.db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
