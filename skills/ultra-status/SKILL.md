---
name: ultra-status
description: Infer the current Ultra route, baseline gaps, stale evidence, task risk, and installation health from repository files and host manifests. Use when the owner asks what is complete, blocked, stale, unhealthy, or useful to do next.
---

# Route from artifacts without changing them

This router is read-only. It separates verified files, model inference, and unavailable
evidence, then recommends one explicit public capability without invoking it. It never
persists a workflow-position field.

## Before you start

1. List directories containing `.ultra/changes/active/*/intent.md`. If exactly one
   exists, its directory name is the current `change_id`. Read `.ultra/tasks.json`,
   then tasks whose `change_id` matches it and the frontier task's `context_file` and
   `## Resume Note`. Historical and abandoned tasks never define the frontier.
2. Read `.ultra/project-brief.md`, `.ultra/north-star.md`, `CONTEXT.md`, relevant
   `.ultra/decisions/`, specifications, active, archived, or abandoned Changes, and
   evidence. An abandoned Change supplies historical boundary and recovery context;
   it never defines the current route.
3. Inspect Git `HEAD`, worktree status, and installed host manifests without repair.

## Definition of done

- Evaluate the artifact route in order and name the evidence supporting the match.
- Keep stale test evidence, dirty worktree state, baseline gaps, and task graph risks
  visible without converting them into semantic failure.
- Report exact installation drift and a reachable repair without mutating it.
- Recommend one route and why; never launch it.

## Infer the route

| Observable files and current need | Recommendation |
|---|---|
| No `.ultra/` | `ultra-init` |
| Project Brief has no usable one-line and no legacy `## One-line` exists | `ultra-init` |
| Project Brief or legacy seed exists but no accepted North Star supports the current boundary | `ultra-research` |
| A new request exists and no active Change exists | `ultra-change` |
| More than one active Change exists | Diagnose the conflicting directories and ask the owner which one remains active; do not route or move either automatically |
| The active intent is `draft` or has a blocking unresolved decision | `ultra-change` to finish and accept the contract |
| The active `Research Disposition` names required exit evidence that is not satisfied | `ultra-research` for the named question and selected lenses |
| Research evidence exists but the accepted intent has not reconciled it | `ultra-change` to update the bounded contract |
| An active Change exists and `.ultra/tasks.json` has no tasks whose `change_id` matches it | `ultra-plan` |
| A matching task is pending or in progress with same-Change dependencies satisfied | `ultra-dev`, naming that task |
| All matching tasks are completed and no current report matches this Change | `ultra-test` |
| A current false report has implementation, test, or wiring findings selected for repair | `ultra-dev` after owner disposition |
| A current false report has missing external or product evidence selected for collection | `ultra-research` after owner disposition |
| A current false report has an acceptance, scope, or existing-promise change selected for reconciliation | `ultra-change` after owner disposition; use `ultra-think` internally for one consequential trade-off |
| Every current finding is explicitly accepted, deferred, or otherwise dispositioned | `ultra-deliver`, subject to its one orphan-export gate |
| Report passed and all report identities match current files | `ultra-deliver` |
| No active Change and no new request | Report the idle state; do not manufacture work |

An explicit `[NEEDS CLARIFICATION]` is evidence of an unresolved field, not proof that
the entire project requires Research. Judge whether it can change the current boundary.
Do not add `research_complete`, a score, or another state bit to replace that judgment.

A test-report is stale when its `change_id` is not the active Change, its `task_ids` are not
the exact ordered ids of tasks whose `change_id` matches that Change, `git_commit`
differs from `HEAD`, or its `worktree.diff_digest` or `intent_digest` differs from
running
`node <ultra-test-skill-dir>/scripts/worktree_digest.cjs --project <repository-root> --change-id <change_id>`.
A dirty worktree is a warning, not evidence of failure.

`passed: false` does not itself select a repair. Preserve each finding, ask for owner
disposition where scope or risk changes, then route by the accepted response above.
Likewise, task completion is necessary for `passed: true` but never sufficient to
manufacture it.

The repository has one primary writer for canonical `.ultra` files. Native review
workers and delegated CLIs may inspect or write isolated source roots, but their results
return to that writer. Concurrent canonical writes require separate worktrees and
explicit integration; this router does not invent locks or silently merge ledgers.

## Surface risk and installation health

List unmet task dependencies, more than one matching `in_progress` task under the
single-writer contract, any `in_progress` task older than 3 days, complexity
concentration, and broken `trace_to` or `context_file` paths. These are sensors.

Compare the selected host's plugin path, skill inventory, version, provenance, and hook
manifest with installed files. Recommend `ubp install` or `ubp update` as the repair;
this read-only Skill never performs it.

## When the owner decides

The owner chooses the next public workflow, risk disposition, and any reinstall.
Contradictory facts remain visible instead of being resolved by routing heuristics.

## References

- `../ultra-think/SKILL.md` — read only when contradictory evidence creates one real
  decision rather than a mechanical repair.
- `../ultra-think/references/autonomy-boundary.md` — read before recommending a route
  that would reduce an accepted commitment.
