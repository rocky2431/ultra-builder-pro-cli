---
name: ultra-dev
description: Execute one authoritative Ultra task through a bounded fresh context, a red-green feedback loop, live-path verification, and review. Use when a dependency-ready planned slice is ready for implementation.
---

# Execute one vertical slice

Drive one task from `pending` to `completed` without widening its contract silently.

## Authority and recovery

Task state changes use `task.update`. Never write raw SQLite, generated task JSON, or
projected status fields. If task MCP access fails, stop and route state health to
`ultra-doctor`.

Read `change.breadcrumb` when a change is active. Stale context, blocked readiness,
unknown documentation impact, or a HEAD mismatch blocks implementation.
Baseline-adoption and context-size warnings do not block an active slice. Address
them when practical without dropping required evidence or arbitrarily changing a
threshold. Approved baseline availability is enforced at convergence; revision and
tracked-spec health are reconciled and verified at archive.

## Workflow

1. Select the requested task, otherwise the first dependency-ready pending task.
2. Call `task.get` and verify acceptance, dependencies, ownership, public seam, and
   exact verification command.
3. For a linked change, call `change.get`, then compile `change.context` for the
   implementation role and gate with the smallest required references.
4. Mark the task `in_progress` only after the context is ready.
5. Establish the feedback-loop baseline before changing production logic:
   - reproduce the smallest observable symptom at the declared seam;
   - add or identify the contract or regression test;
   - record the exact command, expected signal, and observed result.

   A feature starts with an assertion for missing behavior. A refactor starts from a
   green characterization baseline. Documentation or configuration work may use a
   structural validator when no logic test applies.
6. Implement the minimum complete path from entry point to public seam. Reuse existing
   utilities, keep IO at boundaries, include required errors and recovery, and preserve
   unrelated worktree changes.
7. If the work reveals a stable requirement or public behavior absent from the
   baseline, call `change.learning_propose`. Do not edit the baseline silently or store
   the discovery as private Ultra memory.
8. Verify in this order:
   - the original feedback-loop command;
   - adjacent focused tests;
   - proportionate static checks and build;
   - the live public-seam acceptance path;
   - final diff and worktree scope.
9. Run `ultra-review` against the current diff. Fix blocking findings, rerun invalidated
   checks, and require independent specification-fidelity and engineering verdicts.
10. Call `task.update` with `status=completed` and exact evidence. For a linked change,
    recompile the verification context at the final HEAD, then call
    `change.breadcrumb`.

## Completion evidence

Report the task and change ids, changed paths, baseline signal, passing commands,
public-seam result, review session, specification-learning candidates, and one next
action. Leave the task in progress or blocked when required evidence is missing.
