# Task vnext-d1-runtime-safety-boundary: Close descendant environment and writer-truth gaps

## Current Stage B activation - 2026-09-06

The Owner subsequently approved the complete factory implementation and all in-scope
local repair, with actual ZCode/Kimi/CC authoring implementation/tests and Codex
reviewing and alone committing each accepted stage. The current source of authority
is `.ultra/decisions/2026-09-05-owner-factory-implementation.md`; the active Stage B
scope and finite operator dispatch boundaries are recorded in
`.ultra/decisions/2026-09-06-stage-b-implementation-scope.md`. Older retry-unavailable,
research-only, exhausted-round and no-commit statements below describe the retained
September 1-2 history and do not veto this current Owner request. Their failed
observations and unclosed acceptance criteria remain binding facts.

The current Stage B mission, exact writable worktrees and activated writer are in
`work/owner-factory-implementation-20260905/stage-b-zcode-mission.md` and
`stage-b-worktrees.json` / `stage-b-dispatch.json` in the same directory. This
activated inventory includes the required existing ACPX public programming consumer,
its UBP adapter, canonical ZCode patch/digest and focused regressions described there;
it does not activate Run Slice/wake/Step 1 implementation. Original dirty bridge and
unrelated Goal/agent-delegation checkout work stay protected.

Keep this task in_progress until Codex has reviewed current source, the relevant
independent checks and real observations, then published the fresh strict Review
and completion evidence. Never edit the old negative qualification or promote
unattempted dimensions. An operator-selected finite coding/qualification ceiling
is not a numeric budget quoted from the Owner.

## Context

**What**: Repair the existing single-delegation runtime so driver selection and every
descendant receive only a target-aware environment, and so status/cancel/recovery can
prove the complete active writer boundary or return `outcome_unknown` without launching
a second writer.

**Why**: R2 fan-out would multiply two current shared-boundary failures: Primary
session/notifier credentials flow into Workers, and a dead outer worker can be reported
cancelled while its detached Host child may still write. Closing the root once preserves
the existing N=1 path and makes later Run Slices safe to compose.

**Constraints**:
- ZCode is the sole implementation-code writer; Codex writes only coordination and Review artifacts.
- Start with a failing fixture for each named failure and reuse current runner/driver/process helpers.
- Preserve ACP-first selection, typed CLI fallback, result schema and actual Git-diff enforcement.
- Do not add Supervisor, wake, daemon, database, generic lease service or new dependency.
- No commit, push, install, credential change, real external effect or real-HOME mutation.

## Implementation

**Layers touched**: delegate admission and probe -> detached worker -> ACP/CLI driver ->
inner writer observation -> status/cancel/recovery -> focused contracts.

**Pattern**: reuse `writeAtomic`, stable digest checks, `run.lock`,
`terminateProcessGroup`, Host profiles, the existing fake ACP nested-child fixture and
launcher-side `failure_type`. Keep all new runtime files derived and non-authoritative.

**Tech Notes**:
- Build one canonical target-aware environment policy at `delegate run`, then derive
  immutable role-scoped views from it: probe gets only Host discovery/auth inputs;
  delegate-worker additionally gets the three launcher-local `UBP_DELEGATE_*` packet
  paths; the final ACP/CLI Host gets neither those paths nor Primary controls. No driver
  may merge `process.env` back in, and exact instruction/permission bytes remain in the
  digest-bound prompt rather than becoming Host-readable control-artifact paths.
- Remove Primary control-plane variables and unrelated env-carried provider secrets by
  policy, while retaining minimum process/runtime variables and the selected Host's
  explicitly required authentication/config discovery. Do not claim protection from
  file-based credentials reachable through `HOME`.
- Inject unique non-production canaries for a Primary control key, an unrelated provider
  key and selected-Host authentication during fixtures. Assert required key presence
  without printing its value, then byte-scan worker spec/result/receipt, bounded output,
  events and retained evidence/log artifacts for every prohibited canary.
- Persist a bounded atomic inner-writer observation with PID/process-group, platform,
  command identity and start identity. Status/cancel derives `stopped | alive | unknown`;
  an unproved boundary is launcher-side `status: failed`,
  `failure_type: outcome_unknown`, not a new model-facing result status.
- Acquire one atomic worktree/root writer fence before launch. Release it only after the
  matching writer boundary is proven stopped; no TTL or automatic stale-lock deletion.
- Keep existing truthful `cancelled` or `timeout` behavior only when the full writer
  boundary is proven stopped. Check every consumer of `failure_type`, including ACP
  conformance; an alive or unprovable writer after either path stays `outcome_unknown`.

