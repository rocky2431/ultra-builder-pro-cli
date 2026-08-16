# Task v027-delegation-snapshot: Implement Delegation Snapshot v1 and exact check brokerage

## Context

**What**: Replace clean-HEAD-only delegation with a binary-safe dirty snapshot, explicit
untracked allowlist, secret/symlink exclusions, TOCTOU checks, prepared baseline diff,
Permission/Receipt v2, and shell-free exact check broker.

**Why**: Real coding sessions are dirty; rejecting them prevents useful delegation,
while copying them naively leaks secrets and makes returned diffs unverifiable.

**Constraints**:
- Default-deny untracked/ignored/secret/outside-root symlink input; use `lstat`.
- Hash before/copy/after and return terminal `snapshot_raced` on change.
- Worker cannot write `.ultra`, auto-merge, commit, push, publish, deploy, or install.
- Provider data/spend remains an owner-authorized external effect.

## Implementation

**Layers touched**: source capture, isolation, permission broker, Host invocation,
receipt/result validation, integration recovery, and documentation.

**Pattern**: immutable manifest and prepared tree; every result is digest-bound.

## Planned Path Inventory

`MODIFY`:

- `bin/delegate.cjs`
- `bin/delegate-worker.cjs`
- `adapters/_shared/host-profile.cjs`
- `adapters/_shared/delegate-profiles/kimi-read-only.md`
- `adapters/_shared/delegate-profiles/kimi-write.md`
- `skills/ultra-delegate/SKILL.md`
- `skills/ultra-delegate/references/delegation-contract.md`
- `skills/ultra-delegate/scripts/delegate_wait.py`
- `tests/delegate.test.cjs`
- `tests/evals/read-only-permission.json`
- `tests/v026-contract.test.cjs`

`CREATE`:

- `bin/delegate-snapshot.cjs`
- `bin/delegate-check-broker.cjs`
- `tests/delegate-snapshot.test.cjs`
- `tests/delegate-check-broker.test.cjs`

Any later addition, removal, or rename in this inventory is plan-critical and requires
a rebuilt Execution Packet plus owner reapproval before implementation continues.

## Public Seams

- `ubp delegate run --to <host> --instruction <path> --permission <path> --worktree <path>`.
- `ubp delegate status --delegation <path>` and `ubp delegate cancel --delegation <path>`.
- `ultra-delegation-permission-v2`, `ultra-delegation-receipt-v2`, and `ultra-delegation-result-v2` JSON.
- snapshot manifest/digest, prepared-tree digest, worker-delta digest, and exact-check receipts.
- exact-check broker request fields: `call_id`, `executable`, `argv`, and `cwd`.

## Narrow Verification

- `node --test tests/delegate-snapshot.test.cjs tests/delegate-check-broker.test.cjs`
- `node --test tests/delegate.test.cjs`
- `node --test tests/v026-contract.test.cjs`

## Acceptance Criteria

**Change Acceptance IDs**: [`AC-06`, `AC-07`, `AC-09`]

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| A-01 | Dirty tracked, binary, and allowed-untracked positive cases pass. | `command` | exact command, cwd, exit code, raw evidence ref, and freshness identity |
| A-02 | Secret, ignored, symlink, size, race, shell, and scope negative cases fail closed. | `command` | exact command, cwd, exit code, raw evidence ref, and freshness identity |
| A-03 | Worker delta is relative to the prepared snapshot and integration rechecks the primary digest. | `command` | exact command, cwd, exit code, raw evidence ref, and freshness identity |
| A-04 | Supported Host profiles return schema-bound terminal results. | `external-observation` | provider, run id, timestamp, raw evidence ref, and observation |
| A-05 | Every failure supports retry, cancel, or abandon and never auto-merges. | `inspection` | recovery sources, observed exit paths, and revision |

## Definition of Drift

- Copying the whole worktree, following symlinks, invoking a shell, trusting model-reported
  checks, or granting worker external effects.

## Trace

**Source**: `.ultra/specs/architecture.md#delegation-boundary`

**First principles**: [`FP-1`, `FP-3`, `FP-6`]

**Serves**: [`NS-01`]

**Causal contribution**: Bind delegated inputs, permissions, checks, and returned deltas
to one recoverable snapshot so a worker gains no authority from a dirty checkout.

**Hard constraints**: [`HC-3`, `HC-5`, `HC-6`]

**Decisions**: `docs/V027-LIFECYCLE-CLOSURE.zh-CN.md#10-delegation-snapshot-v1-与-delegation-v2`

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-15 | — | Initial task contract | — | Phase 0 planning only |

## Open Questions

- _(none; ZCode flags must be proven against the installed binary, not inferred)_

## Resume Note

Not started. Begin with failing secret, symlink, race, binary diff, and exact-check tests.

## Completion

_Not completed._

## Task Review

- Execution Packet state/digest/limitation: `not_run`
- Review session identity and summary digest: `not_run`
- Blocking findings with resolution/disposition/evidence refresh refs: `not_run`
- Retention: retain the current strict review session until both aggregate Test and
  Deliver consume it. Premature loss requires a fresh Review and Test; never reconstruct
  the old receipt.
