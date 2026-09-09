'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { renderReport } = require('../src/report');
const { toCsvRow } = require('../src/csv');

// Frozen acceptance: the sibling consumer must stay consistent with the
// single-row export path, and the plain header line must survive the repair
// because the existing spreadsheet template imports it as-is.
test('the report header keeps its plain importable form', () => {
  assert.equal(renderReport([]), 'id,actor,note');
});

test('the report escapes quotes exactly like the single-row export', () => {
  const entries = [{ id: '7', actor: 'lin', note: 'said "ok", then left' }];
  const line = renderReport(entries).split('\n')[1];
  assert.equal(line, '7,lin,"said ""ok"", then left"');
  assert.equal(line, toCsvRow(['7', 'lin', 'said "ok", then left']));
});
