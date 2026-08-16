# Task v027-task-acceptance-v2: Make the task ledger authoritative and acceptance evidence typed

## Context

**What**: Make `.ultra/tasks.json` the sole task-status authority; define typed command,
inspection, owner-judgment, and external-observation acceptance evidence; retain legacy
read compatibility without arbitrary semantic numeric gates.

**Why**: Cross-Host resume cannot be reliable while status has two writers, and
automation cannot safely interpret every product claim as an executable command.

**Constraints**:
- Ledger wins only for mechanical task status; the model still interprets semantics.
- Old contexts and `complexity` fields remain readable and produce migration diagnostics.
- Blocking task review completes before a task becomes `completed`.
- Historical dirty work receives limitations, never invented red-first evidence.

## Implementation

**Layers touched**: canonical ledger, context format, evidence writer/consumer, resume,
Hook observation, and project migration.

**Pattern**: exact schema diagnostics as sensors; owner/model retains meaning.

## Planned Path Inventory

`MODIFY`:

- `.ultra-template/tasks.json`
- `.ultra-template/contexts/TEMPLATE.md`
- `.ultra-template/test-report.json`
- `.ultra/tasks.json`
- `.ultra/specs/product.md`
- `.ultra/specs/architecture.md`
- `.ultra/specs/research-distillate.md`
- `.ultra/evidence/v027-north-star-v2/evidence.json`
- `.ultra/contexts/task-v027-north-star-v2.md`
- `.ultra/contexts/task-v027-task-acceptance-v2.md`
- `.ultra/contexts/task-v027-autonomy-packet.md`
- `.ultra/contexts/task-v027-adversarial-lifecycle.md`
- `.ultra/contexts/task-v027-delegation-snapshot.md`
- `.ultra/contexts/task-v027-host-adapters-hooks.md`
- `.ultra/contexts/task-v027-doctor-provenance.md`
- `.ultra/contexts/task-v027-migration-acceptance.md`
- `skills/ultra-plan/SKILL.md`
- `skills/ultra-dev/SKILL.md`
- `skills/ultra-change/SKILL.md`
- `skills/ultra-change/references/change-contract.md`
- `skills/ultra-status/SKILL.md`
- `skills/ultra-review/SKILL.md`
- `skills/ultra-grilling/SKILL.md`
- `skills/ultra-grilling/references/reframing.md`
- `skills/ultra-tdd/SKILL.md`
- `skills/ultra-tdd/references/test-execution.md`
- `skills/ultra-test/SKILL.md`
- `skills/ultra-test/scripts/validate_review_transport.cjs`
- `skills/ultra-test/scripts/worktree_digest.cjs`
- `skills/ultra-deliver/SKILL.md`
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/ARTIFACT-AUTHORITY.md`
- `docs/DECISIONS.md`
- `docs/PHILOSOPHY.md`
- `docs/WORKFLOW-LIFECYCLE.md`
- `docs/V027-LIFECYCLE-CLOSURE.zh-CN.md`
- `docs/wip/v027-lifecycle-closure.md`
- `hooks/README.md`
- `hooks/_common.py`
- `hooks/session_context.py`
- `hooks/mid_workflow_recall.py`
- `hooks/compact_context.py`
- `hooks/post_edit_guard.py`
- `hooks/tests/test_v026_hooks.py`
- `tests/project-artifacts.test.cjs`
- `tests/review-transport.test.cjs`
- `tests/skill-authoring.test.cjs`
- `tests/package-smoke.test.cjs`
- `tests/v026-contract.test.cjs`

`CREATE`:

- `.ultra/evidence/v027-task-acceptance-v2/evidence.json`
- `.ultra/evidence/v027-task-acceptance-v2/phase2-verification.log`
- `.ultra/evidence/v027-north-star-v2/phase1-command-refresh.log`
- `skills/ultra-plan/references/task-evidence-v2.md`
- `skills/ultra-plan/scripts/validate_task_evidence.cjs`
- `tests/task-evidence-v2.test.cjs`

Any later addition, removal, or rename in this inventory is plan-critical and requires
a rebuilt Execution Packet plus owner reapproval before implementation continues.

## Public Seams

- `.ultra/tasks.json` task rows and sole task-status authority.
- `.ultra/contexts/task-*.md` v2 context contract without a second Status writer.
- `.ultra/evidence/<task-id>/evidence.json` typed Acceptance v2 evidence.
- `.ultra/test-report.json` aggregate consumer of task review/evidence.
- `node skills/ultra-plan/scripts/validate_task_evidence.cjs <path>` structural-sensor CLI.

## Narrow Verification

- `node --test tests/task-evidence-v2.test.cjs`
- `node --test tests/project-artifacts.test.cjs tests/v026-contract.test.cjs`
- `pytest -q hooks/tests/test_v026_hooks.py`

## Acceptance Criteria

**Change Acceptance IDs**: [`AC-04`, `AC-09`]

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| A-01 | Ledger-only status and legacy-migration contracts pass. | `command` | exact command, cwd, exit code, raw evidence ref, and freshness identity |
| A-02 | All four verification types accept valid evidence and reject mismatched shapes. | `command` | exact command, cwd, exit code, raw evidence ref, and freshness identity |
| A-03 | No Skill uses complexity, file, line, finding, question, or repair-round counts as semantic quality gates. | `inspection` | Skill sources, observed rule removal, and revision |
| A-04 | A model or validator cannot satisfy an owner-judgment criterion. | `owner-judgment` | durable owner statement or explicit disposition |
| A-05 | Completion follows blocking-review disposition and fresh evidence. | `inspection` | task-review/evidence sources, observed ordering, and revision |

## Definition of Drift

- Replacing duplicate status with another semantic registry or workflow-position field.
- Treating a validator, count, digest, or model assertion as proof of product meaning.

## Trace

**Source**: `.ultra/specs/product.md#artifact-lifecycle`

