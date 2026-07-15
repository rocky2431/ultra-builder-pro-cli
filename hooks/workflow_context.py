#!/usr/bin/env python3
"""Inject the live Ultra workflow state at session start.

This hook is deliberately project-local and contains no cross-session memory.
It is a no-op unless an active .ultra/workflow-state.json exists.
"""

import json
import sys
from pathlib import Path

TERMINAL = {"committed", "completed", "done", "cancelled"}


def payload() -> dict:
    try:
        value = json.loads(sys.stdin.read() or "{}")
        return value if isinstance(value, dict) else {}
    except json.JSONDecodeError as exc:
        print(f"[workflow_context] invalid hook input: {exc}", file=sys.stderr)
        return {}


def active_state(data: dict):
    start = Path(data.get("cwd") or Path.cwd()).resolve()
    for root in (start, *start.parents):
        state_file = root / ".ultra" / "workflow-state.json"
        if not state_file.is_file():
            continue
        try:
            state = json.loads(state_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"[workflow_context] cannot read {state_file}: {exc}", file=sys.stderr)
            return None
        if isinstance(state, dict) and state.get("status") not in TERMINAL:
            return root, state
        return None
    return None


def main() -> None:
    found = active_state(payload())
    if not found:
        print(json.dumps({}))
        return
    root, state = found
    context = "\n".join([
        "[Ultra active workflow]",
        f"Project: {root}",
        f"Command: {state.get('command', 'unknown')}",
        f"Task: {state.get('task_id', state.get('task', 'unknown'))}",
        f"Step: {state.get('step', 'unknown')}",
        f"Status: {state.get('status', 'active')}",
        "Authority: .ultra/state.db; workflow recovery: .ultra/workflow-state.json.",
    ])
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": context,
    }}))


if __name__ == "__main__":
    main()
