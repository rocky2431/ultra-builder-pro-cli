---
name: ultra-dev
description: Implement one authoritative Ultra task through a fresh-context, test-driven, review-backed live path. Use when a planned task is executable, interrupted, or ready for focused recovery.
---

# Implement one task

The model owns code reasoning and edits. Ultra owns the durable task contract,
canonical Context Envelope, execution lease, immutable Worker Packet, evidence
references, and checkpoint.

## Bind execution

1. Call `ultra.context { stage: dev, scope: { change_id, task_id }, detail: full }`.
2. Import a newer team checkpoint with `ultra.sync`; stop on a real same-record or
   active-session conflict.
3. Reuse a valid lease or call `ultra.session { action: acquire }`. Acquire atomically
   performs admission, compiles or reuses the implementation Context Envelope, mints
   the lease/worktree, and returns the immutable Worker Packet. A separate
   `action: admission` is an optional read-only preview, not a prerequisite.
4. Verify the returned packet digest, purpose, acceptance, dependencies, public seam,
   exact output path/schema, verification command,
   non-goals, recovery, and required context refs. Update the task contract before
   implementation when accepted intent changed.

## Implement adaptively

Reproduce the failure, write a failing test, or establish a characterization signal
before changing logic. Implement the smallest complete vertical slice. Ask the owner
only when new evidence changes product intent, compatibility, security, material cost,
external effects, or recovery.

Use typed `ultra.record` entries for `task_outcome / start|block|complete|attest_commit`,
`event / append`, `artifact / bind`, `decision / accept`, and corrected
`task_contract / revise`. Every worker output must repeat the exact `packet_digest`;
the parent registers it only after packet, output path, schema, and digest validation.
Live ownership, `in_progress`, session ids, leases, worktrees, telemetry, and
completion hashes remain local runtime state; durable task outcome and evidence may
enter the team checkpoint.

Run focused and adjacent risk-justified checks, then a task-scoped independent review.
Fix blocking findings and refresh affected evidence.

## Commit one semantic checkpoint

Call `ultra.checkpoint` once with `stage: dev`, the exact Change/Task scope, evidence,
and stable idempotency key. It binds the exact Context Envelope and Worker Packet and
reports outcome diagnostics. The model decides whether the implemented slice satisfies
the Task; semantic warnings remain visible. A rejection means the declared authority,
path, digest, or concurrency boundary was unsafe and leaves the draft mutable.

After acceptance:

1. Record `task_outcome / complete { id, packet_digest }`; never include a patch or SHA.
2. Publish the durable completed status with `ultra.sync`.
3. Create at most one authorized local task commit containing code, semantic
   artifacts, and the team checkpoint.
4. Record `task_outcome / attest_commit { id, completion_commit }` with that integrated
   commit's full SHA. This is local mechanical proof and must not create another commit.

Release the lease through `ultra.session`. Preserve a dirty or unintegrated worktree
on interruption. Commit, push, tag, publish, deploy, or destructive cleanup require
separate owner authority.

Return changed paths, public seam, exact checks, review result, checkpoint, commit,
session state, and residual risk. Do not invoke the next capability automatically.
