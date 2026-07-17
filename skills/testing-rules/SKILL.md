---
name: testing-rules
description: Review whether changed behavior has meaningful, trustworthy, and proportionate test evidence across its real boundaries. Use only when assigned to a test review or delivery verification scope.
---

# Review test evidence

Evaluate what the tests prove about the accepted behavior. Line coverage and the mere
presence of a test file are supporting signals, not the contract.

## Procedure

1. Map each changed behavior and acceptance claim to a test or other executable check.
2. Confirm the test can fail for the intended defect and observes a public or stable
   contract rather than implementation trivia.
3. Inspect happy, error, boundary, state-transition, and concurrency cases according to
   the risk introduced by the diff.
4. Verify integration seams with the most realistic practical boundary. Prefer real
   persistence and protocol behavior when their semantics matter.
5. Accept test doubles at costly, unavailable, or nondeterministic external boundaries
   when the double preserves the documented contract and the reason is clear.
6. Flag mocks or fakes only when they bypass the behavior under review, encode a false
   contract, or make a passing test unrelated to production behavior.
7. Detect skipped checks, tautological assertions, swallowed failures, non-determinism,
   weakened expectations, and tests that never reach the changed code.

## Finding contract

Name the unproven behavior, why current evidence is insufficient, the failure that can
escape, and the smallest test or boundary check that closes the gap. Calibrate severity
to product risk and reachability; do not impose a universal coverage percentage or a
single test technology on every repository.
