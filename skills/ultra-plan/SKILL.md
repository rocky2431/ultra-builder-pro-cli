---
name: ultra-plan
description: Turn an evidenced Change intent into a dependency-valid task ledger, confirmed test seams, and resumable task contexts. Use when implementation needs decomposition, a wide refactor needs an expand-contract route, or an interrupted plan must be reconstructed from repository files.
---

# Turn one Change into executable tracer bullets

Planning owns decomposition and technical design. Files carry the result across
sessions and hosts; no runtime state decides whether the plan is meaningful.

## Before you start

1. Read `.ultra/tasks.json`; if a task is unfinished, read its `context_file` and
   closing `## Resume Note` before replacing or extending anything.
2. Read `CONTEXT.md` for vocabulary and the relevant `.ultra/decisions/` entries.
3. Read the active Change intent, its `trace_to` specification anchors, and the
   source, tests, consumers and recovery paths those anchors describe.

## Definition of done

- `.ultra/tasks.json` and one `.ultra/contexts/task-<id>.md` per task agree on
  identifiers, status, dependencies and trace anchors.
- The owner confirmed the scope posture and the seam list.
- Every feature task is a tracer bullet touching at least two layers, unless the
  Change itself demonstrably touches only one layer.
- Every context names the north-star hard constraints its work could violate, and
  each `HC-<n>` it names resolves to a real entry in `.ultra/north-star.md`.
- Coverage, dependency, trace, scope and context-budget checks have concrete results.

## Fix the planning posture

Choose `EXPAND`, `SELECTIVE`, `HOLD` or `REDUCE`; default to `SELECTIVE`. Once
chosen, keep that posture visible in the active Change intent rather than silently drifting.
Write it to the active Change `intent.md` under `## Planning Posture`; there is no
separate `plan.md` authority.
Use `../ultra-grilling/SKILL.md` through the host-native question surface when the
choice remains material, one question with a recommendation at a time.

If the work cannot fit in one session *and* the path itself is still unclear, use
`../ultra-think/SKILL.md` to resolve decision tickets before decomposing tasks.

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

Confirm the seam list before tests are written. Reuse an existing public seam and use
the highest seam that observes the behavior; one seam is ideal when it covers the path.

## Write the files

Each task records `id`, `title`, `type`, `priority`, `complexity`, `status`,
`dependencies`, `context_file`, `trace_to` and `change_ref`. Complexity is only a
splitting and context signal: 1–2 is local, 3–5 is bounded, 6–7 crosses a boundary,
and complexity > 7 must split.

Each context records Acceptance, confirmed seams, layers touched, target files,
Implementation, verification commands, the hard constraints the work could violate,
Definition of Drift, Change Log, Completion and Resume Note. Read every file back;
task count and context count must match.

Name a hard constraint whenever the task could plausibly breach it, not only when you
expect it to. The entry costs one line and is what makes a later breach a checkable
question instead of a judgement call; `none` is a legitimate answer for a task that
touches nothing constrained.

## Verify the plan

1. Map every in-scope user story or acceptance anchor to at least one task.
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

The owner chooses the posture, confirms seams, resolves reductions and accepts material
omissions. Mechanical cycles and broken paths are repaired before handoff because they
make the written graph impossible to execute.

## References

- `../ultra-grilling/SKILL.md` — read before a material posture or seam question.
- `../ultra-think/SKILL.md` — read when fog of war requires decision tickets.
