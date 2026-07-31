'use strict';

const fs = require('node:fs');
const path = require('node:path');

const Database = require('better-sqlite3');

const REPO_ROOT = process.env.UBP_RUNTIME_ROOT
  ? path.resolve(process.env.UBP_RUNTIME_ROOT)
  : path.resolve(__dirname, '..', '..');
const SCHEMA_FILE = path.join(REPO_ROOT, 'spec', 'schemas', 'state-db.sql');
const EXPECTED_VERSION = '23.0';
const KIMI_SCHEMA_VERSION = '9.1';
const CONTEXT_SCHEMA_VERSION = '10.0';
const BASELINE_SCHEMA_VERSION = '11.0';
const ADOPTION_SCHEMA_VERSION = '12.0';
const WORKFLOW_SCHEMA_VERSION = '13.0';
const AUTHORITY_SCHEMA_VERSION = '14.0';
const SEMANTIC_SCHEMA_VERSION = '15.0';
const DIALOGUE_SCHEMA_VERSION = '16.0';
const GIT_AUTHORITY_SCHEMA_VERSION = '17.0';
const ADAPTIVE_SCHEMA_VERSION = '18.0';
const DECISION_COMPLETION_SCHEMA_VERSION = '19.0';
const ARTIFACT_REGISTRY_SCHEMA_VERSION = '20.0';
const KERNEL_SCHEMA_VERSION = '21.0';
const CHECKPOINT_NATIVE_SCHEMA_VERSION = '22.0';
const SEMANTIC_KERNEL_SCHEMA_VERSION = '23.0';

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
  'artifact_edges',
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
  'stage_checkpoints',
  'decision_records',
  'context_envelopes',
  'worker_packets',
]);

class ActiveSessionLeaseConflictError extends Error {
  constructor(conflicts) {
    super(
      'state.db has duplicate active task leases; resolve the conflicting sessions before upgrade: '
      + conflicts.map((row) => `${row.task_id}=[${row.session_ids.join(',')}]`).join('; '),
    );
    this.name = 'ActiveSessionLeaseConflictError';
    this.code = 'ACTIVE_SESSION_LEASE_CONFLICT';
    this.details = { conflicts };
  }
}

class ArtifactAuthorityConflictError extends Error {
  constructor(conflicts) {
    super(
      'state.db has duplicate active artifact authority for canonical paths: '
      + conflicts.map((row) => `${row.path}=[${row.artifact_ids.join(',')}]`).join('; '),
    );
    this.name = 'ArtifactAuthorityConflictError';
    this.code = 'ARTIFACT_AUTHORITY_CONFLICT';
    this.details = { conflicts };
  }
}

function canonicalArtifactPath(value) {
  const raw = String(value || '').trim().replaceAll('\\', '/');
  if (!raw || path.posix.isAbsolute(raw)) {
    throw new ArtifactAuthorityConflictError([{
      path: raw || '(empty)',
      artifact_ids: [],
      reason: 'invalid_path',
    }]);
  }
  const normalized = path.posix.normalize(raw).replace(/^\.\//, '');
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new ArtifactAuthorityConflictError([{
      path: raw,
      artifact_ids: [],
      reason: 'path_escape',
    }]);
  }
  return normalized;
}

function activeArtifactPathConflicts(db) {
  if (!tableNames(db).includes('artifacts')) return [];
  const columns = columnNames(db, 'artifacts');
  if (!columns.has('id') || !columns.has('path')) return [];
  const hasStatus = columns.has('status');
  const rows = db.prepare(
    `SELECT id, path FROM artifacts${hasStatus ? " WHERE status <> 'archived'" : ''}
     ORDER BY id`,
  ).all();
  const grouped = new Map();
  for (const row of rows) {
    const canonical = canonicalArtifactPath(row.path);
    const ids = grouped.get(canonical) || [];
    ids.push(row.id);
    grouped.set(canonical, ids);
  }
  return [...grouped.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([artifactPath, ids]) => ({ path: artifactPath, artifact_ids: ids }));
}

function assertNoDuplicateActiveArtifactPaths(db) {
  const conflicts = activeArtifactPathConflicts(db);
  if (conflicts.length > 0) throw new ArtifactAuthorityConflictError(conflicts);
  return true;
}

function normalizeStoredArtifactPaths(db) {
  if (!tableNames(db).includes('artifacts')) return false;
  assertNoDuplicateActiveArtifactPaths(db);
  const rows = db.prepare('SELECT id, path FROM artifacts ORDER BY id').all();
  let changed = false;
  const update = db.prepare('UPDATE artifacts SET path = ? WHERE id = ?');
  for (const row of rows) {
    const canonical = canonicalArtifactPath(row.path);
    if (canonical !== row.path) {
      update.run(canonical, row.id);
      changed = true;
    }
  }
  return changed;
}

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
                              CHECK (worktree_state IN ('clean', 'dirty', 'unborn', 'unavailable')),
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
      research_checkpoint_id TEXT,
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
    "TEXT NOT NULL DEFAULT 'unavailable' CHECK (worktree_state IN ('clean', 'dirty', 'unborn', 'unavailable'))",
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
  changed = addColumnIfMissing(
    db,
    'baselines',
    columns,
    'research_checkpoint_id',
    'TEXT',
  ) || changed;
  if (columns.has('research_checkpoint_id')
      && tableNames(db).includes('stage_checkpoints')) {
    const result = db.prepare(
      `UPDATE baselines
       SET research_checkpoint_id = research_run_id
       WHERE research_checkpoint_id IS NULL
         AND research_run_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM stage_checkpoints
           WHERE stage_checkpoints.id = baselines.research_run_id
             AND stage_checkpoints.stage = 'research'
         )`,
    ).run();
    changed = result.changes > 0 || changed;
  }
  return changed;
}

