#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const repoRoot = path.resolve(__dirname, '..', '..');
const manifest = yaml.load(fs.readFileSync(path.join(repoRoot, 'spec', 'mcp-tools.yaml'), 'utf8'));
const liveTools = new Set(manifest.tools.map((tool) => tool.name));
const roots = ['commands', 'skills'].map((name) => path.join(repoRoot, name));
const toolReference = /\b(?:task|session|plan|review|impact|skill|ask|memory)\.[a-z_]+\b/g;
const removedCli = /\bultra-tools\s+(?:ask|skill|subagent)\b/g;
const retiredTools = new Set([
  'review.run', 'review.verdict',
  'impact.radius', 'impact.changes', 'impact.dependents',
  'skill.resolve', 'skill.manifest',
  'ask.question', 'ask.menu',
  'memory.retain', 'memory.recall', 'memory.reflect',
  'session.checkpoint', 'task.create_batch',
]);
const failures = [];

function markdownFiles(root) {
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(target);
    }
  }
  return files;
}

for (const root of roots) {
  for (const file of markdownFiles(root)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const reference of new Set(text.match(toolReference) || [])) {
      if (retiredTools.has(reference)) failures.push(`${path.relative(repoRoot, file)}: non-live MCP tool ${reference}`);
    }
    for (const reference of new Set(text.match(removedCli) || [])) {
      failures.push(`${path.relative(repoRoot, file)}: removed CLI surface ${reference}`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures.sort()) process.stderr.write(`FAIL ${failure}\n`);
  process.exit(1);
}

process.stdout.write(`runtime references: ${liveTools.size} live MCP tools, no retired surfaces\n`);
