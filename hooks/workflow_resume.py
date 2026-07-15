#!/usr/bin/env python3
"""Restore only the current Ultra workflow boundary after compaction."""

import json
import sys
from pathlib import Path

TERMINAL = {"committed", "completed", "done", "cancelled"}


def main() -> None:
    try:
        data = json.loads(sys.stdin.read() or "{}")
        data = data if isinstance(data, dict) else {}
    except json.JSONDecodeError as exc:
        print(f"[workflow_resume] invalid hook input: {exc}", file=sys.stderr)
        data = {}
    start = Path(data.get("cwd") or Path.cwd()).resolve()
    for root in (start, *start.parents):
        state_file = root / ".ultra" / "workflow-state.json"
        if not state_file.is_file():
            continue
        try:
            state = json.loads(state_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"[workflow_resume] cannot read {state_file}: {exc}", file=sys.stderr)
            break
        if not isinstance(state, dict) or state.get("status") in TERMINAL:
            break
        text = (
            "[Ultra workflow resumed] "
            f"command={state.get('command', 'unknown')}; "
            f"task={state.get('task_id', state.get('task', 'unknown'))}; "
            f"step={state.get('step', 'unknown')}; status={state.get('status', 'active')}. "
            "Continue from .ultra/workflow-state.json and verify state through .ultra/state.db."
        )
        event = data.get("hook_event_name", "SessionStart")
        if event == "SessionStart":
            print(json.dumps({"hookSpecificOutput": {
                "hookEventName": "SessionStart",
                "additionalContext": text,
            }}))
        else:
            print(json.dumps({"additionalContext": text}))
        return
    print(json.dumps({}))


if __name__ == "__main__":
    main()
