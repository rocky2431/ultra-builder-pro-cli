#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'mcp-tools.yaml');
const metaSchemaPath = path.join(root, 'schemas', 'mcp-tools.schema.json');
const inputValidDir = path.join(root, 'fixtures', 'valid', 'mcp-tools-input');
const outputValidDir = path.join(root, 'fixtures', 'valid', 'mcp-tools-output');
const inputInvalidDir = path.join(root, 'fixtures', 'invalid', 'mcp-tools-input');
const outputInvalidDir = path.join(root, 'fixtures', 'invalid', 'mcp-tools-output');

if (!fs.existsSync(manifestPath) || !fs.existsSync(metaSchemaPath)) {
  console.log('mcp-tools.yaml or meta-schema missing, skip');
  process.exit(0);
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const metaSchema = JSON.parse(fs.readFileSync(metaSchemaPath, 'utf8'));
const manifest = yaml.load(fs.readFileSync(manifestPath, 'utf8'));

let pass = 0;
let fail = 0;

const validateMeta = ajv.compile(metaSchema);
if (!validateMeta(manifest)) {
  console.error('FAIL mcp-tools.yaml does not match meta-schema:');
  console.error(ajv.errorsText(validateMeta.errors, { separator: '\n  ' }));
  process.exit(1);
}
console.log(`ok meta-schema (${manifest.tools.length} tools)`);
pass++;

const seenNames = new Set();
const seenCli = new Set();
for (const tool of manifest.tools) {
  if (seenNames.has(tool.name)) {
    console.error(`FAIL duplicate tool name: ${tool.name}`);
    fail++;
  }
  seenNames.add(tool.name);

  if (seenCli.has(tool.cli_subcommand)) {
    console.error(`FAIL duplicate cli_subcommand: ${tool.cli_subcommand} (tool ${tool.name})`);
    fail++;
  }
  seenCli.add(tool.cli_subcommand);

  if (!tool.name.startsWith(`${tool.family}.`)) {
    console.error(`FAIL tool ${tool.name} family field "${tool.family}" does not match name prefix`);
    fail++;
  }

  for (const which of ['input_schema', 'output_schema']) {
    try {
      ajv.compile(tool[which]);
    } catch (err) {
      console.error(`FAIL ${tool.name}.${which} is not a compilable JSON Schema: ${err.message}`);
      fail++;
    }
  }
}
console.log(`ok ${seenNames.size} unique tool names, ${seenCli.size} unique CLI mappings`);
pass++;

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function checkSampleDir(dir, kind, expectValid) {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const toolName = file.replace(/\.json$/, '');
    const tool = manifest.tools.find((t) => t.name === toolName);
    if (!tool) {
      console.error(`FAIL fixture ${kind}/${file} references unknown tool ${toolName}`);
      fail++;
      continue;
    }
    const schema = tool[`${kind}_schema`];
    const validate = ajv.compile(schema);
    const data = loadJson(path.join(dir, file));
    const items = Array.isArray(data) ? data : [data];
    items.forEach((item, idx) => {
      const ok = validate(item);
      const tag = `${toolName} ${kind}[${idx}] (expect ${expectValid ? 'pass' : 'reject'})`;
      if (ok === expectValid) {
        console.log(`  ok ${tag}`);
        pass++;
      } else {
        const errs = validate.errors ? ajv.errorsText(validate.errors) : '(no error)';
        console.error(`  FAIL ${tag} — ${expectValid ? errs : 'unexpectedly accepted'}`);
        fail++;
      }
    });
  }
}

checkSampleDir(inputValidDir, 'input', true);
checkSampleDir(outputValidDir, 'output', true);
checkSampleDir(inputInvalidDir, 'input', false);
checkSampleDir(outputInvalidDir, 'output', false);

console.log(`mcp-tools: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
