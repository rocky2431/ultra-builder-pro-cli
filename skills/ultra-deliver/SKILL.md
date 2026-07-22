---
name: ultra-deliver
description: Converge one verified Ultra change, reconcile specification learning and baseline authority, archive recoverably, and optionally release when explicitly authorized. Use when current test and independent review evidence are ready for delivery.
---

# Converge and deliver one change

Use host judgment for release scope and authorization. Use Ultra MCP for evidence
binding, workflow state, convergence, baseline reconciliation, archive recovery, and
output digests.

## Bind current evidence

1. Read `system.doctor`, `baseline.get`, `change.get`, `change.breadcrumb`, linked
   tasks, and current test/review workflows and artifacts.
2. Resume or start a `deliver` workflow linked to the change and baseline.
3. Require completed tasks, current context, a passing test report at full HEAD with a
   verified public seam, and current independent `spec_fidelity` and
   `engineering_standards` verdicts. Record `bind-evidence`.

Evidence from another revision, task set, change, or stale output is invalid. An
approved break-glass incident follows only its recorded recovery contract.

## Reconcile and verify

Resolve every specification-learning proposal. Apply an approved item to its declared
target and verify it before marking it applied; preserve rejection reasons. Reconcile
accepted delta and documentation impact into baseline documents, or record an exact
no-change reason. Record `reconcile-specifications`.

Read `references/baseline-reconciliation.md` and write the bound reconciliation
manifest inside the active change directory. It must record every baseline update as a
semantic add or update with a real source anchor, before/after digests, verification,
resolved gap ids, and resolved unknowns. A no-update delivery records one evidenced
semantic no-change reason.

Verify the release candidate with repository-native focused/regression checks,
type/lint/build where applicable, install/doctor smoke for distributed packages,
public seams, and rollback or recovery sanity. Compile final convergence context and
record its immutable manifest as the `verify-candidate` output. Any edit invalidates
affected evidence.

Call `change.converge` with only the change id. Do not submit verdicts or evidence
summaries: MCP derives development, test report, public seam, specification,
documentation, both review axes, and incident diagnosis evidence from DB-backed
workflows and current artifacts. Resolve named blockers and rerun invalidated gates. Record
`converge-authority` only when the change is ready.

Call `change.archive` with the summary, `reconciliation_path`, and baseline updates or
exact no-change reason.
Ordinary archive refreshes baseline revision and digests atomically and rolls back on
incomplete reconciliation. Record `archive-change`. For break-glass delivery, verify
the returned bypass and blocking reconciliation gap.

## Release only with authority

The `release-if-authorized` step is not permission. When publication is outside the
user's request, complete it with exactly one `release_authorization` decision containing
`authorized: false` and the reason. When explicitly authorized, record
`authorized: true`, `approved_by`, the exact release `scope`, and the reason; then
determine compatibility impact, update version and
changelog, rerun invalidated checks, create a non-force commit/tag, push, publish, and
verify remote commit, tag, release, and registry version independently.

Write `.ultra/reports/delivery/<workflow-id>.json` atomically using
`ultra-delivery-report-v1`, with change/archive state, baseline id/status, full HEAD,
worktree digest, convergence-context digest, exact passing
checks, the explicit release authorization/performed decision, release identifiers
when applicable, structured evidence for every performed commit/push/tag/registry/
deployment action, rollback notes, and timestamp. The report authorization must match
the DB-recorded decision. Record `verify-delivery` with that
output and call `workflow.complete` only after the change is archived and local and
remote evidence agree for every authorized action. MCP derives the delivery summary
from this report rather than a Prompt claim.

Return workflow id, archive and baseline state, evidence digests, commit/release facts,
recovery notes, residual risks, and one next route.
