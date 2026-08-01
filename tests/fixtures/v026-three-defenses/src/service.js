'use strict';

const { saveOrder } = require('./store.js');

function checkout(customerId) {
  return saveOrder({ customerId });
}

module.exports = { checkout };
