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
   context refs, documentation impact, recovery, owner, and dependencies.

Large sources stay lazy. Use digest freshness for accepted inputs that must remain
byte-current, existence for expected implementation targets, and advisory only when
drift must be visible without blocking.

Read `../ultra-think/references/decision-dialogue.md` before asking a material
question.

## Record and checkpoint

Use one `ultra.record` batch for all `task.create` and necessary `task.update`
operations. Read back the draft with `ultra.context`.
Never read or write `.ultra/tasks/tasks.json`; use `ultra.sync` for the Git team
checkpoint, and never edit the local runtime projection directly.

Call exactly one `ultra.checkpoint`:

```text
stage: plan
scope: { change_id }
payload: planning posture, optional approval already obtained, context budget/refs
idempotency_key: stable semantic Plan checkpoint id
```

The checkpoint compiles or reuses the content-addressed Context Manifest, validates
task coverage and dependencies, exports `plan.json` and `plan.md` once, completes the
durable Plan, and publishes the team checkpoint. Do not export again after validation.

If rejected, the same Plan draft stays mutable. Fix task contracts or evidence and
retry. To discard it, record `workflow.abandon`; never edit SQLite or open a parallel
run to escape a blocker.

Return topology, executable slices, public seams, exact checks, checkpoint result, and
the model's recommended execution order. Do not invoke `ultra-dev` automatically.
