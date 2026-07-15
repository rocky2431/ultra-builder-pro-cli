# Ultra Builder Pro workflow hooks

These hooks protect only a currently active Ultra workflow. Every hook is a no-op unless the
project contains `.ultra/workflow-state.json` with a non-terminal status.

| Lifecycle | Hook | Purpose |
|---|---|---|
| Session start | `health_check.py` | Advisory check of `.ultra/state.db` core tables |
| Session start | `workflow_context.py` | Inject current command, task, step, and authority |
| Before edit | `active_task_context.py` | Restate the active task boundary |
| Before compact | `workflow_checkpoint.py` | Atomically save a minimal workflow checkpoint |
| After compact/resume | `workflow_resume.py` | Re-inject the current workflow boundary |
| Stop | `pre_stop_check.py` | Block once when the Ultra workflow is incomplete |
| Subagent lifecycle | `subagent_tracker.py` | Append lifecycle evidence under `.ultra/runtime/` |

The plugin deliberately does not capture prompts, tool observations, transcripts, summaries, or
cross-session memory. Generic command blocking and post-edit policy are user/repository governance,
not Ultra plugin hooks. Persistent memory belongs to the separately installed memory provider.

Runtime wiring:

- Claude Code: native `hooks/hooks.json` with `${CLAUDE_PLUGIN_ROOT}` paths.
- Codex: native `hooks/hooks.json` through `hooks/adapters/codex.py` for wire normalization.
- OpenCode: native JavaScript plugin events; the Python hook suite is not copied.
