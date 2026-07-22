# Research synthesis

Use for workflow step `99-synthesis`.

## Objective

Verify that research artifacts form one traceable, planning-ready baseline without
creating a second condensed authority.

## Validate

- Every consequential claim is marked `Observed`, `Verified`, `Decided`, or `Unknown`.
- Product behavior traces from problem or constraint through actor, scenario,
  requirement, acceptance, architecture, quality, and delivery evidence.
- Current behavior and proposed behavior are not silently merged.
- Scope reflects owner decisions and never an inferred MVP or reduction.
- Documentation conflicts, known failures, and load-bearing unknowns are in the gap
  ledger with owners or explicit decisions.
- Verification commands and observed results are current.

## Record

Write `research-distillate.md` as a navigation and traceability artifact containing
baseline ids, source document anchors, accepted decisions, blockers, gaps, verification
evidence, and the exact planning entry. Do not duplicate the specifications' prose.

Write the immutable `99-synthesis` step report, then complete the step with that report,
all three baseline specification paths, the distillate path, and the evidence used for
the synthesis. Read the completed workflow back before baseline convergence.

## Semantic record

Use kind `synthesis_trace`. Record one verified chain through `problem_id`,
`scenario_id`, `requirement_ids`, `architecture_path_ids`, and `verification_refs`.
Every referenced id must exist in an earlier selected step.
