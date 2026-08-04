# Ultra Builder Pro v0.26 decisions

This file records durable product-level decisions that explain the current source tree.
Project decisions created by Ultra belong in each project's `.ultra/decisions/`.

## File-first authority

Owner-readable repository files and Git are the complete semantic authority. Ultra
does not maintain a database, MCP kernel, workflow state machine, prompt projection, or
daemon. The previous mechanical supervisor could make every public path unreachable
while still reporting internally consistent state; deletion restores the host model's
ownership of route and meaning.

## Three Skill roles

The product exposes eight owner-invoked workflows, five model-invoked disciplines, and
one router. Public workflows require explicit owner selection. A public workflow may
recommend but never launch another public workflow. A model discipline needs at least
two canonical callers or it is inlined.

This keeps reusable reasoning in one place without turning it into another user-facing
route or custom-agent registry.

## Intake, baseline, and delta

Init preserves raw owner intake in the Project Brief; Research establishes the accepted North Star, domain language, and specification baseline; Change reconciles only the sections touched by one requested delta.

The optional Research Wayfinding brief is derived navigation, not a fifteenth Skill or
semantic authority. The first six Research references remain dependency-aware semantic
lenses. Grilling controls how caller-named questions are asked, Think stress-tests one
consequential decision, and Domain Modeling promotes settled vocabulary. This prevents
Init from consuming Research while keeping reusable methods in one canonical place.

## Rule-side assets travel with Skills

`.ultra/` contains project data only. Reusable executable examples live under
`skills/ultra-tdd/references/templates/`; the reduction boundary lives under
`skills/ultra-think/references/`; the full philosophy lives in `docs/PHILOSOPHY.md`.

Skill `references/` is already copied by every adapter and supports relative
cross-Skill links. No placeholder root variable or separate asset distributor is
needed.

## State is fact; route is judgment

Directory position and explicit fields record mechanically checkable facts. The host
model reads those facts and chooses the next route. There is no persisted “current
workflow stage” whose value can override the actual files.

Task status is written to both the ledger and context, then read back. Tasks retain a
stable `change_id` in an append-only ledger; current readers select only rows matching
the one active Change. Archive or abandonment is a `git mv`. Test-report freshness
compares Change id, current task ids, intent digest, `git_commit`, and product-worktree
digest with the current checkout. Deliver reconciles first and finalizes only while
that complete snapshot remains current. A separate request cannot create a second
active Change; it waits, exits the current Change, or is explicitly reconciled into the
same id.

## Three independent integration defences

Planning, task development, and final testing detect different versions of the
locally-green/whole-system-broken failure. Their outputs remain independent sensors:
horizontal task shape, six evidence dimensions, and final wiring/E2E audit.

No single sensor is promoted into a semantic completion gate.

## Five hooks only

The hook surface is session context, mid-workflow acceptance recall, compact snapshot,
post-edit evidence observation, and dangerous-command protection. Every hook is silent
without `.ultra/`. Additive protected-branch publication is advisory because the
portable hook cannot receive every host's trusted owner-approval receipt. History
rewrites, branch deletion, and the narrower named destructive effects can be denied;
their repair is authorization scoped to the exact command digest.

## Delegation is a process boundary

`ubp delegate run` starts a supported CLI with an immutable instruction, explicit
permission JSON, and named worktree. Files are the cross-host state. The parent reads a
stable terminal result instead of worker chatter. Delegation adds no semantic store and
no authority. The instruction selects task execution, scoped Research evidence, or
aggregate Change review/verification; only task execution requires a task row.

## Installation isolation

An explicit `--config-dir` owns host sidecars as well as the primary config. In
particular, Codex plugin and personal-marketplace paths resolve inside the sandbox.
Managed staging, provenance, doctor, and uninstall are native adapter responsibilities.

## External effects

Commit, push, tag, package publication, release, deployment, installation, migrations,
and real-money effects are independent. A locally complete delivery authorizes none of
them automatically.
