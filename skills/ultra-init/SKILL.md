---
name: ultra-init
description: Create or recover Ultra project authority for a new repository, an existing codebase, or an older Ultra installation. Use when `.ultra` is absent, initialization is incomplete, or doctor reports a migration fault.
---

# Initialize project authority

Initialization creates the repository-local Ultra authority. It does not perform
research, accept a product baseline, choose a Change, or start another public
capability.

## Inspect and align

1. Inspect the repository root, Git state, meaningful source, existing `.ultra`,
   monorepo boundaries, and the current request.
2. When authority already exists, call `ultra.doctor { repair: false }` and preserve
   healthy state. Never replace or delete it merely to obtain a clean init.
3. Classify the repository from evidence:
   - `greenfield`: no meaningful delivered behavior exists;
   - `brownfield`: source, runtime, API, data, deployment, or tests describe an
     existing maintained system;
   - `migrated`: older Ultra authority was preserved but is not yet a trusted baseline.
4. Ask the owner only when scope, healthy-authority replacement, destructive recovery,
   or another material choice cannot be derived. Reuse explicit intent.

Read `../ultra-think/references/interaction-boundary.md` before asking a material
question.

## Initialize once

Call `ultra.record` with one typed entry:

```text
kind: baseline
action: initialize
data: { target_dir, project_name, mode=auto, git_mode=auto, optional scope }
idempotency_key: <stable init attempt id>
```

This stateless bootstrap is the only `ultra.record` operation allowed before
`state.db` exists. It must create or migrate `.ultra/.runtime/state.db`, preserve
existing artifacts and Git history, install only missing scaffold assets on resume,
validate or safely upgrade a legacy task ledger, and read back the result.

An unborn Git repository may require a local initial commit, but init never creates a
remote, tag, push, publish, or deployment. Corrupt DB/WAL/SHM and backups remain
preserved until an explicit recovery choice is made.

## Return control

Report classification, scope, schema and backup result, Git state, imported team
checkpoint state, and any mechanical blocker. Recommend the next useful capability
from current evidence, usually `ultra-research`, `ultra-change`, `ultra-status`, or
`ultra-doctor`; do not invoke it automatically.
