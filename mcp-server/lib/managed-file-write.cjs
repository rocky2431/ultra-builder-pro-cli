'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { normalizeProjectRelative } = require('./safe-project-file.cjs');

class ManagedFileWriteError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ManagedFileWriteError';
    this.code = code;
    if (details) this.details = details;
  }
}

function physicalProjectRoot(rootDir) {
  const root = path.resolve(rootDir);
  const stat = fs.lstatSync(root, { throwIfNoEntry: false });
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) {
    throw new ManagedFileWriteError('PATH_AUTHORITY_VIOLATION', `unsafe project root: ${root}`);
  }
  return { root, physical: fs.realpathSync.native(root) };
}

function ensureDirectory(rootDir, relativeDir) {
  const project = physicalProjectRoot(rootDir);
  const components = normalizeProjectRelative(`${relativeDir}/.managed-target`).split('/').slice(0, -1);
  let current = project.physical;
  for (const component of components) {
    current = path.join(current, component);
    let stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!stat) {
      fs.mkdirSync(current, { mode: 0o700 });
      stat = fs.lstatSync(current);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new ManagedFileWriteError(
        'PATH_AUTHORITY_VIOLATION',
        `managed artifact ancestor is unsafe: ${path.relative(project.root, current)}`,
      );
    }
    const physical = fs.realpathSync.native(current);
    if (physical !== project.physical && !physical.startsWith(`${project.physical}${path.sep}`)) {
      throw new ManagedFileWriteError(
        'PATH_AUTHORITY_VIOLATION',
        `managed artifact ancestor escapes the project: ${relativeDir}`,
      );
    }
  }
  return { project, directory: current };
}

function writeManagedFile(rootDir, relativePath, bytes, { mode = 0o600 } = {}) {
  const relative = normalizeProjectRelative(relativePath);
  const directoryRelative = path.posix.dirname(relative);
  const basename = path.posix.basename(relative);
  const prepared = ensureDirectory(rootDir, directoryRelative);
  const target = path.join(prepared.directory, basename);
  const existing = fs.lstatSync(target, { throwIfNoEntry: false });
  if (existing && (existing.isSymbolicLink() || !existing.isFile())) {
    throw new ManagedFileWriteError(
      'PATH_AUTHORITY_VIOLATION',
      `managed artifact target is unsafe: ${relative}`,
    );
  }
  const tempName = `.${basename}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const temporary = path.join(prepared.directory, tempName);
  let fd;
  try {
    fd = fs.openSync(
      temporary,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL
        | (fs.constants.O_NOFOLLOW || 0),
      mode,
    );
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, target);
    const targetStat = fs.lstatSync(target);
    if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
      throw new ManagedFileWriteError(
        'PATH_AUTHORITY_VIOLATION',
        `managed artifact publication changed identity: ${relative}`,
      );
    }
    return {
      path: relative,
      digest: crypto.createHash('sha256').update(bytes).digest('hex'),
      bytes: Buffer.byteLength(bytes),
    };
  } catch (error) {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temporary); } catch {}
    if (error instanceof ManagedFileWriteError) throw error;
    const wrapped = new ManagedFileWriteError(
      'PATH_AUTHORITY_VIOLATION',
      `managed artifact write failed: ${relative}`,
      { cause: error.message },
    );
    throw wrapped;
  }
}

function writeManagedJson(rootDir, relativePath, value) {
  return writeManagedFile(rootDir, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function snapshotManagedFile(rootDir, relativePath) {
  const relative = normalizeProjectRelative(relativePath);
  const directoryRelative = path.posix.dirname(relative);
  const basename = path.posix.basename(relative);
  const prepared = ensureDirectory(rootDir, directoryRelative);
  const target = path.join(prepared.directory, basename);
  const stat = fs.lstatSync(target, { throwIfNoEntry: false });
  if (!stat) return { path: relative, existed: false, bytes: null };
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new ManagedFileWriteError(
      'PATH_AUTHORITY_VIOLATION',
      `managed artifact target is unsafe: ${relative}`,
    );
  }
  return {
    path: relative,
    existed: true,
    bytes: fs.readFileSync(target),
  };
}

function removeManagedFile(rootDir, relativePath) {
  const relative = normalizeProjectRelative(relativePath);
  const directoryRelative = path.posix.dirname(relative);
  const basename = path.posix.basename(relative);
  const prepared = ensureDirectory(rootDir, directoryRelative);
  const target = path.join(prepared.directory, basename);
  const stat = fs.lstatSync(target, { throwIfNoEntry: false });
  if (!stat) return false;
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new ManagedFileWriteError(
      'PATH_AUTHORITY_VIOLATION',
      `managed artifact rollback target is unsafe: ${relative}`,
    );
  }
  fs.unlinkSync(target);
  return true;
}

function restoreManagedFile(rootDir, snapshot) {
  if (!snapshot || typeof snapshot.path !== 'string') {
    throw new ManagedFileWriteError(
      'PATH_AUTHORITY_VIOLATION',
      'managed artifact rollback snapshot is invalid',
    );
  }
  if (snapshot.existed) {
    return writeManagedFile(rootDir, snapshot.path, snapshot.bytes);
  }
  removeManagedFile(rootDir, snapshot.path);
  return { path: snapshot.path, removed: true };
}

module.exports = {
  ManagedFileWriteError,
  removeManagedFile,
  restoreManagedFile,
  snapshotManagedFile,
  writeManagedFile,
  writeManagedJson,
};
