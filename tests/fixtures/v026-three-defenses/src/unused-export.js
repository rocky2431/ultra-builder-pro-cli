'use strict';

function formatCheckoutDebug(order) {
  return `[checkout:${order.id}]`;
}

module.exports = { formatCheckoutDebug };
