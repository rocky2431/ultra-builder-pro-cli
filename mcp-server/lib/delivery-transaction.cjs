'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const TRANSACTION_ROOT = '.ultra/.runtime/delivery-transactions';
const JOURNAL_FILE = 'transaction.json';
const SCHEMA_VERSION = '1.0';
const ID = /^[a-zA-Z0-9_-]+$/;

class DeliveryTransactionError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'DeliveryTransactionError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function digestBytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function digestFile(file) {
  return digestBytes(fs.readFileSync(file));
}

function normalizeRelative(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new DeliveryTransactionError('DELIVERY_PATH_INVALID', `${field} is required`);
  }
  const raw = value.trim().replaceAll('\\', '/');
  if (path.posix.isAbsolute(raw) || path.win32.isAbsolute(raw)) {
    throw new DeliveryTransactionError(
      'DELIVERY_PATH_INVALID', `${field} must be project-relative`,
    );
  }
  const relative = path.posix.normalize(raw).replace(/^\.\//, '');
  if (relative === '.' || relative === '..' || relative.startsWith('../')) {
    throw new DeliveryTransactionError('DELIVERY_PATH_INVALID', `${field} escapes project root`);
  }
  return relative;
}

function projectRoot(rootDir) {
  const root = path.resolve(rootDir);
  let stat;
  try { stat = fs.lstatSync(root); }
  catch (error) {
    throw new DeliveryTransactionError(
      'DELIVERY_PATH_INVALID', `project root is unavailable: ${error.message}`,
    );
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new DeliveryTransactionError(
      'DELIVERY_PATH_INVALID', 'project root must be a real directory',
    );
  }
  return fs.realpathSync.native(root);
}

function resolveInside(rootDir, relative, field, { requireFile = false } = {}) {
  const root = projectRoot(rootDir);
  const normalized = normalizeRelative(relative, field);
  const file = path.resolve(root, normalized);
  if (!file.startsWith(`${root}${path.sep}`)) {
    throw new DeliveryTransactionError('DELIVERY_PATH_INVALID', `${field} escapes project root`);
  }
  const components = normalized.split('/');
  let current = root;
  for (let index = 0; index < components.length; index += 1) {
    current = path.join(current, components[index]);
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (error) {
      if (error.code === 'ENOENT') {
        if (requireFile || index < components.length - 1) {
          if (index < components.length - 1) continue;
          throw new DeliveryTransactionError(
            'DELIVERY_PATH_INVALID', `${field} is missing: ${normalized}`,
          );
        }
        break;
      }
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new DeliveryTransactionError(
        'DELIVERY_PATH_INVALID', `${field} contains a symbolic link: ${normalized}`,
      );
    }
    if (index < components.length - 1 && !stat.isDirectory()) {
      throw new DeliveryTransactionError(
        'DELIVERY_PATH_INVALID', `${field} contains a non-directory ancestor: ${normalized}`,
      );
    }
    if (index === components.length - 1 && requireFile && !stat.isFile()) {
      throw new DeliveryTransactionError(
        'DELIVERY_PATH_INVALID', `${field} is not a regular file: ${normalized}`,
      );
    }
  }
  return { root, relative: normalized, file };
}

function transactionDirectory(rootDir, changeId) {
  if (!ID.test(changeId || '')) {
    throw new DeliveryTransactionError(
      'DELIVERY_TRANSACTION_INVALID', `invalid change id: ${changeId || '(missing)'}`,
    );
  }
  return path.join(projectRoot(rootDir), TRANSACTION_ROOT, changeId);
}

