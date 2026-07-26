import json
import sqlite3
import subprocess
import tempfile
import unittest
from pathlib import Path


HOOK = Path(__file__).resolve().parents[1] / "active_task_context.py"
SCHEMA = Path(__file__).resolve().parents[2] / "spec" / "schemas" / "state-db.sql"


class ActiveTaskContextTest(unittest.TestCase):
    def run_hook(self, project: Path, tool_input: dict) -> dict:
        result = subprocess.run(
            ["python3", str(HOOK)],
            cwd=project,
            input=json.dumps({"cwd": str(project), "tool_input": tool_input}),
            text=True,
            capture_output=True,
            check=True,
        )
        return json.loads(result.stdout)

    def test_is_silent_for_projection_path_when_state_authority_is_absent(self):
        with tempfile.TemporaryDirectory() as raw:
            project = Path(raw)
            ultra = project / ".ultra"
            ultra.mkdir()

            output = self.run_hook(project, {"file_path": ".ultra/tasks/tasks.json"})
            self.assertEqual(output, {})

    def test_ignores_legacy_workflow_projection_without_state_authority(self):
        with tempfile.TemporaryDirectory() as raw:
            project = Path(raw)
            ultra = project / ".ultra"
            ultra.mkdir()
            (ultra / "workflow-state.json").write_text(json.dumps({
                "command": "ultra-dev", "task_id": "projection-task",
                "step": "wrong", "status": "active",
            }))

            output = self.run_hook(project, {"file_path": "src/example.js"})
            self.assertEqual(output, {})

    def test_is_noop_without_active_workflow(self):
        with tempfile.TemporaryDirectory() as raw:
            project = Path(raw)
            output = self.run_hook(project, {"file_path": ".ultra/tasks/tasks.json"})
            self.assertEqual(output, {})

    def test_denies_projection_write_for_initialized_ultra_project_without_workflow(self):
        with tempfile.TemporaryDirectory() as raw:
            project = Path(raw)
            ultra = project / ".ultra"
            ultra.mkdir()
            (ultra / "state.db").touch()

            output = self.run_hook(project, {"file_path": ".ultra/tasks/tasks.json"})
            hook = output["hookSpecificOutput"]
            self.assertEqual(hook["permissionDecision"], "deny")
            self.assertIn("projection", hook["permissionDecisionReason"])

    def test_injects_compact_db_breadcrumb_before_an_edit(self):
        with tempfile.TemporaryDirectory() as raw:
            project = Path(raw)
            ultra = project / ".ultra"
            ultra.mkdir()
            with sqlite3.connect(ultra / "state.db") as conn:
                conn.executescript(SCHEMA.read_text(encoding="utf-8"))
                conn.execute(
                    """INSERT INTO baselines
                       (id, project_name, mode, status, approved_by, approval_note, converged_at)
                       VALUES ('test-baseline', 'fixture', 'migrated', 'ready',
                               'test', 'legacy fixture', '2026-01-01T00:00:00.000Z')"""
                )
                conn.execute(
                    """INSERT INTO changes
                       (id, title, kind, status, intent, docs_impact_json,
                        provider_refs_json, artifact_root)
                       VALUES ('edit-change', 'Edit change', 'quick', 'active', 'Edit safely',
                               '{"status":"none","files":[],"rationale":"fixture"}', '{}',
                               '.ultra/changes/active/edit-change')"""
                )
                conn.execute(
                    """INSERT INTO tasks
                       (id, title, type, priority, status, change_id)
                       VALUES ('edit-task', 'Edit safely', 'feature', 'P0', 'in_progress', 'edit-change')"""
                )
                context = {
                    "readiness": {"status": "ready", "blockers": []},
                    "context": {
                        "items": [], "budget": {"max_tokens": 12000, "max_files": 12},
                        "token_estimate": 0, "file_count": 0,
                    },
                    "resume": {"task_id": "edit-task", "task_status": "in_progress"},
                    "baseline": {
                        "id": "test-baseline", "mode": "migrated", "status": "ready",
                        "repository_revision": None, "health": "pass", "warnings": [],
                    },
                }
                conn.execute(
                    """INSERT INTO context_snapshots
                       (id, change_id, task_id, manifest_path, manifest_hash, role, gate,
                        next_action, readiness, blockers_json, context_json)
                       VALUES ('ctx-edit', 'edit-change', 'edit-task',
                               '.ultra/changes/active/edit-change/context-manifest.json', ?,
                               'implement', 'implementation', 'Continue edit-task.',
                               'ready', '[]', ?)""",
                    ("b" * 64, json.dumps(context)),
                )
                conn.execute(
                    """INSERT INTO workflow_runs
                       (id, kind, subject, status, current_step, baseline_id,
                        change_id, task_id)
                       VALUES ('wf-edit', 'dev', 'Edit task', 'active', 'implement',
                               'test-baseline', 'edit-change', 'edit-task')"""
                )

            output = self.run_hook(project, {"file_path": "src/example.js"})
            context_text = output["hookSpecificOutput"]["additionalContext"]
            self.assertIn("edit-task", context_text)
            self.assertIn("Gate: implementation", context_text)
            self.assertIn("BASELINE_MIGRATION_REVIEW_REQUIRED", context_text)
            self.assertIn("CONTEXT_SNAPSHOT_UPGRADE_REQUIRED", context_text)
            self.assertIn("Allowed transitions:", context_text)
            self.assertIn("change.context", context_text)
            self.assertIn("ultra-doctor", context_text)
            self.assertNotIn("Required transition:", context_text)
            self.assertNotIn("Edit safely", context_text)


if __name__ == "__main__":
    unittest.main()
