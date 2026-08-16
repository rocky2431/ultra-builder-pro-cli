#!/usr/bin/env python3
"""Recall current acceptance before a source-reading or editing tool call."""

from _common import (
    current_task_selection,
    emit_context,
    project_root,
    read_payload,
    render_task_diagnostics,
    task_sections,
)


def main() -> int:
    payload = read_payload()
    root = project_root(payload)  # Idle guard: no `.ultra/` means silent exit.
    if root is None:
        return 0
    selection = current_task_selection(root)
    task = selection["task"]
    if not task:
        diagnostics = render_task_diagnostics(selection["diagnostics"])
        if diagnostics:
            emit_context(
                "PreToolUse",
                f"Ultra task ledger diagnostics:\n{diagnostics}",
            )
        return 0
    sections = task_sections(root, task)
    parts = []
    if sections["acceptance"]:
        parts.append(
            f"Ultra task {task.get('id')} acceptance reminder:\n{sections['acceptance']}"
        )
    diagnostics = render_task_diagnostics(sections["diagnostics"])
    if diagnostics:
        parts.append(f"Ultra task {task.get('id')} diagnostics:\n{diagnostics}")
    if parts:
        emit_context(
            "PreToolUse",
            "\n\n".join(parts),
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
