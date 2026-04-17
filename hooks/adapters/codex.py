"""Codex hook adapter — Phase 3.8 stub.

Responsibility (Phase 4 target, pending spike R11 from PLAN):
  - Codex exposes `hooks.json` — wire format is under development in the
    open-agent spec. Phase 4.4 includes a 0.5-day spike to capture the
    real schema before this adapter goes live.
  - Expected reachable events (to be confirmed): 2
    * pre-tool-exec  → post_edit_guard + block_dangerous_commands
    * post-session   → pre_stop_check + session_journal

Events NOT reachable on Codex (confirmed via PLAN §5.4):
  - PreCompact / PostCompact — no compact
  - SubagentStop — Codex `spawn_agent` emits no stop event back to parent
  - UserPromptSubmit — user prompts go straight to model

Downgrade plan:
  - mid_workflow_recall: N/A (no per-turn event)
  - pre_compact_context: N/A
  - observation_capture: N/A
  - Claude-specific settings.json registration: replaced by Codex
    `config.toml [hooks]` block (Phase 4.4)
"""

# Phase 4 implementation — blocked on spike (PLAN R11).
