"""Contract tests for the Ultra workflow-only Stop hook."""

import json
import sqlite3
import subprocess
import sys
from pathlib import Path

HOOK = Path(__file__).parent.parent / "pre_stop_check.py"
SCHEMA = Path(__file__).parents[2] / "spec" / "schemas" / "state-db.sql"


def run_hook(cwd: Path, payload: dict | str):
    raw = payload if isinstance(payload, str) else json.dumps({"cwd": str(cwd), **payload})
    proc = subprocess.run(
        [sys.executable, str(HOOK)],
        input=raw,
        text=True,
        capture_output=True,
        check=True,
        cwd=cwd,
    )
    return json.loads(proc.stdout), proc.stderr


def write_active_change(root: Path, status: str = "active"):
    ultra = root / ".ultra"
    ultra.mkdir()
    with sqlite3.connect(ultra / "state.db") as conn:
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
               VALUES ('change-1', 'Stop advisory', 'quick', ?, 'Preserve state',
                       '{"status":"none","rationale":"fixture"}', '{}',
                       '.ultra/changes/active/change-1')""",
            (status,),
        )
        conn.execute(
            """INSERT INTO tasks
               (id, title, type, priority, status, change_id)
               VALUES ('task-1', 'Continue task', 'bugfix', 'P0', 'in_progress', 'change-1')"""
        )


def test_no_ultra_workflow_is_a_no_op(tmp_path):
    result, _ = run_hook(tmp_path, {})
    assert result == {}


def test_completed_change_allows_stop(tmp_path):
    write_active_change(tmp_path, "archived")
    result, _ = run_hook(tmp_path, {})
    assert result == {}


def test_active_change_is_advisory_and_never_traps_stop(tmp_path):
    write_active_change(tmp_path)
    result, stderr = run_hook(tmp_path, {})
    assert result == {}
    assert "change-1" in stderr
    assert "task-1" in stderr
    assert "ultra-change" in stderr


def test_retrigger_allows_stop_to_avoid_a_loop(tmp_path):
    write_active_change(tmp_path)
    result, _ = run_hook(tmp_path, {"stop_hook_active": True})
    assert result == {}


def test_malformed_input_fails_open_with_diagnostic(tmp_path):
    result, stderr = run_hook(tmp_path, "not-json")
    assert result == {}
    assert "invalid hook input" in stderr
