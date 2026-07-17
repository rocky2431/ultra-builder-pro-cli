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

1. Call `change.list` and `change.breadcrumb`.
   - Resume the single change that matches the requested outcome.
   - Require an explicit id when several changes could match.
   - Create a new change only when no existing packet represents the same outcome.
2. Capture the observable outcome, acceptance, non-goals, affected public seam,
   documentation impact, and unresolved decisions.
3. Classify the change as `quick`, `standard`, `major`, or `incident`. Ask only for a
   material product, risk, or recovery decision that repository evidence cannot answer.
4. Call `change.create` with a stable kebab-case id, or `change.update` when resuming.
5. Write the minimum artifact set required by the classification:

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
6. Create the smallest executable vertical slice with `task.create`. Each task needs
   one outcome, bounded ownership, dependencies, a live public seam, an exact
   verification command, and documentation impact.
7. Compile `change.context` for the next role and gate. Include only required
   references and the task execution contract. Treat missing references, digest or
   HEAD drift, an exceeded context budget, and unknown documentation impact as
   blockers.
8. Call `change.breadcrumb` and return its single next action.

## Specification learning

When implementation uncovers a stable requirement, invariant, or public behavior
missing from the baseline, call `change.learning_propose` with evidence and a target
document. The proposal does not edit the baseline. It must be approved or rejected,
and an approved item is marked applied only after the target document is updated and
verified.

## Completion gate

Do not claim alignment while a material decision is unresolved, documentation impact
is unknown, context is stale, or the next task is not executable from a bounded fresh
context.
