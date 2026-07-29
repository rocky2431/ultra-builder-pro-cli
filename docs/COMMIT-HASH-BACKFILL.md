# Commit-hash backfill

`tasks.completion_commit` is checkout-local integration evidence. It lives in
`.ultra/.runtime/state.db` and may appear in checkout-local projections, but it is
deliberately absent from the Git-facing team ledger.

This removes the old self-referential two-commit loop. Recording a commit hash no
longer changes any tracked file.

## Direct task completion

After implementation, verification, and review are current:

1. Update the task to `completed`. The MCP publishes its durable status and contract to
   `.ultra/tasks/tasks.json`.
2. Create one local task commit containing the implementation, semantic Ultra
   artifacts, and the team ledger checkpoint.
3. Read the resulting `HEAD` and update only `completion_commit` through `task.update`.
4. Verify the task worktree `HEAD`, integration ancestry, review evidence, and public
   seam; then close the session and complete the dev workflow.

The third step changes only ignored runtime state. Repeating it with the same hash is
byte-idempotent and leaves Git clean.

If the commit fails after step 1, transition the still-session-owned task from
`completed` to `blocked`, preserve the worktree, and record the failure. This recovery
transition is accepted only while `completion_commit` is absent. A task with a recorded
completion commit remains terminal.

## Parent-supervised workers

A worker records evidence and exits without finalizing the parent-owned task. The
primary host verifies and integrates the worker commit, publishes the task completion
checkpoint, records the integrated commit hash locally, and settles the lease.

## Why the hash is local

- A Git file cannot contain the hash of the commit that contains that same file.
- Runtime integration evidence is checkout-specific and does not belong in a shared
  semantic merge surface.
- The team ledger needs the durable task outcome and status, not a self-referential
  commit identifier.
- Baseline freshness uses scoped content plus Git ancestry, so a metadata-only Ultra
  checkpoint commit does not invalidate an otherwise unchanged baseline.
