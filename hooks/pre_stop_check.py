#!/usr/bin/env python3
"""Report unfinished DB-authoritative Ultra work without trapping session stop."""

import json
import sys
from pathlib import Path

from context_spine import ContextSpineError, find_root_for_hook, read_breadcrumb


def allow_stop() -> None:
    print(json.dumps({}))


def main() -> None:
    try:
        hook_data = json.loads(sys.stdin.read() or "{}")
        hook_data = hook_data if isinstance(hook_data, dict) else {}
    except json.JSONDecodeError as exc:
        print(f"[pre_stop_check] invalid hook input: {exc}", file=sys.stderr)
        allow_stop()
        return

    if hook_data.get("stop_hook_active", False):
        allow_stop()
        return
    root = find_root_for_hook(
        Path(hook_data.get("cwd") or Path.cwd()).resolve(),
        "pre_stop_check",
    )
    if root is None:
        allow_stop()
        return
    try:
        breadcrumb = read_breadcrumb(root)
    except ContextSpineError as exc:
        print(f"[pre_stop_check] cannot inspect Context Spine: {exc}", file=sys.stderr)
        allow_stop()
        return
    if breadcrumb and breadcrumb.get("workflow"):
        allowed = ", ".join(breadcrumb.get("allowed_transitions") or []) or "none"
        required = breadcrumb.get("required_transition") or "none"
        print(
            "[Ultra stop advisory] Active Ultra change remains open: "
            f"change={breadcrumb['change_id']}, "
            f"task={breadcrumb.get('task_id') or 'none'}, "
            f"gate={breadcrumb.get('gate') or 'alignment'}, "
            f"allowed_transitions={allowed}, required_transition={required}. "
            "Stop is allowed; resume or explicitly archive the change later.",
            file=sys.stderr,
        )
    allow_stop()


if __name__ == "__main__":
    main()
