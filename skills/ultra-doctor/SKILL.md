---
name: ultra-doctor
description: Diagnose and mechanically recover Ultra schema, projection, session, archive, hook, and installed-asset faults. Use when authority is degraded, contradictory, or unavailable.
---

# Diagnose before repair

Doctor owns deterministic health and supported recovery. It cannot choose product
scope, invent evidence, accept a baseline, resolve a user decision, or declare
semantic work complete.

## Diagnose

Call `ultra.doctor { repair: false }` and inspect:

- SQLite integrity, schema, backups, WAL/SHM, and migration state;
- artifact ownership, digest freshness, edges, orphans, and duplicate authority;
- team-checkpoint ancestry and real concurrent record conflicts;
- projection jobs, sessions, leases, worktrees, and recovery journals;
- installed plugin assets, MCP startup, and hook paths.

An expected workflow pause, editable draft, semantic warning, or awaiting owner
decision is not corruption.

## Repair

With explicit repair authority, call `ultra.doctor { repair: true }`. It may apply
backup-first schema migration, regenerate local projections, recover supported
journals, reconcile orphan sessions, and repair installed mechanical assets.

It may not manufacture semantic evidence, import or publish a team checkpoint, replace
a healthy baseline, resolve decisions, edit application code, or force a draft to
accepted. Use `ultra.sync` for reviewed checkpoint import/publish. Doctor never changes
semantic checkpoint acceptance or Change intent.

Preserve corrupt DB/WAL/SHM and dirty worktrees. Never patch plugin cache files by
hand; reinstall through `ubp` and verify the installed manifest and hook targets.

Rerun doctor read-only after repair. Report health, exact failed checks, backups,
repairs, preserved recovery paths, and remaining owner or semantic work. Do not invoke
another capability automatically.
