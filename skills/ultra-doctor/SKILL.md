---
name: ultra-doctor
description: Diagnose and mechanically recover Ultra schema, workflow, projection, session, archive, hook, and installed-asset faults. Use when authority is degraded, stale, contradictory, or unavailable.
---

# Diagnose before repair

Doctor owns deterministic health and supported recovery. It cannot decide product
scope, invent evidence, approve a baseline, answer a user decision, or mark semantic
work complete.

## Read-only diagnosis

Run `system.doctor` without repair and inspect:

- SQLite integrity, schema 18 migration, required tables, and backups;
- baseline and research provenance, gaps, digests, and Git/worktree drift;
- workflow status, obsolete-step migration, blockers, and output freshness;
- decisions and checkpoint artifact freshness;
- projection jobs and event cursors;
- sessions, preserved worktrees, incidents, circuit state, and archive journals;
- external provider boundaries.

An expected workflow pause or awaiting user decision is a warning, not corruption.
Missing or changed required evidence is an authority failure but cannot be reconstructed
by doctor.

## Recovery boundary

With explicit repair authorization, `system.doctor` may:

- apply backup-first supported schema migrations;
- migrate active pre-18 rigid workflows into recoverable adaptive state;
- requeue or regenerate projections from healthy DB authority;
- reconcile orphan sessions without deleting unrelated or dirty worktrees;
- resume supported archive journals;
- recover missing workflow provenance as a blocked run requiring real evidence.

It may not create a Git checkpoint, replace a healthy baseline, accept known failures,
resolve decisions, regenerate semantic content, or edit application code.

Corrupt SQLite requires preservation of DB, WAL, and SHM followed by an explicit
restore-or-rebaseline choice. Missing hook adapters or stale cache paths require
`ubp --doctor` and adapter reinstall; never patch plugin cache contents by hand.

After repair, rerun doctor read-only and verify backup paths, schema, installed hashes,
entry points, MCP startup, and hook smoke tests as applicable.

Return health first, failed checks, mechanical repairs performed, preserved recovery
paths, unresolved owners, and allowed transitions plus any unique required transition.
