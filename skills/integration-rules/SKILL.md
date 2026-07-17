---
name: integration-rules
description: Verify that changed components are reachable, contract-compatible, and tested across the boundaries required by the accepted behavior. Use only when an assigned review or implementation slice crosses modules, services, persistence, protocols, or UI seams.
---

# Verify integration and reachability

Prove that new behavior is connected to a real consumer and that data and failures
cross each boundary according to one contract.

## Procedure

1. Start at the declared public seam or entry point and trace the changed path through
   domain behavior, state, side effects, and the final consumer.
2. At each boundary, identify the producer, consumer, data shape, ownership, error
   semantics, compatibility expectation, and recovery behavior.
3. Confirm both sides use the same contract or a deliberate adapter. Inspect runtime
   configuration and registration, not only exported types.
4. Verify the implementation is reachable in the production path. A module, handler,
   schema, or component with no caller or registration is incomplete.
5. Check that tests cross the boundary whose semantics matter and would fail on a
   producer-consumer mismatch.
6. For a larger feature, confirm an executable vertical slice exists before broad
   expansion. The slice may be narrow, but it must use real wiring and observable data.
7. Inspect partial failure, retry, idempotency, ordering, rollback, and observability
   when the boundary can leave inconsistent state.

## Finding contract

Report the broken path, mismatched contract, missing consumer, or unverified failure
mode with exact source evidence and observable impact. Do not flag a horizontal task
solely by its name when another completed slice already proves the integration.
