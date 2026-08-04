---
name: ultra-plan
description: Turn an evidenced Change intent into a dependency-valid task ledger, confirmed test seams, and resumable task contexts. Use when implementation needs decomposition, a wide refactor needs an expand-contract route, or an interrupted plan must be reconstructed from repository files.
---

# Turn one Change into executable tracer bullets

Planning owns decomposition and technical design; files carry it across sessions and hosts.

## Before you start

1. Resolve exactly one `.ultra/changes/active/<change_id>/intent.md`. If none or more
   than one exists, stop with that file conflict. The intent must be `accepted`, every
   blocking decision resolved, and its `## Research Disposition` exit evidence
   satisfied before decomposition.
2. Read `.ultra/tasks.json`; select matching tasks and read each unfinished context and
   Resume Note. Preserve all historical tasks in the append-only ledger.
3. Read `CONTEXT.md` for vocabulary and the relevant `.ultra/decisions/` entries.
4. Read the active Change intent, its `trace_to` specification anchors, and the
   source, tests, consumers and recovery paths those anchors describe.

## Definition of done

- `.ultra/tasks.json` and one `.ultra/contexts/task-<id>.md` per current-Change task
  agree on identifiers, stable `change_id`, status, dependencies and trace anchors.
- The owner confirmed any material posture. Seams resolve to code; technical selection
  stays model-owned unless it changes public contract, accepted risk, or material trade-off.
- Every feature task is a tracer bullet touching at least two layers, unless the
  Change itself demonstrably touches only one layer.
- Every context names the north-star hard constraints its work could violate, and
  each `HC-<n>` it names resolves to a real entry in `.ultra/north-star.md`.
- Every Change acceptance id maps to at least one task context, and every context id
  resolves back to the active Change.
- Coverage, dependency, trace, scope and context-budget checks have concrete results.

## Fix the planning posture

Choose `EXPAND`, `SELECTIVE`, `HOLD` or `REDUCE`; default to `SELECTIVE`. Once
chosen, keep that posture visible in the active Change intent rather than silently drifting.
Write it to the active Change `intent.md` under `## Planning Posture`; there is no
separate `plan.md` authority.
Use `../ultra-grilling/SKILL.md` through the host-native question surface when the
choice remains material, one question with a recommendation at a time.

When the whole path is still unclear, recommend `ultra-research`; the Change is not yet
evidenced enough to decompose. For one consequential trade-off, use `../ultra-think/SKILL.md`.

## Choose the plan shape

Use tracer bullets for ordinary work: each slice delivers one observable path through
the layers it changes. Use expand–contract only when one mechanical change has a
repository-wide blast radius and no vertical slice can keep the checkout green:
expand with old and new forms, migrate bounded batches, then contract the old form.

Build the graph with these structural defences:

- **Walking Skeleton**: Task 1 traverses every layer this Change touches through one
  real request and real data. A genuinely one-layer Change does not invent one.
- **Contract task**: create it before both implementations when targets cross two top-
  level source directories or two processes/services.
- **Integration Checkpoint**: insert one after every three or four feature tasks.
- A feature task that touches only one of several affected layers is merged or split
  into a tracer bullet; moving a whole layer into one task is horizontal slicing.

Record seams before tests. The model chooses the technical seam: prefer an existing,
highest observable public seam, ideally one. Ask the owner only when it changes the
public contract or another material product, risk, or recovery trade-off.

## Write the files

Each task records `id`, `title`, `type`, `priority`, `complexity`, `status`,
`dependencies`, `context_file`, `trace_to` and `change_id`. Task ids are globally
unique, and every dependency must name a task with the same `change_id`; an archived
Change must never become an implicit prerequisite of current work. Complexity is only a
splitting and context signal: 1–2 is local, 3–5 is bounded, 6–7 crosses a boundary,
and complexity > 7 must split.

Append new tasks or repair matching current-Change tasks in place; never replace the
ledger with only the latest graph. A `quick` Change produces exactly one minimal task
and context rather than bypassing the task/evidence lifecycle.

Each context records Change Acceptance IDs, task-local Acceptance, confirmed seams,
layers touched, target files, Implementation, verification commands, the hard
constraints the work could violate, Definition of Drift, Change Log, Completion and
Resume Note. Read every file back; task count and context count must match.

Name a hard constraint whenever the task could plausibly breach it, not only when you
expect it to. The entry costs one line and is what makes a later breach a checkable
question instead of a judgement call; `none` is a legitimate answer for a task that
touches nothing constrained.

## Verify the plan

1. Map every Change acceptance ID to at least one task context and reject dangling
   context IDs. Map every in-scope user story or specification anchor to at least one task.
2. Walk dependencies and repair every cycle with the exact cycle chain visible.
3. Resolve every `trace_to` path and heading against a real file.
4. Resolve every `HC-<n>` against `.ultra/north-star.md`. A dangling constraint id is
   the same defect as a dangling `trace_to`: it reads as checked and never was.
5. Surface complexity, more than eight target files, or more than twenty tasks as
   scope warnings; they are observations, not semantic verdicts.
6. Estimate context at roughly `complexity × 5%`; surface anything above 40%.

Report the graph, frontier, seams, warnings and first task. Recommend the next explicit
capability from the files; do not invoke it.

## When the owner decides

The owner chooses material posture, reductions, omissions, and any seam changing public
contract or material trade-off. The model owns technical decomposition and seams.
Repair mechanical cycles and broken paths before handoff.

## References

- `../ultra-grilling/SKILL.md` — read before a material posture or seam question.
- `../ultra-think/SKILL.md` — read when one evidenced decision blocks decomposition.
