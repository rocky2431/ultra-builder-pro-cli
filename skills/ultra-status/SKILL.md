---
name: ultra-status
description: Read authoritative Ultra health, workflows, decisions, changes, tasks, evidence freshness, and valid transitions. Use when the user asks what is complete, blocked, stale, or currently possible.
---

# Report authoritative state

This Skill is read-only. Never fall back to the Git team checkpoint, generated task
JSON, prose, or context frontmatter when checkout-local DB authority is missing or
degraded.

## Read

1. Run `system.doctor` without repair.
2. Run `task.ledger_get`. Report `current`, `drifted`, `revalidation_required`,
   `missing`, or a typed invalid/conflict state; do not import or publish from status.
3. Read baseline classification, revision, worktree, research provenance, gaps, and
   health.
4. Read current decision state and breadcrumb `accepted_intent` without exposing hidden
   future questions.
5. Read active, blocked, and ready workflows and their current steps.
6. Read the active Change root, typed delta, plan, deterministic progress projection,
   documentation reconciliation, findings, tasks, sessions, and current Git state.
7. Read test, review, and delivery artifacts only through DB references and verify
   their digests and revisions.

If authority is unreadable, report the unavailable panel and the required doctor or
init transition. Do not mutate, compile context, repair, or release.

## Interpret transitions

MCP reports:

- `allowed_transitions`: mechanically valid capabilities;
- `required_transition`: the sole recovery route only when a hard invariant permits no
  safe alternative.

The host model recommends among allowed transitions using the user's current goal,
workflow evidence, and cost of interruption. Do not present the recommendation as DB
authority. A healthy project may validly allow research, change, thinking, or status at
the same time.

Report:

```text
Ultra: <healthy|degraded> · <branch>@<head|unborn|non-git> · worktree <state>
Baseline: <mode>/<status> · research=<run/status> · gaps=<open>/<blocking>
Workflow: <kind/id/status> · step=<current|complete> · outputs=<fresh|stale>
Decision: <current|checkpoint|none>
Change: <id/status|none> · delta=<fresh|stale|missing> · docs=<fresh|stale|missing>
Task: <id/status|none> · Sessions: <active>
Evidence: plan=<state> · test=<state> · review=<axes> · delivery=<state>
Team checkpoint: <current|drifted|revalidation_required|missing|invalid> · generation=<n>
Blockers: <codes or none>
Warnings: <codes or none>
Allowed transitions: <capabilities>
Required transition: <capability or none>
Host recommendation: <capability and concise rationale>
```

Separate verified facts, host inference, and unavailable evidence.

Never invoke the recommended capability here; wait for an explicit user invocation.
