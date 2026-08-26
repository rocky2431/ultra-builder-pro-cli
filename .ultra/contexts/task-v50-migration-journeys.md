# Task v50-migration-journeys: Prove 3.x migration and real owner journeys

## Context

**What**: Extend adapters/Doctor and journey fixtures so 3.x authority stays byte-identical,
Route/driver health is visible, degraded diagnosis remains reachable, and the accepted
greenfield, daily, revision, recovery, early-value, delegation, and fallback paths run.

**Why**: Structural Skill and driver tests do not prove that the Owner can actually
understand or resume the whole product path.

**Constraints**:
- No migration rewrite of accepted semantic artifacts.
- Diagnostics report facts and recovery; they do not select semantic completion.
- Real installations/provider calls remain separate effects; use isolated configs/fakes locally.

## Implementation

**Layers touched**: adapter install/update/Doctor/uninstall, project template, journey
harness/fixtures, user operating docs, retained verification evidence.

**Pattern**: existing transactional adapter fixtures plus scenario-based primary-path tests.

## Planned Path Inventory

`CREATE`:

- `tests/ultra-5-journeys.test.cjs`
- `docs/evals/ultra-5-0-journey-results.md`
- `.ultra/evidence/v50-migration-journeys/verification.log`

`MODIFY`:

- `adapters/_shared/plugin-core.cjs`
- `adapters/claude.js`
- `adapters/codex.js`
- `adapters/opencode.js`
- `adapters/kimi.js`
- `adapters/grok.js`
- `adapters/zcode.js`
- `.ultra-template/contexts/TEMPLATE.md`
- `tests/install.test.cjs`
- `tests/project-artifacts.test.cjs`
- `tests/v026-adapters.test.cjs`
- `README.md`
- `README.zh-CN.md`
- `docs/WORKFLOW-LIFECYCLE.md`
- `docs/RUNTIME-COMPAT-MATRIX.md`
- `.ultra/tasks.json`
- `docs/wip/ultra-builder-pro-5.0.md`

## Public Seams

- 3.x update/Doctor/uninstall behavior
- Route/driver/fallback diagnostics
- documented operating mode and journey results

## Narrow Verification

- `node --test tests/ultra-5-journeys.test.cjs tests/install.test.cjs tests/v026-adapters.test.cjs`
- isolated six-Host install/update/Doctor/uninstall fixture

## Acceptance Criteria

**Change Acceptance IDs**: [`AC5-05`, `AC5-09`, `AC5-10`, `AC5-11`]

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| M5-01 | A 3.x project update preserves every accepted canonical artifact byte and exposes new runtime health | `command` | before/after digest fixture and Doctor output |
| M5-02 | Every accepted journey has an observable success/stop and reports deliberate gaps instead of false green | `command` | journey harness output |
| M5-03 | Degraded authority keeps Status/Review read-only diagnosis and names repair/retry/cancel/abandon | `inspection` | scenario output and Skill source |
| M5-04 | Host-session recovery and earliest observable slice are documented at the point of use | `inspection` | README/lifecycle/Skill and scenario evidence |

## Definition of Drift

- Editing accepted project artifacts as an install/update side effect.
- Treating scenario fixture wording as semantic proof without a real-path observation.
- Performing real user-HOME installation or provider execution without fresh authorization.

## Trace

**Source**: `docs/ULTRA-BUILDER-PRO-5.0.zh-CN.md#9-50-acceptance-journeys`

**First principles**: [`FP-1`, `FP-2`, `FP-5`, `FP-7`]

**Serves**: [`NS-01`, `NS-02`, `NS-03`, `NS-04`]

**Causal contribution**: Migration and journey evidence prove that the new contracts are
usable and recoverable rather than merely present in source.

**Hard constraints**: [`HC-1`, `HC-3`, `HC-4`, `HC-6`]

**Decisions**: `.ultra/decisions/2026-08-25-ultra-5-0-scope.md`

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-25 | — | Initial creation | `docs/ULTRA-BUILDER-PRO-5.0.zh-CN.md` | Accepted migration/journey boundary |

## Open Questions

- _(none)_

## Resume Note

Why: prove that 5.0 remains safe for accepted 3.x authority and understandable through
the owner journeys, including degraded and fresh-session recovery. Outcome: one real
isolated adapter lifecycle preserves eighteen seeded canonical artifacts byte-for-byte
and mode-for-mode, all six Host Doctor rows expose exact driver/fallback health, and all
fourteen journeys have a PASS or honest STOP. Reality: focused 5/5, project-artifact
80/80, expanded 255/255, strict zero-finding Review, and current-v2 evidence pass;
ZCode ACP is the intentional STOP. Decision needed: none. Next bounded action: run
`v50-release-candidate`, bump the local package to 5.0.0, validate every changed Skill,
and execute the complete release/package/isolated-Doctor gate. Not done: live provider
conformance, real user-home installation, an activated ZCode ACP bridge, Windows
descendant cleanup proof, commit, push, tag, publish, or deployment.

## Completion

Completed locally on 2026-08-25. Evidence:

- `.ultra/evidence/v50-migration-journeys/evidence.json`
  (`ultra-task-evidence-v2`, validator classification `current-v2`, evidence digest
  `4e4d6c58c64f6f904090b51153709cdc1121f6c4b896d6a94c4e92e888e48078`);
- `.ultra/evidence/v50-migration-journeys/verification.log` (3.x aggregate digest
  `d0d5273b6ef1c35068330e5fde56a6f03c9db255bf815e792030682fe7dcb3a7`
  before update, after update, and after uninstall; six Doctor rows; degraded and
  fresh-session diagnostics; focused 5/5, project-artifact 80/80, expanded 255/255,
  Review snapshot validation, and diff check, exit 0);
- canonical journey register with thirteen local PASS rows and the unavailable ZCode
  ACP bridge recorded as one deliberate STOP rather than false live evidence.

## Task Review

- Execution Packet state/digest/limitation: `available` /
  `97e31b9cf71b78ac10b93dad6c25542294c121ba858bc14ea6586917898ba00c` / none.
- Review session identity and summary digest:
  `v50-migration-journeys-initial-review-v1` /
  `3f89f8bf206657a9a99100935d240d0af89b752972245cc62a943c04a46276b2`.
- Verdict: `APPROVE`; blocking findings: none; P0/P1/P2/P3 all zero.
- Retention: retain the exact strict review session until aggregate Test and Deliver
  consume it; premature loss requires a fresh Review and Test.
