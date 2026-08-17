# Change chg-ultra-3-0-mode-b: Implement Ultra Builder Pro 3.0 (Mode B work package)

> **Status**: accepted
> **Profile**: major
> **Profile rationale**: This Change projects the accepted 3.0 forward design into
> the North Star, specifications, public docs, Skills, Hooks, adapters, tests, and
> the repository lifecycle in one release boundary, and it carries the repository's
> first durable work-package grant.
> **Risk flags**: authorization semantics, canonical-artifact migration,
> self-hosting review boundary, review-loop convergence, six-Host compatibility

## Outcome

The repository implements the accepted Ultra Builder Pro 3.0 design as one coherent
local work package: a provider-neutral, file-first Ultra Core Protocol; explicit
dual-mode authorization (session-local default, durable work-package grant); owner-
selected topology with a single-Agent default; bounded three-round review
convergence with P0/P1-only blocking; per-fact canonical authority with cognitive
checkpoints; an optional-but-unintegrated Graph/Loop boundary; and truthful
real-path acceptance readiness — all without a mandatory daemon, database, MCP
server, Graph engine, hidden executor, or semantic state machine.

## Acceptance

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| AC3-01 | The accepted 3.0 design is projected into `.ultra/north-star.md` (revision `north-star-v2-r2`), specs, artifact authority, workflow lifecycle, and public docs without creating prose mirrors, and the superseded v0.27 route is closed by an exact abandonment record. | command + inspection | canonical validator output, doc inspection, abandonment record |
| AC3-02 | Zero-finding completion, P2 auto-repair, transitive finding replay, and Resume/Hook route authority remain deleted; formal terminal precedence, initial-vs-delta review separation, and the self-hosting external-review boundary are explicit in the review contracts. | inspection + command | skill/reference source observation plus route regression receipts |
| AC3-03 | The owner-facing checkpoint contract (why, outcome, accepted boundary, delta, reality, decision needed, next bounded action, not-done) and the per-fact authority matrix are canonical, and brittle prose/number tests are replaced by behavior, permission, effect, and recovery regressions. | inspection + command | doc source observation plus the migrated test suite |
| AC3-04 | Authorization is dual-mode and mechanically distinguishable: session-local by default, durable work-package grant consumed only after stable verification of subject, scope, topology, effects, budget, expiry, revocation, and invalidation; nothing infers activation from prose, status, progress, Hooks, or Resume notes. | inspection + command | grant contract source observation plus activation-regression receipts |
| AC3-05 | The optional Graph/Loop control-plane boundary is documented and honest: no dead scaffolding, no required dependency, and the integration is reported as not done where no real consumer exists. | inspection | architecture doc observation and dependency/package inspection |
| AC3-06 | Real-path acceptance readiness holds: the primary single-Agent path and recovery boundaries work through real consumers; narrow tests, package tests, release verification, package dry-run, and isolated install/Doctor pass without any release effect. | command + external-observation | exact commands, cwd, exit codes, and retained raw evidence |
| AC3-07 | The frozen implementation subject reports exact changed/deleted paths, cause-to-change mapping, remaining fakes, limitations, and not-done items, and confirms that no commit, push, tag, publication, real installation, deployment, credential, or new paid effect occurred. | owner-judgment | frozen WIP checkpoint and the implementation report |
| AC3-08 | The r3 projection publishes `.ultra/north-star.md` revision `north-star-v2-r3` with an accepted decision and byte-identical immutable snapshot; agent counts, topology details, provider names, Skill/Host counts, and exact review-round numbers are absent from the constitution and live in the versioned product contract and exact grants; the r2 revision and its history stay byte-stable. | command + inspection | North Star validator output, decision binding, snapshot byte comparison |
| AC3-09 | The r3 work package has a fresh task identity and an exact ZCode sole-writer durable grant executed through a verified primary transfer (OFFER + ready ACK binding frozen-input digests, HEAD, and worktree digest); the completed Mode B task, its evidence, and its grant record remain historical. | inspection | grant decision bytes, transfer receipts, ledger diff |
| AC3-10 | Genuinely affected specs, public docs, Skills, Hooks, Adapters, and tests are synchronized once, with no dead scaffolding and no prose mirror of the new contract. | inspection + command | doc and skill source observation plus the package suites |
| AC3-11 | A primary-transfer contract with a mechanical validator and minimal live consumers exists, mutually exclusive with delegated workers; mismatch, stale, revoked, refused, interrupted, cancelled, and missing-receipt paths are typed and reachable; `ultra-delegate` keeps its least-authority worker boundary with no canonical `.ultra` write and no delegation-to-transfer upgrade. | command | primary-transfer regression suite plus the delegation suite |
| AC3-12 | The ZCode app-bundled CLI and protocol are marked experimental with the documented support bar (official documentation plus a full recovery drill), nowhere claimed as a supported public interface. | inspection | host profile, compatibility matrix, adapters |
| AC3-13 | Recovery evidence exists: temp-repository drill matrix, one real ZCode primary readback, and one ZCode-to-CLI bounded worker drill, each with exact commands and results. | command + external-observation | verification log and typed evidence refs |
| AC3-14 | The package verification chain passes (node suite, hooks, changed-Skill validators, release verify, pack dry-run, isolated temporary HOME install and Doctor) and the frozen report enumerates exact changed/deleted paths, commands, fakes, limitations, not-done, and external effects. | command + owner-judgment | verification log, RESULT receipt |

