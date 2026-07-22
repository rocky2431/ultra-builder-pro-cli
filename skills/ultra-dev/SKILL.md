---
name: ultra-dev
description: Execute one authoritative Ultra task through a fresh-context, test-driven, review-backed live-path slice with resumable DB state. Use when a planned task is ready to implement, resume, or recover after a blocker or interrupted session.
---

# Implement one executable task

Bind exactly one task and change. Use the host for code reasoning and edits; use Ultra
MCP for workflow state, context authority, task/session transitions, evidence, and
recovery.

## Start or resume

1. Read `system.doctor`, `change.breadcrumb`, active decision state, `task.get`, workflow
   state, dependencies, active sessions, Git HEAD, and worktree scope. If the
   breadcrumb names an open decision or unconfirmed checkpoint, return to
   `ultra-think` and do not edit code.
2. Resume an existing `dev` workflow or call `workflow.start` with `change_id` and
   `task_id`. Startup fails when the DB-backed task execution contract is incomplete or
   owned by another change.
3. Record `bind-task` with task, dependency, branch, and worktree evidence.
4. Compile `change.context` for `implement`. It derives public seam, verification, and
   required refs from the task row. Record its immutable manifest as the
   `compile-context` output only when ready. That starting snapshot remains historical
   task evidence; later task commits do not invalidate it when its commit stays on the
   current ancestry and the task contract is unchanged.
5. Run session admission before spawning an isolated session. Do not open a second
   active lease without the documented resume, takeover, or abandon decision.

## Red, green, verify

1. Reproduce the behavior or establish a characterization signal before logic edits.
   Record `establish-feedback-loop` with the exact failing command and observed result.
2. Set the task `in_progress`; implement the smallest complete vertical slice through
   the declared public seam. Preserve unrelated worktree changes.
3. Keep application judgment and edits in the host. Do not write projections, raw DB,
   workflow output digests, or evidence state by hand.
4. Refactor only inside the accepted slice while the focused signal stays green.
   When implementation exposes a product, compatibility, security, cost, or recovery
   choice outside the accepted task contract, preserve the evidence, open one decision
   through the shared dialogue protocol, and stop. Do not convert implementation
   convenience into an owner decision.
5. Record `implement-slice`, then run focused, adjacent, static/build, public-seam,
   error, and recovery checks proportional to risk. Record exact evidence under
   `verify-slice`.
6. Run `ultra-review` at the current diff. Record both independent verdict axes under
   `review-slice`; unresolved blocking findings return to implementation.

## Complete or recover

Close the admitted session with `session.close` after its final heartbeat and verify
that no running lease remains for the task. Then update the task to `completed` only
after acceptance, verification, documentation, and review are current. Record
`record-completion` with commands, results, changed paths, commit when authorized, and
context/review references; then call `workflow.complete`. The MCP refuses dev
convergence while the task is incomplete or a session is still running.

On interruption or an external blocker, record the current step as `blocked`, update
the task consistently, and preserve the session and evidence. Resume the same run;
completed steps remain durable. Any code or contract change invalidates affected test,
review, or context evidence.

Return the task outcome, public seam, changed paths, exact checks, review results,
workflow id, session state, residual risks, and one next route. Route another ready
task to `ultra-dev`; route a fully implemented change to aggregate `ultra-test`;
route a new owner choice to `ultra-think`; route broken authority to `ultra-doctor`.
