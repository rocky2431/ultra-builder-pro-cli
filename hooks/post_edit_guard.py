#!/usr/bin/env python3
"""Record mechanical task evidence observations after an edit."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path

from _common import (
    current_task_selection,
    emit_context,
    normalized_task_id,
    project_relative_path,
    project_root,
    read_derived_json,
    read_payload,
    read_stable_project_file_snapshot,
    render_task_diagnostics,
    task_sections,
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
PROGRESS_SNAPSHOT_MAX_BYTES = 1024 * 1024
TRACE_SOURCE_SNAPSHOT_MAX_BYTES = 8 * 1024 * 1024


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def trace_observation(root: Path, task: dict):
    trace = task.get("trace_to")
    if not isinstance(trace, str) or "#" not in trace:
        return "missing", None
    name, anchor = trace.rsplit("#", 1)
    relative = project_relative_path(name, ultra_default=True)
    if relative is None:
        return "missing", None
    snapshot, failure = read_stable_project_file_snapshot(
        root,
        relative,
        max_bytes=TRACE_SOURCE_SNAPSHOT_MAX_BYTES,
        code_prefix="trace_source_snapshot",
        label="Task trace source",
    )
    if snapshot is None or failure is not None:
        diagnostic = dict(failure) if failure is not None else {
            "code": "trace_source_snapshot_read_error",
            "message": "Task trace source could not be observed.",
            "path": str(root / relative),
        }
        diagnostic["repair"] = (
            "Restore the trace source as one stable readable regular UTF-8 file and retry "
            "PostToolUse; spec_trace remains missing until it is observed."
        )
        return "missing", diagnostic
    try:
        text = snapshot["bytes"].decode("utf-8")
    except UnicodeDecodeError:
        return "missing", {
            "code": "trace_source_snapshot_invalid_utf8",
            "message": "Task trace source must be valid UTF-8 before it can be observed.",
            "path": snapshot["path"],
            "repair": (
                "Restore the trace source as valid UTF-8 and retry PostToolUse; spec_trace "
                "remains missing until it is observed."
            ),
        }
    headings = re.findall(r"^#{1,6}\s+(.+?)\s*$", text, re.MULTILINE)
    observation = (
        "observed"
        if slug(anchor) in {slug(heading) for heading in headings}
        else "missing"
    )
    return observation, None


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
                "PostToolUse",
                "Ultra task selection diagnostic:\n" + diagnostics,
            )
        return 0
    sections = task_sections(root, task)
    if not sections["context_available"]:
        context_diagnostics = [
            diagnostic
            for diagnostic in sections["diagnostics"]
            if str(diagnostic.get("code") or "").startswith("task_context_")
        ]
        emit_context(
            "PostToolUse",
            "Ultra task context diagnostic:\n"
            + render_task_diagnostics(context_diagnostics),
        )
        return 0
    task_id = normalized_task_id(task.get("id"))
    if task_id is None:
        return 0
    tool_input = payload.get("tool_input")
    tool_input = tool_input if isinstance(tool_input, dict) else {}
    changed = str(tool_input.get("file_path") or tool_input.get("path") or "")
    relative = ""
    if changed:
        try:
            relative = str(Path(changed).resolve().relative_to(root))
        except (OSError, RuntimeError, ValueError):
            relative = ""

    progress_relative = Path(".ultra") / "progress" / f"{task_id}.json"
    progress, read_failure = read_derived_json(
        root,
        progress_relative,
        max_bytes=PROGRESS_SNAPSHOT_MAX_BYTES,
        code_prefix="progress_snapshot",
        label="Task progress observation",
    )
    diagnostics = []
    if read_failure is not None:
        code = read_failure.get("code", "")
        if code.endswith("_missing"):
            progress = {}
        elif code.endswith(("_invalid_utf8", "_invalid_json", "_invalid_root")):
            diagnostics.append(read_failure)
            progress = {}
        else:
            emit_context(
                "PostToolUse",
                "Ultra progress diagnostic:\n"
                + render_task_diagnostics([read_failure]),
            )
            return 0
    if progress is None:
        progress = {}
    if not isinstance(progress, dict):
        progress = {}
    existing_evidence = progress.get("evidence")
    existing_evidence = existing_evidence if isinstance(existing_evidence, dict) else {}
    progress["task_id"] = task_id
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
    trace_value, trace_failure = trace_observation(root, task)
    progress["evidence"]["spec_trace"] = trace_value
    if trace_failure is not None:
        diagnostics.append(trace_failure)
    progress["updated_at"] = datetime.now(timezone.utc).isoformat()
    write_failure = write_json_atomic(
        root,
        progress_relative,
        progress,
        max_bytes=PROGRESS_SNAPSHOT_MAX_BYTES,
        code_prefix="progress_write",
        label="Task progress observation",
    )
    if write_failure is not None:
        diagnostics.append(write_failure)
        emit_context(
            "PostToolUse",
            "Ultra progress diagnostic:\n"
            + render_task_diagnostics(diagnostics),
        )
        return 0

    non_observed = [
        name
        for name, value in progress["evidence"].items()
        if value != "observed"
    ]
    parts = []
    if diagnostics:
        parts.append("Ultra progress diagnostic:\n" + render_task_diagnostics(diagnostics))
    parts.append(
        f"Ultra evidence sensor updated task {task_id}. Still non-observed: "
        f"{', '.join(non_observed) or 'none'}."
    )
    emit_context(
        "PostToolUse",
        "\n\n".join(parts),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
