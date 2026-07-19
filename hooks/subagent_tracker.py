#!/usr/bin/env python3
"""Subagent lifecycle tracker.

Logs SubagentStart/Stop events to .ultra/runtime/subagent-log.jsonl (project-level)
for debugging and cost analysis.

Protocol fields:
  SubagentStart: agent_id, agent_type, session_id
  SubagentStop: agent_id, agent_type, session_id, agent_transcript_path,
                last_assistant_message, stop_hook_active

Usage:
  python3 subagent_tracker.py start  # called by SubagentStart hook
  python3 subagent_tracker.py stop   # called by SubagentStop hook
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from context_spine import ContextSpineError, find_root, read_breadcrumb

MAX_LOG_LINES = 5000


def get_log_dir(hook_input: dict):
    root = find_root(Path(hook_input.get("cwd") or Path.cwd()).resolve())
    if root is None:
        return None
    try:
        breadcrumb = read_breadcrumb(root)
    except ContextSpineError as exc:
        print(f"[subagent_tracker] cannot inspect Context Spine: {exc}", file=sys.stderr)
        return None
    if breadcrumb and breadcrumb.get("change_id"):
        return root / ".ultra" / "runtime"
    return None


def rotate_log(log_file: Path) -> None:
    """Keep last MAX_LOG_LINES entries to prevent unbounded growth."""
    try:
        if not log_file.exists():
            return
        with open(log_file, "r", encoding="utf-8") as f:
            lines = f.readlines()
        if len(lines) <= MAX_LOG_LINES:
            return
        with open(log_file, "w", encoding="utf-8") as f:
            f.writelines(lines[-MAX_LOG_LINES:])
    except OSError as exc:
        print(f"[subagent_tracker] log rotation failed: {exc}", file=sys.stderr)


def main():
    if len(sys.argv) < 2:
        print(json.dumps({}))
        return

    action = sys.argv[1]
    if action not in ("start", "stop"):
        print(json.dumps({}))
        return

    # Read hook input from stdin
    try:
        raw = sys.stdin.read()
        hook_input = json.loads(raw) if raw.strip() else {}
        if not isinstance(hook_input, dict):
            hook_input = {}
    except (json.JSONDecodeError, EOFError) as exc:
        print(f"[subagent_tracker] invalid hook input: {exc}", file=sys.stderr)
        hook_input = {}

    # Lazy init: avoid module-level subprocess
    log_dir = get_log_dir(hook_input)
    if log_dir is None:
        print(json.dumps({}))
        return
    log_file = log_dir / "subagent-log.jsonl"
    log_dir.mkdir(parents=True, exist_ok=True)

    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event": f"subagent_{action}",
        "agent_id": hook_input.get("agent_id", "unknown"),
        "agent_type": hook_input.get("agent_type", "unknown"),
        "session_id": hook_input.get("session_id", ""),
    }

    # SubagentStop provides additional fields
    if action == "stop":
        transcript = hook_input.get("agent_transcript_path", "")
        if transcript:
            entry["agent_transcript_path"] = transcript

    try:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError as exc:
        print(f"[subagent_tracker] event write failed: {exc}", file=sys.stderr)

    rotate_log(log_file)

    print(json.dumps({}))


if __name__ == "__main__":
    main()
