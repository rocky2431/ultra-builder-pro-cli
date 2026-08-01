#!/usr/bin/env python3
"""Recall current acceptance before a source-reading or editing tool call."""

from _common import current_task, emit_context, project_root, read_payload, task_sections


def main() -> int:
    payload = read_payload()
    root = project_root(payload)  # Idle guard: no `.ultra/` means silent exit.
    if root is None:
        return 0
    task = current_task(root)
    if not task:
        return 0
    acceptance = task_sections(root, task)["acceptance"]
    if acceptance:
        emit_context(
            "PreToolUse",
            f"Ultra task {task.get('id')} acceptance reminder:\n{acceptance}",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
