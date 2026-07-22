#!/usr/bin/env python3
"""Append minimal Ultra subagent lifecycle metadata to state.db events.

The hook never stores prompts, messages, transcript paths, or a parallel JSONL log.
It is advisory: a failed lifecycle event is reported on stderr but never blocks the
host's subagent operation.
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from context_spine import find_root


def helper_path() -> Path:
    hook_root = Path(__file__).resolve().parent
    installed = hook_root.parent / "runtime" / "hook-event.cjs"
    if installed.is_file():
        return installed
    source = hook_root.parent / "mcp-server" / "hook-event.cjs"
    if source.is_file():
        return source
    raise RuntimeError("bundled hook lifecycle helper is missing")


def node_binary() -> str:
    configured = os.environ.get("UBP_NODE")
    if configured:
        return configured
    discovered = shutil.which("node")
    if discovered:
        return discovered
    raise RuntimeError("node executable is unavailable")


def append_event(root: Path, action: str, hook_input: dict) -> None:
    payload = {
        "agent_id": hook_input.get("agent_id", "unknown"),
        "agent_type": hook_input.get("agent_type", "unknown"),
        "session_id": hook_input.get("session_id", ""),
    }
    result = subprocess.run(
        [node_binary(), str(helper_path()), str(root.resolve()), action],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=False,
        timeout=5,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or f"exit {result.returncode}"
        raise RuntimeError(detail)


def main() -> None:
    action = sys.argv[1] if len(sys.argv) > 1 else ""
    if action not in ("start", "stop"):
        print(json.dumps({}))
        return

    try:
        raw = sys.stdin.read()
        hook_input = json.loads(raw) if raw.strip() else {}
        if not isinstance(hook_input, dict):
            hook_input = {}
    except (json.JSONDecodeError, EOFError) as exc:
        print(f"[subagent_tracker] invalid hook input: {exc}", file=sys.stderr)
        hook_input = {}

    root = find_root(Path(hook_input.get("cwd") or Path.cwd()).resolve())
    if root is not None:
        try:
            append_event(root, action, hook_input)
        except (OSError, RuntimeError, subprocess.TimeoutExpired) as exc:
            print(f"[subagent_tracker] lifecycle event unavailable: {exc}", file=sys.stderr)

    print(json.dumps({}))


if __name__ == "__main__":
    main()
