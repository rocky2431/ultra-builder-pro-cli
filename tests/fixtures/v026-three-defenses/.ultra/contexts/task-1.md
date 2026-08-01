# Task 1: Add order persistence

> **Status**: pending | **Priority**: P0 | **Complexity**: 3

## Acceptance

- The order store returns a generated identifier.

## Confirmed seams

- `src/store.js#saveOrder`

## Implementation

- Modify `src/store.js`.

## Layers touched

- Persistence only.

## Definition of Drift

- The public checkout commitment must remain true.

## Change Log

| Date | Change | Classification |
|---|---|---|
| 2026-08-01 | Initial task | EXPANSION |

## Completion

- Pending.

## Resume Note

- Start by writing a persistence-level test for `saveOrder`.
