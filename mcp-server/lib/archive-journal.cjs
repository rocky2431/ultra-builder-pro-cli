'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { readStableProjectFile } = require('./safe-project-file.cjs');

const INTENT_FILE = '.archive-intent.json';
const REBIND_FILE = '.archive-rebind.json';
const INTENT_VERSION = '2.0';
const REBIND_VERSION = '1.0';
const MUTATION_WORKER = path.join(__dirname, 'archive-mutation-worker.py');
const MAX_MUTATION_REQUEST_BYTES = 16 * 1024 * 1024;
const MUTATION_PIN_FIELDS = Object.freeze({
  mkdir_dir: Object.freeze(['directory_fd']),
  write_atomic: Object.freeze(['directory_fd']),
  write_rebind_atomic: Object.freeze(['directory_fd']),
  unlink_regular: Object.freeze(['directory_fd']),
  rename_dir: Object.freeze([
    'source_parent_fd',
    'destination_parent_fd',
    'guard_parent_fd',
  ]),
});
const ACTIVE_ROOT = '.ultra/changes/active';
const ARCHIVE_ROOT = '.ultra/changes/archive';
const CORE_DIRECTORIES = Object.freeze([
  ['project', '.'],
  ['ultra', '.ultra'],
  ['changes', '.ultra/changes'],
  ['active', ACTIVE_ROOT],
  ['archive', ARCHIVE_ROOT],
]);

class ArchiveJournalError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'ArchiveJournalError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function unsafe(message, details = undefined) {
  throw new ArchiveJournalError('ARCHIVE_PATH_UNSAFE', message, details);
}

function identity(stat) {
  return {
    dev: String(stat.dev),
    ino: String(stat.ino),
    mode: String(stat.mode),
  };
}

function sameIdentity(left, right) {
  return Boolean(left && right)
    && left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode;
}

function normalizeRelative(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ArchiveJournalError('ARCHIVE_INTENT_INVALID', `${field} must be project-relative`);
  }
  const raw = value.trim().replaceAll('\\', '/');
  if (path.posix.isAbsolute(raw) || path.win32.isAbsolute(raw)) {
    throw new ArchiveJournalError('ARCHIVE_INTENT_INVALID', `${field} must be project-relative`);
  }
  const relative = path.posix.normalize(raw).replace(/^\.\//, '');
  if (relative === '.' || relative === '..' || relative.startsWith('../')) {
    throw new ArchiveJournalError('ARCHIVE_INTENT_INVALID', `${field} escapes project root`);
  }
  return relative;
}

function inspectProject(rootDir) {
  const root = path.resolve(rootDir);
  let stat;
  try { stat = fs.lstatSync(root); } catch (cause) {
    unsafe(`project root is unavailable: ${root}`, { cause: cause.message });
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    unsafe(`project root must be a real directory: ${root}`);
  }
  let physicalRoot;
  try { physicalRoot = fs.realpathSync.native(root); } catch (cause) {
    unsafe(`project root cannot be resolved: ${root}`, { cause: cause.message });
  }
  return { root, physicalRoot, rootIdentity: identity(stat) };
}

function absoluteInside(project, relative) {
  const normalized = relative === '.' ? '.' : normalizeRelative(relative, 'path');
  if (normalized === '.') return project.physicalRoot;
  return path.join(project.physicalRoot, ...normalized.split('/'));
}

function inspectDirectory(project, relative, { missing = false } = {}) {
  const normalized = relative === '.' ? '.' : normalizeRelative(relative, 'directory');
  const components = normalized === '.' ? [] : normalized.split('/');
  let current = project.physicalRoot;
  let currentIdentity = project.rootIdentity;
  for (let index = 0; index < components.length; index += 1) {
    current = path.join(current, components[index]);
    let stat;
    try { stat = fs.lstatSync(current); } catch (cause) {
      if (missing && cause?.code === 'ENOENT') return null;
      unsafe(`archive directory is unavailable: ${normalized}`, {
        component: components.slice(0, index + 1).join('/'),
        cause: cause.message,
      });
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      unsafe(`archive directory must not contain links or non-directories: ${normalized}`, {
        component: components.slice(0, index + 1).join('/'),
      });
    }
    currentIdentity = identity(stat);
  }
  return { relative: normalized, path: current, identity: currentIdentity };
}

