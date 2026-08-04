# Ultra artifact authority

This document defines which project artifacts carry semantic authority, who may change
them, how staleness is detected, and how recovery works in Ultra Builder Pro v0.26.

## Rules

1. One semantic fact has one canonical representation.
2. Owner intent and accepted reductions require owner authority.
3. The model may interpret, decompose, investigate, and edit inside the authorized frame.
4. Generated observations are disposable and never silently promoted.
5. Git supplies revision identity, history, archive moves, comparison, and rollback.
6. A Change keeps one stable `change_id`; directory position records lifecycle, not identity.

## Canonical artifacts

| Artifact | Canonical content | Primary writer | Required readers | Staleness or conflict signal |
|---|---|---|---|---|
| `.ultra/project-brief.md` | Raw owner intake, broad outline, explicit inputs, and open Research questions | `ultra-init`, owner correction | research, status; session Hook before an accepted baseline exists | owner correction or a recovered legacy one-line; never rewritten as researched truth |
| `.ultra/north-star.md` | Accepted project direction, outcome or metric decision, hard constraints, and exclusions | `ultra-research` after owner acceptance; owner correction | every workflow; session Hook | accepted correction, superseding decision, or evidence conflict |
| `.ultra/specs/product.md` | Product behavior and acceptance | research establishes; change/delivery reconcile touched sections | change, plan, dev, test, review, delivery | source/evidence conflict or unresolved marker |
| `.ultra/specs/architecture.md` | Boundaries, authority, consumers, failure and recovery | research establishes; change/delivery reconcile touched sections | change, plan, dev, test, review, delivery | live-path evidence conflicts with text |
| `.ultra/specs/discovery.md` | observations, unknowns, drift, and evidence queue | research; change for its scoped delta | research, change, status | evidence resolves or overturns an entry |
| `.ultra/specs/research-distillate.md` | bounded synthesis of specification state | `ultra-research` | change, plan, delivery | stored source blob hash differs from Git blob hash |
| `CONTEXT.md` | ubiquitous language and relationships | `ultra-domain-modeling`, first called by research and later by any qualifying workflow | every workflow and test naming | source/product use reveals ambiguity |
| `.ultra/changes/{active,archive,abandoned}/<id>/intent.md` | one bounded requested outcome, reconciliation, Research Disposition, stable identity, and exact Abandonment closure when abandoned | `ultra-change`; Planning Posture by `ultra-plan` | active: research through delivery; all states: status and future Change history | more than one active Change, duplicate id across positions, missing Abandonment closure, or acceptance/scope change |
| `.ultra/tasks.json` | append-only task ledger: globally unique identity, stable `change_id`, same-Change graph, status, trace, and context path | `ultra-plan` / `ultra-dev` | every user workflow and context Hook | dependency crosses Change, or ledger/context status disagrees |
| task `context_file` | acceptance, seams, implementation, evidence pointers, Completion, Resume Note | plan/dev | dev, test, review, status, delivery, resume | differs from ledger or current implementation |
| `.ultra/decisions/<id>.md` | durable consequential owner decision | `ultra-think` after acceptance | every workflow in scope | superseded by a newer decision file |
| `.ultra/evidence/<task-id>/...` | command output and bounded task evidence | `ultra-dev` | review, test, delivery | evidence revision differs from affected code |
| `.ultra/test-report.json` | whole-system audit, findings, and owner disposition for one Change/task/intent/product snapshot | `ultra-test`; `ultra-deliver` may add owner disposition without changing findings or `passed` | status and delivery | `change_id`, `task_ids`, `intent_digest`, `git_commit`, or worktree digest differs |
| `.ultra/changes/active/<id>/delivery.md` | outcome, docs, verification, review, debt, risk, recovery, effects | `ultra-deliver` | owner and archived Change history | active evidence or accepted scope changes |
| `.ultra/research/<run-id>/<step-id>.md` | cited investigation report for one selected lens | `ultra-research` | specs, change, plan, delivery | newer sources or later superseding run |

The repository files may use prose, tables, or JSON as appropriate. The format is not
authority by itself; the canonical path and accepted writer contract are.

The append-only task ledger preserves sequential Change history. Current readers select
only rows whose `change_id` matches the one unique active Change. Moving its directory
to archive or abandoned never rewrites task identity, and an unfinished historical row
never becomes current merely because of its status. Before an abandoned move,
`ultra-change` appends `## Abandonment` with the owner decision, reason, reusable
evidence, and recovery or successor. Future Change reconciliation and Status consume
that record as history, not as accepted current intent.

