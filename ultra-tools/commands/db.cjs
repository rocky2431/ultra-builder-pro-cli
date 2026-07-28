'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const Database = require('better-sqlite3');

const { initStateDb, openStateDb, closeStateDb } = require('../../mcp-server/lib/state-db.cjs');
const runtimePaths = require('../../mcp-server/lib/runtime-paths.cjs');

const DEFAULT_DB_PATH = runtimePaths.STATE_DB_RELATIVE_PATH;
const DEFAULT_BACKUP_DIR = path.join(runtimePaths.RUNTIME_RELATIVE_DIR, 'backups');

function parseFlags(args) {
  const flags = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--path') {
      flags.path = args[++i];
    } else if (a === '--to') {
      flags.to = args[++i];
    } else if (a === '--help' || a === '-h') {
      flags.help = true;
    } else {
      flags._.push(a);
    }
  }
  return flags;
}

function emit(envelope) {
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
}

function dispatch(args) {
  const [verb, ...rest] = args;
  const flags = parseFlags(rest);

  if (!verb || flags.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  switch (verb) {
    case 'init':       return cmdInit(flags);
    case 'checkpoint': return cmdCheckpoint(flags);
    case 'vacuum':     return cmdVacuum(flags);
    case 'integrity':  return cmdIntegrity(flags);
    case 'backup':     return cmdBackup(flags);
    default:
      emit({ ok: false, error: { code: 'UNKNOWN_VERB', message: `unknown db verb '${verb}'; supported: init, checkpoint, vacuum, integrity, backup` } });
      return 1;
  }
}

function resolveAuthorityPath(flags, { migrateLegacy = true } = {}) {
  const env = flags.path
    ? { UBP_DB_PATH: path.resolve(flags.path) }
    : process.env;
  return runtimePaths.resolveConfiguredStateDb(process.cwd(), {
    env,
    migrateLegacy,
  }).stateDbPath;
}

function cmdInit(flags) {
  try {
    const dbPath = resolveAuthorityPath(flags, { migrateLegacy: true });
    const { db, schema_version, created, tables, path: actualPath } = initStateDb(dbPath);
    closeStateDb(db);
    emit({
      ok: true,
      data: {
        path: actualPath,
        schema_version,
        created,
        tables,
        size_bytes: fs.statSync(actualPath).size,
      },
    });
    return 0;
  } catch (err) {
    emit({
      ok: false,
      error: {
        code: 'INIT_FAILED',
        message: err.message,
        retriable: false,
      },
    });
    return 2;
  }
}

function withOpenDb(flags, fn, errorCode) {
  let db;
  try {
    const dbPath = resolveAuthorityPath(flags, { migrateLegacy: true });
    if (!fs.existsSync(dbPath)) {
      emit({ ok: false, error: { code: 'DB_NOT_FOUND', message: `state.db missing at ${dbPath}; run 'db init' first` } });
      return 2;
    }
    db = openStateDb(dbPath);
    const data = fn(db, dbPath);
    emit({ ok: true, data: { path: dbPath, ...data } });
    return 0;
  } catch (err) {
    emit({ ok: false, error: { code: errorCode, message: err.message, retriable: false } });
    return 2;
  } finally {
    if (db) closeStateDb(db);
  }
}

function cmdCheckpoint(flags) {
  return withOpenDb(flags, (db) => {
    const result = db.pragma('wal_checkpoint(TRUNCATE)');
    // better-sqlite3 returns [{ busy, log, checkpointed }]
    const row = Array.isArray(result) && result[0] ? result[0] : { busy: 0, log: 0, checkpointed: 0 };
    return { busy: row.busy, log: row.log, checkpointed: row.checkpointed };
  }, 'CHECKPOINT_FAILED');
}

function cmdVacuum(flags) {
  return withOpenDb(flags, (db) => {
    const before = db.prepare('SELECT page_count * page_size AS bytes FROM pragma_page_count(), pragma_page_size()').get();
    db.prepare('VACUUM').run();
    const after = db.prepare('SELECT page_count * page_size AS bytes FROM pragma_page_count(), pragma_page_size()').get();
    return { bytes_before: before.bytes, bytes_after: after.bytes, reclaimed_bytes: before.bytes - after.bytes };
  }, 'VACUUM_FAILED');
}

function cmdIntegrity(flags) {
  return withOpenDb(flags, (db) => {
    const result = db.pragma('integrity_check');
    const messages = result.map((r) => r.integrity_check);
    const ok = messages.length === 1 && messages[0] === 'ok';
    return { integrity_ok: ok, messages };
  }, 'INTEGRITY_FAILED');
}

function defaultBackupPath() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(DEFAULT_BACKUP_DIR, `state-db-${ts}.db`);
}

function quoteSqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function createOnlineBackup(db, targetPath, {
  beforeSnapshot = null,
} = {}) {
  const stage = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.snapshot-${process.pid}-${randomUUID()}`,
  );
  try {
    if (beforeSnapshot) beforeSnapshot();
    // VACUUM INTO is SQLite's synchronous, transactionally consistent
    // snapshot primitive. It reads committed pages through SQLite rather than
    // copying a main file that may lag committed WAL frames.
    db.exec(`VACUUM INTO ${quoteSqlString(stage)}`);
    const snapshot = new Database(stage, { readonly: true, fileMustExist: true });
    try {
      const integrity = snapshot.pragma('integrity_check');
      if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
        throw new Error('SQLite backup snapshot failed integrity_check');
      }
    } finally {
      snapshot.close();
    }
    fs.renameSync(stage, targetPath);
    return fs.statSync(targetPath).size;
  } finally {
    fs.rmSync(stage, { force: true });
  }
}

function cmdBackup(flags) {
  let db;
  try {
    const dbPath = resolveAuthorityPath(flags, { migrateLegacy: true });
    const targetPath = runtimePaths.assertManagedBackupDestination(
      process.cwd(),
      flags.to || defaultBackupPath(),
    ).targetPath;
    if (!fs.existsSync(dbPath)) {
      emit({ ok: false, error: { code: 'DB_NOT_FOUND', message: `state.db missing at ${dbPath}` } });
      return 2;
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    db = openStateDb(dbPath);
    const size = createOnlineBackup(db, targetPath);
    emit({ ok: true, data: { source: dbPath, target: targetPath, size_bytes: size } });
    return 0;
  } catch (err) {
    emit({ ok: false, error: { code: 'BACKUP_FAILED', message: err.message, retriable: true } });
    return 2;
  } finally {
    if (db) closeStateDb(db);
  }
}

const USAGE = `ultra-tools db <verb> [flags]

Verbs (Phase 2):
  init       [--path <db>]              create or open state.db, apply schema
  checkpoint [--path <db>]              run PRAGMA wal_checkpoint(TRUNCATE)
  vacuum     [--path <db>]              run VACUUM and report reclaimed bytes
  integrity  [--path <db>]              run PRAGMA integrity_check
  backup     [--path <db>] [--to <out>] online .backup() to a file

Default db: .ultra/.runtime/state.db
Default backup: .ultra/.runtime/backups/state-db-{iso}.db
`;

module.exports = {
  dispatch,
  USAGE,
  DEFAULT_DB_PATH,
  DEFAULT_BACKUP_DIR,
  _internal: {
    createOnlineBackup,
  },
};
