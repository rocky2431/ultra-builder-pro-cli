import json
import subprocess
import tempfile
import unittest
from pathlib import Path


HOOK = Path(__file__).resolve().parents[1] / "active_task_context.py"


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

    def test_denies_direct_projection_write_during_active_workflow(self):
        with tempfile.TemporaryDirectory() as raw:
            project = Path(raw)
            ultra = project / ".ultra"
            ultra.mkdir()
            (ultra / "workflow-state.json").write_text(json.dumps({
                "command": "ultra-plan", "task_id": "plan", "step": "persist", "status": "active"
            }))

            output = self.run_hook(project, {"file_path": ".ultra/tasks/tasks.json"})
            hook = output["hookSpecificOutput"]
            self.assertEqual(hook["permissionDecision"], "deny")
            self.assertIn(".ultra/state.db", hook["permissionDecisionReason"])

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


if __name__ == "__main__":
    unittest.main()
