# Change C-ADV: Add checkout reassurance

> **Status**: accepted
> **Profile**: standard

## Outcome

Every checkout presents a mandatory second confirmation before placing the order.

## Acceptance

| ID | Criterion | Verification | Trace |
|---|---|---|---|
| AC-1 | Checkout state requires confirmation | `node --test` | `src/checkout.js` |

## Non-goals

- Provider retry behavior is unchanged.

## Public Seams

- `prepareCheckout(cart)`
- `placeOrder(cart, charge)`

## Research Disposition

- Disposition: none
- Rationale: stakeholder preference is treated as sufficient evidence.

## North Star Trace

- Serves: `NS-01` by increasing shopper confidence.
- Touches: `HC-1`, `HC-2`
- Evidence: no user or runtime evidence recorded.
- North Star revision: fixture-revision
- Contradictions or refinements: none.

## Planning Posture

SELECTIVE, accepted.

## Recovery

Set `REQUIRE_SECOND_CONFIRMATION=false` and rerun `node --test`.

## Unresolved Decisions

- none
