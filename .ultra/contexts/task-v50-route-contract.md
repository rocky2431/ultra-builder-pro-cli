# Task v50-route-contract: Project the Route Contract into the public workflow

## Context

**What**: Add one canonical Route Contract and make Init, Research, Change, Plan, Dev,
Test, Deliver, Delegate, and Status expose their mode, position, exit, material checkpoint,
next route, and unfinished obligations; reconcile mode-aware invocation policy and docs.

**Why**: `NS-01` already requires owner cognitive alignment, but the live Skill surface
does not let the Owner reliably tell where work is or why it will stop.

**Constraints**:
- No route ledger, semantic stage state, completion percentage, or automatic stage advancer.
- Preserve separate public Skills and file/Git authority.
- Host metadata may express only capabilities the Host actually supports.

## Implementation

**Layers touched**: shared Skill reference, public Skill entrypoints, adapter invocation
metadata, workflow/compatibility docs, structural and journey contracts.

**Pattern**: one canonical reference owned by the read-only router; public Skills link it
and define only their own modes/entry/exit facts.

**Implemented design**:

- `PUBLIC_SKILL_INVOCATION_MODES` is the mechanical per-mode map; generated Host metadata
  remains a coarse boolean and each mixed public Skill revalidates its mode and grant.
- Route Cards are derived at public boundaries and never persisted as route authority.
- Research owns `baseline` and `change-scoped`; scoped evidence returns to the same
  Change, and product/contract evidence gaps in Plan return through Change.
- Status recovery remains read-only when active authority is ambiguous, while owner
  revision/history, rejected options, fresh-session recovery, and earliest observable
  value are exercised by the route journey inspection.

## Planned Path Inventory

`CREATE`:

- `skills/ultra-status/references/route-contract.md`
- `tests/route-contract.test.cjs`
- `docs/evals/ultra-5-0-route-journeys.md`
- `.ultra/evidence/v50-route-contract/verification.log`

`MODIFY`:

- `skills/ultra-init/SKILL.md`
- `skills/ultra-research/SKILL.md`
- `skills/ultra-change/SKILL.md`
- `skills/ultra-plan/SKILL.md`
- `skills/ultra-dev/SKILL.md`
- `skills/ultra-test/SKILL.md`
- `skills/ultra-deliver/SKILL.md`
- `skills/ultra-delegate/SKILL.md`
- `skills/ultra-status/SKILL.md`
- `adapters/_shared/runtime-assets.cjs`
- `docs/WORKFLOW-LIFECYCLE.md`
- `docs/ARCHITECTURE.md`
- `docs/RUNTIME-COMPAT-MATRIX.md`
- `docs/PLUGIN-ISOLATION-CONTRACT.md`
- `docs/ARTIFACT-AUTHORITY.md`
- `docs/DECISIONS.md`
- `docs/SKILL-AUTHORING.md`
- `README.md`
- `README.zh-CN.md`
- `adapters/_shared/tests/runtime-assets.test.cjs`
- `tests/v026-adapters.test.cjs`
- `tests/v026-contract.test.cjs`
- `.ultra/tasks.json`
- `docs/wip/ultra-builder-pro-5.0.md`

## Public Seams

- `UBP Route Card`
- public Skill modes and transition behavior
- generated per-Host invocation metadata

## Narrow Verification

- `node --test tests/route-contract.test.cjs`
- `node --test tests/skill-authoring.test.cjs tests/v026-adapters.test.cjs`
- Skill Creator validation for every changed Skill

## Acceptance Criteria

**Change Acceptance IDs**: [`AC5-01`, `AC5-02`, `AC5-03`, `AC5-04`, `AC5-05`]

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| R5-01 | One canonical Route Contract carries the shared card/checkpoint/continuation semantics and every public Skill names its own modes and observable exit | `command` | focused structural contract test |
| R5-02 | Research has baseline and change-scoped modes with bounded coverage/stop/return; Plan routes product evidence gaps through Change | `inspection` | Skill and lifecycle diff plus journey fixture |
| R5-03 | Invocation policy represents explicit entry, grant-continuable modes, model disciplines, and router consistently without fabricating unsupported Host bits | `command` | adapter/metadata tests |
| R5-04 | Owner revision/history, early observable value, fresh-session recovery, and degraded diagnosis have reachable instructions and eval scenarios | `inspection` | route journey document and changed Skills |

## Definition of Drift

- Adding persistent semantic workflow state or a new public orchestration Skill.
- Combining the existing public Skills into one mega-workflow.
- Turning counts, cards, or Host metadata into semantic completion/permission.

## Trace

**Source**: `docs/ULTRA-BUILDER-PRO-5.0.zh-CN.md#3-route-contract`

**First principles**: [`FP-1`, `FP-2`, `FP-3`, `FP-5`, `FP-7`]

**Serves**: [`NS-01`, `NS-02`, `NS-03`]

**Causal contribution**: The same artifact-derived cognitive interface appears at each
workflow boundary while the model retains semantic route judgment.

**Hard constraints**: [`HC-1`, `HC-2`, `HC-3`, `HC-4`]

**Decisions**: `.ultra/decisions/2026-08-25-ultra-5-0-scope.md`

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-25 | — | Initial creation | `docs/ULTRA-BUILDER-PRO-5.0.zh-CN.md` | Accepted 5.0 task graph |
| 2026-08-25 | EXPANSION | Added the derived Route Contract, per-Skill modes, mode-aware invocation policy, and owner journey coverage | 5.0 design, lifecycle, authority, isolation, compatibility, authoring, and decision docs | Project accepted `NS-01` into every public workflow boundary without adding route state |

## Open Questions

- _(none)_

## Resume Note

Why: make `NS-01` visible in actual Skills. Outcome: one Route Contract and coherent
mode-aware invocation. Accepted boundary: no persistent route state or merged Skill.
Delta: Route Contract, nine mode tables, runtime policy, Host metadata tests, lifecycle
docs, and eight journey inspections are implemented. Reality: the 130-test focused
suite, nine Skill validators, strict task Review, and current v2 evidence all pass.
Decision needed: none. Next bounded action: start `v50-skill-local-delegation`. Not done:
Skill-local delegation, ACP drivers, migration journeys, and release-candidate closure.

## Completion

Completed locally on 2026-08-25. Evidence:

- `.ultra/evidence/v50-route-contract/evidence.json` (`ultra-task-evidence-v2`, validator
  classification `current-v2`, evidence digest
  `136841c34c18601ebed9eabe7b85ae70a83d1237c6431de7bed21daa8bba4767`);
- `.ultra/evidence/v50-route-contract/verification.log` (130 focused tests, exit 0,
  followed by `git diff --check`, exit 0);
- all nine changed Skills passed the Skill Creator validator in an isolated `PyYAML`
  runtime.

## Task Review

- Execution Packet state/digest/limitation: `available` /
  `e235fc087cd5a8208dc113b285d062eebdae4b2dcfd2cf6bcadfa343f70af296` / none.
- Review session identity and summary digest:
  `v50-route-contract-initial-review-v4` /
  `6667617cfea23da4008aaec9721c20957fb9fd4b7dfce954872f54a3514074c5`.
- Verdict: `APPROVE`; blocking findings: none; P0/P1/P2/P3 all zero.
- Retention: retain the exact strict review session until aggregate Test and Deliver
  consume it; premature loss requires a fresh Review and Test.