function openDirectoryPin(project, relative, { missing = false } = {}) {
  const inspected = inspectDirectory(project, relative, { missing });
  if (!inspected) return null;
  let fd;
  try {
    fd = fs.openSync(
      inspected.path,
      fs.constants.O_RDONLY
        | (fs.constants.O_DIRECTORY || 0)
        | (fs.constants.O_NOFOLLOW || 0),
    );
    const opened = fs.fstatSync(fd);
    if (!opened.isDirectory() || !sameIdentity(identity(opened), inspected.identity)) {
      unsafe(`archive directory changed while it was pinned: ${inspected.relative}`);
    }
  } catch (error) {
    if (fd !== undefined) fs.closeSync(fd);
    if (error instanceof ArchiveJournalError) throw error;
    unsafe(`archive directory cannot be pinned: ${inspected.relative}`, {
      cause: error.message,
    });
  }
  return {
    ...inspected,
    fd,
    verify() {
      let named;
      let opened;
      try {
        named = fs.lstatSync(inspected.path);
        opened = fs.fstatSync(fd);
      } catch (cause) {
        unsafe(`archive directory pin is no longer valid: ${inspected.relative}`, {
          cause: cause.message,
        });
      }
      if (named.isSymbolicLink() || !named.isDirectory() || !opened.isDirectory()
        || !sameIdentity(identity(named), inspected.identity)
        || !sameIdentity(identity(opened), inspected.identity)) {
        unsafe(`archive directory changed identity: ${inspected.relative}`);
      }
    },
    verifyFd() {
      let opened;
      try { opened = fs.fstatSync(fd); } catch (cause) {
        unsafe(`archive directory descriptor is unavailable: ${inspected.relative}`, {
          cause: cause.message,
        });
      }
      if (!opened.isDirectory() || !sameIdentity(identity(opened), inspected.identity)) {
        unsafe(`archive directory descriptor changed identity: ${inspected.relative}`);
      }
    },
    close() {
      if (fd !== undefined) {
        fs.closeSync(fd);
        fd = undefined;
      }
    },
  };
}

function inspectChild(parent, name, { allowMissing = false } = {}) {
  parent.verify();
  const child = path.join(parent.path, name);
  let stat;
  try { stat = fs.lstatSync(child); } catch (cause) {
    parent.verify();
    if (allowMissing && cause?.code === 'ENOENT') return null;
    unsafe(`archive entry is unavailable: ${child}`, { cause: cause.message });
  }
  parent.verify();
  if (stat.isSymbolicLink()) unsafe(`archive entry is a symbolic link: ${child}`);
  return { path: child, stat, identity: identity(stat) };
}

function pinChildDirectory(parent, name, { allowMissing = false } = {}) {
  const entry = inspectChild(parent, name, { allowMissing });
  if (!entry) return null;
  if (!entry.stat.isDirectory()) unsafe(`archive entry is not a directory: ${entry.path}`);
  const pin = openDirectoryPin(
    { physicalRoot: parent.path, rootIdentity: parent.identity },
    name,
  );
  parent.verify();
  return pin;
}

function runPinnedMutation(request, pins) {
  const expectedPinFields = MUTATION_PIN_FIELDS[request.operation];
  if (!expectedPinFields
    || Object.keys(pins).length !== expectedPinFields.length
    || expectedPinFields.some((field) => !Object.hasOwn(pins, field))) {
    throw new ArchiveJournalError(
      'ARCHIVE_MUTATION_INVALID',
      `archive mutation has an invalid operation or descriptor contract: ${request.operation}`,
    );
  }
  const stdio = ['pipe', 'pipe', 'pipe'];
  const payload = { ...request };
  for (const field of expectedPinFields) {
    const pin = pins[field];
    if (!pin || !Number.isInteger(pin.fd)) {
      unsafe(`archive mutation is missing a pinned directory: ${field}`);
    }
    payload[field] = stdio.length;
    stdio.push(pin.fd);
  }
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized) > MAX_MUTATION_REQUEST_BYTES) {
    throw new ArchiveJournalError(
      'ARCHIVE_MUTATION_INVALID',
      'archive mutation request exceeds the bounded worker protocol',
    );
  }
  const result = require('node:child_process').spawnSync(
    'python3',
    [MUTATION_WORKER],
    {
      input: serialized,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      stdio,
    },
  );
  if (result.error || result.status !== 0) {
    let workerPayload = null;
    const workerStderr = String(result.stderr || '').trim();
    try {
      workerPayload = JSON.parse(workerStderr);
    } catch { /* preserve the worker's exact stderr */ }
    const workerError = workerPayload?.message || workerStderr;
    if (result.error?.code === 'ENOENT'
      || result.error?.code === 'EACCES'
      || result.error?.code === 'ENOEXEC'
      || workerPayload?.code === 'ARCHIVE_RUNTIME_UNAVAILABLE') {
      throw new ArchiveJournalError(
        'ARCHIVE_RUNTIME_UNAVAILABLE',
        'inode-pinned archive mutation requires Python 3 with POSIX dir_fd support',
        {
          operation: request.operation,
          cause: result.error?.message || workerError || 'archive runtime unavailable',
        },
      );
    }
    unsafe('archive pinned mutation failed', {
      operation: request.operation,
      cause: result.error?.message || workerError || `worker exited ${result.status}`,
      signal: result.signal || null,
    });
  }
}

function ensureArchiveRoot(project) {
  const changes = openDirectoryPin(project, '.ultra/changes');
  try {
    const existing = inspectChild(changes, 'archive', { allowMissing: true });
    if (existing) {
      if (!existing.stat.isDirectory()) unsafe(`archive root is not a directory: ${existing.path}`);
      return;
    }
    changes.verify();
    runPinnedMutation({
      operation: 'mkdir_dir',
      directory_identity: changes.identity,
      name: 'archive',
    }, { directory_fd: changes });
    changes.verify();
    const created = inspectChild(changes, 'archive');
    if (!created.stat.isDirectory()) unsafe('created archive root is not a directory');
  } finally {
    changes.close();
  }
}

