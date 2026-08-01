#!/usr/bin/env python3
"""Save and restore a disposable compact snapshot from canonical files."""

from __future__ import annotations

import subprocess
from datetime import datetime, timezone

from _common import current_task, emit_context, project_root, read_payload, task_sections


def git_output(root, *args: str) -> str:
    result = subprocess.run(
        ["git", *args], cwd=root, text=True, capture_output=True, check=False, timeout=5
    )
    return result.stdout.strip() if result.returncode == 0 else "unavailable"


def save_snapshot(root) -> None:
    task = current_task(root)
    sections = task_sections(root, task) if task else {"acceptance": "", "resume": ""}
    text = [
        "# Ultra Compact Snapshot",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        f"HEAD: {git_output(root, 'rev-parse', 'HEAD')}",
        f"Task: {task.get('id') if task else 'none'}",
        "",
        "## Acceptance Criteria",
        sections["acceptance"] or "_(none)_",
        "",
        "## Resume Note",
        sections["resume"] or "_(none)_",
        "",
        "## Worktree",
        "```text",
        git_output(root, "status", "--short"),
        "```",
        "",
    ]
    file = root / ".ultra" / ".runtime" / "compact-snapshot.md"
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text("\n".join(text), encoding="utf-8")


def main() -> int:
    payload = read_payload()
    root = project_root(payload)  # Idle guard: no `.ultra/` means silent exit.
    if root is None:
        return 0
    event = str(payload.get("hook_event_name") or payload.get("hookEventName") or "")
    if event == "PreCompact":
        save_snapshot(root)
        return 0
    if event in {"PostCompact", "SessionStart"} and (
        event == "PostCompact" or payload.get("source") == "compact"
    ):
        file = root / ".ultra" / ".runtime" / "compact-snapshot.md"
        if file.is_file():
            emit_context("SessionStart", file.read_text(encoding="utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
