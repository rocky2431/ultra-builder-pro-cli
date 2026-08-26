# Task v50-public-release: Publish and verify Ultra Builder Pro 5.0

## Context

**What**: Reconcile and push one green release-source commit, tag that exact source,
publish it through the existing trusted workflow, and verify npm and GitHub Release
resolve to the same 5.0 package and commit. After this task publishes its own strict
Review and evidence, aggregate Test consumes all nine task records and explicit Deliver
finalization writes delivery metadata, removes the completed WIP, and archives the Change.

**Why**: Local tests, commits, tags, registries, and releases are distinct effects. The
Owner's accepted outcome is not complete until public consumers can resolve the verified
version and the repository no longer claims an unfinished Change.

**Constraints**:
- Tag only a green `origin/main` release-source commit with a current pre-release
  checkpoint report; the terminal nine-task Test follows the release observation that
  supplies this task's own evidence.
- Use the existing trusted-publishing workflow; do not add or expose an npm token.
- Never force-push or unpublish; failed immutable publication is repaired in a new version.
- This CLI repository has no service deployment target beyond npm/GitHub delivery.
- Keep task Review/evidence, aggregate Test, and Deliver finalization in causal order:
  this task cannot require its own final evidence, and Test cannot require an archive
  that only Deliver is authorized to create after consuming Test.

## Planned Path Inventory

`CREATE`:

- `.ultra/evidence/v50-public-release/verification.log`
- `.ultra/evidence/v50-public-release/release-receipt.json`

`MODIFY`:

- `.ultra/tasks.json`
- `.ultra/test-report.json`
- `CHANGELOG.md`
- release documentation

## Acceptance Criteria

**Change Acceptance IDs**: [`AC5-17`, `AC5-18`]

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| PR-01 | Every predecessor task has current-v2 evidence with zero blocking Review findings, and the pre-release checkpoint binds the exact release-source candidate without claiming this task's future receipt | `command` | task validators, retained Reviews, and `.ultra/test-report.json` |
| PR-02 | Authorized Conventional Commits are pushed to `origin/main` without rewriting history and required CI is green | `external-observation` | local/remote commit ids, push receipt, and check-suite ids |
| PR-03 | Annotated tag `v5.0.0` resolves to the green release commit and triggers the existing trusted npm release workflow | `external-observation` | remote tag and Release workflow run |
| PR-04 | npm metadata for `ultra-builder-pro-cli@5.0.0` and the GitHub Release identify the same version/source and published package integrity | `external-observation` | npm registry JSON, package integrity, GitHub Release JSON, and tag commit |
| PR-05 | The release receipt records every deliberate exclusion and repository deployment-surface inspection without claiming a nonexistent service deployment; aggregate Test and explicit Deliver remain the reachable local closeout | `inspection` | release receipt, workflow/package inspection, and documented Test/Deliver handoff |

## Definition of Drift

- Tagging before the pushed commit and required CI are green.
- Treating a commit, npm publish, or GitHub Release as proof of the others.
- Treating task completion as aggregate Test or Deliver finalization, or leaving the
  active Change/WIP open after those later closeout routes finish.
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
| 2026-08-26 | lifecycle repair | Move aggregate nine-task Test and Change/WIP archive after this task's release receipt | Task acceptance and planned paths | A task cannot require its own future evidence, and Deliver cannot archive before Test consumes all completed tasks |

## Open Questions

- _(none; npm and GitHub Release are the repository's only discovered deployment surfaces)_

## Resume Note

Why: turn the green local/live candidate into one verifiable public release. Outcome:
`origin/main`, `v5.0.0`, npm 5.0.0, and GitHub Release agree. Reality: the Windows gate
is complete; `origin/main` commit `c39fbcd17993` has a successful three-OS CI run
`32936156375`, while tag/npm/GitHub Release remain absent. Decision needed: none. Next
bounded action: reconcile release documentation and publish the green release-source
commit. Not done: tag, npm publish, GitHub Release, published-package install, strict
task Review/evidence, terminal nine-task Test, delivery record, WIP deletion, or archive.

## Task Review

- Execution Grant state/limitation: `active`; predecessor gates are complete, but no tag,
  registry version, or release outcome is claimed before exact external observation.
- Review session and Summary digest: pending; no strict Review has been published.
- Blocking findings: not yet classified; the task is `in_progress`.
- Retention: retain the final CI, tag, npm provenance, and GitHub Release receipts through
  aggregate Test and Deliver.
