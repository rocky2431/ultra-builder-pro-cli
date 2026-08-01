# Ultra Builder Pro hooks

Ultra ships five small file-first hooks. Every hook first looks for a `.ultra/`
directory and exits silently when the workflow is not active.

| Hook | Lifecycle | Purpose |
|---|---|---|
| `session_context.py` | Session start | Inject the one-line north star and current acceptance criteria |
| `mid_workflow_recall.py` | Before source reads or edits | Restate current acceptance only |
| `compact_context.py` | Before/after compaction | Save and restore a disposable snapshot derived from files and Git |
| `post_edit_guard.py` | After edits | Record mechanical evidence observations without deciding completion |
| `block_dangerous_commands.py` | Before shell execution | Block a narrow named external effect until the exact command is owner-authorized |

`_common.py` is a shared library, not a lifecycle registration. Compact snapshots and
progress observations live under ignored `.ultra/.runtime/` or `.ultra/progress/`; the
canonical semantic facts remain the owner-readable files and Git.

Claude Code runs the hooks directly. Codex, Kimi Code, and Grok Build use the small
wire adapters under `hooks/adapters/`. OpenCode calls the same scripts from its native
JavaScript plugin. A hook failure is advisory except for the explicitly classified
external effects in `block_dangerous_commands.py`, whose denial includes a reachable
SHA-256-scoped authorization path.