**First principles**: [`FP-1`, `FP-2`, `FP-4`]

**Serves**: [`NS-01`]

**Causal contribution**: Make task state, typed acceptance authority, review provenance,
and recovery durable across Hosts without allowing structural sensors to decide meaning.

**Hard constraints**: [`HC-3`, `HC-4`]

**Decisions**: `docs/V027-LIFECYCLE-CLOSURE.zh-CN.md#8-taskacceptance-与证据-v2`

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-15 | — | Initial task contract | — | Phase 0 planning only |
| 2026-08-15 | CORRECTION | Added every shipped writer, consumer, compatibility document, semantic-count rule, package assertion, and the Phase 1 evidence record to the exact path inventory | — | Read-only Phase 2 preflight proved the original inventory omitted live Change, Review, Grilling, TDD, authority/lifecycle documentation, and packaged-consumer paths that would otherwise retain the v0.26 dual-status, evidence-v1, or numeric semantic-gate contract. No Execution Packet exists yet, so this correction invalidates no approved execution fingerprint. |
| 2026-08-15 | CORRECTION | Added canonical product/architecture specifications plus the three Hook output consumers; corrected Hook verification to the repository's pytest runner | `.ultra/specs/product.md`, `.ultra/specs/architecture.md` | Refreshed writer-to-consumer tracing found that changing the ledger/parser alone would leave canonical v1/dual-status claims and would never surface the required legacy-context migration diagnostic on SessionStart, recall, or compaction. `unittest` does not collect the repository's pytest-style Hook functions. |
| 2026-08-15 | CORRECTION | Added the canonical research distillate hash consumer | `.ultra/specs/research-distillate.md` | Product and architecture specification edits must refresh their stored Git blob observations; omitting the distillate would make the existing artifact-integrity test correctly reject the Phase 2 migration. |
| 2026-08-15 | CORRECTION | Added the durable WIP tracker already updated by the coordinator | — | The repository completion contract requires the multi-stage tracker to reflect the active phase. This is tracker-only bookkeeping; no Execution Packet exists yet, so no approved fingerprint is invalidated. |
| 2026-08-15 | CORRECTION | Added this task's canonical v2 completion evidence path to `CREATE` | — | A completed v2 task must have its own evidence record after strict task review. The completion writer was omitted from planning; no Execution Packet exists yet, so no approved fingerprint is invalidated. |
| 2026-08-15 | CORRECTION | Added the Review-to-Test transport validator and its regression suite to `MODIFY` | — | Full integration testing proved that the live Test consumer still rejected the current `ultra-test-report-v2` template. This correction preserves historical v1 acceptance, requires only the v2 `task_evidence` array boundary here, and leaves detailed task-evidence semantics with the canonical v2 validator. No Execution Packet exists yet, so no approved fingerprint is invalidated. |
| 2026-08-15 | CORRECTION | Added one retained raw command transcript for the migrated Phase 1 command criterion | — | The first strict Phase 2 review proved the prior prose Resume summary could not satisfy a required `raw_evidence_ref`; no Execution Packet exists yet, so no approved fingerprint is invalidated. |
| 2026-08-15 | CORRECTION | Added this task's retained Phase 2 verification transcript | — | Command evidence requires exact output and freshness identity outside mutable Resume prose. The retained log is part of the reviewed scope; no Execution Packet exists yet, so no approved fingerprint is invalidated. |
| 2026-08-15 | CORRECTION | Recorded the frozen final strict review as `REQUEST_CHANGES` with summary digest `6bbca85284b94e4c374c6bb83c1bb17b5c1e047a51939a116c414816a2d46c51`; accepted finding repairs are underway | — | Recovery must resume from the actual reviewed checkpoint rather than restart the already-observed RED migration. Fresh command evidence and a fresh strict review must follow the complete repair set before final v2 evidence publication and the ledger transition to `completed`. |
| 2026-08-15 | CORRECTION | Bound recovery to frozen strict review `v027-task-acceptance-v2-approved`, its `REQUEST_CHANGES` verdict, and summary digest `25448a4f222cb8ffc67d7025b375eb2859ba593d43e1f5c831246d4f694d4c3f` | — | Its retained transcript (103/103 Node tests; 72/72 Hook tests) was fresh for the reviewed snapshot. Source repairs now require fresh verification commands and a new strict task review, followed only after approval by canonical v2 `evidence.json` publication and the ledger transition to `completed`. |
| 2026-08-15 | CORRECTION | Resolved all findings from `v027-task-acceptance-v2-approved` and refreshed the exact retained verification transcript to 105/105 Node tests and 77/77 Hook tests | — | The repaired source now has current command evidence. A new immutable strict task review must approve this changed subject before canonical v2 evidence publication and the ledger transition to `completed`. |
| 2026-08-15 | CORRECTION | Bound recovery to strict review `v027-task-acceptance-v2-complete-final`, its `REQUEST_CHANGES` verdict, and summary digest `e1d35e03cb45e45bca477e3fd122768c35c07258bcb8200595a09f76fd36cdf4`; resolved its seven findings and refreshed the retained transcript to 105/105 Node tests and 78/78 Hook tests | — | Six lenses independently found the same malformed active-entry recovery gap and one tests lens found the adjacent path-mutation coverage gap. The shared selector now rejects every non-directory active entry except the ordinary `.gitkeep` marker before reading any intent, all four Hooks retain typed repair and task silence, the complete path matrix is durable, and a fresh immutable strict review is still required before evidence publication. |
| 2026-08-15 | CORRECTION | Bound recovery to strict review `v027-task-acceptance-v2-closure-review`, its `REQUEST_CHANGES` verdict, and summary digest `89884009e547984e4be0fe7ad1383c0cef3c0ba89de06d64a91d4aa5fa99673b`; resolved its eleven findings and advanced the repaired verification boundary to 126/126 Node tests and 79/79 Hook tests | — | Active Change authority now has one canonical no-follow rule consumed by every active-intent workflow, the directory ceiling stops after the first over-limit entry, artifact and evidence special-file false-greens are covered, structural owner tests no longer claim durable dereference, and the distillate carries current suite counts. One new immutable strict review over all 71 historical findings remains required before evidence publication. |
| 2026-08-15 | CORRECTION | Bound recovery to strict review `v027-task-acceptance-v2-final-approval-review`, its `REQUEST_CHANGES` verdict, and summary digest `8fbe741891aa148bc8310f821564b41046c851a91ebdc9093c749a29474dbd22`; resolved its fifteen findings and advanced the repaired verification boundary to 146/146 Node tests and 81/81 Hook tests | — | Review and planned-Change TDD now consume the canonical active-authority rule; malformed markers and ledger failures return exact repair before intent reads; PreCompact bounds and reaps Git output; repository audits no-follow active and evidence authority and validate completed raw sidecars. A new immutable strict review over all 86 historical findings remains required before evidence publication. |
| 2026-08-15 | CORRECTION | Bound recovery to the retained `v027-task-acceptance-v2-zero-final-review` `REQUEST_CHANGES` summary `3f9e66dc8c6c38c615f7fd1dc6682c69bb1e1266c7ee42cda58777bbccdb28fa`; all seven findings have repair owners and repairs are underway | — | Consume this existing session instead of freezing a duplicate. Repairing its findings creates a fresh subject; after every repair lands, refresh command evidence and freeze one fresh strict review before any completion evidence or ledger closeout. |
| 2026-08-15 | CORRECTION | Resolved all seven findings from `v027-task-acceptance-v2-zero-final-review` and advanced recovery to a conditional current-subject review boundary | — | Migration evidence ownership is read-only, ambiguous Change/task recovery is reachable without fabricated completion, stored Change intent reads are stable and bounded, strict receipts are retained through Test and Deliver, and Resume consumes a matching review before creating one. Refresh the retained command transcript for these bytes, then freeze exactly one review only if no matching current-subject session exists. |
| 2026-08-15 | CORRECTION | Bound recovery to retained strict completion review `v027-task-acceptance-v2-completion-review`, its `REQUEST_CHANGES` verdict, and summary digest `8125c6a180cf77e0869039e850bab01ec05646ff188453cbd8be30284aafe80f`; all six findings have repair owners and repairs are underway | — | Consume this exact current-subject session instead of freezing a duplicate. The `review-errors-002` repair now preserves the required post-`APPROVE` context closeout before the ledger transition without treating those prescribed publication facts as an implementation change; the other finding repairs and refreshed pre-review evidence still require one fresh strict review. |
| 2026-08-15 | CORRECTION | Resolved all six findings from `v027-task-acceptance-v2-completion-review` and unified task-context recovery plus strict-session retention | — | Every task-context read failure now yields one four-Hook restore-and-retry repair and blocks progress; APPROVE closeout durably publishes context facts before the ledger; template, task contexts, and cleanup docs retain the exact strict session through Test and Deliver. Refresh the retained command transcript for these bytes and create one strict review only when no matching current-subject session exists. |
| 2026-08-15 | CORRECTION | Bound recovery to `v027-task-acceptance-v2-final-closeout-review` / `REQUEST_CHANGES` / summary `d22bed655b43f8d9a43e65496b504da20206c537cc57b54c043cdfbbc9870e5f`, and added the product-worktree digest plus raw-receipt integrity consumers to the planned inventory | — | The five exact findings reduce to three shared roots: raw receipt freshness is self-referential, newest-review recovery is coupled to the previous six-finding set, and task-review retention still has Test-only producers. `worktree_digest.cjs` must exclude publication metadata while canonical raw receipts gain exact SHA-256 binding; the formal v0.27 contract and TDD receipt writer are live consumers of that rule. No Execution Packet v1 exists yet, so this plan correction invalidates no approved execution fingerprint. Repairs and refreshed pre-review evidence remain required before a new strict review. |
| 2026-08-15 | CORRECTION | Resolved every finding in `v027-task-acceptance-v2-final-closeout-review` and refreshed the retained pre-review boundary to 177/177 Node tests and 82/82 Hook tests | — | Strict review receipts now remain available through Test and Deliver; newest-review recovery consumes the exact validated summary rather than a historical count; product freshness excludes evidence publication while command and external-observation receipts carry independently recomputed raw SHA-256 bindings. The retained transcript is a reviewed input, not completion evidence. One fresh current-subject strict review remains required before evidence publication. |
| 2026-08-15 | CORRECTION | Bound recovery to `v027-task-acceptance-v2-approved-closeout-review` / `REQUEST_CHANGES` / summary `612f4b4e9035b7a9c3c256c7ec1b1792a21216add30480dafa7ac4b3d908454c`; resolved its eight findings through three shared roots and refreshed the retained boundary to 193/193 Node tests plus 82/82 Hook tests | — | Product freshness now uses bounded stable no-follow snapshots for Change intent and untracked product files and fixed exclusions for derived review/runtime/progress observations. The construction baseline retains the exact strict session through Test and Deliver, and the Hook architecture table preserves typed ambiguous-authority recovery. One fresh current-subject strict review remains required before completion evidence. |
| 2026-08-16 | CORRECTION | Bound recovery to `v027-task-acceptance-v2-final-approved-review` / `REQUEST_CHANGES` / summary `dc349cfb6fdb9507d9f50889984a7a1b44afbe492d0efc985ebc290f17c7b8c8`; implemented its thirteen findings through three shared roots, separated review admission from worktree currency, and advanced the repaired command boundary to 221/221 Node plus 83/83 Hook tests | — | Tracked and untracked product mutations now share bounded stable snapshots, aggregate ceilings, timed Git observations, and a final HEAD/manifest/diff/intent replay; ambiguous started tasks retain honest `in_progress` state and explicit task-id recovery; the artifact audit streams the active root through a physical ceiling and stable marker identity. The exact retained transcript and next packet must bind the independently recaptured currency tuple before a fresh strict review and completion evidence. |
| 2026-08-16 | CORRECTION | Bound recovery to `v027-task-acceptance-v2-currency-review` / `REQUEST_CHANGES` / summary `9acb59c79ceed5fbae41a116d09c3c18e00d5a117eb117de72a62ee1f8643f4e`; resolved its sixteen findings through four shared roots and advanced the repaired command boundary to 229/229 Node plus 83/83 Hook tests | — | Product freshness now performs two fixed complete closing observations and replays intent plus every included path after each bounded Git tuple; tracked deletions consume the aggregate file budget; the repository artifact audit replays the exact active-root entry set before reading intent; and the four-Hook task-context matrix now covers ancestor symlinks and deterministic read errors. Refresh and bind the exact pre-review currency tuple before one fresh strict review. |
| 2026-08-16 | CORRECTION | Bound recovery to `v027-task-acceptance-v2-zero-currency-review` / `REQUEST_CHANGES` / summary `0696ed790f2ca83578ef0328417a031baf2a3b9c799bf535976e98cfae532859`; resolved its six findings through a terminal seal and an observable Git-timeout test boundary, advancing the repaired command boundary to 236/236 Node plus 83/83 Hook tests | — | Each of the two fixed closing observations now performs one complete primary read followed by one terminal Git/intent/path seal. Any mismatch inside that finite seal returns typed stale recovery; a write after the seal belongs to the next required consumer recapture, while hostile concurrent writers require a native sandbox or isolated worktree rather than unbounded replay. The test harness now allows the product's 5-second Git timeout to surface before its 10-second outer bound. |
| 2026-08-16 | CORRECTION | Bound recovery to `v027-task-acceptance-v2-terminal-seal-review` / `REQUEST_CHANGES` / summary `c59fc45f405e833b70604f78de637c2387101fbf29c7a23366c30eefe19a0e27`; repaired exact P1 findings `review-spec-001`, `review-code-001`, `review-tests-001`, `review-errors-001`, `review-design-001`, and `review-comments-001`, and superseded the prior two-closing claim with exactly one fixed closing protocol | — | The live digest now performs one complete primary observation followed by one terminal seal, and its call-graph regression binds those as the actual final observations rather than moving a test behind another replay. Observable persistent in-seal drift returns `ULTRA_SNAPSHOT_CHANGED_DURING_OBSERVATION`; a cooperative write after the completed seal belongs to the next consumer's mandatory fresh recapture; hostile writers require a native Host sandbox or isolated worktree. Never add an unbounded success-seeking replay. The next packet may retain fourteen historical summaries and 153 historical findings as provenance only, never as a semantic quality gate. |
| 2026-08-16 | CORRECTION | Bound post-review cleanup to `v027-task-acceptance-v2-single-seal-review` / `APPROVE` / summary `86324ae99eaa55e5e7a99ae1dbbb092d9a1cd0b74607cb551bd1035af06e6688`; resolved exact P2 findings `review-tests-001` and `review-tests-002` without changing the correct product runtime | — | The Git-boundary preload now pins the accepted 64 MiB `maxBuffer`, injects `ENOBUFS`, and proves typed reduce-or-split recovery with no digest publication. The deletion regression now proves exactly 256 tracked deletions succeed with the complete digest while 257 fail with typed resource recovery and no digest publication. Because reviewed test bytes changed after that approval, refresh the retained transcript and freeze one fresh zero-finding strict review before closeout. Fifteen summaries and 155 findings remain provenance only. |
| 2026-08-16 | CORRECTION | Bound recovery to `v027-task-acceptance-v2-zero-seal-review` / `APPROVE` / summary `cd62bc599b5fbc38005a4813424d29d9c003d0a095ea0ee31cf6f64f1d72fc6b`; repaired exact P2 `review-comments-001` and added a public-contract regression | — | README and the lifecycle guide now state the canonical rule once: owner-explicit selection is the default, while a live owner-activated same-session Autonomy Envelope permits only covered Research, Plan, Dev, Test, and reconcile-only Deliver selection; Init, Change, Delegate, Status, final archive, and external effects remain owner-selected. The contract test reproduced the stale unconditional wording RED before GREEN. Because reviewed docs and test bytes changed, refresh the retained transcript and freeze `v027-task-acceptance-v2-final-zero-review` before closeout. Sixteen summaries and 156 findings remain provenance only. |
| 2026-08-16 | CORRECTION | Bound recovery to `v027-task-acceptance-v2-final-zero-review` / `APPROVE` / summary `a14c9f4bd811b920913caf7da20a59a94378da720f4cf70f0ee01155855e72b8`; resolved exact P2 findings `review-code-001`, `review-tests-001`, `review-design-001`, and `review-comments-001` through one public-authority regression root | — | README and the lifecycle guide were already semantically correct. The regression now compares each whitespace-normalized authority paragraph as one exact tuple and proves that dropping `only`, weakening `every external effect` to `some external effects`, or adding model-selected `Status` or `Delegate` is rejected. Product runtime, public documentation, and model-facing Skill bytes are unchanged. Because the reviewed test bytes changed after approval, refresh the retained transcript and freeze one fresh zero-finding strict review before closeout. Seventeen summaries and 160 findings remain provenance only. |
| 2026-08-16 | CORRECTION | Bound recovery to `v027-task-acceptance-v2-zero-finding-review` / `APPROVE` / summary `326a6499fe1c1f863614bc8059867132d721546547b72c2d4ed4b17cce538540`; resolved exact P2 findings `review-tests-001` and `review-comments-001` | — | The Git-boundary preload now requires the accepted exact 5000 ms internal timeout and kills a 6000 ms runtime mutant. The adversarial-lifecycle task context and formal plan now record sequential fallback as `execution_mode: sequential-shared-context` with an explicit limitation; context reuse alone does not force `INCOMPLETE`, which remains reserved for missing evidence, workers, artifacts, or another schema-defined incomplete condition. Product runtime is unchanged. Because reviewed test and documentation bytes changed after approval, refresh the transcript and freeze one fresh zero-finding strict review before closeout. Eighteen summaries and 162 findings remain provenance only. |
| 2026-08-16 | CORRECTION | Closed Phase 2 under `v027-task-acceptance-v2-final-clean-review` / `APPROVE` / summary `f96999acd604cea8ac731e4d2f3baf2a6467797d2aa06c8cd89168b2be30c891` with zero findings | — | The immutable packet's HEAD, Change intent, product-worktree digest, and three ordered pre-review receipts matched immediately before closeout. Completion freshness was independently captured, canonical v2 evidence was written and validated, and this context records the prescribed review/completion/resume facts before the final ledger `completed` transition. |

