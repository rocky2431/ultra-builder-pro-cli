'use strict';

/** Explicit migration boundary for retired Ultra memory stores. */

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const CONFIRMATION = 'DELETE_ULTRA_LEGACY_MEMORY';

function tableExists(db, name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?").get(name);
}

function inspectLegacy(sourceDir = '.') {
  const root = path.resolve(sourceDir);
  const ultra = path.join(root, '.ultra');
  const hookMemory = path.join(ultra, 'memory');
  const dbPath = path.join(ultra, 'state.db');
  let stateMemoryTable = false;
  let stateMemoryEntries = 0;
  if (fs.existsSync(dbPath)) {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      stateMemoryTable = tableExists(db, 'memory_entries');
      if (stateMemoryTable) {
        stateMemoryEntries = db.prepare('SELECT COUNT(*) AS count FROM memory_entries').get().count;
      }
    } finally {
      db.close();
    }
  }
  return {
    source_dir: root,
    hook_memory_dir: fs.existsSync(hookMemory),
    hook_memory_path: hookMemory,
    state_db_path: dbPath,
    state_memory_table: stateMemoryTable,
    state_memory_entries: stateMemoryEntries,
  };
}

function archiveLegacy(sourceDir = '.', { timestamp } = {}) {
  const status = inspectLegacy(sourceDir);
  if (!status.hook_memory_dir && !status.state_memory_table) {
    return { ...status, archived: false, archive_dir: null };
  }
  const stamp = timestamp || new Date().toISOString().replace(/[:.]/g, '-');
  const archiveDir = path.join(status.source_dir, '.ultra', `legacy-memory-archive-${stamp}`);
  if (fs.existsSync(archiveDir)) throw new Error(`legacy memory archive already exists: ${archiveDir}`);
  fs.mkdirSync(archiveDir, { recursive: true });

  if (status.hook_memory_dir) {
    fs.cpSync(status.hook_memory_path, path.join(archiveDir, 'hook-memory'), {
      recursive: true,
      dereference: false,
      errorOnExist: true,
    });
  }

  if (status.state_memory_table) {
    const db = new Database(status.state_db_path, { readonly: true, fileMustExist: true });
    let entries;
    try {
      entries = db.prepare('SELECT * FROM memory_entries ORDER BY id ASC').all();
    } finally {
      db.close();
    }
    fs.writeFileSync(
      path.join(archiveDir, 'state-memory-entries.json'),
      JSON.stringify({ schema: 1, source: status.state_db_path, entries }, null, 2) + '\n',
      { encoding: 'utf8', flag: 'wx' },
    );
  }

  fs.writeFileSync(
    path.join(archiveDir, 'manifest.json'),
    JSON.stringify({ schema: 1, archived_at: new Date().toISOString(), ...status }, null, 2) + '\n',
    { encoding: 'utf8', flag: 'wx' },
  );
  return { ...status, archived: true, archive_dir: archiveDir };
}

function pruneLegacy(sourceDir = '.', { confirm, timestamp } = {}) {
  if (confirm !== CONFIRMATION) {
    throw new Error(`prune requires --confirm ${CONFIRMATION}`);
  }
  const archived = archiveLegacy(sourceDir, { timestamp });
  if (!archived.archived) return { ...archived, pruned: false };

  if (archived.hook_memory_dir) {
    fs.rmSync(archived.hook_memory_path, { recursive: true, force: false });
  }
  if (archived.state_memory_table) {
    const db = new Database(archived.state_db_path, { fileMustExist: true });
    try {
      db.transaction(() => {
        db.exec('DROP TRIGGER IF EXISTS memory_ai');
        db.exec('DROP TRIGGER IF EXISTS memory_ad');
        db.exec('DROP TRIGGER IF EXISTS memory_au');
        db.exec('DROP TABLE IF EXISTS memory_fts');
        db.exec('DROP TABLE IF EXISTS memory_entries');
      })();
    } finally {
      db.close();
    }
  }
  return { ...archived, pruned: true };
}

function parseFlags(args) {
  const flags = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--source-dir') {
      flags.sourceDir = args[i + 1];
      i += 1;
    } else if (token.startsWith('--source-dir=')) {
      flags.sourceDir = token.slice('--source-dir='.length);
    } else if (token === '--confirm') {
      flags.confirm = args[i + 1];
      i += 1;
    } else if (token.startsWith('--confirm=')) {
      flags.confirm = token.slice('--confirm='.length);
    } else {
      flags._.push(token);
    }
  }
  return flags;
}

function dispatch(args) {
  const flags = parseFlags(args);
  const action = flags._[0] || 'inspect';
  try {
    let data;
    if (action === 'inspect') data = inspectLegacy(flags.sourceDir);
    else if (action === 'archive') data = archiveLegacy(flags.sourceDir);
    else if (action === 'prune') data = pruneLegacy(flags.sourceDir, { confirm: flags.confirm });
    else throw new Error(`unknown legacy-memory action: ${action}`);
    process.stdout.write(`${JSON.stringify({ ok: true, data })}\n`);
    return 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      error: { code: 'LEGACY_MEMORY_MIGRATION_FAILED', message: error.message, retriable: false },
    })}\n`);
    return 2;
  }
}

module.exports = {
  CONFIRMATION,
  inspectLegacy,
  archiveLegacy,
  pruneLegacy,
  parseFlags,
  dispatch,
};
