---
name: ultra-change
description: Open or resume one bounded post-baseline change and connect its intent, delta, task plan, fresh context, and convergence evidence. Use when handling daily feature work, fixes, redesigns, or incidents after an Ultra baseline exists.
---

# Maintain one continuous change

Use Ultra MCP for lifecycle writes. Keep external memory and code-graph content in
their providers; Ultra stores references only.

## Bind or create

1. Read `system.doctor`, `baseline.get`, `change.list`, and `change.breadcrumb`.
2. Resume the change matching the requested outcome. Require an id when several could
   match; do not create a duplicate packet.
3. New ordinary work requires a ready baseline. An incident on unhealthy authority
   requires an explicit `baseline_bypass` reason and approver. Never infer approval
   from urgency.
4. Read `references/change-contract.md`. Persist the complete outcome, executable
   acceptance, non-goals, public seams, recovery contract, unresolved decisions,
   documentation impact, profile rationale, material risk flags, and research
   disposition. Do not derive these fields from a title or free-form intent later.
5. Select `quick`, `standard`, `major`, or `incident` from current scope and risk.
   Escalate a proposed quick change when its contract carries material risk or research.
   Then call `change.create` or `change.update` and read the normalized record back.
6. Resume or start the linked `change` workflow with `workflow.list`/`workflow.start`.

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
