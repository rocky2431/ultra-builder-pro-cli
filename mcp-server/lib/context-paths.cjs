'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CONTEXT_ROOT_RELATIVE = '.ultra/tasks/contexts';
const GENERATED_BY = 'ultra-projector';

class ContextPathError extends Error {
  constructor(message, details = undefined) {
    super(message);
    this.name = 'ContextPathError';
    this.code = 'CONTEXT_PATH_INVALID';
    if (details !== undefined) this.details = details;
  }
}

function invalid(value, reason) {
  throw new ContextPathError(`invalid task context path ${JSON.stringify(value)}: ${reason}`, {
    path: value == null ? null : String(value),
    reason,
  });
}

function assertNoSymlinkAncestors(root, relative, original) {
  let current = root;
  const components = relative.split('/');
  for (let index = 0; index < components.length; index += 1) {
    current = path.join(current, components[index]);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      invalid(original, `cannot inspect ${components.slice(0, index + 1).join('/')}`);
    }
    if (stat.isSymbolicLink()) {
      invalid(original, `symbolic link ancestor is not allowed: ${components.slice(0, index + 1).join('/')}`);
    }
    if (index < components.length - 1 && !stat.isDirectory()) {
      invalid(original, `non-directory ancestor: ${components.slice(0, index + 1).join('/')}`);
    }
  }
}

function assertRealContainment(root, file, original) {
  if (!fs.existsSync(root)) return;
  const realRoot = fs.realpathSync(root);
  let existing = file;
  while (!fs.existsSync(existing) && existing !== root) existing = path.dirname(existing);
  const realExisting = fs.realpathSync(existing);
  if (realExisting !== realRoot && !realExisting.startsWith(`${realRoot}${path.sep}`)) {
    invalid(original, 'resolved path escapes the project root');
  }
}

function resolveContextPath(rootDir, value, {
  taskId,
  allowLegacyAliases = false,
} = {}) {
  const root = path.resolve(rootDir || '.');
  const defaultValue = taskId == null
    ? null
    : `${CONTEXT_ROOT_RELATIVE}/task-${taskId}.md`;
  const original = value || defaultValue;
  if (typeof original !== 'string' || original.trim() === '' || original.includes('\0')) {
    invalid(original, 'a non-empty path is required');
  }

  let raw;
  if (path.isAbsolute(original)) {
    raw = path.relative(root, path.resolve(original)).split(path.sep).join('/');
    if (raw === '..' || raw.startsWith('../')) invalid(original, 'absolute path escapes the project');
  } else {
    raw = original.trim().replaceAll('\\', '/').replace(/^\.\//, '');
  }
  if (raw.split('/').includes('..')) invalid(original, 'parent traversal is not allowed');

  if (allowLegacyAliases && raw.startsWith('contexts/')) {
    raw = `.ultra/tasks/${raw}`;
  } else if (allowLegacyAliases && !raw.includes('/')) {
    raw = `${CONTEXT_ROOT_RELATIVE}/${raw}`;
  }

  const relative = path.posix.normalize(raw);
  if (!relative.startsWith(`${CONTEXT_ROOT_RELATIVE}/`)
    || relative === `${CONTEXT_ROOT_RELATIVE}/`
    || relative.endsWith('/')) {
    invalid(original, `path must be a file below ${CONTEXT_ROOT_RELATIVE}`);
  }
  const file = path.resolve(root, ...relative.split('/'));
  const contextRoot = path.resolve(root, ...CONTEXT_ROOT_RELATIVE.split('/'));
  if (!file.startsWith(`${contextRoot}${path.sep}`)) {
    invalid(original, `path escapes ${CONTEXT_ROOT_RELATIVE}`);
  }
  assertNoSymlinkAncestors(root, relative, original);
  assertRealContainment(root, file, original);
  return { root, contextRoot, relative, file };
}

function isGeneratedContextContents(contents) {
  return new RegExp(`^generated_by:\\s*${GENERATED_BY}\\s*$`, 'm').test(String(contents));
}

module.exports = {
  CONTEXT_ROOT_RELATIVE,
  GENERATED_BY,
  ContextPathError,
  isGeneratedContextContents,
  resolveContextPath,
};
