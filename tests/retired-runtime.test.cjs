'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');
const RETIRED_RUNTIME = ['gem', 'ini'].join('');
const RETIRED_RE = new RegExp(RETIRED_RUNTIME, 'i');
const RETIRED_COMMAND_PROXY = ['r', 'tk'].join('');
const RETIRED_COMMAND_PROXY_RE = new RegExp(`\\b${RETIRED_COMMAND_PROXY}\\b|skip-${RETIRED_COMMAND_PROXY}|${RETIRED_COMMAND_PROXY}-instructions`, 'i');

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
  'docs/WORKFLOW-LIFECYCLE.md',
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

test('retired command proxy has no installer, adapter, prompt, cache, or documentation surface', () => {
  const retiredPaths = [
    path.join('adapters', '_shared', `${RETIRED_COMMAND_PROXY}-detect.cjs`),
    path.join('adapters', '_shared', 'tests', `${RETIRED_COMMAND_PROXY}-detect.test.cjs`),
    `.${RETIRED_COMMAND_PROXY}`,
  ];
  for (const rel of retiredPaths) {
    assert.equal(fs.existsSync(path.join(REPO_ROOT, rel)), false, `${rel} must be removed`);
  }

  const files = [
    ...ACTIVE_ROOTS.flatMap((rel) => activeFiles(path.join(REPO_ROOT, rel))),
    ...fs.readdirSync(path.join(REPO_ROOT, 'docs'))
      .filter((name) => name.endsWith('.md'))
      .map((name) => path.join(REPO_ROOT, 'docs', name)),
    ...['README.md', 'CHANGELOG.md', 'CLAUDE.md', 'AGENTS.md', 'package.json', '.gitignore']
      .map((rel) => path.join(REPO_ROOT, rel))
      .filter((file) => fs.existsSync(file)),
  ];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(text, RETIRED_COMMAND_PROXY_RE, path.relative(REPO_ROOT, file));
  }
});

test('memory and code graph stay external to the Ultra runtime', () => {
  assert.equal(
    fs.existsSync(path.join(REPO_ROOT, 'orchestrator', 'code-graph-watcher.cjs')),
    false,
    'Ultra must not ship an internal code graph watcher',
  );
  assert.equal(
    fs.existsSync(path.join(REPO_ROOT, 'orchestrator', 'tests', 'code-graph-watcher.test.cjs')),
    false,
    'Ultra must not ship tests for an internal code graph watcher',
  );

  const settings = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'settings.json'), 'utf8'));
  assert.equal(Object.hasOwn(settings.orchestrator || {}, 'graph_watcher'), false);

  const installer = fs.readFileSync(path.join(REPO_ROOT, 'bin', 'orchestrator.js'), 'utf8');
  assert.doesNotMatch(installer, /code-graph-watcher|graph_watcher|code-graph-events/i);
});
