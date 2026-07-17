#!/usr/bin/env python3
"""Protect Ultra projections and restate an active task boundary before edits."""

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
        ultra = root / ".ultra"
        state_file = ultra / "workflow-state.json"
        initialized = (
            (ultra / "state.db").is_file()
            or state_file.is_file()
            or (ultra / "changes" / "active").is_dir()
        )
        if not initialized:
            continue
        if targets_tasks_projection(data, root):
            print(json.dumps({"hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": (
                    "Refusing a direct write to the .ultra/tasks/tasks.json projection. "
                    ".ultra/state.db is authoritative; use the Ultra MCP task tools and "
                    "run ultra-doctor when state or projection health is degraded."
                ),
            }}))
            return
        if not state_file.is_file():
            break
        try:
            state = json.loads(state_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"[active_task_context] cannot read {state_file}: {exc}", file=sys.stderr)
            break
        if not isinstance(state, dict) or state.get("status") in TERMINAL:
            break
        task = state.get("task_id", state.get("task", "unknown"))
        step = state.get("step", "unknown")
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
