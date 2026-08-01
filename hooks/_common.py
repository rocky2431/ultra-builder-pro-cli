"""Small file-first helpers shared by Ultra hooks."""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any


def read_payload() -> dict[str, Any]:
    try:
        value = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def project_root(payload: dict[str, Any]) -> Path | None:
    candidate = payload.get("cwd") or payload.get("workspace_root") or os.getcwd()
    path = Path(str(candidate)).resolve()
    if path.is_file():
        path = path.parent
    for current in (path, *path.parents):
        if (current / ".ultra").is_dir():
            return current
    return None


def markdown_section(text: str, heading: str) -> str:
    pattern = re.compile(
        rf"^##\s+{re.escape(heading)}\s*$\n(?P<body>.*?)(?=^##\s+|\Z)",
        re.MULTILINE | re.DOTALL | re.IGNORECASE,
    )
    match = pattern.search(text)
    return match.group("body").strip() if match else ""


def read_tasks(root: Path) -> list[dict[str, Any]]:
    try:
        value = json.loads((root / ".ultra" / "tasks.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    tasks = value.get("tasks", []) if isinstance(value, dict) else value
    return [item for item in tasks if isinstance(item, dict)] if isinstance(tasks, list) else []


def current_task(root: Path) -> dict[str, Any] | None:
    tasks = read_tasks(root)
    for status in ("in_progress", "pending"):
        for task in tasks:
            if task.get("status") == status:
                return task
    return None


def project_file(root: Path, value: str, *, ultra_default: bool = False) -> Path | None:
    relative = Path(value)
    if relative.is_absolute():
        return None
    ultra_shorthands = {"changes", "contexts", "decisions", "evidence", "progress", "reviews", "specs"}
    first = relative.parts[0] if relative.parts else ""
    if first == ".ultra":
        base = root
    elif ultra_default and first in ultra_shorthands:
        base = root / ".ultra"
    else:
        base = root
    candidate = (base / relative).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    return candidate


def context_path(root: Path, task: dict[str, Any]) -> Path | None:
    value = task.get("context_file")
    if not isinstance(value, str) or not value:
        return None
    return project_file(root, value, ultra_default=True)


def task_sections(root: Path, task: dict[str, Any]) -> dict[str, str]:
    file = context_path(root, task)
    try:
        text = file.read_text(encoding="utf-8") if file else ""
    except OSError:
        text = ""
    return {
        "acceptance": markdown_section(text, "Acceptance Criteria"),
        "resume": markdown_section(text, "Resume Note"),
    }


def emit_context(event: str, text: str) -> None:
    if not text.strip():
        return
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": event,
            "additionalContext": text.strip(),
        }
    }))


def write_json_atomic(file: Path, payload: dict[str, Any]) -> None:
    file.parent.mkdir(parents=True, exist_ok=True)
    temporary = file.with_suffix(f"{file.suffix}.tmp-{os.getpid()}")
    temporary.write_text(f"{json.dumps(payload, indent=2)}\n", encoding="utf-8")
    temporary.replace(file)
