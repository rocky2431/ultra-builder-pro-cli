'use strict';

const { filterByMonth } = require('./filter');

// Export one month of entries as a Markdown table. Shares the month-filter
// logic with the terminal search path on purpose: both consumers must agree.
function exportMarkdown(items, monthKey) {
  const rows = filterByMonth(items, monthKey);
  return [
    '| name | date |',
    '|---|---|',
    ...rows.map((item) => `| ${item.name} | ${item.date} |`),
  ].join('\n');
}

module.exports = { exportMarkdown };