function applyKernelIntegrityColumns(db) {
  const tables = new Set(tableNames(db));
  let changed = false;
  if (tables.has('context_envelopes')) {
    const columns = columnNames(db, 'context_envelopes');
    changed = addColumnIfMissing(
      db,
      'context_envelopes',
      columns,
      'file_digest',
      'TEXT',
    ) || changed;
  }
  if (tables.has('worker_packets')) {
    const columns = columnNames(db, 'worker_packets');
    for (const [name, definition] of [
      ['file_digest', 'TEXT'],
      ['status', "TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('pending', 'assigned', 'abandoned'))"],
      ['assigned_at', 'TEXT'],
      ['abandoned_at', 'TEXT'],
      ['abandon_reason', 'TEXT'],
    ]) {
      changed = addColumnIfMissing(
        db,
        'worker_packets',
        columns,
        name,
        definition,
      ) || changed;
    }
  }
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
  changed = addColumnIfMissing(
    db, 'changes', columns, 'supersedes_id',
    'TEXT REFERENCES changes(id) ON DELETE SET NULL',
  ) || changed;
  return changed;
}

function upgradeSemanticKernelConstraints(db) {
  const tables = new Set(tableNames(db));
  if (!tables.has('changes') || !tables.has('tasks')) return false;
  const taskColumns = columnNames(db, 'tasks');
  const preservesLegacyComplexityHint = taskColumns.has('complexity_hint');
  const changesSql = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'changes'",
  ).get()?.sql || '';
  const tasksSql = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tasks'",
  ).get()?.sql || '';
  const current = /length\s*\(\s*trim\s*\(\s*kind\s*\)\s*\)\s+BETWEEN\s+1\s+AND\s+80/i
    .test(changesSql)
    && /length\s*\(\s*trim\s*\(\s*type\s*\)\s*\)\s+BETWEEN\s+1\s+AND\s+80/i
      .test(tasksSql)
    && /length\s*\(\s*trim\s*\(\s*priority\s*\)\s*\)\s+BETWEEN\s+1\s+AND\s+80/i
      .test(tasksSql)
    && /length\s*\(\s*trim\s*\(\s*slice_kind\s*\)\s*\)\s+BETWEEN\s+1\s+AND\s+80/i
      .test(tasksSql)
    && columnNames(db, 'changes').has('supersedes_id');
  if (current) return false;

  const foreignKeys = db.pragma('foreign_keys', { simple: true });
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(`
        DROP TABLE IF EXISTS changes_semantic_kernel_upgrade;
        CREATE TABLE changes_semantic_kernel_upgrade (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (length(trim(kind)) BETWEEN 1 AND 80),
          status TEXT NOT NULL DEFAULT 'active'
            CHECK (status IN ('active', 'blocked', 'ready', 'archived', 'cancelled')),
          intent TEXT NOT NULL,
          docs_impact_json TEXT NOT NULL DEFAULT '{"status":"unknown","files":[],"rationale":null}',
          provider_refs_json TEXT NOT NULL DEFAULT '{}',
          baseline_bypass_json TEXT,
          contract_json TEXT NOT NULL DEFAULT '{}',
          classification_json TEXT NOT NULL DEFAULT '{}',
          research_disposition_json TEXT NOT NULL DEFAULT '{}',
          alignment_thread_id TEXT REFERENCES decision_threads(id) ON DELETE SET NULL,
          base_commit TEXT,
          supersedes_id TEXT REFERENCES changes_semantic_kernel_upgrade(id) ON DELETE SET NULL,
          artifact_root TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          closed_at TEXT
        );
        INSERT INTO changes_semantic_kernel_upgrade (
          id, title, kind, status, intent, docs_impact_json, provider_refs_json,
          baseline_bypass_json, contract_json, classification_json,
          research_disposition_json, alignment_thread_id, base_commit,
          supersedes_id, artifact_root, created_at, updated_at, closed_at
        )
        SELECT
          id, title, kind, status, intent, docs_impact_json, provider_refs_json,
          baseline_bypass_json, contract_json, classification_json,
          research_disposition_json, alignment_thread_id, base_commit,
          supersedes_id, artifact_root, created_at, updated_at, closed_at
        FROM changes;

        DROP TABLE IF EXISTS tasks_semantic_kernel_upgrade;
        CREATE TABLE tasks_semantic_kernel_upgrade (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          type TEXT NOT NULL CHECK (length(trim(type)) BETWEEN 1 AND 80),
          priority TEXT NOT NULL CHECK (length(trim(priority)) BETWEEN 1 AND 80),
          complexity INTEGER CHECK (complexity BETWEEN 1 AND 10),
          estimated_days REAL CHECK (estimated_days IS NULL OR estimated_days > 0),
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked', 'expanded')),
          deps TEXT,
          files_modified TEXT,
          session_id TEXT,
          stale INTEGER NOT NULL DEFAULT 0 CHECK (stale IN (0, 1)),
          ${preservesLegacyComplexityHint ? 'complexity_hint TEXT,' : ''}
          tag TEXT,
          trace_to TEXT,
          outcome TEXT,
          slice_kind TEXT CHECK (
            slice_kind IS NULL OR length(trim(slice_kind)) BETWEEN 1 AND 80
          ),
          public_seam TEXT,
          verification_command TEXT,
          acceptance_json TEXT NOT NULL DEFAULT '[]',
          context_refs_json TEXT NOT NULL DEFAULT '[]',
          docs_impact_json TEXT NOT NULL DEFAULT '{"status":"unknown","files":[],"rationale":null}',
          ownership_json TEXT NOT NULL DEFAULT '{}',
          context_file TEXT,
          completion_commit TEXT,
          change_id TEXT REFERENCES changes_semantic_kernel_upgrade(id) ON DELETE SET NULL,
          parent_id TEXT REFERENCES tasks_semantic_kernel_upgrade(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        INSERT INTO tasks_semantic_kernel_upgrade (
          id, title, type, priority, complexity, estimated_days, status, deps,
          files_modified, session_id, stale,
          ${preservesLegacyComplexityHint ? 'complexity_hint,' : ''}
          tag, trace_to, outcome, slice_kind,
          public_seam, verification_command, acceptance_json, context_refs_json,
          docs_impact_json, ownership_json, context_file, completion_commit,
          change_id, parent_id, created_at, updated_at
        )
        SELECT
          id, title, type, priority, complexity, estimated_days, status, deps,
          files_modified, session_id, stale,
          ${preservesLegacyComplexityHint ? 'complexity_hint,' : ''}
          tag, trace_to, outcome, slice_kind,
          public_seam, verification_command, acceptance_json, context_refs_json,
          docs_impact_json, ownership_json, context_file, completion_commit,
          change_id, parent_id, created_at, updated_at
        FROM tasks;

        DROP TABLE tasks;
        DROP TABLE changes;
        ALTER TABLE changes_semantic_kernel_upgrade RENAME TO changes;
        ALTER TABLE tasks_semantic_kernel_upgrade RENAME TO tasks;
        CREATE INDEX changes_status ON changes(status, created_at);
        CREATE INDEX changes_kind ON changes(kind, created_at);
        CREATE INDEX tasks_status ON tasks(status);
        CREATE INDEX tasks_tag ON tasks(tag);
        CREATE INDEX tasks_session ON tasks(session_id) WHERE session_id IS NOT NULL;
        CREATE INDEX tasks_stale ON tasks(stale) WHERE stale = 1;
        CREATE INDEX tasks_parent ON tasks(parent_id) WHERE parent_id IS NOT NULL;
        CREATE INDEX tasks_change ON tasks(change_id) WHERE change_id IS NOT NULL;
      `);
      const violations = db.pragma('foreign_key_check');
      if (violations.length > 0) {
        throw new Error(
          `semantic kernel migration produced ${violations.length} foreign key violation(s)`,
        );
      }
    })();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`);
  }
  return true;
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
  assertNoDuplicateActiveSessionLeases(db);
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
    ['slice_kind', 'TEXT CHECK (slice_kind IS NULL OR length(trim(slice_kind)) BETWEEN 1 AND 80)'],
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
    ['next_action', "TEXT NOT NULL DEFAULT ''"],
    ['allowed_transitions_json', "TEXT NOT NULL DEFAULT '[]'"],
    ['required_transition', 'TEXT'],
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

function migrateAdaptiveWorkflowRuns(db, fromVersion = latestSchemaVersion(db)) {
  const tables = new Set(tableNames(db));
  if (!tables.has('workflow_runs') || !tables.has('workflow_steps')) return false;
  const existing = db.prepare(
    "SELECT 1 FROM migration_history WHERE to_version = '18.0' AND status = 'success' LIMIT 1",
  ).get();
  if ([
    ADAPTIVE_SCHEMA_VERSION, DECISION_COMPLETION_SCHEMA_VERSION,
    ARTIFACT_REGISTRY_SCHEMA_VERSION, KERNEL_SCHEMA_VERSION,
    CHECKPOINT_NATIVE_SCHEMA_VERSION, SEMANTIC_KERNEL_SCHEMA_VERSION,
  ].includes(fromVersion) || existing) {
    return false;
  }

  const obsoleteSteps = Object.freeze({
    init: ['establish-baseline'],
    change: ['plan-change', 'compile-context', 'verify-readiness'],
    plan: ['select-posture', 'approve-plan'],
    deliver: ['release-if-authorized'],
  });
  const activeRuns = db.prepare(
    `SELECT id, kind, status FROM workflow_runs
     WHERE status IN ('active', 'blocked', 'ready')`,
  ).all();
  const isCompleted = db.prepare(
    "SELECT status FROM workflow_steps WHERE run_id = ? AND step_id = ?",
  );
  const currentRequired = db.prepare(
    `SELECT step_id FROM workflow_steps
     WHERE run_id = ? AND required = 1 AND status NOT IN ('completed', 'skipped')
     ORDER BY position ASC LIMIT 1`,
  );
  const skipObsolete = db.prepare(
    `UPDATE workflow_steps
     SET required = 0,
         status = CASE WHEN status IN ('pending', 'in_progress', 'blocked') THEN 'skipped' ELSE status END,
         blockers_json = CASE WHEN status IN ('pending', 'in_progress', 'blocked') THEN '[]' ELSE blockers_json END,
         skip_reason = CASE
           WHEN status IN ('pending', 'in_progress', 'blocked')
           THEN 'Removed by schema 18 adaptive workflow migration; durable evidence is preserved.'
           ELSE skip_reason
         END,
         completed_at = CASE
           WHEN status IN ('pending', 'in_progress', 'blocked')
           THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           ELSE completed_at
         END,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE run_id = ? AND step_id = ?`,
  );
  const completeRun = db.prepare(
    `UPDATE workflow_runs
     SET status = 'completed', current_step = NULL, blockers_json = '[]',
         definition_version = '2.0', summary_json = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         completed_at = COALESCE(completed_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     WHERE id = ?`,
  );
  for (const run of activeRuns) {
    for (const stepId of obsoleteSteps[run.kind] || []) skipObsolete.run(run.id, stepId);

    if (run.kind === 'init') {
      const scaffoldReady = ['inspect-authority', 'classify-repository', 'scaffold-authority']
        .every((stepId) => isCompleted.get(run.id, stepId)?.status === 'completed');
      if (scaffoldReady) {
        db.prepare(
          `UPDATE workflow_steps
           SET status = 'completed',
               evidence_json = CASE WHEN evidence_json = '[]' THEN ? ELSE evidence_json END,
               blockers_json = '[]',
               started_at = COALESCE(started_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
               completed_at = COALESCE(completed_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE run_id = ? AND step_id = 'verify-initialization'
             AND status IN ('pending', 'in_progress', 'blocked')`,
        ).run(JSON.stringify([{
          kind: 'migration',
          ref: 'schema:18.0',
          summary: 'Existing scaffold and durable authority were preserved during adaptive migration.',
        }]), run.id);
        if (!currentRequired.get(run.id)) {
          completeRun.run(JSON.stringify({
            migrated: true,
            authority_basis: 'initialized_scaffold',
            research_started: false,
          }), run.id);
          continue;
        }
      }
    }

    if (run.kind === 'change') {
      const contractCaptured = ['bind-baseline', 'classify-change', 'record-intent']
        .every((stepId) => isCompleted.get(run.id, stepId)?.status === 'completed');
      if (contractCaptured && !currentRequired.get(run.id)) {
        completeRun.run(JSON.stringify({
          migrated: true,
          authority_basis: 'accepted_change_contract',
        }), run.id);
        continue;
      }
    }

    const next = currentRequired.get(run.id)?.step_id || null;
    db.prepare(
      `UPDATE workflow_runs
       SET definition_version = '2.0', current_step = ?, blockers_json = '[]',
           status = CASE
             WHEN ? IS NULL AND status IN ('active', 'blocked') THEN 'ready'
             WHEN ? IS NOT NULL AND status = 'blocked' THEN 'active'
             ELSE status
           END,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
    ).run(next, next, next, run.id);
  }
  db.prepare(
    `UPDATE context_snapshots
     SET allowed_transitions_json = COALESCE(allowed_transitions_json, '[]'),
         required_transition = NULL
     WHERE allowed_transitions_json IS NULL OR required_transition IS NOT NULL`,
  ).run();
  return true;
}

