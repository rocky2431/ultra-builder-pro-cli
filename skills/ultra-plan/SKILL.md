---
name: ultra-plan
description: Convert a validated baseline, active delta, or approved PRD into dependency-valid vertical slices with bounded context and exact verification. Use when requirements are ready to become authoritative Ultra tasks.
---

# Plan fresh-context execution

Produce a task graph whose slices can be completed independently and verified through
live product seams. `.ultra/state.db` remains authoritative; task JSON and context
Markdown are generated projections.

## Entry gate

Start with a state-backed MCP read. If state or schema health blocks access, stop and
route to `ultra-doctor`. Never read or write `.ultra/tasks/tasks.json` as a fallback.
Call `baseline.get`. Initial product planning is blocked until the baseline is
`ready` and current; route its missing, adopting, blocked, or stale state to
`ultra-init`. Planning an already active bounded change may continue with the
baseline condition recorded as a warning. Ordinary convergence still requires
approved adoption, and archive atomically reconciles revision and specification
drift. An approved break-glass incident follows its recorded recovery contract and
creates a blocking reconciliation gap at archive.

Choose one input:

- validated baseline specifications;
- one active change packet;
- a raw PRD through the approval-gated mode below.

Ask only for product, scope, cost, or risk decisions that cannot be derived from
current evidence. A material unresolved assumption blocks persistence.

## Planning rules

1. Trace acceptance through an entry point, domain behavior, side effects, and a
   user-observable or public seam.
2. Prefer a walking skeleton or `tracer_bullet` before horizontal layers.
3. Give each task one outcome, bounded ownership, explicit dependencies, required
   references, and one deterministic verification command.
4. Use the context budget as an attention signal. Prefer bounded excerpts, direct
   reads, or a smaller slice, but keep necessary files when correctness requires them.
   Budget overflow is a warning, never a reason to inflate a threshold or manufacture
   a smaller but incomplete contract.
5. Add integration checkpoints at actual boundaries, not after arbitrary task counts.
6. Put validation, errors, recovery, documentation, and migrations in the task that
   owns the behavior.
7. Reject scaffolding with no reachable consumer.

Every persisted task must include its slice kind, public seam, verification command,
acceptance evidence, ownership, dependencies, documentation impact, and linked change
id when applicable.

## Baseline or change mode

1. Read the smallest authoritative references that define acceptance.
2. Build the task DAG in memory and check dependency and ownership conflicts.
3. Present the proposed outcome, execution order, risk concentration, and first live
   seam. Obtain approval if scope, cost, or delivery semantics change materially.
4. Persist approved tasks with `task.create`.
5. For change-linked tasks, compile `change.context` with the planning role and gate.
   Resolve every readiness blocker before calling a task executable.
6. Call `task.dependency_topo`; cycles and missing dependencies block completion.
7. Call `plan.export`, then verify the persisted result with `plan.get`.
8. Call `change.breadcrumb` when a change is active and return one next action.

## PRD mode

1. Read the approved PRD with the current host model and derive the proposed task
   objects using the `task.parse_prd` input schema. Do not invoke a second model or
   require a provider API key inside Ultra MCP.
2. Call `task.parse_prd` with those `tasks`, `dry_run: true`, and the active
   `change_id` when applicable. The MCP validates the graph but does not supply
   product judgment.
3. Show the proposed slices, topology, conflict surface, and cost estimate.
4. Require explicit approval; rejection performs no state write.
5. On approval, repeat with `dry_run: false`, the identical task objects, and the
   same change ownership; export
   the plan, and verify that the dry-run and persisted task identities agree.

When one approved task is still too broad, derive its complete child graph with the
current host model and call `task.expand` with the parent `id` and validated
`children`. The MCP assigns parent, tag, and change ownership atomically. Never ask
the MCP runtime to generate child content.

## Completion gate

Planning is complete only when the DAG is valid, each task reaches a public seam, each
verification command is executable, every change-linked context is ready, and no
required documentation or decision remains unknown.
