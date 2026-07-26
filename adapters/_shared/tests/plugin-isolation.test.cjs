'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const PACKAGE = require(path.join(ROOT, 'package.json'));

test('the package has no user-handbook writer or rendered handbook source', () => {
  assert.equal(PACKAGE.bin['ubp-handbook'], undefined);
  assert.equal(fs.existsSync(path.join(ROOT, 'bin', 'handbook.js')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'adapters', '_shared', 'handbook.cjs')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'docs', 'USER-HANDBOOK-CONTRACT.md')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'docs', 'PLUGIN-ISOLATION-CONTRACT.md')), true);
});

test('repository guides keep Ultra policy inside the plugin boundary', () => {
  for (const name of ['AGENTS.md', 'CLAUDE.md']) {
    const text = fs.readFileSync(path.join(ROOT, name), 'utf8');
    assert.match(text, /PLUGIN-ISOLATION-CONTRACT\.md/);
    assert.doesNotMatch(text, /ubp-handbook|_shared\/handbook\.cjs/);
  }
});
