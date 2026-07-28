'use strict';

// Plan publication needs rename operations relative to a stable directory
// identity. Node does not expose openat(2)/renameat(2), so the parent launches
// this bounded helper with cwd set to the verified Change artifact directory.
// Once the child has chdir'd, ancestor replacement cannot redirect its
// relative file operations.

const fs = require('node:fs');
const crypto = require('node:crypto');

const ACTIONS = new Set([
  'prepare',
  'publish',
  'rollback',
  'commit',
  'inspect',
  'recover',
  'read',
]);
const TRANSACTION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JOURNAL_PATTERN = /^\.plan-publish-([0-9a-f-]{36})\.journal\.json$/i;
const PUBLICATION_ENTRY_PATTERN = /^\.plan-publish-(.+)\.(journal\.json(?:\.next)?|(?:json|md)\.(?:tmp|backup))$/i;
const KINDS = Object.freeze({
  execution_plan: {
    target: 'plan.json',
    tempSuffix: 'json.tmp',
    backupSuffix: 'json.backup',
  },
  execution_plan_markdown: {
    target: 'plan.md',
    tempSuffix: 'md.tmp',
    backupSuffix: 'md.backup',
  },
});
const MAX_CONTENT_BYTES = 16 * 1024 * 1024;

class WorkerError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function identityOfCurrentDirectory() {
  const stat = fs.statSync('.', { bigint: true });
  if (!stat.isDirectory()) {
    throw new WorkerError(
      'PLAN_ARTIFACT_PATH_UNSAFE',
      'plan publication cwd must be a directory',
    );
  }
  return { dev: String(stat.dev), ino: String(stat.ino) };
}

function validateIdentity(expected) {
  if (!expected || typeof expected !== 'object') {
    throw new WorkerError(
      'PLAN_ARTIFACT_PATH_UNSAFE',
      'plan publication directory identity is required',
    );
  }
  const current = identityOfCurrentDirectory();
  if (String(expected.dev) !== current.dev || String(expected.ino) !== current.ino) {
    throw new WorkerError(
      'PLAN_ARTIFACT_PATH_UNSAFE',
      'plan artifact directory identity changed',
      { expected, current },
    );
  }
  return current;
}

function validateStoredIdentity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !/^\d+$/.test(String(value.dev || ''))
    || !/^\d+$/.test(String(value.ino || ''))) {
    throw new WorkerError(
      'PLAN_JOURNAL_INVALID',
      'plan publication journal directory identity is malformed',
    );
  }
  return { dev: String(value.dev), ino: String(value.ino) };
}

function assertJournalDirectoryIdentity(value) {
  const expected = validateStoredIdentity(value.directory_identity);
  const current = identityOfCurrentDirectory();
  if (expected.dev !== current.dev || expected.ino !== current.ino) {
    throw new WorkerError(
      'PLAN_ARTIFACT_PATH_UNSAFE',
      'plan publication journal directory identity does not match cwd',
      { expected, current },
    );
  }
  return current;
}

function normalizeCanonicalPath(value, field) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\\')) {
    throw new WorkerError('PLAN_JOURNAL_INVALID', `${field} must be a canonical project-relative path`);
  }
  const candidate = value.trim();
  if (candidate.startsWith('/') || candidate.split('/').some((segment) => (
    !segment || segment === '.' || segment === '..'
  ))) {
    throw new WorkerError('PLAN_JOURNAL_INVALID', `${field} must be a canonical project-relative path`);
  }
  return candidate;
}

function validateAuthority(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.owner_type !== 'change'
    || typeof value.owner_id !== 'string' || !value.owner_id.trim()
    || !value.paths || typeof value.paths !== 'object' || Array.isArray(value.paths)) {
    throw new WorkerError(
      'PLAN_JOURNAL_INVALID',
      'plan publication Change authority is malformed',
    );
  }
  const kinds = Object.keys(KINDS);
  if (Object.keys(value.paths).sort().join(',') !== kinds.sort().join(',')) {
    throw new WorkerError(
      'PLAN_JOURNAL_INVALID',
      'plan publication authority path set is incomplete',
    );
  }
  return {
    owner_type: 'change',
    owner_id: value.owner_id.trim(),
    paths: Object.fromEntries(kinds.map((kind) => [
      kind,
      normalizeCanonicalPath(value.paths[kind], `authority.paths.${kind}`),
    ])),
  };
}

