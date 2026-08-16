#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SNAPSHOT_READ_CHUNK_BYTES = 64 * 1024;

function usage() {
  return 'usage: init_project.cjs --project <repository-root>';
}

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== '--project' || !argv[1]) {
    throw new Error(usage());
  }
  return path.resolve(argv[1]);
}

function listFiles(root) {
  const files = [];
  (function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) files.push(path.relative(root, file));
    }
  }(root));
  return files.sort();
}

function templateRoot() {
  const installed = path.resolve(__dirname, '..', 'assets', 'project-template');
  if (fs.existsSync(installed)) return installed;
  const checkout = path.resolve(__dirname, '..', '..', '..', '.ultra-template');
  if (fs.existsSync(checkout)) return checkout;
  throw new Error('ultra-init project template is missing');
}

function ensurePlainDirectory(directory, label) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory: ${directory}`);
  }
}

function northStarValidator() {
  const validator = path.resolve(
    __dirname,
    '..',
    '..',
    'ultra-research',
    'scripts',
    'validate_north_star.cjs',
  );
  return fs.existsSync(validator) ? require(validator) : null;
}

function identity(stat) {
  return [
    stat.dev,
    stat.ino,
    stat.mode,
    stat.size,
    stat.mtimeNs,
    stat.ctimeNs,
  ];
}

function sameIdentity(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function objectIdentity(snapshotIdentity) {
  return snapshotIdentity.slice(0, 3);
}

function directoryIdentity(stat) {
  return [stat.dev, stat.ino, stat.mode];
}

function preservedNorthStarConflict(phase) {
  const error = new Error(
    'Preserved North Star changed during initialization; retry after the file is stable.',
  );
  error.code = 'preserved_north_star_changed';
  error.retryable = true;
  error.phase = phase;
  error.path = 'north-star.md';
  return error;
}

function northStarTemplateInvalid(report) {
  const error = new Error(
    'new North Star template must pass the full North Star validator as an exact unresearched placeholder',
  );
  error.code = 'north_star_template_invalid';
  error.retryable = true;
  error.phase = 'template_validation';
  error.path = 'north-star.md';
  error.diagnostics = Array.isArray(report?.diagnostics)
    ? report.diagnostics.map((diagnostic) => ({ ...diagnostic }))
    : [];
  return error;
}

function initializationSnapshotConflict(relative, phase, preservedNorthStar = false) {
  if (preservedNorthStar) return preservedNorthStarConflict(phase);
  const error = new Error(
    `Initialization path changed during ${phase}: ${relative}; preserve the current bytes and retry after workspace writes settle.`,
  );
  error.code = 'initialization_snapshot_changed';
  error.retryable = true;
  error.phase = phase;
  error.path = relative;
  return error;
}

function initializationSnapshotIoError(relative, phase, operation, cause) {
  const allowedOperations = new Set(['lstat', 'open', 'fstat', 'read']);
  const safeOperation = allowedOperations.has(operation) ? operation : 'unknown';
  const safeErrno = typeof cause?.code === 'string'
      && /^[A-Z][A-Z0-9_]*$/u.test(cause.code)
    ? cause.code
    : 'UNKNOWN';
  let manualAction = 'Repair the reported filesystem I/O condition, then retry initialization.';
  if (safeErrno === 'EACCES' || safeErrno === 'EPERM') {
    manualAction = 'Check permissions and ownership for the path, then retry initialization.';
  } else if (safeErrno === 'EMFILE' || safeErrno === 'ENFILE') {
    manualAction = 'Release unused file descriptors or raise the process descriptor limit, then retry initialization.';
  } else if (safeErrno === 'EIO') {
    manualAction = 'Check filesystem availability and storage health for the path, then retry initialization.';
  }
  const error = new Error(
    `Initialization snapshot ${safeOperation} failed during ${phase}: ${relative} (${safeErrno}).`,
  );
  error.code = 'initialization_snapshot_io_error';
  error.retryable = true;
  error.phase = phase;
  error.path = relative;
  error.operation = safeOperation;
  error.errno = safeErrno;
  error.recovery = { manual_action: manualAction };
  return error;
}

function snapshotIo(relative, phase, operation, read) {
  try {
    return read();
  } catch (error) {
    throw initializationSnapshotIoError(relative, phase, operation, error);
  }
}

function stageCleanupConflict(stage, snapshot, {
  currentPathPreserved,
  destructiveCleanupAttempted = false,
} = {}) {
  const error = new Error(
    `Staging directory identity changed before cleanup: ${stage}. `
      + 'No replacement path was removed; locate the owned directory by device and inode before manual removal.',
  );
  error.code = 'initialization_cleanup_conflict';
  error.retryable = true;
  error.phase = 'stage_cleanup';
  error.path = path.basename(stage);
  error.recovery = {
    current_path: stage,
    current_path_preserved: Boolean(currentPathPreserved),
    destructive_cleanup_attempted: Boolean(destructiveCleanupAttempted),
    owned_directory: {
      device: String(snapshot.identity[0]),
      inode: String(snapshot.identity[1]),
    },
    manual_action: 'Locate the owned staging directory by device and inode; remove it only after verifying that identity. Do not remove a replacement at current_path.',
  };
  return error;
}

function stableFileSnapshot(file, relative, phase, {
  preservedNorthStar = false,
  retainBytes = false,
} = {}) {
  let descriptor;
  try {
    const beforePath = snapshotIo(
      relative,
      phase,
      'lstat',
      () => fs.lstatSync(file, { bigint: true }),
    );
    if (!beforePath.isFile() || beforePath.isSymbolicLink()) {
      throw initializationSnapshotConflict(relative, phase, preservedNorthStar);
    }
    const noFollow = fs.constants.O_NOFOLLOW || 0;
    descriptor = snapshotIo(
      relative,
      phase,
      'open',
      () => fs.openSync(
        file,
        fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | noFollow,
      ),
    );
    const before = snapshotIo(
      relative,
      phase,
      'fstat',
      () => fs.fstatSync(descriptor, { bigint: true }),
    );
    if (!before.isFile() || !sameIdentity(identity(beforePath), identity(before))) {
      throw initializationSnapshotConflict(relative, phase, preservedNorthStar);
    }
    const hash = crypto.createHash('sha256');
    const retainedChunks = retainBytes ? [] : null;
    const readBuffer = Buffer.allocUnsafe(SNAPSHOT_READ_CHUNK_BYTES);
    let size = 0;
    while (true) {
      const bytesRead = snapshotIo(
        relative,
        phase,
        'read',
        () => fs.readSync(
          descriptor,
          readBuffer,
          0,
          readBuffer.length,
          null,
        ),
      );
      if (bytesRead === 0) break;
      const chunk = readBuffer.subarray(0, bytesRead);
      hash.update(chunk);
      if (retainedChunks) retainedChunks.push(Buffer.from(chunk));
      size += bytesRead;
    }
    const after = snapshotIo(
      relative,
      phase,
      'fstat',
      () => fs.fstatSync(descriptor, { bigint: true }),
    );
    const afterPath = snapshotIo(
      relative,
      phase,
      'lstat',
      () => fs.lstatSync(file, { bigint: true }),
    );
    if (!sameIdentity(identity(before), identity(after))
        || !sameIdentity(identity(after), identity(afterPath))
        || BigInt(size) !== after.size) {
      throw initializationSnapshotConflict(relative, phase, preservedNorthStar);
    }
    const snapshot = {
      size,
      digest: hash.digest('hex'),
      identity: identity(after),
    };
    if (retainedChunks) snapshot.bytes = Buffer.concat(retainedChunks, size);
    return snapshot;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function assertFileSnapshotUnchanged(
  file,
  relative,
  expected,
  phase,
  preservedNorthStar = false,
) {
  const observed = stableFileSnapshot(file, relative, phase, { preservedNorthStar });
  if (!sameIdentity(expected.identity, observed.identity)
      || expected.digest !== observed.digest) {
    throw initializationSnapshotConflict(relative, phase, preservedNorthStar);
  }
  return observed;
}

function stableRepositoryFileSnapshot(
  root,
  ultra,
  relative,
  phase,
  knownDirectories,
  options = {},
) {
  const file = path.join(ultra, relative);
  const parent = path.dirname(file);
  const before = captureDirectoryChain(
    root,
    parent,
    relative,
    phase,
    knownDirectories,
  );
  const snapshot = stableFileSnapshot(file, relative, phase, options);
  const after = captureDirectoryChain(
    root,
    parent,
    relative,
    phase,
    knownDirectories,
  );
  assertSameDirectoryChain(before, after, relative, phase);
  return snapshot;
}

function assertPreservedFilesUnchanged(
  root,
  ultra,
  snapshots,
  phase,
  knownDirectories,
) {
  for (const [relative, expected] of snapshots) {
    const observed = stableRepositoryFileSnapshot(
      root,
      ultra,
      relative,
      phase,
      knownDirectories,
      { preservedNorthStar: relative === 'north-star.md' },
    );
    if (!sameIdentity(expected.identity, observed.identity)
        || expected.digest !== observed.digest) {
      throw initializationSnapshotConflict(
        relative,
        phase,
        relative === 'north-star.md',
      );
    }
  }
}

function captureRoot(project) {
  const before = fs.lstatSync(project, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink()) {
    throw initializationSnapshotConflict('.', 'root_snapshot');
  }
  const resolved = fs.realpathSync.native(project);
  const after = fs.lstatSync(project, { bigint: true });
  if (!after.isDirectory()
      || after.isSymbolicLink()
      || !sameIdentity(directoryIdentity(before), directoryIdentity(after))) {
    throw initializationSnapshotConflict('.', 'root_snapshot');
  }
  return {
    path: project,
    resolved,
    identity: directoryIdentity(after),
  };
}

function captureDirectoryChain(root, directory, relative, phase, knownDirectories) {
  const target = path.resolve(directory);
  const withinRoot = path.relative(root.path, target);
  if (withinRoot === '..'
      || withinRoot.startsWith(`..${path.sep}`)
      || path.isAbsolute(withinRoot)) {
    throw initializationSnapshotConflict(relative, phase);
  }

  const parts = withinRoot === '' ? [] : withinRoot.split(path.sep);
  const chain = [];
  let current = root.path;
  for (let index = 0; index <= parts.length; index += 1) {
    if (index > 0) current = path.join(current, parts[index - 1]);
    let entry;
    let resolved;
    try {
      entry = fs.lstatSync(current, { bigint: true });
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        throw initializationSnapshotConflict(relative, phase);
      }
      resolved = fs.realpathSync.native(current);
    } catch (error) {
      if (error.code === 'initialization_snapshot_changed') throw error;
      throw initializationSnapshotConflict(relative, phase);
    }
    const expectedResolved = path.join(root.resolved, ...parts.slice(0, index));
    const snapshot = {
      path: current,
      resolved,
      identity: directoryIdentity(entry),
    };
    if (resolved !== expectedResolved) {
      throw initializationSnapshotConflict(relative, phase);
    }
    const known = knownDirectories.get(current);
    if (known
        && (known.resolved !== snapshot.resolved
          || !sameIdentity(known.identity, snapshot.identity))) {
      throw initializationSnapshotConflict(relative, phase);
    }
    if (!known) knownDirectories.set(current, snapshot);
    chain.push(snapshot);
  }
  if (root.resolved !== chain[0].resolved
      || !sameIdentity(root.identity, chain[0].identity)) {
    throw initializationSnapshotConflict(relative, phase);
  }
  return chain;
}

function assertSameDirectoryChain(before, after, relative, phase) {
  if (before.length !== after.length) {
    throw initializationSnapshotConflict(relative, phase);
  }
  for (let index = 0; index < before.length; index += 1) {
    if (before[index].path !== after[index].path
        || before[index].resolved !== after[index].resolved
        || !sameIdentity(before[index].identity, after[index].identity)) {
      throw initializationSnapshotConflict(relative, phase);
    }
  }
}

function classifyPreservedNorthStar(file, snapshot) {
  const validator = northStarValidator();
  if (validator?.validateBytes) {
    const report = validator.validateBytes(file, snapshot.bytes);
    if (report.valid && report.kind === 'legacy') return { disposition: 'preserved_legacy' };
    if (report.valid && report.kind === 'north-star-v2' && report.status === 'unresearched') {
      return { disposition: 'preserved_unresearched' };
    }
    if (report.valid && report.kind === 'north-star-v2' && report.status === 'accepted') {
      return { disposition: 'preserved_accepted' };
    }
    return {
      disposition: 'preserved_unknown',
      diagnostics: Array.isArray(report.diagnostics) ? report.diagnostics : [],
    };
  }
  return {
    disposition: 'preserved_unknown',
    diagnostics: [{
      code: 'north_star_validator_missing',
      severity: 'error',
      message: 'Full North Star validator is missing from the installed plugin',
      location: file,
    }],
  };
}

function validateNewNorthStar(file) {
  const validator = northStarValidator();
  if (!validator) throw new Error('full North Star validator is missing from the installed plugin');
  const report = validator.validate(file);
  const idsEmpty = ['FP', 'NS', 'HC'].every(
    (kind) => Array.isArray(report.ids?.[kind]) && report.ids[kind].length === 0,
  );
  if (!(report.valid
      && report.kind === 'north-star-v2'
      && report.status === 'unresearched'
      && idsEmpty)) {
    throw northStarTemplateInvalid(report);
  }
}

function stageFiles(source, relativeFiles, stage) {
  const snapshots = new Map();
  for (const relative of relativeFiles) {
    const target = path.join(stage, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(source, relative), target, fs.constants.COPYFILE_EXCL);
    snapshots.set(relative, stableFileSnapshot(target, relative, 'stage_snapshot'));
  }
  return snapshots;
}

function ensurePublishDirectory(
  directory,
  ultra,
  createdDirectories,
  root,
  knownDirectories,
  relative,
) {
  if (directory === ultra) {
    captureDirectoryChain(root, directory, relative, 'publish_parent', knownDirectories);
    return;
  }
  const parent = path.dirname(directory);
  ensurePublishDirectory(
    parent,
    ultra,
    createdDirectories,
    root,
    knownDirectories,
    relative,
  );
  if (fs.existsSync(directory)) {
    captureDirectoryChain(root, directory, relative, 'publish_parent', knownDirectories);
    return;
  }
  const before = captureDirectoryChain(
    root,
    parent,
    relative,
    'publish_parent_before',
    knownDirectories,
  );
  try {
    fs.mkdirSync(directory);
  } catch {
    throw initializationSnapshotConflict(relative, 'publish_parent');
  }
  const afterParent = captureDirectoryChain(
    root,
    parent,
    relative,
    'publish_parent_after',
    knownDirectories,
  );
  assertSameDirectoryChain(before, afterParent, relative, 'publish_parent_after');
  const chain = captureDirectoryChain(
    root,
    directory,
    relative,
    'publish_parent_after',
    knownDirectories,
  );
  const snapshot = chain[chain.length - 1];
  createdDirectories.push({
    path: directory,
    relative: path.relative(ultra, directory) || '.',
    snapshot,
  });
}

function rollbackPublishedFiles(
  published,
  createdDirectories,
  root,
  knownDirectories,
) {
  let conflict = null;
  for (const item of [...published].reverse()) {
    try {
      const current = stableFileSnapshot(item.target, item.relative, 'rollback');
      if (!item.snapshot
          || !sameIdentity(item.snapshot.identity, current.identity)
          || item.snapshot.digest !== current.digest) {
        conflict ||= initializationSnapshotConflict(item.relative, 'rollback');
        continue;
      }
      const before = captureDirectoryChain(
        root,
        path.dirname(item.target),
        item.relative,
        'rollback',
        knownDirectories,
      );
      fs.unlinkSync(item.target);
      const after = captureDirectoryChain(
        root,
        path.dirname(item.target),
        item.relative,
        'rollback',
        knownDirectories,
      );
      assertSameDirectoryChain(before, after, item.relative, 'rollback');
    } catch (error) {
      conflict ||= error.code === 'initialization_snapshot_changed'
        ? error
        : initializationSnapshotConflict(item.relative, 'rollback');
    }
  }
  for (const item of [...createdDirectories].reverse()) {
    try {
      const entry = fs.lstatSync(item.path, { bigint: true });
      const resolved = fs.realpathSync.native(item.path);
      if (!entry.isDirectory()
          || entry.isSymbolicLink()
          || resolved !== item.snapshot.resolved
          || !sameIdentity(directoryIdentity(entry), item.snapshot.identity)) {
        conflict ||= initializationSnapshotConflict(item.relative, 'rollback');
        continue;
      }
      fs.rmdirSync(item.path);
    } catch (error) {
      conflict ||= initializationSnapshotConflict(item.relative, 'rollback');
    }
  }
  return conflict;
}

function isInitializationConflict(error) {
  return error.code === 'preserved_north_star_changed'
    || error.code === 'initialization_snapshot_changed';
}

function isTypedInitializationError(error) {
  return error?.code === 'preserved_north_star_changed'
    || error?.code === 'initialization_snapshot_changed'
    || error?.code === 'initialization_snapshot_io_error'
    || error?.code === 'initialization_cleanup_conflict'
    || error?.code === 'north_star_template_invalid';
}

function initializationErrorPayload(error, includeSchema = true) {
  const payload = {
    code: error.code,
    retryable: error.retryable,
    phase: error.phase,
    path: error.path,
    message: error.message,
  };
  if (includeSchema) payload.$schema = 'ultra-init-error-v1';
  if (error.operation) payload.operation = error.operation;
  if (error.errno) payload.errno = error.errno;
  if (Array.isArray(error.diagnostics)) payload.diagnostics = error.diagnostics;
  if (error.recovery) payload.recovery = error.recovery;
  if (error.cleanupConflict) {
    payload.cleanup_conflict = initializationErrorPayload(error.cleanupConflict, false);
  }
  return payload;
}

function assertPublishedFilesUnchanged(published, phase) {
  for (const item of published) {
    assertFileSnapshotUnchanged(
      item.target,
      item.relative,
      item.snapshot,
      phase,
    );
  }
}

function publishStagedFiles(
  stage,
  ultra,
  relativeFiles,
  stagedSnapshots,
  root,
  knownDirectories,
) {
  const published = [];
  const createdDirectories = [];
  try {
    for (const relative of relativeFiles) {
      const target = path.join(ultra, relative);
      const staged = path.join(stage, relative);
      const expected = stagedSnapshots.get(relative);
      ensurePublishDirectory(
        path.dirname(target),
        ultra,
        createdDirectories,
        root,
        knownDirectories,
        relative,
      );
      assertFileSnapshotUnchanged(staged, relative, expected, 'before_publish');
      const beforeParent = captureDirectoryChain(
        root,
        path.dirname(target),
        relative,
        'publish_parent_before',
        knownDirectories,
      );
      try {
        fs.linkSync(staged, target);
      } catch {
        throw initializationSnapshotConflict(relative, 'publish');
      }
      const item = { target, relative, snapshot: null };
      published.push(item);
      let observed = stableFileSnapshot(target, relative, 'publish_verify');
      if (!sameIdentity(objectIdentity(expected.identity), objectIdentity(observed.identity))
          || expected.digest !== observed.digest) {
        throw initializationSnapshotConflict(relative, 'publish_verify');
      }
      item.snapshot = observed;
      try {
        fs.unlinkSync(staged);
      } catch {
        throw initializationSnapshotConflict(relative, 'publish_commit');
      }
      observed = stableFileSnapshot(target, relative, 'publish_verify');
      if (!sameIdentity(objectIdentity(expected.identity), objectIdentity(observed.identity))
          || expected.digest !== observed.digest) {
        throw initializationSnapshotConflict(relative, 'publish_verify');
      }
      item.snapshot = observed;
      const afterParent = captureDirectoryChain(
        root,
        path.dirname(target),
        relative,
        'publish_parent_after',
        knownDirectories,
      );
      assertSameDirectoryChain(
        beforeParent,
        afterParent,
        relative,
        'publish_parent_after',
      );
    }
    assertPublishedFilesUnchanged(published, 'after_publish');
  } catch (error) {
    const rollbackConflict = rollbackPublishedFiles(
      published,
      createdDirectories,
      root,
      knownDirectories,
    );
    if (rollbackConflict && !isInitializationConflict(error)) throw rollbackConflict;
    throw error;
  }
  return { published, createdDirectories };
}

function captureStagedDirectories(stage, ultra, root) {
  const directories = [];
  (function walk(directory) {
    const relative = path.relative(stage, directory);
    const entry = fs.lstatSync(directory, { bigint: true });
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw initializationSnapshotConflict(relative || '.ultra', 'before_publish');
    }
    directories.push({
      path: path.join(ultra, relative),
      relative: relative || '.',
      snapshot: {
        resolved: path.join(root.resolved, '.ultra', relative),
        identity: directoryIdentity(entry),
      },
    });
    for (const child of fs.readdirSync(directory, { withFileTypes: true })) {
      if (child.isDirectory()) walk(path.join(directory, child.name));
    }
  }(stage));
  return directories;
}

function assertPathAbsent(file, relative, phase) {
  try {
    fs.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw initializationSnapshotConflict(relative, phase);
  }
  throw initializationSnapshotConflict(relative, phase);
}

function pathExistsWithoutFollowing(file) {
  try {
    fs.lstatSync(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    return true;
  }
}

function cleanupOwnedStage(stage, expected, root, knownDirectories) {
  let current;
  try {
    const chain = captureDirectoryChain(
      root,
      stage,
      path.basename(stage),
      'stage_cleanup',
      knownDirectories,
    );
    current = chain[chain.length - 1];
    if (current.resolved !== expected.resolved
        || !sameIdentity(current.identity, expected.identity)) {
      throw initializationSnapshotConflict(path.basename(stage), 'stage_cleanup');
    }
  } catch {
    throw stageCleanupConflict(stage, expected, {
      currentPathPreserved: pathExistsWithoutFollowing(stage),
    });
  }

  try {
    fs.rmSync(stage, { recursive: true });
  } catch {
    throw stageCleanupConflict(stage, expected, {
      currentPathPreserved: pathExistsWithoutFollowing(stage),
      destructiveCleanupAttempted: true,
    });
  }
}

function initialize(project) {
  if (!fs.existsSync(project)) throw new Error(`project does not exist: ${project}`);
  ensurePlainDirectory(project, 'project');
  const root = captureRoot(project);
  const knownDirectories = new Map([[
    project,
    { path: project, resolved: root.resolved, identity: root.identity },
  ]]);
  const source = templateRoot();
  const ultra = path.join(project, '.ultra');
  const ultraExists = fs.existsSync(ultra);
  if (ultraExists) {
    ensurePlainDirectory(ultra, '.ultra');
    captureDirectoryChain(root, ultra, '.ultra', 'initialization_snapshot', knownDirectories);
  }

  const templateFiles = listFiles(source);
  const preserved = ultraExists
    ? templateFiles.filter((relative) => fs.existsSync(path.join(ultra, relative)))
    : [];
  const created = templateFiles.filter((relative) => !preserved.includes(relative));
  const preservedSnapshots = new Map(preserved.map((relative) => [
    relative,
    stableRepositoryFileSnapshot(
      root,
      ultra,
      relative,
      'classification',
      knownDirectories,
      {
        preservedNorthStar: relative === 'north-star.md',
        retainBytes: relative === 'north-star.md',
      },
    ),
  ]));
  const northStarPath = path.join(ultra, 'north-star.md');
  const northStarSnapshot = preservedSnapshots.get('north-star.md') || null;
  let northStar = created.includes('north-star.md')
    ? { disposition: 'created_unresearched' }
    : classifyPreservedNorthStar(northStarPath, northStarSnapshot);

  assertPreservedFilesUnchanged(
    root,
    ultra,
    preservedSnapshots,
    'before_stage',
    knownDirectories,
  );

  let stage = fs.mkdtempSync(path.join(project, '.ultra-init-'));
  const stageChain = captureDirectoryChain(
    root,
    stage,
    path.basename(stage),
    'stage_snapshot',
    knownDirectories,
  );
  const stageSnapshot = stageChain[stageChain.length - 1];
  let publication = null;
  let pendingError = null;
  try {
    const stagedSnapshots = stageFiles(source, created, stage);
    if (created.includes('north-star.md')) {
      validateNewNorthStar(path.join(stage, 'north-star.md'));
    }
    assertPreservedFilesUnchanged(
      root,
      ultra,
      preservedSnapshots,
      'before_publish',
      knownDirectories,
    );

    if (!ultraExists) {
      for (const [relative, expected] of stagedSnapshots) {
        assertFileSnapshotUnchanged(
          path.join(stage, relative),
          relative,
          expected,
          'before_publish',
        );
      }
      const beforeParent = captureDirectoryChain(
        root,
        project,
        '.ultra',
        'publish_parent_before',
        knownDirectories,
      );
      assertPathAbsent(ultra, '.ultra', 'before_publish');
      const createdDirectories = captureStagedDirectories(stage, ultra, root);
      try {
        fs.renameSync(stage, ultra);
      } catch {
        throw initializationSnapshotConflict('.ultra', 'publish');
      }
      stage = null;
      publication = {
        published: [...stagedSnapshots].map(([relative, snapshot]) => ({
          target: path.join(ultra, relative),
          relative,
          snapshot,
        })),
        createdDirectories,
      };
      const afterParent = captureDirectoryChain(
        root,
        project,
        '.ultra',
        'publish_parent_after',
        knownDirectories,
      );
      assertSameDirectoryChain(
        beforeParent,
        afterParent,
        '.ultra',
        'publish_parent_after',
      );
      const ultraChain = captureDirectoryChain(
        root,
        ultra,
        '.ultra',
        'publish_parent_after',
        knownDirectories,
      );
      const expectedUltra = createdDirectories[0].snapshot;
      const observedUltra = ultraChain[ultraChain.length - 1];
      if (expectedUltra.resolved !== observedUltra.resolved
          || !sameIdentity(expectedUltra.identity, observedUltra.identity)) {
        throw initializationSnapshotConflict('.ultra', 'publish_parent_after');
      }
      for (const item of publication.published) {
        const { relative } = item;
        const expected = stagedSnapshots.get(relative);
        const beforeFileParent = captureDirectoryChain(
          root,
          path.dirname(item.target),
          relative,
          'publish_parent_before',
          knownDirectories,
        );
        const observed = stableFileSnapshot(
          item.target,
          relative,
          'after_publish',
        );
        if (!sameIdentity(objectIdentity(expected.identity), objectIdentity(observed.identity))
            || expected.digest !== observed.digest) {
          throw initializationSnapshotConflict(relative, 'after_publish');
        }
        item.snapshot = observed;
        const afterFileParent = captureDirectoryChain(
          root,
          path.dirname(item.target),
          relative,
          'publish_parent_after',
          knownDirectories,
        );
        assertSameDirectoryChain(
          beforeFileParent,
          afterFileParent,
          relative,
          'publish_parent_after',
        );
      }
      assertPublishedFilesUnchanged(publication.published, 'after_publish');
    } else {
      publication = publishStagedFiles(
        stage,
        ultra,
        created,
        stagedSnapshots,
        root,
        knownDirectories,
      );
      assertPreservedFilesUnchanged(
        root,
        ultra,
        preservedSnapshots,
        'after_publish',
        knownDirectories,
      );
      assertPublishedFilesUnchanged(publication.published, 'after_publish');
    }
  } catch (error) {
    pendingError = error;
    if (publication) {
      const rollbackConflict = rollbackPublishedFiles(
        publication.published,
        publication.createdDirectories,
        root,
        knownDirectories,
      );
      if (rollbackConflict && !isInitializationConflict(error)) {
        pendingError = rollbackConflict;
      }
    }
  } finally {
    if (stage) {
      try {
        cleanupOwnedStage(stage, stageSnapshot, root, knownDirectories);
      } catch (cleanupError) {
        if (pendingError && isTypedInitializationError(pendingError)) {
          pendingError.cleanupConflict = cleanupError;
        } else {
          throw cleanupError;
        }
      }
    }
  }
  if (pendingError) throw pendingError;
  return {
    $schema: 'ultra-init-result-v1',
    project,
    template: source,
    created,
    preserved,
    north_star: {
      path: 'north-star.md',
      ...northStar,
    },
  };
}

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(initialize(parseArgs(process.argv.slice(2))), null, 2)}\n`);
  } catch (error) {
    if (isTypedInitializationError(error)) {
      process.stderr.write(`${JSON.stringify(initializationErrorPayload(error), null, 2)}\n`);
    } else {
      process.stderr.write(`${error.message}\n`);
    }
    process.exitCode = 1;
  }
}

module.exports = {
  assertFileSnapshotUnchanged,
  stableFileSnapshot,
};
