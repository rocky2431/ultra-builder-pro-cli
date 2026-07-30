"""Session-start hooks cover baseline, active change, and degraded runtime state."""

import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest


HOOK_ROOT = Path(__file__).parent.parent
SCHEMA = HOOK_ROOT.parent / "spec" / "schemas" / "state-db.sql"
sys.path.insert(0, str(HOOK_ROOT))
from context_envelope import ContextEnvelopeError, find_root  # noqa: E402
from runtime_paths import RuntimePathError, state_db_path  # noqa: E402


def run_hook(name: str, cwd: Path, env: dict[str, str] | None = None):
    hook_env = os.environ.copy()
    hook_env.pop("UBP_DB_PATH", None)
    hook_env.pop("UBP_ROOT_DIR", None)
    if env:
        hook_env.update(env)
    proc = subprocess.run(
        [sys.executable, str(HOOK_ROOT / name)],
        input=json.dumps({"cwd": str(cwd)}),
        text=True,
        capture_output=True,
        check=True,
        cwd=cwd,
        env=hook_env,
    )
    return json.loads(proc.stdout), proc.stderr


def init_db(project: Path, baseline: str | None = "greenfield") -> Path:
    runtime = project / ".ultra" / ".runtime"
    runtime.mkdir(parents=True)
    db_path = runtime / "state.db"
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


def seed_workflow(
    db_path: Path,
    *,
    kind: str = "research",
    baseline_id: str | None = None,
    change_id: str | None = None,
    task_id: str | None = None,
) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """INSERT INTO workflow_runs
               (id, kind, subject, status, current_step, baseline_id, change_id, task_id)
               VALUES (?, ?, 'Explicit hook fixture', 'active', 'fixture-step', ?, ?, ?)""",
            (f"wf-{kind}", kind, baseline_id, change_id, task_id),
        )


def registered_worktree(authority: Path, sid: str = "sess-hook") -> tuple[Path, Path]:
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=authority, check=True)
    subprocess.run(
        ["git", "config", "user.email", "hook@example.invalid"],
        cwd=authority,
        check=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "Hook Test"],
        cwd=authority,
        check=True,
    )
    (authority / ".gitignore").write_text(".ultra/.runtime\n", encoding="utf-8")
    specs = authority / ".ultra" / "specs"
    specs.mkdir(parents=True)
    (specs / "product.md").write_text("# Product\n", encoding="utf-8")
    (authority / "README.md").write_text("# Authority\n", encoding="utf-8")
    if os.name != "nt":
        (authority / "README.link").symlink_to("README.md")
    subprocess.run(["git", "add", "-A"], cwd=authority, check=True)
    subprocess.run(
        ["git", "commit", "-q", "-m", "seed"], cwd=authority, check=True
    )
    db_path = init_db(authority)
    worktree = authority / ".ultra" / ".runtime" / "worktrees" / sid
    worktree.parent.mkdir(parents=True)
    subprocess.run(
        ["git", "worktree", "add", "--detach", str(worktree), "HEAD"],
        cwd=authority,
        check=True,
    )
    (worktree / ".ultra" / ".runtime").symlink_to(
        db_path.parent, target_is_directory=True
    )
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """INSERT INTO tasks (id, title, type, priority, status)
               VALUES ('hook-task', 'Hook task', 'feature', 'P1', 'pending')"""
        )
        connection.execute(
            """INSERT INTO sessions
               (sid, task_id, runtime, worktree_path, artifact_dir, status,
                lease_expires_at)
               VALUES (?, 'hook-task', 'codex', ?, ?, 'running', ?)""",
            (
                sid,
                str(worktree),
                str(db_path.parent / "sessions" / sid),
                "2099-01-01T00:00:00.000Z",
            ),
        )
    return worktree, db_path


def test_context_is_noop_outside_an_ultra_project(tmp_path):
    output, stderr = run_hook("workflow_context.py", tmp_path)
    assert output == {}
    assert stderr == ""


def test_configured_db_does_not_turn_an_unrelated_cwd_into_the_project_root(tmp_path):
    authority = tmp_path / "authority"
    unrelated = tmp_path / "unrelated"
    authority.mkdir()
    unrelated.mkdir()
    db_path = init_db(authority)
    seed_workflow(db_path, baseline_id="test-baseline")

    output, stderr = run_hook(
        "workflow_context.py",
        unrelated,
        {"UBP_DB_PATH": str(db_path)},
    )

    assert output == {}
    assert "does not name this project's canonical or task-linked authority" in stderr