**Earliest observable slice**: fake children capture env-key names at all four launch
seams while retained artifacts are scanned for unique canaries, and a fake nested writer
survives outer-worker death or timeout. Before the repair the tests show leaked controls,
Host-visible packet paths and false terminal results; after the repair they show role-scoped
views plus `outcome_unknown`/frozen roots until the writer is proven stopped.

**Fresh-session recovery**: repository root -> HEAD
`adb7bfe89f40e107d0c9c490076a6e74294b9337` -> sole active D1 Change -> ledger row
`vnext-d1-runtime-safety-boundary` -> this Resume Note -> stable-verify grant decision
SHA and inspect the exact pre-attempt digest inventory before resuming the same ZCode packet.

## Planned Path Inventory

`CREATE`:

- `.ultra/contexts/task-vnext-d1-runtime-safety-boundary.md`
- `.ultra/decisions/2026-09-01-vnext-r2-three-stage-goal.md`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/evidence.json`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/evidence-reopen-20260902.json`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/verification.log`
- `work/vnext-step1-claude-architecture-discussion.md`
- `work/vnext-d1-zcode-runtime-safety-boundary.md`

`MODIFY`:

- `.ultra/changes/active/chg-ultra-vnext-d1-delegation-safety/intent.md`
- `.ultra/tasks.json`
- `docs/wip/ultra-builder-pro-vnext-three-stage-delivery-state.zh-CN.md`
- `skills/ultra-delegate/scripts/agent-execution-driver.cjs`
- `skills/ultra-delegate/scripts/delegate.cjs`
- `skills/ultra-delegate/scripts/delegate-worker.cjs`
- `skills/ultra-delegate/scripts/acp-driver.cjs`
- `skills/ultra-delegate/scripts/cli-driver.cjs`
- `skills/ultra-delegate/scripts/host-profile.cjs`
- `tests/acp-driver.test.cjs`
- `tests/acp-conformance.test.cjs`
- `tests/delegate.test.cjs`
- `tests/fixtures/fake-acp-agent.cjs`

Any later addition, removal, or rename in this inventory or the Public Seams below is
plan-critical and requires a rebuilt ZCode task packet and Codex plan disposition before
implementation continues.

Stage B raw evidence retention disposition: Codex records these exact regular-file additions under the current full Owner implementation authority. They preserve original failures and independent verification; they add no runtime or semantic scope. The original grouped diagnostic is retained under work/evidence with the exact relocation record below.

- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-p1-correct-pass.log`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-p1-mutation-fail.log`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-protocol-root-raw-index.json`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-final-cancel-combination.log`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-final-doctor.log`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-final-driver-combination.log`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-final-entry-combinations.json`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-final-narrow.json`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-final-narrow.log`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-final-other-checks.json`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-final-pack.log`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-final-release.json`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-final-release.log`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-final-skill.log`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-protocol-diff.log`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-protocol-entry-suite.json`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-protocol-entry-suite.log`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-protocol-entry.json`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-protocol-narrow.json`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-protocol-narrow.log`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-protocol-other-checks.json`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-protocol-pack.log`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-protocol-release-subject-before.json`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-protocol-release.json`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-protocol-release.log`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-protocol-skill.log`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-release-after-fixture-isolation-subject-before.json`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-release-after-fixture-isolation.json`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-release-after-fixture-isolation.log`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-runtime-raw-index.json`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-wrong-version-relocation.json`

- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-protocol-release-after-evidence-reconciliation.log`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-protocol-release-after-evidence-reconciliation.json`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-protocol-release-after-evidence-reconciliation-subject-before.json`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-protocol-final-raw-index.json`

- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-protocol-review-timeout-replay.log`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-protocol-review-timeout-replay.json`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-protocol-release-final.log`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-protocol-release-final.json`
- `.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-root-protocol-release-final-subject-before.json`

## Public Seams

- installed `ultra-delegate/scripts/delegate.cjs run|status|cancel`
- `AgentExecutionDriver` selection/probe context and ACP/CLI process launch
- `run.lock`, writer observation, worktree fence, receipt and terminal `failure_type`
- existing `ultra-delegation-result-v1` status enum remains unchanged

## Narrow Verification

- `node --test tests/delegate.test.cjs tests/acp-driver.test.cjs tests/acp-conformance.test.cjs`
- inspect role-scoped fake-child env-key capture and canary absence across every retained
  spec/result/receipt/output/event/evidence/log artifact; never print secret values
- inspect nested cancel and timeout process/writer identity plus `outcome_unknown` recovery
- inspect fence conflicts for exact worktree, parent/child root overlap, symlink/filesystem
  aliases and Windows case/separator aliases; prove disjoint worktrees remain admissible
