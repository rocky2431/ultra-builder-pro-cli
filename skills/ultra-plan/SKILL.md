---
name: ultra-plan
description: Turn an accepted Ultra Change Contract into dependency-valid, DB-backed vertical task contracts. Use when research obligations are resolved and implementation needs an executable plan.
---

# Build an executable plan

The model owns decomposition and technical design. MCP owns plan state, task contracts,
dependency integrity, output digests, and recovery. Planning must stay inside the
accepted Change Contract without adding ceremonial approval.

## Bind current authority

1. Read doctor, baseline, change, decisions, existing plan runs, tasks, and current
   checkout.
2. Require one mutable change with a healthy baseline or recorded incident bypass.
3. Complete the exact change-bound research disposition before planning.
4. Resume the matching plan run. Do not start a new run until planning posture is
   accepted.

Read `references/semantic-preflight.md` and inspect requirements, real consumers,
state, tests, deployment, and recovery paths.

## Align planning posture

Use the interaction protocol in `../ultra-think/references/decision-dialogue.md`.
Normalize a posture already explicit in current intent. Otherwise recommend one based
on the Change Contract, explain its scope effect, and use the host's native question
surface:

- `EXPAND`: surface evidence-backed opportunities beyond accepted scope;
- `SELECTIVE`: hold accepted scope and offer optional expansions individually;
- `HOLD`: preserve scope and strengthen completeness, failure handling, and recovery;
- `REDUCE`: propose the smallest outcome that still satisfies revised acceptance.

The user may select, modify, delegate, or defer the posture. Stop on an unanswered
choice. Start `workflow.start` only after alignment and store `planning_posture` plus
its rationale in workflow metadata. This is a scope boundary, not approval of the
eventual technical design.

## Design with model autonomy

Build a candidate plan privately. Ask the user only if the plan would change accepted
scope, public behavior, compatibility, security, material cost, external effects, or
recovery. Use the same host-native interaction protocol.

When the candidate remains inside the accepted Change Contract, proceed without a
second approval. A user may still request a plan review before persistence; that is an
interaction preference, not a runtime invariant.

Record:

1. `validate-baseline`
2. `analyze-requirements`
3. `analyze-codebase`
4. `design-slices`
5. `validate-dependencies`
6. `persist-task-contracts`
7. `verify-plan`

Design a walking skeleton and subsequent vertical slices. Every slice reaches a real
consumer and owns its validation, side effects, errors, documentation, migration,
observability, and recovery obligations. Avoid unconsumed horizontal scaffolding.

## Persist task contracts

Create each task with:

- observable outcome and stable trace;
- `slice_kind`, public seam, and exact verification command;
- structured acceptance mapped to Change acceptance ids;
- bounded context refs and reasons;
- documentation impact, ownership, dependencies, and affected files when known.

Use estimates only when evidence supports them. A quick change has exactly one task.
Read every task back from DB. Never read or write `.ultra/tasks/tasks.json` directly;
it is a generated projection, not authority.

If a semantic `change.update` invalidated existing tasks, reconcile every affected
task contract against the current intent, acceptance, decisions, and research
evidence. Rebind the complete execution contract while clearing `stale` through
`task.update`; MCP rejects a marker-only clear, validates the read-back, and records
the current Change authority digest. Never clear staleness merely to pass a gate.

Validate the change-scoped graph with `task.dependency_topo`. Export
`.ultra/execution-plan.json` with `plan.export`, read it through `plan.get`, and record
it as the `verify-plan` output.

Call `workflow.complete`. `approval` is optional: include it only when a material plan
decision actually required and received user approval. MCP derives task coverage and
topology from DB and must reject incomplete contracts, uncovered acceptance, cycles,
cross-change tasks, stale research, or a mismatched export.

Do not advance or complete the Change workflow; change capture is already complete.
Compile task context later for the consumer that needs it.

Return topology, first executable slices, public seams, verification commands, plan
workflow id, and allowed transitions. The host may recommend parallel or sequential
execution based on dependency and conflict evidence.
