'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { toCsvRow } = require('../src/csv');

// Frozen acceptance: a field containing a double quote must be quoted and its
// inner quotes doubled. This assertion must not change; only src/ may be
// repaired.
test('a field containing a double quote is quoted and its quotes are doubled', () => {
  assert.equal(
    toCsvRow(['7', 'lin', 'said "ok" then left']),
    '7,lin,"said ""ok"" then left"',
  );
});

test('a field containing a comma or a newline stays quoted', () => {
  assert.equal(toCsvRow(['7', 'lin', 'paid, then left']), '7,lin,"paid, then left"');
  assert.equal(toCsvRow(['7', 'lin', 'line1\nline2']), '7,lin,"line1\nline2"');
});

test('a plain field is not quoted', () => {
  assert.equal(toCsvRow(['7', 'lin', 'closed']), '7,lin,closed');
});

test('an empty field list is rejected', () => {
  assert.throws(() => toCsvRow([]), TypeError);
});
