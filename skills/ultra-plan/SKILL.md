---
name: ultra-plan
description: Turn an evidenced Change intent into a dependency-valid task ledger, confirmed test seams, and resumable task contexts. Use when implementation needs decomposition, a wide refactor needs an expand-contract route, or an interrupted plan must be reconstructed from repository files.
---

# Turn one Change into executable tracer bullets

Planning owns decomposition and technical design; files carry it across sessions and hosts.

## Before you start

1. If model-selected, verify the live execution grant in `../ultra-change/references/execution-grant.md` — a current session-local activation or a stably verified durable work-package grant; without either, stop.
2. Read `../ultra-change/references/change-contract.md` and apply its **Active Change
   authority resolution** before reading any active `intent.md` or resolving a current
   `change_id`. This workflow requires its one valid active authority; any zero result
   or typed diagnostic stops before decomposition until the stated repair or retry
   succeeds. The intent must be `accepted`, every blocking decision resolved, its
   `## Research Disposition` exit evidence satisfied, and its `## North Star Trace`
   current before decomposition.
3. Read `.ultra/tasks.json`; select matching tasks and read each unfinished context and
   Resume Note. Preserve all historical tasks in the append-only ledger.
4. Read `CONTEXT.md` for vocabulary and the relevant `.ultra/decisions/` entries.
5. Read the active Change intent, its `trace_to` specification anchors, and the
   source, tests, consumers and recovery paths those anchors describe.

## Definition of done

- `.ultra/tasks.json` uses `$schema: "ultra-task-ledger-v2"` and is the sole
  task-status authority. Every current-Change row resolves one context whose stable
  identifiers, dependencies and trace anchors agree with the ledger.
- The owner confirmed any material posture. Seams resolve to code; technical selection
  stays model-owned unless it changes public contract, accepted risk, or material trade-off.
- Every feature task is a tracer bullet crossing the real boundaries needed to make its
  observable behavior work; a genuinely local Change does not invent extra layers.
- Every task context records resolving `FP-<n>` premises, `NS-<n>` outcomes, and
  `HC-<n>` constraints as IDs only. It explains the task-local causal contribution and
  potential constraint breach without mirroring North Star prose.
- Every Change acceptance id maps to at least one task context, and every context id
  resolves back to the active Change.
- Coverage, dependency, trace, scope and context-pressure checks have concrete results.

## Fix the planning posture

Choose `EXPAND`, `SELECTIVE`, `HOLD` or `REDUCE`; default to `SELECTIVE`. Write it under
`## Planning Posture` in active `intent.md`; there is no separate `plan.md` authority.
Keep the posture visible rather than silently drifting.
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

- **Walking Skeleton**: the earliest executable tracer bullet traverses the real
  boundaries this Change touches with real data. A genuinely one-layer Change does not
  invent extra layers.
- **Contract task**: create one before dependent implementations when a shared contract
  must remain valid while independently changed boundaries coexist.
- **Integration Checkpoint**: insert one where independently developed slices first
  compose, or where the observed coupling or recovery risk makes an intermediate
  whole-path check useful.
- A feature task that touches only one of several affected layers is merged or split
  into a tracer bullet; moving a whole layer into one task is horizontal slicing.

Record seams before tests. The model chooses the technical seam: prefer an existing,
highest observable public seam, ideally one. Ask the owner only when it changes the
public contract or another material product, risk, or recovery trade-off.

## Write the files

The ledger root records `$schema: "ultra-task-ledger-v2"` and `tasks`. Each new task
records `id`, `title`, `type`, `priority`, `status`, `dependencies`, `context_file`,
`trace_to` and `change_id`. Task ids are globally unique, and every dependency must name
a task with the same `change_id`; an archived Change must never become an implicit
prerequisite of current work. A legacy `complexity` field remains readable only as a
migration diagnostic. It is not copied into new rows and never decides splitting,
priority, scope, context, or completion.

Append new tasks or repair matching current-Change tasks in place; never replace the
ledger with only the latest graph. Every active Change receives the smallest graph that
covers its real seams, evidence, review, and recovery needs. A profile does not decide
the number of tasks or contexts.

Each context records Change Acceptance IDs, a task-local Acceptance table with `ID`,
`Criterion`, `Verification type`, and `Required evidence`, confirmed seams, layers
touched, target files, Implementation, verification commands, the hard constraints the
work could violate, a Trace containing `FP-<n>`, `NS-<n>`, and `HC-<n>` IDs, Definition
of Drift, Change Log, Completion, Task Review, and Resume Note. A v2 context does not
repeat task status. If a legacy context contains a Status or Complexity header, preserve
it as a migration diagnostic and use the ledger value. Read every file back and verify
that every row resolves its named context and every current context resolves one row.

Name a hard constraint whenever the task could plausibly breach it, not only when you
expect it to. The entry costs one line and is what makes a later breach a checkable
question instead of a judgement call; `none` is a legitimate answer for a task that
touches nothing constrained.

## Verify the plan

1. Map every Change acceptance ID to at least one task context and reject dangling
   context IDs. Map every in-scope user story or specification anchor to at least one task.
2. Walk dependencies and repair every cycle with the exact cycle chain visible.
3. Resolve every `trace_to` path and heading against a real file.
4. Resolve the Change and task `North Star Trace` `FP-<n>`/`NS-<n>`/`HC-<n>` ids
   against `.ultra/north-star.md`. A revision mismatch is a stale observation that
   returns to Change reconciliation, not a semantic verdict about alignment.
5. Surface concrete scope pressure: unresolved dependencies, duplicated ownership,
   boundaries that cannot be tested independently, evidence that cannot fit the named
   seam, or a context that no longer supports a reliable resume. File, task, line, and
   context counts do not decide plan quality.
6. Validate exact ledger fields, ids, dependency edges, paths and typed acceptance
   shapes. A validator reports structural diagnostics only; it never decides whether
   the decomposition, criterion, evidence, or plan is semantically sufficient.
Follow `../ultra-review/SKILL.md` in plan mode. Require a validated current
`SUMMARY.json`; resolve every blocking finding and refresh affected evidence before
handoff. If further repair is not justified or an authorized resource ceiling is
reached, preserve the findings and return the evidence to the responsible model or
owner. Attempt and finding counts never manufacture convergence or failure.

Report the graph, frontier, seams, warnings and first task. Recommend the next explicit
capability from the files; do not invoke it.

## When the owner decides

The owner chooses material posture, reductions, omissions, and any seam changing public
contract or material trade-off. The model owns decomposition and repairs broken paths.
## References

- `../ultra-change/references/change-contract.md` — canonical Active Change authority resolution.
- `../ultra-grilling/SKILL.md` — read before a material posture or seam question.
- `../ultra-think/SKILL.md` — read when one evidenced decision blocks decomposition.
- `../ultra-review/SKILL.md` — read after plan files pass mechanical verification.
- `../ultra-change/references/execution-grant.md` — read only for grant-activated continuation.
- `references/task-evidence-v2.md` — canonical typed task evidence and task-review contract.
