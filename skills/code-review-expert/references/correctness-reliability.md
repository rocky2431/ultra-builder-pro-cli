# Correctness and reliability evidence

Read this reference only when the diff changes behavior, state transitions, resource
use, concurrency, caching, parsing, or failure handling.

## Establish the contract

Identify the input domain, preconditions, observable result, authoritative state, and
caller-visible failure behavior. Repository code, tests, schemas, runtime configuration,
and accepted specifications outrank generic conventions.

## Trace material risks

Inspect only risks supported by the changed path:

- boundary values, empty or optional inputs, numeric range, encoding, and ordering;
- partial writes, lost updates, duplicate execution, retry, idempotency, and rollback;
- stale caches, key scope, invalidation, and cross-user or cross-tenant isolation;
- unbounded work, repeated I/O, resource lifetime, timeout, and cancellation;
- swallowed failures, false success, ambiguous fallback, and missing recovery signals;
- deployment-time compatibility between readers, writers, clients, and stored data.

A surface pattern is not a finding. Confirm the triggering condition, follow it to an
observable impact, and check whether a guard or recovery path exists elsewhere.

## Report

State the violated contract, trigger, impact, current source evidence, and smallest
complete remediation. If scale or concurrency is required to trigger the issue, name
the evidence-backed operating condition instead of inventing a multiplier.
