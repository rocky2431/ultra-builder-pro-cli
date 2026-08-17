# Task v30-north-star-r3-primary-handoff: Implement the r3 North Star projection under primary transfer

## Context

**What**: Project the owner-directed r3 final design
(`docs/ULTRA-BUILDER-PRO-3.0-NORTH-STAR-R3.zh-CN.md` section 11) into the
repository as one coherent local work package: publish the r3 canonical North
Star revision, decision, and immutable snapshot; record the exact ZCode
sole-writer grant and this fresh task identity; synchronize the genuinely
affected specs, public docs, Skills, Hooks, Adapters, CLI, and tests; sink
topology, provider names, and exact review counts out of the constitution; add
the primary-transfer contract with a minimal live consumer while keeping
`ultra-delegate` least-authority; mark the ZCode app-bundled CLI/protocol
experimental; add behavior/permission/effect/recovery regressions and drills;
run the verification chain; freeze the exact report.

**Why**: The owner accepted the r3 design and executed an explicit primary
transfer from Codex to ZCode Desktop
(`.ultra/.runtime/handoffs/ubp3-r3-zcode/OFFER.json` + ready `ACK.json`, grant
`.ultra/decisions/2026-08-17-ultra-3-0-r3-primary-handoff.md`
`ubp3-r3-zcode-2026-08-17`): ZCode implements every change; Codex reviews
read-only after the freeze with a ten-round total cap targeting five and no
automatic extension.

**Constraints**:

- The accepted r3 design bytes and the transfer receipts are frozen inputs;
  never edit them.
- The completed task `v30-mode-b-local-implementation`, its evidence, and the
  Mode B grant record stay historical; do not reopen or rewrite them.
- No commit, push, tag, publish, release, deploy, real-HOME/global install,
  credential, production, purchase, or new paid effect.
- No A2A, Graph, LoopX, MCP server, daemon, database, queue, registry, workflow
  engine, Goal orchestration, or additional Agent; no spawned implementation
  agent; no ZCode Goal or automatic review scheduling.
- TDD for new behavior and bugs; no whole-prose regex locks replacing semantic
  design.
- P2/P3 observations do not extend scope or budget.

## Implementation

**Layers touched**: canonical `.ultra` authority (north-star r3, decisions,
ledger, active-Change reconciliation, this context), the primary-transfer
contract reference and validator under `skills/ultra-change/`, the live Skill
consumers (`ultra-change`, `ultra-status`, `ultra-delegate`), ZCode transport
maturity in the host profile and compatibility matrix, the affected specs and
public docs, and the test suite.

**Pattern**: TDD (the primary-transfer regression suite was written red
first), deletion-first where superseded phrasing is replaced, one frozen final
diff with exact evidence.

## Planned Path Inventory

Reconciled 2026-08-17 against the actual worktree diff at the Round 1 repair
freeze; the mechanically verified full inventory lives in the current handoff's
terminal RESULT receipt.

`CREATE`:

- `.ultra/decisions/2026-08-17-ultra-3-0-north-star-r3.md`
- `.ultra/decisions/2026-08-17-ultra-3-0-r3-primary-handoff.md`
- `.ultra/research/2026-08-17-ultra-3-0-r3-projection/north-star-v2-r3.accepted.md`
- `skills/ultra-change/references/primary-transfer.md`
- `skills/ultra-change/scripts/validate_primary_transfer.cjs`
- `tests/primary-transfer.test.cjs`
- `.ultra/contexts/task-v30-north-star-r3-primary-handoff.md` (this file)
- `.ultra/evidence/v30-north-star-r3-primary-handoff/verification.log`
- `.ultra/evidence/v30-north-star-r3-primary-handoff/zcode-to-codex-worker-drill-receipt.json`
- `.ultra/evidence/v30-north-star-r3-primary-handoff/zcode-to-codex-worker-drill-result.json`
- `.ultra/evidence/v30-north-star-r3-primary-handoff/external-review.json`