function openCoreLayout(rootDir, { ensureArchive = false } = {}) {
  const project = inspectProject(rootDir);
  if (ensureArchive) ensureArchiveRoot(project);
  const pins = {};
  try {
    for (const [name, relative] of CORE_DIRECTORIES) {
      pins[name] = openDirectoryPin(project, relative);
    }
  } catch (error) {
    for (const pin of Object.values(pins)) pin?.close();
    throw error;
  }
  return {
    project,
    pins,
    identities: Object.fromEntries(
      Object.entries(pins).map(([name, pin]) => [name, pin.identity]),
    ),
    verify() {
      for (const pin of Object.values(pins)) pin.verify();
    },
    close() {
      for (const pin of Object.values(pins).reverse()) pin.close();
    },
  };
}

function verifyStoredLayout(intent, layout) {
  for (const [name] of CORE_DIRECTORIES) {
    if (!sameIdentity(intent.path_identities?.[name], layout.identities[name])) {
      unsafe(`archive ${name} directory no longer matches the prepared intent`);
    }
  }
}

function assertIntent(intent, rootDir) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)
    || intent.schema_version !== INTENT_VERSION
    || typeof intent.change_id !== 'string' || !intent.change_id
    || !Array.isArray(intent.baseline_updates)
    || typeof intent.reconciliation_path !== 'string' || !intent.reconciliation_path
    || !/^[0-9a-f]{64}$/.test(String(intent.reconciliation_digest || ''))
    || !intent.reconciliation_manifest || typeof intent.reconciliation_manifest !== 'object'
    || typeof intent.summary !== 'string' || intent.summary.trim().length < 3
    || !intent.path_identities || typeof intent.path_identities !== 'object'
    || !intent.source_identity || typeof intent.source_identity !== 'object') {
    throw new ArchiveJournalError('ARCHIVE_INTENT_INVALID', 'archive intent shape is invalid');
  }
  const sourceRelative = normalizeRelative(intent.source, 'source');
  const destinationRelative = normalizeRelative(intent.destination, 'destination');
  if (path.posix.dirname(sourceRelative) !== ACTIVE_ROOT
    || path.posix.basename(sourceRelative) !== intent.change_id) {
    throw new ArchiveJournalError(
      'ARCHIVE_INTENT_INVALID', 'archive intent source is not the active change root',
    );
  }
  if (path.posix.dirname(destinationRelative) !== ARCHIVE_ROOT
    || !path.posix.basename(destinationRelative).endsWith(`-${intent.change_id}`)) {
    throw new ArchiveJournalError(
      'ARCHIVE_INTENT_INVALID', 'archive intent destination is not the change archive root',
    );
  }
  for (const update of intent.baseline_updates) normalizeRelative(update, 'baseline update');
  normalizeRelative(intent.reconciliation_path, 'reconciliation path');
  if (intent.previous_summary !== null && typeof intent.previous_summary !== 'string') {
    throw new ArchiveJournalError('ARCHIVE_INTENT_INVALID', 'previous_summary must be string or null');
  }
  const project = inspectProject(rootDir);
  return {
    intent,
    sourceRelative,
    destinationRelative,
    source: absoluteInside(project, sourceRelative),
    destination: absoluteInside(project, destinationRelative),
  };
}

function readStableText(rootDir, relative, code) {
  try {
    return readStableProjectFile(rootDir, relative, { encoding: 'utf8' });
  } catch (error) {
    throw new ArchiveJournalError(code, `cannot read ${relative} safely: ${error.message}`, {
      cause: error.code || error.message,
    });
  }
}

function rebindJournalRelative(intent, location = 'destination') {
  const root = location === 'source' ? intent.source : intent.destination;
  return `${root}/${REBIND_FILE}`;
}

function normalizeRebindEntry(entry, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new ArchiveJournalError(
      'ARCHIVE_REBIND_INVALID', `archive rebind entry ${index} is invalid`,
    );
  }
  const relativePath = normalizeRelative(entry.relative_path, `rebind entry ${index} path`);
  if (relativePath === INTENT_FILE || relativePath === REBIND_FILE
    || relativePath.startsWith(`${INTENT_FILE}/`)
    || relativePath.startsWith(`${REBIND_FILE}/`)
    || !/^[0-9a-f]{64}$/.test(String(entry.before_digest || ''))
    || !/^[0-9a-f]{64}$/.test(String(entry.after_digest || ''))
    || typeof entry.before_base64 !== 'string'
    || typeof entry.after_base64 !== 'string') {
    throw new ArchiveJournalError(
      'ARCHIVE_REBIND_INVALID', `archive rebind entry ${index} is invalid`,
    );
  }
  const before = Buffer.from(entry.before_base64, 'base64');
  const after = Buffer.from(entry.after_base64, 'base64');
  if (before.toString('base64') !== entry.before_base64
    || after.toString('base64') !== entry.after_base64
    || crypto.createHash('sha256').update(before).digest('hex') !== entry.before_digest
    || crypto.createHash('sha256').update(after).digest('hex') !== entry.after_digest) {
    throw new ArchiveJournalError(
      'ARCHIVE_REBIND_INVALID', `archive rebind entry ${index} payload is invalid`,
    );
  }
  return {
    relative_path: relativePath,
    before_digest: entry.before_digest,
    after_digest: entry.after_digest,
    before_base64: entry.before_base64,
    after_base64: entry.after_base64,
  };
}