def test_explicit_root_allows_a_worktree_to_use_external_authority(tmp_path):
    authority = tmp_path / "authority"
    authority.mkdir()
    worktree, db_path = registered_worktree(authority)
    nested = worktree / "src" / "feature"
    nested.mkdir(parents=True)
    seed_workflow(db_path, baseline_id="test-baseline")

    output, stderr = run_hook(
        "workflow_context.py",
        nested,
        {
            "UBP_ROOT_DIR": str(worktree),
            "UBP_DB_PATH": str(db_path),
        },
    )

    assert stderr == ""
    text = output["hookSpecificOutput"]["additionalContext"]
    assert "[Ultra Context Envelope]" in text
    assert "Baseline: test-baseline (greenfield/ready)" in text


def test_explicit_root_rejects_an_unlinked_external_authority(tmp_path, monkeypatch):
    authority = tmp_path / "authority"
    project = tmp_path / "project"
    authority.mkdir()
    project.mkdir()
    db_path = init_db(authority)
    monkeypatch.setenv("UBP_ROOT_DIR", str(project))
    monkeypatch.setenv("UBP_DB_PATH", str(db_path))

    with pytest.raises(RuntimePathError, match="authority|project"):
        state_db_path(project)


def test_python_read_paths_refuse_competing_legacy_and_runtime_databases(tmp_path, monkeypatch):
    runtime = tmp_path / ".ultra" / ".runtime"
    runtime.mkdir(parents=True)
    legacy = tmp_path / ".ultra" / "state.db"  # runtime-path-compatibility fixture
    current = runtime / "state.db"
    legacy.write_text("legacy", encoding="utf-8")
    current.write_text("runtime", encoding="utf-8")
    monkeypatch.delenv("UBP_DB_PATH", raising=False)
    monkeypatch.delenv("UBP_ROOT_DIR", raising=False)

    with pytest.raises(RuntimePathError, match="both legacy"):
        state_db_path(tmp_path)
    with pytest.raises(ContextEnvelopeError, match="both legacy"):
        find_root(tmp_path)
    output, stderr = run_hook("workflow_context.py", tmp_path)
    assert output == {}
    assert "both legacy" in stderr


