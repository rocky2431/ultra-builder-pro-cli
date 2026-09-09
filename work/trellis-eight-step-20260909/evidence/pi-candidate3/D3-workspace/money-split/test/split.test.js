'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { splitAmount, formatAmount } = require('../src/money');

test('an evenly divisible amount splits into equal shares', () => {
  assert.deepEqual(splitAmount(1200, 4), [300, 300, 300, 300]);
  assert.deepEqual(splitAmount(1000, 1), [1000]);
  assert.deepEqual(splitAmount(0, 3), [0, 0, 0]);
});

test('the remainder is handed out, never dropped', () => {
  assert.deepEqual(splitAmount(1000, 3), [334, 333, 333]);
  assert.deepEqual(splitAmount(1, 3), [1, 0, 0]);
  assert.deepEqual(splitAmount(1234, 5), [247, 247, 247, 247, 246]);
});

test('shares always add back up to the original amount', () => {
  for (const total of [0, 1, 5, 99, 100, 1234, 100003, -1, -1234, -100003]) {
    for (let people = 1; people <= 7; people += 1) {
      const shares = splitAmount(total, people);
      assert.equal(shares.length, people);
      assert.equal(
        shares.reduce((sum, share) => sum + share, 0),
        total,
        `${total} split ${people} ways must be conserved`,
      );
    }
  }
});

test('a negative amount splits without gaining or losing a minor unit', () => {
  assert.deepEqual(splitAmount(-1000, 3), [-334, -333, -333]);
});

test('shares differ by at most one minor unit', () => {
  const shares = splitAmount(100003, 7);
  assert.equal(Math.max(...shares) - Math.min(...shares), 1);
});

test('a non-integer amount or a bad head count is rejected', () => {
  assert.throws(() => splitAmount(12.34, 2), TypeError);
  assert.throws(() => splitAmount('1234', 2), TypeError);
  assert.throws(
    () => splitAmount(1200, 0),
    /人数必须是大于 0 的整数.*当前输入：0/,
  );
  assert.throws(() => splitAmount(1200, -2), RangeError);
  assert.throws(() => splitAmount(1200, 2.5), RangeError);
});

test('a split share is displayed through the shared display boundary', () => {
  assert.deepEqual(splitAmount(1000, 3).map(formatAmount), [
    '3.34',
    '3.33',
    '3.33',
  ]);
});
