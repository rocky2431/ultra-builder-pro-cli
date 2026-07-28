"""Compaction recovery is a read-only projection of the canonical DB breadcrumb."""

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


def seed_active_context(project: Path) -> Path:
    ultra = project / ".ultra"
    ultra.mkdir()
    runtime = ultra / ".runtime"
    runtime.mkdir()
    db_path = runtime / "state.db"
    with sqlite3.connect(db_path) as conn:
        conn.executescript(SCHEMA.read_text(encoding="utf-8"))
        conn.execute(
            """INSERT INTO baselines
               (id, project_name, mode, status, approved_by, approval_note, converged_at)
               VALUES ('baseline', 'fixture', 'greenfield', 'ready',
                       'test', 'fixture', '2026-01-01T00:00:00.000Z')"""
        )
        conn.execute(
            """INSERT INTO changes
               (id, title, kind, status, intent, docs_impact_json,
                provider_refs_json, artifact_root)
               VALUES ('change-checkpoint', 'Checkpoint', 'quick', 'active',
                       'Recover one DB breadcrumb',
                       '{"status":"none","rationale":"fixture"}', '{}',
                       '.ultra/changes/active/change-checkpoint')"""
        )
        conn.execute(
            """INSERT INTO tasks
               (id, title, type, priority, status, change_id)
               VALUES ('task-checkpoint', 'Checkpoint task', 'bugfix', 'P0',
                       'in_progress', 'change-checkpoint')"""
        )
        context = {
            "readiness": {"status": "ready", "blockers": []},
            "context": {
                "items": [], "budget": {"max_tokens": 12000, "max_files": 12},
                "token_estimate": 0, "file_count": 0,
            },
            "resume": {"task_id": "task-checkpoint", "task_status": "in_progress"},
            "baseline": {"id": "baseline", "mode": "greenfield", "status": "ready"},
        }
        conn.execute(
            """INSERT INTO context_snapshots
               (id, change_id, task_id, manifest_path, manifest_hash, role, gate,
                next_action, readiness, blockers_json, context_json)
               VALUES ('context-checkpoint', 'change-checkpoint', 'task-checkpoint',
                       '.ultra/changes/active/change-checkpoint/context-manifest.json', ?,
                       'implement', 'implementation', 'Run the checkpoint regression test.',
                       'ready', '[]', ?)""",
            ("a" * 64, json.dumps(context)),
        )
        conn.execute(
            """INSERT INTO workflow_runs
               (id, kind, subject, status, current_step, baseline_id, change_id, task_id)
               VALUES ('wf-checkpoint', 'dev', 'Checkpoint task', 'active', 'implement',
                       'baseline', 'change-checkpoint', 'task-checkpoint')"""
        )
    return db_path


def test_checkpoint_captures_only_the_db_breadcrumb(tmp_path):
    seed_active_context(tmp_path)
    output, stderr = run_hook(
        "workflow_checkpoint.py", tmp_path, {"session_id": "session-checkpoint"}
    )
    assert stderr == ""
    assert output["systemMessage"] == "Ultra workflow checkpoint saved."
    checkpoint_file = tmp_path / ".ultra" / ".runtime" / "checkpoint.json"
    checkpoint = json.loads(checkpoint_file.read_text(encoding="utf-8"))
    assert checkpoint["schema"] == 2
    assert checkpoint["session_id"] == "session-checkpoint"
    assert checkpoint["breadcrumb"]["change_id"] == "change-checkpoint"
    assert checkpoint["breadcrumb"]["task_id"] == "task-checkpoint"
    assert checkpoint["breadcrumb"]["workflow"]["id"] == "wf-checkpoint"


def test_resume_uses_live_db_and_ignores_conflicting_legacy_projection(tmp_path):
    seed_active_context(tmp_path)
    (tmp_path / ".ultra" / "workflow-state.json").write_text(json.dumps({
        "command": "ultra-dev", "task_id": "projection-task", "step": "wrong",
        "status": "active",
    }), encoding="utf-8")
    output, stderr = run_hook(
        "workflow_resume.py", tmp_path, {"hook_event_name": "PostCompact"}
    )
    assert stderr == ""
    assert "change-checkpoint" in output["additionalContext"]
    assert "task-checkpoint" in output["additionalContext"]
    assert "projection-task" not in output["additionalContext"]


def test_resume_never_recreates_workflow_state_from_a_checkpoint(tmp_path):
    seed_active_context(tmp_path)
    run_hook("workflow_checkpoint.py", tmp_path, {"session_id": "session-checkpoint"})
    state_file = tmp_path / ".ultra" / "workflow-state.json"
    assert not state_file.exists()
    output, _ = run_hook(
        "workflow_resume.py", tmp_path, {"hook_event_name": "PostCompact"}
    )
    assert "task-checkpoint" in output["additionalContext"]
    assert not state_file.exists()


def test_checkpoint_is_noop_without_an_active_change(tmp_path):
    (tmp_path / ".ultra").mkdir()
    output, _ = run_hook("workflow_checkpoint.py", tmp_path)
    assert output == {}
