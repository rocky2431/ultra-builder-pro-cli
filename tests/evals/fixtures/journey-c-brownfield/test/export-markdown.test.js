'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { exportMarkdown } = require('../src/export');

// Frozen acceptance: the Markdown export uses the same month filter as the
// terminal path, so both consumers must exclude the next month's first day.
test('markdown export agrees with the month filter boundary', () => {
  const items = [
    { name: 'mid-august', date: '2026-08-15T10:00:00.000Z' },
    { name: 'next-month-first-day', date: '2026-09-01T00:00:00.000Z' },
  ];
  const markdown = exportMarkdown(items, '2026-08');
  assert.match(markdown, /\| mid-august \|/);
  assert.doesNotMatch(markdown, /next-month-first-day/);
});
