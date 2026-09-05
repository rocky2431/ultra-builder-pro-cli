# Change chg-ultra-vnext-d1-delegation-safety: Make delegated execution truthful before fan-out

> **Status**: accepted
> **Profile**: major
> **Profile rationale**: This is the smallest independent safety prerequisite for every later multi-Agent Run Slice. It changes the shared delegation boundary, process/recovery truth, Host effect qualification and their product contracts without adding the Supervisor itself.
> **Risk flags**: secret and session isolation, process-tree cancellation, writer fencing, cross-Host execution, recovery truth, public delegation contract

## Outcome

Before any vNext fan-out, the existing installed delegation path launches a bounded Agent
with a target-aware sanitized descendant environment, never reports cancellation or safe
retry unless the complete target writer boundary is proven stopped, and fails closed when
the selected Host cannot mechanically satisfy the Packet's file/network/secret/effect limits.

## Acceptance

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| D1-AC01 | One target-aware environment policy derives role-scoped probe, delegate-worker and final ACP/CLI Host views that exclude Primary session/thread/socket/notifier controls and unrelated provider secrets; canonical packet paths remain launcher/worker-local, while the final Host receives only minimum process/runtime and explicitly selected Host authentication inputs | `command` | deterministic fake-child capture for probe, worker, ACP and CLI paths, non-production canary scan across every retained runtime/evidence artifact and focused source inspection; no prohibited secret value or canonical packet path reaches the final Host, packet, receipt or log |
| D1-AC02 | Timeout, cancel, outer-worker loss and nested-writer fixtures either prove the complete writer boundary stopped or return a truthful `outcome_unknown`; they never synthesize a safe terminal result or launch a second writer for frozen roots | `command` | RED/GREEN nested process-tree tests covering identity, fencing, cancellation acknowledgement, stale PID/receipt and duplicate-launch prevention |
| D1-AC03 | The selected local Host path is admitted only for Packet dimensions whose real file, Agent-tool network, secret and point-of-use effect boundary is qualified; an unenforceable denied Agent effect fails closed before implementation, while separately authorized provider transport is recorded rather than misclassified as a Worker effect | `external-observation` | one bounded no-production enforcement smoke with exact Host/version/adapter/maturity, isolated worktree, denied probes, redacted receipt and zero user/business external side effect |
| D1-AC04 | Existing N=1 delegation, ACP-first/CLI-fallback selection, typed results, changed-path enforcement and cancellation remain compatible | `command` | targeted delegation/driver suites and full `npm run verify:release` pass from the current integrated worktree |
| D1-AC05 | Maintained product, architecture and model-facing delegation surfaces describe the new environment, writer-truth and fail-closed effect boundary without claiming unsupported per-root or durable guarantees | `inspection` | exact final diff over current specs/docs/Skill plus changed-Skill validation and current Review subject |

## Non-goals

- N-way Run Supervisor, barrier, Attention delivery, Profile selection, W1/W2 wake or any
  Step 1 factory implementation.
- W3/W4, durable conductor, daemon, database, queue, event broker or workflow DSL.
- General secret manager, generic sandbox, new provider runtime or new dependency.
- Kimi participation, Profile promotion, automatic retry/fallback, integration, commit,
  push, publish, deploy, real HOME install or production effect.
- Rewriting archived 5.0.2 evidence or historical R1/Review bytes.

## Public Seams

- `skills/ultra-delegate/scripts/delegate.cjs` and `delegate-worker.cjs`
- `skills/ultra-delegate/scripts/{agent-execution-driver,acp-driver,cli-driver,host-profile}.cjs`
- installed `ultra-delegate` permission, status, cancel, result and receipt behavior
- `.ultra/specs/product.md#requirement-fr-06-bounded-delegation`
- `.ultra/specs/architecture.md#delegation-boundary`
- focused delegation/driver fixtures and release verification

## Reconciliation

### Promised and Missing

Current specifications promise least-authority bounded delegation, timeout/cancellation,
native Host isolation and truthful recovery. They do not yet require a single sanitized
descendant environment, persisted inner writer identity/fencing, or a fail-closed
qualification result when a selected Host cannot enforce a denied effect.

### Built and Unpromised

The current runner already has immutable instruction/permission digests, atomic run locks,
ACP-first selection, process-group termination helpers, strict typed results, actual Git-diff
validation and isolated registered worktrees. D1 reuses these boundaries; it does not create
a parallel execution or state engine.

### Contradictory

The runner and both drivers currently spread full `process.env` into descendants, which can
expose Primary control-plane and unrelated provider variables. The outer receipt records only
the delegate-worker PID; after outer-worker loss, `cancel` can synthesize `cancelled` from a
dead outer PID without proving a detached inner Host writer stopped. Packet prose and final
diff validation also cannot undo a network, credential or external effect that already happened.

## Research Disposition

- Disposition: none
- Question: none — current source, the frozen independent Review, the prior Claude Stage 0 analysis and R2 sections 10/13 identify the exact safety gaps and observable falsifiers.
- Selected lenses: none
- Existing evidence: `delegate.cjs` and both execution drivers spread `process.env`; `run.lock`/`receipt.json` bind only the outer worker; current cancel/status code and nested-process tests expose the recovery seam; R2 SHA `f50acb33cdaa023bd80e481d4cf36fa81d7d0201a574aedca78d3be7e84757e7` defines D1.
- Required exit evidence: satisfied for planning — implementation choice remains model-owned and begins from failing characterization tests.
- Rationale: more open-ended Research would duplicate a reproduced shared-boundary defect; exact Host enforcement is an acceptance smoke, not a design guess.

