'use strict';

const fs = require('node:fs');
const path = require('node:path');

const Database = require('better-sqlite3');

const REPO_ROOT = process.env.UBP_RUNTIME_ROOT
  ? path.resolve(process.env.UBP_RUNTIME_ROOT)
  : path.resolve(__dirname, '..', '..');
const SCHEMA_FILE = path.join(REPO_ROOT, 'spec', 'schemas', 'state-db.sql');
const EXPECTED_VERSION = '9.1';

const REQUIRED_TABLES = Object.freeze([
  'tasks',
  'events',
  'sessions',
  'schema_version',
  'migration_history',
  'telemetry',
  'specs_refs',
  'circuit_breaker',
  'changes',
  'artifacts',
  'context_snapshots',
  'trace_links',
  'incidents',
  'projection_jobs',
  'event_consumers',
]);

function readSchemaSql() {
  if (!fs.existsSync(SCHEMA_FILE)) {
    throw new Error(`state-db schema missing at ${SCHEMA_FILE}`);
  }
  return fs.readFileSync(SCHEMA_FILE, 'utf8');
}

function applyPragmas(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
}

function runScript(db, sql) {
  const runner = db.exec.bind(db);
  db.transaction(() => runner(sql))();
}

function openStateDb(dbPath) {
  if (!dbPath) throw new Error('openStateDb: dbPath required');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  applyPragmas(db);
  return db;
}

function tableNames(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => r.name);
}

function applySchema(db) {
  runScript(db, readSchemaSql());
}

function columnNames(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
}

function applyCompatibleColumns(db) {
  const tables = new Set(tableNames(db));
  if (!tables.has('tasks')) return;
  const taskColumns = columnNames(db, 'tasks');
  if (!taskColumns.has('estimated_days')) {
    db.exec('ALTER TABLE tasks ADD COLUMN estimated_days REAL CHECK (estimated_days IS NULL OR estimated_days > 0)');
  }
  if (!taskColumns.has('change_id')) {
    db.exec('ALTER TABLE tasks ADD COLUMN change_id TEXT REFERENCES changes(id) ON DELETE SET NULL');
  }
  if (tables.has('events')) {
    const eventColumns = columnNames(db, 'events');
    if (!eventColumns.has('change_id')) db.exec('ALTER TABLE events ADD COLUMN change_id TEXT');
  }
}

function tableSupportsKimi(db, table) {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(table);
  return typeof row?.sql === 'string' && row.sql.includes("'kimi'");
}

