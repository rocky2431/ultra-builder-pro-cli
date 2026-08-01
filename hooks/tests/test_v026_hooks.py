import hashlib
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path


HOOK_ROOT = Path(__file__).resolve().parents[1]
HOOKS = [
    "session_context.py",
    "mid_workflow_recall.py",
    "compact_context.py",
    "post_edit_guard.py",
    "block_dangerous_commands.py",
]


def load_adapter(name: str):
    file = HOOK_ROOT / "adapters" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(f"ultra_hook_adapter_{name}", file)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def run_hook(name: str, cwd: Path, payload: dict, env: dict | None = None):
    return subprocess.run(
        [sys.executable, str(HOOK_ROOT / name)],
        input=json.dumps({"cwd": str(cwd), **payload}),
        text=True,
        capture_output=True,
        cwd=cwd,
        env={**os.environ, **(env or {})},
        check=False,
    )


def make_project(tmp_path: Path) -> Path:
    ultra = tmp_path / ".ultra"
    (ultra / "contexts").mkdir(parents=True)
    (ultra / "specs").mkdir()
    (ultra / "north-star.md").write_text(
        "# North Star\n\n## One-line\nShip a real checkout path.\n\n## Hard Constraints\n- Never fake persistence.\n",
        encoding="utf-8",
    )
    (ultra / "specs" / "product.md").write_text("# Product\n\n## Checkout\nReal checkout.\n", encoding="utf-8")
    (ultra / "tasks.json").write_text(json.dumps({
        "tasks": [{
            "id": "1",
            "title": "Checkout",
            "status": "in_progress",
            "context_file": ".ultra/contexts/task-1.md",
            "trace_to": ".ultra/specs/product.md#checkout",
        }],
    }), encoding="utf-8")
    (ultra / "contexts" / "task-1.md").write_text(
        "# Task 1\n\n> **Status**: in_progress\n\n## Acceptance Criteria\n\n- [ ] Public checkout returns 201.\n\n## Resume Note\n\nWrite the public-seam regression.\n\n## Completion\n\nPending.\n",
        encoding="utf-8",
    )
    return tmp_path


def test_all_hooks_are_silent_without_ultra(tmp_path):
    payloads = {
        "session_context.py": {"hook_event_name": "SessionStart"},
        "mid_workflow_recall.py": {"hook_event_name": "PreToolUse", "tool_name": "Edit"},
        "compact_context.py": {"hook_event_name": "PreCompact"},
        "post_edit_guard.py": {"hook_event_name": "PostToolUse", "tool_name": "Edit"},
        "block_dangerous_commands.py": {
            "hook_event_name": "PreToolUse",
            "tool_name": "Bash",
            "tool_input": {"command": "git push origin main"},
        },
    }
    for name in HOOKS:
        result = run_hook(name, tmp_path, payloads[name])
        assert result.returncode == 0, (name, result.stderr)
        assert result.stdout == "", name
    assert list(tmp_path.iterdir()) == []