function namesFor(kind, transactionId) {
  const definition = KINDS[kind];
  if (!definition) {
    throw new WorkerError('PLAN_JOURNAL_INVALID', `unsupported plan artifact kind: ${kind}`);
  }
  return {
    kind,
    target: definition.target,
    temp: `.plan-publish-${transactionId}.${definition.tempSuffix}`,
    backup: `.plan-publish-${transactionId}.${definition.backupSuffix}`,
  };
}

function journalName(transactionId) {
  return `.plan-publish-${transactionId}.journal.json`;
}

function assertTransactionId(transactionId) {
  if (typeof transactionId !== 'string' || !TRANSACTION_PATTERN.test(transactionId)) {
    throw new WorkerError('PLAN_JOURNAL_INVALID', 'invalid plan publication transaction id');
  }
  return transactionId;
}

function lstat(candidate) {
  try { return fs.lstatSync(candidate); } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function readRegular(candidate) {
  const before = lstat(candidate);
  if (!before) return null;
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new WorkerError(
      'PLAN_ARTIFACT_PATH_UNSAFE',
      `plan publication entry must be a regular file: ${candidate}`,
    );
  }
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
  let fd;
  try {
    fd = fs.openSync(candidate, flags);
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new WorkerError(
        'PLAN_PUBLISH_CONFLICT',
        `plan publication entry changed while opening: ${candidate}`,
      );
    }
    const bytes = fs.readFileSync(fd);
    return {
      bytes,
      digest: digest(bytes),
      dev: String(opened.dev),
      ino: String(opened.ino),
    };
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function writeExclusive(candidate, content) {
  const flags = fs.constants.O_WRONLY
    | fs.constants.O_CREAT
    | fs.constants.O_EXCL
    | (fs.constants.O_NOFOLLOW || 0);
  const fd = fs.openSync(candidate, flags, 0o600);
  try {
    fs.writeFileSync(fd, content);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function fsyncCurrentDirectory() {
  const fd = fs.openSync('.', fs.constants.O_RDONLY);
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function journalNextName(journal) {
  return `${journal}.next`;
}

function discardInterruptedJournalUpdate(journal, transactionId) {
  const next = journalNextName(journal);
  const value = readRegular(next);
  if (!value) return;
  let parsed;
  try { parsed = JSON.parse(value.bytes.toString('utf8')); } catch {
    throw new WorkerError(
      'PLAN_JOURNAL_INVALID',
      `interrupted journal update is not valid JSON: ${next}`,
    );
  }
  validateJournal(parsed, transactionId);
  fs.unlinkSync(next);
}

function writeJournal(journal, value, { exclusive = false } = {}) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (exclusive) {
    writeExclusive(journal, text);
    fsyncCurrentDirectory();
    return;
  }
  const stat = lstat(journal);
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) {
    throw new WorkerError(
      'PLAN_JOURNAL_INVALID',
      `plan publication journal is missing or unsafe: ${journal}`,
    );
  }
  discardInterruptedJournalUpdate(journal, value.transaction_id);
  const next = journalNextName(journal);
  writeExclusive(next, text);
  fs.renameSync(next, journal);
  fsyncCurrentDirectory();
}

function validateJournal(value, expectedTransactionId = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.version !== 2
    || !TRANSACTION_PATTERN.test(value.transaction_id || '')
    || !Array.isArray(value.entries)
    || value.entries.length !== 2) {
    throw new WorkerError('PLAN_JOURNAL_INVALID', 'plan publication journal is malformed');
  }
  if (expectedTransactionId && value.transaction_id !== expectedTransactionId) {
    throw new WorkerError('PLAN_JOURNAL_INVALID', 'plan publication journal id mismatch');
  }
  validateStoredIdentity(value.directory_identity);
  const authority = validateAuthority(value.authority);
  const expectedKinds = Object.keys(KINDS);
  const seen = new Set();
  for (const entry of value.entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || !expectedKinds.includes(entry.kind) || seen.has(entry.kind)) {
      throw new WorkerError('PLAN_JOURNAL_INVALID', 'plan publication journal entry is malformed');
    }
    seen.add(entry.kind);
    const names = namesFor(entry.kind, value.transaction_id);
    if (entry.target !== names.target || entry.temp !== names.temp || entry.backup !== names.backup
      || entry.canonical_path !== authority.paths[entry.kind]
      || typeof entry.existed !== 'boolean'
      || (entry.prior_digest !== null && !/^[0-9a-f]{64}$/.test(entry.prior_digest || ''))
      || !/^[0-9a-f]{64}$/.test(entry.digest || '')
      || typeof entry.backed_up !== 'boolean'
      || typeof entry.installed !== 'boolean') {
      throw new WorkerError('PLAN_JOURNAL_INVALID', 'plan publication journal names or digests are invalid');
    }
  }
  if (seen.size !== expectedKinds.length) {
    throw new WorkerError('PLAN_JOURNAL_INVALID', 'plan publication journal entry set is incomplete');
  }
  return value;
}

