'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

class SafeProjectFileError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'SafeProjectFileError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details = undefined) {
  throw new SafeProjectFileError(code, message, details);
}

function normalizeProjectRelative(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail('PROJECT_FILE_PATH_INVALID', 'project file path is required');
  }
  const raw = value.trim().replaceAll('\\', '/');
  if (path.posix.isAbsolute(raw) || path.win32.isAbsolute(raw)) {
    fail('PROJECT_FILE_PATH_INVALID', 'project file path must be project-relative');
  }
  const relative = path.posix.normalize(raw).replace(/^\.\//, '');
  if (relative === '.' || relative === '..' || relative.startsWith('../')) {
    fail('PROJECT_FILE_PATH_INVALID', `project file path escapes the project: ${value}`);
  }
  return relative;
}

function identity(stat) {
  return {
    dev: String(stat.dev),
    ino: String(stat.ino),
    mode: stat.mode,
  };
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode;
}

function fileVersion(stat) {
  return {
    size: String(stat.size),
    mtime_ns: String(stat.mtimeNs),
    ctime_ns: String(stat.ctimeNs),
  };
}

function sameFileVersion(left, right) {
  return left.size === right.size
    && left.mtime_ns === right.mtime_ns
    && left.ctime_ns === right.ctime_ns;
}

function inspectProjectRoot(rootDir) {
  const root = path.resolve(rootDir);
  let stat;
  try {
    stat = fs.lstatSync(root);
  } catch (cause) {
    fail('PROJECT_ROOT_UNSAFE', `project root is unavailable: ${root}`, {
      cause: cause.message,
    });
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail('PROJECT_ROOT_UNSAFE', `project root must be a real directory: ${root}`);
  }
  let physicalRoot;
  try {
    physicalRoot = fs.realpathSync.native(root);
  } catch (cause) {
    fail('PROJECT_ROOT_UNSAFE', `project root cannot be resolved safely: ${root}`, {
      cause: cause.message,
    });
  }
  return {
    root,
    physicalRoot,
    rootIdentity: identity(stat),
  };
}

function inspectProjectFile(rootDir, candidate) {
  const relative = normalizeProjectRelative(candidate);
  const project = inspectProjectRoot(rootDir);
  const components = relative.split('/').filter(Boolean);
  const identities = [{
    file: project.root,
    relative: '.',
    kind: 'directory',
    ...project.rootIdentity,
  }];
  let current = project.physicalRoot;
  for (let index = 0; index < components.length; index += 1) {
    current = path.join(current, components[index]);
    const final = index === components.length - 1;
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (cause) {
      if (cause?.code === 'ENOENT' || cause?.code === 'ENOTDIR') {
        fail('PROJECT_FILE_MISSING', `project file does not exist: ${relative}`);
      }
      fail('PROJECT_FILE_UNSAFE', `project file cannot be inspected safely: ${relative}`, {
        component: components.slice(0, index + 1).join('/'),
        cause: cause.message,
      });
    }
    if (stat.isSymbolicLink()) {
      fail('PROJECT_FILE_UNSAFE', `project file path contains a symbolic link: ${relative}`, {
        component: components.slice(0, index + 1).join('/'),
      });
    }
    if (final ? !stat.isFile() : !stat.isDirectory()) {
      fail(
        'PROJECT_FILE_UNSAFE',
        `project file path contains a non-regular ${final ? 'file' : 'ancestor'}: ${relative}`,
        { component: components.slice(0, index + 1).join('/') },
      );
    }
    let physical;
    try {
      physical = fs.realpathSync.native(current);
    } catch (cause) {
      fail('PROJECT_FILE_UNSAFE', `project file cannot be resolved safely: ${relative}`, {
        component: components.slice(0, index + 1).join('/'),
        cause: cause.message,
      });
    }
    if (physical !== project.physicalRoot
      && !physical.startsWith(`${project.physicalRoot}${path.sep}`)) {
      fail('PROJECT_FILE_UNSAFE', `project file escapes the physical project root: ${relative}`, {
        component: components.slice(0, index + 1).join('/'),
        physical,
      });
    }
    identities.push({
      file: current,
      relative: components.slice(0, index + 1).join('/'),
      kind: final ? 'file' : 'directory',
      ...identity(stat),
    });
  }
  return {
    ...project,
    relative,
    file: current,
    identities,
    final: identities.at(-1),
  };
}

