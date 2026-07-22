# Ultra Builder Pro workflow hooks

These hooks observe only Ultra-owned state. Session health/context recognizes an initialized
`.ultra/state.db` and active continuous changes. Direct projection writes remain blocked;
context, compact, stop, and subagent lifecycle behavior is recovery-oriented and does not turn
advisory workflow conditions into refusal gates.

| Lifecycle | Hook | Purpose |
|---|---|---|
| Session start | `health_check.py` | Read-only integrity, incident, projection, session, and change-artifact checks |
| Shared helper | `context_spine.py` | Read the latest role/gate/readiness snapshot from state.db and derive one compact breadcrumb |
| Session start | `workflow_context.py` | Inject the DB-derived breadcrumb without intent or provider payloads |
| Before edit | `active_task_context.py` | Protect `tasks.json` and restate the same DB-derived task breadcrumb |
| Before compact | `workflow_checkpoint.py` | Validate and atomically save a minimal workflow checkpoint |
| After compact/resume | `workflow_resume.py` | Prefer the DB breadcrumb; restore the minimal file checkpoint only when no active change owns recovery |
| Stop | `pre_stop_check.py` | Report an incomplete workflow boundary and allow stop |
| Subagent lifecycle | `subagent_tracker.py` | Append minimal start/stop metadata to the authoritative DB event stream |

The plugin deliberately does not capture prompts, tool observations, transcripts, summaries, or
cross-session memory or code-graph content. Generic command blocking and post-edit policy are
user/repository governance. Persistent Memory/graph content belongs to separately installed providers.

`subagent_tracker.py` passes only agent id/type and the host session id to the bundled
`hook-event.cjs` helper. The helper binds the current change/task and appends
`subagent_started` or `subagent_stopped` to `state.db`; it never stores transcript
paths, messages, or a parallel JSONL lifecycle log.

`context_spine.py` is an imported library, not an eighth lifecycle registration.
Registering it separately would duplicate hook execution. The checkpoint is a recovery artifact, not a second authority. A valid newer
live workflow wins; a newer valid checkpoint may restore a missing or older
live file; corrupt, non-object, or terminal checkpoints are ignored.

Runtime wiring:

- Claude Code: native `hooks/hooks.json` with `${CLAUDE_PLUGIN_ROOT}` paths.
- Codex: native `hooks/hooks.json` through `hooks/adapters/codex.py` for wire normalization.
- OpenCode: native JavaScript plugin events; the Python hook suite is not copied.
