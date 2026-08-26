# Change chg-ultra-5-0: Make workflow and multi-Agent execution coherent

> **Status**: accepted
> **Profile**: major
> **Profile rationale**: The Change modifies the public Skill contract, authorization and invocation semantics, six-Host installation/runtime behavior, delegation transport, migration, and release packaging; one versioned major work package is the smallest boundary that can keep those live consumers coherent.
> **Risk flags**: authorization, workflow semantics, multi-Host, protocol, process isolation, migration, package release

## Outcome

An Owner can start, understand, resume, and delegate one real Ultra work package across
supported Hosts while always seeing why the work exists, its accepted boundary, current
route, real execution state, exit condition, next action, and unfinished obligations;
clean-installed delegation works without a global CLI and preserves file/Git authority.

## Acceptance

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| AC5-01 | The accepted 5.0 contract preserves `north-star-v2-r3`, includes workflow and local multi-Agent execution coherence, and excludes Team Pack/remote shared assets | `owner-judgment` | `.ultra/decisions/2026-08-25-ultra-5-0-scope.md` plus the accepted design |
| AC5-02 | Every public Skill uses one Route Contract with a truthful Mode, artifact-derived Position, observable Exit condition, material checkpoint, Next, and Not done; no route ledger or semantic percentage exists | `inspection` | canonical Route Contract, changed Skills, workflow docs, and structural contract tests |
| AC5-03 | Init, baseline/change-scoped Research, Change intake/evidence/reconcile/accepted, Plan, and Status have non-overlapping responsibilities; Plan returns product-evidence gaps through Change | `inspection` | Skill source, lifecycle contract, and greenfield/existing-project route evals |
| AC5-04 | Invocation metadata and documentation distinguish explicit entry, grant-continuable modes, model disciplines, and the read-only router consistently on all six Hosts | `command` | adapter contract tests and generated host metadata inspection |
| AC5-05 | Historical owner-side pains — revision, inadequate options, decision history, early runnable value, fresh-session recovery, degraded diagnosis, and documented operating mode — have reachable Skill behavior and journey fixtures | `inspection` | current-source issue matrix plus owner/recovery/early-value journey results |
| AC5-06 | A clean isolated npx install places the canonical delegation runner under the installed `ultra-delegate/scripts` path; the Skill invokes that path, while `ubp delegate` is compatibility only | `command` | clean-PATH install regression and delegation suite |
| AC5-07 | One `AgentExecutionDriver` contract supports ACP v1 negotiation/events/permission/cancel/result and a result-compatible CLI fallback without giving ACP semantic authority | `command` | fake ACP server contract suite and unchanged delegation result validation |
| AC5-08 | Permission denial, timeout, cancellation, malformed messages, process exit, retry, and cleanup always reach a typed terminal result with no orphan or `.ultra` worker write | `command` | adversarial driver/delegation tests with process and diff assertions |
| AC5-09 | Each Host reports its ACP capability, selected driver, fallback reason, and honest maturity; ZCode uses the installed runtime and cannot claim support before its conformance bar passes | `command` | host-profile/Doctor tests and available local conformance evidence |
| AC5-10 | 3.x projects upgrade without rewriting accepted canonical artifacts; install/update/Doctor/uninstall remain atomic, ownership-safe, and diagnosable | `command` | byte-preservation migration fixture and isolated six-Host lifecycle tests |
| AC5-11 | Greenfield, existing-project, micro-edit, owner-revision, fresh-session, early-value, degraded-state, clean-install delegation, ACP, cancellation, fallback, ZCode, and migration journeys report coverage and limitations honestly | `command` | journey harness outputs and retained verification log |
| AC5-12 | The local 5.0 release candidate has coherent package/version/docs, all changed Skills validate, full release verification passes, pack contents are correct, and no external effect is performed | `command` | exact validator, `npm run verify:release`, `npm pack --dry-run --json`, isolated Doctor, and `git diff --check` results |

## Non-goals

- Team Pack, remote asset registry, Team Marketplace, or shared Hook/MCP auto-activation.
- A semantic database, persistent route/stage state machine, completion score, daemon,
  resident ACP service, automatic stage advancer, or cross-machine task service.
- Automatic merge, self-approval, delegation-to-transfer upgrade, or two canonical writers.
- Commit, push, tag, npm publication, GitHub Release, deployment, real global installation,
  credentials, paid provider calls, or any other external/irreversible effect.
- Rewriting historical accepted artifacts, evidence, field-issue records, failed tags, or
  the 3.0 release history.

## Public Seams

- `docs/ULTRA-BUILDER-PRO-5.0.zh-CN.md`
- `skills/ultra-status/references/route-contract.md` and all public `skills/*/SKILL.md`
- `adapters/_shared/runtime-assets.cjs` and per-Host generated invocation metadata
- installed `ultra-delegate/scripts` runner and compatibility `ubp delegate`
- `AgentExecutionDriver`, `AcpDriver`, `CliDriver`, delegation packets/events/results
- adapter install/update/Doctor/uninstall output and 3.x migration behavior
- `README.md`, `README.zh-CN.md`, `CHANGELOG.md`, package metadata, and release verification

## Reconciliation

### Promised and Missing

