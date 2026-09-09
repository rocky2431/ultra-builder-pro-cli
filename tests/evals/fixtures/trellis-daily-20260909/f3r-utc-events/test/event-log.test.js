'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { recordEvent, formatForDisplay } = require('../src/event-log');

// Frozen regression coverage for the existing behavior. This file is the
// green baseline: it must keep passing unmodified after any follow-up change.
test('events are stored as UTC instants', () => {
  const log = recordEvent([], 'deploy', '2026-08-24T22:30:00.000Z');
  assert.deepEqual(log, [
    { name: 'deploy', occurredAtUtc: '2026-08-24T22:30:00.000Z' },
  ]);
});

test('a local-time string is rejected at storage time', () => {
  assert.throws(() => recordEvent([], 'deploy', '2026-08-25 06:30:00'), TypeError);
});

test('local time appears only at the display boundary', () => {
  assert.equal(
    formatForDisplay('2026-08-24T22:30:00.000Z', 'Asia/Shanghai'),
    '2026-08-25 06:30',
  );
  assert.equal(
    formatForDisplay('2026-08-24T22:30:00.000Z', 'UTC'),
    '2026-08-24 22:30',
  );
});
