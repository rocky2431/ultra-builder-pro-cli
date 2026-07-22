---
name: ultra-doctor
description: Diagnose and recover Ultra DB schema, workflow outputs, projections, sessions, incidents, change artifacts, archives, hooks, and installed host assets. Use when authority is degraded, workflow state disagrees with prompts, outputs are stale, hooks fail, or MCP operations cannot proceed.
---

# Diagnose before repair

Default to read-only diagnosis. Call `system.doctor` with repair disabled and inspect:

- SQLite integrity, schema version, required tables, and migration provenance;
- baseline classification/readiness, research provenance, spec/evidence digests, gaps,
  and revision/worktree drift;
- active, blocked, and ready workflow runs, current steps, blockers, and output health;
- active decision threads, the sole current question, blocking deferrals, checkpoint
  state, and current checkpoint artifact digests;
- event/projection cursor lag and failed or interrupted projection jobs;
- sessions, incidents, circuit state, active-change artifacts, and archive journals;
- external provider ownership boundaries.

An expected blocked workflow is a workflow warning, not DB corruption. A stale or
missing recorded output is an authority failure for that run. Doctor cannot invent
evidence, complete a step, accept a failure, approve a baseline, or change product
scope.
An awaiting owner decision is also a recoverable warning, not corruption. A missing or
changed artifact bound to a current confirmed checkpoint is an authority failure;
doctor may report it but cannot reconstruct the decision or approval.

## Route failures

- Missing or migrated baseline evidence: `ultra-init` and the exact research step.
- Stale workflow output: restore or regenerate the artifact from accepted evidence,
  then record the affected step again and re-run completion.
- Projection lag with healthy authority: eligible for mechanical regeneration.
- Orphan session: reconcile the recorded lease; do not kill unrelated processes.
- Missing change artifact: recover from version control, backup, or explicit owner
  decision rather than silently recreating it.
- Open decision: resume its exact question through `ultra-think`; checkpoint-ready
  state requires owner confirmation, not mechanical repair.
- Stale decision artifact: restore or update the artifact from accepted authority,
  then reprepare and reconfirm the same checkpoint through `ultra-think`; do not
  rewrite the owner decision or mark the failure healthy mechanically.
- Corrupt SQLite: preserve DB/WAL/SHM and obtain a restore-or-rebaseline decision.

## Explicit project repair

After authorization, call `system.doctor` with repair enabled. Repair is limited to
supported schema upgrades, backup-first archive recovery, orphan reconciliation,
staleness consumption, projection requeue, and projection regeneration. Verify the
pre-migration and repair backup paths and rerun the read-only report. A completed repair
action does not imply healthy workflow evidence.

When integrity prevents opening the DB, use only the documented restore or rebaseline
command with its explicit confirmation token. Both must quarantine or back up prior
authority and roll back on failure.

## Installed host failures

For a missing hook adapter or stale plugin path, capture the manifest and missing
target, run `ubp --doctor` for the actual host, reinstall through the adapter rather
than patching cache contents, and verify provenance, hashes, entry points, MCP startup,
and a hook smoke test. Project doctor and installer doctor are separate authorities.

Return health first, failing authority checks, workflow warnings, backup/recovery
paths, whether repair ran, unresolved owners, and one exact next action. Do not edit
application code or external memory/graph providers through this Skill.
