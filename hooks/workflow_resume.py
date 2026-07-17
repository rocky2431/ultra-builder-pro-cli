#!/usr/bin/env python3
"""Restore only the current Ultra workflow boundary after compaction."""

import json
import os
import sqlite3
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from context_spine import find_root, read_breadcrumb, render_breadcrumb

TERMINAL = {"committed", "completed", "done", "cancelled"}


def valid_workflow(state: object) -> bool:
    return (
        isinstance(state, dict)
        and isinstance(state.get("command"), str)
        and bool(state["command"].strip())
        and state.get("step") is not None
        and isinstance(state.get("status"), str)
        and bool(state["status"].strip())
    )


def read_json(file: Path, label: str):
    if not file.is_file():
        return None
    try:
        return json.loads(file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"[workflow_resume] cannot read {label} {file}: {exc}", file=sys.stderr)
        return None


def parse_time(value: object):
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def newest_time(file: Path, *values: object) -> datetime:
    candidates = [parsed for value in values if (parsed := parse_time(value)) is not None]
    try:
        candidates.append(datetime.fromtimestamp(file.stat().st_mtime, tz=timezone.utc))
    except OSError:
        pass
    return max(candidates, default=datetime.min.replace(tzinfo=timezone.utc))


def load_checkpoint(file: Path):
    checkpoint = read_json(file, "checkpoint")
    if checkpoint is None:
        return None
    if not isinstance(checkpoint, dict):
        print(f"[workflow_resume] invalid checkpoint schema in {file}", file=sys.stderr)
        return None
    captured_at = checkpoint.get("captured_at")
    workflow = checkpoint.get("workflow")
    if checkpoint.get("schema") != 1 or parse_time(captured_at) is None or not valid_workflow(workflow):
        print(f"[workflow_resume] invalid checkpoint schema in {file}", file=sys.stderr)
        return None
    return checkpoint


def restore_state(file: Path, state: dict) -> None:
    file.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix="workflow-state.", suffix=".json", dir=file.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(state, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temp_name, file)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def main() -> None:
    try:
        data = json.loads(sys.stdin.read() or "{}")
        data = data if isinstance(data, dict) else {}
    except json.JSONDecodeError as exc:
        print(f"[workflow_resume] invalid hook input: {exc}", file=sys.stderr)
        data = {}
    start = Path(data.get("cwd") or Path.cwd()).resolve()
    root = find_root(start)
    if root is not None:
        try:
            breadcrumb = read_breadcrumb(root)
        except (sqlite3.Error, OSError) as exc:
            print(f"[workflow_resume] cannot inspect Context Spine: {exc}", file=sys.stderr)
            breadcrumb = None
        if breadcrumb:
            text = render_breadcrumb(root, breadcrumb)
            event = data.get("hook_event_name", "SessionStart")
            if event == "SessionStart":
                print(json.dumps({"hookSpecificOutput": {
                    "hookEventName": "SessionStart",
                    "additionalContext": text,
                }}))
            else:
                print(json.dumps({"additionalContext": text}))
            return
    for root in (start, *start.parents):
        state_file = root / ".ultra" / "workflow-state.json"
        checkpoint_file = root / ".ultra" / "runtime" / "checkpoint.json"
        if not state_file.is_file() and not checkpoint_file.is_file():
            continue
        live = read_json(state_file, "workflow state")
        if live is not None and not valid_workflow(live):
            print(f"[workflow_resume] invalid workflow state in {state_file}", file=sys.stderr)
            live = None
        if live is not None and live.get("status") in TERMINAL:
            break
        checkpoint = load_checkpoint(checkpoint_file)
        checkpoint_state = checkpoint["workflow"] if checkpoint is not None else None
        if checkpoint_state is not None and checkpoint_state.get("status") in TERMINAL:
            checkpoint_state = None

        source = ".ultra/workflow-state.json"
        state = live
        if checkpoint_state is not None:
            checkpoint_time = newest_time(
                checkpoint_file, checkpoint_state.get("ts"), checkpoint.get("captured_at")
            )
            live_time = newest_time(state_file, live.get("ts")) if live is not None else None
            if live_time is None or checkpoint_time >= live_time:
                state = checkpoint_state
                source = ".ultra/runtime/checkpoint.json"
                restore_state(state_file, state)
        if state is None:
            break
        text = (
            "[Ultra workflow resumed] "
            f"command={state.get('command', 'unknown')}; "
            f"task={state.get('task_id', state.get('task', 'unknown'))}; "
            f"step={state.get('step', 'unknown')}; status={state.get('status', 'active')}. "
            f"source={source}. Continue from the recovered workflow boundary and verify "
            "task/session/change state through .ultra/state.db."
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
