#!/usr/bin/env python3
"""Report unfinished DB-authoritative Ultra work without trapping session stop."""

import json
import sys
from pathlib import Path

from context_envelope import (
    ContextEnvelopeError,
    find_root_for_hook,
    read_context_envelope,
)


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
        context = read_context_envelope(root)
    except ContextEnvelopeError as exc:
        print(f"[pre_stop_check] cannot inspect Context Envelope: {exc}", file=sys.stderr)
        allow_stop()
        return
    envelope = context.get("envelope", {}) if context else {}
    change = envelope.get("change") or {}
    task = envelope.get("task") or {}
    if change.get("id") and change.get("status") not in ("archived", "cancelled"):
        attention = envelope.get("diagnostics", {}).get("needs_attention", [])
        warnings = envelope.get("diagnostics", {}).get("warnings", [])
        codes = ", ".join(
            str(item.get("code")) for item in [*attention, *warnings] if item.get("code")
        ) or "none"
        print(
            "[Ultra stop advisory] Active Ultra change remains open: "
            f"change={change['id']}, "
            f"task={task.get('id') or 'none'}, "
            f"stage={envelope.get('execution', {}).get('stage') or 'project'}, "
            f"diagnostics={codes}. "
            "Stop is allowed; read ultra.context before resuming or explicitly archive later.",
            file=sys.stderr,
        )
    allow_stop()


if __name__ == "__main__":
    main()