## North Star Trace

- First principles: `FP-1`, `FP-2`, `FP-3`, `FP-5`, `FP-6`, `FP-8`
- Serves: `NS-02`, `NS-03`, `NS-04`, `NS-05`
- Touches: `HC-1`, `HC-2`, `HC-3`, `HC-4`, `HC-5`, `HC-6`, `HC-7`, `HC-8`
- Evidence: the shared delegate boundary must preserve provider-neutral least authority and reconstruct truthful writer/recovery facts before multi-Host fan-out can serve real delivery.
- North Star revision: `north-star-v2-r3`
- North Star digest: `439b7838e2a672fd2d2cb6e0f11e94a61d0f76c8`
- Contradictions or refinements: none; this Change closes implementation gaps under the accepted principles and does not revise the constitution.

## Execution Grant

- Grant: `durable work-package` `ubp-vnext-d1-zcode-safety-2026-09-01`
- Complete per-task budget set: `vnext-d1-runtime-safety-boundary` and `vnext-d1-host-enforcement-qualification`; no current or later ledger row is covered unless the Owner names it in a new exact grant
- Allowed workflows: Change reconciliation, Plan, Dev, Test, task/aggregate Review and deliver-reconcile without finalization for this exact Change
- Agent topology: ZCode is the sole implementation-code writer with one active attempt at a time; Codex coordinates, validates, reviews and writes only workflow/decision/task/review/evidence/recovery artifacts; Claude Code may perform one fresh read-only Step 1 architecture discussion; Kimi and all other writers are inactive
- Allowed local effects: edit only the current delegate/driver/Host-profile boundary, focused tests, maintained affected Skill/docs/specs, and this Change's canonical task/review/evidence artifacts; run local tests/validators/package dry-run, isolated temporary process/worktree fixtures, read-only Host inventory, one bounded initial ZCode implementation call for each of the two named D1 tasks, one bounded Claude discussion and one selected-Host no-production enforcement qualification call using existing authentication
- Budgets and expiry: for each task in the complete per-task budget set, one initial ZCode attempt plus at most two Codex-requested P0/P1 repair attempts and one initial Codex task Review plus at most two P0/P1-only delta Reviews; each ZCode attempt is at most two active hours and only one may be active at a time; one initial Plan Review plus one P0/P1-only delta Review; the Owner additionally authorizes one final delta for only the direct parent's `review-spec-001`, with `review-spec` plus the minimum strict-v4 `review-design` engineering-axis witness over the same exact grant bytes and no further delta budget; one aggregate D1 Review plus at most two P0/P1-only delta Reviews; one Claude discussion at most one hour; one selected-Host enforcement qualification call at most thirty minutes; no automatic retry/fallback, purchase or top-up; expires at aggregate D1 Review `APPROVE`, Owner revocation, invalidation or applicable budget exhaustion
- Mandatory reviews: one admitted plan-mode current Review and its permitted P0/P1 delta, failing characterization before behavior repair, targeted driver/delegation suite, changed-Skill validation, full release verification, exact final diff, a fresh Codex task Review for each named task, aggregate D1 Review, and owner-visible retained P2/P3
- Stop conditions: material R2/intent reduction, need for credential/login/real-HOME/production mutation, unsupported Host requiring fail-open behavior, unprovable old writer with affected roots, same root cause surviving three fixes, or exhausted Review budget with P0/P1
- Persistence: recoverable test, transport, tool or process accidents are diagnosed and reconciled within the applicable named budget instead of abandoning the three-stage goal; this does not override a stop condition or authorize an unnamed effect
- Invalidation: Owner revocation, R2/decision/North Star digest drift, active Change conflict, work-package topology or effect expansion, unverified pre-existing dirty-file overlap, or provider call outside the named existing-entitlement budget
- Never granted: D2 or Run Supervisor work, a second/new Change, baseline acceptance, finalization/archive, commit, push, tag, publish, deploy, credential access/replacement, provider purchase, real-HOME installation, production mutation, Kimi coding or any other external effect
- Activation: stable verification of `.ultra/decisions/2026-09-01-vnext-r2-three-stage-goal.md` at SHA-256 `95910b47c77d69ea1f8a17db4325b7a5ce2b6d0680e63575bf606ac5fa5e1af9`, the exact R2 SHA, repository identity, Goal objective and this sole active Change activates only this bounded package; stored grant text alone is inactive, and no intent or task state can widen it

## Planning Posture

`SELECTIVE`: fix the reproduced safety gaps once at the existing shared delegation boundary,
reuse current process/driver/diff machinery, and add only tests and contract text consumed by
the accepted D1 outcome. Do not begin Supervisor or wake implementation.

## Recovery

The pre-D1 product base is HEAD `adb7bfe89f40e107d0c9c490076a6e74294b9337` plus
the locally finalized 5.0.2 product digest
`ec938773875ecc1f53ba71eae4e99c531d9fd498fc69ef51f9c1a8b0d661e528`.
Preserve all pre-existing dirty files. D1 recovery uses exact pre-attempt path/digest inventory
and ordinary file-level correction; no reset, checkout, commit, real-HOME mutation or archived
evidence rewrite is permitted. Any `outcome_unknown` freezes its worktree/roots.

## Unresolved Decisions

- `D1-UD-01` non-blocking: the minimum cross-platform inner-writer identity/fencing mechanism is selected only after the nested-writer RED fixture; Owner decision is required only if the safe fix needs a new public contract, credential, external service or durable daemon.