function readJournal(transactionId) {
  assertTransactionId(transactionId);
  const candidate = journalName(transactionId);
  const read = readRegular(candidate);
  if (!read) return null;
  let parsed;
  try { parsed = JSON.parse(read.bytes.toString('utf8')); } catch (cause) {
    throw new WorkerError('PLAN_JOURNAL_INVALID', `cannot parse ${candidate}: ${cause.message}`);
  }
  const value = validateJournal(parsed, transactionId);
  assertJournalDirectoryIdentity(value);
  return value;
}

function snapshotMatches(entry) {
  const current = readRegular(entry.target);
  if (!entry.existed) return current === null;
  return Boolean(current && current.digest === entry.prior_digest);
}

function cleanup(candidate) {
  const stat = lstat(candidate);
  if (!stat) return;
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new WorkerError(
      'PLAN_ARTIFACT_PATH_UNSAFE',
      `refusing to clean a non-regular plan publication entry: ${candidate}`,
    );
  }
  fs.unlinkSync(candidate);
}

function assertNoPendingPublication(allowedTransactionId = null) {
  const scanned = scanPublicationEntries();
  const otherTransactions = scanned.journals.filter(
    (item) => item.transaction_id !== allowedTransactionId,
  );
  if (otherTransactions.length === 0 && scanned.issues.length === 0) return;
  throw new WorkerError(
    'PLAN_RECOVERY_REQUIRED',
    'an earlier plan publication must be inspected or recovered before preparing another one',
    {
      pending_transactions: otherTransactions.map((item) => item.transaction_id),
      issues: scanned.issues,
    },
  );
}

function prepare(payload) {
  const transactionId = assertTransactionId(payload.transaction_id);
  const identity = validateIdentity(payload.identity);
  const authority = validateAuthority(payload.authority);
  assertNoPendingPublication();
  if (!payload.contents || typeof payload.contents !== 'object' || Array.isArray(payload.contents)) {
    throw new WorkerError('PLAN_JOURNAL_INVALID', 'plan publication contents are required');
  }
  const entries = Object.keys(KINDS).map((kind) => {
    const content = payload.contents[kind];
    if (typeof content !== 'string'
      || Buffer.byteLength(content) > MAX_CONTENT_BYTES) {
      throw new WorkerError(
        'PLAN_JOURNAL_INVALID',
        `plan publication content is invalid or too large: ${kind}`,
      );
    }
    const names = namesFor(kind, transactionId);
    const prior = readRegular(names.target);
    return {
      ...names,
      canonical_path: authority.paths[kind],
      existed: Boolean(prior),
      prior_digest: prior?.digest || null,
      digest: digest(content),
      backed_up: false,
      installed: false,
      content,
    };
  });
  const journal = journalName(transactionId);
  const value = {
    version: 2,
    transaction_id: transactionId,
    phase: 'preparing',
    directory_identity: identity,
    authority,
    created_at: new Date().toISOString(),
    entries: entries.map(({ content, ...entry }) => entry),
  };
  let journalCreated = false;
  try {
    writeJournal(journal, value, { exclusive: true });
    journalCreated = true;
    // Close the race where two publishers both observed an empty directory
    // before either created its journal. Only the first durable journal may
    // proceed to stage bytes.
    assertNoPendingPublication(transactionId);
    for (const entry of entries) writeExclusive(entry.temp, entry.content);
    value.phase = 'prepared';
    writeJournal(journal, value);
    return value;
  } catch (error) {
    if (journalCreated) {
      try { rollbackJournal(value); } catch { /* retained journal is diagnosed later */ }
    } else {
      for (const entry of entries) {
        try { cleanup(entry.temp); } catch { /* retained residue is diagnosed later */ }
      }
    }
    throw error;
  }
}

