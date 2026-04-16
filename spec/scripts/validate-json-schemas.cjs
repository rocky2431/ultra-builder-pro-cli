#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const root = path.resolve(__dirname, '..');
const schemasDir = path.join(root, 'schemas');
const validDir = path.join(root, 'fixtures', 'valid');
const invalidDir = path.join(root, 'fixtures', 'invalid');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

let pass = 0;
let fail = 0;
let total = 0;

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function asArray(data) {
  return Array.isArray(data) ? data : [data];
}

function checkFixture(validate, name, file, expectValid) {
  if (!fs.existsSync(file)) return;
  const items = asArray(loadJson(file));
  items.forEach((item, idx) => {
    total++;
    const ok = validate(item);
    const tag = `${name}[${idx}] ${expectValid ? 'valid' : 'invalid'}`;
    if (ok === expectValid) {
      console.log(`  ok ${tag}`);
      pass++;
    } else {
      const errs = validate.errors ? ajv.errorsText(validate.errors) : '(no error)';
      console.error(`  FAIL ${tag} — expected ${expectValid ? 'pass' : 'reject'}; got ${ok ? 'pass' : 'reject'} ${expectValid ? errs : ''}`);
      fail++;
    }
  });
}

if (!fs.existsSync(schemasDir)) {
  console.log('no schemas/ dir, skip');
  process.exit(0);
}

const schemaFiles = fs
  .readdirSync(schemasDir)
  .filter((f) => f.endsWith('.schema.json'));

if (schemaFiles.length === 0) {
  console.log('no JSON schemas yet, skip');
  process.exit(0);
}

for (const file of schemaFiles) {
  const name = file.replace(/\.schema\.json$/, '');
  const schema = loadJson(path.join(schemasDir, file));
  const validate = ajv.compile(schema);
  checkFixture(validate, name, path.join(validDir, `${name}.json`), true);
  checkFixture(validate, name, path.join(invalidDir, `${name}.json`), false);
}

console.log(`json-schema fixtures: ${pass}/${total} passed`);
process.exit(fail > 0 ? 1 : 0);
