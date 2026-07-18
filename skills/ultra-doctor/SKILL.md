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
- interrupted archive journals;
- orphan sessions;
- missing active-change artifact roots;
- missing, incomplete, or stale project baseline readiness and specification digests;
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
- Missing or incomplete baseline evidence routes to `ultra-init`. Doctor repair does
  not approve a baseline, accept known-red verification, or invent adoption evidence.
  Baseline readiness is an advisory workflow check, not state-database corruption and
  not a reason for doctor repair.
- A compatibility `migrated` baseline requires explicit brownfield re-adoption and
  cannot authorize ordinary changes.
- A corrupt SQLite file requires preserving the file, locating a verified backup, and
  an explicit restore-or-rebaseline decision.

## Explicit repair

After authorization, call `system.doctor` with `{ "repair": true }` or use the
installed `ultra-tools system doctor --repair` fallback. The CLI applies supported
schema upgrades to the packaged current schema and reports a pre-migration backup path. Doctor then
creates a second timestamped backup before runtime recovery.

Repair is limited to documented schema upgrades, archive-journal completion,
reconciling orphan sessions, consuming staleness events, requeueing interrupted or
failed projections, and regenerating projections from authoritative state. If either
backup fails, stop. Always inspect the post-repair report; a completed repair action
does not imply healthy state.

If SQLite integrity prevents doctor from opening authority, preserve the original
database, WAL, and SHM. After the owner chooses a recovery path, either run
`ultra-tools system restore --backup <managed-backup> --confirm
REPLACE_CORRUPT_ULTRA_STATE` or run `ultra-tools system rebaseline --project-name
<name> [--scope <path>] --confirm REBASELINE_CORRUPT_ULTRA_STATE`. Both commands
must report the recovery backup directory. A failed command must restore the
original authority, sidecars, and task projection before returning an error.

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

Lead with `healthy` or `degraded`. List failing authority checks separately from
baseline warnings, incident identifiers, cursor lag, whether repair ran, the backup
path, and each unresolved action with its owner.

Do not fix application code, delete state, reset Git, close healthy sessions, or
install and repair external providers through this workflow.
