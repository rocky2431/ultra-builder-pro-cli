'use strict';

const fs = require('node:fs');
const path = require('node:path');

const Database = require('better-sqlite3');

const REPO_ROOT = process.env.UBP_RUNTIME_ROOT
  ? path.resolve(process.env.UBP_RUNTIME_ROOT)
  : path.resolve(__dirname, '..', '..');
const SCHEMA_FILE = path.join(REPO_ROOT, 'spec', 'schemas', 'state-db.sql');
const EXPECTED_VERSION = '16.0';
const KIMI_SCHEMA_VERSION = '9.1';
const CONTEXT_SCHEMA_VERSION = '10.0';
const BASELINE_SCHEMA_VERSION = '11.0';
const ADOPTION_SCHEMA_VERSION = '12.0';
const WORKFLOW_SCHEMA_VERSION = '13.0';
const AUTHORITY_SCHEMA_VERSION = '14.0';
const SEMANTIC_SCHEMA_VERSION = '15.0';

const MIGRATED_GAPS = Object.freeze([{
  id: 'legacy-rebaseline-required',
  category: 'baseline_blocker',
  status: 'open',
  blocking: true,
  summary: 'Legacy Ultra state requires evidence-backed brownfield re-adoption.',
  evidence_refs: [],
  owner: null,
}]);

const REQUIRED_TABLES = Object.freeze([
  'baselines',
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
  'spec_learning_candidates',
  'trace_links',
  'incidents',
  'projection_jobs',
  'event_consumers',
  'workflow_runs',
  'workflow_steps',
  'decision_threads',
  'decision_items',
]);

