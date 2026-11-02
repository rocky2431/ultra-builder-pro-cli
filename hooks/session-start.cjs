#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function readInput() {
  if (process.stdin.isTTY) return Promise.resolve('');
  return new Promise((resolve) => {
    let text = '';
    const collect = (chunk) => { text += chunk; };
    const finish = () => {
      clearTimeout(timer);
      process.stdin.off('data', collect);
      process.stdin.destroy();
      resolve(text);
    };
    const timer = setTimeout(finish, 1000);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', collect);
    process.stdin.once('end', finish);
    process.stdin.once('error', finish);
  });
}

function projectRoot(cwd) {
  let dir = path.resolve(cwd);
  while (!fs.existsSync(path.join(dir, '.ultra', 'spec.md'))) {
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return dir;
}

async function main() {
  let cwd = process.cwd();
  try {
    const value = JSON.parse(await readInput());
    if (typeof value?.cwd === 'string' && value.cwd) cwd = value.cwd;
  } catch { /* Missing or malformed input uses the process working directory. */ }
  const root = projectRoot(cwd);
  if (!root) return;
  const result = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'engine', 'cli.cjs'), 'status', '--root', root,
  ], { encoding: 'utf8', timeout: 8000 });
  if (result.stdout) process.stdout.write(result.stdout);
  process.stdout.write('Use the ultra Skill to drive this project.\n');
}

// An advisory observation must never prevent a session from starting.
main().catch(() => {}).finally(() => { process.exitCode = 0; });