function atomicWrite(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  fs.writeFileSync(temporary, bytes, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function writeJournal(directory, journal) {
  journal.updated_at = new Date().toISOString();
  atomicWrite(
    path.join(directory, JOURNAL_FILE),
    `${JSON.stringify(journal, null, 2)}\n`,
  );
}

function readJournal(directory) {
  const file = path.join(directory, JOURNAL_FILE);
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    throw new DeliveryTransactionError(
      'DELIVERY_RECOVERY_REQUIRED',
      `delivery transaction journal is unreadable: ${file}`,
      { cause: error.message },
    );
  }
  if (value.schema_version !== SCHEMA_VERSION || !ID.test(value.change_id || '')
    || !Array.isArray(value.entries)
    || !['prepared', 'applied'].includes(value.status)) {
    throw new DeliveryTransactionError(
      'DELIVERY_RECOVERY_REQUIRED',
      `delivery transaction journal is invalid: ${file}`,
    );
  }
  return value;
}

function normalizedEntries(entries) {
  if (!Array.isArray(entries)) {
    throw new DeliveryTransactionError(
      'DELIVERY_TRANSACTION_INVALID', 'delivery entries must be an array',
    );
  }
  const targets = new Set();
  return entries.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || !ID.test(String(entry.id || ''))
      || !['add', 'update'].includes(entry.action)
      || !/^[0-9a-f]{64}$/.test(String(entry.after_digest || ''))
      || (entry.before_digest !== null
        && !/^[0-9a-f]{64}$/.test(String(entry.before_digest || '')))) {
      throw new DeliveryTransactionError(
        'DELIVERY_TRANSACTION_INVALID', `delivery entry ${index} is invalid`,
      );
    }
    const targetPath = normalizeRelative(entry.target_path, `entries[${index}].target_path`);
    const overlayPath = normalizeRelative(entry.overlay_path, `entries[${index}].overlay_path`);
    if (targets.has(targetPath)) {
      throw new DeliveryTransactionError(
        'DELIVERY_TRANSACTION_INVALID', `duplicate delivery target: ${targetPath}`,
      );
    }
    targets.add(targetPath);
    return {
      kind: String(entry.kind || 'artifact'),
      id: entry.id,
      action: entry.action,
      target_path: targetPath,
      overlay_path: overlayPath,
      before_digest: entry.before_digest,
      after_digest: entry.after_digest,
    };
  });
}

function canonicalEntries(entries) {
  return JSON.stringify(entries.map((entry) => ({
    kind: entry.kind,
    id: entry.id,
    action: entry.action,
    target_path: entry.target_path,
    overlay_path: entry.overlay_path,
    before_digest: entry.before_digest,
    after_digest: entry.after_digest,
  })));
}

function preflight(rootDir, entries) {
  return entries.map((entry) => {
    const target = resolveInside(rootDir, entry.target_path, 'target_path');
    const overlay = resolveInside(
      rootDir, entry.overlay_path, 'overlay_path', { requireFile: true },
    );
    const targetExists = fs.existsSync(target.file);
    const actualBefore = targetExists ? digestFile(target.file) : null;
    if ((entry.action === 'add' && targetExists)
      || (entry.action === 'update' && !targetExists)
      || actualBefore !== entry.before_digest) {
      throw new DeliveryTransactionError(
        'DELIVERY_BASELINE_CONFLICT',
        `delivery target changed before convergence: ${entry.target_path}`,
        { expected: entry.before_digest, actual: actualBefore },
      );
    }
    const actualAfter = digestFile(overlay.file);
    if (actualAfter !== entry.after_digest) {
      throw new DeliveryTransactionError(
        'DELIVERY_OVERLAY_STALE',
        `delivery overlay changed before convergence: ${entry.overlay_path}`,
        { expected: entry.after_digest, actual: actualAfter },
      );
    }
    return { entry, target, overlay, existed: targetExists };
  });
}

function applyEntry(item) {
  fs.mkdirSync(path.dirname(item.target.file), { recursive: true });
  const temporary = `${item.target.file}.delivery-${process.pid}-${crypto.randomUUID()}`;
  fs.copyFileSync(item.overlay.file, temporary);
  if (digestFile(temporary) !== item.entry.after_digest) {
    fs.rmSync(temporary, { force: true });
    throw new DeliveryTransactionError(
      'DELIVERY_OVERLAY_STALE',
      `delivery copy changed before publication: ${item.entry.overlay_path}`,
    );
  }
  fs.renameSync(temporary, item.target.file);
}

