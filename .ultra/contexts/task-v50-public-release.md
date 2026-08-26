# Task v50-public-release: Publish and verify Ultra Builder Pro 5.0

## Context

**What**: Reconcile the expanded Change, retain current task Review/Test evidence, push
the closeout commit, tag the green source, and verify npm and GitHub Release resolve to
the same 5.0 package and commit.

**Why**: Local tests, commits, tags, registries, and releases are distinct effects. The
Owner's accepted outcome is not complete until public consumers can resolve the verified
version and the repository no longer claims an unfinished Change.

**Constraints**:
- Tag only a green `origin/main` commit with current aggregate Test evidence.
- Use the existing trusted-publishing workflow; do not add or expose an npm token.
- Never force-push or unpublish; failed immutable publication is repaired in a new version.
- This CLI repository has no service deployment target beyond npm/GitHub delivery.

## Planned Path Inventory

`CREATE`:

- `.ultra/evidence/v50-public-release/verification.log`
- `.ultra/evidence/v50-public-release/release-receipt.json`

`MOVE`:

- `.ultra/changes/active/chg-ultra-5-0/` to `.ultra/changes/archive/chg-ultra-5-0/`

`MODIFY`:

- `.ultra/tasks.json`
- `.ultra/test-report.json`
- `CHANGELOG.md`
- release documentation and WIP closeout

## Acceptance Criteria

**Change Acceptance IDs**: [`AC5-17`, `AC5-18`]

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| PR-01 | Every expanded task has current-v2 evidence, blocking Review findings are zero, and aggregate Test binds the exact final product worktree | `command` | task validators, retained Reviews, and `.ultra/test-report.json` |
| PR-02 | Authorized Conventional Commits are pushed to `origin/main` without rewriting history and required CI is green | `external-observation` | local/remote commit ids, push receipt, and check-suite ids |
| PR-03 | Annotated tag `v5.0.0` resolves to the green release commit and triggers the existing trusted npm release workflow | `external-observation` | remote tag and Release workflow run |
| PR-04 | npm metadata for `ultra-builder-pro-cli@5.0.0` and the GitHub Release identify the same version/source and published package integrity | `external-observation` | npm registry JSON, package integrity, GitHub Release JSON, and tag commit |
| PR-05 | The active Change and WIP close with all deliberate exclusions recorded; no nonexistent service deployment is claimed | `inspection` | archived Change, deleted WIP, repository deployment-surface inspection, and release receipt |

## Definition of Drift

- Tagging before the pushed commit and required CI are green.
- Treating a commit, npm publish, or GitHub Release as proof of the others.
- Keeping an active Change/WIP after verified delivery or deleting residual-risk evidence.
- Inventing a hosting deployment for a package-only repository.

## Trace

**Source**: `.ultra/decisions/2026-08-26-ultra-5-0-live-activation.md`

**First principles**: [`FP-1`, `FP-3`, `FP-4`]

**Serves**: [`NS-01`, `NS-03`, `NS-05`]

**Causal contribution**: A green, provenance-bound public package lets the Owner and
future Hosts recover the exact completed workflow and transport from Git/npm.

**Hard constraints**: [`HC-1`, `HC-3`, `HC-4`, `HC-8`]

**Decisions**: `.ultra/decisions/2026-08-26-ultra-5-0-live-activation.md`

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-26 | boundary expansion | Initial public-release task | Change intent | Owner authorized all release effects |

## Open Questions

- _(none; npm and GitHub Release are the repository's only discovered deployment surfaces)_

## Resume Note

Why: turn the green local/live candidate into one verifiable public release. Outcome:
`origin/main`, `v5.0.0`, npm 5.0.0, and GitHub Release agree. Reality: local recovery
commit `8be6f6d` exists; remote main/tag/npm remain unchanged. Decision needed: none.
Next bounded action: start only after the Windows release gate passes. Not done: final
Review/Test, closeout commit, push, tag, npm publish, GitHub Release, or archive.

## Task Review

- Execution Grant state/limitation: `active`; publication remains dependency-blocked and
  no tag, registry version, or release outcome is claimed.
- Review session and Summary digest: pending; no strict Review has been published.
- Blocking findings: not yet classified; the task remains `pending`.
- Retention: retain the final CI, tag, npm provenance, and GitHub Release receipts through
  aggregate Test and Deliver.
