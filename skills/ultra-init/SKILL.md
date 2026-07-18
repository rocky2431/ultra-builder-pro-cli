---
name: ultra-init
description: Initialize Ultra Builder Pro or resume greenfield and brownfield baseline adoption. Use when a repository lacks Ultra state or its project baseline is missing, draft, adopting, or blocked.
---

# Initialize or adopt a project

Create project-local Ultra state, then route the repository according to its actual
baseline status. Do not treat an existing codebase as a new product.

## Preflight

Use the current working directory unless the user names another target. Inspect the
root, project manifests, Git state, and `.ultra/` without mutation.

If `.ultra/` exists, call `baseline.get` and `system.doctor`:

- a healthy `ready` baseline routes to `ultra-change` or `ultra-status`;
- `draft`, `adopting`, or baseline-blocked state resumes this workflow;
- state integrity or migration failure routes to `ultra-doctor`;
- recreation requires explicit authorization and must preserve the returned backup.

Never overwrite `.ultra/` merely because the repository is old or its documents are
incomplete.

## Bootstrap

When `.ultra/` is absent, derive project name, type, and stack from repository evidence,
then call `task.init_project` with `mode: "auto"`. Use an explicit `greenfield` or
`brownfield` mode only when the user has made that classification authoritative.

Verify the returned mode, baseline id and status, state database path, initial
projection, and copied specification files.

## Route by mode

### Greenfield

The new baseline begins as `draft`. Route unresolved product or architecture intent to
`ultra-research`. That workflow records evidence and converges the baseline before
planning. Do not create implementation tasks during initialization.

### Brownfield

Read `references/brownfield-adoption.md` completely. Adopt current behavior from the
checkout, tests, maintained documentation, and runtime evidence. Use `baseline.record`
for the bounded snapshot and `baseline.converge` only after the owner approves the
captured baseline and any accepted known-red verification.

## Failure handling

- `ULTRA_DIR_EXISTS`: inspect and resume; do not retry with overwrite automatically.
- `BASELINE_EXISTS`: keep the ready baseline unless explicit re-adoption is required.
- `BASELINE_IN_PROGRESS`: resume the named baseline rather than creating another.
- `TEMPLATE_MISSING`: report a package-integrity failure and route to installer doctor.
- `TARGET_NOT_DIR`, `VALIDATION_ERROR`, or `IO_ERROR`: correct only the evidenced input;
  preserve any backup and partial diagnostic.

## Output

Report target path, detected mode, baseline id/status/revision, state health, known-red
verification, blocking unknowns, and one next action. `.ultra/state.db` is authoritative;
JSON and Markdown projections do not create state.

Do not browse by default, invent missing behavior, rewrite application code, create
business tasks, stage files, or commit as part of initialization.
