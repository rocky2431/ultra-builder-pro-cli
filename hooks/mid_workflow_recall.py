#!/usr/bin/env python3
"""Recall current acceptance before a source-reading or editing tool call."""

import hashlib

from _common import (
    current_task_selection,
    emit_context,
    legacy_task_change_id,
    project_root,
    read_derived_json,
    read_payload,
    render_task_diagnostics,
    task_sections,
    write_json_atomic,
)


REMINDER_STATE_RELATIVE = ".ultra/.runtime/mid-workflow-recall-state.json"
REMINDER_STATE_MAX_BYTES = 64 * 1024
REMINDER_STATE_SCHEMA = "ultra-mid-workflow-recall-state-v2"
REMINDER_SESSIONS_MAX = 32
REMINDER_KEY_FIELDS = (
    "session_id",
    "change_id",
    "task_id",
    "acceptance_sha256",
)
SESSION_ID_MAX_BYTES = 256


def session_identity(payload):
    """Return one usable host session identity, or None when unavailable.

    Deduplication keys on the identity the host actually supplies with the
    event. When the payload carries no usable session identity, nothing is
    ever suppressed: a fresh session must not lose its first reminder to a
    key that cannot be verified.
    """
    value = payload.get("session_id")
    if not isinstance(value, str):
        return None
    if not value or not value.strip() or len(value.encode("utf-8")) > SESSION_ID_MAX_BYTES:
        return None
    if any(ord(character) < 0x20 or ord(character) == 0x7F for character in value):
        return None
    return value


def reminder_key(session_id, task, acceptance):
    change_id = task.get("change_id")
    if not isinstance(change_id, str) or not change_id:
        change_id = legacy_task_change_id(task) or ""
    task_id = task.get("id")
    if not isinstance(task_id, str) or not task_id:
        return None
    return {
        "session_id": session_id,
        "change_id": change_id,
        "task_id": task_id,
        "acceptance_sha256": hashlib.sha256(acceptance.encode("utf-8")).hexdigest(),
    }


def last_delivered(root):
    """Read the disposable per-session delivery record, or None when unusable.

    The state file is a derived observation under `.ultra/.runtime/`, never
    authority: an unreadable, malformed, or foreign file simply disables
    suppression for this event instead of blocking the reminder.
    """
    state, _failure = read_derived_json(
        root,
        REMINDER_STATE_RELATIVE,
        max_bytes=REMINDER_STATE_MAX_BYTES,
        code_prefix="mid_workflow_recall_state",
        label="Mid-workflow reminder state",
    )
    if not isinstance(state, dict) or state.get("$schema") != REMINDER_STATE_SCHEMA:
        return None
    sessions = state.get("last_delivered")
    if not isinstance(sessions, dict):
        return None
    normalized = {}
    for session_id, key in sessions.items():
        if not isinstance(session_id, str) or not session_id:
            continue
        if isinstance(key, dict) and key.get("session_id") == session_id and all(
            isinstance(key.get(field), str) and key.get(field)
            for field in REMINDER_KEY_FIELDS
        ):
            normalized[session_id] = {field: key[field] for field in REMINDER_KEY_FIELDS}
    return normalized


def record_delivery(root, key, previous_sessions):
    """Best-effort delivery record; a failed write only fails to dedup later."""
    sessions = dict(previous_sessions or {})
    sessions.pop(key["session_id"], None)
    sessions[key["session_id"]] = key
    while len(sessions) > REMINDER_SESSIONS_MAX:
        del sessions[next(iter(sessions))]
    return write_json_atomic(
        root,
        REMINDER_STATE_RELATIVE,
        {"$schema": REMINDER_STATE_SCHEMA, "last_delivered": sessions},
        max_bytes=REMINDER_STATE_MAX_BYTES,
        code_prefix="mid_workflow_recall_state",
        label="Mid-workflow reminder state",
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
    task_id = task.get("id")
    diagnostics = render_task_diagnostics(sections["diagnostics"])
    acceptance = sections["acceptance"]
    if not acceptance:
        # Nothing restatable; live diagnostics stay visible on every event.
        if diagnostics:
            emit_context(
                "PreToolUse",
                f"Ultra task {task_id} diagnostics:\n{diagnostics}",
            )
        return 0

    session_id = session_identity(payload)
    key = reminder_key(session_id, task, acceptance) if session_id else None
    previous_sessions = None
    already_delivered = False
    if key is not None:
        previous_sessions = last_delivered(root)
        # Only an identical reminder delivered consecutively in this same
        # session suppresses; an earlier different delivery (a task switch or
        # a changed acceptance, even one reverting to an earlier value) can
        # never stand in for the current context.
        already_delivered = (
            previous_sessions is not None
            and previous_sessions.get(session_id) == key
        )

    if not already_delivered:
        parts = [f"Ultra task {task_id} acceptance reminder:\n{acceptance}"]
        if diagnostics:
            parts.append(f"Ultra task {task_id} diagnostics:\n{diagnostics}")
        emit_context(
            "PreToolUse",
            "\n\n".join(parts),
        )
        if key is not None:
            record_delivery(root, key, previous_sessions)
    elif diagnostics:
        # Diagnostics reflect live ledger state and pass through unchanged even
        # when the identical acceptance reminder was already delivered.
        emit_context(
            "PreToolUse",
            f"Ultra task {task_id} diagnostics:\n{diagnostics}",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
