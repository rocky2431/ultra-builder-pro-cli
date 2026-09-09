'use strict';

// Every monetary amount in this project is an integer number of minor units
// (cents). See docs/decisions/2026-08-24-integer-minor-units.md.
function assertMinorUnits(amount) {
  if (!Number.isInteger(amount)) {
    throw new TypeError(
      `amount must be an integer number of minor units, received: ${amount}`,
    );
  }
  return amount;
}

function addAmounts(amounts) {
  return amounts.reduce((total, amount) => total + assertMinorUnits(amount), 0);
}

// Display boundary: the only place where an amount becomes a decimal string.
function formatAmount(amount) {
  assertMinorUnits(amount);
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

module.exports = { addAmounts, formatAmount, assertMinorUnits };
