---
name: ultra-doctor
description: Diagnose Ultra state, projection, session, incident, change-artifact, and installed-plugin health with bounded recovery. Use when Ultra state appears missing, projections disagree, hooks fail, or MCP operations report degraded health.
---

# Diagnose and recover the Ultra runtime

Default to read-only diagnosis. Repair only after the user explicitly authorizes it.

## Project-state diagnosis

Call `system.doctor` with `{ "repair": false }` and inspect:

- SQLite integrity and required tables;
- open structured incidents;
- event and projection cursor lag;
- failed or interrupted projection jobs;
- orphan sessions;
- missing active-change artifact roots;
- the boundary to separately installed memory and code-graph providers.

Do not infer health from generated task JSON. Do not mutate external provider state,
delete artifacts, or collect memory during diagnosis.

## Interpret failures

- State integrity failure blocks ordinary workflows and requires preserving database
  evidence before recovery.
- An open incident requires its code, source, retryability, and evidence.
- Projection lag may be mechanically repairable when authority is healthy.
- An orphan session may be reconciled; never kill unrelated processes blindly.
- A missing change artifact requires version-control, backup, or deliberate recreation
  evidence rather than silent regeneration.

## Explicit repair

After authorization, call `system.doctor` with `{ "repair": true }` or use the
installed `ultra-tools system doctor --repair` fallback. The runtime must create a
timestamped state database backup before any mechanical repair.

Repair is limited to documented recovery operations such as reconciling orphan
sessions, consuming staleness events, requeueing interrupted or failed projections,
and regenerating projections from authoritative state. If backup fails, stop. Always
inspect the post-repair report; a completed repair action does not imply healthy state.

## Installed-plugin failures

When a hook points to a missing installed file:

1. Capture the hook manifest path and missing target.
2. Run the installer doctor for the actual host and install scope.
3. Preserve provenance, asset-hash, and host-contract findings.
4. Reinstall through the host adapter rather than patching a cache directory.
5. Rerun installer doctor, `system.doctor`, and a host hook smoke test.

Project doctor covers `.ultra/state.db`; installer doctor covers packaged files and
host wiring. Neither substitutes for the other.

## Output

Lead with `healthy` or `degraded`. List failing checks, incident identifiers, cursor
lag, whether repair ran, the backup path, and each unresolved action with its owner.

Do not fix application code, delete state, reset Git, close healthy sessions, or
install and repair external providers through this workflow.