def test_session_and_mid_workflow_hooks_inject_only_goal_and_acceptance(tmp_path):
    root = make_project(tmp_path)
    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
    assert session.returncode == 0
    payload = json.loads(session.stdout)
    context = payload["hookSpecificOutput"]["additionalContext"]
    assert "Ship a real checkout path." in context
    assert "Public checkout returns 201." in context
    assert "Write the public-seam regression" not in context

    recall = run_hook("mid_workflow_recall.py", root, {
        "hook_event_name": "PreToolUse",
        "tool_name": "Edit",
        "tool_input": {"file_path": "src/http.js"},
    })
    recall_context = json.loads(recall.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Public checkout returns 201." in recall_context
    assert "Ship a real checkout path" not in recall_context


def test_task_context_path_cannot_escape_the_project(tmp_path):
    root = make_project(tmp_path)
    outside = tmp_path.parent / f"{tmp_path.name}-secret.md"
    outside.write_text(
        "# Secret\n\n## Acceptance Criteria\n\nEXFILTRATION-SENTINEL\n",
        encoding="utf-8",
    )
    tasks = json.loads((root / ".ultra" / "tasks.json").read_text(encoding="utf-8"))
    tasks["tasks"][0]["context_file"] = f"../../{outside.name}"
    (root / ".ultra" / "tasks.json").write_text(json.dumps(tasks), encoding="utf-8")
    try:
        session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
        assert session.returncode == 0
        assert "EXFILTRATION-SENTINEL" not in session.stdout
    finally:
        outside.unlink(missing_ok=True)


def test_compact_snapshot_is_derived_and_reinjectable(tmp_path):
    root = make_project(tmp_path)
    saved = run_hook("compact_context.py", root, {"hook_event_name": "PreCompact"})
    assert saved.returncode == 0
    snapshot = root / ".ultra" / ".runtime" / "compact-snapshot.md"
    assert snapshot.exists()
    assert "Write the public-seam regression." in snapshot.read_text(encoding="utf-8")

    restored = run_hook("compact_context.py", root, {
        "hook_event_name": "SessionStart",
        "source": "compact",
    })
    context = json.loads(restored.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Write the public-seam regression." in context


def test_post_edit_guard_records_mechanical_observations_without_blocking(tmp_path):
    root = make_project(tmp_path)
    test_file = root / "test" / "checkout.test.js"
    test_file.parent.mkdir()
    test_file.write_text("// test\n", encoding="utf-8")
    result = run_hook("post_edit_guard.py", root, {
        "hook_event_name": "PostToolUse",
        "tool_name": "Edit",
        "tool_input": {"file_path": str(test_file)},
    })
    assert result.returncode == 0
    output = json.loads(result.stdout)
    assert output.get("decision") != "block"
    progress = json.loads((root / ".ultra" / "progress" / "1.json").read_text(encoding="utf-8"))
    assert progress["task_id"] == "1"
    assert progress["evidence"]["tests_written"] == "observed"
    assert progress["evidence"]["tests_passed"] == "unknown"
    assert progress["evidence"]["spec_trace"] == "observed"


def test_post_edit_guard_resolves_repository_documents_and_repairs_malformed_progress(tmp_path):
    root = make_project(tmp_path)
    docs = root / "docs"
    docs.mkdir()
    (docs / "contract.md").write_text("# Contract\n\n## Checkout\nPublic seam.\n", encoding="utf-8")
    tasks = json.loads((root / ".ultra" / "tasks.json").read_text(encoding="utf-8"))
    tasks["tasks"][0]["trace_to"] = "docs/contract.md#checkout"
    (root / ".ultra" / "tasks.json").write_text(json.dumps(tasks), encoding="utf-8")
    progress_file = root / ".ultra" / "progress" / "1.json"
    progress_file.parent.mkdir()
    progress_file.write_text('{"evidence":null,"touched_files":"broken"}\n', encoding="utf-8")

    changed = root / "src" / "checkout.js"
    changed.parent.mkdir()
    changed.write_text("export const checkout = true;\n", encoding="utf-8")
    result = run_hook("post_edit_guard.py", root, {
        "hook_event_name": "PostToolUse",
        "tool_name": "Edit",
        "tool_input": {"file_path": str(changed)},
    })

    assert result.returncode == 0, result.stderr
    progress = json.loads(progress_file.read_text(encoding="utf-8"))
    assert progress["evidence"]["spec_trace"] == "observed"
    assert progress["touched_files"] == ["src/checkout.js"]
    assert set(progress["evidence"]) == {
        "tests_written", "tests_passed", "persistence_real", "feature_flags_audit",
        "vertical_slice", "spec_trace",
    }


def test_dangerous_command_hook_blocks_named_effects_with_exact_digest_repair(tmp_path):
    root = make_project(tmp_path)
    harmless = run_hook("block_dangerous_commands.py", root, {
        "hook_event_name": "PreToolUse",
        "tool_name": "Bash",
        "tool_input": {"command": "npm test"},
    })
    assert harmless.stdout == ""

    for command, threat in [
        ("git push origin main", "protected branch"),
        ("psql app -c 'TRUNCATE users'", "destructive database"),
        ("cast send 0x123 --value 1ether", "funds or on-chain"),
        ("export API_KEY=sk-live-hardcoded", "hard-coded credential"),
        ('eval "$USER_INPUT"', "user-controlled code execution"),
    ]:
        blocked = run_hook("block_dangerous_commands.py", root, {
            "hook_event_name": "PreToolUse",
            "tool_name": "Bash",
            "tool_input": {"command": command},
        })
        payload = json.loads(blocked.stdout)
        assert payload["hookSpecificOutput"]["permissionDecision"] == "deny"
        assert threat in payload["hookSpecificOutput"]["permissionDecisionReason"]
        digest = hashlib.sha256(command.encode()).hexdigest()
        assert digest in payload["hookSpecificOutput"]["permissionDecisionReason"]

        allowed = run_hook("block_dangerous_commands.py", root, {
            "hook_event_name": "PreToolUse",
            "tool_name": "Bash",
            "tool_input": {"command": command},
        }, {"UBP_DANGEROUS_COMMAND_APPROVED": digest})
        assert allowed.stdout == ""

    migration = run_hook("block_dangerous_commands.py", root, {
        "hook_event_name": "PreToolUse",
        "tool_name": "Bash",
        "tool_input": {"command": "alembic upgrade head"},
    })
    advisory = json.loads(migration.stdout)
    assert advisory.get("decision") != "block"
    assert advisory["hookSpecificOutput"].get("permissionDecision") != "deny"
    assert "database migration" in advisory["hookSpecificOutput"]["additionalContext"]


def test_host_wrappers_allow_only_the_five_file_first_hooks(tmp_path):
    root = make_project(tmp_path)
    expected = set(HOOKS)
    for name in ("codex", "kimi", "grok"):
        adapter = load_adapter(name)
        assert adapter.ALLOWED_FEATURES == expected

    codex = load_adapter("codex")
    codex_context = codex.run_feature(
        "session_context.py",
        {"cwd": str(root), "hook_event_name": "SessionStart"},
        [],
    )
    assert "Ship a real checkout path." in codex_context["hookSpecificOutput"]["additionalContext"]

    kimi = load_adapter("kimi")
    kimi_context = kimi.run_feature(
        "session_context.py",
        {"cwd": str(root), "hook_event_name": "SessionStart"},
        [],
    )
    assert "Ship a real checkout path." in kimi_context["message"]

    grok = load_adapter("grok")
    denied = grok.run_feature(
        "block_dangerous_commands.py",
        {
            "cwd": str(root),
            "hookEventName": "PreToolUse",
            "toolName": "Bash",
            "toolInput": {"command": "git push origin main"},
        },
        [],
    )
    assert denied["decision"] == "deny"