function tableSupportsRuntime(db, table, runtime) {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(table);
  return typeof row?.sql === 'string' && row.sql.includes(`'${runtime}'`);
}

function baselineSupportsUnbornGit(db) {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'baselines'",
  ).get();
  return typeof row?.sql === 'string' && row.sql.includes("'unborn'");
}

function decisionThreadsSupportCompletion(db) {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'decision_threads'",
  ).get();
  if (typeof row?.sql !== 'string' || !row.sql.includes("'completed'")) return false;
  return columnNames(db, 'decision_threads').has('completed_at');
}

function upgradeDecisionThreadLifecycle(db) {
  if (!tableNames(db).includes('decision_threads') || decisionThreadsSupportCompletion(db)) {
    return false;
  }
  const foreignKeys = db.pragma('foreign_keys', { simple: true });
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(`
        DROP TABLE IF EXISTS decision_threads_completion_upgrade;
        CREATE TABLE decision_threads_completion_upgrade (
          id                 TEXT PRIMARY KEY,
          purpose            TEXT NOT NULL,
          mode               TEXT NOT NULL DEFAULT 'guided'
                               CHECK (mode IN ('guided', 'fast', 'autonomous', 'diagnostic')),
          status             TEXT NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'checkpoint_ready', 'completed', 'confirmed', 'cancelled')),
          baseline_id        TEXT REFERENCES baselines(id) ON DELETE SET NULL,
          change_id          TEXT REFERENCES changes(id) ON DELETE CASCADE,
          workflow_run_id    TEXT REFERENCES workflow_runs(id) ON DELETE CASCADE,
          summary_json       TEXT NOT NULL DEFAULT '{}',
          checkpoint_json    TEXT NOT NULL DEFAULT '{}',
          started_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          completed_at       TEXT,
          confirmed_at       TEXT,
          CHECK (baseline_id IS NOT NULL OR change_id IS NOT NULL OR workflow_run_id IS NOT NULL)
        );
        INSERT INTO decision_threads_completion_upgrade (
          id, purpose, mode, status, baseline_id, change_id, workflow_run_id,
          summary_json, checkpoint_json, started_at, updated_at, completed_at, confirmed_at
        )
        SELECT
          id, purpose, mode, status, baseline_id, change_id, workflow_run_id,
          summary_json, checkpoint_json, started_at, updated_at, NULL, confirmed_at
        FROM decision_threads;
        DROP TABLE decision_threads;
        ALTER TABLE decision_threads_completion_upgrade RENAME TO decision_threads;
        CREATE INDEX decision_threads_status
          ON decision_threads(status, updated_at);
        CREATE INDEX decision_threads_authority
          ON decision_threads(baseline_id, change_id, workflow_run_id, status);
      `);
      db.prepare(
        `UPDATE decision_threads
         SET status = 'completed',
             summary_json = CASE
               WHEN summary_json = '{}' THEN ?
               ELSE json_set(summary_json, '$.completion_kind', 'migrated_settled_thread')
             END,
             completed_at = updated_at
         WHERE status = 'active'
           AND EXISTS (
             SELECT 1 FROM decision_items WHERE decision_items.thread_id = decision_threads.id
           )
           AND NOT EXISTS (
             SELECT 1 FROM decision_items
             WHERE decision_items.thread_id = decision_threads.id AND status = 'open'
           )
           AND NOT EXISTS (
             SELECT 1 FROM decision_items
             WHERE decision_items.thread_id = decision_threads.id
               AND blocking = 1 AND status = 'deferred'
           )`,
      ).run(JSON.stringify({
        text: 'Existing normalized decision state was completed during schema migration.',
        completion_kind: 'migrated_settled_thread',
      }));
      const violations = db.pragma('foreign_key_check');
      if (violations.length > 0) {
        throw new Error(
          `decision completion migration produced ${violations.length} foreign key violation(s)`,
        );
      }
    })();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`);
  }
  return true;
}

function upgradeBaselineWorktreeConstraint(db, fromVersion = latestSchemaVersion(db)) {
  if (!tableNames(db).includes('baselines') || baselineSupportsUnbornGit(db)) return false;
  const previousVersion = fromVersion || 'unknown';
  const foreignKeys = db.pragma('foreign_keys', { simple: true });
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(`
        DROP TABLE IF EXISTS baselines_git_upgrade;
        CREATE TABLE baselines_git_upgrade (
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
                                  CHECK (worktree_state IN ('clean', 'dirty', 'unborn', 'unavailable')),
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
          research_checkpoint_id TEXT,
          approved_by         TEXT,
          approval_note       TEXT,
          started_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          converged_at        TEXT
        );
        INSERT INTO baselines_git_upgrade (
          id, project_name, project_type, stack, mode, status, repository_root, scope_json,
          repository_revision, repository_branch, worktree_state, worktree_digest,
          worktree_files_json, worktree_accepted, known_red_accepted, spec_refs_json,
          evidence_json, verification_json, unknowns_json, gaps_json, classification_json,
          provider_refs_json, research_run_id, research_checkpoint_id,
          approved_by, approval_note, started_at,
          updated_at, converged_at
        )
        SELECT
          id, project_name, project_type, stack, mode, status, repository_root, scope_json,
          repository_revision, repository_branch, worktree_state, worktree_digest,
          worktree_files_json, worktree_accepted, known_red_accepted, spec_refs_json,
          evidence_json, verification_json, unknowns_json, gaps_json, classification_json,
          provider_refs_json, research_run_id, research_checkpoint_id,
          approved_by, approval_note, started_at,
          updated_at, converged_at
        FROM baselines;
        DROP TABLE baselines;
        ALTER TABLE baselines_git_upgrade RENAME TO baselines;
        CREATE INDEX baselines_status ON baselines(status, updated_at);
      `);
      const violations = db.pragma('foreign_key_check');
      if (violations.length > 0) {
        throw new Error(
          `baseline Git-state migration produced ${violations.length} foreign key violation(s)`,
        );
      }
    })();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`);
  }
  return previousVersion;
}

