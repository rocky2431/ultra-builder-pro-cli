'use strict';

// File-system primitives shared by every runtime adapter.
// Pure filesystem — no runtime coupling. Kept small; each adapter layers
// its own runtime-specific behavior on top.

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_EXCLUDES = new Set(['.DS_Store', 'Thumbs.db']);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeAtomic(file, content) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

function listRelative(root, { exclude = DEFAULT_EXCLUDES } = {}) {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (exclude.has(entry.name)) continue;
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
  writeAtomic(path.join(dir, UBP_SENTINEL_FILE), JSON.stringify({
    source: 'ubp',
    installed_at: new Date().toISOString(),
    ...meta,
  }, null, 2) + '\n');
}

function isManaged(dir) {
  return fs.existsSync(path.join(dir, UBP_SENTINEL_FILE));
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
  copyFlatByExt,
};
