---
name: ultra-plan
description: Turn an accepted Ultra Change Contract into dependency-valid, DB-backed vertical task contracts. Use when research obligations are resolved and implementation needs an executable plan.
---

# Build an executable plan

The model owns decomposition and technical design. MCP owns plan state, task contracts,
dependency integrity, output digests, and recovery. Planning must stay inside the
accepted Change Contract without adding ceremonial approval.

## Bind current authority

1. Read doctor, baseline, change, breadcrumb `accepted_intent`, decisions, existing plan
   runs, tasks, and current checkout.
2. Require one mutable change with a healthy baseline or recorded incident bypass.
   For the first delivery of a greenfield project, an accepted ready baseline may
   already contain the complete delivery outcome. When no matching Change exists,
   materialize one `change.create` contract from that accepted intent and read it back
   without asking the owner to repeat the same choice. Do not invent scope, expand an
   incomplete baseline, or use this shortcut for a later change.
3. Complete the exact change-bound research disposition before planning.
4. For a standard or major Change, read the current registered `change.delta` and
   verify its baseline anchors and digest. A Direct Build route supplies the delta
   directly from accepted intent; it skips Research, not this authority boundary.
5. Resume the matching plan run. Do not start a new run until planning posture is
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

Build a candidate plan from the Change Contract, current typed delta, and any selected
research. Ask the user only if the plan would change accepted
scope, public behavior, compatibility, security, material cost, external effects, or
recovery. Use the same host-native interaction protocol.

When the candidate remains inside the accepted Change Contract, proceed without a
second approval. A user may still request a plan review before persistence; that is an
interaction preference, not a runtime invariant.

Record:

1. `validate-baseline`
2. `compile-context`
3. `analyze-requirements`
4. `analyze-codebase`
5. `design-slices`
6. `validate-dependencies`
7. `persist-task-contracts`
8. `verify-plan`

Design a walking skeleton and subsequent vertical slices. Every slice reaches a real
consumer and owns its validation, side effects, errors, documentation, migration,
observability, and recovery obligations. Avoid unconsumed horizontal scaffolding.

After starting or resuming the workflow, compile `change.context` with `role: plan`
and `gate: planning`. Record its immutable manifest as the `compile-context` output.
The packet is the accepted planning input, not a mutable plan draft. `change.context`
must not update Change provider references; persist new provider metadata with
`change.update` before recompiling.

## Persist task contracts

Create each task with:

- observable outcome (`purpose`) and stable trace (`why`);
- `slice_kind`, public seam, and exact verification command;
- structured acceptance mapped to Change acceptance ids;
- target seams and affected files when known;
- bounded pattern/context refs with a reason, optional anchor and scope, and an
  explicit freshness policy;
- documentation impact, ownership, and dependencies.

Use `digest` freshness with `expected_digest` for accepted inputs that must remain
byte-current. Use `existence` for source targets expected to change during
implementation. Use `advisory` only when drift should be visible but non-blocking.
The compiled task context restores constraints and non-goals from the Change Contract,
plus acceptance, recovery, documentation impact, and the definition of drift. Keep
large referenced files lazy; do not paste their bodies into the plan packet.

Use estimates only when evidence supports them. A quick change has exactly one task.
Read every task back from DB. Never read or write `.ultra/tasks/tasks.json` directly;
it is a generated projection, not authority.

If a semantic `change.update` invalidated existing tasks, reconcile every affected
task contract against the current intent, acceptance, decisions, and research
evidence. Rebind the complete execution contract while clearing `stale` through
`task.update`; MCP rejects a marker-only clear, validates the read-back, and records
the current Change authority digest. Never clear staleness merely to pass a gate.

Validate the change-scoped graph with `task.dependency_topo`. Export
the deterministic `<artifact_root>/plan.json` and `<artifact_root>/plan.md` pair with
`plan.export { change_id }`. The JSON binds the exact planning context snapshot and
manifest digest; the Markdown is a deterministic human view of the same task graph.
Read the JSON through `plan.get` and record it as the `verify-plan` output. Do not
choose an arbitrary output path or overwrite another Change's plan. A legacy global
`.ultra/execution-plan.json` may be read for migration diagnosis only and is never a
current write target.

Call `workflow.complete`. `approval` is optional: include it only when a material plan
decision actually required and received user approval. MCP derives task coverage and
topology from DB and must reject incomplete contracts, uncovered acceptance, cycles,
cross-change tasks, stale research, or a mismatched export.

Do not advance or complete the Change workflow; change capture is already complete.
Compile a separate task context later for each consumer that needs it. Planning,
implementation, testing, review, and convergence snapshots are not interchangeable.

Return topology, first executable slices, public seams, verification commands, plan
workflow id, and allowed transitions. The host may recommend parallel or sequential
execution based on dependency and conflict evidence.

Never invoke the recommended capability here; wait for an explicit user invocation.
