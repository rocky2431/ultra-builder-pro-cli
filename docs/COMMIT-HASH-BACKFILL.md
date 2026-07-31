# Commit-hash backfill

`tasks.completion_commit` is checkout-local integration evidence. It lives in
`.ultra/.runtime/state.db` and may appear in checkout-local projections, but it is
deliberately absent from the Git-facing team ledger.

This removes the old self-referential two-commit loop. Recording a commit hash no
longer changes any tracked file.

## Direct task completion

After implementation, verification, and review are current:

1. Record `task_outcome / complete { id, packet_digest }`. Completion validates the
   assigned Worker Packet and durable output, and accepts neither an arbitrary `patch`
   nor any commit hash.
2. Publish the completed durable status and Task contract with `ultra.sync`.
3. Create one local integration commit containing the implementation, semantic Ultra
   artifacts, and `.ultra/tasks/tasks.json`.
4. Read the resulting full `HEAD` and record
   `task_outcome / attest_commit { id, completion_commit }`.
5. Verify the task worktree head, integration ancestry, review evidence, and public
   seam; then release the session.

Attestation requires an already completed Task and a real commit integrated into the
current checkout. It changes only ignored runtime state, does not republish team
authority, and is idempotent for the same hash. Git remains clean, so no bookkeeping
commit is permitted.

If sync or the integration commit fails after completion, record
`task_outcome / block { id }`, preserve the still-session-owned worktree, and record the
failure. This recovery transition is accepted only while `completion_commit` is absent.
An attested Task cannot use this block recovery; an explicit later reopen records the
prior attestation in event history before clearing the current local proof.

## Parent-supervised workers

A worker records evidence and exits without finalizing the parent-owned Task. The
primary host validates and stages the worker result, records durable completion,
publishes the team checkpoint, creates the single authoritative integration commit,
attests that integrated hash locally, and settles the lease.

## Why the hash is local

- A Git file cannot contain the hash of the commit that contains that same file.
- Runtime integration evidence is checkout-specific and does not belong in a shared
  semantic merge surface.
- The team ledger needs the durable task outcome and status, not a self-referential
  commit identifier.
- Baseline freshness uses scoped content plus Git ancestry, so a metadata-only Ultra
  checkpoint commit does not invalidate an otherwise unchanged baseline.
