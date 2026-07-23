"""Session-start hooks cover baseline, active change, and degraded runtime state."""

import json
import sqlite3
import subprocess
import sys
from pathlib import Path


HOOK_ROOT = Path(__file__).parent.parent
SCHEMA = HOOK_ROOT.parent / "spec" / "schemas" / "state-db.sql"


def run_hook(name: str, cwd: Path):
    proc = subprocess.run(
        [sys.executable, str(HOOK_ROOT / name)],
        input=json.dumps({"cwd": str(cwd)}),
        text=True,
        capture_output=True,
        check=True,
        cwd=cwd,
    )
    return json.loads(proc.stdout), proc.stderr


def init_db(project: Path, baseline: str | None = "greenfield") -> Path:
    ultra = project / ".ultra"
    ultra.mkdir()
    db_path = ultra / "state.db"
    with sqlite3.connect(db_path) as conn:
        conn.executescript(SCHEMA.read_text(encoding="utf-8"))
        if baseline == "migrated":
            conn.execute(
                """INSERT INTO baselines
                   (id, project_name, mode, status, approved_by, approval_note,
                    research_run_id, converged_at)
                   VALUES ('test-baseline', 'fixture', ?, 'ready',
                           'test', 'fixture baseline', 'research-fixture',
                           '2026-01-01T00:00:00.000Z')""",
                (baseline,),
            )
    if baseline is not None and baseline != "migrated":
        helper = HOOK_ROOT.parent / "mcp-server" / "test-support" / "ready-baseline.cjs"
        script = (
            "const Database=require('better-sqlite3');"
            "const helper=require(process.argv[1]);"
            "const db=new Database(process.argv[2]);"
            "helper.seedReadyBaseline(db,{rootDir:process.argv[3],mode:process.argv[4]});"
            "db.close();"
        )
        subprocess.run(
            ["node", "-e", script, str(helper), str(db_path), str(project), baseline],
            check=True,
            cwd=HOOK_ROOT.parent,
        )
    return db_path


def test_context_is_noop_outside_an_ultra_project(tmp_path):
    output, _ = run_hook("workflow_context.py", tmp_path)
    assert output == {}


def test_context_routes_an_old_schema_to_init_and_ignores_legacy_projection(tmp_path):
    ultra = tmp_path / ".ultra"
    ultra.mkdir()
    with sqlite3.connect(ultra / "state.db") as conn:
        conn.execute(
            """CREATE TABLE schema_version (
                   version TEXT PRIMARY KEY,
                   applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
               )"""
        )
        conn.execute("INSERT INTO schema_version(version) VALUES ('10.0')")
    (ultra / "workflow-state.json").write_text(json.dumps({
        "command": "ultra-dev", "task_id": "projection-task", "status": "active",
    }), encoding="utf-8")

    output, _ = run_hook("workflow_context.py", tmp_path)
    text = output["hookSpecificOutput"]["additionalContext"]
    assert "STATE_SCHEMA_MIGRATION_REQUIRED:10.0" in text
    assert "Required transition: ultra-init" in text
    assert "projection-task" not in text


def test_context_routes_migrated_baseline_to_explicit_readoption(tmp_path):
    init_db(tmp_path, baseline="migrated")
    output, _ = run_hook("workflow_context.py", tmp_path)
    text = output["hookSpecificOutput"]["additionalContext"]
    assert "BASELINE_MIGRATION_REVIEW_REQUIRED" in text
    assert "Allowed transitions: ultra-research, ultra-status, ultra-doctor" in text
    assert "Required transition:" not in text
    assert ".ultra/state.db" in text


def test_context_routes_incomplete_brownfield_baseline_to_adoption(tmp_path):
    db_path = init_db(tmp_path, baseline=None)
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """INSERT INTO baselines (id, project_name, mode, status)
               VALUES ('adoption', 'legacy', 'brownfield', 'adopting')"""
        )
    output, _ = run_hook("workflow_context.py", tmp_path)
    text = output["hookSpecificOutput"]["additionalContext"]
    assert "Baseline: adoption (brownfield/adopting)" in text
    assert "Readiness: blocked" in text
    assert "BASELINE_NOT_READY:adopting" in text
    assert "Allowed transitions: ultra-research, ultra-status, ultra-doctor" in text


def test_context_routes_a_ready_baseline_with_an_open_blocking_gap_to_adoption(tmp_path):
    db_path = init_db(tmp_path, baseline=None)
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """INSERT INTO baselines
               (id, project_name, mode, status, gaps_json, approved_by, approval_note)
               VALUES ('gap-baseline', 'legacy', 'brownfield', 'ready', ?, 'owner', 'accepted')""",
            (json.dumps([{
                "id": "incident-reconciliation", "category": "baseline_blocker",
                "status": "open", "blocking": True, "summary": "Reconcile incident",
                "evidence_refs": [],
            }]),),
        )
    output, _ = run_hook("workflow_context.py", tmp_path)
    text = output["hookSpecificOutput"]["additionalContext"]
    assert "BASELINE_GAP_BLOCKING:incident-reconciliation" in text
    assert "Allowed transitions: ultra-research, ultra-status, ultra-doctor" in text


