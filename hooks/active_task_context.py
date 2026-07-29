#!/usr/bin/env python3
"""Protect Ultra managed task files and restate the active workflow boundary."""

import json
import sys
from pathlib import Path

from context_spine import (
    ContextSpineError,
    find_root,
    read_breadcrumb,
    render_breadcrumb,
)

TEAM_TASK_LEDGER = Path(".ultra/tasks/tasks.json")
LIVE_TASK_PROJECTION = Path(".ultra/.runtime/projections/tasks.json")
PROTECTED_TASK_FILES = (TEAM_TASK_LEDGER, LIVE_TASK_PROJECTION)


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


def protected_root_for_target(target: Path) -> Path | None:
    """Return the project root for an exact MCP-managed task file."""
    parts = target.parts
    for relative in PROTECTED_TASK_FILES:
        suffix = relative.parts
        if len(parts) >= len(suffix) and parts[-len(suffix):] == suffix:
            return Path(*parts[:-len(suffix)])
    return None


def targets_managed_task_file(data: dict, root: Path) -> bool:
    for resolved in tool_paths(data, root):
        if any(resolved == (root / relative).resolve() for relative in PROTECTED_TASK_FILES):
            return True
    return False


def managed_file_denial(reason: str) -> dict:
    return {"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }}


def conflicted_managed_root(data: dict, start: Path) -> Path | None:
    for candidate in (start, *start.parents):
        if not (candidate / ".ultra").exists():
            continue
        if targets_managed_task_file(data, candidate):
            return candidate
    return None


def managed_roots(data: dict, start: Path):
    """Yield initialized project roots derived from every resolved tool target."""
    for target in tool_paths(data, start):
        root = protected_root_for_target(target)
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
    for target_root in managed_roots(data, start):
        try:
            target_authority = find_root(target_root)
        except ContextSpineError as exc:
            print(json.dumps(managed_file_denial(
                "Refusing a direct write to an MCP-managed Ultra task file while the "
                f"runtime authority is conflicted: {exc}. Resolve the "
                "state.db conflict with ultra-doctor before retrying the owning "
                "MCP operation."
            )))
            return
        if target_authority is None:
            continue
        print(json.dumps(managed_file_denial(
            "Refusing a direct write to an MCP-managed Ultra task file. "
            ".ultra/tasks/tasks.json is the MCP-published team checkpoint and "
            ".ultra/.runtime/projections/tasks.json is the checkout-local DB view. "
            "Use the Ultra MCP task or task.ledger tools."
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
        # known managed task file is different: an authority conflict means the
        # hook cannot prove which DB owns the publish or projection operation.
        if conflicted_managed_root(data, start) is not None:
            print(json.dumps(managed_file_denial(
                "Refusing a direct write to an MCP-managed Ultra task file while the "
                f"runtime authority is conflicted: {exc}. Resolve the "
                "state.db conflict with ultra-doctor before retrying the owning "
                "MCP operation."
            )))
            return
        root = None
    if root is None:
        print(json.dumps({}))
        return
    if targets_managed_task_file(data, root):
        print(json.dumps(managed_file_denial(
                "Refusing a direct write to an MCP-managed Ultra task file. "
                ".ultra/tasks/tasks.json is the MCP-published team checkpoint and "
                ".ultra/.runtime/projections/tasks.json is the checkout-local DB view. "
                "Use the Ultra MCP task or task.ledger tools."
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
