---
name: ultra-init
description: Initialize a new repository, adopt an existing codebase, or upgrade prior Ultra state into an evidence-backed project baseline. Use when `.ultra` is absent, baseline readiness is incomplete, or legacy project state must be migrated.
---

# Establish the project baseline

Create or recover project-local Ultra authority, classify the repository, and finish
the applicable baseline workflow. Keep application source unchanged during adoption.

## Authority rules

- Treat `.ultra/state.db` as the only durable Ultra authority.
- Preserve every existing `.ultra/` tree and migration backup.
- Require explicit authorization before replacing a healthy baseline or discarding a
  corrupt database.
- Store only metadata references for external memory and code-graph providers.
- Create ordinary tasks only after the baseline is ready. Record characterization
  needs and adoption gaps in the gap ledger until convergence.

## Inspect and route

1. Bind the repository root, Git branch and HEAD, worktree status, manifests, package
   scripts, workspace markers, deployment files, and existing `.ultra/` assets.
2. When `.ultra/` is absent, run **Bootstrap**.
3. When `.ultra/tasks/tasks.json` contains tasks but `state.db` is absent or has no
   tasks, run **Import projection-only state** before ordinary state-backed work.
4. When `state.db` exists, run read-only project doctor first. Call `baseline.get`
   only when doctor confirms that the current schema authority is readable. Route an
   old schema to repair and a corrupt database to recovery without another DB read.
5. After current authority is readable, call `task.init_project` with `resume: true` to install
   only missing current scaffold files. Verify that existing artifacts were preserved.
6. Route the result:
   - healthy `ready` baseline: return `ultra-change` or `ultra-status`;
   - `draft`, `adopting`, or baseline-blocked: resume the matching baseline;
   - `migrated`: start evidence-backed brownfield re-adoption;
   - old schema: run backup-first schema repair;
   - corrupt database: preserve it and stop at the restore-or-rebaseline decision.

## Bootstrap

Derive project metadata from repository evidence. Call `task.init_project` with
`mode: "auto"`. Pass `scope` when the user selected a monorepo boundary; otherwise use
the repository root. Use an explicit mode only when the user supplied an authoritative
classification.

Verify `repository_profile`, selected scope, detected mode, baseline lifecycle, schema
version, copied templates, initial projection, and `project_initialized` event.

## Import projection-only state

Call `task.init_project` with `resume: true` as the single authority check and run the
exact supported backup-first import command returned in its structured error. Do not
infer an import path or edit the projection manually.

Verify imported task and event counts, backup path, current schema state, projection
parity, and the `migrated/adopting` compatibility baseline. Then call `baseline.start` with a
new id, `mode: "brownfield"`, `replace_migrated: true`, the selected scope, current
revision, and repository classification. Never treat the compatibility row as owner
approval.

For an older database schema, run `ultra-tools system doctor --repair`; verify both the
pre-migration backup and post-repair backup plus the current schema before continuing.
Then resume initialization to merge missing scaffold assets without overwriting the
project's existing baseline documents.

## Complete the selected mode

For `brownfield`, `migrated`, or an incomplete existing adoption, read
`references/brownfield-adoption.md` completely and execute it through owner approval.

For `greenfield`, keep the baseline in `draft` until product and architecture intent is
evidence-backed. Route unresolved intent through `ultra-research`, record the complete
baseline snapshot, obtain owner approval, and converge it before planning.

## Recovery handling

- `ULTRA_DIR_EXISTS`: inspect and resume the existing state.
- `LEGACY_STATE_MIGRATION_REQUIRED`: execute the returned migration command.
- `BASELINE_IN_PROGRESS`: resume the named row; never create a parallel authority.
- `BASELINE_EXISTS`: return the healthy route. Replacing a ready baseline is outside
  ordinary initialization; stop for owner authorization before calling
  `baseline.start` with a new id, `replace_ready: true`, and
  `replacement_authorization: { approved_by, reason }`. The approval identity and
  rationale must be persisted in the `baseline_started` event.
- `BASELINE_SCOPE_MISSING`: correct the selected monorepo boundary.
- `TEMPLATE_MISSING`: run installer doctor and reinstall through the host adapter.
- `STATE_DB_CORRUPT`: retain the database, inspect `.ultra/backups`, and obtain the
  restore-or-rebaseline decision. Restore only a verified managed backup with
  `ultra-tools system restore --backup <path> --confirm REPLACE_CORRUPT_ULTRA_STATE`.
  When no valid backup exists and the owner explicitly accepts rebuilding authority,
  run `ultra-tools system rebaseline --project-name <name> [--scope <path>] --confirm
  REBASELINE_CORRUPT_ULTRA_STATE`; verify the quarantined database and legacy
  projection paths before continuing adoption.
- `IO_ERROR`: verify rollback restoration and preserve every reported backup path.

## Completion

Initialization is complete only when:

- current schema authority is readable;
- repository classification and scope are recorded;
- product and architecture baseline files exist;
- verification, unknowns, gaps, evidence, and provider references are recorded;
- explicit owner approval has converged the baseline to `ready`;
- `baseline.get` reports current health and project doctor has no authority failure.

Report the target, classification evidence, migration and backup paths, baseline id,
mode, status, revision, branch, worktree snapshot, verification results, gap summary,
approval state, and one exact next action. Stop at the approval step when owner consent
has not yet been provided.
