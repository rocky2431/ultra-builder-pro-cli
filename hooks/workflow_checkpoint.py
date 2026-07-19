#!/usr/bin/env python3
"""Write a recovery projection of the canonical DB breadcrumb before compaction."""

import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from context_spine import (
    ContextSpineError,
    find_root,
    read_breadcrumb,
    render_breadcrumb,
)


def main() -> None:
    try:
        data = json.loads(sys.stdin.read() or "{}")
        data = data if isinstance(data, dict) else {}
    except json.JSONDecodeError as exc:
        print(f"[workflow_checkpoint] invalid hook input: {exc}", file=sys.stderr)
        data = {}
    root = find_root(Path(data.get("cwd") or Path.cwd()).resolve())
    if root is None:
        print(json.dumps({}))
        return
    try:
        breadcrumb = read_breadcrumb(root)
    except ContextSpineError as exc:
        print(f"[workflow_checkpoint] cannot inspect Context Spine: {exc}", file=sys.stderr)
        print(json.dumps({}))
        return
    if not breadcrumb or not breadcrumb.get("change_id"):
        print(json.dumps({}))
        return

    runtime_dir = root / ".ultra" / "runtime"
    runtime_dir.mkdir(parents=True, exist_ok=True)
    checkpoint = {
        "schema": 2,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "session_id": data.get("session_id", ""),
        "breadcrumb": dict(breadcrumb),
        "rendered": render_breadcrumb(root, breadcrumb),
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
    print(json.dumps({"systemMessage": "Ultra workflow checkpoint saved."}))


if __name__ == "__main__":
    main()
