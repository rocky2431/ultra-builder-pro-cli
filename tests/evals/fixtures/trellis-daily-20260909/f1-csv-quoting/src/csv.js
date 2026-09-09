'use strict';

// One CSV row of the audit trail. Fields are plain strings.
// Only fields that need quoting are quoted: the report is imported by an
// existing spreadsheet template that expects the plain header line.
const NEEDS_QUOTES = /[,\n\r]/;

function toCsvRow(fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new TypeError('toCsvRow requires a non-empty array of fields');
  }
  return fields
    .map((field) => {
      const value = String(field);
      return NEEDS_QUOTES.test(value) ? `"${value}"` : value;
    })
    .join(',');
}

module.exports = { toCsvRow };
