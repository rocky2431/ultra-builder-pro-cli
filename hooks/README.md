# Ultra Builder Pro workflow hooks

These hooks observe only Ultra-owned state. Session health/context recognizes an initialized
`.ultra/state.db` and active continuous changes; edit/compact/stop/subagent enforcement remains
bounded to the relevant Ultra projection or a non-terminal workflow.

| Lifecycle | Hook | Purpose |
|---|---|---|
| Session start | `health_check.py` | Read-only integrity, incident, projection, session, and change-artifact checks |
| Session start | `workflow_context.py` | Inject baseline/active workflow/change context and filtered provider metadata references |
| Before edit | `active_task_context.py` | Protect `tasks.json` projection and restate an active task boundary |
| Before compact | `workflow_checkpoint.py` | Atomically save a minimal workflow checkpoint |
| After compact/resume | `workflow_resume.py` | Re-inject the current workflow boundary |
| Stop | `pre_stop_check.py` | Block once when the Ultra workflow is incomplete |
| Subagent lifecycle | `subagent_tracker.py` | Append lifecycle evidence under `.ultra/runtime/` |

The plugin deliberately does not capture prompts, tool observations, transcripts, summaries, or
cross-session memory or code-graph content. Generic command blocking and post-edit policy are
user/repository governance. Persistent Memory/graph content belongs to separately installed providers.

Runtime wiring:

- Claude Code: native `hooks/hooks.json` with `${CLAUDE_PLUGIN_ROOT}` paths.
- Codex: native `hooks/hooks.json` through `hooks/adapters/codex.py` for wire normalization.
- OpenCode: native JavaScript plugin events; the Python hook suite is not copied.