- `git diff --check -- skills/ultra-delegate/scripts tests/delegate.test.cjs tests/acp-driver.test.cjs tests/acp-conformance.test.cjs tests/fixtures/fake-acp-agent.cjs`

## Acceptance Criteria

**Change Acceptance IDs**: [`D1-AC01`, `D1-AC02`, `D1-AC04`]

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| D1R-01 | Probe, delegate-worker, ACP and CLI descendants observe no Primary control-plane or unrelated env-secret keys; only the worker receives the three launcher-local `UBP_DELEGATE_*` packet paths, while the final Host receives minimum selected-Host runtime/auth inputs and no canonical control-artifact path | `command` | focused role-scoped fake-child RED/GREEN output with key names only plus byte scans proving unique prohibited canaries are absent from every retained spec/result/receipt/output/event/evidence/log artifact |
| D1R-02 | Outer-worker death, cancel or timeout with a live or unidentifiable nested writer returns launcher-side `failure_type: outcome_unknown`, preserves the worktree fence and never synthesizes `cancelled` or `timeout`; only a proven-stopped boundary may retain those terminal failure types | `command` | nested-process matrix for live inner, stopped inner, cancel acknowledgement, timeout and stale/reused identity |
| D1R-03 | Two delegation ids cannot concurrently acquire physically identical or overlapping worktree/roots, and a fence is released only after matching writer stop proof | `command` | table-driven atomic fixtures for exact worktree, parent/child roots, symlink/filesystem aliases and Windows case/separator aliases, plus a disjoint-worktree positive case and fence identity/readback evidence |
| D1R-04 | Proven-stopped cancellation/timeout, ACP/CLI selection, typed results, actual changed-path checks, ACP conformance consumption of `outcome_unknown` and prior N=1 behavior remain green | `command` | current targeted suites, including explicit conformance receipt/diagnostic coverage and the existing lost-terminal/cancel assertion, all pass |
| D1R-05 | The implementation adds no semantic next-step logic, durable lease, new result status, provider-brand branch or unplanned dependency | `inspection` | Codex source/diff inspection bound to the current task Review subject |

## Definition of Drift

- Adding Run Slice, batch, barrier, Attention, wake or retry routing to this task.
- Treating a PID, timeout, status file or receipt as proof of stop without identity evidence.
- Deleting a stale fence by age, or changing the model-facing result status enum.
- Replacing env isolation with a growing one-off delete list at every spawn call.
- Letting a fake test stand in for the real Host enforcement observation owned by the next task.

## Trace

**Source**: `.ultra/specs/architecture.md#delegation-boundary`

**First principles**: [`FP-1`, `FP-2`, `FP-3`, `FP-5`, `FP-6`, `FP-8`]

**Serves**: [`NS-02`, `NS-03`, `NS-04`, `NS-05`]

**Causal contribution**: one shared, identity-bound launch/recovery seam prevents
delegated capability from acquiring Primary controls or a second writer, while preserving
truthful recovery evidence for later provider-neutral orchestration.

**Hard constraints**: [`HC-1`, `HC-2`, `HC-3`, `HC-4`, `HC-5`, `HC-6`, `HC-7`, `HC-8`]

