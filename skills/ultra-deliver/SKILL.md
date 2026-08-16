---
name: ultra-deliver
description: Reconcile one Change whose matching tasks are complete, run aggregate review and refactoring, and report the delivery handoff. Use when the owner wants delivery reconciliation and reporting, or — by current explicit owner invocation only — the separately gated finalization that writes delivery.md, fixes version and package posture, and archives the local workflow record.
---

# Turn current evidence into a recoverable delivery handoff

Delivery closes the local Change; readiness grants no commit, push, tag, publish, or deploy authority.

## Before you start

1. If model-selected, verify the live execution grant in `../ultra-change/references/execution-grant.md` — a current session-local activation or a stably verified durable work-package grant; without either, stop. A model-selected Deliver run under that grant may reconcile, review, and report, and then MUST stop before finalization: its inputs, writes, and effects end at the report. Only a current explicit owner invocation of `ultra-deliver` may finalize — writing `delivery.md`, deciding the version decision and package posture, and archiving the stable Change id with `git mv` are owner-invocation-only in every grant mode, and a grant never covers them.
2. Read `../ultra-change/references/change-contract.md` and apply its **Active Change
   authority resolution** before reading any active `intent.md` or resolving a current
   `change_id`. This workflow requires its one valid active authority; any zero result
   or typed diagnostic stops before finalization input is read until the stated repair
   or retry succeeds. Read `.ultra/tasks.json`; every matching task must be `completed`
   in that sole task-status authority. Read each `context_file`'s Completion, Task
   Review, and closing Resume Note. For every current Change task,
   require current `ultra-task-evidence-v2` and task-review provenance under
   `../ultra-plan/references/task-evidence-v2.md`, already consumed by the current Test
   report. A legacy context Status or Complexity header and v1 evidence are migration
   diagnostics only and cannot support current delivery.
3. Read `CONTEXT.md`, relevant `.ultra/decisions/`, active Change intent and evidence.
   Validate `.ultra/north-star.md`; resolve every recorded `FP-*`, `NS-*`, and `HC-*`
   for the delivered Change, tasks, findings, and dispositions against that accepted
   authority. Compare the active Change's recorded **North Star revision** and
   **North Star digest** with the accepted file's revision and current Git blob digest. Any
   missing ID or mismatch stops finalization and recommends explicit owner invocation of
   `ultra-change` for reconciliation; delivery never silently rewrites the trace.
4. Read `.ultra/test-report.json`, then run the Test Skill's `worktree_digest.cjs` with
   project root and `--change-id`. Require report `task_ids` for the current Change plus
   matching `change_id`, `git_commit`, worktree digest, intent digest, and review
   `admission_digest`, `subject_digest`, and `summary_digest`; otherwise stop. Recheck
   each projected task's declared review branch as recorded: strict-v4 items keep their
   strict receipt and transport bindings, while `external-manual` items reverify their
   receipt bytes and digest through the task-evidence sensor's
   `--verify-external-receipt` mode and take the sensor's `--projection` output
   verbatim — a strict SUMMARY never substitutes for an external receipt and neither
   branch is rewritten into the other.
   The product-worktree digest has one fixed boundary: it excludes `.ultra/evidence/**`,
   whose command and external-observation entries bind raw bytes as
   `raw_evidence_sha256` before stable exact record bytes are bound as `evidence_digest`
   through the report's ordered `task_evidence` projection. For each projected record,
   take every `raw_evidence_ref` to bounded stable repository-contained bytes from an
   ordinary regular non-symlink file opened nonblocking and no-follow, with an 8 MiB
   ceiling and path/descriptor identity checks around the read. Recompute
   `raw_evidence_sha256` and require an exact match, then recompute the stable exact
   `evidence.json` bytes as `evidence_digest` before comparing the projection. Recheck
   the exact review receipts separately; never treat the product exclusion as permission
   to ignore evidence drift or add another exclusion.
   An intent digest changed by North Star reconciliation or any other intent edit always
   requires a fresh `ultra-test` before Deliver can finalize, even if product bytes did
   not change.
5. Preserve every typed acceptance authority. The owner alone supplies the semantic
   result for `owner-judgment`; Deliver may verify its cited source and freshness but no
   model, command, digest, schema, or validator may replace it.

## Definition of done

- Outcome, specs, tests, aggregate review, and every document match the actual diff.
- Every changed export has a non-test consumer or a recorded owner disposition.
- Every omitted stage is explicitly recorded with its evidence-based rationale.
- Delivery explains whether evidence realizes the traced first principles and outcome,
  and preserves contradictions or stale trace as findings instead of mirroring or
  silently revising North Star prose.
- Build and release checks have exact commands and real results.
- The Change is archived with `git mv`, and rollback remains a normal Git operation.

## Review and refactor

Follow `../ultra-review/SKILL.md` across the aggregate Change; refactor only observed
duplication, coupling, or boundary defects. Rerun affected checks and refresh the report.
After the aggregate review and the current Test report are consumed, Deliver does not
refactor product source: it reconciles delivery artifacts and documentation only. A
post-approval implementation issue routes as at most one new owner-approved Dev task
for a P0/P1, or as recorded backlog and residual risk for P2/P3; an unbounded
Test ↔ Deliver bounce is not a valid recovery path, and any re-entry through Test
requires an explicit owner disposition.

