'use strict';

const REQUIRE_SECOND_CONFIRMATION = true;

function prepareCheckout(cart) {
  return {
    total: cart.total,
    confirmationRequired: REQUIRE_SECOND_CONFIRMATION,
  };
}

function placeOrder(cart, charge) {
  const checkout = prepareCheckout(cart);
  let chargeId;
  try {
    chargeId = charge(checkout.total);
  } catch (error) {
    if (error.message !== 'timeout-after-charge') throw error;
    chargeId = charge(checkout.total);
  }
  return { chargeId, confirmationRequired: checkout.confirmationRequired };
}

module.exports = { placeOrder, prepareCheckout, REQUIRE_SECOND_CONFIRMATION };
