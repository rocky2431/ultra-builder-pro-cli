---
name: ultra-change
description: Open or resume a bounded continuous change and connect its intent, delta, decisions, context, and executable tasks. Use when maintaining or extending an Ultra project after its baseline exists.
---

# Open or resume a continuous change

Keep post-delivery work aligned through a delta, implementation, learning, and
convergence loop.

## Authority boundary

Use Ultra MCP tools for change and task lifecycle writes. Do not write raw SQLite or
mutate generated task and context projections. External memory or code-graph systems
own their payloads; Ultra stores only provider references supplied by the user or host.

## Workflow

1. Call `baseline.get`. State integrity failure routes to `ultra-doctor`. When no
   change is active, a missing, incomplete, or stale baseline routes to `ultra-init`.
   An urgent or already active bounded change may proceed with that condition recorded
   as a warning. `change.converge` requires an approved `ready` baseline; repository
   revision and tracked-spec drift created by the change are reconciled at archive.
2. Call `change.list` and `change.breadcrumb`.
   - Resume the single change that matches the requested outcome.
   - Require an explicit id when several changes could match.
   - Create a new change only when no existing packet represents the same outcome.
3. Capture the observable outcome, acceptance, non-goals, affected public seam,
   documentation impact, and unresolved decisions.
4. Classify the change as `quick`, `standard`, `major`, or `incident`. Ask only for a
   material product, risk, or recovery decision that repository evidence cannot answer.
5. Call `change.create` with a stable kebab-case id, or `change.update` when resuming.
6. Write the minimum artifact set required by the classification:

   ```text
   .ultra/changes/active/<change-id>/
     intent.md
     delta/                 # standard and major
     plan.md                # standard and major
     diagnosis.md           # incident
     context-manifest.json  # generated projection
     spec-learning.json     # generated projection
     verification.md        # generated projection
   ```

   Delta files describe differences from the baseline, not a second copy of it.
   Incident diagnosis records the symptom, earliest bad state, falsifiable
   hypotheses, evidence, root cause, and recovery boundary.
7. Create the smallest executable vertical slice with `task.create`. Each task needs
   one outcome, bounded ownership, dependencies, a live public seam, an exact
   verification command, and documentation impact.
8. Compile `change.context` for the next role and gate. Include only required
   references and the task execution contract. Missing required references, digest or
   HEAD drift, an absent public seam or verification command, and unknown
   documentation impact are blockers. File count, token estimate, and context-share
   thresholds are advisory warnings: narrow reads or split the slice when useful, but
   never raise a threshold merely to make the warning disappear or refuse necessary
   incident context.
9. Call `change.breadcrumb` and return its single next action.

## Specification learning

When implementation uncovers a stable requirement, invariant, or public behavior
missing from the baseline, call `change.learning_propose` with evidence and a target
document. The proposal does not edit the baseline. It must be approved or rejected,
and an approved item is marked applied only after the target document is updated and
verified.

## Completion gate

Do not claim alignment while a material decision is unresolved, documentation impact
is unknown, context is stale, or the next task is not executable. `change.converge`
also requires a `ready` baseline, so incomplete adoption must be resolved before
convergence. Normal HEAD or tracked-spec drift caused by the active change is not a
convergence blocker. Declare every baseline update at archive; archive fails and rolls
back when revision or digest health remains stale after reconciliation.
