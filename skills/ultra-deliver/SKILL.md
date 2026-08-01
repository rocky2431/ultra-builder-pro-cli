---
name: ultra-deliver
description: Reconcile one completed Change, run aggregate review and refactoring, refresh release documentation, and archive the local workflow record. Use when the task ledger is complete and the owner wants a delivery handoff or separately authorized release effects.
---

# Turn current evidence into a recoverable delivery handoff

Delivery closes the local Change. Commit, push, tag, publication and deployment remain
separate effects; local readiness grants none of them automatically.

## Before you start

1. Read `.ultra/tasks.json` and each completed task's `context_file`, Completion and
   closing `## Resume Note`.
2. Read `CONTEXT.md`, relevant `.ultra/decisions/`, active Change intent and evidence.
3. Read `.ultra/test-report.json` and current `HEAD`. If `git_commit` differs from HEAD,
   label the report stale and obtain current evidence before a release recommendation.

## Definition of done

- Actual outcome, specifications, docs, tests and aggregate review have been reconciled.
- Every omitted stage is explicitly recorded with its evidence-based rationale.
- Build and release checks have exact commands and real results.
- The Change is archived with `git mv`, and rollback remains a normal Git operation.

## Review and refactor

Follow `../ultra-review/SKILL.md` across the aggregate Change. This is where useful
refactoring occurs: several completed slices now reveal real duplication, coupling and
deep-module boundaries. Rerun every check affected by a refactor and refresh the report
against the resulting HEAD.

## Reconcile the handoff

1. Compare accepted intent and task traces with delivered behavior.
2. Apply justified specification corrections; route any REDUCTION to the owner.
3. Update CHANGELOG and README when public behavior changed. Record bounded debt only
   in the active Change `delivery.md` under `## Technical Debt`.
4. Run the repository's build and packaging checks.
5. Determine the version impact from the public contract and project convention.
6. Follow `references/baseline-reconciliation.md` and write the one canonical active
   Change `delivery.md` with exact checks, residual risks, omissions and rollback.

## Archive locally

Move `.ultra/changes/active/<id>` to `.ultra/changes/archive/<id>` with `git mv` only
after local reconciliation. Do not create a second standalone delivery report: archived
`delivery.md`, test report, evidence and Git history are the handoff.

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
