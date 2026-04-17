#!/usr/bin/env node
'use strict';

// Phase 3.0 validator. Enforces the "thin-shell" command contract
// defined in spec/command-template.md + spec/schemas/command-manifest.schema.json.
//
// Behaviour:
//   - scans commands/*.md
//   - parses YAML frontmatter (or records "no frontmatter")
//   - runs ajv against command-manifest schema
//   - if workflow-ref is set, enforces body ≤ 80 lines + referenced skill exists
//   - reports three buckets: migrated (shell + schema ok), unmigrated (no
//     workflow-ref yet), failed (schema or body violation)
//   - exits 1 on any failure; unmigrated files do NOT fail the gate until
//     Phase 3 gate is enabled via env UBP_COMMAND_STRICT=1

const fs = require('node:fs');
const path = require('node:path');

const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const yaml = require('js-yaml');

const repoRoot = path.resolve(__dirname, '..', '..');
const commandsRoot = path.join(repoRoot, 'commands');
const skillsRoot = path.join(repoRoot, 'skills');
const schemaPath = path.join(__dirname, '..', 'schemas', 'command-manifest.schema.json');
const strict = process.env.UBP_COMMAND_STRICT === '1';
const BODY_MAX_LINES = 80;

if (!fs.existsSync(schemaPath) || !fs.existsSync(commandsRoot)) {
  console.log('command-manifest schema or commands/ missing, skip');
  process.exit(0);
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(fs.readFileSync(schemaPath, 'utf8')));

const commandFiles = fs
  .readdirSync(commandsRoot)
  .filter((f) => f.endsWith('.md'))
  .sort();

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return { fm: null, bodyStart: 0 };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { fm: null, bodyStart: 0 };
  const fm = yaml.load(text.slice(3, end));
  const bodyStart = end + 4;
  return { fm, bodyStart };
}

const results = { migrated: [], unmigrated: [], failed: [] };

for (const file of commandFiles) {
  const full = path.join(commandsRoot, file);
  const text = fs.readFileSync(full, 'utf8');
  const { fm, bodyStart } = parseFrontmatter(text);
  if (!fm) {
    results.failed.push({ file, reason: 'no parseable YAML frontmatter' });
    continue;
  }

  const ok = validate(fm);
  if (!ok) {
    const errs = validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');
    results.failed.push({ file, reason: `schema: ${errs}` });
    continue;
  }

  if (!fm['workflow-ref']) {
    results.unmigrated.push({ file });
    continue;
  }

  // migrated-track checks: body line cap + referenced skill exists
  const body = text.slice(bodyStart);
  const bodyLines = body.split('\n').length;
  if (bodyLines > BODY_MAX_LINES) {
    results.failed.push({
      file,
      reason: `body ${bodyLines} lines > ${BODY_MAX_LINES} (thin-shell contract)`,
    });
    continue;
  }

  const refMatch = fm['workflow-ref'].match(/^@skills\/([a-z][a-z0-9\-]*)\/SKILL\.md$/);
  if (!refMatch) {
    results.failed.push({ file, reason: `workflow-ref malformed: ${fm['workflow-ref']}` });
    continue;
  }
  const skillFile = path.join(skillsRoot, refMatch[1], 'SKILL.md');
  if (!fs.existsSync(skillFile)) {
    results.failed.push({
      file,
      reason: `workflow-ref target missing: ${path.relative(repoRoot, skillFile)}`,
    });
    continue;
  }

  results.migrated.push({ file, body_lines: bodyLines });
}

console.log(`  migrated:   ${results.migrated.length}`);
for (const r of results.migrated) {
  console.log(`    ok ${r.file} (${r.body_lines} body lines)`);
}
console.log(`  unmigrated: ${results.unmigrated.length}`);
for (const r of results.unmigrated) {
  console.log(`    -- ${r.file} (no workflow-ref yet)`);
}
console.log(`  failed:     ${results.failed.length}`);
for (const r of results.failed) {
  console.error(`    FAIL ${r.file}: ${r.reason}`);
}

const total = commandFiles.length;
const migrated = results.migrated.length;
const unmigrated = results.unmigrated.length;
const failed = results.failed.length;
console.log(`commands: ${migrated}/${total} migrated, ${unmigrated} pending, ${failed} failed${strict ? ' [strict]' : ''}`);

if (failed > 0) {
  process.exit(1);
}
if (strict && unmigrated > 0) {
  console.error(`FAIL strict mode: ${unmigrated} commands without workflow-ref (Phase 3 gate)`);
  process.exit(1);
}
process.exit(0);
