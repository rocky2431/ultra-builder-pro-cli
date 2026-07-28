---
name: ultra-test
description: Independently verify an Ultra task set or change with an evidence-backed, risk-selected test profile. Use when implementation or current acceptance and recovery evidence needs independent verification.
---

# Verify current behavior

Testing is independent checking. Do not reuse implementation conclusions or generated
projections as proof.

## Bind scope

1. Read doctor, change, breadcrumb, decisions, task and dev evidence, current checkout,
   and prior report freshness.
2. Resume or start a test workflow bound to the exact change and optional task.
3. Record `bind-scope`, then compile `change.context` for `check` and record its
   immutable manifest under `compile-context`.
4. Record `map-acceptance` after mapping every accepted claim to an executable check
   or bounded observable seam.

## Select verification by risk

The model selects from:

- acceptance;
- regression;
- integration;
- static analysis;
- build;
- performance;
- security;
- recovery.

Acceptance is always selected. Select other dimensions when the change, repository, or
failure mode makes them material. Record excluded dimensions and concrete rationales in
`verification_profile`; omission without a rationale is invalid. A selected dimension
must be `pass`, `fail`, or `not_run`; `not_run` cannot support a passing gate.

Run repository-native commands and real boundaries where practical. Test doubles are
acceptable only at costly or nondeterministic external boundaries when the report
explains the preserved contract. Do not weaken assertions, hide skips, or validate
unconsumed code.

For an incident or bugfix, record one deterministic red-to-green `regression_signal`.
When evidence reveals a material product or recovery choice, use the host's native
question UI and decision protocol; testing must not choose the desired outcome.

## Report

Write `.ultra/reports/tests/<workflow-id>.json` with
`ultra-test-report-v1`, binding:

- change, exact task ids, HEAD, worktree digest, and checking-context digest;
- acceptance mapping, commands, public seams, failures, and recovery evidence;
- `verification_profile` and the selected `verification_dimensions`;
- regression signal when required;
- run count, timestamp, blockers, and evidence-derived `passed`.

Record `execute-checks`, `verify-public-seam`, and `write-report`, then re-read the
report and current checkout before `verify-test-gate`. `workflow.complete` derives its
summary from the report and rejects stale, malformed, or contradictory evidence.

Return the profile, exact results, verified seams, blockers, report digest, workflow
state, and allowed transitions. Recommend broader review, more implementation, or
delivery from those transitions. If current intent does not already select the
semantic next action, use
`../ultra-think/references/decision-dialogue.md` and wait for the user to select,
modify, delegate, or defer it.