**Decisions**: `.ultra/decisions/2026-09-01-vnext-r2-three-stage-goal.md`

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|------|----------------|--------|---------------|--------|
| 2026-09-01 | — | Initial creation | — | D1 plan decomposition after fresh Claude Step 1 architecture discussion and Codex source verification |
| 2026-09-01 | plan delta | Bound role-scoped env, canary scan, timeout, physical-root fencing and ACP conformance falsifiers | — | Resolve blocking findings `review-spec-002`, `review-tests-001`, `review-tests-003`, `review-tests-004` and `review-errors-001` from the admitted Plan Review |
| 2026-09-01 | task Review | Initial runtime-safety Review returned `REQUEST_CHANGES` with one duplicated P1 root across five lenses | — | Green tests omitted the post-spawn `pid:null` gap and unavailable/unsupported outer-worker identity; lock-claim readback also omitted exact start-identity comparison |
| 2026-09-01 | completion evidence | Published validated Task Evidence v2 after the bounded ZCode delta and independent Codex delta Review | — | The exact 92-test gate, syntax/diff checks, 69-entry frozen-scope audit and strict Review replay all passed; all six initial P1 findings are resolved and three named P2s remain retained |
| 2026-09-02 | evidence-correction reopen | Reopen D1R-01 through D1R-05 without implementation changes; preserve both prior Review sessions as historical evidence | — | The published v2 record hashed the canonical Acceptance section with one extra LF (`b73d12a6…`) instead of the validator's exact bytes (`5d8cda45…`), so the completed task must return to `in_progress`, receive a fresh focused Review of the current integrated subject, and publish a replacement evidence record |
| 2026-09-02 | replacement completion evidence | Published a structurally valid replacement Task Evidence v2 after fresh strict Review `vnext-d1-runtime-safety-delta-2-evidence-reopen-review-20260902` | — | The current integrated 97-test gate, syntax/diff checks and Review replay pass; the record now binds the exact Acceptance bytes, current completion snapshot and retained Review, with no implementation repair |
| 2026-09-02 | completion read-back repair | Return the just-written ledger completion to `in_progress` and correct only the current evidence artifact projection | — | The focused completed-task consumer rejected historical Review summaries inside `artifacts`; historical sessions remain retained by `task_review.retention`, while every `.ultra/reviews/*` artifact entry must equal the current `task_review.summary_ref`. This is a post-Review evidence assembly correction, not a new subject, criterion or implementation change |
| 2026-09-02 | completion read-back | Completed-task evidence consumption and the full release gate passed after the bounded artifact projection correction | — | Task 1 is again ledger `completed`; Node 712/712, Hooks 89/89 and npm audit all pass, so Task 2 delta Review may proceed |
| 2026-09-02 | aggregate Review reopen | Reopen `D1R-01` and `D1R-02` after aggregate Review `vnext-d1-aggregate-review-20260902` returned `REQUEST_CHANGES` at summary SHA-256 `1ce9dfed3700a1d743cdfdac6ac3dad562cf5d44fe7902cbd3f68767a064b558` | — | `review-tests-001` proves the real delegate-worker environment seam is not covered, and `review-errors-001` proves outer-worker `EPERM` is incorrectly classified as stopped. Both are current P1 gaps in the previously completed task. |

## Open Questions

No runtime-task decision is pending under the current full Owner implementation authority. Real exact-build ZCode qualification and all C/D/E work remain separate unfinished work; this runtime completion does not authorize a support claim or factory completion.

## Resume Note

Current runtime completion is supported by canonical Task Evidence v2 SHA `61b076aa5d9541511cc8b8c3587ff726280cf765fc97b1117eaf3c85c40bf6ac`, with completion subject HEAD `b765b55cca0e1eaacebc738a68de77906bb50756` and digest `5e5f129f96493c0fc8e08dc5356ef6d2395c50e9a73ef85676d77e905fb5d0a2` observed at `2026-09-05T22:02:54.454872+00:00`. Read the current Task Review and exact raw evidence before reuse. Acceptance SHA remains `5d8cda45a87088bd082e74dc84230333fad8567d5b022212000cf16157a9cb5e`. The ledger owns status.

The direct-parent protocol repair is approved; the two parent P1 findings describe one repaired root cause. Preserve all old failed runs, the original negative Host record, and three nonblocking P2s. Reviewer-authored ephemeral probes exceeded the Owner author-role boundary and are excluded from acceptance evidence. No actual ZCode permission qualification or Stage B commit has happened. Proceed next to the independently bounded Task 2 prepare/record/execute path with final entry f734ed38…, pinned SDK0.13.2 and repaired bridge r1; never reuse the consumed old negative attempt.

## Superseded completion snapshot

- Completion subject: HEAD
  `adb7bfe89f40e107d0c9c490076a6e74294b9337`, product-worktree digest
  `08b259313b64823ec4e93ac75ba7833385f65d9dd2b2f3e249a455a709f7aabc`,
  observed `2026-09-01T16:41:17Z`.
- Verification: the current integrated targeted command passed `97/97` with zero
  failure/skip; three `node --check` invocations, scoped `git diff --check`, strict
  Review replay and the Task Evidence v2 validator all exited 0.
- Current integrated implementation hashes include:
  `delegate.cjs` =
  `a9ec2e57e50d236cd12c349bf1b020730f40d25e8c6bb079e4236521dd386943`;
  `delegate-worker.cjs` =
  `a7ee8530346f2fb2d8868aba9c207edc5df730377e54c270fbfa8b143ffc8373`;
  `tests/delegate.test.cjs` =
  `ce41b399f85cfa6a1b8d02313949aa3c45ff5f09192596ef04a1c8441d2b7b77`.
- Retained P2s: Host-created sessions may escape portable process observation;
  non-Linux start identity is weaker; a crash while holding the fence-registry `.lock`
  can leave it stale. They are reported and routed, not auto-repaired.
- No commit, push, tag, publish, deploy, real-HOME installation, credential operation,
  package fetch, production mutation or other external effect was performed.

