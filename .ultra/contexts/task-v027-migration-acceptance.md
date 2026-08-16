# Task v027-migration-acceptance: Migrate the repository and prove the exact six-host candidate

## Context

**What**: Reconcile all canonical docs/artifacts, bind preexisting draft work honestly,
create fresh evidence and aggregate Test, pack one exact candidate, install it in
isolated and six real Host roots, and run the full recovery/interoperability drills.

**Why**: Source code and unit tests are not delivery until the packaged consumer path,
real Host installation, activation boundaries, cross-CLI continuation, and rollback are
observed at the same candidate identity.

**Constraints**:
- One exact tarball/source identity must flow through all installs and Doctor parity.
- Never reinterpret preexisting dirty changes as red-first history or passed review.
- Provider/credential limits produce explicit not-ready/INCOMPLETE evidence.
- Do not commit, push, tag, publish, release, or deploy without separate authority.

## Implementation

**Layers touched**: canonical migration, docs, package, isolated consumer, real Host
installation, provider interoperability, review/Test/Deliver, and recovery.

**Pattern**: exact candidate identity and current raw evidence at every boundary.

## Planned Path Inventory

`MODIFY`:

- `.ultra/north-star.md`
- `.ultra/specs/product.md`
- `.ultra/specs/architecture.md`
- `.ultra/specs/discovery.md`
- `.ultra/specs/research-distillate.md`
- `.ultra/tasks.json`
- `.ultra/test-report.json`
- `.ultra/changes/active/chg-v027-lifecycle-closure/intent.md`
- `.ultra/contexts/task-v027-north-star-v2.md`
- `.ultra/contexts/task-v027-task-acceptance-v2.md`
- `.ultra/contexts/task-v027-autonomy-packet.md`
- `.ultra/contexts/task-v027-adversarial-lifecycle.md`
- `.ultra/contexts/task-v027-delegation-snapshot.md`
- `.ultra/contexts/task-v027-host-adapters-hooks.md`
- `.ultra/contexts/task-v027-doctor-provenance.md`
- `.ultra/contexts/task-v027-migration-acceptance.md`
- `README.md`
- `CHANGELOG.md`
- `package.json`
- `package-lock.json`
- `docs/ARCHITECTURE.md`
- `docs/ARTIFACT-AUTHORITY.md`
- `docs/DECISIONS.md`
- `docs/PHILOSOPHY.md`
- `docs/PLUGIN-ISOLATION-CONTRACT.md`
- `docs/RUNTIME-COMPAT-MATRIX.md`
- `docs/SKILL-AUTHORING.md`
- `docs/WORKFLOW-LIFECYCLE.md`
- `docs/V027-LIFECYCLE-CLOSURE.zh-CN.md`
- `docs/evals/adversarial-review-2026-08-14.md`
- `docs/evals/zcode-automation-2026-08-14.md`

`READ-ONLY PREREQUISITES`:

- `.ultra/evidence/v027-north-star-v2/evidence.json`
- `.ultra/evidence/v027-task-acceptance-v2/evidence.json`
- `.ultra/evidence/v027-autonomy-packet/evidence.json`
- `.ultra/evidence/v027-adversarial-lifecycle/evidence.json`
- `.ultra/evidence/v027-delegation-snapshot/evidence.json`
- `.ultra/evidence/v027-host-adapters-hooks/evidence.json`
- `.ultra/evidence/v027-doctor-provenance/evidence.json`

These seven frozen records belong to their completed prerequisite tasks. This task
consumes them without recreating or overwriting them. An invalid prerequisite returns
to the owning task's explicit reopen path; after correction, rebuild the plan-critical
Execution Packet and obtain owner reapproval before this task resumes.

`CREATE`:

- `.ultra/evidence/v027-migration-acceptance/evidence.json`
- `.ultra/changes/archive/chg-v027-lifecycle-closure/delivery.md`

Derived output (not tracked):

- `.ultra/.runtime/candidates/ultra-builder-pro-cli-0.27.0.tgz`

Final lifecycle moves the active intent to
`.ultra/changes/archive/chg-v027-lifecycle-closure/intent.md` and deletes
`docs/wip/v027-lifecycle-closure.md` only after every required acceptance has been
consumed. Any later addition, removal, or rename in this inventory is plan-critical and
requires a rebuilt Execution Packet plus owner reapproval before implementation continues.

