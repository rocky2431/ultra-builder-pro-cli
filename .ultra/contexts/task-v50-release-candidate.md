# Task v50-release-candidate: Freeze and verify the local 5.0 release candidate

## Context

**What**: Reconcile package/version/docs and run the complete validation, pack, isolated
Doctor, artifact, and final-diff chain for one local 5.0 release candidate.

**Why**: 5.0 is complete only when the packaged artifact carries the implemented runtime
and the exact primary paths pass together; source scaffolding is not a release candidate.

**Constraints**:
- No commit, push, tag, publish, GitHub Release, real install, or provider call.
- Product snapshot files change before the final fresh Test/verification snapshot.
- Report fakes, unrun external drills, fallback Hosts, and residual risks explicitly.

## Implementation

**Layers touched**: package metadata/lock, READMEs, changelog, verification/evidence,
final WIP and Change status; no new product mechanism.

**Pattern**: the 3.0.2 deterministic release gate and dry-run package inspection.

## Planned Path Inventory

`CREATE`:

- `.ultra/evidence/v50-release-candidate/verification.log`

`MODIFY`:

- `package.json`
- `package-lock.json`
- `README.md`
- `README.zh-CN.md`
- `CHANGELOG.md`
- `.ultra/test-report.json`
- `.ultra/tasks.json`
- `.ultra/contexts/task-v50-release-candidate.md`
- `docs/wip/ultra-builder-pro-5.0.md`

## Public Seams

- `ultra-builder-pro-cli@5.0.0` local package candidate
- README/CHANGELOG versioned contract
- full verification and pack/Doctor evidence

## Narrow Verification

- changed Skill Creator validators
- `npm run verify:release`
- `npm pack --dry-run --json`
- isolated `node bin/install.js --all --global --doctor --json`
- `git diff --check`

## Acceptance Criteria

**Change Acceptance IDs**: [`AC5-12`]

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| P5-01 | Package/version/README/CHANGELOG describe the same implemented 5.0 contract and deliberate exclusions | `inspection` | final product snapshot diff |
| P5-02 | Changed Skills, full release suite, dry-run pack, isolated all-Host Doctor, and diff check pass against the final snapshot | `command` | retained exact verification log |
| P5-03 | Every fake, fallback, unrun external drill, residual risk, and not-done effect is disclosed | `inspection` | WIP/final report and verification log |

## Definition of Drift

- Publishing, tagging, installing globally, or starting a provider task.
- Calling a partial source tree a release candidate when the pack/Doctor path is unverified.
- Changing product snapshot files after final Test without rerunning the affected gate.

## Trace

**Source**: `.ultra/specs/product.md#release-evidence`

**First principles**: [`FP-1`, `FP-2`, `FP-4`, `FP-5`, `FP-7`]

**Serves**: [`NS-01`, `NS-02`, `NS-03`, `NS-05`]

**Causal contribution**: One coherent packaged snapshot and honest evidence make the
accepted 5.0 outcome independently inspectable without implying publication.

**Hard constraints**: [`HC-1`, `HC-3`, `HC-4`, `HC-6`, `HC-7`]

**Decisions**: `.ultra/decisions/2026-08-25-ultra-5-0-scope.md`

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-25 | — | Initial creation | `docs/ULTRA-BUILDER-PRO-5.0.zh-CN.md` | Accepted release-candidate boundary |

## Open Questions

- _(none; release effects remain separate owner decisions)_

## Resume Note

Why: freeze one coherent, inspectable 5.0.0 package candidate without implying an
external release. Outcome: package metadata, both READMEs, changelog, installed Skills,
generated Codex plugin, dry-run tarball, and six Host lifecycle all carry the same
implemented contract. Reality: nine changed Skills and the generated plugin validate;
647 Node and 89 Hook tests plus dependency audit pass; the 138-entry tarball and six
isolated Doctor rows pass; strict Review and current-v2 evidence have no findings.
Decision needed: none for the local candidate. Next bounded action: aggregate Test must
consume all five completed task evidence records and retained Reviews. Not done: commit,
push, tag, publication, GitHub Release, deployment, real user installation, live Host
ACP conformance, activated ZCode ACP bridge, or Windows descendant cleanup proof.

## Completion

Completed locally on 2026-08-25. Evidence:

- `.ultra/evidence/v50-release-candidate/evidence.json`
  (`ultra-task-evidence-v2`, validator classification `current-v2`, evidence digest
  `6d0a2a1566878ee4f925974abba4b5f7e02ab8803746e63c777c9b05e75d378a`);
- `.ultra/evidence/v50-release-candidate/verification.log` (version consistency,
  nine changed Skill validators, generated Codex plugin validation, 647 Node tests,
  89 Hook tests, zero configured high-severity production vulnerabilities, dry-run
  5.0.0 tarball, isolated six-Host lifecycle, cleanup, and diff check, exit 0);
- dry-run package identity `ultra-builder-pro-cli@5.0.0`, 138 entries, 362686 packed
  bytes, shasum `421f6a71027b2ebe346224f415aa43416bdb1ba4`.

## Task Review

- Execution Packet state/digest/limitation: `available` /
  `f72e93fa0e8f8a60bd34ffecaa1004ae214a467d3896b6c585518e08c569d586` / none.
- Review session identity and summary digest:
  `v50-release-candidate-initial-review-v1` /
  `1cf4e9cd6516e18d6a35f0379b62ebe7fcb2b54bea0eda07cc8fef56e54d76b8`.
- Verdict: `APPROVE`; blocking findings: none; P0/P1/P2/P3 all zero.
- Retention: retain the exact strict review session until aggregate Test and Deliver
  consume it; premature loss requires a fresh Review and Test.
