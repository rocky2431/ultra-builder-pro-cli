---
name: ultra-plan
description: "Turn a validated baseline, active delta, or approved PRD into fresh-context vertical slices with public seams and exact verification contracts."
user-invocable: true
runtime: all
mcp_tools_required:
  - task.create
  - task.parse_prd
  - task.dependency_topo
  - plan.export
  - plan.get
  - change.get
  - change.context
  - change.breadcrumb
---

# ultra-plan — Fresh-Context Execution Planning

Produce a dependency-valid plan whose tasks can be executed in isolated contexts.
`.ultra/state.db` is authoritative; the projector owns task JSON and context
frontmatter.

## Failure boundary

Start with a state-backed MCP read. On `LEGACY_STATE_MIGRATION_REQUIRED`, stop and
instruct:

```bash
ultra-tools migrate --from=4.4 --to=4.5 --source-dir <project-root>
```

Never read or write `.ultra/tasks/tasks.json` as authority. If task MCP mutation is
unavailable, stop; there is no task-creation CLI fallback.

## Inputs

Choose exactly one:

- validated baseline specs under `.ultra/specs/`;
- one active change packet (`intent.md`, `delta/`, `plan.md`);
- raw PRD using the approval-gated direct mode below.

Ask only for a product or risk decision that cannot be derived from current evidence.
Record assumptions explicitly; unresolved material assumptions block planning.

## Planning rules

1. Trace acceptance through a live entry point, domain behavior, side effects, and a
   user-observable/public seam.
2. Prefer a walking skeleton / `tracer_bullet` before horizontal layers.
3. Make each task completable in a fresh context: one outcome, bounded references,
   explicit dependencies, and one deterministic verification command.
4. Keep the default context packet at or below 12 files, 12k approximate tokens, and
   40% of the fresh context budget.
5. Use `expand_contract` only when a wider change is approved and cannot be split
   without losing correctness.
6. Create integration checkpoints at real seams, not after arbitrary task counts.
7. Include error, recovery, documentation, and migration work in the task that owns
   the behavior; do not create unreachable scaffolding tasks.

## Task contract

Every `task.create` must carry or be paired with:

- outcome and acceptance assertions;
- priority, complexity, dependencies, and ownership paths;
- linked `change_id` when planning a delta;
- `slice_kind`: `tracer_bullet`, `expand_contract`, or `integration_checkpoint`;
- `public_seam`;
- exact `verification_command`;
- required context references and their reasons;
- expected red/green signal for fixes and incidents;
- documentation impact.

After each task is persisted, compile `change.context` with `role=plan` and
`gate=planning` when it belongs to a change. A blocked readiness result must be fixed
before the task is called executable.

## Spec mode / change mode

1. Read the smallest authoritative references that define acceptance.
2. Build a task DAG in memory and check file-ownership conflicts.
3. Present the outcome, order, cost/risk concentration, and walking-skeleton seam.
4. Obtain approval when the plan materially changes scope or cost.
5. Persist tasks through `task.create`.
6. Call `task.dependency_topo`; cycles or missing dependencies are blocking.
7. Call `plan.export`, then verify it with `plan.get` rather than reparsing the file.
8. For an active change, call `change.breadcrumb` and report its one next action.

## PRD direct mode

1. Call `task.parse_prd` with `dry_run: true`.
2. Show the proposed vertical slices, topology, conflict surface, and estimated cost.
3. Require explicit approval. Rejection performs no state write.
4. On approval, repeat the same parse with `dry_run: false`, then `plan.export`.
5. Verify dry-run and persisted task ids match; mismatch is a deterministic failure.

## Context body

Human-readable task context may explain intent, acceptance, seam, red/green signal,
and relevant references. It must not duplicate entire specs, provider memory, or a
static codebase tour. The next worker should be able to begin from the manifest and
verify the slice without recovering the planner's full conversation.

## Completion gate

Planning is complete only when the DAG is valid, every task is reachable through a
public seam, every command is executable, every change-linked task has a ready Context
Manifest v2 snapshot, and no required documentation or decision is unknown.
