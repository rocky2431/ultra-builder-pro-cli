'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { noteFilenames } = require('../src/filenames');

// Frozen acceptance: the sibling consumer must never store two different
// notes under one filename.
test('different titles never share a note filename', () => {
  const names = noteFilenames(['季度复盘', '周会记录', 'Weekly Review 2026']);
  assert.equal(new Set(names).size, names.length);
  for (const name of names) {
    assert.notEqual(name, '.md');
  }
});