def test_context_injects_active_change_without_workflow_state(tmp_path):
    db_path = init_db(tmp_path)
    artifact = tmp_path / ".ultra" / "changes" / "active" / "daily-fix"
    artifact.mkdir(parents=True)
    (artifact / "context-manifest.json").write_text("{}\n", encoding="utf-8")
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "UPDATE baselines SET mode = 'brownfield', status = 'adopting' WHERE id = 'test-baseline'"
        )
        conn.execute(
            """INSERT INTO changes
               (id, title, kind, status, intent, docs_impact_json,
                provider_refs_json, artifact_root)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                "daily-fix", "Daily fix", "quick", "active", "Fix daily drift",
                '{"status":"none","files":[],"rationale":"code-only fix"}',
                '{"memory":{"provider":"cloud-mem","status":"available"}}',
                ".ultra/changes/active/daily-fix",
            ),
        )
        conn.execute(
            """INSERT INTO tasks
               (id, title, type, priority, status, change_id)
               VALUES ('daily-task', 'Fix daily drift', 'bugfix', 'P0', 'in_progress', 'daily-fix')"""
        )
        context = {
            "role": "implement",
            "gate": "implementation",
                "next_action": "Run the exact regression test for daily-task.",
                "readiness": {"status": "ready", "blockers": []},
                "context": {
                    "items": [], "budget": {"max_tokens": 12000, "max_files": 12},
                    "token_estimate": 0, "file_count": 0,
                },
                "resume": {"task_id": "daily-task", "task_status": "in_progress"},
                "baseline": {
                    "id": "test-baseline", "mode": "migrated", "status": "ready",
                    "repository_revision": None, "health": "pass", "warnings": [],
                },
        }
        conn.execute(
            """INSERT INTO context_snapshots
               (id, change_id, task_id, manifest_path, manifest_hash, role, gate,
                next_action, readiness, blockers_json, context_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                "ctx-daily", "daily-fix", "daily-task",
                ".ultra/changes/active/daily-fix/context-manifest.json", "a" * 64,
                "implement", "implementation", "Run the exact regression test for daily-task.",
                "ready", "[]", json.dumps(context),
            ),
        )
    output, _ = run_hook("workflow_context.py", tmp_path)
    text = output["hookSpecificOutput"]["additionalContext"]
    assert "Ultra context spine" in text
    assert "daily-fix" in text
    assert "daily-task" in text
    assert "Role: implement" in text
    assert "Gate: implementation" in text
    assert "Readiness: blocked" in text
    assert "CONTEXT_SNAPSHOT_UPGRADE_REQUIRED" in text
    assert "Blockers: BASELINE_NOT_READY:adopting" in text
    assert "Allowed transitions:" in text
    assert "Required transition:" not in text
    assert "Fix daily drift" not in text
    assert "cloud-mem" not in text


def test_health_inspects_state_without_active_workflow(tmp_path):
    db_path = init_db(tmp_path)
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """INSERT INTO incidents
               (id, code, severity, retryable, message)
               VALUES ('inc-1', 'PROJECTION_FAILED', 'error', 1, 'projection failed')"""
        )
    output, stderr = run_hook("health_check.py", tmp_path)
    assert output == {}
    assert "PROJECTION_FAILED" in stderr
    assert '"status": "degraded"' in stderr


def test_health_is_silent_for_healthy_state(tmp_path):
    init_db(tmp_path)
    output, stderr = run_hook("health_check.py", tmp_path)
    assert output == {}
    assert stderr == ""


def test_health_does_not_misclassify_incomplete_baseline_as_runtime_failure(tmp_path):
    db_path = init_db(tmp_path, baseline=None)
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """INSERT INTO baselines (id, project_name, mode, status)
               VALUES ('adoption', 'legacy', 'brownfield', 'blocked')"""
        )
    output, stderr = run_hook("health_check.py", tmp_path)
    assert output == {}
    assert stderr == ""


def test_health_degrades_when_a_ready_baseline_has_lost_authority(tmp_path):
    db_path = init_db(tmp_path, baseline=None)
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """INSERT INTO baselines
               (id, project_name, mode, status, gaps_json,
                approved_by, approval_note, converged_at)
               VALUES ('ready-but-invalid', 'legacy', 'brownfield', 'ready', ?,
                       'owner', 'accepted', '2026-01-01T00:00:00.000Z')""",
            (json.dumps([{
                "id": "missing-evidence",
                "category": "baseline_blocker",
                "status": "open",
                "blocking": True,
                "summary": "Restore baseline authority",
                "evidence_refs": [],
            }]),),
        )

    output, stderr = run_hook("health_check.py", tmp_path)

    assert output == {}
    assert '"status": "degraded"' in stderr
    assert '"status": "fail"' in stderr
    assert "BASELINE_GAP_BLOCKING:missing-evidence" in stderr


def test_health_requires_workflow_authority_tables(tmp_path):
    db_path = init_db(tmp_path)
    with sqlite3.connect(db_path) as conn:
        conn.execute("DROP TABLE workflow_steps")
        conn.execute("DROP TABLE workflow_runs")

    output, stderr = run_hook("health_check.py", tmp_path)

    assert output == {}
    assert '"status": "degraded"' in stderr
    assert "workflow_runs" in stderr
    assert "workflow_steps" in stderr
