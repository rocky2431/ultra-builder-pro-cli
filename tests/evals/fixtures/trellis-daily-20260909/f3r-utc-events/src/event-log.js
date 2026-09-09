'use strict';

// Every stored timestamp in this project is UTC ISO-8601 with a `Z` suffix.
// See docs/decisions/2026-08-30-utc-storage.md.
const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

function assertUtcIso(timestamp) {
  if (typeof timestamp !== 'string' || !UTC_ISO.test(timestamp)) {
    throw new TypeError(
      `timestamp must be UTC ISO-8601 ending in Z, received: ${timestamp}`,
    );
  }
  return timestamp;
}

function recordEvent(log, name, occurredAtUtc) {
  assertUtcIso(occurredAtUtc);
  return [...log, { name, occurredAtUtc }];
}

// Display boundary: the only place where a stored instant becomes local time.
function formatForDisplay(occurredAtUtc, timeZone) {
  assertUtcIso(occurredAtUtc);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(occurredAtUtc));
  const pick = (type) => parts.find((part) => part.type === type).value;
  return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}`;
}

module.exports = { assertUtcIso, recordEvent, formatForDisplay };
