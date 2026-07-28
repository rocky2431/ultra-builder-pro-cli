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
    process.stdout.write(`${JSON.stringify({
      root: null,
      breadcrumb: null,
      text: null,
    })}\n`);
    return;
  }
  const breadcrumb = runtime.readProjectBreadcrumb(rootDir);
  process.stdout.write(`${JSON.stringify({
    root: rootDir,
    breadcrumb,
    text: breadcrumb ? runtime.renderProjectBreadcrumb(rootDir, breadcrumb) : null,
  })}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.code || 'BREADCRUMB_FAILED'}: ${error.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = { main };
