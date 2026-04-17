'use strict';

const fs = require('node:fs');
const path = require('node:path');

const Database = require('better-sqlite3');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_FILE = path.join(REPO_ROOT, 'spec', 'schemas', 'state-db.sql');
const EXPECTED_VERSION = '5.2';

const REQUIRED_TABLES = Object.freeze([
  'tasks',
  'events',
  'sessions',
  'schema_version',
  'migration_history',
  'telemetry',
  'specs_refs',
  'circuit_breaker',
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
