---
name: ultra-dev
description: Implement one authoritative Ultra task through a fresh-context, test-driven, review-backed live path. Use when a planned task is executable, interrupted, or ready for focused recovery.
---

# Implement one task

The host model owns code reasoning and edits. Ultra owns the task and workflow state,
fresh context contract, session lease, evidence references, and recovery.

## Bind and resume

1. Read doctor, `task.ledger_get`, breadcrumb `accepted_intent`, active decisions, task
   contract, dependencies, dev runs, sessions, HEAD, and worktree. Import a newer
   descendant team checkpoint before taking a lease. Stop on a typed baseline, Change,
   task, ancestry, or active-session conflict; do not merge authority by editing JSON.
2. Resume the matching dev run or start one with `change_id` and `task_id`.
3. Record `bind-task` with current authority and dependency evidence.
4. Compile `change.context` with `role: implement` and `gate: implementation`. The
   public seam, verification command, and context refs come from the DB-backed task
   contract; update that contract before compilation instead of overriding it in the
   call. Persist any changed external-provider metadata with `change.update` first.
   Context compilation itself is read-only with respect to Change and provider
   authority.
5. Confirm the manifest contains the selected task, its direct dependencies, direct
   dependents needed for integration, and relevant integration checkpoints—not the
   entire task graph. Referenced file bodies stay lazy. The token estimate includes
   inline Change/task authority as well as file estimates; budget overflow is
   advisory, while a missing or stale required reference is blocking. Record the
   immutable manifest as `compile-context`.
6. Reuse an existing valid session. Otherwise pass admission and call `session.spawn`.
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
6. In direct mode, update the task to `completed` only after verification and review
   are current. This publishes the durable team ledger checkpoint. Create one
   authorized local task commit containing code, semantic artifacts, and that
   checkpoint. Read the resulting `HEAD`, then record it as `completion_commit`;
   that hash remains checkout-local and must not create another Git commit. Do not
   push, publish, tag, or deploy unless the user separately authorized that external
   effect.

The tracked team checkpoint contains durable task status and contract evidence, not
live ownership. `in_progress`, `session_id`, leases, worktrees, telemetry, and
`completion_commit` remain checkout-local. The local generated task view lives under
`.ultra/.runtime/projections/` and is never committed.

Treat the compiled task-context contract as the handoff boundary: purpose, why,
constraints, non-goals, target seams/files, pattern refs, acceptance, documentation
impact, recovery, and definition of drift. If accepted intent, the task contract, or a
digest-bound reference changes, update the owning authority and recompile rather than
continuing from a stale packet.

Keep implementation findings and documentation candidates inside the owning Change
root. When code changes invalidate or extend maintained documentation, update the
Change documentation overlay and its evidence rather than editing accepted baseline
specifications. Hooks may remind the host to reconcile documentation; they must not
block ordinary development or choose the semantic update.

Task-level tests and review belong to this inner loop. They do not replace aggregate
change testing or review when multiple slices, integrations, or broader risks require
those capabilities.

## Complete or recover

In direct mode, integrate the task commit through the repository's accepted path,
verify ancestry and the public seam, close the session, record `record-completion`,
and complete the dev workflow. If commit creation fails after the pre-commit
completion checkpoint, move the still-session-owned task to `blocked`, preserve the
worktree, and record the failure. A completion with a recorded commit remains
terminal.

Change convergence revalidates the exact latest
`change_id + task_id + implement + implementation` snapshot for every executable
task. A newer review, test, or plan packet cannot substitute for it.

In a parent-supervised worker, record completion evidence and exit without closing the
parent-owned lease. The primary host verifies the exact session commit, performs any
integration, refreshes review if the reviewed checkout changed, settles the lease, and
completes the workflow.

Preserve worktrees by default. Remove one only when Git proves it is clean and
integrated. On interruption, record the current step and task as blocked, preserve
worktree and evidence, and resume the same run later.

Return outcome, changed paths, public seam, exact checks, review axes, commit and
session state, residual risk, and allowed transitions.

Never invoke the recommended capability here; wait for an explicit user invocation.
