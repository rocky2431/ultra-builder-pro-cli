# Review modes and worker selection

Select one mode before creating review artifacts.

## Task

Review one completed task and its bounded diff. Require specification fidelity and the
engineering roles implicated by the task's code, tests, errors, comments, or design.
The result supports `review-slice`; it does not replace aggregate change review.

## Change

Review the current full change, accepted task set, test report, documentation impact,
and convergence boundary. Run specification fidelity plus every engineering role that
can materially affect delivery. This is the delivery-facing review.

## Plan

Review accepted intent, task coverage, seams, dependencies, recovery, and verification
before implementation. Use a plan artifact as the bounded scope; code-diff-only roles
may be skipped with a concrete rationale.

## Selection record

For every available worker, record `selected` or `skipped` and a rationale tied to the
mode, changed paths, public seam, and risk flags. A role is applicable when its evidence
could change either verdict axis. Tool availability alone is not a selection reason.
