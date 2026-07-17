---
name: ultra-init
description: Initialize an Ultra Builder Pro project with authoritative state, baseline specification files, and optional Git setup. Use when a repository has not yet been initialized for the Ultra workflow.
---

# Initialize an Ultra project

Create the project-local Ultra runtime without inventing product requirements or
business tasks.

## Inputs

Use the current working directory unless the user names another target. Inspect
existing project manifests to infer:

- project name;
- project type;
- primary technologies;
- whether Git and `.ultra/` already exist.

Ask only about unresolved ambiguity, optional Git initialization, or permission to
replace an existing `.ultra/` directory. Never infer permission to overwrite it.

## Workflow

1. Resolve the absolute target directory and verify that it exists.
2. Derive the project metadata from repository evidence. Treat user-provided values
   as authoritative when they conflict with inference.
3. If `.ultra/` exists, stop and ask whether to keep it, cancel, or recreate it with
   `overwrite: true`. Explain that recreation first preserves a timestamped backup.
4. Call `task.init_project` with the smallest complete input:

   ```json
   {
     "target_dir": "/absolute/project/path",
     "project_name": "example",
     "project_type": "fullstack",
     "stack": "react,node,postgres",
     "overwrite": false
   }
   ```

5. Verify the returned `.ultra` path, `state_db_path`, status, and copied-file list.
   Confirm that the returned state database and baseline specification files exist.
6. If the user requested Git setup, initialize Git only when needed and add narrowly
   scoped ignore rules. Do not stage or commit without explicit authorization.

If the MCP server cannot start, use the installed
`ultra-tools task init-project` command only when it is available. The CLI and MCP
must use the same initializer. Do not simulate initialization by creating projection
files manually.

## Failure handling

- `ULTRA_DIR_EXISTS`: return to the overwrite decision; do not retry automatically.
- `TEMPLATE_MISSING`: stop and report an installation/package integrity failure.
- `TARGET_NOT_DIR` or `VALIDATION_ERROR`: correct the input and retry once.
- `IO_ERROR`: report the affected path and preserve any backup or partial evidence.

## Authority and output

`.ultra/state.db` is the durable Ultra authority. Generated JSON and Markdown are
projections or workflow artifacts and must not be edited to create state.

Report the initialized path, state database path, backup path when present, Git
action, and one next action. Route incomplete product intent to `ultra-research`;
route an already validated baseline to `ultra-plan`.

Do not create business tasks, browse the web, or rewrite an existing README as part
of initialization.
