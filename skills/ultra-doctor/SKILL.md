---
name: ultra-doctor
description: "Inspect Ultra state, projection, session, incident, and active-change health; optionally run explicit backup-first mechanical recovery."
runtime: all
mcp_tools_required:
  - system.doctor
cli_fallback: "system doctor"
---

# ultra-doctor — Runtime Diagnostics and Recovery

Use this workflow when Ultra state appears empty, projections disagree with
`state.db`, a hook reports a missing adapter, sessions are orphaned, a change
artifact is missing, or MCP operations return degraded projection metadata.

## Default is read-only

Call `system.doctor` with `{ "repair": false }` unless the user explicitly
requests repair. Read-only diagnosis reports:

- SQLite integrity and required tables;
- open structured incidents;
- projection queue failures and event/projection cursor lag;
- orphan sessions;
- missing active-change artifact roots;
- the external ownership boundary for Memory and code graph.

Do not infer health from `tasks.json`. Do not mutate provider state, delete
artifacts, rebuild a graph, or collect memory during diagnosis.

## Interpret the report

| Check | Meaning | Next action |
|---|---|---|
| `state_db` fail | schema/integrity problem | stop ordinary workflow; preserve DB evidence |
| `incidents` fail | a structured runtime failure remains open | report code, source, retryability, and evidence |
| `projections` fail | state commit is ahead of generated views or a projector failed | explicit repair is appropriate when authorized |
| `sessions` fail | an orphan execution lease exists | repair may mark/reconcile it; never kill unrelated processes blindly |
| `change_artifacts` fail | DB points to a missing active packet | recover from version control/backup or recreate deliberately |
| `external_providers` pass | ownership is correctly external | provider availability must be checked with its own plugin/tool |

## Explicit repair mode

Only after the user asks for repair, call `system.doctor` with
`{ "repair": true }`, or use the fallback:

```bash
ultra-tools system doctor --repair
```

The runtime must create `.ultra/backups/state-<timestamp>.db` before any
mechanical repair. Repair is bounded to:

- boot recovery for orphan sessions;
- durable consumption of spec-staleness events;
- requeueing projection jobs left `running` beyond the interruption cutoff;
- requeueing failed projection jobs;
- regenerating projections from authoritative state.

If backup fails, repair must stop with `BACKUP_FAILED`. A repair result is not
automatically healthy; inspect the returned post-repair report and keep any
remaining incident unresolved.

## Hook/path failures

For an installed hook that points to a missing cached file:

1. capture the exact hook config path and missing target;
2. verify the currently installed plugin/cache version;
3. reinstall or regenerate the host-native plugin through the adapter;
4. rerun read-only doctor and a host hook smoke test.

Do not bypass a broken hook by changing application implementation, and do not
treat a hook failure as project-code evidence.

## Output

Lead with `healthy` or `degraded`, list only failing checks, and include:

- incident ids/codes and sources;
- event vs projected cursor;
- whether repair ran;
- backup path when repair ran;
- unresolved actions and their owner (`Ultra`, host plugin, or external provider).

## What this skill does not do

- It does not fix project code or semantic specification conflicts.
- It does not delete state, force-reset git, or close live healthy sessions.
- It does not install, query, refresh, or repair external Memory/graph providers.
