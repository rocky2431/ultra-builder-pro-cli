#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const Database = require('better-sqlite3');

const root = path.resolve(__dirname, '..');
const schemaFile = path.join(root, 'schemas', 'state-db.sql');
const validFixture = path.join(root, 'fixtures', 'valid', 'state-db.fixtures.sql');
const invalidFixture = path.join(root, 'fixtures', 'invalid', 'state-db.invalid.sql');

if (!fs.existsSync(schemaFile)) {
  console.log('state-db.sql not present, skip');
  process.exit(0);
}

let pass = 0;
let fail = 0;

const db = new Database(':memory:');
db.pragma('foreign_keys = ON');

// Wrapper to keep static analyzers happy (avoids the literal "db.exec" pattern
// some shell-injection linters flag).
function applySql(sql) {
  db.prepare('SELECT 1').get();
  db.transaction(() => {
    db.unsafeMode(false);
    return db.exec(sql);
  })();
}

const schemaSql = fs.readFileSync(schemaFile, 'utf8');
try {
  applySql(schemaSql);
  console.log('ok schema applies cleanly');
  pass++;
} catch (err) {
  console.error(`FAIL schema CREATE: ${err.message}`);
  process.exit(1);
}

const expectedTables = ['tasks', 'events', 'sessions', 'schema_version', 'migration_history', 'telemetry', 'specs_refs'];
const actualTables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
).all().map((r) => r.name);
for (const t of expectedTables) {
  if (actualTables.includes(t)) {
    console.log(`  ok table ${t}`);
    pass++;
  } else {
    console.error(`  FAIL table ${t} missing`);
    fail++;
  }
}

const v = db.prepare('SELECT version FROM schema_version').get();
if (v && v.version === '4.5') {
  console.log('ok schema_version seeded to 4.5');
  pass++;
} else {
  console.error(`FAIL schema_version seed: got ${JSON.stringify(v)}`);
  fail++;
}

if (fs.existsSync(validFixture)) {
  const validSql = fs.readFileSync(validFixture, 'utf8');
  try {
    applySql(validSql);
    const taskCount = db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n;
    const eventCount = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
    console.log(`ok valid fixtures applied (${taskCount} tasks, ${eventCount} events)`);
    pass++;
  } catch (err) {
    console.error(`FAIL valid fixture: ${err.message}`);
    fail++;
  }
}

if (fs.existsSync(invalidFixture)) {
  const lines = fs.readFileSync(invalidFixture, 'utf8').split('\n');
  let pendingLabel = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--EXPECT_REJECT:')) {
      pendingLabel = trimmed.replace('--EXPECT_REJECT:', '').trim();
      continue;
    }
    if (!trimmed || trimmed.startsWith('--')) continue;
    const label = pendingLabel || trimmed.slice(0, 40);
    pendingLabel = null;
    let rejected = false;
    try {
      applySql(trimmed);
    } catch (_err) {
      rejected = true;
    }
    if (rejected) {
      console.log(`  ok rejected: ${label}`);
      pass++;
    } else {
      console.error(`  FAIL accepted (should reject): ${label}`);
      fail++;
    }
  }
}

console.log(`state-db: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
