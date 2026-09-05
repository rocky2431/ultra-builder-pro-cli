'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { filterByMonth } = require('../src/filter');

// Frozen acceptance: "this month" never includes the first instant of the
// next month. This assertion must not change; only src/ may be repaired.
test('month filter excludes the first day of the next month', () => {
  const items = [
    { name: 'mid-august', date: '2026-08-15T10:00:00.000Z' },
    { name: 'next-month-first-day', date: '2026-09-01T00:00:00.000Z' },
  ];
  const filtered = filterByMonth(items, '2026-08');
  assert.deepEqual(
    filtered.map((item) => item.name),
    ['mid-august'],
  );
});

test('month filter keeps the first day of the selected month', () => {
  const items = [
    { name: 'first-day', date: '2026-08-01T00:00:00.000Z' },
    { name: 'last-instant', date: '2026-08-31T23:59:59.999Z' },
  ];
  const filtered = filterByMonth(items, '2026-08');
  assert.deepEqual(
    filtered.map((item) => item.name),
    ['first-day', 'last-instant'],
  );
});

test('month filter rejects a malformed month key', () => {
  assert.throws(() => filterByMonth([], '2026-8'), TypeError);
});