function publish(payload) {
  validateIdentity(payload.identity);
  const value = readJournal(assertTransactionId(payload.transaction_id));
  if (!value) {
    throw new WorkerError('PLAN_JOURNAL_INVALID', 'plan publication journal is missing');
  }
  if (value.phase === 'published' || value.phase === 'committed') {
    const current = value.entries.every((entry) => readRegular(entry.target)?.digest === entry.digest);
    if (!current) {
      throw new WorkerError('PLAN_PUBLISH_CONFLICT', 'published plan bytes changed');
    }
    return value;
  }
  if (!['preparing', 'prepared'].includes(value.phase)) {
    throw new WorkerError(
      'PLAN_PUBLISH_CONFLICT',
      `plan publication cannot publish from phase ${value.phase}`,
    );
  }
  const conflict = value.entries.find((entry) => !snapshotMatches(entry));
  if (conflict) {
    throw new WorkerError(
      'PLAN_PUBLISH_CONFLICT',
      `plan artifact changed after prepare: ${conflict.target}`,
      {
        target: conflict.target,
        expected: conflict.prior_digest,
        actual: readRegular(conflict.target)?.digest || null,
      },
    );
  }
  for (const entry of value.entries) {
    const temp = readRegular(entry.temp);
    if (!temp || temp.digest !== entry.digest) {
      throw new WorkerError(
        'PLAN_PUBLISH_CONFLICT',
        `staged plan artifact is missing or changed: ${entry.temp}`,
      );
    }
    if (readRegular(entry.backup)) {
      throw new WorkerError(
        'PLAN_PUBLISH_CONFLICT',
        `plan publication backup already exists: ${entry.backup}`,
      );
    }
  }
  for (const entry of value.entries) {
    if (!entry.existed) continue;
    if (!snapshotMatches(entry) || readRegular(entry.backup)) {
      throw new WorkerError(
        'PLAN_PUBLISH_CONFLICT',
        `plan artifact changed before backup: ${entry.target}`,
      );
    }
    fs.renameSync(entry.target, entry.backup);
    entry.backed_up = true;
    value.phase = 'backing_up';
    writeJournal(journalName(value.transaction_id), value);
  }
  value.phase = 'backed_up';
  writeJournal(journalName(value.transaction_id), value);
  for (const entry of value.entries) {
    const temp = readRegular(entry.temp);
    if (readRegular(entry.target) || !temp || temp.digest !== entry.digest) {
      throw new WorkerError(
        'PLAN_PUBLISH_CONFLICT',
        `plan artifact changed before installation: ${entry.target}`,
      );
    }
    fs.renameSync(entry.temp, entry.target);
    entry.installed = true;
    value.phase = 'publishing';
    writeJournal(journalName(value.transaction_id), value);
  }
  value.phase = 'published';
  writeJournal(journalName(value.transaction_id), value);
  return value;
}

function recoveryState(entry) {
  return {
    entry,
    target: readRegular(entry.target),
    backup: readRegular(entry.backup),
    temp: readRegular(entry.temp),
  };
}

function recoveryConflicts(state, journal) {
  const {
    entry, target, backup, temp,
  } = state;
  const conflicts = [];
  const targetIsNew = target?.digest === entry.digest;
  const targetIsPrior = entry.existed && target?.digest === entry.prior_digest;
  if (target && !targetIsNew && !targetIsPrior && backup) {
    conflicts.push(`${entry.target}:target_changed_after_backup`);
  }
  if (backup && (!entry.existed || backup.digest !== entry.prior_digest)) {
    conflicts.push(`${entry.backup}:backup_changed`);
  }
  if (temp && temp.digest !== entry.digest) {
    conflicts.push(`${entry.temp}:temp_changed`);
  }
  const demonstrablyPreBackup = ['preparing', 'prepared'].includes(journal.phase)
    && journal.entries.every((candidate) => (
      candidate.backed_up === false && candidate.installed === false
    ));
  if (entry.existed && !targetIsNew && !targetIsPrior && !backup) {
    conflicts.push(
      `${entry.target}:${target ? 'target_changed' : 'target_missing'}`
        + (demonstrablyPreBackup ? '_before_backup' : '_prior_bytes_unrecoverable'),
    );
  }
  if (entry.existed && targetIsNew
    && (!backup || backup.digest !== entry.prior_digest)) {
    conflicts.push(`${entry.target}:prior_bytes_unrecoverable`);
  }
  return conflicts;
}

function cleanupExpected(candidate, expectedDigest) {
  const current = readRegular(candidate);
  if (!current) return false;
  if (current.digest !== expectedDigest) {
    throw new WorkerError(
      'PLAN_RECOVERY_CONFLICT',
      `refusing to clean changed plan publication bytes: ${candidate}`,
    );
  }
  fs.unlinkSync(candidate);
  return true;
}

