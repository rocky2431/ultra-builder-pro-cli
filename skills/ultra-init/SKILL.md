---
name: ultra-init
description: Initialize a new repository, adopt an existing codebase, or migrate prior Ultra authority into a verified project baseline. Use when `.ultra` is absent, initialization is incomplete, baseline readiness is blocked, or a legacy Ultra project must be resumed.
---

# Establish project authority

Use host reasoning to inspect repository evidence and prepare baseline content. Use
Ultra MCP for classification records, schema migration, workflow state, evidence
digests, approval, and convergence. Never treat generated Markdown or JSON as state.

## Classify without guessing product scope

Run `system.doctor` read-only when `.ultra/state.db` exists. Otherwise call
`task.init_project` with `mode: "auto"`, the repository root, project name, and an
owner-selected monorepo scope when applicable.

Interpret classification independently from readiness:

- `greenfield`: no meaningful delivered application behavior exists outside docs,
  generated output, or a starter skeleton;
- `brownfield`: source, runtime, deployment, API, schema, or test evidence shows an
  existing maintained system;
- `migrated`: older DB or projection-only authority was preserved and must be
  replaced by an evidence-backed brownfield baseline.

The presence of `.ultra/`, a manifest, or a Git repository does not make a baseline
ready. Classification never chooses an MVP, reduced scope, or delivery posture.
Report the detected project type, technology signals, verification commands, and
monorepo roots. Pass an explicit `project_type` or `stack` only when repository evidence
or an owner decision supports the override; MCP preserves both detection and selection.

## Resume safely

When `.ultra/` exists, call `task.init_project` with `resume: true`. It must preserve
existing artifacts, create a pre-migration backup when needed, upgrade the schema,
install only missing assets, and return the durable workflow ids and exact route.

For projection-only state, execute only the backup-first migration command returned by
the structured error. For a `migrated` compatibility row, call `baseline.start` with a
new brownfield id and `replace_migrated: true`; never treat migration as owner approval.

Replacing a healthy baseline requires a new id plus `replace_ready: true` and explicit
`replacement_authorization`. Preserve corrupt DB, WAL, SHM, and backups; use the
documented restore or rebaseline command only after the owner selects that destructive
recovery path.

## Follow durable initialization state

Read the returned init and research runs with `workflow.get`.

- `inspect-authority`: `task.init_project` records the bounded repository and existing
  Ultra evidence it inspected.
- `classify-repository`: `task.init_project` records classification, detected signals,
  selected scope, and supported overrides.
- `scaffold-authority`: `task.init_project` creates or resumes DB authority and installs
  only missing scaffold assets.
- `establish-baseline`: research completion, `baseline.record`, and owner-approved
  `baseline.converge` establish the evidence-backed authority.
- `verify-initialization`: convergence re-reads baseline, init, research, repository,
  verification, and output health before completing initialization.

The first three steps are deterministic writes owned by `task.init_project`; the final
two are completed atomically by successful baseline convergence. Do not mark or emulate
these transitions in Prompt text or projection files.

- Greenfield starts a `full` research run.
- Brownfield starts an `adoption` research run.
- Both modes require all seventeen research steps before baseline convergence.
- A migrated project remains routed to re-adoption before research can authorize work.

Continue through `ultra-research`. Research completion records output digests; then
`baseline.record` captures current scope, revision, discovery/product/architecture
specs, source and runtime evidence, actual verification, unknowns, gaps,
classification, and external provider metadata references.

Call `baseline.converge` only after explicit owner approval. The MCP rejects missing
research, missing discovery/product/architecture refs, stale evidence, revision or
worktree drift, unaccepted known failures, blocking unknowns, and blocking gaps. A
successful convergence atomically marks the baseline ready and completes the init run.

## Recovery

- Record deterministic blockers on the current workflow; never create a parallel run.
- Use `system.doctor` repair only for supported schema, projection, session, incident,
  archive, or legacy workflow-provenance recovery. A recovered legacy change workflow
  remains blocked for real baseline evidence; repair cannot invent research or approve
  a baseline.
- Treat context budgets as advisory. Missing authority, evidence, output, or approval
  is blocking.
- Store only references to external memory and code-graph providers.

## Completion

Read `baseline.get`, `workflow.get`, and `system.doctor` after convergence. Report
classification evidence, scope, revision, worktree snapshot, migration backups,
research run and output health, verification, gaps, approval, and one route.

Initialization is complete only when the baseline is `ready`, the init workflow is
`completed`, the research workflow is `completed`, and
`baseline.research_run_id` names that exact research run with healthy outputs. Route
every newly converged or already initialized baseline through `ultra-change`; planning
starts only after that command persists a complete Change Contract, profile, and
research disposition. Otherwise return the exact current workflow step or blocker.
