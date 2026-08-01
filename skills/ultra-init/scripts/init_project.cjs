#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function usage() {
  return 'usage: init_project.cjs --project <repository-root>';
}

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== '--project' || !argv[1]) {
    throw new Error(usage());
  }
  return path.resolve(argv[1]);
}

function listFiles(root) {
  const files = [];
  (function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) files.push(path.relative(root, file));
    }
  }(root));
  return files.sort();
}

function templateRoot() {
  const installed = path.resolve(__dirname, '..', 'assets', 'project-template');
  if (fs.existsSync(installed)) return installed;
  const checkout = path.resolve(__dirname, '..', '..', '..', '.ultra-template');
  if (fs.existsSync(checkout)) return checkout;
  throw new Error('ultra-init project template is missing');
}

function ensurePlainDirectory(directory, label) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory: ${directory}`);
  }
}

function initialize(project) {
  if (!fs.existsSync(project)) throw new Error(`project does not exist: ${project}`);
  ensurePlainDirectory(project, 'project');
  const source = templateRoot();
  const ultra = path.join(project, '.ultra');
  if (fs.existsSync(ultra)) ensurePlainDirectory(ultra, '.ultra');
  else fs.mkdirSync(ultra);

  const created = [];
  const preserved = [];
  for (const relative of listFiles(source)) {
    const target = path.join(ultra, relative);
    if (fs.existsSync(target)) {
      preserved.push(relative);
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(source, relative), target, fs.constants.COPYFILE_EXCL);
    created.push(relative);
  }
  for (const relative of [...created, ...preserved]) {
    if (!fs.existsSync(path.join(ultra, relative))) {
      throw new Error(`initialization read-back failed: ${relative}`);
    }
  }
  return {
    $schema: 'ultra-init-result-v1',
    project,
    template: source,
    created,
    preserved,
  };
}

try {
  process.stdout.write(`${JSON.stringify(initialize(parseArgs(process.argv.slice(2))), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
