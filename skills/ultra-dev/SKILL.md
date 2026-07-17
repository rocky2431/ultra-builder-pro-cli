---
name: ultra-dev
description: "Execute one fresh-context vertical slice through a public seam with strict red-green evidence, bounded recovery, and specification learning."
user-invocable: true
runtime: all
mcp_tools_required:
  - task.update
  - task.get
  - task.list
  - change.get
  - change.context
  - change.breadcrumb
  - change.learning_propose
---

# ultra-dev — One Slice, One Feedback Loop

Drive one task from `pending` to `completed`. Task status lives in
`.ultra/state.db`; generated task JSON and context frontmatter are read-only.

## Authority and recovery

If `task.list`, `task.get`, or `task.update` fails, stop. Never write raw SQLite,
`.ultra/tasks/tasks.json`, or projected status fields. On
`LEGACY_STATE_MIGRATION_REQUIRED`, use the documented migration command before work.

At entry, read `change.breadcrumb` when a change is active. A blocked or stale
breadcrumb is an implementation blocker, not an advisory warning.

`.ultra/workflow-state.json` is a compact recovery checkpoint only. Record command,
task, branch, current step, status, and timestamp; do not copy prompts, codebase
summaries, or provider memory into it.

## 1. Select and compile the slice

1. Select the requested task, otherwise the first dependency-ready pending task.
2. Call `task.get`; verify dependencies, ownership, acceptance, public seam, and exact
   verification command.
3. If linked to a change, call `change.get`, then compile `change.context` with:
   `role=implement`, `gate=implementation`, the smallest required references, and the
   task's execution contract.
4. Stop on missing/stale references, budget overflow, unknown documentation impact,
   or a HEAD mismatch. Do not compensate by loading the whole repository.
5. Mark the task `in_progress` with `task.update` and checkpoint the step.

The default slice is a `tracer_bullet`. An `expand_contract` must already be approved;
implementation does not widen its own contract silently.

## 2. Establish red

Before production logic changes:

1. Reproduce the smallest observable symptom at the declared public seam.
2. Add or identify the regression/contract test.
3. Run the exact command and record:
   - command;
   - expected failure;
   - observed red result;
   - deterministic/non-deterministic classification;
   - duration when useful.

For a new feature, red means an assertion expressing missing behavior. For a refactor,
establish a green characterization baseline first. Documentation/config-only tasks may
use a structural validator instead of a failing test, but must state why.

If red cannot be observed, stop and correct the task contract; do not implement against
an unproven hypothesis.

## 3. Implement the minimum complete path

- Trace entry point → domain rule → side effect → public seam.
- Search for existing utilities and dependencies before adding helpers.
- Keep IO at boundaries and domain behavior testable.
- Include required validation, errors, observability, recovery, and documentation.
- Preserve unrelated dirty worktree changes and stay within allowed paths.
- Verify each meaningful increment through the same feedback loop.

If implementation reveals a stable invariant or public behavior absent from the
baseline, call `change.learning_propose` with its evidence and target document. Do not
edit the baseline silently and do not store the discovery as Ultra memory.

## 4. Establish green and inspect reachability

Run, in order:

1. the exact red command until the observed failure becomes green;
2. adjacent focused tests;
3. type check/lint/build proportionate to the change;
4. the live public-seam acceptance path;
5. final diff and worktree scope inspection.

Record exact commands and zero-failure results. “Compiled” or “unit tests pass” is not
enough when the new module is not connected to a consumer.

## 5. Review gate

Checkpoint `status=pre_review`, then invoke `/ultra-review all`. The review must produce
independent `spec_fidelity` and `engineering_standards` verdicts. Fix all P0/P1 issues,
rerun affected tests, and recheck until both axes pass. The primary host owns final
verification; review workers never mutate durable Ultra state.

## 6. Complete the task

First call `task.update` with `status=completed` and completion commit/evidence
supported by the task contract. Then, for a linked change, recompile
`change.context` at the final HEAD with:

- `role=implement`, `gate=verification`;
- exact required references and current digests;
- the public seam and verification command;
- a single next action, normally `Run ultra-test for this change`.

This ordering ensures the snapshot records the completed task state. Clear the active
workflow checkpoint, call `change.breadcrumb`, and report exactly one next action.

## Completion evidence

Report task/change id, changed paths, red signal, green commands, public-seam result,
review session, spec-learning candidates, and remaining blockers. If any item is
missing, leave the task in progress or blocked rather than claiming completion.
