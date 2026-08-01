# Task v026-delegation-contract: Make cross-CLI delegation bounded and recoverable

> **Status**: completed | **Priority**: P0 | **Complexity**: 7

## Context

**What**: Replace prompt-only cross-CLI launch with a digest-bound, isolated, terminal
delegation contract.

**Why**: A worker must not widen owner authority, mutate the parent checkout, report
false success, or leave the parent unable to distinguish running, cancelled, timed out,
blocked, and failed work.

**Constraints**:
- Use a clean registered Git worktree and strict relative writable roots.
- Accept no external-effect grant.
- Validate actual changed paths and immutable input digests after execution.

## Implementation

**Target Files**: `bin/delegate.cjs`, `bin/delegate-worker.cjs`,
`adapters/_shared/host-profile.cjs`, `skills/ultra-delegate/`, and delegation tests.

**Layers touched**: public CLI, process lifecycle, host argv, Git worktree, receipt, and
Skill recovery.

**Pattern**: immutable instruction, permission, and output-schema files; atomic lock;
native structured final output; mechanical Git verification; atomic terminal receipt.

## Acceptance Criteria

- [x] Non-worktrees, dirty worktrees, path escapes, unknown permission keys, and external effects fail before launch.
- [x] Packet mutation, undeclared writes, false `finished`, and nonzero exit fail closed.
- [x] Duplicate run, timeout, status, and cancellation all reach inspectable terminal state.
- [x] Success returns exact input/output digests and the actual changed path set.

## Verification

- `node --test tests/delegate.test.cjs`
- Eight delegation cases passed in the focused suite on 2026-08-01; the final release gate repeats them.

## Definition of Drift

- Treating a prompt promise as permission enforcement, publishing an unvalidated model
  result, or granting authority outside the isolated worktree.

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-01 | CORRECTION | Added strict permission, process, diff, and receipt contracts | architecture | Close false-success and unsafe-recovery gaps |

## Completion

- **Completed**: 2026-08-01
- **Commit**: Uncommitted working tree at base HEAD `3f99189`; commit requires owner authorization.
- **Summary**: Delegation has bounded launch, observed writes, timeout/cancel, terminal receipt, stale-lock repair, and diff-preserving recovery when a terminal result is lost.

## Resume Note

Completed locally; authenticated provider execution is a separately authorized external effect.
