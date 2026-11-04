# Plugin isolation contract

UBP v6 installs one `ultra` Skill, its engine copy and a SessionStart observer for
Claude Code or Codex. Installation does not authorize project work or external effects.

The plugin never creates or rewrites the user's global `AGENTS.md` or `CLAUDE.md`.
Repository guidance belongs to the repository. The host owns permissions and hook trust.

Installers replace and remove only managed plugin trees. They preserve unrelated host
configuration and restore the previous managed installation if publication fails.
`--config-dir` confines both plugin files and host registration sidecars to that directory;
with `--all`, each host gets a separate child directory. Doctor is read-only.

SessionStart reads its input and project status, prints a reminder when `.ultra/spec.md`
exists and `UBP_DRIVE` is not set, and always exits successfully. It writes no files and grants no authority.

Project truth is `.ultra/spec.md`, `checks.json`, `plan.json`, `rulings.md`, the ledgers,
records and Git. The engine computes progress; a hook's printed observation is not a new
source of truth. `.ultra/.runtime/` is disposable execution data.
