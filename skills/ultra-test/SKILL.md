---
name: ultra-test
description: Verify completed Ultra tasks and one current change through independent acceptance, regression, build, public-seam, failure, and recovery evidence. Use when implementation needs a current test gate before review, convergence, or delivery.
---

# Verify the current change

Testing is independent checking. Do not reuse the implementer's conclusions as proof
or use generated task JSON as authority.

## Bind and execute

1. Read `system.doctor`, `change.breadcrumb`, active decision state, authoritative
   tasks, completed dev runs, current HEAD/diff, and prior test report freshness. An
   open decision or unconfirmed checkpoint blocks testing claims and routes to
   `ultra-think`.
2. Resume or start a `test` workflow linked to the change and optional task. Record
   `bind-scope` with the exact revision, task set, and acceptance ids.
3. Compile `change.context` for `check`; record `compile-context` only when required
   refs and DB-backed execution contracts are ready, with the immutable context
   manifest as the step output.
4. Map each accepted claim to an executable command or a specific bounded manual
   observation. Record `map-acceptance`.
5. Run repository-native focused and regression tests, applicable type/lint/build
   checks, public-seam acceptance, and material error/recovery/security checks. Record
   `execute-checks` and `verify-public-seam` with commands and observed results.

Use real boundaries where practical. A test double is acceptable at a costly or
nondeterministic external boundary only when the report explains why it preserves the
contract. Reject tautologies, hidden skips, weakened assertions, and unconsumed code.
When evidence reveals an unresolved product decision, report the exact consequence and
route it to the decision dialogue; testing must not silently select the desired result.

## Report and converge

Write `.ultra/reports/tests/<workflow-id>.json` atomically using
`ultra-test-report-v1`: bind the full HEAD and worktree digest, change and exact task
ids, the recorded checking-context digest, acceptance
mapping, exact command results, public seams, failures, recovery evidence, run count,
timestamp, and blocking issues. Populate every `verification_dimensions` entry:
acceptance, regression, integration, static analysis, build, performance, security,
and recovery. Use `not_applicable` only with a concrete rationale; `not_run` cannot
support a passing gate. For an incident or any bugfix task, also record one
deterministic `regression_signal` with the exact command, expected red symptom,
observed red and green results, duration when known, and evidence. `passed` is true only when every recorded command and
required public seam passes with no blocking issue at that exact checkout.

Record `write-report` with the report output so MCP stores its digest. Re-read the file,
HEAD, task set, and breadcrumb; record `verify-test-gate`, then call
`workflow.complete`. MCP derives the durable test summary from the report rather than
trusting a Prompt claim. A malformed, mismatched, changed, or stale report blocks
completion.

Return the workflow id, revision, pass/fail result, exact checks, verified seams,
blocking failures, report path/digest, and one route to fix, `ultra-review`, or
`ultra-deliver`. A failed implementation contract returns to `ultra-dev`; a new owner
choice returns to `ultra-think`; a passing current change without current aggregate
review routes to `ultra-review`.
