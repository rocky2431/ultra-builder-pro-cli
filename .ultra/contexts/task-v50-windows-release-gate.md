# Task v50-windows-release-gate: Prove Windows descendant cleanup and three-OS CI

## Context

**What**: Replace Windows direct-child termination with a real descendant-tree cleanup
path, repair the stale CI script list, add `windows-latest`, and prove the exact pushed
candidate with full Unix release gates plus the real Windows ACP boundary before release.

**Why**: POSIX process-group tests do not establish Windows cleanup, and the current CI
workflow calls removed npm scripts and therefore cannot protect `main` or a release tag.

**Constraints**:
- Use Windows-native `taskkill /T` with a direct-child fallback; no new runtime dependency.
- Test a real grandchild PID on `windows-latest`, not a mocked green path only. The
  POSIX-only FIFO/symlink corpus remains in the full Ubuntu/macOS release gate.
- Do not create `v5.0.0` until the pushed release commit and three-OS matrix are green.

## Planned Path Inventory

`CREATE`:

- `.ultra/evidence/v50-windows-release-gate/verification.log`
- `.ultra/evidence/v50-windows-release-gate/github-actions-receipt.json`

`MODIFY`:

- `skills/ultra-delegate/scripts/agent-execution-driver.cjs`
- `tests/acp-driver.test.cjs`
- `.github/workflows/ci.yml`

## Acceptance Criteria

**Change Acceptance IDs**: [`AC5-16`, `AC5-17`]

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| WG-01 | Windows termination invokes descendant-tree cleanup and retains a direct-child fallback for a missing/failing system command | `command` | unit RED/GREEN test with injected platform/runner |
| WG-02 | A cancel and timeout each terminate the fake ACP agent's real grandchild on `windows-latest` | `external-observation` | Windows runner test names/output and run id |
| WG-03 | CI uses existing package scripts; the full release gate passes on `ubuntu-latest` and `macos-latest`, while the real ACP driver/conformance suite passes on `windows-latest` for the same pushed commit | `external-observation` | GitHub Actions check-suite receipt and exact commit |

## Definition of Drift

- Declaring Windows support from a mocked platform branch alone.
- Letting CI omit Hook tests, release audit, or the exact release commit.
- Tagging while a required matrix job is pending, skipped, cancelled, or failed.

## Trace

**Source**: `.ultra/decisions/2026-08-26-ultra-5-0-live-activation.md`

**First principles**: [`FP-4`, `FP-5`, `FP-6`]

**Serves**: [`NS-04`, `NS-05`]

**Causal contribution**: Cross-platform terminal cleanup keeps cancellation recoverable
and prevents a published Windows installation from leaving delegated work running.

**Hard constraints**: [`HC-2`, `HC-5`, `HC-6`]

**Decisions**: `.ultra/decisions/2026-08-26-ultra-5-0-live-activation.md`

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-26 | boundary expansion | Initial Windows release-gate task | Change intent | Owner requested Windows cleanup proof |

## Open Questions

- _(none)_

## Resume Note

Why: make cancellation and release verification real on Windows. Outcome: the pushed
release commit passes all three operating-system jobs and kills a real descendant.
Reality: the implementation now uses `taskkill.exe /T /F` with direct-child fallback;
the focused ACP suite passes 27/27 locally, YAML parses, and the full local release gate
passes 659 Node tests, 89 Hook tests, and npm audit. Decision needed: none. Next bounded
action: commit and push the exact candidate, then retain all three GitHub Actions job
results for that commit. Not done: remote Windows observation, strict task Review, or
final evidence projection.

## Task Review

- Execution Grant state/limitation: `active`; local implementation is provisional until
  the exact pushed commit passes the real Windows runner.
- Review session and Summary digest: pending; no strict Review has been published.
- Blocking findings: none classified locally; the task remains `in_progress` pending
  the external Windows and same-commit Unix observations.
- Retention: retain the Windows workflow run receipt and the eventual strict Review
  through aggregate Test and Deliver.
