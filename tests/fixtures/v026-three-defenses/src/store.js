'use strict';

const orders = new Map();

function saveOrder(order) {
  const id = `order-${orders.size + 1}`;
  orders.set(id, { ...order, id });
  return orders.get(id);
}

module.exports = { saveOrder };
