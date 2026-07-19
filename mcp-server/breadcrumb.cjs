#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const runtime = fs.existsSync(path.join(__dirname, 'index.cjs'))
  ? require('./index.cjs')
  : require('./server.cjs');

function main() {
  const rootDir = path.resolve(process.argv[2] || process.cwd());
  const breadcrumb = runtime.readProjectBreadcrumb(rootDir);
  process.stdout.write(`${JSON.stringify({
    breadcrumb,
    text: breadcrumb ? runtime.renderProjectBreadcrumb(rootDir, breadcrumb) : null,
  })}\n`);
}

if (require.main === module) main();

module.exports = { main };