function normalizeRebindJournal(value, intent) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.schema_version !== REBIND_VERSION
    || value.change_id !== intent.change_id
    || value.source !== intent.source
    || value.destination !== intent.destination
    || !Array.isArray(value.entries)) {
    throw new ArchiveJournalError(
      'ARCHIVE_REBIND_INVALID', 'archive rebind journal shape is invalid',
    );
  }
  const entries = value.entries.map(normalizeRebindEntry);
  if (new Set(entries.map((entry) => entry.relative_path)).size !== entries.length) {
    throw new ArchiveJournalError(
      'ARCHIVE_REBIND_INVALID', 'archive rebind journal contains duplicate paths',
    );
  }
  return { ...value, entries };
}

function readArchiveRebind(rootDir, intent, { location = 'destination' } = {}) {
  const relative = rebindJournalRelative(intent, location);
  const file = path.join(path.resolve(rootDir), ...relative.split('/'));
  if (!fs.existsSync(file)) return null;
  const stable = readStableText(rootDir, relative, 'ARCHIVE_REBIND_INVALID');
  let value;
  try { value = JSON.parse(stable.text); } catch (error) {
    throw new ArchiveJournalError(
      'ARCHIVE_REBIND_INVALID', `cannot parse ${relative}: ${error.message}`,
    );
  }
  return normalizeRebindJournal(value, intent);
}

function writeRebindTarget(rootDir, rootRelative, entry, bytes) {
  const parentRelative = path.posix.dirname(`${rootRelative}/${entry.relative_path}`);
  const name = path.posix.basename(entry.relative_path);
  const project = inspectProject(rootDir);
  const parent = openDirectoryPin(project, parentRelative);
  try {
    const current = inspectChild(parent, name);
    if (!current.stat.isFile()) {
      unsafe(`archive rebind target is not a regular file: ${entry.relative_path}`);
    }
    writeAtomicRebindEntry(parent, name, bytes);
  } finally {
    parent.close();
  }
}

function verifyRebindTarget(rootDir, rootRelative, entry, expectedDigest) {
  const stable = readStableText(
    rootDir,
    `${rootRelative}/${entry.relative_path}`,
    'ARCHIVE_REBIND_INVALID',
  );
  if (stable.digest !== expectedDigest) {
    throw new ArchiveJournalError(
      'ARCHIVE_REBIND_CONFLICT',
      `archive rebind target has unexpected bytes: ${entry.relative_path}`,
      { expected: expectedDigest, actual: stable.digest },
    );
  }
}

function prepareArchiveRebind(rootDir, intent, entries = null) {
  verifyArchiveIntent(rootDir, intent, { location: 'destination' });
  let journal = readArchiveRebind(rootDir, intent);
  if (!journal) {
    if (!Array.isArray(entries)) {
      throw new ArchiveJournalError(
        'ARCHIVE_REBIND_INVALID', 'archive rebind entries are required for a new journal',
      );
    }
    const normalized = entries.map(normalizeRebindEntry);
    journal = normalizeRebindJournal({
      schema_version: REBIND_VERSION,
      change_id: intent.change_id,
      source: intent.source,
      destination: intent.destination,
      entries: normalized,
      created_at: new Date().toISOString(),
    }, intent);
    for (const entry of journal.entries) {
      verifyRebindTarget(rootDir, intent.destination, entry, entry.before_digest);
    }
    const project = inspectProject(rootDir);
    const destination = openDirectoryPin(project, intent.destination);
    try {
      writeAtomicEntry(
        destination,
        REBIND_FILE,
        `${JSON.stringify(journal, null, 2)}\n`,
      );
    } finally {
      destination.close();
    }
  } else if (entries) {
    const requested = entries.map(normalizeRebindEntry);
    const comparable = (values) => values.map((entry) => ({
      relative_path: entry.relative_path,
      before_digest: entry.before_digest,
      after_digest: entry.after_digest,
    }));
    if (JSON.stringify(comparable(journal.entries))
      !== JSON.stringify(comparable(requested))) {
      throw new ArchiveJournalError(
        'ARCHIVE_REBIND_CONFLICT', 'existing archive rebind journal differs from retry',
      );
    }
  }
  for (const entry of journal.entries) {
    const relative = `${intent.destination}/${entry.relative_path}`;
    const current = readStableText(rootDir, relative, 'ARCHIVE_REBIND_INVALID');
    if (current.digest === entry.after_digest) continue;
    if (current.digest !== entry.before_digest) {
      throw new ArchiveJournalError(
        'ARCHIVE_REBIND_CONFLICT',
        `archive rebind target changed outside the transaction: ${entry.relative_path}`,
      );
    }
    writeRebindTarget(
      rootDir,
      intent.destination,
      entry,
      Buffer.from(entry.after_base64, 'base64'),
    );
    verifyRebindTarget(rootDir, intent.destination, entry, entry.after_digest);
  }
  return journal;
}

