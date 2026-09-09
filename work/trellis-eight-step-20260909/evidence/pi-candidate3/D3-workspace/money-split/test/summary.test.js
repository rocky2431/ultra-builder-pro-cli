'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { summarizeSplit, splitAmount, formatAmount } = require('../src/money');

test('an even split collapses to a single per-person figure', () => {
  assert.equal(summarizeSplit(1200, 4), '合计 12.00，4 人平摊：每人 3.00');
  assert.equal(summarizeSplit(1000, 1), '合计 10.00，1 人平摊：每人 10.00');
});

test('an uneven split names how many people pay each share', () => {
  assert.equal(summarizeSplit(1000, 3), '合计 10.00，3 人平摊：1 人 3.34，2 人 3.33');
  assert.equal(summarizeSplit(1234, 5), '合计 12.34，5 人平摊：4 人 2.47，1 人 2.46');
});

test('the summary stays one line however many people share the bill', () => {
  const summary = summarizeSplit(100003, 7);
  assert.doesNotMatch(summary, /\n/);
  assert.equal(summary, '合计 1000.03，7 人平摊：1 人 142.87，6 人 142.86');
});

test('a negative amount is summarized without losing a minor unit', () => {
  assert.equal(summarizeSplit(-1000, 3), '合计 -10.00，3 人平摊：1 人 -3.34，2 人 -3.33');
});

test('every amount in the summary comes from the shared display boundary', () => {
  for (const total of [0, 1, 99, 1234, 100003, -1234]) {
    for (let people = 1; people <= 7; people += 1) {
      const summary = summarizeSplit(total, people);
      assert.ok(
        summary.startsWith(`合计 ${formatAmount(total)}，`),
        `${total} split ${people} ways must report the formatted total`,
      );
      for (const share of new Set(splitAmount(total, people))) {
        assert.ok(
          summary.includes(` ${formatAmount(share)}`),
          `${total} split ${people} ways must report share ${share} formatted`,
        );
      }
    }
  }
});

test('the head counts in the summary add up to the people sharing the bill', () => {
  for (const total of [0, 1, 99, 1234, 100003, -1234]) {
    for (let people = 2; people <= 7; people += 1) {
      const counts = [...summarizeSplit(total, people).matchAll(/(\d+) 人 /g)].map(
        (match) => Number(match[1]),
      );
      if (counts.length > 0) {
        assert.equal(
          counts.reduce((sum, count) => sum + count, 0),
          people,
          `${total} split ${people} ways must account for every person`,
        );
      }
    }
  }
});

test('a non-integer amount or a bad head count is rejected', () => {
  assert.throws(() => summarizeSplit(12.34, 2), TypeError);
  assert.throws(() => summarizeSplit('1234', 2), TypeError);
  assert.throws(() => summarizeSplit(1200, 0), RangeError);
  assert.throws(() => summarizeSplit(1200, 2.5), RangeError);
});
