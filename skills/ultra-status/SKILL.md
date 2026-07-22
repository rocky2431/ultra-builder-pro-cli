---
name: ultra-status
description: Report authoritative Ultra project health, baseline, workflow position, task/session progress, evidence freshness, blockers, and one deterministic next action. Use when the user asks what is complete, blocked, stale, or next in an Ultra project.
---

# Route from authoritative state

This workflow is read-only. Never reconstruct status from prose or generated task
projections.

## Read order

1. Call `system.doctor` with repair disabled.
2. Call `baseline.get` for classification, readiness, revision, worktree, spec digests,
   research provenance, gaps, and blockers.
3. Call `workflow.list`, then `workflow.get` for every active, blocked, or ready run.
4. Call `change.breadcrumb`, `change.list`, `task.list`, and `session.list`.
5. Inspect current Git branch, full HEAD, and worktree without mutation.
6. Read test, review, and delivery artifacts only when referenced by DB workflow state;
   compare their recorded digest and revision with current authority.

If state is unreadable, report that panel unavailable and route to `ultra-doctor`.
Never fall back to generated task JSON, raw SQLite queries, or context frontmatter.

## Choose one route

Prefer the breadcrumb and durable workflow position:

- state integrity, schema, projection, or installed-asset failure: `ultra-doctor`;
- missing project or migrated compatibility authority: `ultra-init`;
- active/blocked research: `ultra-research` at its exact `current_step`;
- ready research with unconverged baseline: finalize research, record, approve, and
  converge through `ultra-research`;
- active plan/change/dev/test/review/deliver run: its matching workflow at the exact
  step or blocker;
- ready baseline with no change: `ultra-change` to persist the requested outcome before
  any planning;
- archived change with fresh evidence: report completion without inventing more work.

Context-size warnings are advisory. Missing authority, stale required refs or outputs,
incomplete task contracts, failed evidence, unresolved learning, and missing approval
are blockers.

## Output

Report:

```text
Ultra: <healthy|degraded> · <branch>@<head> · worktree <clean|dirty>
Baseline: <mode>/<status> · research=<run/status> · gaps=<open>/<blocking>
Workflow: <kind/id/status> · step=<current|finalize> · outputs=<fresh|stale>
Change: <id/status|none> · Task: <id/status|none> · Sessions: <active>
Evidence: test=<state> · review=<two axes> · delivery=<state>
Blockers: <specific codes or none>
Warnings: <advisory codes or none>
Next: <one exact action>
```

Separate verified facts, inferences, and unavailable evidence. Do not modify state,
compile context, repair, or release from this Skill.