Reconciled 2026-08-17 (owner-directed blocker repair): the Codex external
review receipt is a Planned Path Inventory entry before the review — the
closeout-transition contract now enforces this mechanically, matching the
repository's evidence-directory audit.
- `docs/ULTRA-BUILDER-PRO-3.0-NORTH-STAR-R3.zh-CN.md` (the accepted design itself)

`MODIFY`:

- `.ultra/north-star.md` (r3 projection), `.ultra/tasks.json` (this row),
  `.ultra/changes/active/chg-ultra-3-0-mode-b/intent.md` (r3 reconciliation)
- `skills/ultra-change/SKILL.md`, `skills/ultra-status/SKILL.md`,
  `skills/ultra-review/SKILL.md` (Round 1 review-budget precedence),
  `skills/ultra-dev/SKILL.md` (Round 1 review-budget precedence),
  `skills/ultra-delegate/SKILL.md`,
  `skills/ultra-delegate/references/delegation-contract.md`,
  `skills/ultra-change/references/execution-grant.md` (Round 1 precedence rule)
- `adapters/_shared/host-profile.cjs` (Round 1: live `transportSurface`),
  `bin/delegate.cjs` (Round 1: `--ack-experimental` gate, transport receipt
  fields), `bin/delegate-worker.cjs` (Round 1: transport truth in results),
  `skills/ultra-test/scripts/worktree_digest.cjs` (Round 1: main-module guard,
  shared `PRODUCT_PATHSPEC`)
- `.ultra/specs/product.md`, `.ultra/specs/architecture.md`,
  `.ultra/specs/research-distillate.md`
- `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/ARTIFACT-AUTHORITY.md`
  (Round 1 precedence clause), `docs/WORKFLOW-LIFECYCLE.md` (Round 1 precedence
  clause), `docs/RUNTIME-COMPAT-MATRIX.md` (Round 1 live maturity enforcement),
  `README.md`, `AGENTS.md`, `CHANGELOG.md`
- `tests/north-star-v2.test.cjs`, `tests/delegate.test.cjs` (Round 1 transport
  regression), `tests/v026-contract.test.cjs` (Round 1 precedence assertions)
- `hooks/tests/test_v026_hooks.py` (r3 headings)
- `docs/wip/ultra-builder-pro-3.0-implementation.md` (replacement checkpoint,
  Round 1 refresh)

`DELETE`: none. An earlier draft of this inventory wrongly listed
`adapters/_shared/tests/runtime-assets.test.cjs` (never modified) and omitted
`tests/delegate.test.cjs`; both are corrected here.

## Acceptance Criteria

**Change Acceptance IDs**: [`AC3-08`, `AC3-09`, `AC3-10`, `AC3-11`, `AC3-12`, `AC3-13`, `AC3-14`]

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| T4-01 | r3 North Star revision validates accepted with its decision and byte-identical immutable snapshot; r2 history stays byte-stable | `command` | validator output with exit code; snapshot byte comparison |
| T4-02 | Exact ZCode sole-writer grant and fresh task identity recorded; completed Mode B task untouched | `inspection` | grant decision bytes; ledger diff |
| T4-03 | Primary-transfer contract has a mechanical validator and live consumers; mutual exclusivity, mismatch-blocked, stale/revoke/interrupt/resume/cancel/missing-receipt recovery regressions pass | `command` | narrow suite output |
| T4-04 | `ultra-delegate` worker least-authority boundary unchanged: no worker `.ultra` write, no delegation-to-transfer upgrade | `command` | delegation suite plus transfer suite |
| T4-05 | ZCode app-bundled CLI/protocol marked experimental with the documented support bar | `inspection` | host profile, compatibility matrix |
| T4-06 | Recovery drills recorded: temp-repo drill matrix in suite, real ZCode primary readback, ZCode→CLI bounded worker drill | `command` + `external-observation` | verification log with exact commands and results |
| T4-07 | Package verification chain passes (node suite, hooks, Skill validators, verify:release, pack dry-run, isolated install/Doctor) and the frozen report enumerates paths, fakes, limitations, not-done, external effects | `command` + `owner-judgment` | verification log; RESULT receipt |

## Narrow Verification

