#!/usr/bin/env python3
"""Write a minimal, mechanical compaction checkpoint for an active workflow."""

import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

TERMINAL = {"committed", "completed", "done", "cancelled"}


def main() -> None:
    try:
        data = json.loads(sys.stdin.read() or "{}")
        data = data if isinstance(data, dict) else {}
    except json.JSONDecodeError as exc:
        print(f"[workflow_checkpoint] invalid hook input: {exc}", file=sys.stderr)
        data = {}
    start = Path(data.get("cwd") or Path.cwd()).resolve()
    for root in (start, *start.parents):
        state_file = root / ".ultra" / "workflow-state.json"
        if not state_file.is_file():
            continue
        try:
            state = json.loads(state_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"[workflow_checkpoint] cannot read {state_file}: {exc}", file=sys.stderr)
            break
        if not isinstance(state, dict) or state.get("status") in TERMINAL:
            break
        runtime_dir = root / ".ultra" / "runtime"
        runtime_dir.mkdir(parents=True, exist_ok=True)
        checkpoint = {
            "schema": 1,
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "session_id": data.get("session_id", ""),
            "workflow": state,
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
        return
    print(json.dumps({}))


if __name__ == "__main__":
    main()
