'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { initStateDb, openStateDb, closeStateDb } = require('../../mcp-server/lib/state-db.cjs');
const ops = require('../../mcp-server/lib/state-ops.cjs');

const SUPPORTED_FROM = '4.4';
const SUPPORTED_TO = '4.5';

// Frozen SQL — values flow through @bindings (post_edit_guard contract).
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
    if (entry.name.startsWith('backup-v4.4-')) continue;
    if (entry.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

function planForward(sourceDir) {
  const tasksPath = path.join(sourceDir, '.ultra', 'tasks', 'tasks.json');
  const tasksJson = readJsonOptional(tasksPath);
  if (!tasksJson || !Array.isArray(tasksJson.tasks)) {
    throw new Error(`migrate: tasks.json missing or malformed at ${tasksPath}`);
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
        resolution: 'tasks.json wins (v4.4 → v4.5 D21 rule)',
      });
    }
  }

  const eventsPath = path.join(sourceDir, '.ultra', 'activity-log.json');
  const events = readJsonOptional(eventsPath);
  const eventList = Array.isArray(events) ? events : [];

  return {
    tasks: tasksJson.tasks,
    events: eventList,
    contextHeaders,
    warnings,
  };
}

function applyForward(db, plan) {
  const insertTask = db.prepare(
    "INSERT INTO tasks (id, title, type, priority, complexity, status, deps, tag, trace_to, context_file, created_at, updated_at) VALUES (@id, @title, @type, @priority, @complexity, @status, @deps, @tag, @trace_to, @context_file, @created_at, @updated_at)",
  );
  const insertEvent = db.prepare(
    "INSERT INTO events (ts, type, task_id, session_id, runtime, payload_json) VALUES (@ts, @type, @task_id, @session_id, @runtime, @payload)",
  );

  const taskInserted = ops.tx(db, () => {
    let n = 0;
    for (const t of plan.tasks) {
      const ctx = plan.contextHeaders[t.id];
      insertTask.run({
        id: t.id,
        title: t.title,
        type: t.type,
        priority: t.priority,
        complexity: t.complexity ?? null,
        status: t.status,
        deps: t.deps ? JSON.stringify(t.deps) : null,
        tag: t.tag ?? null,
        trace_to: t.trace_to ?? null,
        context_file: ctx ? ctx._file : null,
        created_at: t.created_at,
        updated_at: t.updated_at,
      });
      n++;
    }
    return n;
  });

  const eventsInserted = ops.tx(db, () => {
    let n = 0;
    for (const e of plan.events) {
      insertEvent.run({
        ts: e.ts || new Date().toISOString(),
        type: e.type,
        task_id: e.task_id ?? null,
        session_id: e.session_id ?? null,
        runtime: e.runtime ?? null,
        payload: e.payload === undefined ? null : JSON.stringify(e.payload),
      });
      n++;
    }
    return n;
  });

  return { taskInserted, eventsInserted };
}

function recordMigration(db, { from, to, direction, status, notes }) {
  db.prepare(RECORD_MIGRATION_SQL).run({ from, to, direction, status, notes });
}

function ensureBackupName(sourceDir) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(sourceDir, '.ultra', `backup-v4.4-${ts}`);
}

function findLatestBackup(sourceDir) {
  const ultra = path.join(sourceDir, '.ultra');
  if (!fs.existsSync(ultra)) return null;
  const candidates = fs.readdirSync(ultra)
    .filter((n) => n.startsWith('backup-v4.4-'))
    .sort();
  return candidates.length === 0 ? null : path.join(ultra, candidates[candidates.length - 1]);
}

function cmdForward(flags) {
  const sourceDir = path.resolve(flags.sourceDir || '.');
  const dbPath = path.resolve(flags.dbPath || path.join(sourceDir, '.ultra', 'state.db'));
  let plan;
  try {
    plan = planForward(sourceDir);
  } catch (err) {
    emit({ ok: false, error: { code: 'MIGRATE_FAILED', message: err.message, retriable: false } });
    return 2;
  }

  if (flags.dry) {
    emit({
      ok: true,
      data: {
        mode: 'dry',
        from: SUPPORTED_FROM,
        to: SUPPORTED_TO,
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
  const backupDir = ensureBackupName(sourceDir);
  const ultraSource = path.join(sourceDir, '.ultra');
  copyDirSync(ultraSource, backupDir);

  let db;
  try {
    db = initStateDb(dbPath).db;
    const counts = applyForward(db, plan);
    recordMigration(db, {
      from: SUPPORTED_FROM,
      to: SUPPORTED_TO,
      direction: 'forward',
      status: 'success',
      notes: `tasks=${counts.taskInserted} events=${counts.eventsInserted} warnings=${plan.warnings.length}`,
    });
    emit({
      ok: true,
      data: {
        mode: 'apply',
        from: SUPPORTED_FROM,
        to: SUPPORTED_TO,
        source_dir: sourceDir,
        db_path: dbPath,
        backup_dir: backupDir,
        tasks_inserted: counts.taskInserted,
        events_inserted: counts.eventsInserted,
        warnings: plan.warnings,
      },
    });
    return 0;
  } catch (err) {
    if (db) {
      try {
        recordMigration(db, {
          from: SUPPORTED_FROM,
          to: SUPPORTED_TO,
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
  const backupDir = findLatestBackup(sourceDir);
  if (!backupDir) {
    emit({ ok: false, error: { code: 'NO_BACKUP', message: 'no backup-v4.4-* directory found' } });
    return 2;
  }

  // Record rollback BEFORE removing the db; if the file is gone we still want an audit row.
  let db;
  try {
    if (fs.existsSync(dbPath)) {
      db = openStateDb(dbPath);
      recordMigration(db, {
        from: SUPPORTED_TO,
        to: SUPPORTED_FROM,
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
      if (entry.name.startsWith('backup-v4.4-')) continue;
      const target = path.join(ultraDir, entry.name);
      fs.rmSync(target, { recursive: true, force: true });
    }
    copyDirSync(backupDir, ultraDir);

    emit({
      ok: true,
      data: {
        mode: 'rollback',
        from: SUPPORTED_TO,
        to: SUPPORTED_FROM,
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
  if (flags.from && flags.from !== SUPPORTED_FROM) {
    emit({ ok: false, error: { code: 'UNSUPPORTED_VERSION', message: `--from ${flags.from} unsupported (only ${SUPPORTED_FROM})` } });
    return 1;
  }
  if (flags.to && flags.to !== SUPPORTED_TO) {
    emit({ ok: false, error: { code: 'UNSUPPORTED_VERSION', message: `--to ${flags.to} unsupported (only ${SUPPORTED_TO})` } });
    return 1;
  }
  return flags.rollback ? cmdRollback(flags) : cmdForward(flags);
}

const USAGE = `ultra-tools migrate --from=4.4 --to=4.5 [flags]

Flags:
  --source-dir <dir>   project root containing .ultra/ (default: .)
  --db-path <path>     state.db destination (default: <source-dir>/.ultra/state.db)
  --dry                print the migration plan without writing
  --rollback           restore the most recent backup-v4.4-* and drop state.db

The forward flow: backup .ultra/ → init state.db → insert tasks from
tasks.json → merge context md status (tasks.json wins on conflict, warnings
recorded) → insert activity-log events → record migration_history.
Rollback restores from the latest backup-v4.4-* directory and writes a
matching migration_history rollback row before dropping state.db.
`;

module.exports = { dispatch, USAGE, parseFlags, planForward, parseFrontmatter };
