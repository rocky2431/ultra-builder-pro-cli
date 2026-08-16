# 99 Synthesis: North Star v2 r1

## Observed

- All five selected lens reports separate observations, verified repository facts,
  accepted decisions, model inference, and unknown delivery evidence.
- The v2 artifact defines six `FP-*`, one `NS-*`, six `HC-*`, and six resolving causal
  rows without assigning a truth score.

## Verified

- `skills/ultra-research/scripts/validate_north_star.cjs` resolves the exact decision
  anchor, content SHA-256, Git blob digest, byte-identical accepted snapshot, fields,
  IDs, and causal references.
- The promoted relations exist in `.ultra/specs/discovery.md#north-star-v2-problem-relations`,
  `.ultra/specs/product.md#north-star-v2-outcome-relations`, and
  `.ultra/specs/architecture.md#north-star-v2-architecture-relations`.

## Decided

- Promote `north-star-v2-r1` using
  `.ultra/decisions/2026-08-15-v027-north-star-r1.md#owner-record`; preserve legacy and
  preexisting evidence and leave Execution Packet v1 pending for its own task.

## Inference

- The selected evidence is sufficient for this construction boundary because every
  unsettled implementation claim has a named downstream acceptance task and revisit
  trigger. It is not evidence that those later tasks passed.

## Unknown

- Adversarial incremental value, exact six-Host readiness, snapshot delegation, Doctor
  parity, and candidate acceptance remain pending tasks.
- No external web claim was needed or invented in this bounded run.

## Sources

- `brief.md`
- `00-problem-validation.md`
- `04-product-strategy.md`
- `05-assumptions-validation.md`
- `22-success-metrics.md`
- `41-quality-risks.md`
- `.ultra/specs/discovery.md`
- `.ultra/specs/product.md`
- `.ultra/specs/architecture.md`
- `.ultra/specs/research-distillate.md`
- `.ultra/decisions/2026-08-15-v027-north-star-r1.md#owner-record`

## Trace

- north_star_effect: supports
- north_star_claim: resolving problem, scenario, requirement, architecture, and verification references support the accepted construction boundary but not later delivery claims
- problem_id: `PROB-V027-01`
- scenario_id: `SCN-V027-01`
- requirement_ids: `FR-02`, `FR-04`, `FR-05`, `FR-08`, `FR-09`, `FR-10`
- architecture_path_ids: `ARCH-V027-01`, `ARCH-V027-02`
- verification_refs: `tests/north-star-v2.test.cjs`, `hooks/tests/test_v026_hooks.py`, `tests/project-artifacts.test.cjs`
- adversarial_challenge: every structural output can pass while live continuation or owner value fails, so named falsifiers and later live acceptance remain mandatory