def test_python_read_paths_accept_the_managed_legacy_migration_tombstone(
    tmp_path, monkeypatch
):
    runtime = tmp_path / ".ultra" / ".runtime"
    runtime.mkdir(parents=True)
    current = runtime / "state.db"
    current.write_text("runtime", encoding="utf-8")
    tombstone = tmp_path / ".ultra" / "state.db"  # runtime-path-compatibility
    tombstone.write_text(
        json.dumps(
            {
                "version": 1,
                "kind": "ultra-state-migration-tombstone",
                "canonical_state_db": ".runtime/state.db",
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.delenv("UBP_DB_PATH", raising=False)
    monkeypatch.delenv("UBP_ROOT_DIR", raising=False)

    assert state_db_path(tmp_path) == current
    assert find_root(tmp_path) == tmp_path


def test_python_read_paths_reject_symlinked_ultra_and_unapproved_runtime_links(
    tmp_path, monkeypatch
):
    outside = tmp_path / "outside"
    outside.mkdir()
    full_link_root = tmp_path / "full-link"
    full_link_root.mkdir()
    (full_link_root / ".ultra").symlink_to(outside, target_is_directory=True)
    monkeypatch.delenv("UBP_DB_PATH", raising=False)
    monkeypatch.delenv("UBP_ROOT_DIR", raising=False)

    with pytest.raises(RuntimePathError, match="may not be a symlink"):
        state_db_path(full_link_root)

    authority = tmp_path / "authority"
    worktree = tmp_path / "worktree"
    authority.mkdir()
    (worktree / ".ultra").mkdir(parents=True)
    db_path = init_db(authority)
    (worktree / ".ultra" / ".runtime").symlink_to(
        db_path.parent, target_is_directory=True
    )
    with pytest.raises(RuntimePathError, match="may not be a symlink"):
        state_db_path(worktree)

    monkeypatch.setenv("UBP_DB_PATH", str(db_path))
    with pytest.raises(RuntimePathError, match="bound|registered|managed"):
        state_db_path(worktree)


@pytest.mark.skipif(os.name == "nt", reason="tracked symlink fixture is POSIX-only")
def test_python_runtime_validation_keeps_registered_worktree_contents_opaque(tmp_path):
    authority = tmp_path / "authority"
    authority.mkdir()
    registered_worktree(authority)
    from runtime_paths import validate_project_layout

    validate_project_layout(authority, validate_runtime_tree=True)


@pytest.mark.parametrize(
    ("entry", "kind", "message"),
    [
        ("main", "symlink", "regular file"),
        ("main", "directory", "regular file"),
        ("-wal", "orphan", "without state.db"),
        ("-wal", "symlink", "regular file"),
        ("-shm", "directory", "regular file"),
    ],
)
def test_python_configured_authority_validates_main_and_sidecars_before_resolution(
    tmp_path, monkeypatch, entry, kind, message
):
    project = tmp_path / "project"
    authority = tmp_path / "authority"
    project.mkdir()
    authority.mkdir()
    configured = authority / "state.db"
    candidate = configured if entry == "main" else Path(f"{configured}{entry}")
    outside = authority / "outside"

    if entry != "main" and kind != "orphan":
        configured.write_text("main", encoding="utf-8")
    if kind == "symlink":
        outside.write_text("outside", encoding="utf-8")
        candidate.symlink_to(outside)
    elif kind == "directory":
        candidate.mkdir()
    elif kind == "orphan":
        candidate.write_text("orphan", encoding="utf-8")

    monkeypatch.setenv("UBP_DB_PATH", str(configured))
    monkeypatch.delenv("UBP_ROOT_DIR", raising=False)
    with pytest.raises(RuntimePathError, match=message):
        state_db_path(project)


@pytest.mark.parametrize(
    "relative",
    [
        "telemetry/events.jsonl",
        "sessions/session/metadata.json",
        "collab/review.json",
        "worktrees/session/marker",
        "backups/state.db",
        "debug/trace.jsonl",
        "checkpoint.json",
        "orchestrator/orchestrator.pid",
        "orchestrator/orchestrator.log",
    ],
)
def test_python_mutation_preflight_rejects_unsafe_runtime_entries(
    tmp_path, monkeypatch, relative
):
    project = tmp_path / "project"
    outside = tmp_path / "outside"
    runtime = project / ".ultra" / ".runtime"
    candidate = runtime / relative
    candidate.parent.mkdir(parents=True, exist_ok=True)
    outside.write_text("outside", encoding="utf-8")
    candidate.symlink_to(outside)
    monkeypatch.delenv("UBP_DB_PATH", raising=False)
    monkeypatch.delenv("UBP_ROOT_DIR", raising=False)

    from runtime_paths import validate_project_layout

    with pytest.raises(RuntimePathError, match="symlink|regular"):
        validate_project_layout(project, validate_runtime_tree=True)
    assert outside.read_text(encoding="utf-8") == "outside"


def test_all_session_hooks_are_silent_for_an_uninitialized_ultra_directory(tmp_path):
    (tmp_path / ".ultra").mkdir()
    for name in ["workflow_context.py", "workflow_resume.py", "health_check.py"]:
        output, stderr = run_hook(name, tmp_path)
        assert output == {}, name
        assert stderr == "", name


def test_context_surfaces_old_schema_as_advisory_without_using_legacy_projection(tmp_path):
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

    output, stderr = run_hook("workflow_context.py", tmp_path)
    text = output["hookSpecificOutput"]["additionalContext"]
    assert "STATE_SCHEMA_MIGRATION_REQUIRED" in text
    assert "projection-task" not in text
    assert stderr == ""


def test_context_injects_idle_baseline_authority(tmp_path):
    init_db(tmp_path, baseline="migrated")
    output, stderr = run_hook("workflow_context.py", tmp_path)
    text = output["hookSpecificOutput"]["additionalContext"]
    assert "[Ultra Context Envelope]" in text
    assert "Baseline: test-baseline (migrated/ready)" in text
    assert stderr == ""


def test_context_routes_an_explicit_active_brownfield_research_workflow(tmp_path):
    db_path = init_db(tmp_path, baseline=None)
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """INSERT INTO baselines (id, project_name, mode, status)
               VALUES ('adoption', 'legacy', 'brownfield', 'adopting')"""
        )
    seed_workflow(db_path, baseline_id="adoption")
    output, _ = run_hook("workflow_context.py", tmp_path)
    text = output["hookSpecificOutput"]["additionalContext"]
    assert "Baseline: adoption (brownfield/adopting)" in text
    assert "BASELINE_NOT_READY:adopting" in text
    assert "Use ultra.context" in text


def test_context_reports_an_open_semantic_gap_without_routing_the_workflow(tmp_path):
    db_path = init_db(tmp_path)
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "UPDATE baselines SET gaps_json = ? WHERE id = 'test-baseline'",
            (json.dumps([{
                "id": "incident-reconciliation", "category": "baseline_blocker",
                "status": "open", "blocking": True, "summary": "Reconcile incident",
                "evidence_refs": [],
            }]),),
        )
    seed_workflow(db_path, baseline_id="test-baseline")
    output, _ = run_hook("workflow_context.py", tmp_path)
    text = output["hookSpecificOutput"]["additionalContext"]
    assert "Warnings: BASELINE_GAP_RECORDED:incident-reconciliation" in text
    assert "BASELINE_GAP_BLOCKING" not in text
    assert "Use ultra.context" in text


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
        conn.execute(
            """INSERT INTO workflow_runs
               (id, kind, subject, status, current_step, baseline_id, change_id, task_id)
               VALUES ('wf-dev', 'dev', 'Explicit dev', 'active', 'implement',
                       'test-baseline', 'daily-fix', 'daily-task')"""
        )
    output, _ = run_hook("workflow_context.py", tmp_path)
    text = output["hookSpecificOutput"]["additionalContext"]
    assert "Ultra Context Envelope" in text
    assert "daily-fix" in text
    assert "daily-task" in text
    assert "BASELINE_NOT_READY:adopting" in text
    assert "Use ultra.context" in text
    assert "Fix daily drift" not in text
    assert "cloud-mem" not in text


def test_health_inspects_state_only_during_an_active_workflow(tmp_path):
    db_path = init_db(tmp_path)
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """INSERT INTO incidents
               (id, code, severity, retryable, message)
               VALUES ('inc-1', 'PROJECTION_FAILED', 'error', 1, 'projection failed')"""
        )
    seed_workflow(db_path, baseline_id="test-baseline")
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


