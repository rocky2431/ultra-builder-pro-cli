#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'mcp-tools.yaml');
const protocolPath = path.join(root, 'cli-protocol.md');

if (!fs.existsSync(manifestPath) || !fs.existsSync(protocolPath)) {
  console.log('mcp-tools.yaml or cli-protocol.md missing, skip');
  process.exit(0);
}

const manifest = yaml.load(fs.readFileSync(manifestPath, 'utf8'));
const proto = fs.readFileSync(protocolPath, 'utf8');

let pass = 0;
let fail = 0;

const yamlMap = new Map();
for (const tool of manifest.tools) {
  yamlMap.set(tool.name, tool);
}

const tableLines = proto.split('\n').filter((l) => l.startsWith('| `'));

const docMap = new Map();
for (const line of tableLines) {
  const cells = line.split('|').map((c) => c.trim());
  if (cells.length < 6) continue;
  const toolCell = cells[1].replace(/`/g, '').trim();
  const cliCell = cells[2].replace(/`/g, '').trim();
  if (!/^[a-z]+\.[a-z_]+$/.test(toolCell)) continue;
  docMap.set(toolCell, cliCell);
}

if (docMap.size === 0) {
  console.error('FAIL no mapping rows parsed from cli-protocol.md');
  process.exit(1);
}

for (const [name, tool] of yamlMap) {
  if (!docMap.has(name)) {
    console.error(`  FAIL ${name}: present in mcp-tools.yaml but missing from cli-protocol.md table`);
    fail++;
    continue;
  }
  const docCli = docMap.get(name);
  if (docCli !== tool.cli_subcommand) {
    console.error(`  FAIL ${name}: yaml cli_subcommand="${tool.cli_subcommand}" vs doc table "${docCli}"`);
    fail++;
    continue;
  }
  console.log(`  ok ${name} → ${docCli}`);
  pass++;
}

for (const name of docMap.keys()) {
  if (!yamlMap.has(name)) {
    console.error(`  FAIL ${name}: in cli-protocol.md table but not declared in mcp-tools.yaml`);
    fail++;
  }
}

const cliSet = new Set();
for (const tool of yamlMap.values()) {
  if (cliSet.has(tool.cli_subcommand)) {
    console.error(`  FAIL duplicate cli_subcommand: ${tool.cli_subcommand}`);
    fail++;
  }
  cliSet.add(tool.cli_subcommand);
}

console.log(`cli-mapping: ${pass} mappings verified, ${fail} discrepancies`);
process.exit(fail > 0 ? 1 : 0);