function verifyProjectFileSnapshot(before, fd) {
  const after = inspectProjectFile(before.root, before.relative);
  let opened;
  try {
    opened = fs.fstatSync(fd);
  } catch (cause) {
    fail('PROJECT_FILE_UNSAFE', `project file descriptor is unavailable: ${before.relative}`, {
      cause: cause.message,
    });
  }
  if (!opened.isFile()
    || !sameIdentity(identity(opened), before.final)
    || before.identities.length !== after.identities.length
    || before.identities.some((entry, index) => (
      entry.relative !== after.identities[index].relative
      || entry.kind !== after.identities[index].kind
      || !sameIdentity(entry, after.identities[index])
    ))) {
    fail('PROJECT_FILE_UNSAFE', `project file path changed identity while it was read: ${before.relative}`);
  }
}

function readStableFdSnapshot(fd, relative) {
  let before;
  try {
    before = fs.fstatSync(fd, { bigint: true });
  } catch (cause) {
    fail('PROJECT_FILE_UNSAFE', `project file descriptor is unavailable: ${relative}`, {
      cause: cause.message,
    });
  }
  if (!before.isFile()) {
    fail('PROJECT_FILE_UNSAFE', `project file descriptor is not a regular file: ${relative}`);
  }
  const size = Number(before.size);
  if (!Number.isSafeInteger(size) || size < 0) {
    fail('PROJECT_FILE_UNSAFE', `project file is too large to read safely: ${relative}`);
  }
  const bytes = Buffer.allocUnsafe(size);
  let offset = 0;
  while (offset < size) {
    const count = fs.readSync(fd, bytes, offset, size - offset, offset);
    if (count === 0) {
      fail('PROJECT_FILE_CHANGED', `project file changed while it was read: ${relative}`);
    }
    offset += count;
  }
  const overflow = Buffer.allocUnsafe(1);
  if (fs.readSync(fd, overflow, 0, 1, size) !== 0) {
    fail('PROJECT_FILE_CHANGED', `project file changed while it was read: ${relative}`);
  }
  const after = fs.fstatSync(fd, { bigint: true });
  const beforeVersion = fileVersion(before);
  const afterVersion = fileVersion(after);
  if (!after.isFile() || !sameFileVersion(beforeVersion, afterVersion)) {
    fail('PROJECT_FILE_CHANGED', `project file changed while it was read: ${relative}`, {
      before: beforeVersion,
      after: afterVersion,
    });
  }
  return {
    bytes,
    version: afterVersion,
    digest: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
}

function openStableProjectRead(rootDir, candidate) {
  const snapshot = inspectProjectFile(rootDir, candidate);
  let fd;
  try {
    fd = fs.openSync(
      snapshot.file,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
    );
    verifyProjectFileSnapshot(snapshot, fd);
    const initial = readStableFdSnapshot(fd, snapshot.relative);
    verifyProjectFileSnapshot(snapshot, fd);
    return {
      root: snapshot.root,
      physicalRoot: snapshot.physicalRoot,
      relative: snapshot.relative,
      file: snapshot.file,
      bytes: initial.bytes,
      digest: initial.digest,
      verify() {
        verifyProjectFileSnapshot(snapshot, fd);
        const current = readStableFdSnapshot(fd, snapshot.relative);
        if (!sameFileVersion(initial.version, current.version)
          || initial.digest !== current.digest) {
          fail('PROJECT_FILE_CHANGED', `project file changed after it was read: ${snapshot.relative}`, {
            expected_digest: initial.digest,
            actual_digest: current.digest,
            expected_version: initial.version,
            actual_version: current.version,
          });
        }
        verifyProjectFileSnapshot(snapshot, fd);
      },
      close() {
        if (fd !== undefined) {
          fs.closeSync(fd);
          fd = undefined;
        }
      },
    };
  } catch (error) {
    if (fd !== undefined) fs.closeSync(fd);
    if (error instanceof SafeProjectFileError) throw error;
    if (error?.code === 'ENOENT') {
      fail('PROJECT_FILE_MISSING', `project file does not exist: ${snapshot.relative}`);
    }
    fail(
      'PROJECT_FILE_UNSAFE',
      `project file cannot be opened without following links: ${snapshot.relative}`,
      { cause: error.message },
    );
  }
}

function readStableProjectFile(rootDir, candidate, { encoding = null } = {}) {
  const reader = openStableProjectRead(rootDir, candidate);
  try {
    reader.verify();
    return {
      root: reader.root,
      physicalRoot: reader.physicalRoot,
      relative: reader.relative,
      file: reader.file,
      bytes: reader.bytes,
      text: encoding ? reader.bytes.toString(encoding) : null,
      digest: reader.digest,
    };
  } finally {
    reader.close();
  }
}

function walkStableProjectTree(rootDir, candidate, {
  ignore = () => false,
} = {}) {
  const relativeRoot = normalizeProjectRelative(candidate);
  const project = inspectProjectRoot(rootDir);
  const absoluteRoot = path.join(project.physicalRoot, ...relativeRoot.split('/'));
  let rootStat;
  try {
    rootStat = fs.lstatSync(absoluteRoot);
  } catch (cause) {
    if (cause?.code === 'ENOENT') return { files: [], unsafe: [] };
    return {
      files: [],
      unsafe: [{ path: relativeRoot, reason: cause.message }],
    };
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    return {
      files: [],
      unsafe: [{
        path: relativeRoot,
        reason: rootStat.isSymbolicLink()
          ? 'tree root is a symbolic link'
          : 'tree root is not a directory',
      }],
    };
  }
  const files = [];
  const unsafe = [];

  const visit = (directory, relative, expected) => {
    let entries;
    try {
      const before = fs.lstatSync(directory);
      if (before.isSymbolicLink() || !before.isDirectory()
        || !sameIdentity(identity(before), expected)) {
        unsafe.push({ path: relative, reason: 'directory identity changed' });
        return;
      }
      entries = fs.readdirSync(directory, { withFileTypes: true });
      const after = fs.lstatSync(directory);
      if (after.isSymbolicLink() || !after.isDirectory()
        || !sameIdentity(identity(after), expected)) {
        unsafe.push({ path: relative, reason: 'directory identity changed while listed' });
        return;
      }
    } catch (cause) {
      unsafe.push({ path: relative, reason: cause.message });
      return;
    }
    for (const entry of entries) {
      const childRelative = `${relative}/${entry.name}`;
      const child = path.join(directory, entry.name);
      let stat;
      try {
        stat = fs.lstatSync(child);
      } catch (cause) {
        unsafe.push({ path: childRelative, reason: cause.message });
        continue;
      }
      if (stat.isSymbolicLink()) {
        unsafe.push({ path: childRelative, reason: 'tree entry is a symbolic link' });
        continue;
      }
      if (ignore(childRelative, entry, stat)) continue;
      if (stat.isDirectory()) {
        visit(child, childRelative, identity(stat));
        continue;
      }
      if (!stat.isFile()) {
        unsafe.push({ path: childRelative, reason: 'tree entry is not a regular file' });
        continue;
      }
      files.push(childRelative);
    }
  };

  visit(absoluteRoot, relativeRoot, identity(rootStat));
  return { files, unsafe };
}

module.exports = {
  SafeProjectFileError,
  inspectProjectFile,
  normalizeProjectRelative,
  openStableProjectRead,
  readStableProjectFile,
  walkStableProjectTree,
};
