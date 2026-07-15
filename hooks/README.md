# hooks/ — runtime-portable hook layer

Ultra Builder Pro keeps the feature implementations in `hooks/*.py` and places a
wire adapter at `hooks/adapters/<runtime>.py`. The Codex adapter is a real protocol
boundary: it normalizes current Codex payloads, executes an allowlisted feature,
and emits only fields accepted by that event's output schema.

## Codex mapping

The personal plugin generates `hooks/hooks.json` and registers these native events:

| Codex event | Ultra features |
|---|---|
| `SessionStart` | `health_check.py`, `session_context.py` |
| `PreToolUse` | `block_dangerous_commands.py`, `mid_workflow_recall.py` |
| `PostToolUse` | `post_edit_guard.py`, `observation_capture.py` |
| `UserPromptSubmit` | `user_prompt_capture.py` |
| `PreCompact` | `pre_compact_context.py` |
| `PostCompact` | `post_compact_inject.py` |
| `Stop` | `pre_stop_check.py`, `session_journal.py` |
| `SubagentStart` | `subagent_tracker.py start` |
| `SubagentStop` | `subagent_tracker.py stop` |

`hooks/adapters/codex.py` also handles three host differences:

- converts Codex `apply_patch` payloads into per-file edit inputs for legacy guards;
- preserves real `PreToolUse` deny decisions but converts unsupported `ask` decisions
  into advisory `systemMessage` output;
- maps compact recovery and additional context into the strict schema for the
  triggering Codex event.

When `UBP_HOOK_RUNTIME=codex`, non-project fallback data goes to `PLUGIN_DATA`
(or `~/.codex/ultra-builder-pro`) instead of `~/.claude`. Project memory remains
under `<git-root>/.ultra/memory/`. The session journal understands both Claude
and Codex JSONL transcript shapes. In Codex it records deterministic session,
observation, and git-fallback evidence without launching a nested model CLI.

## Other runtimes

Claude Code continues to register the feature scripts directly from
`settings.json`. OpenCode and Gemini keep their runtime adapters and their documented
degradation paths. Do not assume one host's event names or output schema apply to
another host.

## Verification

```bash
python3 -m compileall -q hooks
pytest hooks/tests -q
node --test adapters/tests/codex-hook.test.cjs
```

`memory_db.py`, `hook_utils.py`, and `system_doctor.py` are shared utilities rather
than standalone lifecycle events.