function rollbackArchiveRebind(rootDir, intent, { location = 'destination' } = {}) {
  const journal = readArchiveRebind(rootDir, intent, { location });
  if (!journal) return;
  const rootRelative = location === 'source' ? intent.source : intent.destination;
  for (const entry of [...journal.entries].reverse()) {
    const current = readStableText(
      rootDir,
      `${rootRelative}/${entry.relative_path}`,
      'ARCHIVE_REBIND_INVALID',
    );
    if (current.digest !== entry.before_digest) {
      if (current.digest !== entry.after_digest) {
        throw new ArchiveJournalError(
          'ARCHIVE_REBIND_CONFLICT',
          `archive rebind rollback found unknown bytes: ${entry.relative_path}`,
        );
      }
      writeRebindTarget(
        rootDir,
        rootRelative,
        entry,
        Buffer.from(entry.before_base64, 'base64'),
      );
    }
    verifyRebindTarget(rootDir, rootRelative, entry, entry.before_digest);
  }
  const project = inspectProject(rootDir);
  const parent = openDirectoryPin(project, rootRelative);
  try { removePinnedRegularFile(parent, REBIND_FILE); } finally { parent.close(); }
}

function readIntentAt(rootDir, relative, expectedLocation = null) {
  const stable = readStableText(rootDir, relative, 'ARCHIVE_INTENT_CORRUPT');
  let intent;
  try { intent = JSON.parse(stable.text); } catch (error) {
    throw new ArchiveJournalError(
      'ARCHIVE_INTENT_CORRUPT', `cannot parse ${relative}: ${error.message}`,
    );
  }
  const asserted = assertIntent(intent, rootDir);
  const layout = openCoreLayout(rootDir);
  let child;
  try {
    verifyStoredLayout(intent, layout);
    const activeName = path.posix.basename(asserted.sourceRelative);
    const archiveName = path.posix.basename(asserted.destinationRelative);
    const sourceEntry = inspectChild(layout.pins.active, activeName, { allowMissing: true });
    const destinationEntry = inspectChild(
      layout.pins.archive, archiveName, { allowMissing: true },
    );
    const sourceExists = Boolean(sourceEntry);
    const destinationExists = Boolean(destinationEntry);
    if (sourceEntry && !sourceEntry.stat.isDirectory()) {
      unsafe(`active archive source is not a directory: ${asserted.sourceRelative}`);
    }
    if (destinationEntry && !destinationEntry.stat.isDirectory()) {
      unsafe(`archive destination is not a directory: ${asserted.destinationRelative}`);
    }
    if ((sourceEntry && !sameIdentity(sourceEntry.identity, intent.source_identity))
      || (destinationEntry && !sameIdentity(destinationEntry.identity, intent.source_identity))) {
      unsafe(`archive change directory does not match the prepared inode: ${intent.change_id}`);
    }
    const location = sourceExists && !destinationExists
      ? 'source'
      : destinationExists && !sourceExists
        ? 'destination'
        : 'conflict';
    if (expectedLocation && location !== expectedLocation) {
      unsafe(`archive intent is not at the expected ${expectedLocation} location`);
    }
    child = {
      ...asserted,
      source_exists: sourceExists,
      destination_exists: destinationExists,
      location,
    };
  } finally {
    layout.close();
  }
  return child;
}

function writeAtomicEntry(parent, name, contents, { replace = false } = {}) {
  const current = inspectChild(parent, name, { allowMissing: true });
  if (current && (!replace || !current.stat.isFile())) {
    unsafe(`archive file cannot be replaced safely: ${current.path}`);
  }
  parent.verify();
  runPinnedMutation({
    operation: 'write_atomic',
    directory_identity: parent.identity,
    name,
    temp_name: `.${name}.${process.pid}.${crypto.randomUUID()}.tmp`,
    replace,
    data_base64: Buffer.from(contents).toString('base64'),
  }, { directory_fd: parent });
  parent.verify();
  const published = inspectChild(parent, name);
  if (!published.stat.isFile()) {
    unsafe(`archive file is not regular after publication: ${published.path}`);
  }
}

function writeAtomicRebindEntry(parent, name, contents) {
  const current = inspectChild(parent, name);
  if (!current.stat.isFile()) {
    unsafe(`archive rebind target is not a regular file: ${current.path}`);
  }
  parent.verify();
  runPinnedMutation({
    operation: 'write_rebind_atomic',
    directory_identity: parent.identity,
    name,
    temp_name: `.${name}.${process.pid}.${crypto.randomUUID()}.tmp`,
    replace: true,
    data_base64: Buffer.from(contents).toString('base64'),
  }, { directory_fd: parent });
  parent.verify();
  const published = inspectChild(parent, name);
  if (!published.stat.isFile()) {
    unsafe(`archive rebind target is not regular after publication: ${published.path}`);
  }
}

function renderSummary(change, summary, baselineUpdates, noBaselineChangeReason) {
  return [
    `# Archived change: ${change.title}`, '', summary.trim(), '',
    '## Baseline reconciliation', '',
    ...(baselineUpdates.length > 0
      ? baselineUpdates.map((file) => `- ${file}`)
      : [noBaselineChangeReason]), '',
  ].join('\n');
}