function upgradeRuntimeConstraints(db, fromVersion = latestSchemaVersion(db)) {
  assertNoDuplicateActiveSessionLeases(db);
  const missingKimi = !tableSupportsRuntime(db, 'events', 'kimi')
    || !tableSupportsRuntime(db, 'sessions', 'kimi');
  const missingGrok = !tableSupportsRuntime(db, 'events', 'grok')
    || !tableSupportsRuntime(db, 'sessions', 'grok');
  if (!missingKimi && !missingGrok) return false;
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
          runtime       TEXT CHECK (runtime IS NULL OR runtime IN ('claude', 'opencode', 'codex', 'kimi', 'grok')),
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
          runtime           TEXT NOT NULL CHECK (runtime IN ('claude', 'opencode', 'codex', 'kimi', 'grok')),
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
        CREATE UNIQUE INDEX sessions_one_active_task
          ON sessions(task_id) WHERE status = 'running';
      `);
      if (missingKimi) {
        db.prepare(
          `INSERT INTO migration_history
            (from_version, to_version, direction, status, notes)
           VALUES (?, ?, 'forward', 'success', ?)`,
        ).run(
          previousVersion,
          KIMI_SCHEMA_VERSION,
          'Add Kimi to durable event and session runtime constraints',
        );
      }
      if (missingGrok) {
        db.prepare(
          `INSERT INTO migration_history
            (from_version, to_version, direction, status, notes)
           VALUES (?, ?, 'forward', 'success', ?)`,
        ).run(
          missingKimi ? KIMI_SCHEMA_VERSION : previousVersion,
          KERNEL_SCHEMA_VERSION,
          'Add Grok to durable event and session runtime constraints',
        );
      }
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

function activeSessionLeaseConflicts(db) {
  if (!tableNames(db).includes('sessions')) return [];
  const columns = columnNames(db, 'sessions');
  if (!['sid', 'task_id', 'status'].every((name) => columns.has(name))) return [];
  const rows = db.prepare(
    `SELECT task_id, sid
     FROM sessions
     WHERE status = 'running'
     ORDER BY task_id, sid`,
  ).all();
  const byTask = new Map();
  for (const row of rows) {
    const ids = byTask.get(row.task_id) || [];
    ids.push(row.sid);
    byTask.set(row.task_id, ids);
  }
  return [...byTask.entries()]
    .filter(([, sessionIds]) => sessionIds.length > 1)
    .map(([taskId, sessionIds]) => ({
      task_id: taskId,
      lease_count: sessionIds.length,
      session_ids: sessionIds,
    }));
}

function assertNoDuplicateActiveSessionLeases(db) {
  const conflicts = activeSessionLeaseConflicts(db);
  if (conflicts.length > 0) throw new ActiveSessionLeaseConflictError(conflicts);
  return true;
}

function ensureActiveSessionLeaseIndex(db) {
  if (!tableNames(db).includes('sessions')) return false;
  assertNoDuplicateActiveSessionLeases(db);
  const existing = db.prepare(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'index' AND name = 'sessions_one_active_task'",
  ).get();
  if (existing) return false;
  db.exec(
    `CREATE UNIQUE INDEX sessions_one_active_task
     ON sessions(task_id) WHERE status = 'running'`,
  );
  return true;
}

function applyArtifactRegistryUpgrade(db) {
  if (!tableNames(db).includes('artifacts')) return false;
  assertNoDuplicateActiveArtifactPaths(db);
  const columns = columnNames(db, 'artifacts');
  let changed = false;
  if (![
    'owner_type', 'owner_id', 'digest', 'before_digest', 'after_digest',
    'provenance_json', 'managed',
  ].every((column) => columns.has(column))) {
    db.exec(`
      DROP TABLE IF EXISTS artifacts_registry_upgrade;
      CREATE TABLE artifacts_registry_upgrade (
        id              TEXT PRIMARY KEY,
        owner_type      TEXT NOT NULL
                          CHECK (owner_type IN ('project', 'baseline', 'change', 'task', 'workflow')),
        owner_id        TEXT NOT NULL,
        change_id       TEXT REFERENCES changes(id) ON DELETE SET NULL,
        task_id         TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        kind            TEXT NOT NULL,
        path            TEXT NOT NULL,
        digest          TEXT,
        content_hash    TEXT,
        before_digest   TEXT,
        after_digest    TEXT,
        provenance_json TEXT NOT NULL DEFAULT '{}',
        metadata_json   TEXT,
        managed         INTEGER NOT NULL DEFAULT 0 CHECK (managed IN (0, 1)),
        status          TEXT NOT NULL DEFAULT 'current'
                          CHECK (status IN ('current', 'stale', 'terminal', 'archived')),
        created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE(owner_type, owner_id, kind, path)
      );
      INSERT INTO artifacts_registry_upgrade
        (id, owner_type, owner_id, change_id, task_id, kind, path, digest,
         content_hash, before_digest, after_digest, provenance_json,
         metadata_json, managed, status, created_at, updated_at)
      SELECT id,
             CASE WHEN task_id IS NOT NULL THEN 'task' ELSE 'change' END,
             CASE WHEN task_id IS NOT NULL THEN task_id ELSE change_id END,
             change_id, task_id, kind, path, content_hash, content_hash,
             NULL, content_hash, '{"migration":"schema-20.0"}',
             metadata_json, 0, status, created_at, updated_at
      FROM artifacts;
      DROP TABLE artifacts;
      ALTER TABLE artifacts_registry_upgrade RENAME TO artifacts;
    `);
    changed = true;
  }
  if (normalizeStoredArtifactPaths(db)) changed = true;
  db.exec(`
    CREATE INDEX IF NOT EXISTS artifacts_change ON artifacts(change_id, kind);
    CREATE INDEX IF NOT EXISTS artifacts_owner ON artifacts(owner_type, owner_id, status);
    CREATE INDEX IF NOT EXISTS artifacts_path ON artifacts(path, status);
    CREATE UNIQUE INDEX IF NOT EXISTS artifacts_one_active_path
      ON artifacts(path) WHERE status <> 'archived';
    CREATE TABLE IF NOT EXISTS artifact_edges (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL
                    CHECK (source_type IN ('artifact', 'project', 'baseline', 'change', 'task', 'workflow', 'external')),
      source_id   TEXT NOT NULL,
      target_type TEXT NOT NULL
                    CHECK (target_type IN ('artifact', 'project', 'baseline', 'change', 'task', 'workflow', 'external')),
      target_id   TEXT NOT NULL,
      relation    TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE(source_type, source_id, target_type, target_id, relation)
    );
    CREATE INDEX IF NOT EXISTS artifact_edges_source
      ON artifact_edges(source_type, source_id);
    CREATE INDEX IF NOT EXISTS artifact_edges_target
      ON artifact_edges(target_type, target_id);
  `);
  return changed;
}

function applyCompatibleUpgrades(db, fromVersion = latestSchemaVersion(db), { legacyState = false } = {}) {
  assertNoDuplicateActiveSessionLeases(db);
  const runtimeChanged = upgradeRuntimeConstraints(db, fromVersion);
  if (tableNames(db).includes('baselines') && !baselineSupportsUnbornGit(db)) {
    db.transaction(() => {
      applyBaselineUpgrade(db, { legacyState });
      applyBaselineColumns(db);
    })();
  }
  const gitStateChangedFrom = upgradeBaselineWorktreeConstraint(db, fromVersion);
  const decisionCompletionChanged = upgradeDecisionThreadLifecycle(db);
  db.transaction(() => {
    applyCompatibleColumns(db);
    applyChangeColumns(db);
  })();
  const semanticKernelChanged = upgradeSemanticKernelConstraints(db);
  db.transaction(() => {
    applyCompatibleColumns(db);
    const contextChanged = applyContextSpineUpgrade(db);
    const contextMigration = db.prepare(
      "SELECT 1 FROM migration_history WHERE to_version = '10.0' AND status = 'success' LIMIT 1",
    ).get();
    const needsContextMigration = Boolean(
      fromVersion && ![
        CONTEXT_SCHEMA_VERSION, BASELINE_SCHEMA_VERSION, ADOPTION_SCHEMA_VERSION,
        WORKFLOW_SCHEMA_VERSION, AUTHORITY_SCHEMA_VERSION, SEMANTIC_SCHEMA_VERSION,
        DIALOGUE_SCHEMA_VERSION, GIT_AUTHORITY_SCHEMA_VERSION, ADAPTIVE_SCHEMA_VERSION,
        DECISION_COMPLETION_SCHEMA_VERSION, ARTIFACT_REGISTRY_SCHEMA_VERSION,
        KERNEL_SCHEMA_VERSION, CHECKPOINT_NATIVE_SCHEMA_VERSION,
        SEMANTIC_KERNEL_SCHEMA_VERSION,
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
    applyKernelIntegrityColumns(db);
    const artifactRegistryChanged = applyArtifactRegistryUpgrade(db);
    const baselineMigration = db.prepare(
      "SELECT 1 FROM migration_history WHERE to_version = '11.0' AND status = 'success' LIMIT 1",
    ).get();
    if (fromVersion && ![
      BASELINE_SCHEMA_VERSION, ADOPTION_SCHEMA_VERSION, WORKFLOW_SCHEMA_VERSION,
      AUTHORITY_SCHEMA_VERSION, SEMANTIC_SCHEMA_VERSION, DIALOGUE_SCHEMA_VERSION,
      GIT_AUTHORITY_SCHEMA_VERSION, ADAPTIVE_SCHEMA_VERSION,
      DECISION_COMPLETION_SCHEMA_VERSION, ARTIFACT_REGISTRY_SCHEMA_VERSION,
      KERNEL_SCHEMA_VERSION, CHECKPOINT_NATIVE_SCHEMA_VERSION,
      SEMANTIC_KERNEL_SCHEMA_VERSION,
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
           converged_at = NULL, research_run_id = NULL, research_checkpoint_id = NULL,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
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
    if (fromVersion && ![
      WORKFLOW_SCHEMA_VERSION, AUTHORITY_SCHEMA_VERSION, SEMANTIC_SCHEMA_VERSION,
      DIALOGUE_SCHEMA_VERSION, GIT_AUTHORITY_SCHEMA_VERSION, ADAPTIVE_SCHEMA_VERSION,
      DECISION_COMPLETION_SCHEMA_VERSION, ARTIFACT_REGISTRY_SCHEMA_VERSION,
      KERNEL_SCHEMA_VERSION, CHECKPOINT_NATIVE_SCHEMA_VERSION,
      SEMANTIC_KERNEL_SCHEMA_VERSION,
    ].includes(fromVersion) && !workflowMigration) {
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
    if (fromVersion && ![
      AUTHORITY_SCHEMA_VERSION, SEMANTIC_SCHEMA_VERSION, DIALOGUE_SCHEMA_VERSION,
      GIT_AUTHORITY_SCHEMA_VERSION, ADAPTIVE_SCHEMA_VERSION, DECISION_COMPLETION_SCHEMA_VERSION,
      ARTIFACT_REGISTRY_SCHEMA_VERSION, KERNEL_SCHEMA_VERSION,
      CHECKPOINT_NATIVE_SCHEMA_VERSION, SEMANTIC_KERNEL_SCHEMA_VERSION,
    ].includes(fromVersion) && !authorityMigration) {
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
    if (fromVersion && ![
      SEMANTIC_SCHEMA_VERSION, DIALOGUE_SCHEMA_VERSION, GIT_AUTHORITY_SCHEMA_VERSION,
      ADAPTIVE_SCHEMA_VERSION, DECISION_COMPLETION_SCHEMA_VERSION,
      ARTIFACT_REGISTRY_SCHEMA_VERSION, KERNEL_SCHEMA_VERSION,
      CHECKPOINT_NATIVE_SCHEMA_VERSION, SEMANTIC_KERNEL_SCHEMA_VERSION,
    ].includes(fromVersion) && !semanticMigration) {
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
    if (fromVersion && ![
      DIALOGUE_SCHEMA_VERSION, GIT_AUTHORITY_SCHEMA_VERSION, ADAPTIVE_SCHEMA_VERSION,
      DECISION_COMPLETION_SCHEMA_VERSION, ARTIFACT_REGISTRY_SCHEMA_VERSION,
      KERNEL_SCHEMA_VERSION, CHECKPOINT_NATIVE_SCHEMA_VERSION,
      SEMANTIC_KERNEL_SCHEMA_VERSION,
    ].includes(fromVersion)
      && !dialogueMigration) {
      db.prepare(
        `INSERT INTO migration_history
          (from_version, to_version, direction, status, notes)
         VALUES (?, ?, 'forward', 'success', ?)`,
      ).run(
        fromVersion === SEMANTIC_SCHEMA_VERSION ? fromVersion : SEMANTIC_SCHEMA_VERSION,
        DIALOGUE_SCHEMA_VERSION,
        'Add durable one-question decision dialogue, owner checkpoints, and workflow alignment gates',
      );
    }
    const gitStateMigration = db.prepare(
      "SELECT 1 FROM migration_history WHERE to_version = '17.0' AND status = 'success' LIMIT 1",
    ).get();
    if (fromVersion && ![
      GIT_AUTHORITY_SCHEMA_VERSION, ADAPTIVE_SCHEMA_VERSION, DECISION_COMPLETION_SCHEMA_VERSION,
      ARTIFACT_REGISTRY_SCHEMA_VERSION, KERNEL_SCHEMA_VERSION,
      CHECKPOINT_NATIVE_SCHEMA_VERSION, SEMANTIC_KERNEL_SCHEMA_VERSION,
    ].includes(fromVersion)
      && !gitStateMigration) {
      db.prepare(
        `INSERT INTO migration_history
          (from_version, to_version, direction, status, notes)
         VALUES (?, ?, 'forward', 'success', ?)`,
      ).run(
        gitStateChangedFrom || DIALOGUE_SCHEMA_VERSION,
        GIT_AUTHORITY_SCHEMA_VERSION,
        'Add explicit unborn Git authority and require an owner-authorized checkpoint before baseline recording',
      );
    }
    const adaptiveChanged = migrateAdaptiveWorkflowRuns(db, fromVersion);
    const adaptiveMigration = db.prepare(
      "SELECT 1 FROM migration_history WHERE to_version = '18.0' AND status = 'success' LIMIT 1",
    ).get();
    if (fromVersion && ![
      ADAPTIVE_SCHEMA_VERSION, DECISION_COMPLETION_SCHEMA_VERSION,
      ARTIFACT_REGISTRY_SCHEMA_VERSION, KERNEL_SCHEMA_VERSION,
      CHECKPOINT_NATIVE_SCHEMA_VERSION, SEMANTIC_KERNEL_SCHEMA_VERSION,
    ].includes(fromVersion) && !adaptiveMigration) {
      db.prepare(
        `INSERT INTO migration_history
          (from_version, to_version, direction, status, notes)
         VALUES (?, ?, 'forward', 'success', ?)`,
      ).run(
        fromVersion === GIT_AUTHORITY_SCHEMA_VERSION ? fromVersion : GIT_AUTHORITY_SCHEMA_VERSION,
        ADAPTIVE_SCHEMA_VERSION,
        adaptiveChanged
          ? 'Migrate active rigid workflows to adaptive capability transitions and independent initialization'
          : 'Add adaptive capability transitions and independent initialization authority',
      );
    }
    const completionMigration = db.prepare(
      "SELECT 1 FROM migration_history WHERE to_version = '19.0' AND status = 'success' LIMIT 1",
    ).get();
    if (fromVersion && ![
      DECISION_COMPLETION_SCHEMA_VERSION, ARTIFACT_REGISTRY_SCHEMA_VERSION,
      KERNEL_SCHEMA_VERSION, CHECKPOINT_NATIVE_SCHEMA_VERSION,
      SEMANTIC_KERNEL_SCHEMA_VERSION,
    ].includes(fromVersion) && !completionMigration) {
      db.prepare(
        `INSERT INTO migration_history
          (from_version, to_version, direction, status, notes)
         VALUES (?, ?, 'forward', 'success', ?)`,
      ).run(
        ADAPTIVE_SCHEMA_VERSION,
        DECISION_COMPLETION_SCHEMA_VERSION,
        decisionCompletionChanged
          ? 'Add non-ceremonial decision completion and migrate settled active threads'
          : 'Add non-ceremonial decision completion authority',
      );
    }
    const artifactRegistryMigration = db.prepare(
      "SELECT 1 FROM migration_history WHERE to_version = '20.0' AND status = 'success' LIMIT 1",
    ).get();
    if (fromVersion && fromVersion !== ARTIFACT_REGISTRY_SCHEMA_VERSION
      && fromVersion !== KERNEL_SCHEMA_VERSION
      && fromVersion !== CHECKPOINT_NATIVE_SCHEMA_VERSION
      && fromVersion !== SEMANTIC_KERNEL_SCHEMA_VERSION
      && !artifactRegistryMigration) {
      db.prepare(
        `INSERT INTO migration_history
          (from_version, to_version, direction, status, notes)
         VALUES (?, ?, 'forward', 'success', ?)`,
      ).run(
        DECISION_COMPLETION_SCHEMA_VERSION,
        ARTIFACT_REGISTRY_SCHEMA_VERSION,
        artifactRegistryChanged
          ? 'Migrate legacy change artifacts into the typed artifact registry and dependency graph'
          : 'Add the typed artifact registry, dependency graph, and orphan diagnostics',
      );
    }
    const kernelMigration = db.prepare(
      "SELECT 1 FROM migration_history WHERE to_version = '21.0' AND status = 'success' LIMIT 1",
    ).get();
    if (fromVersion
      && fromVersion !== KERNEL_SCHEMA_VERSION
      && fromVersion !== CHECKPOINT_NATIVE_SCHEMA_VERSION
      && fromVersion !== SEMANTIC_KERNEL_SCHEMA_VERSION
      && !kernelMigration) {
      db.prepare(
        `INSERT INTO migration_history
          (from_version, to_version, direction, status, notes)
         VALUES (?, ?, 'forward', 'success', ?)`,
      ).run(
        ARTIFACT_REGISTRY_SCHEMA_VERSION,
        KERNEL_SCHEMA_VERSION,
        'Add the seven-tool persistence kernel, reversible stage checkpoints, canonical context envelopes, normalized decisions, worker packets, and Grok runtime authority',
      );
    }
    const checkpointNativeMigration = db.prepare(
      "SELECT 1 FROM migration_history WHERE to_version = '22.0' AND status = 'success' LIMIT 1",
    ).get();
    if (fromVersion
      && fromVersion !== CHECKPOINT_NATIVE_SCHEMA_VERSION
      && fromVersion !== SEMANTIC_KERNEL_SCHEMA_VERSION
      && !checkpointNativeMigration) {
      db.prepare(
        `INSERT INTO migration_history
          (from_version, to_version, direction, status, notes)
         VALUES (?, ?, 'forward', 'success', ?)`,
      ).run(
        KERNEL_SCHEMA_VERSION,
        CHECKPOINT_NATIVE_SCHEMA_VERSION,
        'Bind Baseline research to Stage Checkpoints and add byte digests for Context Envelopes and Worker Packets',
      );
    }
    const semanticKernelMigration = db.prepare(
      "SELECT 1 FROM migration_history WHERE to_version = '23.0' AND status = 'success' LIMIT 1",
    ).get();
    if (fromVersion
      && fromVersion !== SEMANTIC_KERNEL_SCHEMA_VERSION
      && !semanticKernelMigration) {
      db.prepare(
        `INSERT INTO migration_history
          (from_version, to_version, direction, status, notes)
         VALUES (?, ?, 'forward', 'success', ?)`,
      ).run(
        CHECKPOINT_NATIVE_SCHEMA_VERSION,
        SEMANTIC_KERNEL_SCHEMA_VERSION,
        semanticKernelChanged
          ? 'Move Task and Change business vocabulary out of SQLite enums and add immutable Change successor linkage'
          : 'Record semantic-kernel vocabulary and Change successor authority',
      );
    }
    db.exec('CREATE INDEX IF NOT EXISTS tasks_change ON tasks(change_id) WHERE change_id IS NOT NULL');
    db.exec('CREATE INDEX IF NOT EXISTS events_change ON events(change_id, id)');
    ensureActiveSessionLeaseIndex(db);
    db.prepare(
      'INSERT OR IGNORE INTO schema_version (version, description) VALUES (?, ?)',
    ).run(
      EXPECTED_VERSION,
      'Persistence and safety kernel with open semantic vocabulary and immutable Change successors',
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
    assertNoDuplicateActiveArtifactPaths(db);
    const legacyState = existing.size > 0
      && ![
        WORKFLOW_SCHEMA_VERSION, AUTHORITY_SCHEMA_VERSION, SEMANTIC_SCHEMA_VERSION,
        DIALOGUE_SCHEMA_VERSION, GIT_AUTHORITY_SCHEMA_VERSION, ADAPTIVE_SCHEMA_VERSION,
        DECISION_COMPLETION_SCHEMA_VERSION, ARTIFACT_REGISTRY_SCHEMA_VERSION,
        KERNEL_SCHEMA_VERSION, CHECKPOINT_NATIVE_SCHEMA_VERSION,
        SEMANTIC_KERNEL_SCHEMA_VERSION,
      ].includes(fromVersion);
    backupPath = migrationBackup(db, dbPath, fromVersion, existing);
    // This must precede every ALTER, table rebuild, or index creation. Runtime
    // constraint upgrades rebuild sessions and would otherwise surface a
    // generic SQLITE_CONSTRAINT instead of the complete authority conflict.
    assertNoDuplicateActiveSessionLeases(db);
    applyCompatibleColumns(db);
    if (existing.has('artifacts')) {
      db.transaction(() => applyArtifactRegistryUpgrade(db))();
    }
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
  ActiveSessionLeaseConflictError,
  activeSessionLeaseConflicts,
  assertNoDuplicateActiveSessionLeases,
};
