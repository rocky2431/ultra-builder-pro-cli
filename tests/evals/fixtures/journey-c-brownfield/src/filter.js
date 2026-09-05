'use strict';

// Month filtering for the recipe log. `monthKey` is a `YYYY-MM` string and
// `item.date` is an ISO-8601 UTC timestamp.
function filterByMonth(items, monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) {
    throw new TypeError(`monthKey must look like YYYY-MM, received: ${monthKey}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = Date.UTC(year, month - 1, 1);
  const end = Date.UTC(year, month, 1); // First instant of the next month.
  return items.filter((item) => {
    const time = Date.parse(item.date);
    return time >= start && time <= end;
  });
}

module.exports = { filterByMonth };