function applyBaselineUpgrade(db, { legacyState = false } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS baselines (
      id                  TEXT PRIMARY KEY,
      project_name        TEXT NOT NULL,
      project_type        TEXT,
      stack               TEXT,
      mode                TEXT NOT NULL CHECK (mode IN ('greenfield', 'brownfield', 'migrated')),
      status              TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'adopting', 'blocked', 'ready', 'superseded')),
      repository_root     TEXT NOT NULL DEFAULT '.',
      scope_json          TEXT NOT NULL DEFAULT '["."]',
      repository_revision TEXT,
      repository_branch   TEXT,
      worktree_state      TEXT NOT NULL DEFAULT 'unavailable'
                              CHECK (worktree_state IN ('clean', 'dirty', 'unavailable')),
      worktree_digest     TEXT,
      worktree_files_json TEXT NOT NULL DEFAULT '[]',
      worktree_accepted   INTEGER NOT NULL DEFAULT 0 CHECK (worktree_accepted IN (0, 1)),
      known_red_accepted  INTEGER NOT NULL DEFAULT 0 CHECK (known_red_accepted IN (0, 1)),
      spec_refs_json      TEXT NOT NULL DEFAULT '[]',
      evidence_json       TEXT NOT NULL DEFAULT '[]',
      verification_json   TEXT NOT NULL DEFAULT '[]',
      unknowns_json       TEXT NOT NULL DEFAULT '[]',
      gaps_json           TEXT NOT NULL DEFAULT '[]',
      classification_json TEXT NOT NULL DEFAULT '{}',
      provider_refs_json  TEXT NOT NULL DEFAULT '{}',
      research_run_id     TEXT,
      approved_by         TEXT,
      approval_note       TEXT,
      started_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      converged_at        TEXT
    );
    CREATE INDEX IF NOT EXISTS baselines_status ON baselines(status, updated_at);
  `);
  if (legacyState && db.prepare('SELECT COUNT(*) AS count FROM baselines').get().count === 0) {
    db.prepare(
      `INSERT OR IGNORE INTO baselines
       (id, project_name, mode, status, gaps_json, approval_note)
       VALUES ('migrated-baseline', 'Migrated Ultra project', 'migrated', 'adopting', ?,
               'Legacy project preserved; owner re-adoption is required')`,
    ).run(JSON.stringify(MIGRATED_GAPS));
  }
}

function addColumnIfMissing(db, table, columns, name, definition) {
  if (!columns.has(name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    columns.add(name);
    return true;
  }
  return false;
}

function applyBaselineColumns(db) {
  if (!tableNames(db).includes('baselines')) return false;
  const columns = columnNames(db, 'baselines');
  let changed = false;
  changed = addColumnIfMissing(db, 'baselines', columns, 'repository_branch', 'TEXT') || changed;
  changed = addColumnIfMissing(
    db, 'baselines', columns, 'worktree_state',
    "TEXT NOT NULL DEFAULT 'unavailable' CHECK (worktree_state IN ('clean', 'dirty', 'unavailable'))",
  ) || changed;
  changed = addColumnIfMissing(db, 'baselines', columns, 'worktree_digest', 'TEXT') || changed;
  changed = addColumnIfMissing(
    db, 'baselines', columns, 'worktree_files_json', "TEXT NOT NULL DEFAULT '[]'",
  ) || changed;
  changed = addColumnIfMissing(
    db, 'baselines', columns, 'worktree_accepted',
    'INTEGER NOT NULL DEFAULT 0 CHECK (worktree_accepted IN (0, 1))',
  ) || changed;
  changed = addColumnIfMissing(
    db, 'baselines', columns, 'known_red_accepted',
    'INTEGER NOT NULL DEFAULT 0 CHECK (known_red_accepted IN (0, 1))',
  ) || changed;
  changed = addColumnIfMissing(db, 'baselines', columns, 'gaps_json', "TEXT NOT NULL DEFAULT '[]'") || changed;
  changed = addColumnIfMissing(
    db, 'baselines', columns, 'classification_json', "TEXT NOT NULL DEFAULT '{}'",
  ) || changed;
  changed = addColumnIfMissing(db, 'baselines', columns, 'research_run_id', 'TEXT') || changed;
  return changed;
}

function applyChangeColumns(db) {
  if (!tableNames(db).includes('changes')) return false;
  const columns = columnNames(db, 'changes');
  let changed = false;
  changed = addColumnIfMissing(db, 'changes', columns, 'baseline_bypass_json', 'TEXT') || changed;
  changed = addColumnIfMissing(db, 'changes', columns, 'contract_json', "TEXT NOT NULL DEFAULT '{}'") || changed;
  changed = addColumnIfMissing(db, 'changes', columns, 'classification_json', "TEXT NOT NULL DEFAULT '{}'") || changed;
  changed = addColumnIfMissing(
    db, 'changes', columns, 'research_disposition_json', "TEXT NOT NULL DEFAULT '{}'",
  ) || changed;
  changed = addColumnIfMissing(
    db, 'changes', columns, 'alignment_thread_id',
    'TEXT REFERENCES decision_threads(id) ON DELETE SET NULL',
  ) || changed;
  return changed;
}

function applySemanticAuthorityColumns(db) {
  let changed = false;
  if (tableNames(db).includes('workflow_steps')) {
    const columns = columnNames(db, 'workflow_steps');
    changed = addColumnIfMissing(
      db, 'workflow_steps', columns, 'semantic_records_json', "TEXT NOT NULL DEFAULT '[]'",
    ) || changed;
  }
  if (tableNames(db).includes('spec_learning_candidates')) {
    const columns = columnNames(db, 'spec_learning_candidates');
    for (const [name, definition] of [
      ['applied_ref', 'TEXT'],
      ['before_digest', 'TEXT'],
      ['after_digest', 'TEXT'],
      ['apply_evidence_json', "TEXT NOT NULL DEFAULT '[]'"],
    ]) {
      changed = addColumnIfMissing(db, 'spec_learning_candidates', columns, name, definition) || changed;
    }
  }
  return changed;
}

function quoteSqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function migrationBackup(db, dbPath, fromVersion, existingTables) {
  if (existingTables.size === 0 || fromVersion === EXPECTED_VERSION) return null;
  const parent = path.dirname(dbPath);
  const backupDir = path.basename(parent) === '.ultra' ? path.join(parent, 'backups') : path.join(parent, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const version = String(fromVersion || 'unknown').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const backupPath = path.join(backupDir, `state-pre-${version}-to-${EXPECTED_VERSION}-${stamp}.db`);
  db.exec(`VACUUM INTO ${quoteSqlString(backupPath)}`);
  return backupPath;
}

function readSchemaSql() {
  if (!fs.existsSync(SCHEMA_FILE)) {
    throw new Error(`state-db schema missing at ${SCHEMA_FILE}`);
  }
  return fs.readFileSync(SCHEMA_FILE, 'utf8');
}

function applyPragmas(db) {
  const journalMode = db.pragma('journal_mode = WAL', { simple: true });
  if (String(journalMode).toLowerCase() !== 'wal') {
    const error = new Error(
      `state.db requires SQLite WAL mode; storage returned ${String(journalMode || 'unknown')}`,
    );
    error.code = 'STATE_DB_WAL_UNAVAILABLE';
    throw error;
  }
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

function latestSchemaVersion(db) {
  if (!tableNames(db).includes('schema_version')) return null;
  return db.prepare(
    'SELECT version FROM schema_version ORDER BY applied_at DESC, rowid DESC LIMIT 1',
  ).get()?.version || null;
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
  const taskAdditions = [
    ['outcome', 'TEXT'],
    ['slice_kind', "TEXT CHECK (slice_kind IS NULL OR slice_kind IN ('tracer_bullet', 'expand_contract', 'integration_checkpoint'))"],
    ['public_seam', 'TEXT'],
    ['verification_command', 'TEXT'],
    ['acceptance_json', "TEXT NOT NULL DEFAULT '[]'"],
    ['context_refs_json', "TEXT NOT NULL DEFAULT '[]'"],
    ['docs_impact_json', "TEXT NOT NULL DEFAULT '{\"status\":\"unknown\",\"files\":[],\"rationale\":null}'"],
    ['ownership_json', "TEXT NOT NULL DEFAULT '{}'"],
  ];
  for (const [name, definition] of taskAdditions) {
    if (!taskColumns.has(name)) db.exec(`ALTER TABLE tasks ADD COLUMN ${name} ${definition}`);
  }
  if (tables.has('events')) {
    const eventColumns = columnNames(db, 'events');
    if (!eventColumns.has('change_id')) db.exec('ALTER TABLE events ADD COLUMN change_id TEXT');
  }
}

function applyContextSpineUpgrade(db) {
  const tables = new Set(tableNames(db));
  if (!tables.has('context_snapshots')) return false;
  let changed = !tables.has('spec_learning_candidates');
  const columns = columnNames(db, 'context_snapshots');
  const additions = [
    ['role', "TEXT NOT NULL DEFAULT 'plan' CHECK (role IN ('plan', 'implement', 'check', 'review'))"],
    ['gate', "TEXT NOT NULL DEFAULT 'alignment' CHECK (gate IN ('alignment', 'planning', 'implementation', 'verification', 'review', 'convergence', 'recovery'))"],
    ['next_action', "TEXT NOT NULL DEFAULT 'Resolve the next Ultra workflow action.'"],
    ['readiness', "TEXT NOT NULL DEFAULT 'ready' CHECK (readiness IN ('ready', 'blocked'))"],
    ['blockers_json', "TEXT NOT NULL DEFAULT '[]'"],
    ['context_json', "TEXT NOT NULL DEFAULT '{}'"],
    ['token_estimate', 'INTEGER NOT NULL DEFAULT 0 CHECK (token_estimate >= 0)'],
    ['token_budget', 'INTEGER NOT NULL DEFAULT 12000 CHECK (token_budget > 0)'],
  ];
  for (const [name, definition] of additions) {
    if (!columns.has(name)) {
      db.exec(`ALTER TABLE context_snapshots ADD COLUMN ${name} ${definition}`);
      changed = true;
    }
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS spec_learning_candidates (
      id            TEXT PRIMARY KEY,
      change_id     TEXT NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
      task_id       TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      target_ref    TEXT NOT NULL,
      summary       TEXT NOT NULL,
      evidence_json TEXT NOT NULL DEFAULT '[]',
      status        TEXT NOT NULL DEFAULT 'proposed'
                      CHECK (status IN ('proposed', 'approved', 'rejected', 'applied')),
      resolution    TEXT,
      proposed_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      resolved_at   TEXT,
      applied_at    TEXT
    );
    CREATE INDEX IF NOT EXISTS spec_learning_change
      ON spec_learning_candidates(change_id, status, proposed_at);
  `);
  return changed;
}

