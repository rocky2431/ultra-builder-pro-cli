'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prepareCheckout, REQUIRE_SECOND_CONFIRMATION } = require('../src/checkout.js');

test('checkout requires the accepted confirmation', () => {
  assert.equal(REQUIRE_SECOND_CONFIRMATION, true);
  assert.equal(prepareCheckout({ total: 42 }).confirmationRequired, true);
});
