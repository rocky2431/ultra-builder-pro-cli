'use strict';

// Phase 4 backlog P3 #13 / D45 — configDir validator.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { validateConfigDir } = require('../validate.cjs');

test('validateConfigDir: null/undefined → ok with configDir=null', () => {
  assert.deepEqual(validateConfigDir(null), { ok: true, configDir: null });
  assert.deepEqual(validateConfigDir(undefined), { ok: true, configDir: null });
});

test('validateConfigDir: normal path → ok', () => {
  const out = validateConfigDir('/tmp/work');
  assert.equal(out.ok, true);
  assert.equal(out.configDir, '/tmp/work');
});

test('validateConfigDir: rejects NUL byte', () => {
  const out = validateConfigDir('/tmp/foo\u0000bar');
  assert.equal(out.ok, false);
  assert.match(out.error, /NUL bytes/);
});

test('validateConfigDir: rejects non-string', () => {
  assert.equal(validateConfigDir(42).ok, false);
  assert.equal(validateConfigDir({}).ok, false);
});