`NS-01` already promises eight owner checkpoint semantics, but the public Skills do not
share an output contract. `ultra-research` owns useful wayfinding but still presents a
catalog-shaped path; `ultra-plan` can route directly to Research despite requiring an
evidenced Change; runtime invocation code allows grant continuation while compatibility
and isolation docs say every public Skill is explicit-only. `ultra-delegate` still calls
bare `ubp delegate`, which a clean one-shot npx install does not persist.

### Built and Unpromised

The existing file-first artifact hierarchy, Execution Grant, Research Disposition,
Wayfinding brief, primary-transfer contract, delegation packet/diff/result validation,
transactional adapters, Hooks, and strict release gates are retained as the implementation
base. They are not replaced by ACP or a route state machine.

### Contradictory

The code/document invocation mismatch and install/runtime delegation mismatch are current
contract contradictions and must be corrected once at their shared authoritative sources.

## Research Disposition

- Disposition: none
- Question: none — the Owner accepted the evidence-backed 5.0 boundary and interaction default.
- Selected lenses: none
- Existing evidence: `docs/ULTRA-BUILDER-PRO-5.0.zh-CN.md`, current Skills/adapters/tests,
  `origin/docs/field-issues:docs/FIELD-ISSUES.md`, the clean-install delegation reproduction,
  Git decisions `b245833`, `d330236`, `54e7f02`, `9a75900`, `33e711c`, and official ACP
  protocol/schema/versioning documentation.
- Required exit evidence: satisfied — the current source contradictions, historical user
  symptoms, protocol boundary, accepted scope, and observable journeys are named.
- Rationale: another open-ended Research run would duplicate the accepted decision; remaining
  uncertainty is implementation/conformance evidence owned by the planned tasks.

## North Star Trace

- First principles: `FP-1` (files/Git recover the route), `FP-2` (Route Card and ACP events remain observations), `FP-3` (grant-aware continuation), `FP-4` (material checkpoints and terminal paths), `FP-5` (host-neutral driver plus native adapters), `FP-6` (least-authority delegation), `FP-7` (owner-legible checkpoints), `FP-8` (delegate/primary-transfer separation)
- Serves: `NS-01`, `NS-02`, `NS-03`, `NS-04`, `NS-05`
- Touches: `HC-1`, `HC-2`, `HC-3`, `HC-4`, `HC-5`, `HC-6`, `HC-7`, `HC-8`
- Evidence: `.ultra/north-star.md`, `docs/ARTIFACT-AUTHORITY.md`, the accepted 5.0 decision/design, current runtime/Skill source, delegation reproduction, and planned journey evidence
- North Star revision: `north-star-v2-r3`
- North Star digest: `439b7838e2a672fd2d2cb6e0f11e94a61d0f76c8`
- Contradictions or refinements: none to the constitution; 5.0 is the versioned product projection of existing `NS-01` and transport principles

## Execution Grant

- Grant: `session-local` (default)
- Allowed workflows: plan, dev, test, and deliver-reconcile for this accepted Change; bounded implementation-time evidence reconciliation may return through the same Change
- Agent topology: one local canonical writer in this checkout; no automatic subagents, delegation, or primary transfer
- Allowed local effects: edit/add/delete repository files required by AC5-01 through AC5-12; run local tests, validators, format/pack dry-runs, fake protocol servers, and isolated temporary config/HOME install-update-Doctor-uninstall fixtures; inspect installed local binary help without starting a provider task
- Budgets and expiry: no semantic step/count target; use the accepted review default, physical process/test timeouts, same-root three-failed-fix stop, and stop on lost current-session activation
- Mandatory reviews: plan contract inspection, task-local tests, changed-Skill validation, aggregate release suite, final diff review
- Stop conditions: a requested Team Pack/remote asset expansion; a reduced accepted commitment; a new external effect or provider call; widened worker authority; unavailable safe fallback; protocol/Host behavior that cannot be represented honestly; P0/P1 unresolved after the bounded repair budget
- Invalidation: owner revocation, material scope/topology/effect expansion, stale North Star trace, failed current-session activation, or terminal delivery/review outcome
- Never granted: a new unrelated Change, baseline revision, finalization/archive, commit/push/tag/publish/deploy/real install, credentials, provider spend, cross-machine service, Team Pack, daemon, or semantic state machine
- Activation: the current conversation contains the Owner request to make Ultra 5.0 as one complete upgrade and the exact acceptance 「接受」 of the scope and Route Card/material-checkpoint behavior; this activation applies only while that utterance remains available in the current session context; stored grant text alone is inactive and cannot continue any workflow

## Planning Posture

`SELECTIVE` and `CORRECT`: preserve the accepted constitution and existing integrity/recovery
contracts; correct the live workflow/invocation/runtime contradictions and add only the
smallest execution transport and observation surfaces consumed by the accepted journeys.

## Recovery

All implementation remains uncommitted. Git diff is the recovery record; every task has a
focused RED/GREEN suite and a Resume Note. Revert task-local paths or abandon the Change
with the exact closure if the Owner stops the initiative. Compatibility wrappers and
per-Host `CliDriver` fallback keep the primary path reachable during ACP migration.

## Unresolved Decisions

- None. External provider drills, real installation, release/publish, and any future Team
  Pack work are separate effects or initiatives, not unresolved implementation authority.
