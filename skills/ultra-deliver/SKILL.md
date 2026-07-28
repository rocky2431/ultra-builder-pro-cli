---
name: ultra-deliver
description: Converge a verified Ultra change, reconcile baseline specifications, and archive it with recoverable local evidence. Use when implementation, testing, and review are current.
---

# Converge and archive local authority

Delivery closes Ultra's local change authority. It does not grant or perform commit,
push, tag, registry publication, deployment, or another external effect.

## Bind current evidence

1. Read doctor, baseline, change, breadcrumb `accepted_intent`, decisions, tasks, test,
   review, learning, and current checkout.
2. Resume or start a deliver workflow bound to the change and baseline.
3. Require complete task evidence, a current test report, both review axes, current
   context, and resolved material decisions. Record `bind-evidence`.

Evidence from another revision, task set, or change is invalid.

## Reconcile specifications

Resolve every specification-learning candidate. Apply approved learning to its target
inside the Change overlay; preserve rejection reasons. Read the current registered
`change.delta` and verify every baseline anchor, payload digest, acceptance reference,
and unknown.

Write documentation updates below
`.ultra/changes/active/<change-id>/documentation/`. Call
`change.documentation_reconcile` for every Change: bind the current delta id and
digest, exact before/after document digests, delta and acceptance references,
verification, and each verified consumer. When no documentation changes, record an
empty reconciliation with a specific `no_change_reason`. An unexplained orphan
document is blocking. Record `reconcile-specifications`.

Compile final convergence context and run the risk-selected candidate checks, install
or doctor smoke when this change modifies distributed assets, public-seam verification,
and recovery sanity. Record the immutable context under `verify-candidate`.

Call `change.converge`; MCP derives readiness from durable dev, test, review,
typed delta, documentation reconciliation, diagnosis, and current checkout evidence.
Record
`converge-authority` only when ready.

Call `change.archive` with the summary. MCP preflights all target before states and
overlay digests, applies the complete packet atomically, refreshes baseline authority,
rebinds every registered artifact into the self-contained archive, and rolls back or
resumes from its transaction journal after interruption. A partial success is not
delivery. Verify the refreshed baseline and archived packet, then record
`archive-change`.

Write `<archived-change-root>/delivery/<workflow-id>/report.json` with
`ultra-delivery-report-v1`: archived change, baseline, HEAD, worktree and context
digests, local checks, rollback notes, and timestamp. The report must not contain a
release decision. Record it under `verify-delivery` and complete the workflow.

## External effects

If the user separately requests commit, push, tag, publish, or deploy, handle that as a
host-owned effect after Ultra delivery. Confirm only missing material authority, run
the repository's release checks, and report remote evidence separately. Never infer an
external effect from `ultra-deliver`, and never encode it as completed Ultra delivery
state.

Return archive and baseline state, evidence digests, recovery notes, residual risks,
and allowed transitions.

Never invoke the recommended capability here; wait for an explicit user invocation.