- `node --test tests/primary-transfer.test.cjs`
- `node skills/ultra-change/scripts/validate_primary_transfer.cjs <repo-root>`
- `node skills/ultra-research/scripts/validate_north_star.cjs .ultra/north-star.md`
- `npm run test:node`, `npm run test:hooks`, `npm run verify:release`
- `npm pack --dry-run --json`
- Isolated temporary HOME/config `node bin/install.js --all --global --doctor --json`
- Skill Creator validation for every changed Skill

## Trace

**Source**: `.ultra/north-star.md#north-star-outcomes`

**First principles**: [`FP-1`, `FP-2`, `FP-3`, `FP-4`, `FP-5`, `FP-6`, `FP-7`, `FP-8`]

**Serves**: [`NS-01`, `NS-02`, `NS-03`, `NS-04`, `NS-05`]

**Causal contribution**: the r3 projection keeps meaning, topology, and budget
with the owner and the model, mechanizes only receipts, identity, permissions,
effects, and recovery, and makes Agent handover exclusive and verifiable — the
direct instrumentation of the r3 constitutional outcomes.

**Hard constraints**: [`HC-1`, `HC-2`, `HC-3`, `HC-4`, `HC-5`, `HC-6`, `HC-7`, `HC-8`]

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|------|----------------|--------|---------------|--------|
| 2026-08-17 | — | Initial task contract under the r3 primary-transfer grant | — | Accepted r3 design and verified OFFER/ACK |
| 2026-08-17 | documentation | Replaced the WIP checkpoint, added the drill evidence Planned Path entries, and refreshed the Resume Note; the ledger row stays `in_progress` — task Completion remains pending review | — | Pre-freeze documentation refresh (not a closeout; Completion stayed pending) |
| 2026-08-17 | repair | Owner-authorized Round 1 repair pass (handoff `ubp3-r3-zcode-desktop-r1`): phase-correct transfer validation, bounded no-follow receipt reads, v2 terminal binding with exact full-subject inventory, review-budget precedence (grant overrides product default, same-root architecture stop), live ZCode experimental transport acknowledgment, PPI/Change Log honesty reconciliation | — | Codex Round 1 review blocker set; completion still pending |
| 2026-08-17 | repair | Owner-authorized Round 2 repair pass (handoff `ubp3-r3-zcode-desktop-r2`): fail-closed bounded stable validation via the one shared snapshot primitive (git-unavailable false green fixed, parent-chain walks, directory entry replay, same-subject supersession, coherent digest×manifest observation, stable revoked evidence, invalid-path no-access) and `experimental_ack` on every ZCode delegated terminal result | — | Codex Round 2 affected-delta blockers on the two original roots; completion still pending |
| 2026-08-17 | repair | Owner-authorized Round 3 repair pass (handoff `ubp3-r3-zcode-desktop-r3`): repo-wide handoff-root discovery reuses the one stable directory observation — symlinked/unreadable/malformed/drifting/oversize roots and entries fail typed instead of silently reading as zero handoffs; absent root still means no transfers | — | Codex Round 3 affected-delta blocker on the same bounded-validation root; completion still pending |
| 2026-08-17 | architecture-reset | Owner-authorized same-root architecture reset (handoff `ubp3-r3-zcode-desktop-architecture-reset`): one shared ancestor-first optional-directory observation primitive for the repo-wide handoffs root and required handoff directories; the split final-leaf preflight and the second scanner were deleted | — | Same root survived three repairs; point-patching stopped by the owner's three-failed-fix rule |
| 2026-08-17 | repair | Owner-authorized corrected host-memory effect-honesty pass (handoff `ubp3-r3-zcode-desktop-host-memory-v2`, total review round 5, after the first host-memory OFFER was validly blocked pre-write for an overconstrained three-flag precondition): Workspace Memory contract corrected in `docs/RUNTIME-COMPAT-MATRIX.md` (operator-controlled `memoryEnabled` master gate, was observed enabled, browsable/clearable non-authoritative store, enabled ⇒ disclosed Host external effect, r3 design §7.1 snapshot marked superseded unedited) and `skills/ultra-change/references/primary-transfer.md` (Host post-turn external-effects receipt semantics: OFFER effects must allow enabled memory, RESULT `external_effects` must disclose it, strict zero-effect = fresh task + `memoryEnabled=false` + independent reviewer postflight), plus the smallest rejecting contract test in `tests/v026-contract.test.cjs` | — | Codex round-5 affected-delta root: the architecture-reset RESULT's `external_effects: []` was false because Host post-turn memory extraction ran outside the repository; completion still pending |
| 2026-08-17 | repair | Owner-authorized closeout-transition contract pass, executed directly under the durable grant `ubp3-r3-zcode-2026-08-17` with no new handoff (owner directive): added the versioned closeout-transition contract `ultra-primary-transfer-closeout-v1` (CLOSEOUT receipt beside a newest completed v2 RESULT; one uncommitted prescribed closeout over exactly ledger/context-closeout-sections/final-evidence; frozen ledger-rows-ex-task, context-prefix-before-closeout-headings, and pre-review-evidence-sibling scopes; recorded owner-authorized continuation between freeze and closeout; starts no review/handoff; never commits; terminal and one-shot) to the primary-transfer reference and its mechanical validator, with the ultra-dev closeout, Artifact Authority, lifecycle, and CHANGELOG consumers synchronized — RED first (the prescribed closeout writes against the frozen v2 RESULT produced `result_digest_mismatch` + `result_frozen_input_digest_mismatch`, the architecture root), then GREEN (32/32) | — | The mandated post-review closeout previously invalidated the immutable newest v2 RESULT with no legal escape (re-freeze / new handoff / commit each loop or conflate effects); completion still pending |
| 2026-08-17 | repair | Owner-authorized repair of the one shared P1 contract root found by the Codex review round on the Phase-A subject (still under the durable grant, no new handoff/review/receipt type): the closed task's ledger row is now bound ex-status — unique, `in_progress` at closeout start, `completed` at the end, every field except `status` pinned by a canonical ex-status digest recorded in `subject_before`/`subject_after` and re-read live (missing/duplicate/current-row field drift are typed `closeout_task_row` stops), and `authorized_by` now binds the existing `ultra-external-review-receipt-v1` semantics read-only (identified read-only reviewer, exact task and change identity, reviewer-authority and reviewed-contract refs by stable bytes, subject HEAD/worktree digest equal to the closeout start, `approve` verdict with no P0/P1 finding; typed `closeout_authorization` stops) — both Codex mutants (row-title drift during closeout; a request_changes+P1 receipt with recomputed SHA) reproduced RED first, then GREEN (34/34) | — | Codex P1: the closeout receipt previously bound only the whole-ledger digest and the authorization receipt's SHA, so a mutated current row or a substituted non-approve review receipt still validated; completion still pending |
| 2026-08-17 | repair | Owner-directed Phase-A blocker repair (still under the durable grant, no new handoff/review): the interrupted Phase-B closeout was rolled back byte-exactly to the closeout-start state (product digest `262a42da…` recomputed and proven; context restored to SHA-256 `083c64c7…` from the session rollout log's ground-truth Read plus the exact Edit history — applied edit indices 3, 4, 6, 19363 bytes; ledger back to `c2f177d0…` with only `status` reverted; CLOSEOUT.json and evidence.json removed; the frozen OFFER/ACK/RESULT bytes never touched), then the two red-test blockers were fixed at their roots: the external-review receipt must now be a Planned Path Inventory entry before the review (validator-enforced `closeout_authorization` stop + this PPI reconciled + the transfer-suite regression), and the v026 repository-state test now models both lifecycle states (in_progress pre-closeout, or completed with the canonical six-dimension evidence record and the applied CLOSEOUT receipt closing the frozen RESULT) instead of pinning one transient snapshot | — | The two red repository tests after the first closeout attempt were Phase-A architecture blockers, not disclosures; completion still pending |
| 2026-08-17 | repair | Codex final delta review, one same-root blocker (last correction, no adjacent changes): the closeout contract's PPI-planning check accepted a substring (`section.includes(authPath)`), so a near-match planned line ending `external-review.json.bak` passed while the repository artifact audit accepts only exact `- \`path\`` bullets; the validator now parses the PPI section into the same exact bullet-path Set and requires `set.has(authPath)`, with a `.bak` near-match variant added to the unplanned-receipt regression (RED first, then GREEN 35/35) | — | The contract and the artifact audit must agree exactly on what "planned" means; completion still pending |

## Open Questions

- None blocking. Delivery, archival, versioning, and every release effect
  remain separate owner decisions.

## Resume Note

Task closed out 2026-08-17 under the prescribed closeout-transition contract
(`ultra-primary-transfer-closeout-v1`): after the Codex final bounded delta
review returned APPROVE with no remaining P0/P1 on the final Phase-A subject
(`.ultra/evidence/v30-north-star-r3-primary-handoff/external-review.json`,
SHA-256 `23bf0fa51c4e70f8d4faf2dfcc794485459dad45bad1dd522c569f54bf423cd1`,
planned as an exact Planned Path Inventory bullet), this one prescribed
closeout published the canonical `ultra-task-evidence-v2` external-manual
record, rewrote exactly these three context sections, and flipped the ledger
row to `completed` — no other field. The closeout published `CLOSEOUT.json`
beside the frozen host-memory-v2 RESULT with a continuation recording the
authorized Phase-A passes (contract, P1 root repair, blocker repair, exact
PPI matching) from the frozen `2beef028…` subject; it started no review and
no handoff and committed nothing. Delivery, archival, versioning, and every
release effect remain separate owner decisions. Next reader: recapture from
the repository (grant, north-star r3, evidence records, handoff receipts,
the frozen verification log); this note is navigational context only and
cannot override the grant, acceptance, scope, or any review verdict.

## Task Review

- Execution Grant state: durable work-package `ubp3-r3-zcode-2026-08-17`,
  activated through the verified primary transfer and continued by the
  owner-authorized repair handoffs r1–r3, the architecture reset, the
  corrected host-memory effect-honesty handoff, and the owner-directed
  Phase-A closeout-transition passes executed directly under the grant with
  no new handoff; the grant expires on this reviewer acceptance per its
  terminal rule.
- Review mode: external-manual — complete. The Codex root read-only reviewer
  returned `approve` with zero findings on the final Phase-A subject; the
  real receipt is bound by exact bytes in the canonical evidence record and
  in the handoff's CLOSEOUT receipt. The changing local `ultra-review` never
  approved this work.
- Summary ref/digest: external-manual branch — the real external receipt
  `.ultra/evidence/v30-north-star-r3-primary-handoff/external-review.json`
  (SHA-256
  `23bf0fa51c4e70f8d4faf2dfcc794485459dad45bad1dd522c569f54bf423cd1`) is the
  review summary product bound by exact bytes in the canonical evidence
  record; no strict SUMMARY or session exists or is needed.
- Blocking findings: none remaining. Every P1 found across the review rounds
  was repaired before the final APPROVE — the closed ledger row is bound
  ex-status, the authorization receipt's existing
  `ultra-external-review-receipt-v1` semantics are enforced, and the receipt
  is planned as an exact Planned Path Inventory bullet matching the
  repository artifact audit — each with RED/GREEN regressions retained in
  the frozen verification log.
- Retention: retain the exact transfer receipts, the external review receipt,
  the canonical evidence record, the verification log, and the frozen WIP
  checkpoint bytes; each is a reconstructable or derived observation, never
  semantic authority.

## Completion

Completed 2026-08-17. T4-01 through T4-07 are dispositioned in
`.ultra/evidence/v30-north-star-r3-primary-handoff/evidence.json`
(`ultra-task-evidence-v2`, external-manual branch, completion snapshot
`84cf4187c40ff2551ac4999a16600e5a4d8ad0780ada272c7fb49d74404866f6` at HEAD
`9a759003aa77d1a88e1275d70d2c887ee05da993`); the one prescribed closeout is
recorded in
`.ultra/.runtime/handoffs/ubp3-r3-zcode-desktop-host-memory-v2/CLOSEOUT.json`.
