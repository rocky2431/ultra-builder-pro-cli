'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const assets = require('../runtime-assets.cjs');

const ALL = ['ultra'];

test('runtime asset manifest has the exact packaged role boundary', () => {
  assert.deepEqual(assets.SUPPORTED_RUNTIMES, ['claude', 'codex']);

  for (const runtime of assets.SUPPORTED_RUNTIMES) {
    assert.deepEqual(assets.skillsForRuntime(runtime), ALL, runtime);
  }
  assert.throws(() => assets.skillsForRuntime('unknown'), /unsupported Ultra runtime/);
});

test('the hook allowlist contains the SessionStart observer only', () => {
  assert.deepEqual(assets.WORKFLOW_HOOK_FILES, ['session-start.cjs']);
  for (const name of assets.WORKFLOW_HOOK_FILES) {
    assert.ok(fs.existsSync(path.join(ROOT, 'hooks', name)), name);
  }
});

test('npm publish list is explicit and matches the ultra Skill', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const published = pkg.files
    .filter((entry) => entry.startsWith('skills/'))
    .map((entry) => entry.slice('skills/'.length));
  assert.deepEqual(published.sort(), [...ALL].sort());
  assert.deepEqual(Object.keys(pkg.bin), ['ultra-builder-pro-cli', 'ubp']);
  assert.deepEqual(Object.keys(pkg.dependencies), ['js-yaml']);
  assert.ok(!pkg.files.some((entry) => /^(?:commands|agents|mcp-server|orchestrator|ultra-tools)(?:\/|$)/.test(entry)));
});
