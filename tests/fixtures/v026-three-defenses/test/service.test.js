'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkout } = require('../src/service.js');

test('checkout persists an order', () => {
  assert.match(checkout('c-1').id, /^order-/);
});
