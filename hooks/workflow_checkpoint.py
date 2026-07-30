#!/usr/bin/env python3
"""Write an advisory recovery copy of the live Context Envelope before compaction."""

import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from context_envelope import (
    ContextEnvelopeError,
    find_root_for_hook,
    read_context_envelope,
    render_context_envelope,
)
from runtime_paths import RuntimePathError, validate_project_layout


def main() -> None:
    try:
        data = json.loads(sys.stdin.read() or "{}")
        data = data if isinstance(data, dict) else {}
    except json.JSONDecodeError as exc:
        print(f"[workflow_checkpoint] invalid hook input: {exc}", file=sys.stderr)
        data = {}
    root = find_root_for_hook(
        Path(data.get("cwd") or Path.cwd()).resolve(),
        "workflow_checkpoint",
    )
    if root is None:
        print(json.dumps({}))
        return
    try:
        envelope = read_context_envelope(root)
    except ContextEnvelopeError as exc:
        print(f"[workflow_checkpoint] cannot inspect Context Envelope: {exc}", file=sys.stderr)
        print(json.dumps({}))
        return
    if not envelope:
        print(json.dumps({}))
        return

    try:
        validate_project_layout(root, validate_runtime_tree=True)
    except RuntimePathError as exc:
        print(
            f"[workflow_checkpoint] unsafe Ultra runtime: {exc}",
            file=sys.stderr,
        )
        print(json.dumps({}))
        return
    runtime_dir = root / ".ultra" / ".runtime"
    runtime_dir.mkdir(parents=True, exist_ok=True)
    checkpoint = {
        "schema": 3,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "session_id": data.get("session_id", ""),
        "context_digest": envelope.get("digest"),
        "context": dict(envelope),
        "rendered": render_context_envelope(root, envelope),
    }
    fd, temp_name = tempfile.mkstemp(prefix="checkpoint.", suffix=".json", dir=runtime_dir)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(checkpoint, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temp_name, runtime_dir / "checkpoint.json")
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)
    print(json.dumps({"systemMessage": "Ultra Context Envelope checkpoint saved."}))


if __name__ == "__main__":
    main()