function rollbackJournal(value) {
  assertJournalDirectoryIdentity(value);
  let changed = false;
  const states = [...value.entries].reverse().map(recoveryState);
  const conflicts = states.flatMap((state) => recoveryConflicts(state, value));
  if (conflicts.length > 0) {
    value.phase = 'recovery_blocked';
    writeJournal(journalName(value.transaction_id), value);
    throw new WorkerError(
      'PLAN_RECOVERY_CONFLICT',
      `plan publication rollback refused changed bytes: ${conflicts.join(', ')}`,
      { conflicts },
    );
  }
  for (const state of states) {
    const { entry, backup } = state;
    const currentTarget = readRegular(entry.target);
    if (currentTarget?.digest === entry.digest) {
      fs.unlinkSync(entry.target);
      changed = true;
    }
    if (entry.existed && backup?.digest === entry.prior_digest
      && !readRegular(entry.target)) {
      fs.renameSync(entry.backup, entry.target);
      changed = true;
    }
    cleanupExpected(entry.temp, entry.digest);
    if (entry.existed) cleanupExpected(entry.backup, entry.prior_digest);
  }
  discardInterruptedJournalUpdate(
    journalName(value.transaction_id),
    value.transaction_id,
  );
  cleanup(journalName(value.transaction_id));
  fsyncCurrentDirectory();
  return { rolled_back: changed };
}

function rollback(payload) {
  validateIdentity(payload.identity);
  const transactionId = assertTransactionId(payload.transaction_id);
  const value = readJournal(transactionId);
  if (!value) return { rolled_back: false };
  return rollbackJournal(value);
}

function finalizeJournal(value) {
  assertJournalDirectoryIdentity(value);
  for (const entry of value.entries) {
    const target = readRegular(entry.target);
    if (!target || target.digest !== entry.digest) {
      throw new WorkerError(
        'PLAN_PUBLISH_CONFLICT',
        `cannot finalize changed plan bytes: ${entry.target}`,
      );
    }
    const backup = readRegular(entry.backup);
    if (backup && (!entry.existed || backup.digest !== entry.prior_digest)) {
      throw new WorkerError(
        'PLAN_PUBLISH_CONFLICT',
        `cannot finalize changed plan backup: ${entry.backup}`,
      );
    }
    const temp = readRegular(entry.temp);
    if (temp && temp.digest !== entry.digest) {
      throw new WorkerError(
        'PLAN_PUBLISH_CONFLICT',
        `cannot finalize changed staged bytes: ${entry.temp}`,
      );
    }
  }
  value.phase = 'committed';
  writeJournal(journalName(value.transaction_id), value);
  for (const entry of value.entries) {
    if (entry.existed) cleanupExpected(entry.backup, entry.prior_digest);
    cleanupExpected(entry.temp, entry.digest);
  }
  discardInterruptedJournalUpdate(
    journalName(value.transaction_id),
    value.transaction_id,
  );
  cleanup(journalName(value.transaction_id));
  fsyncCurrentDirectory();
  return { finalized: true };
}

function commit(payload) {
  validateIdentity(payload.identity);
  const transactionId = assertTransactionId(payload.transaction_id);
  const value = readJournal(transactionId);
  if (!value) return { finalized: false };
  if (!['published', 'committed'].includes(value.phase)) {
    throw new WorkerError(
      'PLAN_PUBLISH_CONFLICT',
      `plan publication cannot commit from phase ${value.phase}`,
    );
  }
  return finalizeJournal(value);
}

function scanPublicationEntries() {
  const journals = [];
  const issues = [];
  const regularTransactions = new Map();
  for (const entry of fs.readdirSync('.', { withFileTypes: true })) {
    const match = entry.name.match(PUBLICATION_ENTRY_PATTERN);
    if (!match) continue;
    const stat = lstat(entry.name);
    if (!stat || !stat.isFile() || stat.isSymbolicLink()) {
      issues.push({
        code: 'PLAN_ARTIFACT_PATH_UNSAFE',
        journal: entry.name,
        message: `reserved plan publication entry must be a regular file: ${entry.name}`,
      });
      continue;
    }
    const transactionId = match[1];
    if (!TRANSACTION_PATTERN.test(transactionId)) {
      issues.push({
        code: 'PLAN_JOURNAL_INVALID',
        journal: entry.name,
        message: `reserved plan publication entry has an invalid transaction id: ${entry.name}`,
      });
      continue;
    }
    if (!regularTransactions.has(transactionId)) regularTransactions.set(transactionId, []);
    regularTransactions.get(transactionId).push(entry.name);
    if (JOURNAL_PATTERN.test(entry.name)) {
      journals.push({
        name: entry.name,
        mtimeMs: stat.mtimeMs,
        transaction_id: transactionId,
      });
    }
  }
  const journalIds = new Set(journals.map((item) => item.transaction_id));
  for (const [transactionId, names] of regularTransactions) {
    if (journalIds.has(transactionId)) continue;
    for (const name of names) {
      issues.push({
        code: 'PLAN_JOURNAL_INVALID',
        journal: name,
        message: `plan publication sidecar has no journal: ${name}`,
      });
    }
  }
  journals.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return { journals, issues };
}

