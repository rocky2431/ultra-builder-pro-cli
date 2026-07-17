"""Checkpoint hooks preserve and consume a real workflow recovery snapshot."""

import json
import sqlite3
import subprocess
import sys
from pathlib import Path


HOOK_ROOT = Path(__file__).parent.parent
SCHEMA = HOOK_ROOT.parent / "spec" / "schemas" / "state-db.sql"


def run_hook(name: str, cwd: Path, payload: dict | None = None):
    proc = subprocess.run(
        [sys.executable, str(HOOK_ROOT / name)],
        input=json.dumps({"cwd": str(cwd), **(payload or {})}),
        text=True,
        capture_output=True,
        check=True,
        cwd=cwd,
    )
    return json.loads(proc.stdout), proc.stderr


def write_state(project: Path, **patch) -> Path:
    ultra = project / ".ultra"
    ultra.mkdir(exist_ok=True)
    state = {
        "command": "ultra-dev",
        "task_id": "task-checkpoint",
        "step": "3.3",
        "status": "tdd_complete",
        "ts": "2026-07-17T08:00:00+00:00",
        **patch,
    }
    state_file = ultra / "workflow-state.json"
    state_file.write_text(json.dumps(state), encoding="utf-8")
    return state_file


def capture(project: Path):
    output, stderr = run_hook(
        "workflow_checkpoint.py", project, {"session_id": "session-checkpoint"}
    )
    assert stderr == ""
    assert output["systemMessage"] == "Ultra workflow checkpoint saved."
    return project / ".ultra" / "runtime" / "checkpoint.json"


def test_checkpoint_captures_schema_session_and_workflow(tmp_path):
    write_state(tmp_path)
    checkpoint_file = capture(tmp_path)

    checkpoint = json.loads(checkpoint_file.read_text(encoding="utf-8"))
    assert checkpoint["schema"] == 1
    assert checkpoint["session_id"] == "session-checkpoint"
    assert checkpoint["workflow"]["task_id"] == "task-checkpoint"
    assert checkpoint["workflow"]["step"] == "3.3"


def test_resume_restores_missing_live_state_from_checkpoint(tmp_path):
    state_file = write_state(tmp_path)
    capture(tmp_path)
    state_file.unlink()

    output, stderr = run_hook(
        "workflow_resume.py", tmp_path, {"hook_event_name": "PostCompact"}
    )

    assert stderr == ""
    assert "task-checkpoint" in output["additionalContext"]
    assert "source=.ultra/runtime/checkpoint.json" in output["additionalContext"]
    restored = json.loads(state_file.read_text(encoding="utf-8"))
    assert restored["step"] == "3.3"


def test_resume_keeps_a_newer_live_state_than_the_checkpoint(tmp_path):
    state_file = write_state(tmp_path, step="2", ts="2026-07-17T08:00:00+00:00")
    capture(tmp_path)
    write_state(tmp_path, step="4.5", status="pre_review", ts="2026-07-17T09:00:00+00:00")

    output, stderr = run_hook(
        "workflow_resume.py", tmp_path, {"hook_event_name": "PostCompact"}
    )

    assert stderr == ""
    assert "step=4.5" in output["additionalContext"]
    assert "source=.ultra/workflow-state.json" in output["additionalContext"]
    assert json.loads(state_file.read_text(encoding="utf-8"))["step"] == "4.5"


def test_resume_falls_back_to_live_state_when_checkpoint_is_corrupt(tmp_path):
    write_state(tmp_path, step="4")
    checkpoint_dir = tmp_path / ".ultra" / "runtime"
    checkpoint_dir.mkdir(parents=True)
    (checkpoint_dir / "checkpoint.json").write_text("not-json", encoding="utf-8")

    output, stderr = run_hook(
        "workflow_resume.py", tmp_path, {"hook_event_name": "PostCompact"}
    )

    assert "step=4" in output["additionalContext"]
    assert "source=.ultra/workflow-state.json" in output["additionalContext"]
    assert "cannot read" in stderr


def test_resume_rejects_a_non_object_checkpoint_without_crashing(tmp_path):
    write_state(tmp_path, step="4")
    checkpoint_dir = tmp_path / ".ultra" / "runtime"
    checkpoint_dir.mkdir(parents=True)
    (checkpoint_dir / "checkpoint.json").write_text("[]", encoding="utf-8")

    output, stderr = run_hook(
        "workflow_resume.py", tmp_path, {"hook_event_name": "PostCompact"}
    )

    assert "step=4" in output["additionalContext"]
    assert "invalid checkpoint schema" in stderr


def test_terminal_live_state_does_not_resurrect_an_active_checkpoint(tmp_path):
    state_file = write_state(tmp_path, step="3.3", status="tdd_complete")
    capture(tmp_path)
    write_state(
        tmp_path,
        step="6",
        status="completed",
        ts="2026-07-17T10:00:00+00:00",
    )

    output, stderr = run_hook(
        "workflow_resume.py", tmp_path, {"hook_event_name": "PostCompact"}
    )

    assert output == {}
    assert stderr == ""
    assert json.loads(state_file.read_text(encoding="utf-8"))["status"] == "completed"


def test_resume_prefers_db_context_spine_over_stale_workflow_projection(tmp_path):
    write_state(tmp_path, task_id="legacy-task", step="2", status="active")
    db_path = tmp_path / ".ultra" / "state.db"
    with sqlite3.connect(db_path) as conn:
        conn.executescript(SCHEMA.read_text(encoding="utf-8"))
        conn.execute(
            """INSERT INTO changes
               (id, title, kind, status, intent, docs_impact_json, provider_refs_json, artifact_root)
               VALUES ('daily-fix', 'Daily fix', 'quick', 'active', 'Fix drift',
                       '{"status":"none","files":[],"rationale":"fixture"}', '{}',
                       '.ultra/changes/active/daily-fix')"""
        )
        conn.execute(
            """INSERT INTO tasks
               (id, title, type, priority, status, change_id)
               VALUES ('daily-task', 'Fix drift', 'bugfix', 'P0', 'in_progress', 'daily-fix')"""
        )
        context = {
            "readiness": {"status": "ready", "blockers": []},
            "context": {
                "items": [], "budget": {"max_tokens": 12000, "max_files": 12},
                "token_estimate": 0, "file_count": 0,
            },
            "resume": {"task_id": "daily-task", "task_status": "in_progress"}
        }
        conn.execute(
            """INSERT INTO context_snapshots
               (id, change_id, task_id, manifest_path, manifest_hash, role, gate,
                next_action, readiness, blockers_json, context_json)
               VALUES ('ctx-daily', 'daily-fix', 'daily-task',
                       '.ultra/changes/active/daily-fix/context-manifest.json', ?,
                       'check', 'verification', 'Run npm test.', 'ready', '[]', ?)""",
            ("a" * 64, json.dumps(context)),
        )

    output, stderr = run_hook(
        "workflow_resume.py", tmp_path, {"hook_event_name": "PostCompact"}
    )

    assert stderr == ""
    assert "Ultra context spine" in output["additionalContext"]
    assert "daily-task" in output["additionalContext"]
    assert "Run npm test" in output["additionalContext"]
    assert "legacy-task" not in output["additionalContext"]
