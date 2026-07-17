#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const Ajv = require('ajv/dist/2020');
const yaml = require('js-yaml');

const repoRoot = path.resolve(__dirname, '..', '..');
const commandsRoot = path.join(repoRoot, 'commands');
const skillsRoot = path.join(repoRoot, 'skills');
const schemaPath = path.join(__dirname, '..', 'schemas', 'command-manifest.schema.json');
const BODY_MAX_LINES = 12;

if (!fs.existsSync(schemaPath) || !fs.existsSync(commandsRoot)) {
  console.log('command manifest schema or commands directory missing, skip');
  process.exit(0);
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(JSON.parse(fs.readFileSync(schemaPath, 'utf8')));

function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return { fm: null, body: text };
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) return { fm: null, body: text };
  return {
    fm: yaml.load(text.slice(4, end)),
    body: text.slice(end + 5),
  };
}

const failed = [];
let passed = 0;

for (const file of fs.readdirSync(commandsRoot).filter((name) => name.endsWith('.md')).sort()) {
  const text = fs.readFileSync(path.join(commandsRoot, file), 'utf8');
  const { fm, body } = parseFrontmatter(text);
  if (!fm) {
    failed.push(`${file}: missing parseable YAML frontmatter`);
    continue;
  }
  if (!validate(fm)) {
    const errors = validate.errors.map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ');
    failed.push(`${file}: ${errors}`);
    continue;
  }

  const commandName = path.basename(file, '.md');
  const expectedRef = `@skills/${commandName}/SKILL.md`;
  if (fm['workflow-ref'] !== expectedRef) {
    failed.push(`${file}: workflow-ref must be ${expectedRef}`);
    continue;
  }
  if (!fs.existsSync(path.join(skillsRoot, commandName, 'SKILL.md'))) {
    failed.push(`${file}: referenced Skill is missing`);
    continue;
  }

  const bodyLines = body.split('\n').length;
  if (bodyLines > BODY_MAX_LINES) {
    failed.push(`${file}: body has ${bodyLines} lines; maximum is ${BODY_MAX_LINES}`);
    continue;
  }
  if (/[\u3400-\u9fff]/u.test(text)) {
    failed.push(`${file}: source command prompt must use English`);
    continue;
  }
  if (!/read and follow/i.test(body) || !/only workflow definition/i.test(body)) {
    failed.push(`${file}: body must delegate the full workflow to its referenced Skill`);
    continue;
  }
  passed += 1;
}

for (const failure of failed) console.error(`  FAIL ${failure}`);
console.log(`commands: ${passed}/${passed + failed.length} thin launchers, ${failed.length} failed`);
process.exit(failed.length > 0 ? 1 : 0);