## Open Questions

- _(none)_

## Resume Note

Phase 2 is complete under retained strict session
`v027-task-acceptance-v2-final-clean-review`. Its immutable packet
`f5a99e6db6f23bdda6a18deb133fc2a8ca6bb4fa45aa8cf6658fb8d57406aaa9`, admission
`236fa9f1608e633a8e2b9e002a2c984dc001d5cdb67781021a18fb53d8ad8bff`, and zero-finding
`APPROVE` summary
`f96999acd604cea8ac731e4d2f3baf2a6467797d2aa06c8cd89168b2be30c891` all validate.
The packet-recorded pre-review tuple matched immediately before closeout: HEAD
`fc055021bcfeee3e8c6781b9545d267f5eb73cbd`, Change intent SHA-256
`4882713e649527b669339fe07880df99c411d1ae086fd0200b2b558f39d40cca`, product-worktree
digest `99d76932fceec0bed74465ba4e3cc3bf0c19e6b8c2c4e6e0eed130946a7a04fc`, and exact
ordered receipts `15102f2a...e434`, `1c7a8433...f5d1`, and `10025b4d...6348`.
Independent completion freshness was captured at `2026-08-16T07:51:17+08:00`; canonical
evidence `.ultra/evidence/v027-task-acceptance-v2/evidence.json` validates as
`current-v2` with SHA-256
`d41fe66d5ee109f46babceb82e760420ac22518e73a67720e4fcccff417b8cb9`.

