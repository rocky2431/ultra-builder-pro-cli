---
name: ultra-status
description: "Real-time project status — progress, risk analysis, workflow routing. Reads task.list + session.list from state.db; reads test/delivery reports from files."
runtime: all
mcp_tools_required:
  - task.list
  - task.get
  - session.list
  - session.subscribe_events
  - change.list
  - system.doctor
cli_fallback: "status --cost --json"
---

# ultra-status — Phase 3.6

Single-call dashboard. Pulls task state from state.db (authoritative), layers
in `.ultra/test-report.json` + `.ultra/delivery-report.json` (file artifacts),
reports progress + risks + workflow routing.
It never treats a completed initial delivery as a terminal state: a healthy
baseline routes the next daily request through `/ultra-change`.

## Authority failure boundary

`task.list` and `task.get` are the only task-state inputs. If either is
unavailable or returns an authority error, surface it and stop. Never fall back to `.ultra/tasks/tasks.json`.
On `LEGACY_STATE_MIGRATION_REQUIRED`, instruct the
user to run `ultra-tools migrate --from=4.4 --to=4.5 --source-dir <project-root>`.

## Workflow

### Phase 0 — Environment validation

| Check | If missing |
|-------|-----------|
| state.db reachable through `task.list` | suggest `/ultra-init` only when `.ultra/` is absent; otherwise surface the MCP error |
| At least one task visible via `task.list` | suggest `/ultra-plan` |
| `task.list` returns valid rows | surface error |

### Phase 1 — Load data

```jsonc
// MCP: task.list (no filter — get all tasks)
{}
// → { tasks: [...], count: N }

// MCP: session.list (active sessions; Phase 4.5.4)
{ "status": "running" }
// → { sessions: [...], count: N }

// MCP: session.subscribe_events (recent events for the "last event" panel)
{ "since_id": 0, "limit": 20 }
// → { events: [...], next_since_id: M }

// MCP: change.list (continuous-change lane)
{ "limit": 20 }

// MCP: system.doctor (read-only runtime health)
{ "repair": false }
```

Also read:
- `.ultra/test-report.json` — if present
- `.ultra/delivery-report.json` — if present

Extract:
- Task stats: by status (`pending`/`in_progress`/`completed`/`blocked`), by priority (P0-P3)
- Current `in_progress` task, next `pending` task (topological order)
- Active sessions: count, per-runtime breakdown, orphan warnings
- Most recent 20 events (by `events.id` DESC) — "last event" panel
- Test passed / failed / stale (compare `git_commit` to HEAD)
- Delivery readiness (tag + pushed)
- Active/blocked/ready change, linked task counts, docs impact, and context freshness
- Runtime health: open incidents, projection lag/failure, orphan sessions, missing change artifacts

### Phase 2 — Progress report

Compact multi-section output:
- **Overview**: progress bar `[████░░░░] 50%`, completion %, velocity (completed tasks / elapsed days)
- **Tasks**: counts per status + per priority
- **Test**: pass/fail, `run_count`, `blocking_issues` if any
- **Delivery**: `version` + `pushed` + last tag
- **Change**: active id/kind/status, docs impact, task completion, context/provider freshness
- **Runtime**: healthy/degraded with failing doctor checks only
- **Risks**: auto-detected list (see Phase 3)
- **Next**: recommended next task (see Phase 4)

### Phase 3 — Risk detection

Auto-detect:
- **Blockers**: tasks with unsatisfied dependencies
- **Stalled**: `in_progress` for >3 days (check `updated_at`)
- **Overdue**: past `estimated_days` from when moved to `in_progress`
- **Complexity spike**: 3+ consecutive `pending` tasks with complexity ≥7
- **Test stale**: `test-report.json.git_commit ≠ HEAD`
- **Orphan sessions**: any session with `lease_expires_at < now()` still status=running
  (uninitialized by orphan-reaper; escalate)
- **Projection/incident failure**: read-only doctor is degraded → route to
  `/ultra-doctor`; never infer recovery from a generated JSON file
- **Context stale**: active change manifest head or task set differs from current state
- **Docs drift**: change has `docs_impact.status=unknown` or declared required file is missing

| Icon | Meaning | Action |
|------|---------|--------|
| 🟢 | on track | continue |
| 🟡 | minor issues | review stalled |
| 🟠 | significant risks | address blockers |
| 🔴 | critical | stop and resolve |

### Phase 4 — Next-task recommendation

Select next optimal task by:
1. Priority (P0 > P1 > P2 > P3)
2. Dependencies resolved (only `pending` with all deps `completed`)
3. Complexity sweet spot (prefer 3-5, avoid clustering 7+)
4. Context continuity (favor same component as recent completed task)

### Phase 5 — Workflow routing (▶ Next Up)

Detect position from artifacts:

| Condition | Route |
|-----------|-------|
| No `.ultra/` | `/ultra-init` |
| Specs have `[NEEDS CLARIFICATION]` or missing | `/ultra-research` |
| No tasks and no delivered baseline | `/ultra-plan` |
| Doctor degraded because of Ultra runtime state | `/ultra-doctor` |
| No active/blocked/ready change and fresh delivery exists | `/ultra-change` for the next daily change |
| Active change has any `pending` linked task | `/ultra-dev` (show which) |
| Active change linked tasks all `completed` | `/ultra-test` |
| Matching fresh `test-report.json.passed === true` | `/ultra-deliver` |
| `test-report.json.passed === false` | `/ultra-dev` (show blocking issues) |
| Change is `ready` | `/ultra-deliver` to reconcile/archive before release completion |
| Latest change archived and delivery fresh | Baseline healthy; next work starts with `/ultra-change` |

**Safety checks before routing**:
- Routing to deliver but `test-report.git_commit ≠ HEAD` → warn "Tests stale"
- `git status --porcelain` non-empty → warn "Uncommitted changes"

**Output block**:
```markdown
---
## ▶ Next Up
**{command}** — {description}
`/clear` then `/{command}`
---
**Also available**: `/{alt}` — {description}
---
```

## Single-task mode (`$1` supplied)

When `task-id` provided:
```jsonc
// MCP: task.get
{ "id": "<id>" }
```
Display: title, status, priority, complexity, deps, files_modified (if set),
session_id (if active), `context_file`, `trace_to`, stale flag, update history.

## MCP and CLI matrix

| Purpose | MCP tool | CLI fallback |
|---------|----------|--------------|
| List tasks | `task.list` | none; fail closed |
| Single task detail | `task.get` | none; fail closed |
| Change lane | `change.list` | none; fail closed |
| Runtime health | `system.doctor { repair:false }` | `ultra-tools system doctor` |
| Cost panel (Phase 6.3) | — | `ultra-tools status --cost --json --since 7d` |

## Cost panel (Phase 6.3)

`ultra-tools status --cost --json` returns `{period, by_runtime, top_tasks,
total_cost_usd}`. Render under the progress section when the user asks
"how much did we spend?" or `/ultra-status --cost` is invoked. `--since 7d`
is the conventional weekly window; override with ISO-8601 for custom ranges.

## What this skill DOES NOT do

- Does NOT modify or repair state
- Does NOT run tests / build / deploy
- Does NOT require all artifacts (partial reports are tolerated)

## Integration

| | |
|---|---|
| **Input** | state.db via task/change/session/system reads, test/delivery reports, git HEAD |
| **Output** | console report (Chinese per project rule) |
| **When** | anytime — idempotent read-only |
