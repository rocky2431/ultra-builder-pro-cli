'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

function git(root, args) {
  return execFileSync('git', args, { cwd: root, maxBuffer: Infinity,
    stdio: ['ignore', 'pipe', 'pipe'] });
}

const ownedFiles = new Set(['.ultra/spec.md', '.ultra/checks.json',
  '.ultra/plan.json', '.ultra/rulings.md']);
const ownedDirs = ['.ultra/ledger', '.ultra/.runtime'];
const engineOwned = (name) => ownedFiles.has(name)
  || ownedDirs.some((dir) => name === dir || name.startsWith(`${dir}/`));

function fingerprintEntries(digest, tree, exclude) {
  // ls-tree separates mode/type/object metadata from the unquoted path with a tab.
  const PATH_SEPARATOR = 0x09;
  let start = 0;
  for (let end = tree.indexOf(0); end !== -1; end = tree.indexOf(0, start)) {
    const entry = tree.subarray(start, end);
    const name = entry.subarray(entry.indexOf(PATH_SEPARATOR) + 1).toString('utf8');
    if (!exclude(name)) digest.update(tree.subarray(start, end + 1));
    start = end + 1;
  }
}

function codeState(root) {
  const digest = createHash('sha256');
  fingerprintEntries(digest, git(root, ['ls-tree', '--full-tree', '-z', 'HEAD']),
    (name) => name === '.ultra');
  fingerprintEntries(digest, git(root, ['ls-tree', '--full-tree', '-z', 'HEAD', '--',
    '.ultra/']), engineOwned);
  const changes = git(root, ['--no-optional-locks', 'status', '--porcelain', '-z',
    '--untracked-files=normal']).toString('utf8').split('\0');
  let dirty = false;
  for (let i = 0; i < changes.length; i++) {
    if (!changes[i]) continue;
    if (!engineOwned(changes[i].slice(3).replace(/\/$/u, ''))) dirty = true;
    if (/[RC]/u.test(changes[i].slice(0, 2)) && !engineOwned(changes[++i])) dirty = true;
  }
  return { code: digest.digest('hex'), dirty };
}

function projectRoot(requested) {
  const root = path.resolve(requested);
  if (!fs.existsSync(root)) {
    throw new Error(`--root ${root} does not exist. Choose an existing project directory.`);
  }
  let top;
  try { top = git(root, ['rev-parse', '--show-toplevel']).toString('utf8').replace(/\n$/u, ''); }
  catch { throw new Error(`${root} is not inside a Git work tree. Run git init first.`); }
  try { git(top, ['rev-parse', '--verify', 'HEAD']); }
  catch { throw new Error(`${top} has no commit. Commit the code first.`); }
  return top;
}

module.exports = { codeState, projectRoot };
