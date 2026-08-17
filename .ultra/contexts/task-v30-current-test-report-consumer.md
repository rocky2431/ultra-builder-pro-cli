# Task v30-current-test-report-consumer: Make the recorded-report consumer validate the current Change

## Context

**What**: Replace the hardcoded historical Change id in the recorded-test-report
consumer (`tests/project-artifacts.test.cjs`) with resolution of whichever
canonical Change `.ultra/test-report.json` actually names — active or archived,
never abandoned — and replace the frozen "no task stays in progress after the
r3 closeout" frontier snapshot in `tests/v026-contract.test.cjs` with the
durable invariant: r3's own legal states and evidence stay validated, no task
from an abandoned Change is re-activated, and every current `in_progress` task
belongs to the sole active Change and cross-resolves to its ordinary context
file.

**Why**: The Codex P1 disposition found one same-root delivery-correctness
defect: shipped tests encoded one historical frontier (`chg-converge`; an
empty in-progress set after the r3 closeout) as permanent current authority,
so the canonical current Test report cannot satisfy its own consumer. The
consumers must validate the report's named Change instead of any frozen
snapshot.

**Constraints**:
- Owner-authorized single repair round; both failures are one root.
- No production code, Skills, adapters, README, compatibility tombstone,
  intent, P2 text, task evidence, completion, Review, version, delivery,
  archive, install, or external effect.
- The refreshed `.ultra/test-report.json` stays an honest `passed: false`
  pre-review diagnostic; the prior aggregate Review receipt is preserved as an
  explicitly historical input whose subject predates this repair task.

## Implementation

**Layers touched**: the recorded-report consumer, the ledger-frontier
assertion in `tests/v026-contract.test.cjs`, and this task's own ledger row
and context.

**Pattern**: RED first (observed 79/80 at the hardcoded id; observed
ledger-frontier failure once this row exists), then the smallest behavior-based
change reusing the repository's existing authority helpers (`changeIntent`
exactly-one-intent resolution, ordinary-file identity, ledger
cross-resolution).

## Planned Path Inventory

`CREATE`:

- `.ultra/contexts/task-v30-current-test-report-consumer.md` (this file)
- `.ultra/evidence/v30-current-test-report-consumer/evidence.json`
- `.ultra/evidence/v30-current-test-report-consumer/verification.log`

`MODIFY`:

- `tests/project-artifacts.test.cjs`
- `tests/v026-contract.test.cjs`
- `.ultra/tasks.json` (this row)
- `.ultra/test-report.json` (owner-authorized pre-review diagnostic refresh, then the post-approval aggregate refresh)

## Narrow Verification

- `node --test tests/project-artifacts.test.cjs`
- `node --test tests/v026-contract.test.cjs`
- `npm run verify:release`
- `git diff --check`

## Acceptance Criteria

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| T5-01 | The recorded-report consumer validates whichever canonical Change `.ultra/test-report.json` names — active or archived, never abandoned — with no hardcoded Change id, keeping the all-rows task-ids binding and the exact resolved-intent digest binding | command | focused project-artifacts run green against the refreshed three-task report |
| T5-02 | The ledger-frontier test enforces the durable invariant — r3's legal states and evidence, no abandoned-Change re-activation, every in-progress task in the sole active Change with an ordinary context — instead of a frozen empty in-progress snapshot | command | focused v026-contract run green with this row in progress |
| T5-03 | The full release gate passes with the repair frontier in place | command | `npm run verify:release` exit 0 |

## Trace

**Source**: `.ultra/specs/product.md#release-evidence`

**First principles**: [`FP-1`, `FP-2`, `FP-4`]

**Serves**: [`NS-03`, `NS-05`]

**Causal contribution**: Consumers observe the current canonical Change rather
than a frozen historical frontier, so the recorded report stays real,
truthful, test evidence instead of a stale snapshot mirror.

