# Task v50-acp-execution-drivers: Add ACP-first conformance-gated execution drivers

## Context

**What**: Introduce one provider-neutral driver boundary, a result-compatible CLI driver,
an ACP v1 stdio driver with capability/event/permission/cancel handling, per-Host selection,
and a thin installed-runtime ZCode profile.

**Why**: Ultra needs structured progress and a replaceable path to agents without making
provider CLIs, ACP sessions, or ZCode private surfaces semantic authority.

**Constraints**:
- ACP default flips only after per-Host conformance; CLI remains reachable fallback.
- Stable ACP v1 required contract only; no unstable v2 dependency.
- No live scope widening, raw credentials/hidden reasoning in events, daemon, or session authority.

## Implementation

**Layers touched**: Skill-local driver modules/profiles, fake ACP server, event journal,
permission/cancel/result handling, Host/Doctor capability reporting.

**Pattern**: minimal Node stdlib JSON-RPC seam or an officially packaged SDK only if it
remains self-contained inside the installed Skill; reuse existing process/digest/result code.

## Planned Path Inventory

`CREATE`:

- `skills/ultra-delegate/scripts/agent-execution-driver.cjs`
- `skills/ultra-delegate/scripts/cli-driver.cjs`
- `skills/ultra-delegate/scripts/acp-driver.cjs`
- `tests/acp-driver.test.cjs`
- `tests/fixtures/fake-acp-agent.cjs`
- `.ultra/evidence/v50-acp-execution-drivers/verification.log`

`MODIFY`:

- `skills/ultra-delegate/scripts/delegate.cjs`
- `skills/ultra-delegate/scripts/delegate-worker.cjs`
- `skills/ultra-delegate/scripts/host-profile.cjs`
- `adapters/_shared/host-profile.cjs`
- `adapters/_shared/plugin-core.cjs`
- `skills/ultra-delegate/SKILL.md`
- `skills/ultra-delegate/references/delegation-contract.md`
- `tests/delegate.test.cjs`
- `tests/install.test.cjs`
- `tests/package-smoke.test.cjs`
- `tests/v026-adapters.test.cjs`
- `docs/RUNTIME-COMPAT-MATRIX.md`
- `docs/ARCHITECTURE.md`
- `.ultra/tasks.json`
- `docs/wip/ultra-builder-pro-5.0.md`

## Public Seams

- `AgentExecutionDriver`
- `AcpDriver` / `CliDriver`
- derived delegation event/status/result artifacts
- per-Host selected driver, maturity, and fallback reason

## Narrow Verification

- `node --test tests/acp-driver.test.cjs tests/delegate.test.cjs tests/v026-adapters.test.cjs`
- local binary capability/help inspection without a provider task

## Acceptance Criteria

**Change Acceptance IDs**: [`AC5-07`, `AC5-08`, `AC5-09`]

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| A5-01 | ACP v1 initialize/capability/session/update/permission/cancel/terminal flow maps to the existing Ultra result contract | `command` | fake-agent contract suite |
| A5-02 | ACP events stay derived and redacted; envelope widening returns blocked/denied; cancellation/timeouts leave no orphan | `command` | adversarial process/event tests |
| A5-03 | Driver selection is per-Host, capability-probed and honest; failed conformance uses result-compatible CLI fallback | `command` | host selection and fallback tests |
| A5-04 | ZCode uses only the installed runtime surface and remains experimental until the recorded drill bar passes | `inspection` | profile/Doctor source and available conformance evidence |

## Definition of Drift

- Treating ACP session/update/StopReason as Ultra semantic completion.
- Adding a daemon, remote task service, persistent session authority, or A2A scope.
- Enabling ACP by default for an unproven Host or silently widening permissions.

## Trace

**Source**: `docs/ULTRA-BUILDER-PRO-5.0.zh-CN.md#72-acp-boundary`

**First principles**: [`FP-1`, `FP-2`, `FP-3`, `FP-5`, `FP-6`]

**Serves**: [`NS-02`, `NS-04`, `NS-05`]

**Causal contribution**: A replaceable, observable execution transport preserves the same
bounded worker result while files/Git and the primary Agent retain meaning and integration.

**Hard constraints**: [`HC-1`, `HC-2`, `HC-3`, `HC-5`, `HC-6`]

**Decisions**: `.ultra/decisions/2026-08-25-ultra-5-0-scope.md`

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-25 | — | Initial creation | `docs/ULTRA-BUILDER-PRO-5.0.zh-CN.md` | Accepted ACP transport boundary |

## Open Questions

- _(none; real provider execution remains a separate external-effect checkpoint)_

## Resume Note

Why: make cross-Agent execution observable and replaceable without making ACP project
authority. Outcome: one installed Skill-local driver boundary now supports stable ACP v1
and result-compatible CLI, with bounded redacted events, immutable permissions, typed
terminal recovery, and per-Host conformance gating. Reality: 175/175 focused tests, Skill
validation, strict zero-finding Review, and current-v2 evidence pass; all six shipped
Hosts still select CLI with an exact reason. Decision needed: none. Next bounded action:
run `v50-migration-journeys`, preserving 3.x canonical bytes and exercising every
accepted owner journey. Not done: live provider conformance, an activated ZCode ACP
bridge, Windows descendant cleanup proof, release packaging, or external effects.

## Completion

Completed locally on 2026-08-25. Evidence:

- `.ultra/evidence/v50-acp-execution-drivers/evidence.json`
  (`ultra-task-evidence-v2`, validator classification `current-v2`, evidence digest
  `cb37c6b94a0f516b6993ec4bd187e94a7fe692adf6bddc958db9175fb5c7316e`);
- `.ultra/evidence/v50-acp-execution-drivers/verification.log` (175 focused tests,
  Skill Creator validation, syntax/diff checks, current installed ZCode 0.16.5
  inspection, and strict Review bindings, exit 0);
- fake ACP v1, exact launcher/worker result parity, adversarial protocol/permission/event,
  cancellation/no-orphan, six-Host selection/Doctor, clean install, pack, reinstall,
  and uninstall assertions.

## Task Review

- Execution Packet state/digest/limitation: `available` /
  `b3c49a8fc43f61cadcb0c5974900d09e4bab540af23f1e30d50b3896aa4fc952` / none.
- Review session identity and summary digest:
  `v50-acp-execution-drivers-initial-review-v1` /
  `0ae3d4f34866ded1037970f377fcf57087d44bd6df107650256a6359bafc0e58`.
- Verdict: `APPROVE`; blocking findings: none; P0/P1/P2/P3 all zero.
- Retention: retain the exact strict review session until aggregate Test and Deliver
  consume it; premature loss requires a fresh Review and Test.
