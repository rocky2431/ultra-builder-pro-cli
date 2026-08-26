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
The released path uses real ACP v1 transports for all six Hosts when their pinned
candidate is executable, is installed in the Owner's real Host directories, and is
verified on macOS and Windows before the public 5.0 package is published.

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
| AC5-13 | Claude Code, Codex, OpenCode, Kimi Code, Grok Build, and ZCode each complete a bounded real ACP v1 session through their own pinned/native adapter, return an exact Ultra result, leave the isolated Git subject unchanged, and terminate cleanly | `external-observation` | one redacted, digest-bound conformance receipt per Host plus exact local logs |
| AC5-14 | ZCode ACP uses the independently built `zcode-acp` v0.1.0 bridge at commit `42fe149d4b501469343c01f23ba3801832306d53`, the digest-bound ZCode 0.16.5 compatibility patch, the installed ZCode Desktop runtime, and the Owner's domestic BigModel provider without redistributing ZCode bytes or bridge binaries | `command` | locked source tests/build, regression + patched fake E2E, patch/binary/version/source receipt, real ZCode ACP session, and runtime/provider-path observation |
| AC5-15 | A real user-level all-Host installation reports package 5.0.0, installed Skill-local delegation, selectable ACP capability, healthy ownership/provenance, and a reachable uninstall/reinstall recovery path without modifying unrelated Host files | `command` | pre-install inventory, backup manifest, real install and Doctor JSON, Host discovery probes, and post-install diff inventory |
| AC5-16 | Cancellation and timeout terminate the ACP adapter and its descendants on a real `windows-latest` runner, and the maintained CI matrix passes on Linux, macOS, and Windows | `external-observation` | pushed GitHub Actions run URL/id and retained Windows test output |
| AC5-17 | The final Change Review/Test bind all nine task records and the exact release commit; `origin/main` contains only the authorized commits and the required remote CI is green before tagging | `external-observation` | retained task evidence, aggregate Test report, commit ids, push receipt, and GitHub Actions run ids |
| AC5-18 | `v5.0.0`, `ultra-builder-pro-cli@5.0.0`, and the GitHub Release resolve to the same verified source/package, with no invented service deployment | `external-observation` | remote tag, npm registry metadata/integrity, GitHub Release assets/notes, and repository deployment-surface inspection |

## Non-goals

- Team Pack, remote asset registry, Team Marketplace, or shared Hook/MCP auto-activation.
- A semantic database, persistent route/stage state machine, completion score, daemon,
  resident ACP service, automatic stage advancer, or cross-machine task service.
- Automatic merge, self-approval, delegation-to-transfer upgrade, or two canonical writers.
- Team credentials, credential export or replacement, provider purchase/top-up,
  force-push, npm unpublish, or deployment to a service not already owned by this repository.
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
- pinned/native per-Host ACP commands, redacted conformance receipts, real user Doctor,
  cross-platform CI, npm package metadata, Git tag, and GitHub Release

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
The local candidate's six explicit CLI fallbacks are truthful but no longer satisfy the
Owner's expanded live-release outcome; each may flip only after its own real receipt exists.

## Research Disposition

- Disposition: none
- Question: none — the Owner accepted the evidence-backed 5.0 boundary and interaction default.
- Selected lenses: none
- Existing evidence: `docs/ULTRA-BUILDER-PRO-5.0.zh-CN.md`, current Skills/adapters/tests,
  `origin/docs/field-issues:docs/FIELD-ISSUES.md`, the clean-install delegation reproduction,
  Git decisions `b245833`, `d330236`, `54e7f02`, `9a75900`, `33e711c`, and official ACP
  protocol/schema/versioning documentation, the official ACP registry, and the pinned
  `zcode-acp` v0.1.0 source.
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

- Grant: `session-local` (owner-expanded live activation)
- Allowed workflows: plan, dev, test, deliver-reconcile, finalization, and release verification for this accepted Change; bounded implementation-time evidence reconciliation may return through the same Change
- Agent topology: one local canonical writer in this checkout; no automatic subagents, delegation, or primary transfer
- Allowed local effects: edit/add/delete repository files required by AC5-01 through AC5-18; run local/remote tests and validators; build and install the pinned ZCode bridge under the current user; use existing Host authentication for one minimal read-only conformance call per Host; inventory, back up, install, Doctor, and verify all six real user Host directories; create normal commits; push `main`; create `v5.0.0`; trigger and inspect GitHub Actions; publish through trusted npm release automation; create and inspect the GitHub Release
- Budgets and expiry: one normal conformance task per Host plus the cheapest failed-path retry needed to classify a real adapter defect; no provider top-up; bounded process/test timeouts; accepted review default; same-root three-failed-fix stop; activation expires when this Change reaches a verified public terminal result
- Mandatory reviews: plan contract inspection, upstream bridge source/test inspection, task-local RED/GREEN tests, redacted real-provider receipts, real-HOME ownership inspection, changed-Skill/plugin validation, aggregate release suite, final diff review, green three-OS remote CI, registry/release verification
- Stop conditions: a requested Team Pack/remote asset expansion; a reduced accepted commitment; a provider requiring new credentials or purchase; widened worker authority; unavailable safe fallback; protocol/Host behavior that cannot be represented honestly; a tag/version collision; an unknown service deployment target; P0/P1 unresolved after the bounded repair budget
- Invalidation: owner revocation, material scope/topology/effect expansion, stale North Star trace, failed current-session activation, or terminal delivery/review outcome
- Never granted: a new unrelated Change, baseline revision, credential value access/export/replacement, provider purchase/top-up, force-push, npm unpublish, an unowned service deployment, cross-machine task service, Team Pack, daemon, or semantic state machine
- Activation: the current conversation contains both the earlier exact acceptance 「接受」 and the Owner's 2026-08-26 exact request to finish the ZCode bridge, six real ACP conformance runs, real provider calls, real user installation, Windows cleanup, commit, push, tag, publish, and deployment; stored grant text alone is inactive and cannot authorize another session

## Planning Posture

`SELECTIVE` and `CORRECT`: preserve the accepted constitution and existing integrity/recovery
contracts; correct the live workflow/invocation/runtime contradictions and add only the
smallest execution transport and observation surfaces consumed by the accepted journeys.

## Recovery

The verified local candidate is recovery commit `8be6f6d`. New work remains isolated in
four appended tasks with focused RED/GREEN or external-observation evidence. Before a
tag exists, revert task-local paths or normal commits; after publication, repair through
a new release and npm deprecation rather than history rewriting. `CliDriver` remains a
reachable fallback when a compatible ACP executable is absent.

## Unresolved Decisions

- None. The Owner explicitly activated the remaining live/release effects in
  `.ultra/decisions/2026-08-26-ultra-5-0-live-activation.md`; Team Pack remains separate.