function inspect(payload) {
  validateIdentity(payload.identity);
  const transactions = [];
  const scanned = scanPublicationEntries();
  const issues = [...scanned.issues];
  for (const candidate of scanned.journals) {
    try {
      const value = readJournal(candidate.transaction_id);
      transactions.push({
        transaction_id: value.transaction_id,
        phase: value.phase,
        created_at: value.created_at || null,
      });
    } catch (error) {
      issues.push({
        code: error.code || 'PLAN_JOURNAL_INVALID',
        journal: candidate.name,
        message: error.message,
      });
    }
  }
  return { pending: transactions.length + issues.length, transactions, issues };
}

function recover(payload) {
  validateIdentity(payload.identity);
  const registry = payload.registry && typeof payload.registry === 'object'
    && !Array.isArray(payload.registry) ? payload.registry : {};
  let recovered = 0;
  let finalized = 0;
  const scanned = scanPublicationEntries();
  const issues = [...scanned.issues];
  if (issues.length > 0) return { recovered, finalized, issues };
  for (const candidate of scanned.journals) {
    try {
      const value = readJournal(candidate.transaction_id);
      const dbHasNewBytes = value.entries.every((entry) => (
        registry[entry.target]?.owner_type === value.authority.owner_type
        && registry[entry.target]?.owner_id === value.authority.owner_id
        && registry[entry.target]?.kind === entry.kind
        && registry[entry.target]?.path === entry.canonical_path
        && registry[entry.target]?.status === 'current'
        && (registry[entry.target]?.managed === true
          || registry[entry.target]?.managed === 1)
        && registry[entry.target]?.digest === entry.digest
        && registry[entry.target]?.provenance?.writer === 'plan.export'
        && registry[entry.target]?.provenance?.publication_transaction_id
          === value.transaction_id
        && readRegular(entry.target)?.digest === entry.digest
      ));
      if (dbHasNewBytes) {
        finalizeJournal(value);
        finalized += 1;
      } else {
        rollbackJournal(value);
        recovered += 1;
      }
    } catch (error) {
      issues.push({
        code: error.code || 'PLAN_RECOVERY_FAILED',
        journal: candidate.name,
        message: error.message,
        details: error.details,
      });
    }
  }
  return { recovered, finalized, issues };
}

function read(payload) {
  validateIdentity(payload.identity);
  if (payload.target !== 'plan.json') {
    throw new WorkerError('PLAN_ARTIFACT_PATH_UNSAFE', 'reader target is not allowlisted');
  }
  const value = readRegular('plan.json');
  return value
    ? { exists: true, digest: value.digest, content: value.bytes.toString('base64') }
    : { exists: false, digest: null, content: null };
}

function execute(action, payload) {
  if (!ACTIONS.has(action)) {
    throw new WorkerError('PLAN_WORKER_PROTOCOL_INVALID', `unsupported worker action: ${action}`);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new WorkerError('PLAN_WORKER_PROTOCOL_INVALID', 'worker payload must be an object');
  }
  return {
    prepare,
    publish,
    rollback,
    commit,
    inspect,
    recover,
    read,
  }[action](payload);
}

function main() {
  const action = process.argv[2];
  let payload;
  try {
    const input = fs.readFileSync(0, 'utf8');
    if (Buffer.byteLength(input) > 40 * 1024 * 1024) {
      throw new WorkerError('PLAN_WORKER_PROTOCOL_INVALID', 'worker payload is too large');
    }
    payload = JSON.parse(input);
    const result = execute(action, payload);
    process.stdout.write(`${JSON.stringify({ ok: true, result })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      error: {
        code: error.code || 'PLAN_WORKER_FAILED',
        message: error.message,
        details: error.details,
      },
    })}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  ACTIONS,
  KINDS,
  WorkerError,
  execute,
  identityOfCurrentDirectory,
};
