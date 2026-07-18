'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const { initStateDb, openStateDb, closeStateDb } = require('../../mcp-server/lib/state-db.cjs');
const { initProject } = require('../../mcp-server/lib/init-project.cjs');
const doctor = require('../../mcp-server/lib/doctor.cjs');

const RESTORE_CONFIRMATION = 'REPLACE_CORRUPT_ULTRA_STATE';
const REBASELINE_CONFIRMATION = 'REBASELINE_CORRUPT_ULTRA_STATE';
const USAGE = `ultra-tools system <verb> [options]

VERBS:
  doctor [--repair]
  restore --backup <.ultra/backups/...db> --confirm ${RESTORE_CONFIRMATION}
  rebaseline --project-name <name> [--scope <path>] --confirm ${REBASELINE_CONFIRMATION}
`;

class SystemCommandError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message);
    this.name = 'SystemCommandError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

function emit(envelope) {
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function parseOptions(args, allowed) {
  const options = { scope: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }
    const [flag, inline] = arg.startsWith('--') && arg.includes('=')
      ? arg.split(/=(.*)/s, 2)
      : [arg, null];
    const name = flag.startsWith('--') ? flag.slice(2) : null;
    if (!name || !allowed.has(name)) {
      throw new SystemCommandError('VALIDATION_ERROR', `unknown system option: ${arg}`);
    }
    const value = inline === null ? args[index += 1] : inline;
    if (value === undefined || String(value).length === 0 || String(value).startsWith('--')) {
      throw new SystemCommandError('VALIDATION_ERROR', `${flag} requires a value`);
    }
    if (name === 'scope') options.scope.push(value);
    else options[name.replaceAll('-', '_')] = value;
  }
  return options;
}

function inspectSqlite(file) {
  if (!fs.existsSync(file)) return { exists: false, valid: false, corrupt: false };
  let db;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
    const integrity = db.pragma('integrity_check', { simple: true });
    const hasSchema = Boolean(db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'",
    ).get());
    return { exists: true, valid: integrity === 'ok' && hasSchema, corrupt: false, integrity, hasSchema };
  } catch (error) {
    const corrupt = /not a database|database disk image is malformed|file is encrypted|malformed/i
      .test(String(error.message || ''));
    if (!corrupt) throw error;
    return { exists: true, valid: false, corrupt: true, error: error.message };
  } finally {
    closeStateDb(db);
  }
}

function inspectSqliteSnapshot(file) {
  if (!fs.existsSync(file)) return { exists: false, valid: false, corrupt: false };
  const snapshotDir = fs.mkdtempSync(path.join(path.dirname(file), '.state-inspect-'));
  const snapshotPath = path.join(snapshotDir, 'state.db');
  try {
    for (const suffix of ['', '-wal', '-shm']) {
      const source = `${file}${suffix}`;
      if (fs.existsSync(source)) fs.copyFileSync(source, `${snapshotPath}${suffix}`);
    }
    return inspectSqlite(snapshotPath);
  } finally {
    fs.rmSync(snapshotDir, { recursive: true, force: true });
  }
}

function ensureCorruptState(rootDir) {
  const statePath = path.join(rootDir, '.ultra', 'state.db');
  const state = inspectSqliteSnapshot(statePath);
  if (!state.exists) throw new SystemCommandError('STATE_DB_MISSING', `.ultra/state.db not found under ${rootDir}`, 2);
  if (!state.corrupt) {
    throw new SystemCommandError(
      'STATE_DB_NOT_CORRUPT',
      'state.db is readable; use system doctor --repair for supported recovery instead of replacing authority',
      2,
    );
  }
  return statePath;
}

function managedBackup(rootDir, candidate) {
  if (!candidate) throw new SystemCommandError('VALIDATION_ERROR', '--backup is required');
  const backupRoot = path.join(rootDir, '.ultra', 'backups');
  if (!fs.existsSync(backupRoot)) {
    throw new SystemCommandError('BACKUP_NOT_FOUND', `managed backup directory does not exist: ${backupRoot}`);
  }
  const resolvedRoot = fs.realpathSync(backupRoot);
  const requested = path.isAbsolute(candidate) ? candidate : path.resolve(rootDir, candidate);
  let resolved;
  try { resolved = fs.realpathSync(requested); }
  catch {
    throw new SystemCommandError('BACKUP_NOT_FOUND', `backup does not exist: ${requested}`);
  }
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new SystemCommandError(
      'BACKUP_OUTSIDE_MANAGED_ROOT',
      `backup must be inside ${backupRoot}`,
    );
  }
  if (!fs.statSync(resolved).isFile()) {
    throw new SystemCommandError('BACKUP_NOT_FOUND', `backup is not a file: ${resolved}`);
  }
  const inspection = inspectSqlite(resolved);
  if (!inspection.valid) {
    throw new SystemCommandError('BACKUP_INVALID', `backup is not a verified Ultra SQLite database: ${resolved}`);
  }
  return resolved;
}