## Non-goals

- No commit, push, tag, npm publication, GitHub Release, deployment, real-HOME
  installation, credential change, or new paid effect under this Change.
- No mandatory daemon, database, MCP server, Graph engine, hidden executor, or
  semantic state machine; no LoopX/Graph integration without a real consumer.
- No automatic spawning or delegation of additional Agents; topology changes
  return to the owner.
- No rewrite of historical incident facts, v0.27 evidence, or accepted decision
  records.
- No use of the changing local `ultra-review` to approve this repair; review is
  the owner-designated post-freeze reviewer's job.

## Public Seams

- `.ultra/north-star.md` revision `north-star-v2-r2` and its accepted decision and
  snapshot bindings
- `.ultra/changes/active/chg-ultra-3-0-mode-b/intent.md` (this contract and its
  Execution Grant)
- `.ultra/tasks.json` row `v30-mode-b-local-implementation` and its context file
- the fourteen Skills, five Hooks, six host adapters, delegation CLI, and install
  surfaces under `skills/`, `hooks/`, `adapters/`, and `bin/`
- `docs/PHILOSOPHY.md`, `docs/ARCHITECTURE.md`, `docs/ARTIFACT-AUTHORITY.md`,
  `docs/WORKFLOW-LIFECYCLE.md`, `docs/DECISIONS.md`, `docs/RUNTIME-COMPAT-MATRIX.md`,
  and `README.md`
- `docs/wip/ultra-builder-pro-3.0-implementation.md` (single dynamic checkpoint)
- `skills/ultra-change/references/primary-transfer.md`,
  `skills/ultra-change/scripts/validate_primary_transfer.cjs`, and the transfer
  receipts under `.ultra/.runtime/handoffs/` (r3 extension)
- `.ultra/decisions/2026-08-17-ultra-3-0-north-star-r3.md`,
  `.ultra/decisions/2026-08-17-ultra-3-0-r3-primary-handoff.md`, and
  `.ultra/research/2026-08-17-ultra-3-0-r3-projection/north-star-v2-r3.accepted.md`
  (r3 extension authority and snapshot)

## Reconciliation

### Promised and Missing

The abandoned `chg-v027-lifecycle-closure` promised AC-03 through AC-10 (autonomy
packet, adversarial lifecycle, delegation snapshot, host adapter closure, Doctor
provenance, migration acceptance). The accepted 3.0 design supersedes that route;
this Change re-promises the surviving substance as AC3-01 through AC3-07 under the
new protocol, grant, and review-convergence model. The v0.27 pending task rows
remain in the append-only ledger as inert history of an abandoned Change.

### Built and Unpromised

The pre-existing dirty worktree at grant time (109 status entries against base
HEAD `fc055021bcfeee3e8c6781b9545d267f5eb73cbd`) is protected implementation
input: v0.26 maintenance, the v0.27 Phase 1/H0 work, the ZCode adapter, and the
3.0 bootstrap documents. It is reconciled here as the 3.0 baseline, not claimed as
new evidence for this Change's acceptance rows.

The r3 extension (2026-08-17) reconciles the owner-directed r3 design into this
still-active Change as a new work-package segment under a new grant and a fresh
task identity, because the Change lifecycle admits exactly one active Change and
the Mode B Change was never delivered, archived, or abandoned. The r3 segment
promises AC3-08 through AC3-14; it inherits none of the Mode B review history
and its subject is frozen separately.

### Contradictory

None known at acceptance. Evidence contradicting the accepted North Star, grant,
or effect boundary returns this Change to reconciliation.

## Research Disposition

- Disposition: none
- Question: none — the accepted forward design is the bounded synthesis.
- Selected lenses: none; the 3.0 design document supersedes a fresh lens run.
- Existing evidence: `docs/ULTRA-BUILDER-PRO-3.0.zh-CN.md` (accepted, hash-bound),
  `.ultra/research/2026-08-15-v027-north-star/` (r1 run, historical),
  `docs/V027-HARNESS-LOOP-INCIDENT-REMEDIATION.zh-CN.md`, and
  `docs/V027-LIFECYCLE-CLOSURE.zh-CN.md`.
- Required exit evidence: satisfied — the design and its owner acceptance record
  exist and are hash-bound.
- Rationale: the owner accepted the design explicitly; re-running Research would
  create a second truth about the same accepted direction.

## North Star Trace

