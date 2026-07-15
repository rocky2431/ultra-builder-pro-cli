#!/usr/bin/env python3
"""Remind an active Ultra workflow of its task boundary before edits."""

import json
import sys
from pathlib import Path

TERMINAL = {"committed", "completed", "done", "cancelled"}


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
