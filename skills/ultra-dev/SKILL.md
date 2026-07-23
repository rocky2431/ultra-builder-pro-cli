---
name: ultra-dev
description: Implement one authoritative Ultra task through a fresh-context, test-driven, review-backed live path. Use when a planned task is executable, interrupted, or ready for focused recovery.
---

# Implement one task

The host model owns code reasoning and edits. Ultra owns the task and workflow state,
fresh context contract, session lease, evidence references, and recovery.

## Bind and resume

1. Read doctor, breadcrumb, active decisions, task contract, dependencies, dev runs,
   sessions, HEAD, and worktree.
2. Resume the matching dev run or start one with `change_id` and `task_id`.
3. Record `bind-task` with current authority and dependency evidence.
4. Compile `change.context` for `implement` using DB-backed public seam, verification
   command, and refs. Context budgets are advisory; missing required evidence is
   blocking. Record the immutable manifest as `compile-context`.
5. Reuse an existing valid session. Otherwise pass admission and call `session.spawn`.
   Work only in the returned worktree and preserve unrelated changes.

Do not spawn recursively from a parent-owned worker session. Process exit is transport
evidence, never task completion.

## Focused inner loop

1. Reproduce the bug, write a failing test, or establish a characterization signal
   before a logic change. Record `establish-feedback-loop`.
2. Mark the task `in_progress` and implement the smallest complete slice through the
   declared public seam.
3. Keep the loop adaptive. The model may choose implementation details inside the
   accepted contract. If new evidence changes product intent, compatibility, security,
   material cost, external effects, or recovery, use the host's native question UI and
   the decision protocol; do not ask about ordinary reversible details.
4. Record `implement-slice`, then run focused tests plus the adjacent checks justified
   by the task risk. Record exact results under `verify-slice`.
5. Run a task-scoped independent review on specification fidelity and relevant
   engineering risks. Record `review-slice`. Fix blocking findings and refresh affected
   evidence.
6. Create the authorized local task commit. Do not push, publish, tag, or deploy unless
   the user separately authorized that external effect.

Task-level tests and review belong to this inner loop. They do not replace aggregate
change testing or review when multiple slices, integrations, or broader risks require
those capabilities.

## Complete or recover

In direct mode, integrate the task commit through the repository's accepted path,
verify ancestry and the public seam, close the session, update the task to `completed`,
record `record-completion`, and complete the dev workflow.

In a parent-supervised worker, record completion evidence and exit without closing the
parent-owned lease. The primary host verifies the exact session commit, performs any
integration, refreshes review if the reviewed checkout changed, settles the lease, and
completes the workflow.

Preserve worktrees by default. Remove one only when Git proves it is clean and
integrated. On interruption, record the current step and task as blocked, preserve
worktree and evidence, and resume the same run later.

Return outcome, changed paths, public seam, exact checks, review axes, commit and
session state, residual risk, and allowed transitions.