function verifyApplied(rootDir, entries) {
  for (const entry of entries) {
    const target = resolveInside(rootDir, entry.target_path, 'target_path', { requireFile: true });
    const actual = digestFile(target.file);
    if (actual !== entry.after_digest) {
      throw new DeliveryTransactionError(
        'DELIVERY_RECOVERY_REQUIRED',
        `applied delivery target is stale: ${entry.target_path}`,
        { expected: entry.after_digest, actual },
      );
    }
  }
}

function restoreJournal(rootDir, journal, directory) {
  for (const entry of [...journal.entries].reverse()) {
    const target = resolveInside(rootDir, entry.target_path, 'target_path');
    if (entry.existed) {
      const backup = resolveInside(
        rootDir, entry.backup_path, 'backup_path', { requireFile: true },
      );
      fs.mkdirSync(path.dirname(target.file), { recursive: true });
      const temporary = `${target.file}.restore-${process.pid}-${crypto.randomUUID()}`;
      fs.copyFileSync(backup.file, temporary);
      if (digestFile(temporary) !== entry.before_digest) {
        fs.rmSync(temporary, { force: true });
        throw new DeliveryTransactionError(
          'DELIVERY_RECOVERY_REQUIRED',
          `delivery backup is stale: ${entry.backup_path}`,
        );
      }
      fs.renameSync(temporary, target.file);
    } else {
      fs.rmSync(target.file, { force: true });
    }
  }
  fs.rmSync(directory, { recursive: true, force: true });
}

function beginDeliveryTransaction({ rootDir, changeId, entries }) {
  const normalized = normalizedEntries(entries);
  const directory = transactionDirectory(rootDir, changeId);
  if (fs.existsSync(directory)) {
    const journal = readJournal(directory);
    if (journal.change_id !== changeId
      || canonicalEntries(journal.entries) !== canonicalEntries(normalized)) {
      throw new DeliveryTransactionError(
        'DELIVERY_TRANSACTION_CONFLICT',
        `existing delivery transaction differs for ${changeId}`,
      );
    }
    if (journal.status === 'applied') {
      verifyApplied(rootDir, normalized);
      return { ...journal, resumed: true };
    }
    restoreJournal(rootDir, journal, directory);
  }

  const inspected = preflight(rootDir, normalized);
  const transactionRoot = path.dirname(directory);
  fs.mkdirSync(transactionRoot, { recursive: true, mode: 0o700 });
  const staging = path.join(
    transactionRoot,
    `.prepare-${changeId}-${process.pid}-${crypto.randomUUID()}`,
  );
  const journal = {
    schema_version: SCHEMA_VERSION,
    transaction_id: crypto.randomUUID(),
    change_id: changeId,
    status: 'prepared',
    entries: [],
    created_at: new Date().toISOString(),
    updated_at: null,
  };
  let published = false;
  try {
    fs.mkdirSync(path.join(staging, 'backups'), { recursive: true, mode: 0o700 });
    journal.entries = inspected.map((item, index) => {
      const backupPath = `${TRANSACTION_ROOT}/${changeId}/backups/${index + 1}`;
      if (item.existed) {
        const stagedBackup = path.join(staging, 'backups', String(index + 1));
        fs.copyFileSync(item.target.file, stagedBackup);
        if (digestFile(stagedBackup) !== item.entry.before_digest) {
          throw new DeliveryTransactionError(
            'DELIVERY_RECOVERY_REQUIRED',
            `delivery backup could not be verified: ${item.entry.target_path}`,
          );
        }
      }
      return {
        ...item.entry,
        existed: item.existed,
        backup_path: item.existed ? backupPath : null,
      };
    });
    writeJournal(staging, journal);
    fs.renameSync(staging, directory);
    published = true;
    for (const item of inspected) applyEntry(item);
    verifyApplied(rootDir, normalized);
    journal.status = 'applied';
    writeJournal(directory, journal);
    return { ...journal, resumed: false };
  } catch (error) {
    if (!published) {
      fs.rmSync(staging, { recursive: true, force: true });
    } else {
      try { restoreJournal(rootDir, journal, directory); }
      catch (recoveryError) {
        throw new DeliveryTransactionError(
          'DELIVERY_RECOVERY_REQUIRED',
          `delivery apply failed and rollback did not complete: ${error.message}`,
          { cause: error.code || error.message, rollback: recoveryError.code || recoveryError.message },
        );
      }
    }
    throw error;
  }
}

