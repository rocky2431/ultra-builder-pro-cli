#!/usr/bin/env python3
"""Inject one compact, read-only Ultra Context Envelope."""

import json
import sys
from pathlib import Path

from context_envelope import (
    ContextEnvelopeError,
    find_root_for_hook,
    read_context_envelope,
    render_context_envelope,
)


def payload() -> dict:
    try:
        value = json.loads(sys.stdin.read() or "{}")
        return value if isinstance(value, dict) else {}
    except json.JSONDecodeError as exc:
        print(f"[workflow_context] invalid hook input: {exc}", file=sys.stderr)
        return {}


def main() -> None:
    data = payload()
    root = find_root_for_hook(
        Path(data.get("cwd") or Path.cwd()).resolve(),
        "workflow_context",
    )
    if root is None:
        print(json.dumps({}))
        return
    try:
        envelope = read_context_envelope(root)
    except ContextEnvelopeError as exc:
        print(f"[workflow_context] cannot inspect Context Envelope: {exc}", file=sys.stderr)
        envelope = None
    if not envelope:
        print(json.dumps({}))
        return
    context = render_context_envelope(root, envelope)
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": context,
    }}))
if __name__ == "__main__":
    main()
