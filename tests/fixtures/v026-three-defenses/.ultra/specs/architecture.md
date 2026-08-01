# Architecture

## Checkout path

The accepted path is HTTP entry point → checkout service → order store.

## Observed

- The three modules exist.

## Decisions

- The integration seam is `handleCheckout(request)`.

## Unknowns

- None.
