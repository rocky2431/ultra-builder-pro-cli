'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { addAmounts, formatAmount } = require('../src/money');

// Frozen regression coverage for the existing behavior. This file is the
// green baseline: it must keep passing unmodified after any follow-up change.
test('amounts add up in minor units', () => {
  assert.equal(addAmounts([1234, 66]), 1300);
  assert.equal(addAmounts([]), 0);
});

test('formatting happens only at the display boundary', () => {
  assert.equal(formatAmount(1234), '12.34');
  assert.equal(formatAmount(5), '0.05');
  assert.equal(formatAmount(-1234), '-12.34');
});

test('a non-integer amount is rejected instead of silently rounded', () => {
  assert.throws(() => addAmounts([12.34]), TypeError);
  assert.throws(() => formatAmount('12.34'), TypeError);
});
