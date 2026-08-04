---
name: ultra-deliver
description: Reconcile one Change whose matching tasks are complete, run aggregate review and refactoring, refresh release documentation, and archive the local workflow record. Use when the owner wants a delivery handoff or separately authorized release effects for the active Change.
---

# Turn current evidence into a recoverable delivery handoff

Delivery closes the local Change; readiness grants no commit, push, tag, publish, or deploy authority.

## Before you start

1. Resolve exactly one active `change_id`. Read `.ultra/tasks.json`; every matching task
   must be complete. Read each `context_file`'s Completion and closing Resume Note.
2. Read `CONTEXT.md`, relevant `.ultra/decisions/`, active Change intent and evidence.
3. Read `.ultra/test-report.json`, then run the Test Skill's `worktree_digest.cjs` with
   project root and `--change-id`. Require report `task_ids` for the current Change plus
   matching `change_id`, `git_commit`, worktree digest, and intent digest; otherwise stop.

## Definition of done

- Outcome, specs, tests, aggregate review, and every document match the actual diff.
- Every changed export has a non-test consumer or a recorded owner disposition.
- Every omitted stage is explicitly recorded with its evidence-based rationale.
- Build and release checks have exact commands and real results.
- The Change is archived with `git mv`, and rollback remains a normal Git operation.

## Review and refactor

Follow `../ultra-review/SKILL.md` across the aggregate Change; refactor only observed
duplication, coupling, or boundary defects. Rerun affected checks and refresh the report.

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
2. After an unchanged pass or fresh Test, recheck Change/task/HEAD/product/intent
   identities. Apply the gate, run build and non-publishing package inspection, determine
   version impact, and use `references/baseline-reconciliation.md` for canonical
   `delivery.md`. Archive the Change. Excluded delivery metadata and the directory move
   cannot self-invalidate the product digest; intent stays independently bound.

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

- `../ultra-review/SKILL.md` — read before aggregate review and refactoring.
- `../ultra-think/SKILL.md` — read when version or release posture is a consequential
  trade-off rather than an established repository rule.
- `../ultra-think/references/autonomy-boundary.md` — read before scope or evidence shrinks.
- `references/baseline-reconciliation.md` — exact `delivery.md` reconciliation contract.