function tableSupportsKimi(db, table) {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(table);
  return typeof row?.sql === 'string' && row.sql.includes("'kimi'");
}

function upgradeRuntimeConstraints(db, fromVersion = latestSchemaVersion(db)) {
  if (tableSupportsKimi(db, 'events') && tableSupportsKimi(db, 'sessions')) return false;
  const previousVersion = fromVersion || 'unknown';
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
        KIMI_SCHEMA_VERSION,
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

function applyCompatibleUpgrades(db, fromVersion = latestSchemaVersion(db), { legacyState = false } = {}) {
  const runtimeChanged = upgradeRuntimeConstraints(db, fromVersion);
  db.transaction(() => {
    applyCompatibleColumns(db);
    const contextChanged = applyContextSpineUpgrade(db);
    const contextMigration = db.prepare(
      "SELECT 1 FROM migration_history WHERE to_version = '10.0' AND status = 'success' LIMIT 1",
    ).get();
    const needsContextMigration = Boolean(
      fromVersion && ![
        CONTEXT_SCHEMA_VERSION, BASELINE_SCHEMA_VERSION, ADOPTION_SCHEMA_VERSION,
        WORKFLOW_SCHEMA_VERSION, AUTHORITY_SCHEMA_VERSION, SEMANTIC_SCHEMA_VERSION, EXPECTED_VERSION,
      ].includes(fromVersion)
        && !contextMigration,
    );
    if (contextChanged || needsContextMigration) {
      db.prepare(
        `INSERT INTO migration_history
          (from_version, to_version, direction, status, notes)
         VALUES (?, ?, 'forward', 'success', ?)`,
      ).run(
        runtimeChanged ? KIMI_SCHEMA_VERSION : (fromVersion || 'unknown'),
        CONTEXT_SCHEMA_VERSION,
        'Add Context Spine role/gate readiness, execution contracts, breadcrumbs, and specification learning',
      );
    }
    applyBaselineUpgrade(db, { legacyState });
    applyBaselineColumns(db);
    applyChangeColumns(db);
    applySemanticAuthorityColumns(db);
    const baselineMigration = db.prepare(
      "SELECT 1 FROM migration_history WHERE to_version = '11.0' AND status = 'success' LIMIT 1",
    ).get();
    if (fromVersion && ![
      BASELINE_SCHEMA_VERSION, ADOPTION_SCHEMA_VERSION, WORKFLOW_SCHEMA_VERSION,
      AUTHORITY_SCHEMA_VERSION, SEMANTIC_SCHEMA_VERSION, EXPECTED_VERSION,
    ].includes(fromVersion)
      && !baselineMigration) {
      db.prepare(
        `INSERT INTO migration_history
          (from_version, to_version, direction, status, notes)
         VALUES (?, ?, 'forward', 'success', ?)`,
      ).run(
        fromVersion === CONTEXT_SCHEMA_VERSION ? fromVersion : CONTEXT_SCHEMA_VERSION,
        BASELINE_SCHEMA_VERSION,
        'Add authoritative greenfield and brownfield baseline adoption, evidence, convergence, and drift state',
      );
    }
    if (legacyState) {
      const legacyBaselines = db.prepare(
        "SELECT id, mode, status, classification_json, gaps_json FROM baselines WHERE status != 'superseded'",
      ).all();
      for (const baseline of legacyBaselines) {
        let classification = {};
        let gaps = [];
        try { classification = JSON.parse(baseline.classification_json || '{}'); } catch { classification = {}; }
        try { gaps = JSON.parse(baseline.gaps_json || '[]'); } catch { gaps = []; }
        if (!gaps.some((gap) => gap?.id === MIGRATED_GAPS[0].id)) gaps.push(MIGRATED_GAPS[0]);
        classification.migration = {
          previous_mode: baseline.mode,
          previous_status: baseline.status,
          from_schema: fromVersion || 'unknown',
          requires_research_workflow: true,
        };
        db.prepare(
          `UPDATE baselines SET mode = 'migrated', status = 'adopting',
           classification_json = ?, gaps_json = ?, approved_by = NULL, approval_note = ?,
           converged_at = NULL, research_run_id = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?`,
        ).run(
          JSON.stringify(classification), JSON.stringify(gaps),
          'Legacy project preserved; evidence-backed brownfield re-adoption is required',
          baseline.id,
        );
      }
      db.prepare(
        `UPDATE baselines SET status = 'adopting', approved_by = NULL, approval_note = ?,
         converged_at = NULL, worktree_state = 'unavailable', worktree_digest = NULL,
         worktree_files_json = '[]', worktree_accepted = 0,
         gaps_json = CASE WHEN gaps_json IS NULL OR gaps_json = '[]' THEN ? ELSE gaps_json END,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE mode = 'migrated' AND status != 'superseded'`,
      ).run(
        'Legacy project preserved; owner re-adoption is required',
        JSON.stringify(MIGRATED_GAPS),
      );
      const adoptionMigration = db.prepare(
        "SELECT 1 FROM migration_history WHERE to_version = '12.0' AND status = 'success' LIMIT 1",
      ).get();
      if (!adoptionMigration) {
        db.prepare(
          `INSERT INTO migration_history
            (from_version, to_version, direction, status, notes)
           VALUES (?, ?, 'forward', 'success', ?)`,
        ).run(
          BASELINE_SCHEMA_VERSION,
          ADOPTION_SCHEMA_VERSION,
          'Add repository snapshots, authoritative gap ledger, incident governance, and required re-adoption',
        );
      }
    }
    const workflowMigration = db.prepare(
      "SELECT 1 FROM migration_history WHERE to_version = '13.0' AND status = 'success' LIMIT 1",
    ).get();
    if (fromVersion && fromVersion !== EXPECTED_VERSION && !workflowMigration) {
      db.prepare(
        `INSERT INTO migration_history
          (from_version, to_version, direction, status, notes)
         VALUES (?, ?, 'forward', 'success', ?)`,
      ).run(
        fromVersion === ADOPTION_SCHEMA_VERSION ? fromVersion : ADOPTION_SCHEMA_VERSION,
        WORKFLOW_SCHEMA_VERSION,
        'Add durable cross-stage workflow runs, step evidence, output digests, blockers, and recovery',
      );
    }
    const authorityMigration = db.prepare(
      "SELECT 1 FROM migration_history WHERE to_version = '14.0' AND status = 'success' LIMIT 1",
    ).get();
    if (fromVersion && fromVersion !== EXPECTED_VERSION && !authorityMigration) {
      db.prepare(
        `INSERT INTO migration_history
          (from_version, to_version, direction, status, notes)
         VALUES (?, ?, 'forward', 'success', ?)`,
      ).run(
        fromVersion === WORKFLOW_SCHEMA_VERSION ? fromVersion : WORKFLOW_SCHEMA_VERSION,
        AUTHORITY_SCHEMA_VERSION,
        'Persist known-red acceptance and continuously revalidate ready baseline authority',
      );
    }
    const semanticMigration = db.prepare(
      "SELECT 1 FROM migration_history WHERE to_version = '15.0' AND status = 'success' LIMIT 1",
    ).get();
    if (fromVersion && fromVersion !== EXPECTED_VERSION && !semanticMigration) {
      db.prepare(
        `INSERT INTO migration_history
          (from_version, to_version, direction, status, notes)
         VALUES (?, ?, 'forward', 'success', ?)`,
      ).run(
        fromVersion === AUTHORITY_SCHEMA_VERSION ? fromVersion : AUTHORITY_SCHEMA_VERSION,
        SEMANTIC_SCHEMA_VERSION,
        'Add typed research semantics, complete change contracts, verified learning application, and reconciliation provenance',
      );
    }
    const dialogueMigration = db.prepare(
      "SELECT 1 FROM migration_history WHERE to_version = '16.0' AND status = 'success' LIMIT 1",
    ).get();
    if (fromVersion && fromVersion !== EXPECTED_VERSION && !dialogueMigration) {
      db.prepare(
        `INSERT INTO migration_history
          (from_version, to_version, direction, status, notes)
         VALUES (?, ?, 'forward', 'success', ?)`,
      ).run(
        fromVersion === SEMANTIC_SCHEMA_VERSION ? fromVersion : SEMANTIC_SCHEMA_VERSION,
        EXPECTED_VERSION,
        'Add durable one-question decision dialogue, owner checkpoints, and workflow alignment gates',
      );
    }
    db.exec('CREATE INDEX IF NOT EXISTS tasks_change ON tasks(change_id) WHERE change_id IS NOT NULL');
    db.exec('CREATE INDEX IF NOT EXISTS events_change ON events(change_id, id)');
    db.prepare(
      'INSERT OR IGNORE INTO schema_version (version, description) VALUES (?, ?)',
    ).run(
      EXPECTED_VERSION,
      'Durable one-question decision dialogue, owner checkpoints, and workflow alignment gates',
    );
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
  let db;
  let backupPath = null;
  try {
    db = openStateDb(dbPath);
    const existing = new Set(tableNames(db));
    const fromVersion = latestSchemaVersion(db);
    const legacyState = existing.size > 0
      && ![
        WORKFLOW_SCHEMA_VERSION, AUTHORITY_SCHEMA_VERSION, SEMANTIC_SCHEMA_VERSION, EXPECTED_VERSION,
      ].includes(fromVersion);
    backupPath = migrationBackup(db, dbPath, fromVersion, existing);
    applyCompatibleColumns(db);
    const missing = REQUIRED_TABLES.filter((t) => !existing.has(t));
    if (missing.length > 0) {
      applySchema(db);
    }
    applyCompatibleUpgrades(db, fromVersion, { legacyState });
    const version = ensureSchemaVersion(db);
    return {
      db,
      path: dbPath,
      schema_version: version,
      created: missing.length > 0,
      backup_path: backupPath,
      tables: tableNames(db).sort(),
    };
  } catch (error) {
    if (backupPath && error && typeof error === 'object') {
      error.migration_backup_path = backupPath;
    }
    closeStateDb(db);
    throw error;
  }
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
  MIGRATED_GAPS,
};
