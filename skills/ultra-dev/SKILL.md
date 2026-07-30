---
name: ultra-dev
description: Implement one authoritative Ultra task through a fresh-context, test-driven, review-backed live path. Use when a planned task is executable, interrupted, or ready for focused recovery.
---

# Implement one task

The model owns code reasoning and edits. Ultra owns the durable task contract, current
Context Manifest, execution lease, evidence references, and checkpoint.

## Bind execution

1. Call `ultra.context { stage: dev, scope: { change_id, task_id }, detail: full }`.
2. Import a newer team checkpoint with `ultra.sync`; stop on a real same-record or
   active-session conflict.
3. Reuse a valid lease or call `ultra.session { action: admission }`, then
   `ultra.session { action: acquire }`. Work only in the returned worktree.
4. Confirm purpose, acceptance, dependencies, public seam, verification command,
   non-goals, recovery, and required context refs. Update the task contract before
   implementation when accepted intent changed.

## Implement adaptively

Reproduce the failure, write a failing test, or establish a characterization signal
before changing logic. Implement the smallest complete vertical slice. Ask the owner
only when new evidence changes product intent, compatibility, security, material cost,
external effects, or recovery.

Use `ultra.record` batches for task status, bounded events, artifacts, decisions, and
documentation candidates. Live ownership, `in_progress`, session ids, leases,
worktrees, telemetry, and completion hashes remain local runtime state; durable task
outcome and evidence may enter the team checkpoint.

Run focused and adjacent risk-justified checks, then a task-scoped independent review.
Fix blocking findings and refresh affected evidence.

## Commit one semantic checkpoint

Call `ultra.checkpoint` once with `stage: dev`, the exact Change/Task scope, evidence,
and stable idempotency key. It compiles or reuses the implementation Context Manifest
and validates the durable outcome. A rejection leaves the draft mutable.

After acceptance, mark the task durably completed, publish with `ultra.sync`, and
create at most one authorized local task commit containing code and semantic
artifacts. Record its SHA only in local state; never create a bookkeeping commit.

Release the lease through `ultra.session`. Preserve a dirty or unintegrated worktree
on interruption. Commit, push, tag, publish, deploy, or destructive cleanup require
separate owner authority.

Return changed paths, public seam, exact checks, review result, checkpoint, commit,
session state, and residual risk. Do not invoke the next capability automatically.
