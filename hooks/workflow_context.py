#!/usr/bin/env python3
"""Inject one compact Ultra state position without persistent memory."""

import json
import sys
from pathlib import Path

from context_spine import ContextSpineError, find_root, read_breadcrumb, render_breadcrumb


def payload() -> dict:
    try:
        value = json.loads(sys.stdin.read() or "{}")
        return value if isinstance(value, dict) else {}
    except json.JSONDecodeError as exc:
        print(f"[workflow_context] invalid hook input: {exc}", file=sys.stderr)
        return {}


def main() -> None:
    data = payload()
    root = find_root(Path(data.get("cwd") or Path.cwd()).resolve())
    if root is None:
        print(json.dumps({}))
        return
    try:
        breadcrumb = read_breadcrumb(root)
    except ContextSpineError as exc:
        print(f"[workflow_context] cannot inspect Context Spine: {exc}", file=sys.stderr)
        breadcrumb = None
    if breadcrumb and breadcrumb.get("workflow"):
        context = render_breadcrumb(root, breadcrumb)
    else:
        print(json.dumps({}))
        return
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": context,
    }}))
if __name__ == "__main__":
    main()
