"""OpenCode hook adapter — Phase 3.8 stub.

Responsibility (Phase 4 target):
  - OpenCode exposes 2 reachable hook events: `session.start` and `event`
    (general bus). Both arrive as JSON over stdin with runtime-specific
    keys.
  - map the generic `event` into a synthetic (PreToolUse / PostToolUse /
    UserPromptSubmit / Stop) when payload fields allow it; otherwise no-op.
  - dispatch to hooks.core.<feature>.run(payload) for:
    * session.start              → session_journal + session_context injection
    * synthetic PostToolUse      → post_edit_guard + block_dangerous_commands
    * synthetic Stop             → pre_stop_check

Events NOT reachable on OpenCode:
  - PreCompact / PostCompact (OpenCode has no compact event)
  - SubagentStop (OpenCode's @mention subagents emit no stop event)
  - dedicated UserPromptSubmit (must be inferred from generic event bus)

Features that degrade on OpenCode:
  - mid_workflow_recall → runs on each `event`, rate-limited
  - pre_compact_context → N/A
  - observation_capture → partial (only events received)
"""

# Phase 4 implementation — TBD.
