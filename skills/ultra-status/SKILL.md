---
name: ultra-status
description: Read authoritative Ultra health, workflows, decisions, changes, tasks, evidence freshness, and team checkpoint state. Use when the user asks what is complete, blocked, stale, or currently possible.
---

# Report authoritative state

This Skill is read-only.

## Read

Call `ultra.context { stage: project, detail: full }`. Use `ultra.sync { action:
inspect }` only when the user needs team-checkpoint detail. Do not import, publish,
repair, compile context, or mutate state.
Never fall back to the Git team checkpoint, generated task JSON, or report files as
live authority when `ultra.context` reports missing or unhealthy local state.

Report:

```text
Ultra: <healthy|degraded> · <branch>@<head|unborn|non-git>
Baseline: <mode>/<status> · gaps=<open>/<blocking>
Stage checkpoints: drafts=<count> · accepted=<current|stale|none>
Change: <id/status|none> · delta/docs=<state>
Task: <id/status|none> · Sessions: <active>
Evidence: plan=<state> · test=<state> · review=<axes> · delivery=<state>
Team checkpoint: <current|drifted|revalidation_required|missing|invalid>
Blockers: <hard mechanical blockers or none>
Warnings: <advisory semantic diagnostics or none>
Model recommendation: <capability and concise rationale>
```

Treat warnings and failed draft checks as information, not mechanical orders. Only
corruption, unsafe paths, real concurrency conflicts, permissions, or irreversible
external effects are hard blockers.

The host model recommends the next useful capability from accepted intent, current
evidence, cost of interruption, and owner goal. SQLite does not choose the route.
Separate verified facts, model inference, and unavailable evidence. Never invoke the
recommendation automatically.