`ADMISSION.json` subject equality does not establish current-worktree freshness.
Admission binds the immutable packet and its source observations only. A retained
strict task review is current only when its exact summary validates against the immutable
packet and retained admission, and that immutable packet
records the coordinator-captured pre-review currency tuple: Git HEAD, Change intent
SHA-256, product-worktree digest, and the exact ordered pre-review artifact ref plus
SHA-256 for every reviewed receipt excluded from that product digest. Before consuming
the verdict and before any closeout write, independently recapture HEAD, intent, and
product-worktree digest, stable-read every recorded pre-review ref, and require exact
equality with the packet-recorded tuple. The retained Phase 2 transcript must record the
same HEAD, intent digest, and product-worktree digest.

A missing tuple, failed capture, missing or changed receipt, or any mismatch makes the
candidate stale. Refresh the affected commands and receipts, freeze a new immutable
packet and session, and run a fresh strict Review. A matching admission subject alone
never permits reuse.

If the consumed current-subject summary returns `REQUEST_CHANGES`, repair every finding
in that exact validated summary, refresh the affected pre-review evidence, and repeat
with one fresh subject and review.
If it returns `APPROVE`, perform closeout in this exact order; this task executed and
read back the same sequence:

1. validate the final `SUMMARY.json` for the exact packet, admission, subject, and
   verdict bindings;