function sameOperation(intent, {
  change, summary, baselineUpdates, noBaselineChangeReason, reconciliationPath,
  reconciliationDigest,
}) {
  return intent.change_id === change.id
    && intent.source === normalizeRelative(change.artifact_root, 'source')
    && intent.summary === summary.trim()
    && JSON.stringify(intent.baseline_updates) === JSON.stringify(baselineUpdates)
    && (intent.no_baseline_change_reason || null) === (noBaselineChangeReason || null)
    && intent.reconciliation_path === normalizeRelative(reconciliationPath, 'reconciliation path')
    && intent.reconciliation_digest === reconciliationDigest;
}

function prepareArchiveMove({
  rootDir, change, summary, baselineUpdates, noBaselineChangeReason,
  reconciliationPath, reconciliationDigest, reconciliationManifest, now = new Date(),
}) {
  const sourceRelative = normalizeRelative(change.artifact_root, 'source');
  const date = now.toISOString().slice(0, 10);
  const destinationRelative = `${ARCHIVE_ROOT}/${date}-${change.id}`;
  const sourceName = path.posix.basename(sourceRelative);
  const destinationName = path.posix.basename(destinationRelative);
  const layout = openCoreLayout(rootDir, { ensureArchive: true });
  let sourcePin;
  try {
    if (path.posix.dirname(sourceRelative) !== ACTIVE_ROOT || sourceName !== change.id) {
      throw new ArchiveJournalError(
        'ARCHIVE_INTENT_INVALID', 'change artifact root is not the active change root',
      );
    }
    const sourceEntry = inspectChild(layout.pins.active, sourceName, { allowMissing: true });
    const destinationEntry = inspectChild(
      layout.pins.archive, destinationName, { allowMissing: true },
    );
    if (!sourceEntry) {
      if (!destinationEntry) {
        throw new ArchiveJournalError(
          'ARCHIVE_SOURCE_MISSING', `active change root missing: ${sourceRelative}`,
        );
      }
      const resumed = readIntentAt(
        rootDir, `${destinationRelative}/${INTENT_FILE}`, 'destination',
      );
      if (!sameOperation(resumed.intent, {
        change, summary, baselineUpdates, noBaselineChangeReason,
        reconciliationPath, reconciliationDigest,
      })) {
        throw new ArchiveJournalError(
          'ARCHIVE_INTENT_CONFLICT', 'existing archive intent differs from retry input',
        );
      }
      return {
        ...resumed,
        source: path.resolve(rootDir, sourceRelative),
        destination: path.resolve(rootDir, destinationRelative),
        resumed: true,
      };
    }
    if (!sourceEntry.stat.isDirectory()) unsafe(`active change root is not a directory: ${sourceRelative}`);
    if (destinationEntry) {
      if (!destinationEntry.stat.isDirectory()) {
        unsafe(`archive destination is not a directory: ${destinationRelative}`);
      }
      throw new ArchiveJournalError('ARCHIVE_EXISTS', `archive already exists: ${destinationRelative}`);
    }
    sourcePin = pinChildDirectory(layout.pins.active, sourceName);
    const sourceIdentity = sourcePin.identity;
    const sourceIntentRelative = `${sourceRelative}/${INTENT_FILE}`;
    const existingIntent = inspectChild(sourcePin, INTENT_FILE, { allowMissing: true });
    let prepared;
    if (existingIntent) {
      if (!existingIntent.stat.isFile()) unsafe(`archive intent is not a regular file: ${sourceIntentRelative}`);
      prepared = readIntentAt(rootDir, sourceIntentRelative, 'source');
      if (!sameOperation(prepared.intent, {
        change, summary, baselineUpdates, noBaselineChangeReason,
        reconciliationPath, reconciliationDigest,
      })) {
        throw new ArchiveJournalError(
          'ARCHIVE_INTENT_CONFLICT', 'prepared archive intent differs from retry input',
        );
      }
    } else {
      const summaryEntry = inspectChild(sourcePin, 'archive-summary.md', { allowMissing: true });
      if (summaryEntry && !summaryEntry.stat.isFile()) {
        unsafe('archive summary is not a regular file');
      }
      const previousSummary = summaryEntry
        ? readStableText(
          rootDir, `${sourceRelative}/archive-summary.md`, 'ARCHIVE_PATH_UNSAFE',
        ).text
        : null;
      const intent = {
        schema_version: INTENT_VERSION,
        change_id: change.id,
        source: sourceRelative,
        destination: destinationRelative,
        summary: summary.trim(),
        baseline_updates: baselineUpdates,
        no_baseline_change_reason: noBaselineChangeReason || null,
        reconciliation_path: normalizeRelative(reconciliationPath, 'reconciliation path'),
        reconciliation_digest: reconciliationDigest,
        reconciliation_manifest: reconciliationManifest,
        previous_summary: previousSummary,
        path_identities: layout.identities,
        source_identity: sourceIdentity,
        created_at: now.toISOString(),
      };
      writeAtomicEntry(sourcePin, INTENT_FILE, `${JSON.stringify(intent, null, 2)}\n`);
      layout.verify();
      sourcePin.verify();
      prepared = { ...assertIntent(intent, rootDir), location: 'source', intent };
    }
    writeAtomicEntry(
      sourcePin,
      'archive-summary.md',
      renderSummary(change, summary, baselineUpdates, noBaselineChangeReason),
      { replace: true },
    );
    layout.verify();
    sourcePin.verify();
    if (inspectChild(layout.pins.archive, destinationName, { allowMissing: true })) {
      throw new ArchiveJournalError(
        'ARCHIVE_EXISTS', `archive appeared before rename: ${destinationRelative}`,
      );
    }
    runPinnedMutation({
      operation: 'rename_dir',
      source_parent_identity: layout.pins.active.identity,
      destination_parent_identity: layout.pins.archive.identity,
      guard_parent_identity: layout.pins.changes.identity,
      source_parent_name: 'active',
      destination_parent_name: 'archive',
      source_name: sourceName,
      destination_name: destinationName,
      source_identity: sourceIdentity,
    }, {
      source_parent_fd: layout.pins.active,
      destination_parent_fd: layout.pins.archive,
      guard_parent_fd: layout.pins.changes,
    });
    layout.verify();
    sourcePin.verifyFd();
    if (inspectChild(layout.pins.active, sourceName, { allowMissing: true })) {
      unsafe(`active source still exists after archive rename: ${sourceRelative}`);
    }
    const moved = inspectChild(layout.pins.archive, destinationName);
    if (!moved.stat.isDirectory() || !sameIdentity(moved.identity, sourceIdentity)) {
      unsafe(`archive destination does not match the prepared source: ${destinationRelative}`);
    }
    return {
      ...prepared,
      source: path.resolve(rootDir, sourceRelative),
      destination: path.resolve(rootDir, destinationRelative),
      sourceRelative,
      destinationRelative,
      location: 'destination',
      resumed: false,
    };
  } finally {
    sourcePin?.close();
    layout.close();
  }
}

