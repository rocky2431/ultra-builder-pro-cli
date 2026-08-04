#!/usr/bin/env python3
"""Inject the accepted North Star or its pre-Research fallback plus task acceptance."""

from _common import current_task, emit_context, markdown_section, project_root, read_payload, task_sections


def settled_section(text: str) -> str:
    """Return an explicitly populated section, not a packaged unresolved marker."""
    if not text or "[NEEDS CLARIFICATION]" in text or "not yet defined" in text.lower():
        return ""
    return text.strip()


def read_text(file) -> str:
    try:
        return file.read_text(encoding="utf-8")
    except OSError:
        return ""


def main() -> int:
    payload = read_payload()
    root = project_root(payload)  # Idle guard: no `.ultra/` means silent exit.
    if root is None:
        return 0
    ultra = root / ".ultra"
    north_star = read_text(ultra / "north-star.md")
    project_brief = read_text(ultra / "project-brief.md")
    parts = []
    direction = settled_section(markdown_section(north_star, "Project Direction"))
    if direction:
        baseline = [f"Project Direction:\n{direction}"]
        for heading in ("North Star Outcome", "Hard Constraints"):
            section = settled_section(markdown_section(north_star, heading))
            if section:
                baseline.append(f"{heading}:\n{section}")
        baseline_text = "\n\n".join(baseline)
        parts.append(f"Ultra accepted north star:\n{baseline_text}")
    else:
        brief_line = settled_section(markdown_section(project_brief, "One-line"))
        legacy_line = settled_section(markdown_section(north_star, "One-line"))
        if brief_line:
            parts.append(f"Ultra project brief (Research not yet accepted):\n{brief_line}")
        elif legacy_line:
            parts.append(f"Ultra legacy project intent:\n{legacy_line}")
    task = current_task(root)
    if task:
        acceptance = task_sections(root, task)["acceptance"]
        if acceptance:
            parts.append(f"Current task {task.get('id')} acceptance:\n{acceptance}")
    emit_context("SessionStart", "\n\n".join(parts))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
