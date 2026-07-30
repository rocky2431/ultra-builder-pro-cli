# Ultra Builder Pro workflow hooks

These Hooks observe only Ultra-owned state. Session health/context recognizes an
initialized `.ultra/.runtime/state.db` and reads the canonical Context Envelope.
Direct writes to the MCP-owned Git checkpoint and checkout-local projections remain
blocked; context, compact, stop, and agent lifecycle behavior is recovery-oriented and
does not turn semantic diagnostics into refusal gates.

| Lifecycle | Hook | Purpose |
|---|---|---|
| Session start | `health_check.py` | Read-only integrity, incident, projection, session, and change-artifact checks |
| Shared helper | `context_envelope.py` | Read the same bounded Context Envelope used by MCP, Skills, Sessions, and Workers |
| Session start | `workflow_context.py` | Inject the compact envelope with accepted intent, never raw interaction or provider payloads |
| Before edit | `active_task_context.py` | Protect `.ultra/tasks/tasks.json` (Git team checkpoint) and `.ultra/.runtime/projections/tasks.json` (local view), then restate the same DB-derived task breadcrumb |
| Before compact | `workflow_checkpoint.py` | Validate and atomically save a minimal workflow checkpoint |
| After compact/resume | `workflow_resume.py` | Prefer the DB breadcrumb; restore the minimal file checkpoint only when no active change owns recovery |
| Stop | `pre_stop_check.py` | Report an incomplete workflow boundary and allow stop |
| Subagent lifecycle | `subagent_tracker.py` | Append minimal start/stop metadata to the authoritative DB event stream |

The plugin deliberately does not capture prompts, tool observations, transcripts, summaries, general
conversational memory, or code-graph payloads. It does retain project-local Ultra workflow memory in
`.ultra/`. Generic command blocking and post-edit policy are user/repository governance. General
memory and graph content belongs to separately installed providers.

`subagent_tracker.py` passes only agent id/type and the host session id to the bundled
`hook-event.cjs` helper. The helper binds the current change/task and appends
`subagent_started` or `subagent_stopped` to `state.db`; it never stores transcript
paths, messages, or a parallel JSONL lifecycle log.

`context_envelope.py` is an imported library, not an additional lifecycle registration.
Registering it separately would duplicate hook execution. The checkpoint is a recovery artifact, not a second authority. A valid newer
live workflow wins; a newer valid checkpoint may restore a missing or older
live file; corrupt, non-object, or terminal checkpoints are ignored.

Runtime wiring:

- Claude Code: native `hooks/hooks.json` with `${CLAUDE_PLUGIN_ROOT}` paths.
- Codex: native `hooks/hooks.json` through `hooks/adapters/codex.py` for wire normalization.
- OpenCode: native JavaScript plugin events; the Python hook suite is not copied.
- Kimi Code: native lifecycle events through its wire adapter.
- Grok Build: camelCase lifecycle events; ignored stdout channels are used for
  observation only, and every Skill rereads authoritative Context at entry.
