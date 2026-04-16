'use strict';

const fs = require('node:fs');
const path = require('node:path');

const Database = require('better-sqlite3');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_FILE = path.join(REPO_ROOT, 'spec', 'schemas', 'state-db.sql');
const EXPECTED_VERSION = '4.5';

const REQUIRED_TABLES = Object.freeze([
  'tasks',
  'events',
  'sessions',
  'schema_version',
  'migration_history',
  'telemetry',
  'specs_refs',
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

function ensureSchemaVersion(db) {
  const row = db.prepare('SELECT version FROM schema_version ORDER BY applied_at DESC LIMIT 1').get();
  if (!row) {
    throw new Error('schema_version table missing seed row after schema apply');
  }
  if (row.version !== EXPECTED_VERSION) {
    throw new Error(
      `state.db schema_version mismatch: file has '${row.version}', expected '${EXPECTED_VERSION}'`,
    );
  }
  return row.version;
}

function initStateDb(dbPath) {
  const db = openStateDb(dbPath);
  const existing = new Set(tableNames(db));
  const missing = REQUIRED_TABLES.filter((t) => !existing.has(t));
  if (missing.length > 0) {
    applySchema(db);
  }
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
  applyPragmas,
  ensureSchemaVersion,
  initStateDb,
  closeStateDb,
  tableNames,
  runScript,
};