function listArchiveIntents(rootDir) {
  let project;
  try { project = inspectProject(rootDir); } catch (error) {
    return [{ file: path.resolve(rootDir), error }];
  }
  const found = [];
  for (const relative of [ACTIVE_ROOT, ARCHIVE_ROOT]) {
    let parent;
    try { parent = openDirectoryPin(project, relative, { missing: true }); } catch (error) {
      found.push({ file: absoluteInside(project, relative), error });
      continue;
    }
    if (!parent) continue;
    try {
      parent.verify();
      const entries = fs.readdirSync(parent.path, { withFileTypes: true });
      parent.verify();
      for (const entry of entries) {
        if (['.gitkeep', '.DS_Store'].includes(entry.name)) continue;
        let child;
        try {
          child = inspectChild(parent, entry.name);
          if (!child.stat.isDirectory()) {
            found.push({
              file: child.path,
              error: new ArchiveJournalError(
                'ARCHIVE_PATH_UNSAFE', `archive recovery residue is not a directory: ${child.path}`,
              ),
            });
            continue;
          }
        } catch (error) {
          found.push({ file: path.join(parent.path, entry.name), error });
          continue;
        }
        const intentRelative = `${relative}/${entry.name}/${INTENT_FILE}`;
        let intentEntry;
        const childPin = pinChildDirectory(parent, entry.name);
        try {
          intentEntry = inspectChild(childPin, INTENT_FILE, { allowMissing: true });
        } catch (error) {
          found.push({ file: path.join(child.path, INTENT_FILE), error });
          childPin.close();
          continue;
        }
        childPin.close();
        if (!intentEntry) continue;
        if (!intentEntry.stat.isFile()) {
          found.push({
            file: intentEntry.path,
            error: new ArchiveJournalError(
              'ARCHIVE_PATH_UNSAFE', `archive intent residue is not a regular file: ${intentEntry.path}`,
            ),
          });
          continue;
        }
        try {
          const record = readIntentAt(rootDir, intentRelative);
          found.push({ ...record, file: intentEntry.path, error: null });
        } catch (error) {
          found.push({ file: intentEntry.path, error });
        }
      }
    } catch (error) {
      found.push({ file: parent.path, error });
    } finally {
      parent.close();
    }
  }
  return found;
}

function inspectArchiveIntentState(rootDir, intent) {
  const asserted = assertIntent(intent, rootDir);
  const layout = openCoreLayout(rootDir);
  try {
    verifyStoredLayout(intent, layout);
    const source = inspectChild(
      layout.pins.active, path.posix.basename(asserted.sourceRelative), { allowMissing: true },
    );
    const destination = inspectChild(
      layout.pins.archive,
      path.posix.basename(asserted.destinationRelative),
      { allowMissing: true },
    );
    for (const entry of [source, destination].filter(Boolean)) {
      if (!entry.stat.isDirectory() || !sameIdentity(entry.identity, intent.source_identity)) {
        unsafe(`archive change directory has an unexpected identity: ${entry.path}`);
      }
    }
    return {
      ...asserted,
      source_exists: Boolean(source),
      destination_exists: Boolean(destination),
      location: source && !destination ? 'source' : destination && !source ? 'destination' : 'conflict',
    };
  } finally {
    layout.close();
  }
}

function verifyArchiveIntent(rootDir, intent, { location = 'destination' } = {}) {
  const state = inspectArchiveIntentState(rootDir, intent);
  if (state.location !== location) {
    unsafe(`archive intent is not at the expected ${location} location`);
  }
  const relative = location === 'source' ? state.sourceRelative : state.destinationRelative;
  const record = readIntentAt(rootDir, `${relative}/${INTENT_FILE}`, location);
  if (JSON.stringify(record.intent) !== JSON.stringify(intent)) {
    throw new ArchiveJournalError(
      'ARCHIVE_INTENT_CONFLICT', 'archive intent bytes differ from the supplied operation',
    );
  }
  return state;
}

