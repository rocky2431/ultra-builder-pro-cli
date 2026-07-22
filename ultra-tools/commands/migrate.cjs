'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  EXPECTED_VERSION, initStateDb, openStateDb, closeStateDb, MIGRATED_GAPS,
} = require('../../mcp-server/lib/state-db.cjs');
const ops = require('../../mcp-server/lib/state-ops.cjs');
const projector = require('../../mcp-server/lib/projector.cjs');

const DEFAULT_FROM = '4.4';
const SUPPORTED_TRANSITIONS = Object.freeze({
  '4.4': '4.5',
  '4.5': EXPECTED_VERSION,
});

// Frozen SQL — values flow through parameter bindings.
const RECORD_MIGRATION_SQL = "INSERT INTO migration_history (from_version, to_version, direction, status, notes) VALUES (@from, @to, @direction, @status, @notes)";

function emit(envelope) {
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
}

function parseFlags(args) {
  const flags = { _: [] };
  // Accept both "--from 4.4" and "--from=4.4" styles.
  const valueOf = (token, i) => {
    const eq = token.indexOf('=');
    return eq >= 0 ? { value: token.slice(eq + 1), nextI: i } : { value: args[i + 1], nextI: i + 1 };
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry')        { flags.dry = true; continue; }
    if (a === '--rollback')   { flags.rollback = true; continue; }
    if (a === '--help' || a === '-h') { flags.help = true; continue; }
    if (a.startsWith('--from'))       { const r = valueOf(a, i); flags.from = r.value; i = r.nextI; continue; }
    if (a.startsWith('--to'))         { const r = valueOf(a, i); flags.to = r.value; i = r.nextI; continue; }
    if (a.startsWith('--source-dir')) { const r = valueOf(a, i); flags.sourceDir = r.value; i = r.nextI; continue; }
    if (a.startsWith('--db-path'))    { const r = valueOf(a, i); flags.dbPath = r.value; i = r.nextI; continue; }
    flags._.push(a);
  }
  return flags;
}

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const block = text.slice(3, end).trim();
  const out = {};
  for (const line of block.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    out[key] = value;
  }
  return out;
}

function readJsonOptional(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function findContexts(rootDir) {
  const dir = path.join(rootDir, '.ultra', 'tasks', 'contexts');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(dir, f));
}

function copyDirSync(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.name === 'state.db' || entry.name === 'state.db-wal' || entry.name === 'state.db-shm') continue;
    if (/^backup-v[^/]+-/.test(entry.name)) continue;
    if (entry.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

function isoTimestamp(value, fallback) {
  const candidate = value || fallback;
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`migrate: invalid timestamp ${JSON.stringify(candidate)}`);
  }
  return date.toISOString();
}

function projectRelativeContextPath(sourceDir, value) {
  if (!value) return null;
  const normalized = String(value).replaceAll('\\', '/');
  if (normalized.startsWith('.ultra/')) return normalized;
  if (normalized.startsWith('contexts/')) return `.ultra/tasks/${normalized}`;
  if (path.isAbsolute(value)) {
    const relative = path.relative(sourceDir, value).replaceAll(path.sep, '/');
    if (relative.startsWith('../') || relative === '..') {
      throw new Error(`migrate: context_file escapes project root: ${value}`);
    }
    return relative;
  }
  return `.ultra/tasks/contexts/${path.basename(normalized)}`;
}

function sanitizeLegacyContextTemplate(sourceDir) {
  const file = path.join(sourceDir, '.ultra', 'tasks', 'contexts', 'TEMPLATE.md');
  if (!fs.existsSync(file)) return false;
  const current = fs.readFileSync(file, 'utf8');
  const next = current
    .replace(/^>\s*\*\*Status\*\*:.*(?:\r?\n|$)(?:\r?\n)?/mi, '')
    .replace(
      /Read by mid_workflow_recall\.py and session_context\.py and injected into agent context\./g,
      'Used as task-local acceptance criteria by the active Ultra workflow.',
    );
  if (next === current) return false;
  fs.writeFileSync(file, next);
  return true;
}

