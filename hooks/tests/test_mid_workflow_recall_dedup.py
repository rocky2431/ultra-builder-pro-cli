"""Regressions for mid_workflow_recall reminder deduplication.

The hook must suppress only its own acceptance reminder when it is identical
to the reminder delivered consecutively before it in the same host-identified
session, and only when the host actually supplies a usable session identity.
Everything else — diagnostics, fresh sessions, task switches, changed
acceptance (including a change back to an earlier value), and missing or
malformed identity — keeps the reminder visible.
"""

import importlib.util
import json
import sys
from pathlib import Path

from test_v026_hooks import (
    HOOK_ROOT,
    load_common,
    make_project,
    run_hook,
    write_typed_task_context,
    write_v2_ledger,
)


STATE_RELATIVE = ".ultra/.runtime/mid-workflow-recall-state.json"
STATE_SCHEMA = "ultra-mid-workflow-recall-state-v2"


def load_recall():
    file = HOOK_ROOT / "mid_workflow_recall.py"
    spec = importlib.util.spec_from_file_location("ultra_mid_workflow_recall", file)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.path.insert(0, str(HOOK_ROOT))
    try:
        spec.loader.exec_module(module)
    finally:
        sys.path.remove(str(HOOK_ROOT))
    return module


def recall(root, session_id=None, tool="Edit"):
    payload = {
        "hook_event_name": "PreToolUse",
        "tool_name": tool,
        "tool_input": {"file_path": "src/http.js"},
    }
    if session_id is not None:
        payload["session_id"] = session_id
    return run_hook("mid_workflow_recall.py", root, payload)


def context_of(result):
    return json.loads(result.stdout)["hookSpecificOutput"]["additionalContext"]


def typed_project(base):
    root = make_project(base)
    ledger = json.loads((root / ".ultra" / "tasks.json").read_text(encoding="utf-8"))
    write_v2_ledger(root, ledger["tasks"])
    write_typed_task_context(root, "1")
    return root


def test_identical_reminder_is_delivered_once_per_identified_session(tmp_path):
    root = typed_project(tmp_path)

    first = recall(root, session_id="session-a")
    assert first.returncode == 0, first.stderr
    assert "Ultra task 1 acceptance reminder" in context_of(first)
    assert "AC-COMMAND" in context_of(first)

    state_file = root / STATE_RELATIVE
    assert state_file.is_file()
    state = json.loads(state_file.read_text(encoding="utf-8"))
    assert state["$schema"] == STATE_SCHEMA
    entry = state["last_delivered"]["session-a"]
    assert set(entry) == {
        "session_id", "change_id", "task_id", "acceptance_sha256",
    }
    assert entry["session_id"] == "session-a"
    assert entry["change_id"] == "C-01"
    assert entry["task_id"] == "1"
    assert len(entry["acceptance_sha256"]) == 64

    second = recall(root, session_id="session-a")
    assert second.returncode == 0, second.stderr
    assert second.stdout == ""


def test_missing_session_identity_never_suppresses(tmp_path):
    root = typed_project(tmp_path)
    for _ in range(2):
        result = recall(root)
        assert result.returncode == 0, result.stderr
        assert "acceptance reminder" in context_of(result)
    assert not (root / STATE_RELATIVE).exists()


def test_malformed_session_identity_never_suppresses(tmp_path):
    root = typed_project(tmp_path)
    for bad in ("", "   ", "session\x00a", "session\x1ba", "x" * 257):
        result = run_hook("mid_workflow_recall.py", root, {
            "hook_event_name": "PreToolUse",
            "tool_name": "Edit",
            "session_id": bad,
        })
        assert result.returncode == 0, (bad, result.stderr)
        assert "acceptance reminder" in context_of(result), bad
    assert not (root / STATE_RELATIVE).exists()


def test_new_session_receives_the_reminder_again(tmp_path):
    root = typed_project(tmp_path)
    assert "acceptance reminder" in context_of(recall(root, session_id="session-a"))
    assert recall(root, session_id="session-a").stdout == ""
    assert "acceptance reminder" in context_of(recall(root, session_id="session-b"))
    assert recall(root, session_id="session-b").stdout == ""