function removePinnedRegularFile(parent, name, { allowMissing = false } = {}) {
  const entry = inspectChild(parent, name, { allowMissing });
  if (!entry) return;
  if (!entry.stat.isFile()) unsafe(`archive cleanup target is not a regular file: ${entry.path}`);
  parent.verify();
  runPinnedMutation({
    operation: 'unlink_regular',
    directory_identity: parent.identity,
    name,
    allow_missing: allowMissing,
  }, { directory_fd: parent });
  parent.verify();
  if (inspectChild(parent, name, { allowMissing: true })) {
    unsafe(`archive cleanup target still exists: ${entry.path}`);
  }
}

function completeArchiveIntent(rootDir, intent) {
  const state = verifyArchiveIntent(rootDir, intent, { location: 'destination' });
  const rebind = readArchiveRebind(rootDir, intent);
  if (rebind) {
    for (const entry of rebind.entries) {
      verifyRebindTarget(
        rootDir, intent.destination, entry, entry.after_digest,
      );
    }
  }
  const layout = openCoreLayout(rootDir);
  let destination;
  try {
    verifyStoredLayout(intent, layout);
    destination = pinChildDirectory(
      layout.pins.archive, path.posix.basename(state.destinationRelative),
    );
    if (!sameIdentity(destination.identity, intent.source_identity)) {
      unsafe('archive destination changed before journal cleanup');
    }
    removePinnedRegularFile(destination, REBIND_FILE, { allowMissing: true });
    removePinnedRegularFile(destination, INTENT_FILE);
    layout.verify();
  } finally {
    destination?.close();
    layout.close();
  }
}

function rollbackArchiveIntent(rootDir, intent) {
  const asserted = assertIntent(intent, rootDir);
  let state = inspectArchiveIntentState(rootDir, intent);
  if (state.location === 'destination') {
    rollbackArchiveRebind(rootDir, intent, { location: 'destination' });
    const layout = openCoreLayout(rootDir);
    let destination;
    try {
      verifyStoredLayout(intent, layout);
      destination = pinChildDirectory(
        layout.pins.archive, path.posix.basename(asserted.destinationRelative),
      );
      if (!sameIdentity(destination.identity, intent.source_identity)) {
        unsafe('archive destination changed before rollback');
      }
      if (inspectChild(
        layout.pins.active, path.posix.basename(asserted.sourceRelative), { allowMissing: true },
      )) {
        throw new ArchiveJournalError(
          'ARCHIVE_ROLLBACK_FAILED', 'archive source already exists during rollback',
        );
      }
      layout.verify();
      destination.verify();
      runPinnedMutation({
        operation: 'rename_dir',
        source_parent_identity: layout.pins.archive.identity,
        destination_parent_identity: layout.pins.active.identity,
        guard_parent_identity: layout.pins.changes.identity,
        source_parent_name: 'archive',
        destination_parent_name: 'active',
        source_name: path.posix.basename(asserted.destinationRelative),
        destination_name: path.posix.basename(asserted.sourceRelative),
        source_identity: intent.source_identity,
      }, {
        source_parent_fd: layout.pins.archive,
        destination_parent_fd: layout.pins.active,
        guard_parent_fd: layout.pins.changes,
      });
      layout.verify();
      destination.verifyFd();
      const restored = inspectChild(
        layout.pins.active, path.posix.basename(asserted.sourceRelative),
      );
      if (!restored.stat.isDirectory()
        || !sameIdentity(restored.identity, intent.source_identity)) {
        unsafe('restored archive source does not match the prepared inode');
      }
    } finally {
      destination?.close();
      layout.close();
    }
    state = inspectArchiveIntentState(rootDir, intent);
  }
  if (state.location !== 'source') {
    throw new ArchiveJournalError(
      'ARCHIVE_ROLLBACK_FAILED', 'archive roots are not in a recoverable state',
    );
  }
  rollbackArchiveRebind(rootDir, intent, { location: 'source' });
  const layout = openCoreLayout(rootDir);
  let source;
  try {
    verifyStoredLayout(intent, layout);
    source = pinChildDirectory(
      layout.pins.active, path.posix.basename(asserted.sourceRelative),
    );
    if (!sameIdentity(source.identity, intent.source_identity)) {
      unsafe('archive source changed before rollback cleanup');
    }
    if (intent.previous_summary === null) {
      removePinnedRegularFile(source, 'archive-summary.md', { allowMissing: true });
    } else {
      writeAtomicEntry(
        source, 'archive-summary.md', intent.previous_summary, { replace: true },
      );
    }
    removePinnedRegularFile(source, INTENT_FILE);
    layout.verify();
  } finally {
    source?.close();
    layout.close();
  }
}

module.exports = {
  ArchiveJournalError,
  INTENT_FILE,
  REBIND_FILE,
  prepareArchiveMove,
  prepareArchiveRebind,
  readArchiveRebind,
  listArchiveIntents,
  inspectArchiveIntentState,
  verifyArchiveIntent,
  completeArchiveIntent,
  rollbackArchiveIntent,
};
