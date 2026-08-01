# C-01: Public checkout

## Observable outcome

One HTTP checkout request reaches the service and real order store, then returns the
persisted order identifier while the feature is available by default.

## Acceptance

- `handleCheckout({ customerId: "c-1" })` returns status 201 and a stored order id.

## Public seams

- `src/http.js#handleCheckout`

## Non-goals

- Payment processing.
