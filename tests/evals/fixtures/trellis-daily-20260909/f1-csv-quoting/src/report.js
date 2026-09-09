'use strict';

const { toCsvRow } = require('./csv');

const HEADER = ['id', 'actor', 'note'];

// Render the whole audit trail. This sibling consumer shares the row
// serializer with the single-row export path on purpose: both must produce
// identical quoting, and the header line must stay importable as-is.
function renderReport(entries) {
  return [
    toCsvRow(HEADER),
    ...entries.map((entry) => toCsvRow([entry.id, entry.actor, entry.note])),
  ].join('\n');
}

module.exports = { renderReport, HEADER };