Every completed task has exactly one `.ultra/evidence/<task-id>/evidence.json` with
schema `ultra-task-evidence-v1`. It records `task_id`, forty-character `git_head`, exact
commands (`command`, `exit_code`, `evidence_ref`), all six evidence dimensions,
artifact paths, limitations, and timestamp. Each dimension uses `status` of
`satisfied`, `gap`, or `not_applicable`, plus `evidence_refs` and a non-empty rationale.
Optional raw logs live beside that record; they do not create another summary.

## Mutable workflow state

Pure file state uses three mechanisms:

- directory position, such as `changes/active/` versus `changes/archive/`;
- an explicit field, such as a task or context status;
- an on-the-spot model judgment that is not persisted as state.

A state field records a mechanically checkable fact. Route selection remains a model
judgment. Do not add a workflow-position field merely to decide which Skill should run.

At most one Change is active in one worktree. Zero active Changes is valid before a new
request and after delivery; completed current tasks may remain active while awaiting
Test or Deliver. More than one active directory is a conflict for owner/model repair,
not a reason for code to select the first entry.

Task completion uses a dual write: `.ultra/tasks.json` and the task context header must
agree. The writer reads both back. A mismatch is a visible recovery diagnostic; neither
side silently wins.

## Single-writer boundary

One primary host model writes canonical `.ultra` files in a worktree. Native review
workers are read-only sensors, and delegated CLIs write only declared non-`.ultra`
roots in isolated registered worktrees; their findings return to the primary writer.
Parallel implementation uses separate worktrees and explicit Git integration. Ultra
does not add a lock service or semantic state machine to make concurrent canonical
writes appear safe.

## Decisions and reductions

Write a durable decision only when it is difficult to reverse, surprising without
context, and the result of a real trade-off. All three conditions are required.

An accepted decision file is append-only history. A changed answer creates a new file
with `supersedes`; it does not rewrite the prior decision.

Classification of a specification change is outcome-based:

- `EXPANSION`: adds a commitment while all prior commitments remain true;
- `CORRECTION`: changes an inaccurate description while every prior product commitment
  still holds in the result;
- `REDUCTION`: any prior commitment stops holding, regardless of the justification.

Only the owner may accept a reduction.

## Evidence promotion

Tool output, source inspection, external sources, and runtime observations begin as
evidence. The model may use them to update a canonical specification when their scope
and provenance support the claim. The evidence is retained or cited; it is not copied
into a second semantic ledger.

A test result is current only for the code and environment it exercised. A report must
carry the exact command, exit code, stable Change id, exact current task ids, intent
SHA-256, Git commit, and product-worktree digest. Delivery metadata and moving the same
Change between active and archive do not alter the product digest; changing intent
bytes does alter `intent_digest`. Missing or stale evidence remains
`not_run`, `unknown`, or `stale`; it is never inferred as passing.

## Derived artifacts

These paths are intentionally non-authoritative:

| Path | Purpose | Recovery |
|---|---|---|
| `.ultra/research/<run-id>/brief.md` | optional Wayfinding question map for a multi-lens Research run | rebuild from Project Brief, accepted authority, evidence needs, and owner checkpoints |
| `.ultra/.runtime/compact-snapshot.md` | compaction acceleration | rebuild from files and Git |
| `.ultra/.runtime/delegations/` | delegated process receipts and logs | inspect result or rerun with new id |
| `.ultra/.runtime/worktrees/` | delegated checkout locations | inspect Git worktrees and remove safely |
| `.ultra/progress/<task-id>.json` | mechanical evidence observations | rerun sensors or inspect current diff |
| `.ultra/reviews/<session>/` | bounded lens packets and findings | rerun review at a named revision |

The canonical template's nested `.ultra/.gitignore` ignores `.runtime/`, `progress/`,
and `reviews/` without rewriting the owner's repository-level ignore rules. Deleting
those paths cannot delete accepted product intent, task contracts, or decisions.

## Recovery order

After interruption or host change:

1. identify the repository root and current `HEAD`;
2. resolve zero or one active `change_id`, then read `.ultra/tasks.json`;
3. select only matching tasks and read the frontier task's full context and closing Resume Note;
4. read the Project Brief, accepted North Star, `CONTEXT.md`, relevant decisions, active
   Change, specifications, and evidence;
5. inspect the working tree and compare it with Completion and evidence claims;
6. repair any ledger/context mismatch explicitly before relying on status;
7. continue through the next observable acceptance boundary.

Hooks and the `ubp` executable may be unavailable. Recovery must still work through
these files and Git alone.
