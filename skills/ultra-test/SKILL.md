---
name: ultra-test
description: Run an independent pre-delivery verification gate and record exact feedback-loop, reachability, recovery, and acceptance evidence. Use when scoped implementation tasks are complete and delivery readiness must be established.
---

# Verify delivery readiness

Run this gate from a fresh checking context. It complements task-level development
tests and writes `.ultra/test-report.json`; it does not replace authoritative task or
change state.

## Entry gate

1. Call `task.list` and require at least one completed task in scope.
2. Call `change.list` and bind exactly one relevant change, or record a null change id
   for an initial baseline.
3. For a change, compile `change.context` for the checking role and verification gate
   with only the specifications, tests, and source seams needed for acceptance.
4. Call `change.breadcrumb`; stop when context is stale or readiness is blocked.

Never use generated task JSON as authority or reuse the implementer's full
conversation as test context.

## Evidence matrix

Map each acceptance claim to observable evidence:

| Check | Evidence | Blocking result |
|---|---|---|
| Feedback loop | exact command and observed result | failure or missing baseline signal for a fix |
| Public seam | reachable entry-to-consumer path | orphan, stub, or unwired behavior |
| Regression | focused and adjacent suites | failure or weakened assertion |
| Static/build | applicable type, lint, and build commands | non-zero result |
| Error/recovery | exercised failure and recovery path | silent or unrecoverable critical path |
| Security | relevant input, authorization, secret, and dependency checks | high-impact exploitable issue |
| Docs/spec | delivered behavior matches the declared baseline or delta | drift or unknown impact |

Use repository-native commands and real boundaries when practical. Use test doubles
only at costly or nondeterministic external boundaries, and state why they preserve
the contract being tested.

Inspect tests for tautologies, empty assertions, hidden skips, excessive boundary
mocking, changed exports without behavioral coverage, and code with no non-test
consumer. Apply checks by risk and scope rather than forcing every category.

## Report contract

Write the report atomically with the current full HEAD, change id, context manifest
hash, exact commands, baseline and final signals, verified public seams, checks, and
blocking issues. Preserve concise failure excerpts instead of full logs.

Set `passed: true` only when every required check passes, the report HEAD is current,
and at least one declared public seam is verified. A not-applicable check needs a
specific scope reason.

## Exit

Call `change.breadcrumb` and return one next action: fix a named blocker, run
`ultra-review`, or run `ultra-deliver`. A stale report never routes to delivery.
