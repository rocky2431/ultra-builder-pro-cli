"""Checkpoint hooks preserve and consume a real workflow recovery snapshot."""

import json
import subprocess
import sys
from pathlib import Path


HOOK_ROOT = Path(__file__).parent.parent


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