function normalizeLegacyTask(task, tasksJson, contextHeaders, sourceDir) {
  if (!task || typeof task !== 'object') throw new Error('migrate: every task must be an object');
  for (const field of ['id', 'title', 'type', 'priority', 'status']) {
    if (task[field] === undefined || task[field] === null || task[field] === '') {
      throw new Error(`migrate: task ${task.id || '(unknown)'} missing ${field}`);
    }
  }
  const deps = task.dependencies ?? task.deps ?? [];
  if (!Array.isArray(deps)) throw new Error(`migrate: task ${task.id} dependencies must be an array`);
  if (task.estimated_days !== undefined
      && (!Number.isFinite(task.estimated_days) || task.estimated_days <= 0)) {
    throw new Error(`migrate: task ${task.id} estimated_days must be a positive number`);
  }
  const createdAt = isoTimestamp(task.created_at, tasksJson.created);
  const updatedAt = isoTimestamp(task.updated_at, tasksJson.updated || tasksJson.created);
  const ctx = contextHeaders[task.id];
  const contextFile = projectRelativeContextPath(
    sourceDir,
    task.context_file || (ctx && ctx._file),
  );
  return {
    ...task,
    deps,
    estimated_days: task.estimated_days ?? null,
    context_file: contextFile,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function planForward(sourceDir, expectedFrom = DEFAULT_FROM) {
  const tasksPath = path.join(sourceDir, '.ultra', 'tasks', 'tasks.json');
  const tasksJson = readJsonOptional(tasksPath);
  if (!tasksJson || !Array.isArray(tasksJson.tasks)) {
    throw new Error(`migrate: tasks.json missing or malformed at ${tasksPath}`);
  }
  const version = String(tasksJson.version || tasksJson.schema_version || '');
  if (version !== expectedFrom) {
    throw new Error(`migrate: expected v${expectedFrom} tasks.json, found ${version || '(missing version)'}`);
  }

  const contextHeaders = {};
  for (const file of findContexts(sourceDir)) {
    const fm = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    if (fm && fm.task_id) contextHeaders[fm.task_id] = { ...fm, _file: file };
  }

  const warnings = [];
  for (const task of tasksJson.tasks) {
    const ctx = contextHeaders[task.id];
    if (ctx && ctx.status && ctx.status !== task.status) {
      warnings.push({
        task_id: task.id,
        json_status: task.status,
        context_status: ctx.status,
        resolution: `tasks.json wins (v${expectedFrom} projection migration rule)`,
      });
    }
  }

  const eventsPath = path.join(sourceDir, '.ultra', 'activity-log.json');
  const events = readJsonOptional(eventsPath);
  const eventList = Array.isArray(events) ? events : [];
  const tasks = tasksJson.tasks.map((task) => (
    normalizeLegacyTask(task, tasksJson, contextHeaders, sourceDir)
  ));

  return {
    tasks,
    events: eventList,
    contextHeaders,
    warnings,
    projectName: tasksJson.project?.name || path.basename(sourceDir),
  };
}

function applyForward(db, plan) {
  const insertTask = db.prepare(
    "INSERT INTO tasks (id, title, type, priority, complexity, estimated_days, status, deps, tag, trace_to, context_file, created_at, updated_at) VALUES (@id, @title, @type, @priority, @complexity, @estimated_days, @status, @deps, @tag, @trace_to, @context_file, @created_at, @updated_at)",
  );
  const insertEvent = db.prepare(
    "INSERT INTO events (ts, type, task_id, session_id, runtime, payload_json) VALUES (@ts, @type, @task_id, @session_id, @runtime, @payload)",
  );

  let taskInserted = 0;
  for (const t of plan.tasks) {
    insertTask.run({
      id: t.id,
      title: t.title,
      type: t.type,
      priority: t.priority,
      complexity: t.complexity ?? null,
      estimated_days: t.estimated_days,
      status: t.status,
      deps: JSON.stringify(t.deps),
      tag: t.tag ?? null,
      trace_to: t.trace_to ?? null,
      context_file: t.context_file,
      created_at: t.created_at,
      updated_at: t.updated_at,
    });
    taskInserted++;
  }

  let eventsInserted = 0;
  for (const e of plan.events) {
    insertEvent.run({
      ts: e.ts || new Date().toISOString(),
      type: e.type,
      task_id: e.task_id ?? null,
      session_id: e.session_id ?? null,
      runtime: e.runtime ?? null,
      payload: e.payload === undefined ? null : JSON.stringify(e.payload),
    });
    eventsInserted++;
  }

  return { taskInserted, eventsInserted };
}

function recordMigration(db, { from, to, direction, status, notes }) {
  db.prepare(RECORD_MIGRATION_SQL).run({ from, to, direction, status, notes });
}

function ensureBackupName(sourceDir, fromVersion = DEFAULT_FROM) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(sourceDir, '.ultra', `backup-v${fromVersion}-${ts}`);
}

function findLatestBackup(sourceDir, fromVersion = DEFAULT_FROM) {
  const ultra = path.join(sourceDir, '.ultra');
  if (!fs.existsSync(ultra)) return null;
  const prefix = `backup-v${fromVersion}-`;
  const candidates = fs.readdirSync(ultra)
    .filter((n) => n.startsWith(prefix))
    .sort();
  return candidates.length === 0 ? null : path.join(ultra, candidates[candidates.length - 1]);
}

function cmdForward(flags) {
  const sourceDir = path.resolve(flags.sourceDir || '.');
  const dbPath = path.resolve(flags.dbPath || path.join(sourceDir, '.ultra', 'state.db'));
  const fromVersion = flags.from || DEFAULT_FROM;
  const toVersion = flags.to || SUPPORTED_TRANSITIONS[fromVersion];
  let plan;
  try {
    plan = planForward(sourceDir, fromVersion);
  } catch (err) {
    emit({ ok: false, error: { code: 'MIGRATE_FAILED', message: err.message, retriable: false } });
    return 2;
  }

  if (flags.dry) {
    emit({
      ok: true,
      data: {
        mode: 'dry',
        from: fromVersion,
        to: toVersion,
        source_dir: sourceDir,
        db_path: dbPath,
        tasks_to_insert: plan.tasks.length,
        events_to_insert: plan.events.length,
        warnings: plan.warnings,
      },
    });
    return 0;
  }

  // Real run: backup the entire .ultra subtree first.
  const backupDir = ensureBackupName(sourceDir, fromVersion);
  const ultraSource = path.join(sourceDir, '.ultra');
  copyDirSync(ultraSource, backupDir);

  let db;
  try {
    db = initStateDb(dbPath).db;
    const counts = ops.tx(db, () => {
      const existing = db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count;
      if (existing > 0) {
        throw new Error(`migrate: refusing to merge into non-empty state.db (tasks=${existing})`);
      }
      const inserted = applyForward(db, plan);
      db.prepare(
        `INSERT INTO baselines
         (id, project_name, mode, status, gaps_json, approval_note)
         VALUES ('migrated-baseline', ?, 'migrated', 'adopting', ?, ?)`,
      ).run(
        plan.projectName,
        JSON.stringify(MIGRATED_GAPS),
        `Legacy v${fromVersion} projection imported; evidence-backed owner re-adoption is required`,
      );
      recordMigration(db, {
        from: fromVersion,
        to: toVersion,
        direction: 'forward',
        status: 'success',
        notes: `tasks=${inserted.taskInserted} events=${inserted.eventsInserted} warnings=${plan.warnings.length}`,
      });
      return inserted;
    });
    projector.projectAll(db, { rootDir: sourceDir });
    const contextTemplateSanitized = sanitizeLegacyContextTemplate(sourceDir);
    emit({
      ok: true,
      data: {
        mode: 'apply',
        from: fromVersion,
        to: toVersion,
        source_dir: sourceDir,
        db_path: dbPath,
        backup_dir: backupDir,
        tasks_inserted: counts.taskInserted,
        events_inserted: counts.eventsInserted,
        warnings: plan.warnings,
        context_template_sanitized: contextTemplateSanitized,
      },
    });
    return 0;
  } catch (err) {
    if (db) {
      try {
        recordMigration(db, {
          from: fromVersion,
          to: toVersion,
          direction: 'forward',
          status: 'failed',
          notes: err.message,
        });
      } catch (_) { /* swallow secondary failure */ }
    }
    emit({ ok: false, error: { code: 'MIGRATE_FAILED', message: err.message, retriable: false } });
    return 2;
  } finally {
    if (db) closeStateDb(db);
  }
}

function cmdRollback(flags) {
  const sourceDir = path.resolve(flags.sourceDir || '.');
  const dbPath = path.resolve(flags.dbPath || path.join(sourceDir, '.ultra', 'state.db'));
  const fromVersion = flags.from || DEFAULT_FROM;
  const toVersion = flags.to || SUPPORTED_TRANSITIONS[fromVersion];
  const backupDir = findLatestBackup(sourceDir, fromVersion);
  if (!backupDir) {
    emit({ ok: false, error: { code: 'NO_BACKUP', message: `no backup-v${fromVersion}-* directory found` } });
    return 2;
  }

  // Record rollback BEFORE removing the db; if the file is gone we still want an audit row.
  let db;
  try {
    if (fs.existsSync(dbPath)) {
      db = openStateDb(dbPath);
      recordMigration(db, {
        from: toVersion,
        to: fromVersion,
        direction: 'rollback',
        status: 'success',
        notes: `restored from ${backupDir}`,
      });
      closeStateDb(db);
      db = null;
      fs.unlinkSync(dbPath);
      const wal = `${dbPath}-wal`;
      const shm = `${dbPath}-shm`;
      if (fs.existsSync(wal)) fs.unlinkSync(wal);
      if (fs.existsSync(shm)) fs.unlinkSync(shm);
    }

    // Restore .ultra contents from backup, leaving the backup itself in place.
    const ultraDir = path.join(sourceDir, '.ultra');
    for (const entry of fs.readdirSync(ultraDir, { withFileTypes: true })) {
      if (/^backup-v[^/]+-/.test(entry.name)) continue;
      const target = path.join(ultraDir, entry.name);
      fs.rmSync(target, { recursive: true, force: true });
    }
    copyDirSync(backupDir, ultraDir);

    emit({
      ok: true,
      data: {
        mode: 'rollback',
        from: toVersion,
        to: fromVersion,
        backup_dir: backupDir,
        source_dir: sourceDir,
      },
    });
    return 0;
  } catch (err) {
    if (db) closeStateDb(db);
    emit({ ok: false, error: { code: 'ROLLBACK_FAILED', message: err.message, retriable: false } });
    return 2;
  }
}

function dispatch(args) {
  const flags = parseFlags(args);
  if (flags.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  const fromVersion = flags.from || DEFAULT_FROM;
  const expectedTo = SUPPORTED_TRANSITIONS[fromVersion];
  if (!expectedTo) {
    emit({ ok: false, error: { code: 'UNSUPPORTED_VERSION', message: `--from ${fromVersion} unsupported (supported: ${Object.keys(SUPPORTED_TRANSITIONS).join(', ')})` } });
    return 1;
  }
  if (flags.to && flags.to !== expectedTo) {
    emit({ ok: false, error: { code: 'UNSUPPORTED_VERSION', message: `--to ${flags.to} unsupported for --from ${fromVersion} (expected ${expectedTo})` } });
    return 1;
  }
  return flags.rollback ? cmdRollback(flags) : cmdForward(flags);
}

const USAGE = `ultra-tools migrate --from=<version> --to=<version> [flags]

Supported transitions:
  4.4 -> 4.5   import the legacy task projection into authoritative state
  4.5 -> ${EXPECTED_VERSION}  import a projection-only project into current authoritative state

Flags:
  --source-dir <dir>   project root containing .ultra/ (default: .)
  --db-path <path>     state.db destination (default: <source-dir>/.ultra/state.db)
  --dry                print the migration plan without writing
  --rollback           restore the most recent matching backup-v<from>-* and drop state.db

The forward flow: backup .ultra/ → init state.db → insert tasks from
tasks.json → merge context md status (tasks.json wins on conflict, warnings
recorded) → insert activity-log events → record migration_history.
Rollback restores from the latest matching backup-v<from>-* directory and writes a
matching migration_history rollback row before dropping state.db.
`;

module.exports = {
  dispatch,
  USAGE,
  parseFlags,
  planForward,
  parseFrontmatter,
  sanitizeLegacyContextTemplate,
};
