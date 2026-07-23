---
name: ultra-review
description: Independently review one current Ultra plan, task diff, or aggregate change on specification fidelity and engineering standards. Use when current evidence needs a review gate or focused risk analysis.
---

# Review one bounded scope

Keep two independent verdict axes:

- `spec_fidelity`: accepted intent, behavior, documentation impact, and public seams;
- `engineering_standards`: correctness, safety, tests, integration, maintainability,
  observability, and recovery.

Neither axis can compensate for the other.

## Bind evidence

1. Read `references/review-modes.md` and select `plan`, `task`, or `change` from the
   actual review request.
2. Bind one explicit diff or plan artifact, full HEAD, worktree digest, task set,
   acceptance, and current decision state.
3. Resume or start the review workflow and record `bind-diff`.
4. Compile `change.context` for `review` and record the immutable manifest under
   `compile-context`.

An empty, ambiguous, or stale scope cannot pass.

## Select workers by risk

Always run `review-spec`. Select the smallest engineering worker set that covers the
actual diff and risk. Record every selected and excluded worker with a specific
rationale; do not run every specialist ceremonially.

Invoke workers through the current host's native bounded-worker mechanism and pass
only their role, current scope, and relevant evidence. Workers are read-only and may
not decide owner choices or edit source.

Resolve `references/unified-schema.md` from this Skill directory and pass its absolute
path as `SCHEMA_PATH`. Validate specialist artifacts with
`scripts/review_wait.py`. Record outputs under `review-specification`,
`review-engineering`, and `coordinate-findings`.

The coordinator preserves every finding unchanged in `SUMMARY.json`; it may group
duplicate root causes only in the human summary. A new material owner choice remains a
finding and routes to the interaction protocol.

## Complete

Recheck HEAD, worktree, context digest, diff, task set, acceptance, artifact schemas,
and both axes. Record `verify-review-gate`, then call `workflow.complete`. MCP derives
the durable verdict and rejects missing specialists, lossy coordination, stale
artifacts, or prompt-supplied conclusions.

Any relevant code, test, specification, or contract edit invalidates the affected
review evidence. Return both verdict axes, blocking findings, reviewed scope, worker
selection rationale, artifact digests, and allowed transitions.
