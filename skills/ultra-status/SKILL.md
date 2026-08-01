---
name: ultra-status
description: Infer the current Ultra workflow position, stale evidence, task risk, and installation health from repository files and host manifests. Use when the owner asks what is complete, blocked, stale, unhealthy, or useful to do next.
---

# Route from artifacts without changing them

This router is read-only. It reports verified files, model inference and unavailable
evidence separately, then recommends one explicit capability without invoking it.

## Before you start

1. Read `.ultra/tasks.json` if present; read the active task's `context_file` and
   closing `## Resume Note`.
2. Read `CONTEXT.md` and relevant `.ultra/decisions/` entries when they exist.
3. Inspect Git `HEAD`, worktree status, active/archive Change directories and installed
   host manifests without repairing them.

## Definition of done

- The artifact route below is evaluated in order and the matching evidence is named.
- Stale test evidence, dirty worktree state and task graph risks are visible.
- Installation health reports exact missing or drifted files without mutation.
- The recommendation says why it follows; it does not launch the capability.

## Infer the route

| Observable files | Recommendation |
|---|---|
| No `.ultra/` | `ultra-init` |
| Product specification missing or contains `[NEEDS CLARIFICATION]` | `ultra-research` |
| A new request exists and no active Change exists | `ultra-change` |
| An active Change exists and `.ultra/tasks.json` is missing or `tasks` is empty | `ultra-plan` |
| A frontier task is pending or in progress | `ultra-dev`, naming the task |
| All tasks completed and no current report | `ultra-test` |
| `test-report.passed` is false | `ultra-dev`, with blocking findings |
| Report passed and `git_commit` equals `HEAD` | `ultra-deliver` |
| No active Change and no new request | Report the idle state; do not manufacture work |

A report whose `git_commit` differs from `HEAD`, or whose recorded `worktree.diff_digest`
differs from the result of resolving the installed `ultra-test` Skill and running
`node <ultra-test-skill-dir>/scripts/worktree_digest.cjs --project <repository-root>`, is stale. A dirty
worktree is a warning, not evidence of failure.

## Surface risk and installation health

List unmet task dependencies, any `in_progress` task older than 3 days, complexity
concentration and broken `trace_to` or `context_file` paths. These are sensors.

For installation health, compare the selected host's plugin path, skill inventory,
version, provenance and hook manifest against the installed files. Report broken links
and missing registrations. Recommend `ubp install` or `ubp update` as the reachable
repair; this read-only skill never performs it.

## When the owner decides

The owner chooses the next workflow, risk disposition and any reinstall. Contradictory
file facts are reported as contradictions rather than silently selecting one.

## References

- `../ultra-think/SKILL.md` — read only when contradictory evidence creates a real
  decision rather than a mechanical repair.
- `../ultra-think/references/autonomy-boundary.md` — read before recommending a route
  that would reduce an accepted commitment.