def test_changed_acceptance_is_delivered_again_in_the_same_session(tmp_path):
    root = typed_project(tmp_path)
    assert "acceptance reminder" in context_of(recall(root, session_id="session-a"))
    assert recall(root, session_id="session-a").stdout == ""

    context_file = root / ".ultra" / "contexts" / "task-1.md"
    context_file.write_text(
        context_file.read_text(encoding="utf-8").replace(
            "| AC-COMMAND | Command behavior | `command` | exact command receipt |",
            "| AC-COMMAND | Command behavior | `command` | exact command receipt |\n"
            "| AC-EXTRA | Regression behavior | `command` | exact command receipt |",
        ),
        encoding="utf-8",
    )

    changed = recall(root, session_id="session-a")
    assert "acceptance reminder" in context_of(changed)
    assert "AC-EXTRA" in context_of(changed)
    assert recall(root, session_id="session-a").stdout == ""


def test_acceptance_reverting_to_an_earlier_value_is_delivered_again(tmp_path):
    root = typed_project(tmp_path)
    context_file = root / ".ultra" / "contexts" / "task-1.md"
    original = context_file.read_text(encoding="utf-8")

    assert "acceptance reminder" in context_of(recall(root, session_id="session-a"))
    assert recall(root, session_id="session-a").stdout == ""

    context_file.write_text(
        original.replace(
            "| AC-COMMAND | Command behavior | `command` | exact command receipt |",
            "| AC-COMMAND | Command behavior | `command` | exact command receipt |\n"
            "| AC-EXTRA | Regression behavior | `command` | exact command receipt |",
        ),
        encoding="utf-8",
    )
    assert "AC-EXTRA" in context_of(recall(root, session_id="session-a"))

    # A -> B -> A: the restored acceptance differs from the most recent
    # delivery, so the reminder must return even though A was seen before.
    context_file.write_text(original, encoding="utf-8")
    reverted = recall(root, session_id="session-a")
    assert "acceptance reminder" in context_of(reverted)
    assert "AC-EXTRA" not in context_of(reverted)
    assert recall(root, session_id="session-a").stdout == ""


def test_task_switch_is_delivered_again_in_the_same_session(tmp_path):
    root = typed_project(tmp_path)
    assert "acceptance reminder" in context_of(recall(root, session_id="session-a"))

    ledger = json.loads((root / ".ultra" / "tasks.json").read_text(encoding="utf-8"))
    base = ledger["tasks"][0]
    completed = {**base, "status": "completed"}
    successor = {
        **base,
        "id": "2",
        "title": "Successor",
        "status": "in_progress",
        "dependencies": ["1"],
        "context_file": ".ultra/contexts/task-2.md",
    }
    write_v2_ledger(root, [completed, successor])
    write_typed_task_context(root, "2")

    switched = recall(root, session_id="session-a")
    assert "Ultra task 2 acceptance reminder" in context_of(switched)
    assert recall(root, session_id="session-a").stdout == ""


def test_task_reverting_to_an_earlier_task_is_delivered_again(tmp_path):
    root = typed_project(tmp_path)
    ledger = json.loads((root / ".ultra" / "tasks.json").read_text(encoding="utf-8"))
    base = ledger["tasks"][0]
    successor = {
        **base,
        "id": "2",
        "title": "Successor",
        "status": "in_progress",
        "dependencies": ["1"],
        "context_file": ".ultra/contexts/task-2.md",
    }
    write_typed_task_context(root, "2")

    assert "Ultra task 1 acceptance reminder" in context_of(recall(root, session_id="session-a"))

    write_v2_ledger(root, [{**base, "status": "completed"}, successor])
    assert "Ultra task 2 acceptance reminder" in context_of(recall(root, session_id="session-a"))
    assert recall(root, session_id="session-a").stdout == ""

    # Task A -> B -> A: switching back to the earlier task differs from the
    # most recent delivery, so its reminder must return.
    write_v2_ledger(root, [base, {**successor, "status": "completed"}])
    reverted = recall(root, session_id="session-a")
    assert "Ultra task 1 acceptance reminder" in context_of(reverted)
    assert recall(root, session_id="session-a").stdout == ""


