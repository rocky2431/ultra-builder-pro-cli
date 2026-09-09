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

// Splits one expense evenly between `people`. The remainder is handed out one
// minor unit at a time to the leading shares, so the shares always add back up
// to `amount` exactly and differ by at most one minor unit.
function splitAmount(amount, people) {
  assertMinorUnits(amount);
  if (!Number.isInteger(people) || people < 1) {
    throw new RangeError(
      `人数必须是大于 0 的整数（当前输入：${people}）`,
    );
  }

  const base = Math.trunc(amount / people);
  const remainder = amount - base * people;
  const step = remainder < 0 ? -1 : 1;

  return Array.from({ length: people }, (_unused, index) =>
    index < Math.abs(remainder) ? base + step : base,
  );
}

// Display boundary: the only place where an amount becomes a decimal string.
function formatAmount(amount) {
  assertMinorUnits(amount);
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// Display boundary: one pasteable line describing a split. Shares are grouped
// by value instead of listed one by one, so the line stays short no matter how
// many people share the bill.
function summarizeSplit(amount, people) {
  const shares = splitAmount(amount, people);

  const headCountByShare = new Map();
  for (const share of shares) {
    headCountByShare.set(share, (headCountByShare.get(share) || 0) + 1);
  }

  const perPerson =
    headCountByShare.size === 1
      ? `每人 ${formatAmount(shares[0])}`
      : [...headCountByShare]
          .map(([share, headCount]) => `${headCount} 人 ${formatAmount(share)}`)
          .join('，');

  return `合计 ${formatAmount(amount)}，${people} 人平摊：${perPerson}`;
}

module.exports = {
  addAmounts,
  splitAmount,
  formatAmount,
  summarizeSplit,
  assertMinorUnits,
};