- First principles: `FP-1` (file-first durable authority carries the projection),
  `FP-2` (mechanization touches only facts, permissions, effects, recovery),
  `FP-3` (each work-package segment is authorized by an exact durable grant;
  the r3 segment additionally by a verified primary transfer),
  `FP-4` (review chains terminate within the accepted budget),
  `FP-5` (shared semantics stay host-neutral with honest maturity),
  `FP-6` (delegation stays least-authority), `FP-7` (checkpoints keep the
  owner aligned), `FP-8` (the r3 handover is exclusive, verified, and
  recoverable)
- Serves: `NS-01`, `NS-02`, `NS-03`, `NS-04`, `NS-05`
- Touches: `HC-1`, `HC-2`, `HC-3`, `HC-4`, `HC-5`, `HC-6`, `HC-7`, `HC-8`
- Evidence: the accepted 3.0 design document and Mode B grant (D0–D5
  milestone evidence below); the accepted r3 design document, the r3 transfer
  grant, and the transfer receipts under `.ultra/.runtime/handoffs/ubp3-r3-zcode/`
  for the AC3-08 through AC3-14 extension.
- North Star revision: `north-star-v2-r3`
- North Star digest: `439b7838e2a672fd2d2cb6e0f11e94a61d0f76c8`
- Contradictions or refinements: the D0–D5 rows above were traced to
  `north-star-v2-r2`; that trace is preserved as the historical observation
  captured at Mode B closeout. The r3 extension traces to `north-star-v2-r3`;
  their semantic IDs reconcile directly (the r3 revision adds `FP-8` and moves
  exact counts to the versioned product contract without retracting any r2
  principle).

## Execution Grant

- Grant: `durable work-package` — current segment `ubp3-r3-zcode-2026-08-17`, recorded by the owner in `.ultra/decisions/2026-08-17-ultra-3-0-r3-primary-handoff.md` and activated through the verified primary transfer `.ultra/.runtime/handoffs/ubp3-r3-zcode/` (OFFER + ready ACK); the preceding Mode B grant `ubp3-mode-b-2026-08-17` remains the historical authority for the completed D0–D5 task; the unspecified default for all other work is `session-local`
- Allowed workflows: bounded local implementation forms of research, plan, dev, test, and deliver-reconcile inside this repository; no external effects
- Agent topology: one local implementation writer (ZCode Desktop) in the current checkout, holding sole canonical-writer authority from the ready ACK; no automatic spawn or delegation; read-only reviewer (Codex root) after the implementation freezes; this topology binds the current work-package segment only
- Allowed local effects: edit, add, or delete repository files required by AC3-08 through AC3-14; run local tests, validators, package dry-runs, and isolated temporary install/Doctor probes; run bounded worker drills against already-installed local CLIs in temporary isolated worktrees within the existing entitlement; write derived ACK and RESULT receipts under the handoff directory; update the single implementation WIP by replacement
- Budgets and expiry: no arbitrary active-time cap — resource limits are physical observations, not semantic verdicts; review budget for this segment is the owner override recorded in the r3 grant (total cap ten rounds targeting five, owner-designated blocker classes only, same-root three-failed-fix stop, no automatic extension); the grant expires on reviewer acceptance, owner revocation, or a terminal outcome
- Mandatory reviews: the frozen implementation subject is reviewed by the owner-designated read-only reviewer; the changing local `ultra-review` must not approve this repair
- Stop conditions: design-identity mismatch without newer owner acceptance; required outcome/scope/risk/topology/cost/external-effect change; a required external or irreversible effect; unverifiable subject, frozen inputs, or transfer receipts; three materially different failed fixes; review-budget exhaustion with a remaining blocker; owner revocation or abandonment
- Invalidation: any stop condition above ends the grant and returns control to the owner; implementation bytes, tests, evidence, WIP updates, and P2/P3 reviewer observations do not invalidate it
- Never granted: commit, push, tag, npm publication, GitHub Release, deployment, real-HOME or global installation, credentials, production mutation, purchases, top-ups, or new paid effects; a mandatory daemon, database, MCP server, Graph engine, hidden executor, or semantic state machine; automatic spawn or delegation of additional Agents; A2A, Goal orchestration, or another implementation Agent
- Activation: durable — a consuming Agent must stably verify the accepted-design SHA-256, the grant record bytes, the repository identity and base HEAD, the transfer receipts, and the current work-package status before relying on it; the stored grant text alone is inactive

## Planning Posture

`EXPAND` and `CORRECT`: preserve the accepted file-first product and six-Host
scope; add the protocol core, dual-mode grants, bounded convergence, checkpoints,
and per-fact authority while correcting the superseded autonomy-packet route,
prose mirrors, and brittle prose tests. No accepted product commitment is reduced.

## Recovery

All work remains uncommitted in the dirty worktree. The protected baseline is the
grant-time worktree; unrelated owner changes must never be reset or overwritten.
Abandonment requires an owner decision plus the exact closure record. The frozen
implementation WIP is the resume point; a fresh session resumes by re-verifying
the grant per its activation rule.

## Unresolved Decisions

- Release versioning and compatibility strategy for the 3.0 projection: deferred;
  no version bump or release effect is authorized under this Change.
