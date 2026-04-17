"""Claude Code hook adapter — Phase 3.8 stub.

Phase 4 will extract Claude-specific payload parsing here (JSON on stdin,
file-lock coordination, settings.json registration). Until that cutover
the 15 hooks in hooks/*.py remain the live Claude adapter — they are
registered directly in ~/.claude/settings.json.

Responsibility (Phase 4 target):
  - parse JSON payload from stdin (Claude's hook wire format)
  - resolve hook event name (SessionStart / PreToolUse / PostToolUse /
    UserPromptSubmit / PreCompact / PostCompact / Stop / SubagentStop)
  - dispatch to hooks.core.<feature>.run(payload) → {allow, reason,
    additional_context, exit_code}
  - write stdout JSON envelope Claude Code expects

Reachable events: 8.
"""

# Phase 4 extraction — no code yet. Claude currently uses the flat hooks/*.py modules.
