#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function git(cwd, args, encoding = 'utf8') {
  return execFileSync('git', args, {
    cwd,
    encoding,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function projectFromArgs(argv) {
  if (argv.length === 0) return process.cwd();
  if (argv.length === 2 && argv[0] === '--project' && argv[1]) return path.resolve(argv[1]);
  throw new Error('usage: worktree_digest.cjs [--project <repository-root>]');
}

function main(cwd) {
  const root = fs.realpathSync(git(cwd, ['rev-parse', '--show-toplevel']).trim());
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  const diff = git(root, [
    'diff', '--binary', '--no-ext-diff', 'HEAD', '--', '.',
    ':(exclude).ultra/test-report.json',
  ], 'buffer');
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z'], 'buffer')
    .toString('utf8').split('\0').filter(Boolean)
    .filter((file) => file !== '.ultra/test-report.json')
    .sort();
  const hash = crypto.createHash('sha256');
  hash.update('ultra-worktree-digest-v1\0').update(head).update('\0').update(diff);
  for (const file of untracked) {
    hash.update(file).update('\0').update(fs.readFileSync(path.join(root, file))).update('\0');
  }
  return {
    $schema: 'ultra-worktree-digest-v1',
    head,
    dirty: diff.length > 0 || untracked.length > 0,
    diff_digest: hash.digest('hex'),
    untracked_files: untracked,
  };
}

try {
  process.stdout.write(`${JSON.stringify(main(projectFromArgs(process.argv.slice(2))), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
