# Task v50-skill-local-delegation: Make delegation reachable from an installed Skill

## Context

**What**: Move the canonical delegation launcher/worker into `ultra-delegate/scripts`,
invoke it by the loaded Skill's path, and retain thin package CLI wrappers for compatibility.

**Why**: A clean npx plugin install includes the Skill but does not persist `ubp` on PATH,
so the current normal delegation path is unreachable.

**Constraints**:
- Preserve packet, permission, worktree, diff, result, timeout, cancel, and `.ultra` denial.
- No npx on each delegation and no global CLI requirement.
- One canonical implementation; compatibility wrappers contain no forked behavior.

## Implementation

**Layers touched**: installed Skill scripts, package CLI wrappers, launcher/worker tests,
installer packaging, Doctor, clean-PATH fixture, and current runtime documentation.

**Pattern**: follow `ultra-init` — deterministic code resides beneath the installed Skill.

**Implemented design**:

- `ultra-delegate/scripts` owns the launcher, worker, Host profile, and Kimi launch-only
  profiles as one self-contained installed runtime.
- `bin/delegate*.cjs` and `adapters/_shared/host-profile.cjs` are one-release compatibility
  imports of those exact implementations; they own no behavioral fork.
- receipts, stalled-run repair, and experimental warnings name the canonical Skill-local
  entrypoint, while Doctor verifies every required installed runtime file.

## Planned Path Inventory

`CREATE`:

- `skills/ultra-delegate/scripts/delegate.cjs`
- `skills/ultra-delegate/scripts/delegate-worker.cjs`
- `skills/ultra-delegate/scripts/host-profile.cjs`
- `skills/ultra-delegate/scripts/delegate-profiles/kimi-read-only.md`
- `skills/ultra-delegate/scripts/delegate-profiles/kimi-write.md`
- `.ultra/evidence/v50-skill-local-delegation/verification.log`

`MODIFY`:

- `AGENTS.md`
- `README.md`
- `README.zh-CN.md`
- `bin/delegate.cjs`
- `bin/delegate-worker.cjs`
- `adapters/_shared/host-profile.cjs`
- `adapters/_shared/plugin-core.cjs`
- `skills/ultra-delegate/SKILL.md`
- `skills/ultra-delegate/references/delegation-contract.md`
- `tests/delegate.test.cjs`
- `tests/install.test.cjs`
- `tests/package-smoke.test.cjs`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/PLUGIN-ISOLATION-CONTRACT.md`
- `docs/RUNTIME-COMPAT-MATRIX.md`
- `docs/LEGACY-CLI-CROSSWALK.md`
- `docs/evals/ultra-5-0-route-journeys.md`
- `.ultra/tasks.json`
- `docs/wip/ultra-builder-pro-5.0.md`

`DELETE`:

- `adapters/_shared/delegate-profiles/kimi-read-only.md`
- `adapters/_shared/delegate-profiles/kimi-write.md`

## Public Seams

- `node <ultra-delegate-skill-dir>/scripts/delegate.cjs ...`
- compatibility `ubp delegate ...`
- installed plugin contents and Doctor reachability

## Narrow Verification

- `node --test tests/delegate.test.cjs tests/install.test.cjs tests/package-smoke.test.cjs`
- clean isolated PATH/config install and direct Skill-local runner help/status probe

## Acceptance Criteria

**Change Acceptance IDs**: [`AC5-06`, `AC5-08`, `AC5-10`]

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| D5-01 | Installed Skill owns the canonical launcher/worker and runs without global `ubp` | `command` | clean-PATH install regression |
| D5-02 | Compatibility CLI delegates to the same implementation with unchanged packet/result/recovery behavior | `command` | existing and new delegation tests |
| D5-03 | Pack/install/update/uninstall preserve ownership and include/remove the exact runtime files | `command` | package and isolated lifecycle tests |

## Definition of Drift

- Duplicating launcher logic in `bin/` and the Skill.
- Requiring a global npm install or invoking npx at runtime.
- Weakening the `.ultra` write ban, diff equality, timeout, or terminal result contract.

## Trace

**Source**: `docs/ULTRA-BUILDER-PRO-5.0.zh-CN.md#7-delegation-and-agent-execution`

**First principles**: [`FP-1`, `FP-3`, `FP-5`, `FP-6`]

**Serves**: [`NS-02`, `NS-04`, `NS-05`]

**Causal contribution**: Delegation becomes reachable from the installed runtime surface
without weakening its least-authority or terminal recovery guarantees.

**Hard constraints**: [`HC-1`, `HC-2`, `HC-3`, `HC-5`, `HC-6`]

**Decisions**: `.ultra/decisions/2026-08-25-ultra-5-0-scope.md`

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-25 | — | Initial creation | `docs/ULTRA-BUILDER-PRO-5.0.zh-CN.md` | Accepted clean-install repair |
| 2026-08-25 | EXPANSION | Moved the complete delegation runtime into the installed Skill and retained only compatibility imports | Runtime, isolation, architecture, compatibility, README, and decision docs | The live dependency trace proved the launcher also needs its worker and Host launch profiles to be independently reachable |
| 2026-08-25 | — | Completed the Skill-local runtime boundary with clean-PATH, packed-consumer, corruption/repair, recovery, strict Review, and current-v2 evidence | Task-local runtime and verification surfaces | D5-01 through D5-03 are satisfied without adding ACP behavior |

## Open Questions

- _(none)_

## Resume Note

Why: remove the hidden global-CLI dependency. Outcome: the installed Skill owns the
self-contained launcher, worker, Host profile, and launch-only profiles; package seams
are compatibility imports only. Accepted boundary: preserve existing delegation behavior
and add no ACP behavior. Delta: direct commands, receipts, stalled recovery, Doctor,
tarball, reinstall, and uninstall now resolve the Skill-local runtime. Reality: 155/155
focused tests, Skill validation, strict zero-finding Review, and current-v2 evidence pass.
Decision needed: none. Next bounded action: implement `v50-acp-execution-drivers` above
this stable boundary. Not done: ACP events/selection/conformance, ZCode ACP acceptance,
migration journeys, and release-candidate closure.

## Completion

Completed locally on 2026-08-25. Evidence:

- `.ultra/evidence/v50-skill-local-delegation/evidence.json`
  (`ultra-task-evidence-v2`, validator classification `current-v2`, evidence digest
  `0906e484fb4b11763da825306b585f4c177112f3a55a2b32f8de98f32dbf6d4c`);
- `.ultra/evidence/v50-skill-local-delegation/verification.log` (155 focused tests,
  Skill Creator validation, `git diff --check`, and all changed Node syntax checks,
  exit 0);
- clean-PATH install/status, exact tarball assets, Doctor non-file detection, reinstall
  byte repair, compatibility identity, canonical recovery, and uninstall assertions.

## Task Review

- Execution Packet state/digest/limitation: `available` /
  `f8e199a30c86811a9e385c8a38a641f47c7b9f7112e2339635f277952e193bf3` / none.
- Review session identity and summary digest:
  `v50-skill-local-delegation-initial-review-v1` /
  `809e498158a9938be4af90a1bdf54ab737a9ec653051fed038e01b08da8cf98e`.
- Verdict: `APPROVE`; blocking findings: none; P0/P1/P2/P3 all zero.
- Retention: retain the exact strict review session until aggregate Test and Deliver
  consume it; premature loss requires a fresh Review and Test.
