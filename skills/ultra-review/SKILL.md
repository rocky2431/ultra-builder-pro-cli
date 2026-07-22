---
name: ultra-review
description: Run independent specification-fidelity and engineering reviews over one current Ultra diff and persist bounded review evidence. Use when a task or change needs a read-only review gate before completion, convergence, or delivery.
---

# Review one current diff

Keep two verdict axes independent:

- `spec_fidelity`: accepted intent, delta, behavior, docs impact, and public seam;
- `engineering_standards`: correctness, safety, tests, maintainability, observability,
  integration, and recovery.

One axis cannot compensate for the other.

## Bind durable scope

1. Read `references/review-modes.md`. Select exactly one review mode: `task` for one
   implementation slice, `change` for aggregate delivery readiness, or `plan` for an
   approved plan before implementation. Bind only the evidence defined by that mode.
2. Resolve one explicit diff range, current full HEAD, change, task set, and accepted
   evidence. Stop on an empty or ambiguous scope.
3. Resume or start a `review` workflow. Record `bind-diff` with revision, paths, mode,
   and task set.
4. Compile `change.context` for `review` using only accepted intent, delta, task
   contracts, tests, public seams, and diff paths. Record `compile-context` only when
   ready, with the immutable context manifest as the step output.
5. Create `.ultra/reviews/<session-id>/` with mode, change id, exact task ids, full HEAD,
   worktree digest, diff range, scope metadata, and pending verdicts.

## Execute independent axes

Always run the bounded `review-spec` worker for specification fidelity. Select the
smallest necessary engineering workers using the mode and risk matrix; a change review
for delivery runs every applicable role. Record every selected and skipped role with a
scope-specific rationale. Invoke them through the current host's native bounded-worker
mechanism. Keep workers independent and pass only the current diff plus their role
context.

Resolve `references/unified-schema.md` from this Skill directory and pass its absolute
path as `SCHEMA_PATH`. Validate artifacts with `scripts/review_wait.py`; a missing,
invalid, stale, or partial required artifact is not a pass.

Record:

- `review-specification` with `spec-fidelity.json` as an output;
- `review-engineering` with every selected engineering artifact as outputs;
- `coordinate-findings` with the coordinated summary output.

The coordinator preserves every specialist finding unchanged in `SUMMARY.json`.
Duplicate root causes may be grouped only in the human-readable summary. Review is
read-only except for review artifacts; implementation fixes are a separate dev action.

## Verify and complete

Recheck reviewed HEAD, worktree digest, review-context digest, diff, acceptance, task
set, artifact schemas, and both verdicts. Record `verify-review-gate`, then call
`workflow.complete`. MCP
derives each axis and the durable verdict from the specialist outputs, then requires
`SUMMARY.json` to match their complete finding set. Prompt claims and a lossy
coordinator summary cannot replace either axis. Any code, test, spec, or contract edit
invalidates affected review evidence and requires a new or resumed run.

Return both axis verdicts first, blocking findings, reviewed revision and paths,
artifact digests, workflow id, skipped-role rationale, and one exact next route.
