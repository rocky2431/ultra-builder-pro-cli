---
name: ultra-init
description: Create or recover Ultra project authority for a new repository, an existing codebase, or an older Ultra installation. Use when `.ultra` is absent, initialization is incomplete, or doctor reports a migration or initialization fault.
---

# Initialize project authority

Initialization is a bounded setup capability. It creates or repairs the repository and
Ultra authority; it does not perform product research, approve a baseline, or choose
the next semantic workflow.

## Inspect before mutation

1. Identify the repository root, existing `.ultra` state, Git state, meaningful source,
   monorepo boundaries, and current owner request.
2. If `.ultra/state.db` exists, run `system.doctor` read-only and resume with
   `task.init_project` only when its report permits it.
3. Otherwise call `task.init_project` with `mode: "auto"`, the project name, and an
   explicit scope only when the repository contains multiple plausible roots.
4. Leave `git_mode` as `auto` unless the user explicitly requires a non-Git workspace.

Use repository evidence to classify:

- `greenfield`: no meaningful delivered application behavior is present;
- `brownfield`: source, runtime, API, data, deployment, or tests describe an existing
  maintained system;
- `migrated`: older Ultra authority was preserved but is not a trusted baseline.

The model may override an automatic classification only with evidence or an explicit
user decision. Classification must not infer product scope, an MVP, or a release plan.

## Interaction boundary

Read `../ultra-think/references/decision-dialogue.md` before asking a material question.
Inspect observable facts yourself. Use the host's native question UI when available and
plain direct interaction otherwise. Ask only when repository scope, replacement of
healthy authority, destructive recovery, or another material owner decision is truly
unresolved. Normalize clear intent already present in the request without asking again.

## Deterministic initialization contract

`task.init_project` owns these steps:

1. `inspect-authority`
2. `classify-repository`
3. `scaffold-authority`
4. `verify-initialization`

The operation must:

- create or migrate `.ultra/state.db` with a backup before schema migration;
- install only missing scaffold assets on resume;
- preserve existing artifacts and unrelated work;
- preserve an existing Git repository and HEAD;
- initialize Git and a safe `.gitignore` entry when Git is absent;
- report an unborn repository as `initial_commit_required` without manufacturing a
  commit, remote, tag, or push;
- read back the created DB, classification, projection, and Git result before
  completing the init workflow.

Projection-only projects must use the exact backup-first migration command returned by
the runtime. A migrated compatibility baseline requires a new brownfield adoption with
`replace_migrated: true`. Replacing a healthy baseline requires explicit replacement
authority. Corrupt DB, WAL, SHM, and backups must be preserved until the user chooses a
documented recovery operation.

## Completion and handoff

Initialization is complete when the init workflow is `completed`, the current schema is
healthy, the scaffold is readable, and repository classification and Git state are
durable. Research status may still be `not_started`; that is not incomplete init.

Read the returned `allowed_transitions` and `required_transition`:

- a required transition represents a hard recovery invariant and must be followed;
- otherwise the host model recommends among the allowed capabilities using the user's
  goal and current evidence;
- never invoke another public Ultra workflow automatically; recommend the best allowed
  capability and wait for an explicit user invocation.

Report classification, scope, schema and backup result, Git state, init workflow id,
baseline state, and allowed transitions. Do not claim that a baseline is ready until a
separate research/adoption workflow has recorded and converged it.
