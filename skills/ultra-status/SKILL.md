---
name: ultra-status
description: "Route the project from its authoritative Ultra breadcrumb, readiness gates, task state, and current verification evidence."
user-invocable: true
runtime: all
mcp_tools_required:
  - change.breadcrumb
  - change.list
  - task.list
  - task.get
  - session.list
  - system.doctor
cli_fallback: "status --cost --json"
---

# ultra-status — One Router, One Next Action

Use this workflow to answer “where are we?” and “what should happen next?” without
reconstructing project state from prose. `.ultra/state.db` is authoritative; reports
and Markdown are evidence or projections.

## Read order

1. Call `system.doctor { repair: false }`. If authority is unhealthy, route only to
   `ultra-doctor` and include the blocking diagnostic.
2. Call `change.breadcrumb`. It returns the active change, task, role, gate,
   readiness, blockers, stale status, and one deterministic next action.
3. Call `task.list` and `session.list` for counts and active execution detail.
4. Read `.ultra/test-report.json` and `.ultra/delivery-report.json` only when they
   exist. Treat a report from a different HEAD as stale.
5. Read git branch, HEAD, and worktree status. Do not mutate anything.

Never fall back to `.ultra/tasks/tasks.json`, context Markdown frontmatter, or raw
SQLite when MCP task state is unavailable. Label that panel unavailable.

## Routing rules

The breadcrumb owns the primary route. Do not print a menu of every Ultra command.

| State | Route |
|---|---|
| doctor unhealthy | `ultra-doctor` |
| no Ultra project | `ultra-init` |
| no baseline specs or tasks | `ultra-research` or `ultra-plan`, matching the missing artifact |
| readiness blocked or context stale | recompile through `ultra-change`, `ultra-plan`, or `ultra-dev` as named by the breadcrumb |
| implementation task ready | `ultra-dev <task-id>` |
| all scoped tasks complete, test report missing/stale | `ultra-test` |
| review or convergence incomplete | `ultra-review all` or `ultra-deliver`, matching the gate |
| ready change | `ultra-deliver` |
| archived change and clean HEAD | report complete; do not invent more work |

When there is no active change, derive a single baseline route from tasks and reports.
If several changes are active or blocked, report ambiguity and require an explicit
change id instead of guessing.

## Output

Keep the answer compact:

```text
Ultra: <healthy|degraded> · <branch>@<head> · worktree <clean|dirty>
Position: change=<id|none> task=<id|none> role=<role> gate=<gate>
Readiness: <ready|blocked|stale> — <blockers or none>
Progress: <completed>/<total>; sessions=<active count>
Evidence: tests=<fresh|stale|missing>; delivery=<fresh|stale|missing>
Next: <exactly one action, including the task/change id when known>
```

Separate verified facts from unavailable panels. Do not hide a stale context or stale
test report behind an overall “healthy” label.

## Boundaries

- Read-only: this workflow does not repair, compile context, update tasks, or release.
- Cost data may use the declared CLI fallback, but task/change authority may not.
- External memory and code graph providers are optional metadata references; their
  absence does not change Ultra authority.