function createRecoveryDir(rootDir, prefix) {
  const dir = path.join(rootDir, '.ultra', 'backups', `${prefix}-${stamp()}`);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.mkdirSync(dir, { recursive: false });
  return dir;
}

function moveStateFiles(statePath, recoveryDir, moved = []) {
  for (const suffix of ['', '-wal', '-shm']) {
    const source = `${statePath}${suffix}`;
    if (!fs.existsSync(source)) continue;
    const target = path.join(recoveryDir, `state.db${suffix}`);
    fs.renameSync(source, target);
    moved.push({ source, target });
  }
  return moved;
}

function restoreMovedFiles(moved) {
  const errors = [];
  for (const item of moved) {
    try {
      if (fs.existsSync(item.source)) fs.rmSync(item.source, { force: true });
    } catch (error) {
      errors.push(`replacement cleanup failed for ${item.source}: ${error.message}`);
    }
  }
  for (const item of moved) {
    try {
      if (fs.existsSync(item.target)) fs.renameSync(item.target, item.source);
    } catch (error) {
      errors.push(`evidence restore failed for ${item.source}: ${error.message}`);
    }
  }
  return errors;
}

async function dispatchRestore(args) {
  let options;
  try { options = parseOptions(args, new Set(['backup', 'confirm'])); }
  catch (error) { emit({ ok: false, error: { code: error.code, message: error.message } }); return error.exitCode || 1; }
  if (options.help) { process.stdout.write(USAGE); return 0; }
  if (options.confirm !== RESTORE_CONFIRMATION) {
    emit({
      ok: false,
      error: {
        code: 'CONFIRMATION_REQUIRED',
        message: `restore requires --confirm ${RESTORE_CONFIRMATION}`,
      },
    });
    return 1;
  }
  const rootDir = process.cwd();
  let moved = [];
  let activeState;
  let staging;
  try {
    activeState = ensureCorruptState(rootDir);
    const sourceBackup = managedBackup(rootDir, options.backup);
    const recoveryDir = createRecoveryDir(rootDir, 'restore');
    staging = path.join(rootDir, '.ultra', `.state.restore-${stamp()}.db`);
    fs.copyFileSync(sourceBackup, staging, fs.constants.COPYFILE_EXCL);
    moveStateFiles(activeState, recoveryDir, moved);
    fs.renameSync(staging, activeState);
    const initialized = initStateDb(activeState);
    closeStateDb(initialized.db);
    emit({
      ok: true,
      data: {
        status: 'restored',
        source_backup: sourceBackup,
        recovery_backup_dir: recoveryDir,
        quarantined_state_path: path.join(recoveryDir, 'state.db'),
        schema_version: initialized.schema_version,
        schema_migration_backup_path: initialized.backup_path || null,
        next_action: 'Run ultra-tools system doctor, then ultra-init to inspect baseline readiness.',
      },
    });
    return 0;
  } catch (error) {
    if (staging) {
      try { fs.rmSync(staging, { force: true }); } catch { /* rollback continues */ }
    }
    const rollbackErrors = activeState ? restoreMovedFiles(moved) : [];
    emit({
      ok: false,
      error: {
        code: error instanceof SystemCommandError ? error.code : 'STATE_RESTORE_FAILED',
        message: `${error.message}${rollbackErrors.length ? `; rollback errors: ${rollbackErrors.join('; ')}` : ''}`,
      },
    });
    return error.exitCode || 2;
  }
}