## Task Review

- Execution Packet: available, SHA `f06f087cf90b8f7e959963b4bc55a6577b51f91c7220027feb29c0f14a60b093`.
- Session: `vnext-d1-runtime-stage-b-protocol-delta-review-20260906`; SUMMARY SHA `702e50fd4f7329c3eb00da7e586c9fd73911373650abe3390a30e7d2042e440f`.
- Three isolated specification/code/test lenses; strict summary snapshot replay exited0 with APPROVE, P0=0/P1=0/P2=3/P3=0.
- Direct-parent `review-code-001` and `review-tests-002`: resolved by actual public-store negotiation observation/refusal, truthful UBP version reporting and the real entry/driver regression. Full dispositions and raw refresh refs are in canonical evidence.
- The code review's five ephemeral inline fake-Agent probes were a role-boundary deviation, acknowledged and stopped. They provide no formal acceptance evidence; retained source inspection and Root-run existing authored checks support approval.
- Retain this exact packet, admission, lens union and SUMMARY plus every historical failure until aggregate Test/Deliver have consumed the task. Do not reconstruct receipts or auto-repair the retained P2s.

## Completion

Canonical evidence: `.ultra/evidence/vnext-d1-runtime-safety-boundary/evidence.json`, SHA `61b076aa5d9541511cc8b8c3587ff726280cf765fc97b1117eaf3c85c40bf6ac`. Root independently passed105 focused checks,58 related-source tests and final737 Node+104 Hook/audit0; pack142, changed-Skill validation and diff checks passed. Source snapshots were unchanged. Completion freshness and strict Review provenance are separate observations; later metadata or aggregate worktree changes do not rebind either.

## Superseded September 2 recovery and Review text

The following text is preserved history, superseded by the current Owner authority and current sections above.

### Open Questions

- Owner checkpoint required: Task 1 already consumed its initial implementation attempt,
  Repair 1, Repair 2 including the bounded timeout continuation, and its initial plus two
  delta Task Reviews. Closing the two new aggregate P1s therefore requires one newly named
  ZCode repair attempt and one newly named Task 1 delta Review; current authority does not
  permit either.


### Resume Note

The admitted aggregate Review is immutable at
`.ultra/reviews/vnext-d1-aggregate-review-20260902/SUMMARY.json`, SHA-256
`1ce9dfed3700a1d743cdfdac6ac3dad562cf5d44fe7902cbd3f68767a064b558`, verdict
`REQUEST_CHANGES`, with P0=0, P1=3, P2=8 and P3=1. Task 1 owns two blocking findings:

- `review-tests-001`: the required probe, delegate-worker, ACP and CLI process-seam matrix
  never observes the real detached delegate-worker environment, so `D1R-01` is not fully
  protected by a regression;
- `review-errors-001`: `processAlive()` maps every `kill(pid, 0)` error, including
  `EPERM`, to false, allowing outer-worker recovery to claim `stopped` and potentially
  release a lock/fence without proof, violating `D1R-02`.

No repository delegation or recent Agent-delegation run has an active `run.lock`; no
active ZCode writer is observable. The ledger must remain `in_progress`. The prior Task
Evidence v2 and its three Review sessions are retained as superseded completion evidence,
not consumed as current closure. Do not edit implementation until the Owner names one
additional ZCode repair and one additional Task 1 delta Review. Do not expand into
Supervisor, wake, Step 1, commit, release, installation, credential, production or other
external effects.


### Task Review

- Execution Packet state/digest/limitation: the evidence-reopen delta-2 Worker Packet is
  available at SHA-256
  `95ea15a75a0a61792f38f11e6222c0f08a0deab86eef17243b20622f71ef26e5`;
  the focused Review ran in sequential shared Codex context and does not imply
  stage-level Claude co-review.
- Review session identity and summary digest:
  `vnext-d1-runtime-safety-delta-2-evidence-reopen-review-20260902`;
  `752708c7a8d6b53871ef0b749e10d04ba980cfea69996387f7f3c3366bb8b89b`;
  verdict `APPROVE`, P0=0, P1=0, P2=0, P3=0.
- Blocking finding dispositions: the current Review has no P0/P1 finding. The six
  original P1 dispositions remain historical in the delta-1 session; they are not copied
  into or reconstructed by this Review.
- Retention: retain the initial, delta-1 and evidence-reopen delta-2 strict Review
  sessions, including every WORKER-PACKET, ADMISSION, selected specialist artifact and
  SUMMARY, until aggregate Test and Deliver consume Task 1. Premature loss requires a
  fresh Review and Test; never reconstruct an old receipt.

---
*Generated by ultra-plan*