def test_diagnostics_stay_visible_when_the_reminder_is_suppressed(tmp_path):
    root = typed_project(tmp_path)
    context_file = root / ".ultra" / "contexts" / "task-1.md"
    context_file.write_text(
        "> **Status**: in_progress\n\n" + context_file.read_text(encoding="utf-8"),
        encoding="utf-8",
    )

    first = recall(root, session_id="session-a")
    assert "acceptance reminder" in context_of(first)
    assert "`legacy_context_status`" in context_of(first)

    second = recall(root, session_id="session-a")
    assert second.returncode == 0, second.stderr
    context = context_of(second)
    assert "acceptance reminder" not in context
    assert "`legacy_context_status`" in context


def test_malformed_state_file_never_suppresses_and_is_rebuilt(tmp_path):
    root = typed_project(tmp_path)
    state_file = root / STATE_RELATIVE
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text("{not json", encoding="utf-8")

    first = recall(root, session_id="session-a")
    assert "acceptance reminder" in context_of(first)

    rebuilt = json.loads(state_file.read_text(encoding="utf-8"))
    assert rebuilt["$schema"] == STATE_SCHEMA
    assert recall(root, session_id="session-a").stdout == ""


def test_foreign_state_schema_never_suppresses(tmp_path):
    root = typed_project(tmp_path)
    state_file = root / STATE_RELATIVE
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text(json.dumps({
        "$schema": "someone-elses-state",
        "delivered": [],
    }), encoding="utf-8")

    delivered = recall(root, session_id="session-a")
    assert "acceptance reminder" in context_of(delivered)


def test_legacy_v1_history_state_never_suppresses(tmp_path):
    root = typed_project(tmp_path)
    recall_module = load_recall()
    common = load_common()
    selection = common.current_task_selection(root)
    acceptance = common.task_sections(root, selection["task"])["acceptance"]
    legacy_key = recall_module.reminder_key(
        "session-a", selection["task"], acceptance,
    )
    state_file = root / STATE_RELATIVE
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text(json.dumps({
        "$schema": "ultra-mid-workflow-recall-state-v1",
        "delivered": [legacy_key],
    }), encoding="utf-8")

    # Even a perfectly matching v1 history entry is not a consecutive
    # delivery record; the old membership semantics must not survive.
    delivered = recall(root, session_id="session-a")
    assert "acceptance reminder" in context_of(delivered)


def test_delivery_record_is_bounded_and_keeps_recent_sessions(tmp_path):
    root = typed_project(tmp_path)
    recall_module = load_recall()
    sessions = None
    for index in range(40):
        key = {
            "session_id": f"session-{index}",
            "change_id": "C-01",
            "task_id": "1",
            "acceptance_sha256": "0" * 64,
        }
        recall_module.record_delivery(root, key, sessions)
        sessions = recall_module.last_delivered(root)
    assert len(sessions) == recall_module.REMINDER_SESSIONS_MAX
    assert "session-7" not in sessions
    assert "session-8" in sessions
    assert "session-39" in sessions


def test_derived_runtime_allowlist_accepts_only_the_two_runtime_files():
    common = load_common()
    cases = {
        ".ultra/.runtime/compact-snapshot.md": True,
        ".ultra/.runtime/mid-workflow-recall-state.json": True,
        ".ultra/progress/1.json": True,
        ".ultra/.runtime/other.json": False,
        ".ultra/.runtime/mid-workflow-recall-state.json.bak": False,
        ".ultra/progress/1.md": False,
        ".ultra/contexts/task-1.md": False,
    }
    for candidate, accepted in cases.items():
        observed = common._normalized_derived_path(candidate) is not None
        assert observed is accepted, candidate
    assert (
        common._normalized_derived_path(".ultra/.runtime/../.runtime/compact-snapshot.md")
        is None
    )
