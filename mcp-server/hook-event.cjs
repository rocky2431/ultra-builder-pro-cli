#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const runtime = fs.existsSync(path.join(__dirname, 'index.cjs'))
  ? require('./index.cjs')
  : require('./server.cjs');

function main() {
  const rootDir = path.resolve(process.argv[2] || process.cwd());
  const action = process.argv[3];
  let hookInput = {};
  const raw = fs.readFileSync(0, 'utf8');
  if (raw.trim()) {
    hookInput = JSON.parse(raw);
    if (!hookInput || typeof hookInput !== 'object' || Array.isArray(hookInput)) {
      throw new Error('hook input must be a JSON object');
    }
  }
  const result = runtime.appendHookLifecycleEvent({ rootDir, action, hookInput });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    process.stderr.write(`hook lifecycle event failed: ${error.message}\n`);
    process.exit(1);
  }
}

module.exports = { main };
