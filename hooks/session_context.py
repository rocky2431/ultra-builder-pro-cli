#!/usr/bin/env python3
"""Inject the one-line goal and current task acceptance at session start."""

from _common import current_task, emit_context, markdown_section, project_root, read_payload, task_sections


def main() -> int:
    payload = read_payload()
    root = project_root(payload)  # Idle guard: no `.ultra/` means silent exit.
    if root is None:
        return 0
    try:
        north_star = (root / ".ultra" / "north-star.md").read_text(encoding="utf-8")
    except OSError:
        north_star = ""
    parts = []
    one_line = markdown_section(north_star, "One-line")
    if one_line:
        parts.append(f"Ultra north star:\n{one_line}")
    task = current_task(root)
    if task:
        acceptance = task_sections(root, task)["acceptance"]
        if acceptance:
            parts.append(f"Current task {task.get('id')} acceptance:\n{acceptance}")
    emit_context("SessionStart", "\n\n".join(parts))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
