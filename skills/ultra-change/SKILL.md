---
name: ultra-change
description: Open or resume one bounded post-baseline change and connect its intent, delta, task plan, fresh context, and convergence evidence. Use when handling daily feature work, fixes, redesigns, or incidents after an Ultra baseline exists.
---

# Align, route, and maintain one continuous change

Use Ultra MCP for lifecycle writes. Keep external memory and code-graph content in
their providers; Ultra stores references only. Read
`../ultra-think/references/decision-dialogue.md` before forming a Change Contract.

## Capture and align the outcome

1. Read `system.doctor`, `baseline.get`, `change.list`, `change.breadcrumb`, and active
   decision threads. Resume the matching change or alignment thread; do not duplicate
   either authority.
2. New ordinary work requires a ready baseline. An incident on unhealthy authority
   requires an explicit `baseline_bypass` reason and approver. Never infer approval
   from urgency.
3. Inspect the current checkout before questioning the owner. Convert the request into
   a working outcome, constraints, accepted facts, unknowns, and likely risk profile.
   Resolve repository facts yourself.
4. Start a baseline-bound decision thread when the Change Contract contains a material
   owner choice. Normalize explicit decisions already present in the user's request
   without asking them to repeat themselves. Otherwise open one earliest decision,
   present it with a recommendation and durable effect, and STOP.
5. Read `references/change-contract.md`. After all blocking decisions are resolved,
   prepare one compact Change Contract checkpoint containing the outcome, executable
   acceptance, non-goals, public seams, recovery contract, unresolved decisions,
   documentation impact, profile rationale, material risk flags, and research
   disposition. The owner approves the contract once; do not ask for a second equivalent
   confirmation.
6. Select `quick`, `standard`, `major`, or `incident` from current scope and risk.
   Escalate a proposed quick change when its contract carries material risk or research.
   Write the compact approved alignment projection to
   `.ultra/docs/alignment/<thread-id>.md`, confirm the decision checkpoint with that
   artifact digest, then call `change.create` with `alignment_thread_id`. The create
   operation materializes the authoritative Change Contract projections. Read the
   normalized change and linked workflow back.

Do not create a decision thread for a fact the agent can inspect or a reversible
implementation detail already delegated by the accepted contract.

## Record the change workflow

Use `workflow.step` as evidence becomes durable:

- `bind-baseline`: current baseline id, revision, branch, and worktree evidence;
- `classify-change`: kind and rationale;
- `record-intent`: intent artifact, acceptance, scope, and resolved docs impact;
- `plan-change`: completed plan workflow and authoritative task ids;
- `compile-context`: current task-bound `change.context` manifest and digest;
- `verify-readiness`: ready breadcrumb with one executable next action.

Standard and major changes keep deltas under
`.ultra/changes/active/<id>/delta/` and an evidence-linked `plan.md`. Deltas describe
differences from the baseline; they are not a second baseline. Incidents maintain the
structured diagnosis artifact and recovery evidence.

When `research_disposition.status` is `bounded` or `required`, run `ultra-research`
with the exact recorded mode and selected steps before planning. Planning is blocked
until that change-bound research run is complete, current, and selection-equivalent.
Use `none` only when the Change Contract already has sufficient evidence.

Use `ultra-plan` to create complete DB-backed task contracts. Recompile
`change.context` after any task, HEAD, specification, or decision change. The task's DB
contract is authoritative; Prompt input may not override its seam or verification.
Required missing or stale refs block. Budget warnings guide narrower context but never
justify dropping necessary evidence or refusing legitimate work.

An ordinary active change remains executable only while its durable `bind-baseline`
evidence still names the current approved-ready baseline. HEAD, worktree, specification,
or source-evidence drift created after that binding is advisory until delivery
reconciliation. Adoption/migration state, missing approval or evidence, blocking gaps,
and any other structural baseline failure block tasks, context, and later stages. Only
the recorded incident break-glass authority can bypass that gate.

Call `workflow.complete` only after all change workflow steps are current. Return the
change id, kind, task set, context digest, blockers or warnings, workflow state, and the
breadcrumb's one route.

When implementation reveals a stable missing invariant, use
`change.learning_propose` and the approval/reject/apply transition. Unresolved learning
blocks delivery. An approved application must bind the declared target anchor, its
before and after digests, and current evidence before the proposal becomes `applied`.

## Automatic routing contract

Automatic means route, inspect, and recover automatically; it never means silently
choose an owner decision. The normal route is:

`capture → align → Change Contract checkpoint → change authority → bounded research when
needed → plan candidate → plan decision review → plan approval → ultra-dev → test →
review → deliver → baseline reconciliation`.

A quick change may omit research and use one task only when evidence proves the request
has no material unresolved decision or risk. An incident routes through reproduction,
hypothesis discrimination, recovery choice, fix, and verification before convergence.
