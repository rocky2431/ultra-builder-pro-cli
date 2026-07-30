#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const runtime = fs.existsSync(path.join(__dirname, 'index.cjs'))
  ? require('./index.cjs')
  : require('./server.cjs');

function main() {
  const discover = process.argv[2] === '--discover';
  const requested = path.resolve(process.argv[discover ? 3 : 2] || process.cwd());
  const rootDir = discover ? runtime.findProjectRoot(requested) : requested;
  if (!rootDir) {
    process.stdout.write(`${JSON.stringify({ root: null, context: null, text: null })}\n`);
    return;
  }
  const context = runtime.readProjectContextEnvelope(rootDir, {
    runtime: process.env.UBP_HOOK_RUNTIME || 'hook',
  });
  process.stdout.write(`${JSON.stringify({
    root: rootDir,
    context,
    text: context ? runtime.renderProjectContextEnvelope(rootDir, context) : null,
  })}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.code || 'CONTEXT_ENVELOPE_FAILED'}: ${error.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = { main };
