---
name: ultra-deliver
description: Converge a verified Ultra change, reconcile baseline specifications, and archive it with recoverable local evidence. Use when implementation, testing, and review are current.
---

# Converge and archive local authority

Delivery closes Ultra's local change authority. It does not grant or perform commit,
push, tag, registry publication, deployment, or another external effect.

## Bind current evidence

1. Read doctor, baseline, change, breadcrumb, decisions, tasks, test, review, learning,
   and current checkout.
2. Resume or start a deliver workflow bound to the change and baseline.
3. Require complete task evidence, a current test report, both review axes, current
   context, and resolved material decisions. Record `bind-evidence`.

Evidence from another revision, task set, or change is invalid.

## Reconcile specifications

Resolve every specification-learning candidate. Apply approved learning to its target
with before/after digests and verification; preserve rejection reasons.

Read `references/baseline-reconciliation.md` and write the reconciliation manifest
inside the active change directory. Record semantic additions or updates, resolved
gaps and unknowns, and verification. If baseline semantics did not change, record an
evidenced no-change reason. Record `reconcile-specifications`.

Compile final convergence context and run the risk-selected candidate checks, install
or doctor smoke when this change modifies distributed assets, public-seam verification,
and recovery sanity. Record the immutable context under `verify-candidate`.

Call `change.converge`; MCP derives readiness from durable dev, test, review,
specification, docs, diagnosis, and current checkout evidence. Record
`converge-authority` only when ready.

Call `change.archive` with the reconciliation manifest and summary. Verify the refreshed
baseline and archived packet, then record `archive-change`.

Write `.ultra/reports/delivery/<workflow-id>.json` with
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
