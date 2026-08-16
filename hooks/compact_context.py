#!/usr/bin/env python3
"""Save and restore a disposable compact snapshot from canonical files."""

from __future__ import annotations

import subprocess
from datetime import datetime, timezone

from _common import (
    RESUME_NAVIGATION_LIMITATION,
    current_task_selection,
    emit_context,
    project_root,
    read_derived_project_file_snapshot,
    read_payload,
    render_task_diagnostics,
    task_sections,
    write_derived_project_file_atomic,
)
from session_context import _read_bounded_process_output


COMPACT_SNAPSHOT_RELATIVE = ".ultra/.runtime/compact-snapshot.md"
COMPACT_SNAPSHOT_MAX_BYTES = 1024 * 1024
COMPACT_GIT_TIMEOUT_SECONDS = 5
COMPACT_GIT_MAX_OUTPUT_BYTES = 256 * 1024


def git_output(root, *args: str):
    command = ["git", *args]
    rendered = " ".join(command)
    try:
        process = subprocess.Popen(
            command,
            cwd=root,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            shell=False,
        )
    except FileNotFoundError:
        return "unavailable", {
            "code": "compact_git_missing",
            "message": f"Compact snapshot could not run `{rendered}` because Git is unavailable.",
            "path": str(root),
            "command": command,
            "repair": (
                "Restore a working Git executable and retry PreCompact; canonical task "
                "Acceptance Criteria and the navigational Resume Note remain recoverable."
            ),
        }
    except OSError as error:
        return "unavailable", {
            "code": "compact_git_execution_error",
            "message": f"Compact snapshot could not execute `{rendered}`: {error}",
            "path": str(root),
            "command": command,
            "repair": (
                "Repair local Git execution and retry PreCompact; canonical task Acceptance "
                "Criteria and the navigational Resume Note remain recoverable."
            ),
        }

    stdout, _stderr, failure = _read_bounded_process_output(
        process,
        COMPACT_GIT_TIMEOUT_SECONDS,
        COMPACT_GIT_MAX_OUTPUT_BYTES,
        b"",
    )
    if failure == "timeout":
        return "unavailable", {
            "code": "compact_git_timeout",
            "message": (
                f"Compact snapshot stopped `{rendered}` after the "
                f"{COMPACT_GIT_TIMEOUT_SECONDS}-second execution ceiling."
            ),
            "path": str(root),
            "command": command,
            "repair": (
                "Retry PreCompact after Git becomes responsive; canonical task Acceptance "
                "Criteria and the navigational Resume Note remain recoverable."
            ),
        }
    if failure == "output_too_large":
        return "unavailable", {
            "code": "compact_git_output_too_large",
            "message": (
                f"Compact snapshot stopped `{rendered}` after combined stdout and stderr "
                f"exceeded the {COMPACT_GIT_MAX_OUTPUT_BYTES}-byte ceiling."
            ),
            "path": str(root),
            "command": command,
            "repair": (
                f"Retry PreCompact after reducing Git command output below the "
                f"{COMPACT_GIT_MAX_OUTPUT_BYTES}-byte combined stdout/stderr ceiling; "
                "canonical task Acceptance Criteria and the navigational Resume Note remain recoverable."
            ),
        }
    if process.returncode != 0:
        return "unavailable", {
            "code": "compact_git_nonzero",
            "message": (
                f"Compact snapshot observed `{rendered}` exit with code "
                f"{process.returncode}."
            ),
            "path": str(root),
            "command": command,
            "returncode": process.returncode,
            "repair": (
                "Repair the local Git worktree or repository state and retry PreCompact; "
                "canonical task Acceptance Criteria and the navigational Resume Note remain recoverable."
            ),
        }
    return stdout.decode("utf-8", errors="replace").strip(), None


def save_snapshot(root):
    selection = current_task_selection(root)
    task = selection["task"]
    sections = (
        task_sections(root, task)
        if task
        else {
            "acceptance": "",
            "resume": "",
            "diagnostics": selection["diagnostics"],
        }
    )
    head, head_failure = git_output(root, "rev-parse", "HEAD")
    worktree, worktree_failure = git_output(root, "status", "--short")
    git_diagnostics = [
        failure
        for failure in (head_failure, worktree_failure)
        if failure is not None
    ]
    snapshot_diagnostics = [*sections["diagnostics"], *git_diagnostics]
    diagnostics = render_task_diagnostics(snapshot_diagnostics)
    text = [
        "# Ultra Compact Snapshot",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        f"HEAD: {head}",
        f"Task: {task.get('id') if task else 'none'}",
        "",
        "## Acceptance Criteria",
        sections["acceptance"] or "_(none)_",
        "",
        "## Resume Note",
        sections["resume"] or "_(none)_",
        "",
        RESUME_NAVIGATION_LIMITATION,
        "",
        "## Task Diagnostics",
        diagnostics or "_(none)_",
        "",
        "## Worktree",
        "```text",
        worktree,
        "```",
        "",
    ]
    write_failure = write_derived_project_file_atomic(
        root,
        COMPACT_SNAPSHOT_RELATIVE,
        "\n".join(text).encode("utf-8"),
        max_bytes=COMPACT_SNAPSHOT_MAX_BYTES,
        code_prefix="compact_snapshot_write",
        label="Ultra compact snapshot",
    )
    published_diagnostics = list(sections["diagnostics"])
    published_diagnostics.extend(git_diagnostics)
    if write_failure is not None:
        published_diagnostics.append(write_failure)
    return published_diagnostics


def main() -> int:
    payload = read_payload()
    root = project_root(payload)  # Idle guard: no `.ultra/` means silent exit.
    if root is None:
        return 0
    event = str(payload.get("hook_event_name") or payload.get("hookEventName") or "")
    if event == "PreCompact":
        diagnostics = save_snapshot(root)
        if diagnostics:
            emit_context(
                "PreCompact",
                "Ultra compact snapshot diagnostic:\n"
                + render_task_diagnostics(diagnostics),
            )
        return 0
    if event in {"PostCompact", "SessionStart"} and (
        event == "PostCompact" or payload.get("source") == "compact"
    ):
        snapshot, failure = read_derived_project_file_snapshot(
            root,
            COMPACT_SNAPSHOT_RELATIVE,
            max_bytes=COMPACT_SNAPSHOT_MAX_BYTES,
            code_prefix="compact_snapshot_read",
            label="Ultra compact snapshot",
        )
        if snapshot is not None:
            try:
                text = snapshot["bytes"].decode("utf-8")
            except UnicodeDecodeError:
                failure = {
                    "code": "compact_snapshot_read_invalid_utf8",
                    "message": "Ultra compact snapshot must be valid UTF-8 Markdown.",
                    "path": snapshot["path"],
                }
            else:
                emit_context("SessionStart", text)
                return 0
        if failure is not None and not failure.get("code", "").endswith("_missing"):
            emit_context(
                "SessionStart",
                "Ultra compact snapshot diagnostic:\n"
                + render_task_diagnostics([failure]),
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