def test_health_does_not_degrade_for_an_accepted_baseline_semantic_gap(tmp_path):
    db_path = init_db(tmp_path)
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "UPDATE baselines SET gaps_json = ? WHERE id = 'test-baseline'",
            (json.dumps([{
                "id": "missing-evidence",
                "category": "baseline_blocker",
                "status": "open",
                "blocking": True,
                "summary": "Restore baseline authority",
                "evidence_refs": [],
            }]),),
        )
    seed_workflow(db_path, baseline_id="test-baseline")

    output, stderr = run_hook("health_check.py", tmp_path)

    assert output == {}
    assert stderr == ""


def test_health_degrades_when_an_active_workflow_loses_structural_baseline_authority(tmp_path):
    db_path = init_db(tmp_path)
    seed_workflow(db_path, baseline_id="test-baseline")
    (tmp_path / ".ultra" / "specs" / "product.md").write_text(
        "# product\n\nDrifted after acceptance.\n",
        encoding="utf-8",
    )

    output, stderr = run_hook("health_check.py", tmp_path)

    assert output == {}
    assert '"status": "degraded"' in stderr
    assert '"status": "fail"' in stderr
    assert "BASELINE_SPEC_STALE:.ultra/specs/product.md" in stderr


def test_health_is_silent_when_workflow_authority_cannot_be_proven(tmp_path):
    db_path = init_db(tmp_path)
    with sqlite3.connect(db_path) as conn:
        conn.execute("DROP TABLE workflow_steps")
        conn.execute("DROP TABLE workflow_runs")

    output, stderr = run_hook("health_check.py", tmp_path)

    assert output == {}
    assert stderr == ""
