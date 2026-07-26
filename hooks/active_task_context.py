#!/usr/bin/env python3
"""Protect Ultra projections and restate an active task boundary before edits."""

import json
import sys
from pathlib import Path

from context_spine import ContextSpineError, find_root, read_breadcrumb, render_breadcrumb

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
    root = find_root(Path(data.get("cwd") or Path.cwd()).resolve())
    if root is None:
        print(json.dumps({}))
        return
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
    try:
        breadcrumb = read_breadcrumb(root)
    except ContextSpineError as exc:
        print(f"[active_task_context] cannot inspect Context Spine: {exc}", file=sys.stderr)
        breadcrumb = None
    if breadcrumb and breadcrumb.get("workflow"):
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "additionalContext": render_breadcrumb(root, breadcrumb),
        }}))
        return
    print(json.dumps({}))


if __name__ == "__main__":
    main()
