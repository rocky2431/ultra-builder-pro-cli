#!/usr/bin/env python3
"""Block stop only when the active Ultra workflow itself is incomplete."""

import sys
import json
from pathlib import Path

TERMINAL = {"committed", "completed", "done", "cancelled"}


def allow_stop() -> None:
    print(json.dumps({}))


def block_stop(reason: str) -> None:
    print(json.dumps({"decision": "block", "reason": reason}))


def main():
    try:
        hook_data = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, OSError) as exc:
        print(f"[pre_stop_check] invalid hook input: {exc}", file=sys.stderr)
        allow_stop()
        return

    if hook_data.get("stop_hook_active", False):
        allow_stop()
        return
    start = Path(hook_data.get("cwd") or Path.cwd()).resolve()
    for root in (start, *start.parents):
        state_file = root / ".ultra" / "workflow-state.json"
        if not state_file.is_file():
            continue
        try:
            state = json.loads(state_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"[pre_stop_check] cannot read {state_file}: {exc}", file=sys.stderr)
            allow_stop()
            return
        if not isinstance(state, dict) or state.get("status") in TERMINAL:
            allow_stop()
            return
        block_stop(
            "Active Ultra workflow is incomplete: "
            f"command={state.get('command', 'unknown')}, "
            f"task={state.get('task_id', state.get('task', 'unknown'))}, "
            f"step={state.get('step', 'unknown')}, status={state.get('status', 'active')}. "
            "Complete or explicitly cancel the Ultra workflow before stopping."
        )
        return
    allow_stop()


if __name__ == '__main__':
    main()
