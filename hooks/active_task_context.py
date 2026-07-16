#!/usr/bin/env python3
"""Remind an active Ultra workflow of its task boundary before edits."""

import json
import sys
from pathlib import Path

TERMINAL = {"committed", "completed", "done", "cancelled"}
TASKS_PROJECTION = Path(".ultra/tasks/tasks.json")


def targets_tasks_projection(data: dict, root: Path) -> bool:
    tool_input = data.get("tool_input")
    if not isinstance(tool_input, dict):
        return False
    for key in ("file_path", "filePath", "filepath", "path"):
        value = tool_input.get(key)
        if not isinstance(value, str) or not value.strip():
            continue
        candidate = Path(value)
        resolved = candidate.resolve() if candidate.is_absolute() else (root / candidate).resolve()
        if resolved == (root / TASKS_PROJECTION).resolve():
            return True
    return False


def main() -> None:
    try:
        data = json.loads(sys.stdin.read() or "{}")
        data = data if isinstance(data, dict) else {}
    except json.JSONDecodeError as exc:
        print(f"[active_task_context] invalid hook input: {exc}", file=sys.stderr)
        data = {}
    start = Path(data.get("cwd") or Path.cwd()).resolve()
    for root in (start, *start.parents):
        state_file = root / ".ultra" / "workflow-state.json"
        if not state_file.is_file():
            continue
        try:
            state = json.loads(state_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"[active_task_context] cannot read {state_file}: {exc}", file=sys.stderr)
            break
        if not isinstance(state, dict) or state.get("status") in TERMINAL:
            break
        task = state.get("task_id", state.get("task", "unknown"))
        step = state.get("step", "unknown")
        if targets_tasks_projection(data, root):
            print(json.dumps({"hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": (
                    "Refusing a direct write to .ultra/tasks/tasks.json during an active Ultra "
                    "workflow. .ultra/state.db is authoritative; use the Ultra MCP task tools. "
                    "If they report LEGACY_STATE_MIGRATION_REQUIRED, run the v4.4 to v4.5 "
                    "migration before continuing."
                ),
            }}))
            return
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "additionalContext": (
                f"Active Ultra task {task}, step {step}. Keep this edit inside the approved "
                "task and preserve .ultra/state.db as workflow authority."
            ),
        }}))
        return
    print(json.dumps({}))


if __name__ == "__main__":
    main()
