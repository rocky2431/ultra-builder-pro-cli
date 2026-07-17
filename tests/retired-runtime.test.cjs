'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');
const RETIRED_RUNTIME = ['gem', 'ini'].join('');
const RETIRED_RE = new RegExp(RETIRED_RUNTIME, 'i');

const ACTIVE_ROOTS = [
  'bin',
  'adapters',
  'mcp-server',
  'orchestrator',
  'hooks',
  'skills',
  'spec',
];

const ACTIVE_DOCS = [
  'README.md',
  'package.json',
  'docs/AGENT-CONTEXT.md',
  'docs/ARCHITECTURE.md',
  'docs/ROADMAP.md',
  'docs/RUNTIME-COMPAT-MATRIX.md',
  'docs/USER-HANDBOOK-CONTRACT.md',
];

function activeFiles(root) {
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'tests' || entry.name === 'node_modules') continue;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...activeFiles(absolute));
    else if (entry.name === '.gitkeep' || /\.(?:c?js|json|md|py|sh|sql|ya?ml|toml)$/.test(entry.name)) out.push(absolute);
  }
  return out;
}

test('retired runtime has no active adapter, skill, prompt, schema, or package surface', () => {
  const retiredPaths = [
    path.join('adapters', `${RETIRED_RUNTIME}.js`),
    path.join('skills', `${RETIRED_RUNTIME}-collab`),
    path.join('tests', 'conformance', RETIRED_RUNTIME),
    path.join('adapters', 'tests', `${RETIRED_RUNTIME}.test.cjs`),
  ];
  for (const rel of retiredPaths) {
    assert.equal(fs.existsSync(path.join(REPO_ROOT, rel)), false, `${rel} must be removed`);
  }

  const files = [
    ...ACTIVE_ROOTS.flatMap((rel) => activeFiles(path.join(REPO_ROOT, rel))),
    ...ACTIVE_DOCS.map((rel) => path.join(REPO_ROOT, rel)),
  ];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(text, RETIRED_RE, path.relative(REPO_ROOT, file));
  }
});