**Hard constraints**: [`HC-4`, `HC-7`]

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-17 | — | Initial repair task contract under the Codex P1 disposition | — | Same-root single repair round; status in_progress |
| 2026-08-17 | repair | Delta review v3 returned REQUEST_CHANGES with exactly one P1 (`review-spec-001`: the next aggregate Test report must be `ultra-test-report-v2`); migrating the canonical report and its current-repository consumer to v2 with the ordered task_evidence array under this task | — | Receipt `.ultra/reviews/v30-current-test-report-consumer-delta-review-v3/SUMMARY.json` SHA-256 `f1f15e0146fe0253eef7ebf80cbfc054b941051b228391017a0dc4b7b3be1cfb` |
| 2026-08-17 | closeout | Final delta review returned APPROVE with zero findings (P0=0 P1=0 P2=0 P3=0); published the canonical `ultra-task-evidence-v2` record with its raw verification receipt, wrote Completion and the terminal Resume Note, and flipped the ledger row to `completed` | — | Receipt `.ultra/reviews/v30-current-test-report-consumer-final-delta-review/SUMMARY.json` SHA-256 `26854a96341e9b2678bea76439e83d6e48304b8ac76b4c03b96844fb69ba6dc1` |

## Open Questions

- None; the repair scope is fixed by the owner authorization.

## Resume Note

Completed 2026-08-17. The final delta review
`v30-current-test-report-consumer-final-delta-review` (SUMMARY SHA-256
`26854a96341e9b2678bea76439e83d6e48304b8ac76b4c03b96844fb69ba6dc1`, verdict
APPROVE, P0=0 P1=0 P2=0 P3=0) closed the repair chain with zero findings. The
canonical `ultra-task-evidence-v2` record and its raw verification receipt are
published under `.ultra/evidence/v30-current-test-report-consumer/`, and the
ledger row is `completed`. This is a terminal note: no further implementation
or repair work is authorized under this task. Next reader: recapture from the
repository (the ledger, this context, the evidence record, the three review
receipts, the canonical test report, and Git); this note is navigational
context only and cannot override any grant, acceptance, scope, or review
verdict. Delivery finalization, versioning, archival, and every release
effect remain separate owner decisions.

## Task Review

- Execution Grant state: the durable work-package `ubp3-r3-zcode-2026-08-17`
  expired on reviewer acceptance; this repair ran under the owner's
  session-local authorizations (P1 disposition, clarification, and terminal
  closeout), ZCode sole writer; limitation: no release effect was granted or
  performed.
- Review session identity and summary digest: terminal strict receipt
  `v30-current-test-report-consumer-final-delta-review`, SUMMARY SHA-256
  `26854a96341e9b2678bea76439e83d6e48304b8ac76b4c03b96844fb69ba6dc1`, verdict
  APPROVE binding the three-task repair frontier. Historical receipts retained
  unchanged: parent aggregate `v30-mode-b-delivery-review` (`c86848ec…`,
  APPROVE with one report-only P2) and delta
  `v30-current-test-report-consumer-delta-review-v3` (`f1f15e01…`,
  REQUEST_CHANGES whose P1 `review-spec-001` was repaired and is closed by
  this final APPROVE).
- Blocking findings: none remaining — the final APPROVE records zero findings;
  the repaired P1 `review-spec-001` is closed; the parent review's P2
  (intent Recovery wording) remains report-only backlog per owner instruction
  and is not repaired by this task.
- Retention: retain all three review sessions' bytes unchanged until
  aggregate Test and Deliver have consumed them; the canonical report binds
  the terminal receipt and marks the earlier receipts historical; this task
  starts no fresh Review.

## Completion

Completed 2026-08-17. T5-01 through T5-03 are dispositioned in
`.ultra/evidence/v30-current-test-report-consumer/evidence.json`
(`ultra-task-evidence-v2`, strict-v4 task-review branch binding the final
APPROVE receipt). The completion subject was captured independently after the
final review validated and immediately before evidence publication; the
ledger row flipped to `completed` only after the canonical record validated
and was read back. No commit, push, tag, publication, deployment,
installation, or other external effect occurred.
