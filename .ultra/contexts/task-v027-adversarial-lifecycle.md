# Task v027-adversarial-lifecycle: Bind independent adversarial review across the lifecycle

## Context

**What**: Apply the existing six independent review lenses to Research premise,
Change intent, Plan, each task, aggregate Test, and Deliver; preserve every finding and
disagreement in a canonical Test consumer.

**Why**: Sequential self-roleplay contaminates perspectives and optional review cannot
protect an autonomous coding loop from a shared wrong premise.

**Constraints**:
- Keep exactly six permanent lenses; vary stage questions through immutable packets.
- Prefer native isolated subagents; record sequential fallback as
  `execution_mode: sequential-shared-context` with an explicit shared-context limitation.
- Context reuse alone does not force `INCOMPLETE`; use `INCOMPLETE` only when required
  evidence, worker, or artifact output is missing.
- No majority/consensus vote deletes a finding; no count mechanically proves convergence.
- Review directories remain derived and deletable only after canonical consumption.

## Implementation

**Layers touched**: stage callers, worker isolation, findings schema, Test authority,
risk disposition, derived artifact retention, and evals.

**Pattern**: immutable packet -> independent observations -> model synthesis -> owner
disposition when meaning or risk cannot be resolved by evidence.

## Planned Path Inventory

`MODIFY`:

- `.ultra-template/test-report.json`
- `skills/ultra-research/SKILL.md`
- `skills/ultra-change/SKILL.md`
- `skills/ultra-plan/SKILL.md`
- `skills/ultra-dev/SKILL.md`
- `skills/ultra-review/SKILL.md`
- `skills/ultra-review/references/adversarial-evaluation.md`
- `skills/ultra-review/references/spec.md`
- `skills/ultra-review/references/unified-schema.md`
- `skills/ultra-review/references/worker-packet.md`
- `skills/ultra-review/scripts/review_wait.py`
- `skills/ultra-test/SKILL.md`
- `skills/ultra-deliver/SKILL.md`
- `skills/ultra-delegate/SKILL.md`
- `skills/ultra-delegate/references/delegation-contract.md`
- `tests/adversarial-review-eval.test.cjs`
- `tests/review-wait.test.cjs`
- `tests/evals/adversarial-review-seeds.json`
- `tests/v026-contract.test.cjs`

`CREATE`:

- `tests/adversarial-lifecycle.test.cjs`
- `tests/fixtures/adversarial-review/divergent-findings.json`
- `tests/fixtures/adversarial-review/research-premise.json`
- `tests/fixtures/adversarial-review/same-family-collusion.json`

Any later addition, removal, or rename in this inventory is plan-critical and requires
a rebuilt Execution Packet plus owner reapproval before implementation continues.

## Public Seams

- `.ultra/reviews/<session-id>/WORKER-PACKET.json`, per-lens immutable responses, and `SUMMARY.json`.
- `SUMMARY.json.findings[]` and `SUMMARY.json.disagreements[]` unified schema.
- `.ultra/test-report.json` canonical embedded aggregate findings/disagreements.
- the six permanent lens identifiers: `spec`, `code`, `tests`, `errors`, `design`, `comments`.

## Narrow Verification

- `node --test tests/adversarial-lifecycle.test.cjs tests/adversarial-review-eval.test.cjs`
- `node --test tests/review-wait.test.cjs tests/v026-contract.test.cjs`
- `python3 skills/ultra-review/scripts/review_wait.py --help`

## Acceptance Criteria

**Change Acceptance IDs**: [`AC-01`, `AC-05`, `AC-09`]

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| A-01 | Six-stage adversarial contract and eval suites pass. | `command` | exact command, cwd, exit code, raw evidence ref, and freshness identity |
| A-02 | Provider, model, Host identity, and execution limitation are preserved. | `inspection` | packet/result sources, observed identity fields, and revision |
| A-03 | All findings and disagreements reach Test without voting loss. | `inspection` | review/Test sources, observed transport, and revision |
| A-04 | A required cross-family probe is real or the result remains `INCOMPLETE`. | `external-observation` | provider, run id, timestamp, raw evidence ref, and observation |
| A-05 | Unresolved semantic risk receives explicit owner disposition. | `owner-judgment` | durable owner statement or explicit disposition |

## Definition of Drift

- Adding a seventh permanent lens, fixed repair round, findings cap, or semantic score.
- Treating six prompts in one contaminated context as independent workers.

## Trace

**Source**: `.ultra/specs/product.md#requirement-fr-10-sequential-lifecycle-continuity`

**First principles**: [`FP-1`, `FP-2`, `FP-4`]

**Serves**: [`NS-01`]

**Causal contribution**: Preserve independent challenge, disagreement, and disposition
through every lifecycle handoff so one producing model cannot erase shared blind spots.

**Hard constraints**: [`HC-2`, `HC-4`]

**Decisions**: `docs/V027-LIFECYCLE-CLOSURE.zh-CN.md#9-全生命周期对抗性审查`

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-15 | — | Initial task contract | — | Phase 0 planning only |

## Open Questions

- _(none)_

## Resume Note

Not started. Preserve existing draft review work as unbound input; first prove its live
callers and schema gaps with failing tests.

## Completion

_Not completed._

## Task Review

- Execution Packet state/digest/limitation: `not_run`
- Review session identity and summary digest: `not_run`
- Blocking findings with resolution/disposition/evidence refresh refs: `not_run`
- Retention: retain the current strict review session until both aggregate Test and
  Deliver consume it. Premature loss requires a fresh Review and Test; never reconstruct
  the old receipt.
