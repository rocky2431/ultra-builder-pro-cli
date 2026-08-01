'use strict';

// File-system primitives shared by every runtime adapter.
// Pure filesystem — no runtime coupling. Kept small; each adapter layers
// its own runtime-specific behavior on top.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_EXCLUDES = new Set(['.DS_Store', 'Thumbs.db', '__pycache__']);

function isExcluded(name, exclude) {
  return exclude.has(name) || name.endsWith('.pyc') || name.endsWith('.pyo');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function resolveAtomicTarget(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isSymbolicLink()) return file;
    try {
      return fs.realpathSync(file);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`refusing to replace dangling symlink: ${file}`);
      }
      throw error;
    }
  } catch (error) {
    if (error.code === 'ENOENT') return file;
    throw error;
  }
}

function writeAtomic(file, content) {
  ensureDir(path.dirname(file));
  // Rename over the resolved target rather than over a user-managed symlink.
  // This keeps dotfile-manager links intact while retaining atomic replacement.
  const target = resolveAtomicTarget(file);
  ensureDir(path.dirname(target));
  let mode = null;
  try {
    mode = fs.statSync(target).mode & 0o7777;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  // randomUUID defeats predictable tmp-name attacks and PID+ms collisions
  // when two writers hit the same path inside one millisecond.
  const tmp = `${target}.tmp-${crypto.randomUUID()}`;
  try {
    fs.writeFileSync(tmp, content, mode === null ? undefined : { mode });
    if (mode !== null) fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, target);
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function listRelative(root, { exclude = DEFAULT_EXCLUDES } = {}) {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (isExcluded(entry.name, exclude)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(path.relative(root, full));
    }
  })(root);
  return out.sort();
}

function copyTree(src, dst, { exclude = DEFAULT_EXCLUDES, transform } = {}) {
  const files = listRelative(src, { exclude });
  for (const rel of files) {
    const from = path.join(src, rel);
    const to = path.join(dst, rel);
    ensureDir(path.dirname(to));
    if (transform) {
      const original = fs.readFileSync(from);
      const rewritten = transform(original, rel);
      writeAtomic(to, rewritten);
    } else {
      fs.copyFileSync(from, to);
    }
  }
  return files;
}

function removeTree(target, { allowRoot = false } = {}) {
  const abs = path.resolve(target);
  if (!allowRoot && (abs === '/' || abs === path.parse(abs).root)) {
    throw new Error(`refusing to remove filesystem root: ${abs}`);
  }
  // Guard against a target that is itself a symlink: unlink the link,
  // don't rmSync through it (which would delete the target's contents).
  try {
    const lst = fs.lstatSync(abs);
    if (lst.isSymbolicLink()) {
      fs.unlinkSync(abs);
      return;
    }
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  fs.rmSync(abs, { recursive: true, force: true });
}

const UBP_SENTINEL_FILE = '.ubp-managed';

// Write a sentinel file into a managed directory so uninstall can verify
// ownership before deleting (P1 #3).
function markManaged(dir, meta = {}) {
  ensureDir(dir);
  let previous = {};
  const sentinel = path.join(dir, UBP_SENTINEL_FILE);
  if (fs.existsSync(sentinel)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(sentinel, 'utf8'));
      if (parsed?.source === 'ubp') previous = parsed;
    } catch {}
  }
  writeAtomic(sentinel, JSON.stringify({
    ...previous,
    source: 'ubp',
    installed_at: previous.installed_at || new Date().toISOString(),
    ...meta,
  }, null, 2) + '\n');
}

function isManaged(dir) {
  return fs.existsSync(path.join(dir, UBP_SENTINEL_FILE));
}

function managedMetadata(dir) {
  const sentinel = path.join(dir, UBP_SENTINEL_FILE);
  if (!fs.existsSync(sentinel)) return null;
  const value = JSON.parse(fs.readFileSync(sentinel, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid managed marker: ${sentinel}`);
  }
  if (value.source === undefined && Object.keys(value).length === 0) return {};
  if (value.source !== 'ubp') throw new Error(`invalid managed marker: ${sentinel}`);
  return value;
}

function normalizeOwnedRelative(value) {
  if (value === '.') return '.';
  if (typeof value !== 'string' || !value || path.isAbsolute(value)) {
    throw new Error(`owned cleanup path must be relative: ${String(value)}`);
  }
  const normalized = path.normalize(value);
  if (
    normalized !== value
    || normalized === '.'
    || normalized === '..'
    || normalized.startsWith(`..${path.sep}`)
  ) {
    throw new Error(`owned cleanup path escapes its root: ${value}`);
  }
  return normalized;
}

function captureAbsent(root, relatives) {
  const absoluteRoot = path.resolve(root);
  return [...new Set(relatives.map(normalizeOwnedRelative))]
    .filter((relative) => !fs.existsSync(relative === '.' ? absoluteRoot : path.join(absoluteRoot, relative)));
}

function pruneCreatedEmpty(root, relatives) {
  const absoluteRoot = path.resolve(root);
  const ordered = [...new Set((relatives || []).map(normalizeOwnedRelative))]
    .sort((a, b) => {
      const depth = (value) => (value === '.' ? 0 : value.split(path.sep).length);
      return depth(b) - depth(a);
    });
  const removed = [];
  for (const relative of ordered) {
    const target = relative === '.' ? absoluteRoot : path.resolve(absoluteRoot, relative);
    if (target !== absoluteRoot && !target.startsWith(`${absoluteRoot}${path.sep}`)) {
      throw new Error(`owned cleanup path escapes its root: ${relative}`);
    }
    if (!fs.existsSync(target)) continue;
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory() && fs.readdirSync(target).length === 0) {
      fs.rmdirSync(target);
      removed.push(relative);
    } else if (stat.isFile() && stat.size === 0) {
      fs.unlinkSync(target);
      removed.push(relative);
    }
  }
  return removed;
}

function copyFlatByExt(srcDir, dstDir, ext) {
  if (!fs.existsSync(srcDir)) return [];
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(ext));
  if (files.length === 0) return [];
  ensureDir(dstDir);
  for (const f of files) {
    fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f));
  }
  return files;
}

module.exports = {
  DEFAULT_EXCLUDES,
  UBP_SENTINEL_FILE,
  ensureDir,
  writeAtomic,
  listRelative,
  copyTree,
  removeTree,
  markManaged,
  isManaged,
  managedMetadata,
  captureAbsent,
  pruneCreatedEmpty,
  copyFlatByExt,
};
