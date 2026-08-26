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

- `.gitattributes`
- `.ultra/evidence/v50-windows-release-gate/verification.log`
- `.ultra/evidence/v50-windows-release-gate/github-actions-receipt.json`

`MODIFY`:

- `skills/ultra-delegate/scripts/agent-execution-driver.cjs`
- `skills/ultra-delegate/scripts/delegate.cjs`
- `tests/acp-driver.test.cjs`
- `tests/delegate.test.cjs`
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
| 2026-08-26 | implementation repair | Normalize Windows Git path identity and force LF for the digest-bound bridge patch | Planned Path Inventory and tests | First real Windows run exposed path spelling and checkout EOL drift after both descendant tests passed |
| 2026-08-26 | implementation repair | Compare canonical worktree directories by device and file ID before path fallback | Tests and implementation | Second Windows run proved normalized strings still diverge across Windows long, short, or namespace aliases |

## Open Questions

- _(none)_

## Resume Note

Why: make cancellation and release verification real on Windows. Outcome: the pushed
release commit passes all three operating-system jobs and kills a real descendant.
Reality: runs 32933965899 and 32934557386 proved both Unix release gates and both Windows
descendant-kill tests; the second run also proved LF patch stability, then exposed a
remaining long/short-path identity alias. Run 32935138736 on commit `19ab5bed6fef` then
passed Ubuntu and macOS release gates at 661 Node tests, 89 Hook tests, and zero audit
vulnerabilities, plus Windows 27/27 including both real descendant-kill cases. Decision
needed: none. Strict Review session `v50-windows-release-gate-initial-review-v1`
returned `APPROVE` with both axes `PASS` and zero findings. Next bounded action: publish
the final current-v2 evidence and advance to the public-release task. Not done: public
tag, npm publication, GitHub Release, or release-consumer verification.

## Task Review

- Execution Grant state/limitation: `active`; the exact pushed commit passed the real
  Windows runner and both same-commit Unix release gates.
- Review session and Summary digest:
  `v50-windows-release-gate-initial-review-v1` /
  `a8f4545c11e323c0a2b5b8ad1b36e78c7a30e6fd592490f652bd646142a4e615`.
- Blocking findings: none; strict Review returned `APPROVE`, both axes `PASS`, and zero
  P0, P1, P2, or P3 findings.
- Retention: retain `WORKER-PACKET.json`, `ADMISSION.json`, all five selected specialist
  artifacts, `SUMMARY.json`, `github-actions-receipt.json`, and `verification.log`
  through aggregate Test and Deliver.