function upgradeRuntimeConstraints(db) {
  if (tableSupportsKimi(db, 'events') && tableSupportsKimi(db, 'sessions')) return false;
  const previousVersion = db.prepare(
    'SELECT version FROM schema_version ORDER BY applied_at DESC LIMIT 1',
  ).get()?.version || 'unknown';
  const foreignKeys = db.pragma('foreign_keys', { simple: true });
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(`
        DROP TABLE IF EXISTS events_runtime_upgrade;
        CREATE TABLE events_runtime_upgrade (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          ts            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          type          TEXT    NOT NULL,
          task_id       TEXT,
          change_id     TEXT,
          session_id    TEXT,
          runtime       TEXT CHECK (runtime IS NULL OR runtime IN ('claude', 'opencode', 'codex', 'kimi')),
          payload_json  TEXT
        );
        INSERT INTO events_runtime_upgrade
          (id, ts, type, task_id, change_id, session_id, runtime, payload_json)
        SELECT id, ts, type, task_id, change_id, session_id, runtime, payload_json FROM events;
        DROP TABLE events;
        ALTER TABLE events_runtime_upgrade RENAME TO events;
        CREATE INDEX events_ts_type ON events(ts, type);
        CREATE INDEX events_task ON events(task_id, id);
        CREATE INDEX events_session ON events(session_id, id);
        CREATE INDEX events_change ON events(change_id, id);

        DROP TABLE IF EXISTS sessions_runtime_upgrade;
        CREATE TABLE sessions_runtime_upgrade (
          sid               TEXT PRIMARY KEY,
          task_id           TEXT NOT NULL REFERENCES tasks(id),
          runtime           TEXT NOT NULL CHECK (runtime IN ('claude', 'opencode', 'codex', 'kimi')),
          pid               INTEGER,
          worktree_path     TEXT NOT NULL,
          artifact_dir      TEXT NOT NULL,
          status            TEXT NOT NULL DEFAULT 'running'
                              CHECK (status IN ('running', 'completed', 'crashed', 'orphan')),
          lease_expires_at  TEXT NOT NULL,
          heartbeat_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          started_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        INSERT INTO sessions_runtime_upgrade
          (sid, task_id, runtime, pid, worktree_path, artifact_dir, status,
           lease_expires_at, heartbeat_at, started_at)
        SELECT sid, task_id, runtime, pid, worktree_path, artifact_dir, status,
               lease_expires_at, heartbeat_at, started_at FROM sessions;
        DROP TABLE sessions;
        ALTER TABLE sessions_runtime_upgrade RENAME TO sessions;
        CREATE INDEX sessions_active ON sessions(status, task_id);
        CREATE INDEX sessions_lease ON sessions(lease_expires_at) WHERE status = 'running';
      `);
      db.prepare(
        `INSERT INTO migration_history
          (from_version, to_version, direction, status, notes)
         VALUES (?, ?, 'forward', 'success', ?)`,
      ).run(
        previousVersion,
        EXPECTED_VERSION,
        'Add Kimi to durable event and session runtime constraints',
      );
      const violations = db.pragma('foreign_key_check');
      if (violations.length > 0) {
        throw new Error(`runtime constraint migration produced ${violations.length} foreign key violation(s)`);
      }
    })();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`);
  }
  return true;
}

function applyCompatibleUpgrades(db) {
  upgradeRuntimeConstraints(db);
  db.transaction(() => {
    applyCompatibleColumns(db);
    db.exec('CREATE INDEX IF NOT EXISTS tasks_change ON tasks(change_id) WHERE change_id IS NOT NULL');
    db.exec('CREATE INDEX IF NOT EXISTS events_change ON events(change_id, id)');
    db.prepare(
      'INSERT OR IGNORE INTO schema_version (version, description) VALUES (?, ?)',
    ).run(EXPECTED_VERSION, 'Kimi runtime support with durable event and session state');
  })();
}

function ensureSchemaVersion(db) {
  // schema_version is an audit trail — multiple rows across phase upgrades.
  // Guard by checking whether the expected version row exists rather than
  // relying on applied_at ordering (same-tick inserts from the seed block
  // make `ORDER BY applied_at DESC LIMIT 1` non-deterministic).
  const row = db.prepare('SELECT version FROM schema_version WHERE version = ?').get(EXPECTED_VERSION);
  if (!row) {
    const latest = db.prepare('SELECT version FROM schema_version ORDER BY applied_at DESC LIMIT 1').get();
    throw new Error(
      `state.db schema_version mismatch: expected '${EXPECTED_VERSION}', file has '${latest ? latest.version : '(empty)'}'`,
    );
  }
  return row.version;
}

function initStateDb(dbPath) {
  const db = openStateDb(dbPath);
  const existing = new Set(tableNames(db));
  applyCompatibleColumns(db);
  const missing = REQUIRED_TABLES.filter((t) => !existing.has(t));
  if (missing.length > 0) {
    applySchema(db);
  }
  applyCompatibleUpgrades(db);
  const version = ensureSchemaVersion(db);
  return {
    db,
    path: dbPath,
    schema_version: version,
    created: missing.length > 0,
    tables: tableNames(db).sort(),
  };
}

function closeStateDb(db) {
  if (db && typeof db.close === 'function') {
    db.close();
  }
}

module.exports = {
  EXPECTED_VERSION,
  REQUIRED_TABLES,
  SCHEMA_FILE,
  openStateDb,
  applySchema,
  applyCompatibleUpgrades,
  applyPragmas,
  ensureSchemaVersion,
  initStateDb,
  closeStateDb,
  tableNames,
  runScript,
};
