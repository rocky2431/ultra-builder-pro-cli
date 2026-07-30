#!/usr/bin/env python3
"""Re-inject the live Context Envelope after compaction; checkpoints are advisory."""

import json
import sys
from datetime import datetime
from pathlib import Path

from context_envelope import (
    ContextEnvelopeError,
    find_root_for_hook,
    read_context_envelope,
    render_context_envelope,
)


def _hook_output(event: str, text: str) -> dict:
    if event == "SessionStart":
        return {"hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": text,
        }}
    return {"additionalContext": text}


def _checkpoint_advisory(root: Path):
    file = root / ".ultra" / ".runtime" / "checkpoint.json"
    if not file.is_file():
        return None
    try:
        value = json.loads(file.read_text(encoding="utf-8"))
        datetime.fromisoformat(str(value.get("captured_at", "")).replace("Z", "+00:00"))
    except (OSError, json.JSONDecodeError, ValueError, AttributeError) as exc:
        print(f"[workflow_resume] cannot read checkpoint {file}: {exc}", file=sys.stderr)
        return None
    if (
        not isinstance(value, dict)
        or value.get("schema") != 3
        or not isinstance(value.get("context"), dict)
        or not isinstance(value.get("rendered"), str)
        or not value["rendered"].strip()
        or value.get("context_digest") != value["context"].get("digest")
    ):
        print(f"[workflow_resume] invalid checkpoint schema in {file}", file=sys.stderr)
        return None
    return "\n".join([
        "[Ultra checkpoint advisory]",
        "Live .ultra/.runtime/state.db could not be read; this checkpoint is not authority.",
        value["rendered"],
        "Run ultra.doctor before mutation.",
    ])


def main() -> None:
    try:
        data = json.loads(sys.stdin.read() or "{}")
        data = data if isinstance(data, dict) else {}
    except json.JSONDecodeError as exc:
        print(f"[workflow_resume] invalid hook input: {exc}", file=sys.stderr)
        data = {}
    root = find_root_for_hook(
        Path(data.get("cwd") or Path.cwd()).resolve(),
        "workflow_resume",
    )
    if root is None:
        print(json.dumps({}))
        return
    text = None
    try:
        envelope = read_context_envelope(root)
        if envelope:
            text = render_context_envelope(root, envelope)
    except ContextEnvelopeError as exc:
        print(f"[workflow_resume] cannot inspect Context Envelope: {exc}", file=sys.stderr)
        text = _checkpoint_advisory(root)
    if not text:
        print(json.dumps({}))
        return
    event = data.get("hook_event_name", "SessionStart")
    print(json.dumps(_hook_output(event, text)))


if __name__ == "__main__":
    main()