2. compare the exact pre-review currency tuple before any closeout write;
3. capture the completion freshness observation independently;
4. write canonical v2 `evidence.json` and read it back;
5. update `Task Review`, `Completion`, and `Resume Note`, then read all three sections back;
6. write the ledger row to `completed` and read it back.

Writing and reading back only these prescribed post-review closeout facts do not reopen implementation review.
Only a change to reviewed implementation or pre-review evidence
requires refreshed commands, a new subject, and a fresh strict review.

On resume, do not repeat Phase 2 Review or evidence publication. Verify that the
canonical evidence remains `current-v2`, the exact strict session remains retained for
future aggregate Test and Deliver, and the ledger row remains `completed`; then stop
unless the owner explicitly activates the pending Phase 3 task.

## Completion

The earlier _Not completed_ checkpoint is superseded. Phase 2 is complete: the retained
239/239 Node and 83/83 Hook transcript is bound to the reviewed tuple; final-clean Review
returned zero-finding `APPROVE`; canonical v2 evidence was written, read back, and
validated; and this context publishes the Task Review, Completion, and Resume facts
before the ledger's final mechanical `completed` write/readback. Phase 3 through Phase 8
remain unstarted and are not part of this completion claim.

## Task Review

- Execution Packet state/digest/limitation: `pre-v1-unavailable`; Execution Packet v1 is
  introduced by `v027-autonomy-packet`, so no bootstrap digest is fabricated.
- Review session identity, verdict, and summary digest: retained
  `v027-task-acceptance-v2-final-clean-review` / `APPROVE` /
  `f96999acd604cea8ac731e4d2f3baf2a6467797d2aa06c8cd89168b2be30c891`.
- Blocking findings and post-review disposition/evidence refresh refs: the exact current
  set is empty (`[]`). All 162 historical findings were independently dispositioned as
  provenance against the current source; none recurred in the reviewed subject. The
  retained command evidence is
  `.ultra/evidence/v027-task-acceptance-v2/phase2-verification.log` at SHA-256
  `10025b4d451c85b1d56cc62d838ad64ec6b067d950b93679bdc0537c31b76348`.
- Closeout: admission identity was treated only as ingress evidence. The exact
  packet-recorded currency tuple was independently recaptured before any write; the
  completion subject was then independently captured, canonical v2 evidence was written
  and validated, and these three context sections were published for readback before the
  ledger's final `completed` transition.
- Retention: retain `WORKER-PACKET.json`, `ADMISSION.json`, all six selected specialist
  artifacts, and `SUMMARY.json` from the final-clean session until aggregate Test and
  Deliver have both consumed them successfully. Premature loss requires a fresh Review
  and Test; never reconstruct the old receipt.
