# Task v027-autonomy-packet: Implement two-phase autonomy and Execution Packet v1

## Context

**What**: Implement plan-only preparation, stable packet projection/fingerprint,
readable approval delta, same-session activation, invalidation, and bounded automatic
route selection across the accepted continuable workflows.

**Why**: The owner needs one reviewable approval for a stable plan without granting a
daemon or future session open-ended authority.

**Constraints**:
- Semantic approval record never self-activates; fresh sessions require a live utterance.
- Plan-critical fields invalidate; status, Resume, Completion, evidence, and counters do not.
- No public Skill silently invokes another, no stage marker, no workflow state machine.
- Delete or connect dead autonomy configuration instead of adding another mirror.

## Implementation

**Layers touched**: owner approval artifact, deterministic projection, Skill route policy,
session activation, recovery diagnostics, and compatibility docs.

**Pattern**: file authority plus ephemeral native Host loop activation.

## Planned Path Inventory

`MODIFY`:

- `skills/ultra-change/SKILL.md`
- `skills/ultra-change/references/autonomy-envelope.md`
- `skills/ultra-change/references/change-contract.md`
- `skills/ultra-research/SKILL.md`
- `skills/ultra-plan/SKILL.md`
- `skills/ultra-status/SKILL.md`
- `skills/ultra-dev/SKILL.md`
- `skills/ultra-test/SKILL.md`
- `skills/ultra-deliver/SKILL.md`
- `adapters/_shared/runtime-assets.cjs`
- `adapters/_shared/tests/runtime-assets.test.cjs`
- `tests/v026-contract.test.cjs`

`CREATE`:

- `skills/ultra-plan/references/execution-packet-v1.md`
- `skills/ultra-plan/scripts/execution_packet.cjs`
- `tests/execution-packet.test.cjs`

Derived runtime output (not tracked):

- `.ultra/.runtime/execution-packets/<change-id>.json`

Any later addition, removal, or rename in this inventory or any Public Seam below is
plan-critical and requires a rebuilt Execution Packet plus owner reapproval.

## Public Seams

- `.ultra/.runtime/execution-packets/<change-id>.json` with `$schema: ultra-execution-packet-v1`.
- active intent `## Execution Approval` as the sole durable semantic approval record.
- `AUTONOMY_CONTINUABLE_SKILLS = Research | Plan | Dev | Test | Deliver` routing contract.
- `ultra-status` approval/parity output and `activation: active | inactive | unknown` observation.
- `node skills/ultra-plan/scripts/execution_packet.cjs materialize|inspect --change <change-id>`.

## Narrow Verification

- `node --test tests/execution-packet.test.cjs`
- `node --test adapters/_shared/tests/runtime-assets.test.cjs tests/v026-contract.test.cjs`
- `node skills/ultra-plan/scripts/execution_packet.cjs inspect --change chg-v027-lifecycle-closure`

## Acceptance Criteria

**Change Acceptance IDs**: [`AC-02`, `AC-03`, `AC-09`]

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| A-01 | Stable projection and plan-critical invalidation fixtures pass. | `command` | exact command, cwd, exit code, raw evidence ref, and freshness identity |
| A-02 | Normal status and evidence updates preserve the approved fingerprint. | `command` | exact command, cwd, exit code, raw evidence ref, and freshness identity |
| A-03 | Fresh session and compaction never infer live activation from files. | `inspection` | activation consumers, observed behavior, and revision |
| A-04 | Exact fingerprint and scope approval remain owner-only. | `owner-judgment` | durable owner statement or explicit disposition |
| A-05 | Every stop has resume, reapprove, cancel, or abandon guidance. | `inspection` | recovery sources, observed exit paths, and revision |

## Definition of Drift

- Persisting semantic workflow position, permanently activating from a file, or hashing
  volatile whole documents.
- Allowing automation to cross an owner gate or external-effect boundary.

## Trace

**Source**: `.ultra/specs/architecture.md#bounded-automatic-coding`

**First principles**: [`FP-1`, `FP-2`, `FP-3`]

**Serves**: [`NS-01`]

**Causal contribution**: Project the accepted plan into one stable, inspectable packet
so a live owner grant can bound native execution without transferring authority.

**Hard constraints**: [`HC-2`, `HC-3`, `HC-4`]

**Decisions**: `docs/V027-LIFECYCLE-CLOSURE.zh-CN.md#7-两阶段-autonomy-与-execution-packet-v1`

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-15 | — | Initial task contract | — | Phase 0 planning only |

## Open Questions

- _(none; this bootstrap session must not fabricate a historical packet fingerprint)_

## Resume Note

Not started. Begin with failing projection, activation, and invalidation tests.

## Completion

_Not completed._

## Task Review

- Execution Packet state/digest/limitation: `not_run`
- Review session identity and summary digest: `not_run`
- Blocking findings with resolution/disposition/evidence refresh refs: `not_run`
- Retention: retain the current strict review session until both aggregate Test and
  Deliver consume it. Premature loss requires a fresh Review and Test; never reconstruct
  the old receipt.
