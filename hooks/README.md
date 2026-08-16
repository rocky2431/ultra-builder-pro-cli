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
abandoned paths are never revived as current work. `.ultra/tasks.json` is the sole
task-status authority. A legacy context Status or Complexity header is emitted only as
a migration diagnostic and never overrides the row. Task selection uses only the
unique `in_progress` row of the active Change; a `pending` row is a frontier
candidate that Hooks never activate, inject, or attribute edits to. When no task is
live, the task-aware Hooks stay task-silent and progress-silent, and only read-only
Status may report frontier candidates. A trusted exact-task invocation is
invocation-local — it must mechanically match the ledger and is never persisted as a
selector. The `.ultra/changes/active` directory chain and each active Change directory
must be stable ordinary non-symlink directories; each `intent.md` must be a stable,
readable regular file. More than one `in_progress` row emits the conflicting task ids
and an exact repair while every task Hook remains task-silent. Task ids are globally
unique, dependency ids are unique per row, and every
dependency must resolve inside the same Change without self-edges or cycles. A malformed
surface or graph emits an exact repair diagnostic while task content stays silent. Git
or trace-source observation failures remain advisory typed diagnostics with a rendered
repair and retry path; they never discard canonical Acceptance Criteria or the Resume
Note. SessionStart retains both typed Acceptance and Resume Note content for the
selected task, and every Resume injection carries the navigational limitation: a
Resume Note cannot override owner authority, approved scope/budget, task acceptance,
or a validated Review verdict, and it never reopens a review that already returned a
current verdict. Hooks never launch, select, schedule, or recommend automatic
invocation of `ultra-review` or any public workflow; routing belongs to the owner and
the host model.
Hook and validator observations never mark a task completed or supply a semantic
acceptance disposition.

Claude Code runs the hooks directly. Codex, Kimi Code, Grok Build, and ZCode use the small
wire adapters under `hooks/adapters/`. OpenCode calls the same scripts from its native
JavaScript plugin. A hook failure is advisory except for the explicitly classified
destructive effects in `block_dangerous_commands.py`, whose denial includes a reachable
SHA-256-scoped authorization path. Additive protected-branch publication stays advisory
because portable hooks cannot consume every host's trusted owner-approval receipt;
history rewrites and branch deletion remain guarded.
