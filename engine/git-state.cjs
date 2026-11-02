'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const INTERRUPTS = require('./signals.cjs');
let localVariables;
const boundRoots = new Set();
const mergeOptions = ['-c', 'maintenance.auto=false', '-c', 'gc.auto=0'];
const bindGit = (root) => { boundRoots.add(root); return () => boundRoots.delete(root); };

function gitEnvironment(root) {
  localVariables ??= execFileSync('git', ['rev-parse', '--local-env-vars'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n');
  const env = { ...process.env };
  for (const name of [...localVariables, 'GIT_LITERAL_PATHSPECS', 'GIT_GLOB_PATHSPECS',
    'GIT_NOGLOB_PATHSPECS', 'GIT_ICASE_PATHSPECS']) delete env[name];
  if (boundRoots.has(root)) env.GIT_CEILING_DIRECTORIES = path.dirname(root);
  return env;
}

function gitFailure(args, error) {
  const reason = String(error.stderr || '').split('\n').find((line) => line.trim());
  error.message = `Git failed: ${args.join(' ')}` + (reason ? `: ${reason}` : '');
  if (INTERRUPTS[error.signal]) error.exitCode = INTERRUPTS[error.signal];
  return error;
}

function git(root, args) {
  if (boundRoots.has(root)) args = [...mergeOptions, ...args];
  try {
    return execFileSync('git', args, { cwd: root, env: gitEnvironment(root), maxBuffer: Infinity,
      stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    throw gitFailure(args, error);
  }
}

function gitAsync(root, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: root, env: gitEnvironment(root),
      stdio: ['ignore', 'pipe', 'pipe'], ...options });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => reject(gitFailure(args, error)));
    child.on('close', (code, signal) => {
      if (code === 0) resolve(Buffer.concat(stdout));
      else reject(gitFailure(args, Object.assign(new Error(),
        { code, signal, stderr: Buffer.concat(stderr).toString('utf8') })));
    });
  });
}

const ownedFiles = new Set(['.ultra/spec.md', '.ultra/checks.json',
  '.ultra/plan.json', '.ultra/rulings.md']);
const ownedDirs = ['.ultra/ledger', '.ultra/records', '.ultra/.runtime'];
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

function codeState(root, exclude = engineOwned) {
  const digest = createHash('sha256');
  fingerprintEntries(digest, git(root, ['ls-tree', '--full-tree', '-z', 'HEAD']),
    (name) => name === '.ultra');
  fingerprintEntries(digest, git(root, ['ls-tree', '--full-tree', '-z', 'HEAD', '--',
    '.ultra/']), engineOwned);
  const changes = git(root, ['--no-optional-locks', 'status', '--porcelain', '-z',
    `--untracked-files=${exclude === engineOwned ? 'normal' : 'all'}`])
    .toString('utf8').split('\0');
  let dirty = false;
  for (let i = 0; i < changes.length; i++) {
    if (!changes[i]) continue;
    if (!exclude(changes[i].slice(3).replace(/\/$/u, ''))) dirty = true;
    if (/[RC]/u.test(changes[i].slice(0, 2)) && !exclude(changes[++i])) dirty = true;
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
  catch (error) {
    if (error.exitCode) throw error;
    throw new Error(`${root} is not inside a Git work tree. Run git init first.`);
  }
  try { git(top, ['rev-parse', '--verify', 'HEAD']); }
  catch (error) {
    if (error.exitCode) throw error;
    throw new Error(`${top} has no commit. Commit the code first.`);
  }
  return top;
}

module.exports = { git, gitAsync, gitEnvironment, bindGit, mergeOptions, codeState, projectRoot };
