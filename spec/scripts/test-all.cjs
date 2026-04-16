#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const scriptsDir = __dirname;
const subScripts = [
  'validate-json-schemas.cjs',
  'validate-mcp-tools.cjs',
  'validate-state-db.cjs',
  'validate-skills.cjs',
  'check-cli-mapping.cjs',
];

let totalFailed = 0;
let totalPassed = 0;
let totalSkipped = 0;

for (const name of subScripts) {
  const file = path.join(scriptsDir, name);
  if (!fs.existsSync(file)) {
    console.log(`[skip] ${name} (not yet implemented)`);
    totalSkipped++;
    continue;
  }
  console.log(`\n=== ${name} ===`);
  const r = spawnSync(process.execPath, [file], { stdio: 'inherit' });
  if (r.status === 0) {
    totalPassed++;
  } else {
    totalFailed++;
  }
}

console.log(`\nspec test summary: ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped`);
process.exit(totalFailed > 0 ? 1 : 0);