async function dispatchRebaseline(args) {
  let options;
  try { options = parseOptions(args, new Set(['project-name', 'scope', 'confirm'])); }
  catch (error) { emit({ ok: false, error: { code: error.code, message: error.message } }); return error.exitCode || 1; }
  if (options.help) { process.stdout.write(USAGE); return 0; }
  if (options.confirm !== REBASELINE_CONFIRMATION) {
    emit({
      ok: false,
      error: {
        code: 'CONFIRMATION_REQUIRED',
        message: `rebaseline requires --confirm ${REBASELINE_CONFIRMATION}`,
      },
    });
    return 1;
  }
  if (!options.project_name) {
    emit({ ok: false, error: { code: 'VALIDATION_ERROR', message: '--project-name is required' } });
    return 1;
  }
  const rootDir = process.cwd();
  let moved = [];
  let projectionMove = null;
  let activeState;
  try {
    activeState = ensureCorruptState(rootDir);
    const recoveryDir = createRecoveryDir(rootDir, 'rebaseline');
    moveStateFiles(activeState, recoveryDir, moved);
    const tasksDir = path.join(rootDir, '.ultra', 'tasks');
    if (fs.existsSync(tasksDir)) {
      const legacyTasksDir = path.join(recoveryDir, 'tasks');
      projectionMove = { source: tasksDir, target: legacyTasksDir };
      fs.renameSync(tasksDir, legacyTasksDir);
    }
    const initialized = initProject({
      target_dir: rootDir,
      project_name: options.project_name,
      mode: 'brownfield',
      scope: options.scope.length > 0 ? options.scope : undefined,
      resume: true,
    });
    emit({
      ok: true,
      data: {
        status: 'rebaseline_started',
        recovery_backup_dir: recoveryDir,
        quarantined_state_path: path.join(recoveryDir, 'state.db'),
        legacy_projection_path: projectionMove
          ? path.join(projectionMove.target, 'tasks.json')
          : null,
        baseline: initialized.baseline,
        copied_files: initialized.copied_files,
        next_action: 'Inspect the preserved evidence, record the brownfield baseline, and obtain owner approval before convergence.',
      },
    });
    return 0;
  } catch (error) {
    const rollbackErrors = [];
    if (moved.length > 0) {
      const generatedState = activeState || path.join(rootDir, '.ultra', 'state.db');
      for (const suffix of ['', '-wal', '-shm']) {
        try { fs.rmSync(`${generatedState}${suffix}`, { force: true }); }
        catch (rollbackError) { rollbackErrors.push(`generated state cleanup failed: ${rollbackError.message}`); }
      }
    }
    if (projectionMove) {
      try {
        if (fs.existsSync(projectionMove.source)) {
          fs.rmSync(projectionMove.source, { recursive: true, force: true });
        }
        if (fs.existsSync(projectionMove.target)) fs.renameSync(projectionMove.target, projectionMove.source);
      } catch (rollbackError) {
        rollbackErrors.push(`task projection restore failed: ${rollbackError.message}`);
      }
    }
    rollbackErrors.push(...restoreMovedFiles(moved));
    emit({
      ok: false,
      error: {
        code: error.code || 'STATE_REBASELINE_FAILED',
        message: `${error.message}${rollbackErrors.length ? `; rollback errors: ${rollbackErrors.join('; ')}` : ''}`,
      },
    });
    return error.exitCode || 2;
  }
}

async function dispatchDoctor(args) {
  const unknown = args.filter((arg) => !['--repair', '-h', '--help'].includes(arg));
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (unknown.length > 0) {
    emit({ ok: false, error: { code: 'VALIDATION_ERROR', message: `unknown system doctor flag: ${unknown[0]}` } });
    return 1;
  }
  const rootDir = process.cwd();
  const dbPath = path.join(rootDir, '.ultra', 'state.db');
  if (!fs.existsSync(dbPath)) {
    emit({ ok: false, error: { code: 'STATE_DB_MISSING', message: `.ultra/state.db not found under ${rootDir}` } });
    return 2;
  }
  let db;
  try {
    const repair = args.includes('--repair');
    const initialized = repair ? initStateDb(dbPath) : null;
    db = initialized ? initialized.db : openStateDb(dbPath);
    const data = await doctor.runDoctor(db, { rootDir, repair: args.includes('--repair') });
    if (initialized) {
      data.schema_version = initialized.schema_version;
      data.schema_migration_backup_path = initialized.backup_path || null;
    }
    emit({ ok: true, data });
    return data.status === 'healthy' ? 0 : 2;
  } catch (error) {
    const corrupt = /not a database|database disk image is malformed|file is encrypted or is not a database|malformed/i
      .test(String(error.message || ''));
    emit({
      ok: false,
      error: {
        code: corrupt ? 'STATE_DB_CORRUPT' : (error.code || 'STATE_DB_ERROR'),
        message: corrupt
          ? `state.db is corrupt; after owner approval use system restore with a verified managed backup or system rebaseline to quarantine and rebuild authority: ${error.message}`
          : error.message,
      },
    });
    return 2;
  } finally {
    if (db) closeStateDb(db);
  }
}

async function dispatch(args) {
  const [verb, ...rest] = args;
  if (!verb || verb === '-h' || verb === '--help') {
    process.stdout.write(USAGE);
    return 0;
  }
  if (verb === 'restore') return dispatchRestore(rest);
  if (verb === 'rebaseline') return dispatchRebaseline(rest);
  if (verb !== 'doctor') {
    emit({ ok: false, error: { code: 'UNKNOWN_VERB', message: `unknown system verb: ${verb}` } });
    return 1;
  }
  return dispatchDoctor(rest);
}

module.exports = {
  USAGE,
  RESTORE_CONFIRMATION,
  REBASELINE_CONFIRMATION,
  dispatch,
  dispatchDoctor,
  dispatchRestore,
  dispatchRebaseline,
};
