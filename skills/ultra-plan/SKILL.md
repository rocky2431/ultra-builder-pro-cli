---
name: ultra-plan
description: Convert a ready Ultra baseline or approved active-change delta into dependency-valid, DB-backed execution contracts and fresh-context vertical slices. Use when accepted requirements are ready for implementation planning or an existing plan must be resumed and verified.
---

# Persist an executable plan

Use host reasoning for decomposition, tradeoffs, and approval. Use Ultra MCP for
workflow position, task contracts, graph validation, projection, and recovery.

## Bind authority

1. Call `system.doctor`, `baseline.get`, `change.list`, and `change.breadcrumb`.
2. Require a current ready baseline for new ordinary work. Resume an already-authorized
   active change when appropriate; an incident uses only its recorded break-glass
   authority.
3. Ensure exactly one active change owns the plan. For initial implementation, open a
   standard or major change from the accepted baseline before creating tasks.
4. Read `references/semantic-preflight.md`. Resolve every blocking Change decision and
   complete the exact recorded bounded research selection before starting the plan.
5. Resume the active `plan` workflow from `workflow.list`, or call `workflow.start`
   with its `baseline_id`, `change_id`, subject, and source refs.

## Plan through the durable steps

Record each completed step with `workflow.step`:

1. `validate-baseline`: verify baseline and completed research provenance.
2. `select-posture`: preserve the owner-approved scope and delivery posture. Never
   infer an MVP, reduction, phase, or exclusion. Ask only when a proposed plan changes
   accepted scope, cost, risk, compatibility, or delivery semantics.
3. `analyze-requirements`: trace stable requirement ids to acceptance and public seams.
4. `analyze-codebase`: inspect current entry points, consumers, patterns, state
   authority, tests, deployment, and recovery paths before designing new structure.
5. `design-slices`: design a walking skeleton and subsequent vertical slices. Every
   slice must reach a real consumer; include validation, side effects, errors,
   documentation, migration, observability, and recovery in the owning slice.
6. `validate-dependencies`: validate ownership, missing dependencies, cycles, conflict
   surfaces, and meaningful integration checkpoints.
7. `approve-plan`: persist owner approval when the plan makes a material decision.

## Persist complete task contracts

Call `task.create` for each approved task with:

- one observable `outcome` and stable `trace_to`;
- `slice_kind`, `public_seam`, and exact `verification_command`;
- structured `acceptance` items with their verification;
- bounded `context_refs` with reasons;
- resolved `docs_impact` and durable `ownership`;
- dependencies, affected files when known, estimates only when evidence supports them,
  and the owning `change_id`.

Copy each Change acceptance id into at least one task acceptance item without changing
its meaning. Set `trace_to` to that accepted id, a current research semantic id, or a
real project-relative Markdown `path#anchor`. A quick profile has exactly one task.
The MCP derives the coverage matrix and rejects uncovered acceptance, orphan tasks,
stale research, and oversized quick plans.

Never read or write `.ultra/tasks.json` or generated context Markdown as authority.
The DB owns the task contract and the projector regenerates both views.
`persist-task-contracts` completes only after `task.get` reads every field back without
a contract blocker.

Call `task.dependency_topo` with the current `change_id`, then call
`plan.export` with `change_id`, `format: "json"`, and
`out_path: ".ultra/execution-plan.json"`. Export records `plan_exported`; it does
not approve the plan. Read the same change back with `plan.get`.
The exported artifact is change-bound and may not include tasks from another active
or historical change. Recompile `change.context`
for the first task; it derives its execution contract and context refs from DB and
rejects a conflicting prompt override. Missing required refs block readiness; context
size is advisory.

Record `verify-plan` with `.ultra/execution-plan.json` as its sole output, then call
`workflow.complete` with
`approval.approved_by` and `approval.approval_note`. Do not send a task summary: MCP
derives the complete task set from every task owned by the change. Completion
revalidates every task contract, change ownership, dependency existence, graph cycles,
the exact exported topology, approval, and current output digests; it also advances
the linked change workflow to context compilation.
Return the persisted topology, first task/public seam,
approval evidence, plan workflow id, and one `ultra-dev` route.
