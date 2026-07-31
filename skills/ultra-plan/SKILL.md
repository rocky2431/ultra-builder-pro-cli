---
name: ultra-plan
description: Turn an accepted Ultra Change Contract into dependency-valid, DB-backed vertical task contracts. Use when research obligations are resolved and implementation needs an executable plan.
---

# Build an executable plan

The model owns decomposition and technical design. MCP commits the accepted task graph,
digests, context, and team checkpoint in one semantic operation.

## Bind and design

1. Call `ultra.context { stage: plan, scope: { change_id }, detail: full }`.
2. Inspect or import the team checkpoint with `ultra.sync`. Resolve real concurrent
   record conflicts; do not merge authority by editing JSON.
3. Require an accepted Change contract and its current typed delta. Direct Build skips
   extra research, never Plan or task contracts.
4. Read `references/semantic-preflight.md`; inspect real consumers, source, tests,
   deployment, and recovery.
5. Recommend `EXPAND`, `SELECTIVE`, `HOLD`, or `REDUCE` only when posture changes
   accepted scope. Reuse an explicit posture and ask through the host-native UI only
   for a material unresolved choice.
6. Design a walking skeleton and vertical slices. Each task owns an observable outcome,
   public seam, verification command, acceptance mapping, target seams, bounded
   context refs, documentation impact, recovery, owner, and dependencies. Set the
   published `type`, `priority`, optional bounded `complexity`/`estimated_days`,
   `slice_kind`, and string-array `deps`/`files_modified` deliberately. Prefer the
   shared vocabulary when it communicates the work, but use a bounded
   repository-specific label when it is clearer; SQLite validates structure and does
   not choose business taxonomy.

Large sources stay lazy. Use digest freshness for accepted inputs that must remain
byte-current, existence for expected implementation targets, and advisory only when
drift must be visible without blocking.

Read `../ultra-think/references/interaction-boundary.md` before asking a material
question.

## Record and checkpoint

Use one `ultra.record` batch with `task_contract / define` for new tasks and
`task_contract / revise` for corrected contracts, including a wrong `title` or `type`,
before accepting the Plan checkpoint. Read back the draft with `ultra.context`.
Never write status, session, freshness, runtime tag, generated Context, or
completion-commit fields through a Task Contract; Task outcomes and the runtime own
them.
Never read or write `.ultra/tasks/tasks.json`; use `ultra.sync` for the Git team
checkpoint, and never edit the local runtime projection directly.

Call exactly one `ultra.checkpoint`:

```text
stage: plan
scope: { change_id }
payload: planning posture, optional approval already obtained, context budget/refs
idempotency_key: stable semantic Plan checkpoint id
```

The model decides whether decomposition, acceptance coverage, and context are
sufficient and records any deliberate omission. Missing semantic detail remains a
visible warning and does not deny an otherwise safe Session lease. The checkpoint compiles or reuses the
content-addressed Context Envelope, reports advisory coverage diagnostics, exports
`plan.json` and `plan.md` inside the same recoverable publication, accepts one Plan
revision, and publishes the team checkpoint. Do not export separately.

If rejected, the same Plan draft stays mutable. Fix only the reported structural,
digest, path, or concurrency conflict and retry. To replace an accepted Plan, submit a
new checkpoint revision; never edit SQLite or open a parallel run to escape a
diagnostic.

Return topology, executable slices, public seams, exact checks, checkpoint result, and
the model's recommended execution order. Do not invoke `ultra-dev` automatically.
