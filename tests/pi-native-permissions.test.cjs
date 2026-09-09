'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { permissionForTool } = require('../skills/ultra-delegate/scripts/pi-native-permissions.cjs');

test('Pi native calls use the existing immutable write envelope before execution', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-pi-policy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cwd = path.join(root, 'worktree');
  const writable = path.join(cwd, 'src');
  fs.mkdirSync(writable, { recursive: true });
  const spec = { cwd, writable_root_paths: [writable], read_only: false };
  const decide = (toolName, input, policy = spec) => permissionForTool(policy, { toolName, input });
  const relative = { path: 'src/result.txt', content: 'ok' };
  assert.equal(decide('write', relative).allowed, true);
  assert.equal(relative.path, path.join(writable, 'result.txt'));
  assert.equal(decide('edit', { path: pathToFileURL(path.join(writable, 'result.txt')).href }).allowed, true);
  assert.equal(decide('write', { path: '@src/result.txt' }).allowed, true);
  assert.equal(decide('write', { path: '../outside.txt' }).allowed, false);
  assert.equal(decide('write', { path: pathToFileURL(path.join(root, 'outside.txt')).href }).allowed, false);
  assert.equal(decide('write', { path: '.ultra/authority.json' }, { ...spec, writable_root_paths: [cwd] }).allowed, false);
  fs.mkdirSync(path.join(cwd, '.ultra', '.runtime'), { recursive: true });
  fs.symlinkSync(path.join(cwd, '.ultra'), path.join(writable, 'authority-alias'), 'dir');
  assert.equal(decide('write', { path: 'src/authority-alias/.runtime/marker' }, { ...spec, writable_root_paths: [cwd] }).allowed, false);
  if (fs.existsSync(path.join(cwd, '.ULTRA'))) {
    assert.equal(decide('write', { path: '.ULTRA/.runtime/marker' }, { ...spec, writable_root_paths: [cwd] }).allowed, false);
  }
  assert.equal(decide('write', { path: 'src/result.txt' }, { ...spec, read_only: true }).allowed, false);
  fs.symlinkSync(root, path.join(writable, 'escape'), 'dir');
  assert.equal(decide('write', { path: 'src/escape/outside.txt' }).allowed, false);
  assert.equal(decide('read', { path: 'src/result.txt' }).allowed, true);
  for (const command of ['ls', 'curl http://127.0.0.1:12345/probe', 'touch outside.txt']) {
    const decision = decide('bash', { command });
    assert.equal(decision.allowed, false);
    assert.equal(decision.kind, 'execute');
  }
  assert.equal(decide('future_tool', {}).allowed, false);
  assert.throws(() => decide('write', { path: 1 }), /path/);
  assert.throws(() => decide('write', { path: 'src/a\0b' }), /path/);
});
