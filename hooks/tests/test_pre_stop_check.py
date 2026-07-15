"""Contract tests for the Ultra workflow-only Stop hook."""

import json
import subprocess
import sys
from pathlib import Path

HOOK = Path(__file__).parent.parent / "pre_stop_check.py"


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


def write_state(root: Path, status: str):
    ultra = root / ".ultra"
    ultra.mkdir()
    (ultra / "workflow-state.json").write_text(json.dumps({
        "command": "ultra-dev",
        "task_id": "task-1",
        "step": "4.5",
        "status": status,
    }))


def test_no_ultra_workflow_is_a_no_op(tmp_path):
    result, _ = run_hook(tmp_path, {})
    assert result == {}


def test_completed_workflow_allows_stop(tmp_path):
    write_state(tmp_path, "completed")
    result, _ = run_hook(tmp_path, {})
    assert result == {}


def test_active_workflow_blocks_once_with_exact_boundary(tmp_path):
    write_state(tmp_path, "review_pending")
    result, _ = run_hook(tmp_path, {})
    assert result["decision"] == "block"
    assert "ultra-dev" in result["reason"]
    assert "task-1" in result["reason"]
    assert "4.5" in result["reason"]


def test_retrigger_allows_stop_to_avoid_a_loop(tmp_path):
    write_state(tmp_path, "review_pending")
    result, _ = run_hook(tmp_path, {"stop_hook_active": True})
    assert result == {}


def test_malformed_input_fails_open_with_diagnostic(tmp_path):
    result, stderr = run_hook(tmp_path, "not-json")
    assert result == {}
    assert "invalid hook input" in stderr