function completeDeliveryTransaction({ rootDir, changeId }) {
  const directory = transactionDirectory(rootDir, changeId);
  if (!fs.existsSync(directory)) return { completed: true, idempotent: true };
  const journal = readJournal(directory);
  if (journal.status !== 'applied') {
    throw new DeliveryTransactionError(
      'DELIVERY_RECOVERY_REQUIRED',
      `delivery transaction ${changeId} is ${journal.status}`,
    );
  }
  verifyApplied(rootDir, journal.entries);
  fs.rmSync(directory, { recursive: true, force: true });
  return { completed: true, idempotent: false };
}

function rollbackDeliveryTransaction({ rootDir, changeId }) {
  const directory = transactionDirectory(rootDir, changeId);
  if (!fs.existsSync(directory)) return { restored: false, idempotent: true };
  const journal = readJournal(directory);
  restoreJournal(rootDir, journal, directory);
  return { restored: true, idempotent: false };
}

function listDeliveryTransactions(rootDir) {
  const root = path.join(projectRoot(rootDir), TRANSACTION_ROOT);
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const rows = [];
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith('.prepare-')) {
      rows.push({
        change_id: entry.name,
        directory: path.join(root, entry.name),
        preparing: true,
      });
      continue;
    }
    if (!entry.isDirectory() || !ID.test(entry.name)) {
      rows.push({
        change_id: entry.name,
        error: new DeliveryTransactionError(
          'DELIVERY_RECOVERY_REQUIRED',
          `unexpected delivery transaction residue: ${entry.name}`,
        ),
      });
      continue;
    }
    const directory = path.join(root, entry.name);
    try {
      rows.push({ change_id: entry.name, directory, journal: readJournal(directory) });
    } catch (error) {
      rows.push({ change_id: entry.name, directory, error });
    }
  }
  return rows;
}

function recoverDeliveryTransactions({
  rootDir,
  archivedChangeIds = new Set(),
} = {}) {
  const result = { found: 0, restored: 0, committed: 0, failed: 0, items: [] };
  for (const row of listDeliveryTransactions(rootDir)) {
    result.found += 1;
    if (row.preparing) {
      fs.rmSync(row.directory, { recursive: true, force: true });
      result.restored += 1;
      result.items.push({ change_id: row.change_id, status: 'discarded_preparation' });
      continue;
    }
    if (row.error) {
      result.failed += 1;
      result.items.push({ change_id: row.change_id, status: 'failed', error: row.error.code });
      continue;
    }
    try {
      if (archivedChangeIds.has(row.change_id)) {
        completeDeliveryTransaction({ rootDir, changeId: row.change_id });
        result.committed += 1;
        result.items.push({ change_id: row.change_id, status: 'committed' });
      } else {
        rollbackDeliveryTransaction({ rootDir, changeId: row.change_id });
        result.restored += 1;
        result.items.push({ change_id: row.change_id, status: 'restored' });
      }
    } catch (error) {
      result.failed += 1;
      result.items.push({
        change_id: row.change_id,
        status: 'failed',
        error: error.code || error.message,
      });
    }
  }
  return result;
}

module.exports = {
  DeliveryTransactionError,
  TRANSACTION_ROOT,
  beginDeliveryTransaction,
  completeDeliveryTransaction,
  rollbackDeliveryTransaction,
  listDeliveryTransactions,
  recoverDeliveryTransactions,
};
