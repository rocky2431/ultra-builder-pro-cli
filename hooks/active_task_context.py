#!/usr/bin/env python3
"""Protect Ultra projections and restate an active task boundary before edits."""

import json
import sys
from pathlib import Path

from context_spine import (
    ContextSpineError,
    find_root,
    read_breadcrumb,
    render_breadcrumb,
)

TASKS_PROJECTION = Path(".ultra/tasks/tasks.json")


def tool_paths(data: dict, start: Path):
    """Yield absolute tool targets without assuming they belong to ``start``."""
    tool_input = data.get("tool_input")
    if not isinstance(tool_input, dict):
        return
    for key in ("file_path", "filePath", "filepath", "path"):
        value = tool_input.get(key)
        if not isinstance(value, str) or not value.strip():
            continue
        candidate = Path(value)
        yield candidate.resolve() if candidate.is_absolute() else (start / candidate).resolve()


def projection_root_for_target(target: Path) -> Path | None:
    """Return the project root only for the exact generated tasks projection."""
    if (
        target.name == "tasks.json"
        and target.parent.name == "tasks"
        and target.parent.parent.name == ".ultra"
    ):
        return target.parent.parent.parent
    return None


def targets_tasks_projection(data: dict, root: Path) -> bool:
    for resolved in tool_paths(data, root):
        if resolved == (root / TASKS_PROJECTION).resolve():
            return True
    return False


def projection_denial(reason: str) -> dict:
    return {"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }}


def conflicted_projection_root(data: dict, start: Path) -> Path | None:
    for candidate in (start, *start.parents):
        if not (candidate / ".ultra").exists():
            continue
        if targets_tasks_projection(data, candidate):
            return candidate
    return None


def projection_roots(data: dict, start: Path):
    """Yield initialized project roots derived from every resolved tool target."""
    for target in tool_paths(data, start):
        root = projection_root_for_target(target)
        if root is not None and (root / ".ultra").exists():
            yield root


def main() -> None:
    try:
        data = json.loads(sys.stdin.read() or "{}")
        data = data if isinstance(data, dict) else {}
    except json.JSONDecodeError as exc:
        print(f"[active_task_context] invalid hook input: {exc}", file=sys.stderr)
        data = {}
    start = Path(data.get("cwd") or Path.cwd()).resolve()
    # An absolute tool target carries its own project boundary. Resolve and
    # protect that authority before consulting cwd, because hooks may run from
    # a host-owned temporary directory or another repository.
    for target_root in projection_roots(data, start):
        try:
            target_authority = find_root(target_root)
        except ContextSpineError as exc:
            print(json.dumps(projection_denial(
                "Refusing a direct write to an Ultra projection while the "
                f"runtime authority is conflicted: {exc}. Resolve the "
                "state.db conflict with ultra-doctor before editing generated "
                "project artifacts."
            )))
            return
        if target_authority is None:
            continue
        print(json.dumps(projection_denial(
            "Refusing a direct write to the .ultra/tasks/tasks.json projection. "
            ".ultra/.runtime/state.db is authoritative; use the Ultra MCP task tools and "
            "run ultra-doctor when state or projection health is degraded."
        )))
        return

    try:
        root = find_root(start)
    except ContextSpineError as exc:
        print(
            f"[active_task_context] cannot resolve Ultra root: {exc}",
            file=sys.stderr,
        )
        # Ordinary context injection remains fail-open. A direct write to a
        # known generated projection is different: an authority conflict
        # means the hook cannot prove which DB would regenerate that file, so
        # allowing the write would destroy the projection boundary.
        if conflicted_projection_root(data, start) is not None:
            print(json.dumps(projection_denial(
                "Refusing a direct write to an Ultra projection while the "
                f"runtime authority is conflicted: {exc}. Resolve the "
                "state.db conflict with ultra-doctor before editing generated "
                "project artifacts."
            )))
            return
        root = None
    if root is None:
        print(json.dumps({}))
        return
    if targets_tasks_projection(data, root):
        print(json.dumps(projection_denial(
                "Refusing a direct write to the .ultra/tasks/tasks.json projection. "
                ".ultra/.runtime/state.db is authoritative; use the Ultra MCP task tools and "
                "run ultra-doctor when state or projection health is degraded."
        )))
        return
    try:
        breadcrumb = read_breadcrumb(root)
    except ContextSpineError as exc:
        print(f"[active_task_context] cannot inspect Context Spine: {exc}", file=sys.stderr)
        breadcrumb = None
    if breadcrumb and breadcrumb.get("workflow"):
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "additionalContext": render_breadcrumb(root, breadcrumb),
        }}))
        return
    print(json.dumps({}))


if __name__ == "__main__":
    main()
