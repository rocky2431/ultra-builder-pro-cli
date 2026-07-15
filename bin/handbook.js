#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  applyHandbook,
  mergeHandbook,
  resolveHandbookFile,
} = require('../adapters/_shared/handbook.cjs');

function usage() {
  return [
    'Usage:',
    '  ubp-handbook preview --runtime <claude|codex|opencode> [--file <path>]',
    '  ubp-handbook apply   --runtime <claude|codex|opencode> [--file <path>]',
    '',
    'The apply command creates a timestamped backup before changing an existing file.',
  ].join('\n');
}

function parse(argv) {
  const args = argv.slice(2);
  const action = args.shift();
  let runtime = null;
  let file = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--runtime') runtime = args[++i];
    else if (args[i] === '--file') file = args[++i];
    else throw new Error(`unknown argument: ${args[i]}`);
  }
  if (!['preview', 'apply'].includes(action) || !runtime) throw new Error(usage());
  return { action, runtime, file };
}

function main() {
  const { action, runtime, file } = parse(process.argv);
  const target = path.resolve(file || resolveHandbookFile(runtime, { homeDir: os.homedir() }));
  if (action === 'preview') {
    const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    process.stdout.write(mergeHandbook(existing, runtime));
    return;
  }
  process.stdout.write(JSON.stringify(applyHandbook({ runtime, file: target })) + '\n');
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
