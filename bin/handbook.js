#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  applyHandbook,
  applyFullHandbook,
  mergeHandbook,
  previewFullHandbook,
  resolveHandbookFile,
} = require('../adapters/_shared/handbook.cjs');

function usage() {
  return [
    'Usage:',
    '  ubp-handbook preview --runtime <claude|codex|opencode|kimi> [--file <path>] [--full]',
    '  ubp-handbook apply   --runtime <claude|codex|opencode|kimi> [--file <path>]',
    '  ubp-handbook apply   --runtime <claude|codex|opencode|kimi> [--file <path>] --full --confirm <token>',
    '',
    'Default mode merges only the Ultra runtime contract.',
    'Full mode replaces legacy unmarked prompt content with the complete host-native handbook,',
    'preserves other provider-managed marker blocks, and creates a timestamped backup.',
    'A full preview prints the target content to stdout and its apply confirmation token to stderr.',
  ].join('\n');
}

function parse(argv) {
  const args = argv.slice(2);
  const action = args.shift();
  let runtime = null;
  let file = null;
  let full = false;
  let confirmation = null;
  function valueFor(flag, index) {
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    return value;
  }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--runtime') {
      runtime = valueFor('--runtime', i);
      i += 1;
    } else if (args[i] === '--file') {
      file = valueFor('--file', i);
      i += 1;
    }
    else if (args[i] === '--full') full = true;
    else if (args[i] === '--confirm') {
      confirmation = valueFor('--confirm', i);
      i += 1;
    }
    else throw new Error(`unknown argument: ${args[i]}`);
  }
  if (!['preview', 'apply'].includes(action) || !runtime) throw new Error(usage());
  if (!['claude', 'codex', 'opencode', 'kimi'].includes(runtime)) {
    throw new Error(`unsupported handbook runtime: ${runtime}`);
  }
  if (action === 'apply' && full && !confirmation) {
    throw new Error('full handbook apply requires --confirm <token> from a current full preview');
  }
  if (confirmation && (action !== 'apply' || !full)) {
    throw new Error('--confirm is valid only with apply --full');
  }
  return {
    action,
    runtime,
    file,
    full,
    confirmation,
  };
}

function main() {
  const {
    action,
    runtime,
    file,
    full,
    confirmation,
  } = parse(process.argv);
  const target = path.resolve(file || resolveHandbookFile(runtime, { homeDir: os.homedir() }));
  if (action === 'preview') {
    const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    if (full) {
      const preview = previewFullHandbook({ runtime, file: target });
      process.stdout.write(preview.content);
      process.stderr.write(`Full apply confirmation: ${preview.confirmation}\n`);
    } else {
      process.stdout.write(mergeHandbook(existing, runtime));
    }
    return;
  }
  const result = full
    ? applyFullHandbook({ runtime, file: target, confirmation })
    : applyHandbook({ runtime, file: target });
  process.stdout.write(JSON.stringify(result) + '\n');
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
