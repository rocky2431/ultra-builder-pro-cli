'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const assets = require('../runtime-assets.cjs');

const USER = [
  'ultra-init',
  'ultra-research',
  'ultra-change',
  'ultra-plan',
  'ultra-dev',
  'ultra-test',
  'ultra-deliver',
  'ultra-delegate',
];
const MODEL = [
  'ultra-grilling',
  'ultra-domain-modeling',
  'ultra-tdd',
  'ultra-review',
  'ultra-think',
];
const ROUTER = ['ultra-status'];
const ALL = [...USER, ...MODEL, ...ROUTER];

test('runtime asset manifest has the exact v0.26 role boundary', () => {
  assert.deepEqual(assets.USER_INVOKED_SKILLS, USER);
  assert.deepEqual(assets.MODEL_INVOKED_SKILLS, MODEL);
  assert.deepEqual(assets.ROUTER_SKILLS, ROUTER);
  assert.deepEqual(assets.SUPPORTED_RUNTIMES, ['claude', 'opencode', 'codex', 'kimi', 'grok']);

  for (const runtime of assets.SUPPORTED_RUNTIMES) {
    assert.deepEqual(assets.skillsForRuntime(runtime), ALL, runtime);
  }
  assert.throws(() => assets.skillsForRuntime('unknown'), /unsupported Ultra runtime/);
});

test('host invocation policy keeps owner routes explicit and model disciplines implicit', () => {
  for (const name of [...USER, ...ROUTER]) {
    assert.deepEqual(assets.skillPolicy(name), {
      userInvocable: true,
      allowImplicitInvocation: false,
    }, name);
  }
  for (const name of MODEL) {
    assert.deepEqual(assets.skillPolicy(name), {
      userInvocable: false,
      allowImplicitInvocation: true,
    }, name);
  }
  assert.throws(() => assets.skillPolicy('not-packaged'), /unknown packaged Ultra skill/);
});

test('the hook allowlist contains the five file-first sensors and guards only', () => {
  assert.deepEqual(assets.WORKFLOW_HOOK_FILES, [
    'session_context.py',
    'mid_workflow_recall.py',
    'compact_context.py',
    'post_edit_guard.py',
    'block_dangerous_commands.py',
  ]);
  for (const name of assets.WORKFLOW_HOOK_FILES) {
    assert.ok(fs.existsSync(path.join(ROOT, 'hooks', name)), name);
  }
});

test('npm publish list is explicit and matches the fourteen skills', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const published = pkg.files
    .filter((entry) => entry.startsWith('skills/'))
    .map((entry) => entry.slice('skills/'.length));
  assert.deepEqual(published.sort(), [...ALL].sort());
  assert.deepEqual(Object.keys(pkg.bin), ['ultra-builder-pro-cli', 'ubp']);
  assert.deepEqual(Object.keys(pkg.dependencies), ['js-yaml']);
  assert.ok(!pkg.files.some((entry) => /^(?:commands|agents|mcp-server|orchestrator|ultra-tools)(?:\/|$)/.test(entry)));
});
