# Ultra Builder Pro hooks

Ultra ships five small file-first hooks. Every hook first looks for a `.ultra/`
directory and exits silently when the workflow is not active.

| Hook | Lifecycle | Purpose |
|---|---|---|
| `session_context.py` | Session start | Inject the accepted North Star or Project Brief fallback, plus acceptance from the unique active Change's current task |
| `mid_workflow_recall.py` | Before source reads or edits | Restate acceptance only for a task matching the unique active `change_id` |
| `compact_context.py` | Before/after compaction | Save and restore a disposable snapshot derived from files and Git |
| `post_edit_guard.py` | After edits | Record mechanical evidence observations without deciding completion |
| `block_dangerous_commands.py` | Before shell execution | Advise on additive protected-branch publication; block history rewrites and a narrow destructive set until the exact command is owner-authorized |

`_common.py` is a shared library, not a lifecycle registration. Compact snapshots and
progress observations live under ignored `.ultra/.runtime/` or `.ultra/progress/`; the
canonical semantic facts remain the owner-readable files and Git.
Legacy task rows with no `change_id` remain readable from an active-path `change_ref`
during migration; a present canonical `change_id` always wins, and archived or
abandoned paths are never revived as current work. Task
selection prefers the single `in_progress` row, then the first `pending` row whose
same-Change dependencies are complete; ambiguous concurrent work stays silent.

Claude Code runs the hooks directly. Codex, Kimi Code, and Grok Build use the small
wire adapters under `hooks/adapters/`. OpenCode calls the same scripts from its native
JavaScript plugin. A hook failure is advisory except for the explicitly classified
destructive effects in `block_dangerous_commands.py`, whose denial includes a reachable
SHA-256-scoped authorization path. Additive protected-branch publication stays advisory
because portable hooks cannot consume every host's trusted owner-approval receipt;
history rewrites and branch deletion remain guarded.