## Reconcile the handoff

1. Compare accepted intent and task traces with delivered behavior.
2. Apply justified specification corrections; route any REDUCTION to the owner.
3. List documentation, compare every file with the full Change diff, and repair stale
   behavior, examples, flags, or fields. Record bounded debt only in active
   `delivery.md` under `## Technical Debt`.
4. Defer build, non-publishing package inspection, version selection, and the canonical
   `delivery.md` until the fresh-snapshot finalization pass below. Reconciliation that
   changed files must return through Test first.

Entry reconciliation prevents inherited drift; this exit reconciliation prevents the
Change from leaving new document drift.

## Reconcile, then finalize on a fresh snapshot

Delivery has two observable passes, not a hidden state machine:

1. Reconcile and review. If this pass changes source, tests, task/context/evidence,
   specifications, maintained documentation, or `intent.md`, stop after writing the
   reconciled files. The existing report is stale; recommend `ultra-test` and make no
   delivery or release claim.
2. After an unchanged pass or fresh Test, resolve the report's canonical
   `review.summary_ref` as `<validated-summary-path>` and run the current strict transport
   consumer against the current report:

   `node <ultra-test-skill-dir>/scripts/validate_review_transport.cjs --summary <validated-summary-path> --report .ultra/test-report.json`

   Require exit 0 and a JSON `"valid": true` field. This one existing consumer verifies
   the exact
   retained `ADMISSION.json` and `SUMMARY.json`, then binds the report's
   `admission_digest`, `subject_digest`, and `summary_digest` to those bytes. A missing or
   invalid receipt, summary, or binding makes the current Test claim `INCOMPLETE`: start
   a fresh Review and Test. Do not write `delivery.md`, archive the Change, create a
   release package, or make a delivery claim while that receipt evidence is missing or
   invalid. Never use `--legacy-v4` for this current-session check; v3 and pre-admission
   v4 are read-only historical evidence, not current Test or Deliver evidence.

   After the transport succeeds, recheck Change/task/HEAD/product/intent identities.
   Apply the gate, run build and non-publishing package inspection, determine version
   impact, and use `references/baseline-reconciliation.md` for canonical `delivery.md`.
   Archive the Change. Excluded delivery metadata and the directory move cannot
   self-invalidate the product digest; intent stays independently bound. Retain the
   review session through this successful Deliver consumption; only then may its derived
   artifacts be garbage-collected.

   Transport and task-evidence validators establish exact structural, identity,
   provenance, and freshness facts only. Their success never means that the Change is
   semantically accepted or that its outcome is ready to describe as delivered.

Do not draft a success narrative around stale evidence. A current `passed: false`
report may still reach finalization only after every finding has an explicit owner
disposition and the one hard gate below is clear; `passed` is evidence summary, not a
second mechanical release gate.

## The one delivery gate

This gate applies only after the owner explicitly invokes `ultra-deliver`; it does not
attach itself to ordinary repository packaging outside this workflow.

Everything else in this workflow reports and hands over. This is the exception, and it
is deliberately narrow:

**Do not produce a release package while an export this Change added or changed has no
non-test consumer and no recorded owner disposition.**

| | |
|---|---|
| Invariant | Every changed export is either reachable from a non-test caller or explicitly declared internal |
| Fact source | The Wiring Verification finding and its owner disposition in `.ultra/test-report.json`, bound to the current Change id, task ids, intent, HEAD, and product-worktree digest — the audit already found these; this is not a fresh opinion |
| Blocked effect | Release-package creation and the separately authorized release effects after it. A non-publishing package inspection is diagnostic; local commit and archival are untouched |
| Repair | Wire the export to its caller, or record the owner's disposition on the finding in `.ultra/test-report.json`, then carry it into `delivery.md`. Either one clears the gate |

"Written but never connected" can leave tests and review green while the feature is
absent. Keep this gate at finalization, after the audit can distinguish unfinished work.

## Archive locally

After the fresh check, `git mv` active `<id>` to archive. The id stays stable in task
rows; never store a movable intent path or create a second delivery summary. Archived
delivery, test report, evidence, and Git history are the handoff.

For separately authorized effects, perform and verify each independently. Ask for
authority at the point of effect: commit, then push, then tag, package publication and
deployment as applicable. A failure in one does not imply permission to attempt another.

## When the owner decides

The owner accepts residual risk, reductions, the version, and every external effect.
Without release authority, stop after the recoverable local archive and report it.

## References

- `../ultra-change/references/change-contract.md` — canonical Active Change authority resolution.
- `../ultra-review/SKILL.md` — read before aggregate review and refactoring.
- `../ultra-plan/references/task-evidence-v2.md` — canonical current task evidence and task-review contract.
- `../ultra-think/SKILL.md` — read when version or release posture is a consequential
  trade-off rather than an established repository rule.
- `../ultra-think/references/autonomy-boundary.md` — read before scope or evidence shrinks.
- `../ultra-change/references/execution-grant.md` — read only for grant-activated continuation.
- `references/baseline-reconciliation.md` — exact `delivery.md` reconciliation contract.
