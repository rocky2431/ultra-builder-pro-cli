'use strict';

const { checkoutEnabled } = require('./flags.js');
const { checkout } = require('./service.js');

function handleCheckout(request) {
  if (!checkoutEnabled) return { status: 404 };
  const order = checkout(request.customerId);
  return { status: 201, body: { orderId: order.id } };
}

module.exports = { handleCheckout };
