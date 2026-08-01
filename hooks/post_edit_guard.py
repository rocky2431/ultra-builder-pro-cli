#!/usr/bin/env python3
"""Record mechanical task evidence observations after an edit."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from _common import (
    current_task,
    emit_context,
    project_file,
    project_root,
    read_payload,
    write_json_atomic,
)


DIMENSIONS = (
    "tests_written",
    "tests_passed",
    "persistence_real",
    "feature_flags_audit",
    "vertical_slice",
    "spec_trace",
)


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def trace_observation(root: Path, task: dict) -> str:
    trace = task.get("trace_to")
    if not isinstance(trace, str) or "#" not in trace:
        return "missing"
    name, anchor = trace.rsplit("#", 1)
    file = project_file(root, name, ultra_default=True)
    if file is None:
        return "missing"
    try:
        headings = re.findall(r"^#{1,6}\s+(.+?)\s*$", file.read_text(encoding="utf-8"), re.MULTILINE)
    except OSError:
        return "missing"
    return "observed" if slug(anchor) in {slug(heading) for heading in headings} else "missing"


def main() -> int:
    payload = read_payload()
    root = project_root(payload)  # Idle guard: no `.ultra/` means silent exit.
    if root is None:
        return 0
    task = current_task(root)
    if not task:
        return 0
    tool_input = payload.get("tool_input")
    tool_input = tool_input if isinstance(tool_input, dict) else {}
    changed = str(tool_input.get("file_path") or tool_input.get("path") or "")
    relative = ""
    if changed:
        try:
            relative = str(Path(changed).resolve().relative_to(root))
        except ValueError:
            relative = ""

    file = root / ".ultra" / "progress" / f"{task.get('id')}.json"
    try:
        progress = json.loads(file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        progress = {}
    if not isinstance(progress, dict):
        progress = {}
    existing_evidence = progress.get("evidence")
    existing_evidence = existing_evidence if isinstance(existing_evidence, dict) else {}
    progress["task_id"] = str(task.get("id"))
    progress["evidence"] = {
        name: existing_evidence.get(name, "unknown")
        if isinstance(existing_evidence.get(name, "unknown"), str)
        else "unknown"
        for name in DIMENSIONS
    }
    touched_files = progress.get("touched_files")
    progress["touched_files"] = list(dict.fromkeys(
        item for item in touched_files if isinstance(item, str) and item
    )) if isinstance(touched_files, list) else []
    if relative and relative not in progress["touched_files"]:
        progress["touched_files"].append(relative)
    if re.search(r"(?:^|/)(?:test|tests|__tests__)/|(?:\.test|\.spec)\.", relative, re.IGNORECASE):
        progress["evidence"]["tests_written"] = "observed"
    progress["evidence"]["spec_trace"] = trace_observation(root, task)
    progress["updated_at"] = datetime.now(timezone.utc).isoformat()
    write_json_atomic(file, progress)

    unknown = [name for name, value in progress["evidence"].items() if value == "unknown"]
    emit_context(
        "PostToolUse",
        f"Ultra evidence sensor updated task {task.get('id')}. Still unobserved: {', '.join(unknown) or 'none'}.",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