## Public Seams

- npm package identity `ultra-builder-pro-cli@0.27.0` and exact candidate tarball
  `ultra-builder-pro-cli-0.27.0.tgz` contents.
- repository README/Architecture/Lifecycle/Authority/Compatibility/Isolation contracts.
- `.ultra/test-report.json` and archived `delivery.md` final canonical evidence.
- six real-Host installs and Doctor JSON bound to the same candidate identity.
- ZCode bidirectional delegation receipts and honest per-provider readiness states.

## Narrow Verification

- `npm run verify:release`
- `npm pack --dry-run --json`
- `npm exec --yes --package ./.ultra/.runtime/candidates/ultra-builder-pro-cli-0.27.0.tgz -- ultra-builder-pro-cli --all --global`
- `npm exec --yes --package ./.ultra/.runtime/candidates/ultra-builder-pro-cli-0.27.0.tgz -- ultra-builder-pro-cli --all --global --doctor --json`
- `npm test`

## Acceptance Criteria

**Change Acceptance IDs**: [`AC-01`, `AC-02`, `AC-03`, `AC-04`, `AC-05`, `AC-06`, `AC-07`, `AC-08`, `AC-09`, `AC-10`]

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| A-01 | `npm run verify:release` succeeds on the final source. | `command` | exact command, cwd, exit code, raw evidence ref, and freshness identity |
| A-02 | `npm pack --dry-run --json` and exact candidate consumer tests succeed. | `command` | exact command, cwd, exit code, raw evidence ref, and freshness identity |
| A-03 | All changed Skills and the generated Codex plugin pass native validators. | `command` | exact command, cwd, exit code, raw evidence ref, and freshness identity |
| A-04 | Candidate install and Doctor parity succeed on all six Hosts. | `external-observation` | provider, run id, timestamp, raw evidence ref, and observation |
| A-05 | Target failure/recovery, cross-Host continuation, and bidirectional ZCode delegation are observed or precisely marked `not_ready`. | `external-observation` | provider, run id, timestamp, raw evidence ref, and observation |
| A-06 | Fresh aggregate Review, Test, and Deliver embed findings, omissions, residual risks, the effect boundary, and rollback without a fake. | `inspection` | canonical artifacts, observed embedded evidence, and revision |

## Definition of Drift

- Claiming completion from scaffolding, a stale install, a test double at the live
  acceptance boundary, or confidence language without exact current evidence.
- Performing an unauthorized release effect to make the verification look complete.

## Trace

**Source**: `.ultra/specs/product.md#release-evidence` and `NS-01`

**First principles**: [`FP-1`, `FP-2`, `FP-3`, `FP-4`, `FP-5`, `FP-6`]

**Serves**: [`NS-01`]

**Causal contribution**: Verify one exact candidate through migration, isolated install,
six native Hosts, delegation, and recovery without converting readiness into release authority.

**Hard constraints**: [`HC-1`, `HC-2`, `HC-3`, `HC-4`, `HC-5`, `HC-6`]

**Decisions**: `docs/V027-LIFECYCLE-CLOSURE.zh-CN.md#16-done-condition`

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-15 | — | Initial task contract | — | Phase 0 planning only |
| 2026-08-15 | CORRECTION | Reclassified the seven completed prerequisite-task evidence records from this task's `CREATE` inventory to read-only prerequisites | — | Final migration consumes frozen prior-task provenance; it creates only its own task evidence. Any invalid prerequisite must return through its owning task's explicit reopen flow, followed by a rebuilt Execution Packet and owner reapproval. |

## Open Questions

- _(none blocking local construction; provider readiness remains observable at drill time)_

## Resume Note

Not started. This is the final task; do not begin it before all dependencies have fresh
task review and evidence.

## Completion

_Not completed._

## Task Review

- Execution Packet state/digest/limitation: `not_run`
- Review session identity and summary digest: `not_run`
- Blocking findings with resolution/disposition/evidence refresh refs: `not_run`
- Retention: retain the current strict review session until both aggregate Test and
  Deliver consume it. Premature loss requires a fresh Review and Test; never reconstruct
  the old receipt.
