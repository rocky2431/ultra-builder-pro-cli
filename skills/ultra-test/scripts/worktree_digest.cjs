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

function optionsFromArgs(argv) {
  const options = { project: process.cwd(), changeId: null };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error('usage: worktree_digest.cjs [--project <repository-root>] [--change-id <id>]');
    if (flag === '--project') options.project = path.resolve(value);
    else if (flag === '--change-id') options.changeId = value;
    else throw new Error('usage: worktree_digest.cjs [--project <repository-root>] [--change-id <id>]');
  }
  if (options.changeId && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(options.changeId)) {
    throw new Error(`invalid Change id: ${options.changeId}`);
  }
  return options;
}

function intentSnapshot(root, changeId) {
  if (!changeId) return { change_id: null, intent_digest: null };
  const matches = ['active', 'archive', 'abandoned']
    .map((state) => path.join(root, '.ultra', 'changes', state, changeId, 'intent.md'))
    .filter((file) => fs.existsSync(file));
  if (matches.length !== 1) {
    throw new Error(`expected exactly one intent.md for Change ${changeId}; found ${matches.length}`);
  }
  const intent = fs.readFileSync(matches[0]);
  return {
    change_id: changeId,
    intent_digest: crypto.createHash('sha256').update(intent).digest('hex'),
  };
}

function excluded(file) {
  return file === '.ultra/test-report.json'
    || /^\.ultra\/changes\/(?:active|archive|abandoned)(?:\/|$)/.test(file);
}

function main(options) {
  const root = fs.realpathSync(git(options.project, ['rev-parse', '--show-toplevel']).trim());
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  const diff = git(root, [
    'diff', '--binary', '--no-ext-diff', 'HEAD', '--', '.',
    ':(exclude).ultra/test-report.json',
    ':(exclude).ultra/changes/active/**',
    ':(exclude).ultra/changes/archive/**',
    ':(exclude).ultra/changes/abandoned/**',
  ], 'buffer');
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z'], 'buffer')
    .toString('utf8').split('\0').filter(Boolean)
    .filter((file) => !excluded(file))
    .sort();
  const hash = crypto.createHash('sha256');
  hash.update('ultra-worktree-digest-v1\0').update(head).update('\0').update(diff);
  for (const file of untracked) {
    hash.update(file).update('\0').update(fs.readFileSync(path.join(root, file))).update('\0');
  }
  return {
    $schema: 'ultra-worktree-digest-v1',
    ...intentSnapshot(root, options.changeId),
    head,
    dirty: diff.length > 0 || untracked.length > 0,
    diff_digest: hash.digest('hex'),
    untracked_files: untracked,
  };
}

try {
  process.stdout.write(`${JSON.stringify(main(optionsFromArgs(process.argv.slice(2))), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
