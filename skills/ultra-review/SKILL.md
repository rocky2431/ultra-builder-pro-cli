---
name: ultra-review
description: Review one task diff or aggregate Change through six independent lenses, synthesize file-backed findings, and perform evidence-justified refactoring. Use when another skill needs task-level or delivery-level review without loading worker investigation into the main context.
---

# Review through six lenses without polluting the main context

The parent owns scope and synthesis. Lens workers are read-only sensors. Refactoring
happens here, after several slices make a useful structure visible, not inside TDD.

## Before you start

1. Read `.ultra/tasks.json`, the scoped task's `context_file` and `## Resume Note`.
2. Read `CONTEXT.md`, relevant `.ultra/decisions/`, acceptance, evidence and exact diff.
3. Create `.ultra/reviews/<session>/` and one immutable packet naming HEAD, scope,
   output path, acceptance and public seams. Follow `references/worker-packet.md`,
   then compute the SHA-256 of the exact packet bytes and do not edit it.

## Definition of done

- The complete six-worker roster is dispositioned; every selected lens artifact and one
  summary exist, while skipped or failed lenses are explicit.
- Each selected lens reports at most 12 findings, each evidence-backed. Scores never decide
  whether an observable defect is included.
- Findings preserve independent `spec_fidelity` and `engineering_standards` axes.
- Refactors are justified by observed duplication or coupling and all affected checks rerun.

## Run the lenses

Use the host's native bounded subagents, in the background where available; otherwise
run them sequentially. **All six lenses are selected by default.** Skipping one requires
a stated reason recorded in `SUMMARY.json` — "its evidence cannot change the verdict"
is a judgement made before seeing the evidence, and left as a default it becomes a way
to run less work rather than a considered choice. Give each the packet path and digest,
`references/unified-schema.md`, and exactly one lens:

- `references/code.md`
- `references/design.md`
- `references/errors.md`
- `references/tests.md`
- `references/spec.md`
- `references/comments.md`

Apply **Zero Context Pollution**: start the workers, immediately run
`scripts/review_wait.py <session> agents --packet-digest <digest> <selected-stems>`,
then read only the stable JSON files it returns. Validate `SUMMARY.json` with
`scripts/review_wait.py <session> summary --packet-digest <digest>`. Do not read
intermediate worker output or treat background notifications as completion. The sole
information path is wait script to JSON artifact. These guards prevent partial results
from becoming a semantic verdict.

## Synthesize, repair and recheck

Preserve findings unchanged in `SUMMARY.json`; group duplicates by root cause only in
the human summary. Fix accepted P0/P1 issues and evidence-backed refactors, then rerun
the affected lenses against the delta.

Stop when P0 + P1 does not decrease between rounds. Write a stuck report separating an
over-tight constraint from an insufficient fix and give the owner three concrete paths.
If one file fails three consecutive repairs, treat it as an architecture concern. If
three or more files do so, write `UNRESOLVED.md` with `ARCHITECTURAL_CONCERN` and stop.

Report both axes, exact scope, checks, residual findings and any refactor performed.

## Recheck across model families

Six lenses are six angles from one model family, so they share blind spots: what all
six miss, a seventh angle from the same family misses too. Independence comes from a
different model, not from another lens.

Delegate a recheck through `../ultra-delegate/SKILL.md` when the Change profile is
`major`, or when the diff touches authorization, payments, personal data or
migrations. For a `quick` profile, skip it and say so in the report.

- Send the aggregated `SUMMARY.json` and the diff, **not** the raw lens artifacts. The
  worker should form its own reading rather than grade this one.
- Ask two things: which findings the evidence does not actually support, and what this
  diff gets wrong that no finding mentions. The second question is why the recheck is
  worth its cost.
- A worker finding no local lens raised is a candidate, not a verdict. Verify it
  against the source exactly as a lens finding is verified, and record its origin.
- Disagreement is information, not a tie to break. `ultra-delegate` already forbids
  turning a vote or a score into truth; record both readings with their evidence.

## When the owner decides

The owner chooses risk acceptance, a scope reduction, or which stuck path to take.
Workers never edit source, task state or another lens artifact.

## References

- `references/unified-schema.md` — JSON contract shared by all lenses.
- `references/worker-packet.md` — exact immutable input packet and digest procedure.
- `references/review-modes.md` — choose task, Change, full, or delta scope.
- `../ultra-delegate/SKILL.md` — read before a cross-family recheck on a major or
  security-relevant Change.
- `../ultra-think/references/autonomy-boundary.md` — read before a fix reduces intent.
