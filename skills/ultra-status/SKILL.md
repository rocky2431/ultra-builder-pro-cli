---
name: ultra-status
description: Report authoritative Ultra health, position, readiness, evidence freshness, and one deterministic next action. Use when the user asks where an Ultra project stands or what should happen next.
---

# Route from authoritative status

Answer status questions without reconstructing state from prose. `.ultra/state.db` is
authoritative; reports and Markdown are evidence or projections.

## Read order

1. Call `system.doctor` in read-only mode. If authority is unhealthy, route only to
   `ultra-doctor` and include the blocking diagnostic.
2. Call `baseline.get` for mode, lifecycle status, repository revision, branch,
   worktree snapshot, specification digest health, gap ledger, and adoption blockers.
3. Call `change.breadcrumb` for the active change, task, role, gate, readiness,
   blockers, advisory warnings, staleness, and next action.
4. Call `task.list` and `session.list` for progress and active execution details.
5. Read test and delivery reports only when present, and mark a report stale when its
   HEAD differs from the current checkout.
6. Read Git branch, HEAD, and worktree status without mutation.

If MCP task or change state is unavailable, label that panel unavailable. Never fall
back to generated task JSON, context frontmatter, or raw SQLite.

## Routing

Follow the breadcrumb's primary route and return one action, not a menu:

- unhealthy authority: `ultra-doctor`;
- missing Ultra project: `ultra-init`;
- projection-only authority conflict: run the exact supported import command from the
  MCP error, then `ultra-init`;
- migrated or missing baseline evidence with no active change: `ultra-init`, then
  `ultra-research` or `ultra-plan` according to the gap;
- baseline or context-budget warning during an active change: keep the current route
  and surface the warning; do not turn it into a refusal;
- blocked or stale context: the workflow named by the breadcrumb;
- ready implementation task: `ultra-dev <task-id>`;
- completed tasks with missing or stale test evidence: `ultra-test`;
- incomplete review or convergence: `ultra-review` or `ultra-deliver`;
- ready change: `ultra-deliver`;
- archived change with fresh evidence: report completion without inventing more work.

Require an explicit change id when several active changes make the route ambiguous.

## Output

Use a compact shape:

```text
Ultra: <healthy|degraded> · <branch>@<head> · worktree <clean|dirty>
Position: change=<id|none> task=<id|none> role=<role> gate=<gate>
Baseline: <greenfield|brownfield|migrated>/<status> revision=<revision|none> gaps=<open>/<blocking>
Readiness: <ready|blocked|stale> — <blockers or none>
Warnings: <advisory conditions or none>
Progress: <completed>/<total>; sessions=<active count>
Evidence: tests=<fresh|stale|missing>; delivery=<fresh|stale|missing>
Next: <one exact action>
```

This workflow is read-only. It does not repair state, compile context, update tasks, or
release software.
