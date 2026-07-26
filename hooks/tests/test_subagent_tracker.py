"""Contract tests for DB-backed, content-minimal subagent lifecycle hooks."""

import json
import sqlite3
import subprocess
import sys
from pathlib import Path

HOOK = Path(__file__).parent.parent / "subagent_tracker.py"
SCHEMA = Path(__file__).parents[2] / "spec" / "schemas" / "state-db.sql"


def seed_active_change(root: Path):
    ultra = root / ".ultra"
    ultra.mkdir()
    with sqlite3.connect(ultra / "state.db") as conn:
        conn.executescript(SCHEMA.read_text(encoding="utf-8"))
        conn.execute(
            """INSERT INTO changes
               (id, title, kind, status, intent, artifact_root)
               VALUES ('hook-change', 'Hook change', 'standard', 'active',
                       'Track lifecycle.', '.ultra/changes/active/hook-change')"""
        )
        conn.execute(
            """INSERT INTO tasks
               (id, title, type, priority, status, change_id)
               VALUES ('hook-task', 'Hook task', 'feature', 'P1', 'in_progress',
                       'hook-change')"""
        )
        conn.execute(
            """INSERT INTO workflow_runs
               (id, kind, subject, status, current_step, change_id, task_id)
               VALUES ('wf-hook', 'review', 'Track worker lifecycle', 'active',
                       'run-review', 'hook-change', 'hook-task')"""
        )


def run_hook(root: Path, action: str, payload: dict):
    result = subprocess.run(
        [sys.executable, str(HOOK), action],
        cwd=root,
        input=json.dumps({"cwd": str(root), **payload}),
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(result.stdout), result.stderr


def test_lifecycle_event_uses_state_db_and_excludes_transcript_metadata(tmp_path):
    seed_active_change(tmp_path)
    output, stderr = run_hook(tmp_path, "stop", {
        "agent_id": "agent-1",
        "agent_type": "review-code",
        "session_id": "host-session",
        "agent_transcript_path": "/private/transcript.jsonl",
        "last_assistant_message": "private message",
    })
    assert output == {}
    assert stderr == ""
    with sqlite3.connect(tmp_path / ".ultra" / "state.db") as conn:
        event_type, change_id, task_id, raw = conn.execute(
            """SELECT type, change_id, task_id, payload_json FROM events
               WHERE type = 'subagent_stopped'"""
        ).fetchone()
    assert event_type == "subagent_stopped"
    assert change_id == "hook-change"
    assert task_id == "hook-task"
    assert json.loads(raw) == {
        "agent_id": "agent-1",
        "agent_type": "review-code",
        "host_session_id": "host-session",
    }
    assert "transcript" not in raw
    assert "private message" not in raw
    assert not (tmp_path / ".ultra" / "runtime" / "subagent-log.jsonl").exists()


def test_idle_project_is_a_no_op(tmp_path):
    ultra = tmp_path / ".ultra"
    ultra.mkdir()
    with sqlite3.connect(ultra / "state.db") as conn:
        conn.executescript(SCHEMA.read_text(encoding="utf-8"))
    output, _ = run_hook(tmp_path, "start", {"agent_id": "idle"})
    assert output == {}
    with sqlite3.connect(ultra / "state.db") as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM events WHERE type LIKE 'subagent_%'"
        ).fetchone()[0] == 0


def test_active_change_without_active_workflow_is_a_no_op(tmp_path):
    ultra = tmp_path / ".ultra"
    ultra.mkdir()
    with sqlite3.connect(ultra / "state.db") as conn:
        conn.executescript(SCHEMA.read_text(encoding="utf-8"))
        conn.execute(
            """INSERT INTO changes
               (id, title, kind, status, intent, artifact_root)
               VALUES ('idle-change', 'Idle change', 'quick', 'active',
                       'Wait for invocation.', '.ultra/changes/active/idle-change')"""
        )
    output, stderr = run_hook(tmp_path, "start", {"agent_id": "idle-change-agent"})
    assert output == {}
    assert stderr == ""
    with sqlite3.connect(ultra / "state.db") as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM events WHERE type LIKE 'subagent_%'"
        ).fetchone()[0] == 0
