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
    (ultra / "changes" / "active" / "C-01").mkdir(parents=True)
    (ultra / "changes" / "active" / "C-01" / "intent.md").write_text(
        "# Change C-01\n\n## Acceptance\n\n- Public checkout returns 201.\n",
        encoding="utf-8",
    )
    (ultra / "project-brief.md").write_text(
        "# Project Brief\n\n## One-line\nBuild a checkout helper.\n",
        encoding="utf-8",
    )
    (ultra / "north-star.md").write_text(
        "# North Star\n\n## Project Direction\nShip a real checkout path.\n\n"
        "## North Star Outcome\n- `NS-01` outcome: A buyer completes checkout.\n\n"
        "## Hard Constraints\n- `HC-1`: Never fake persistence.\n",
        encoding="utf-8",
    )
    (ultra / "specs" / "product.md").write_text("# Product\n\n## Checkout\nReal checkout.\n", encoding="utf-8")
    (ultra / "tasks.json").write_text(json.dumps({
        "tasks": [{
            "id": "1",
            "change_id": "C-01",
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


def test_session_and_mid_workflow_hooks_inject_accepted_baseline_and_acceptance(tmp_path):
    root = make_project(tmp_path)
    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
    assert session.returncode == 0
    payload = json.loads(session.stdout)
    context = payload["hookSpecificOutput"]["additionalContext"]
    assert "Ship a real checkout path." in context
    assert "A buyer completes checkout." in context
    assert "Never fake persistence." in context
    assert "Build a checkout helper." not in context
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


def test_hooks_ignore_abandoned_tasks_when_selecting_current_acceptance(tmp_path):
    root = make_project(tmp_path)
    ultra = root / ".ultra"
    (ultra / "changes" / "abandoned" / "OLD").mkdir(parents=True)
    (ultra / "changes" / "abandoned" / "OLD" / "intent.md").write_text(
        "# Abandoned Change\n", encoding="utf-8"
    )
    (ultra / "contexts" / "task-old.md").write_text(
        "# Old task\n\n> **Status**: in_progress\n\n"
        "## Acceptance Criteria\n\n- [ ] ABANDONED-ACCEPTANCE-SENTINEL\n",
        encoding="utf-8",
    )
    ledger = json.loads((ultra / "tasks.json").read_text(encoding="utf-8"))
    ledger["tasks"].insert(0, {
        "id": "old",
        "change_id": "OLD",
        "title": "Abandoned work",
        "status": "in_progress",
        "context_file": ".ultra/contexts/task-old.md",
        "trace_to": ".ultra/specs/product.md#checkout",
    })
    (ultra / "tasks.json").write_text(json.dumps(ledger), encoding="utf-8")

    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
    context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Public checkout returns 201." in context
    assert "ABANDONED-ACCEPTANCE-SENTINEL" not in context


def test_hooks_read_legacy_active_change_ref_without_reviving_history(tmp_path):
    root = make_project(tmp_path)
    ledger_file = root / ".ultra" / "tasks.json"
    ledger = json.loads(ledger_file.read_text(encoding="utf-8"))
    task = ledger["tasks"][0]
    task.pop("change_id")
    task["change_ref"] = ".ultra/changes/active/C-01/intent.md"
    ledger_file.write_text(json.dumps(ledger), encoding="utf-8")

    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
    context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Public checkout returns 201." in context


def test_hooks_prefer_canonical_change_id_over_conflicting_legacy_change_ref(tmp_path):
    root = make_project(tmp_path)
    ultra = root / ".ultra"
    ledger_file = ultra / "tasks.json"
    ledger = json.loads(ledger_file.read_text(encoding="utf-8"))
    current = ledger["tasks"][0]
    current["status"] = "pending"
    current["dependencies"] = []
    ledger["tasks"].insert(0, {
        "id": "historical",
        "change_id": "OLD",
        "change_ref": ".ultra/changes/active/C-01/intent.md",
        "title": "Migrated historical work",
        "status": "in_progress",
        "dependencies": [],
        "context_file": ".ultra/contexts/task-historical.md",
        "trace_to": ".ultra/specs/product.md#checkout",
    })
    ledger_file.write_text(json.dumps(ledger), encoding="utf-8")
    (ultra / "contexts" / "task-historical.md").write_text(
        "# Historical\n\n> **Status**: in_progress\n\n"
        "## Acceptance Criteria\n\n- [ ] CONFLICTING-LEGACY-SENTINEL\n",
        encoding="utf-8",
    )

    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
    context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Public checkout returns 201." in context
    assert "CONFLICTING-LEGACY-SENTINEL" not in context


def test_hooks_select_only_a_dependency_ready_frontier_task(tmp_path):
    root = make_project(tmp_path)
    ultra = root / ".ultra"
    ledger_file = ultra / "tasks.json"
    ledger = json.loads(ledger_file.read_text(encoding="utf-8"))
    ledger["tasks"][0]["status"] = "pending"
    ledger["tasks"][0]["dependencies"] = ["dep"]
    ledger["tasks"].append({
        "id": "dep",
        "change_id": "C-01",
        "title": "Dependency",
        "status": "pending",
        "dependencies": [],
        "context_file": ".ultra/contexts/task-dep.md",
        "trace_to": ".ultra/specs/product.md#checkout",
    })
    ledger_file.write_text(json.dumps(ledger), encoding="utf-8")
    (ultra / "contexts" / "task-dep.md").write_text(
        "# Dependency\n\n> **Status**: pending\n\n"
        "## Acceptance Criteria\n\n- [ ] DEPENDENCY-READY-SENTINEL\n",
        encoding="utf-8",
    )

    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
    context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "DEPENDENCY-READY-SENTINEL" in context
    assert "Public checkout returns 201." not in context


def test_hooks_stay_task_silent_when_multiple_tasks_claim_in_progress(tmp_path):
    root = make_project(tmp_path)
    ultra = root / ".ultra"
    ledger_file = ultra / "tasks.json"
    ledger = json.loads(ledger_file.read_text(encoding="utf-8"))
    ledger["tasks"].append({
        "id": "also-running",
        "change_id": "C-01",
        "title": "Conflicting writer",
        "status": "in_progress",
        "dependencies": [],
        "context_file": ".ultra/contexts/task-also-running.md",
        "trace_to": ".ultra/specs/product.md#checkout",
    })
    ledger_file.write_text(json.dumps(ledger), encoding="utf-8")
    (ultra / "contexts" / "task-also-running.md").write_text(
        "# Conflicting writer\n\n> **Status**: in_progress\n\n"
        "## Acceptance Criteria\n\n- [ ] CONFLICTING-WRITER-SENTINEL\n",
        encoding="utf-8",
    )

    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
    context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Ship a real checkout path." in context
    assert "Public checkout returns 201." not in context
    assert "CONFLICTING-WRITER-SENTINEL" not in context


def test_hooks_stay_task_silent_for_an_invalid_active_change_id(tmp_path):
    root = make_project(tmp_path)
    ultra = root / ".ultra"
    valid = ultra / "changes" / "active" / "C-01"
    invalid = ultra / "changes" / "active" / "bad id"
    valid.rename(invalid)
    ledger_file = ultra / "tasks.json"
    ledger = json.loads(ledger_file.read_text(encoding="utf-8"))
    ledger["tasks"][0]["change_id"] = "bad id"
    ledger_file.write_text(json.dumps(ledger), encoding="utf-8")

    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
    context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Ship a real checkout path." in context
    assert "Public checkout returns 201." not in context


def test_session_context_falls_back_to_project_brief_before_research(tmp_path):
    ultra = tmp_path / ".ultra"
    ultra.mkdir()
    (ultra / "project-brief.md").write_text(
        "# Project Brief\n\n## One-line\nExplore a checkout assistant.\n",
        encoding="utf-8",
    )
    (ultra / "north-star.md").write_text(
        "# North Star\n\n## Project Direction\n[NEEDS CLARIFICATION]\n",
        encoding="utf-8",
    )

    result = run_hook("session_context.py", tmp_path, {"hook_event_name": "SessionStart"})
    assert result.returncode == 0
    context = json.loads(result.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Ultra project brief" in context
    assert "Explore a checkout assistant." in context
    assert "NEEDS CLARIFICATION" not in context


def test_session_context_keeps_legacy_one_line_compatible(tmp_path):
    ultra = tmp_path / ".ultra"
    ultra.mkdir()
    (ultra / "north-star.md").write_text(
        "# North Star\n\n## One-line\nKeep the legacy route alive.\n",
        encoding="utf-8",
    )

    result = run_hook("session_context.py", tmp_path, {"hook_event_name": "SessionStart"})
    assert result.returncode == 0
    context = json.loads(result.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Ultra legacy project intent" in context
    assert "Keep the legacy route alive." in context


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


def test_protected_branch_publication_is_advisory_when_host_authority_is_not_projected(tmp_path):
    root = make_project(tmp_path)
    for command in (
        "git push origin main",
        "git push --atomic origin main refs/tags/v0.26.1",
    ):
        result = run_hook("block_dangerous_commands.py", root, {
            "hook_event_name": "PreToolUse",
            "tool_name": "Bash",
            "tool_input": {"command": command},
        })

        payload = json.loads(result.stdout)
        assert payload.get("decision") != "block"
        assert payload["hookSpecificOutput"].get("permissionDecision") != "deny"
        assert "protected branch push" in payload["hookSpecificOutput"]["additionalContext"]


def test_protected_branch_history_rewrite_remains_exact_digest_guarded(tmp_path):
    root = make_project(tmp_path)
    for command in (
        "git push --force-with-lease origin main",
        "git push origin +HEAD:main",
        "git push origin --delete main",
        "git push origin :main",
    ):
        result = run_hook("block_dangerous_commands.py", root, {
            "hook_event_name": "PreToolUse",
            "tool_name": "Bash",
            "tool_input": {"command": command},
        })

        payload = json.loads(result.stdout)
        assert payload["hookSpecificOutput"]["permissionDecision"] == "deny"
        assert "protected branch history rewrite" in payload["hookSpecificOutput"]["permissionDecisionReason"]


def test_read_only_search_payload_is_not_classified_as_a_shell_effect(tmp_path):
    root = make_project(tmp_path)
    for command in (
        "rg -n 'git push origin main' hooks",
        'rg -n "cast send 0x123 --value 1ether" hooks',
    ):
        result = run_hook("block_dangerous_commands.py", root, {
            "hook_event_name": "PreToolUse",
            "tool_name": "Bash",
            "tool_input": {"command": command},
        })
        assert result.stdout == ""

    chained = run_hook("block_dangerous_commands.py", root, {
        "hook_event_name": "PreToolUse",
        "tool_name": "Bash",
        "tool_input": {
            "command": (
                "rg -n 'cast send 0x123 --value 1ether' hooks && "
                "cast send 0x123 --value 1ether"
            ),
        },
    })
    assert json.loads(chained.stdout)["hookSpecificOutput"]["permissionDecision"] == "deny"


def test_authorization_survives_the_prefix_form_but_the_prefix_alone_never_authorizes(tmp_path):
    root = make_project(tmp_path)
    bare = "cast send 0x123 --value 1ether"
    digest = hashlib.sha256(bare.encode()).hexdigest()
    prefixed = f"UBP_DANGEROUS_COMMAND_APPROVED={digest} {bare}"

    # The digest identifies the effect, not the spelling used to rerun it. An owner who
    # authorized the command has authorized it however the retry is written.
    allowed = run_hook("block_dangerous_commands.py", root, {
        "hook_event_name": "PreToolUse",
        "tool_name": "Bash",
        "tool_input": {"command": prefixed},
    }, {"UBP_DANGEROUS_COMMAND_APPROVED": digest})
    assert allowed.stdout == ""

    # The prefix on its own is not authorization. It is written by whoever composed the
    # command -- which is the model -- so honouring it would let the model approve
    # itself and the gate would protect nothing.
    blocked = run_hook("block_dangerous_commands.py", root, {
        "hook_event_name": "PreToolUse",
        "tool_name": "Bash",
        "tool_input": {"command": prefixed},
    })
    payload = json.loads(blocked.stdout)
    assert payload["hookSpecificOutput"]["permissionDecision"] == "deny"
    reason = payload["hookSpecificOutput"]["permissionDecisionReason"]
    # The quoted digest stays the one for the bare command, so a second retry is not
    # chasing a digest that changes every time the command is rewritten.
    assert digest in reason
    assert "environment" in reason.lower()


def test_commit_message_bodies_are_data_but_interpreter_heredocs_are_not(tmp_path):
    root = make_project(tmp_path)

    def decision(command: str):
        result = run_hook("block_dangerous_commands.py", root, {
            "hook_event_name": "PreToolUse",
            "tool_name": "Bash",
            "tool_input": {"command": command},
        })
        if not result.stdout:
            return None
        return json.loads(result.stdout)["hookSpecificOutput"].get("permissionDecision")

    danger = "cast send 0x123 --value 1ether"

    # Describing an effect in a commit message is not performing it. This is the false
    # positive: the body is a payload for git, never executed.
    assert decision(f"git commit -q -F - <<'EOF'\nFixed the {danger} path.\nEOF") is None
    assert decision(
        f"cd repo && git add -A && git commit -F - <<'MSG'\nSee {danger}.\nMSG"
    ) is None

    # An unquoted delimiter expands command substitutions before git receives the
    # message. Its body is executable shell input, not inert commit-message data.
    assert decision(f"git commit -F - <<EOF\n$({danger})\nEOF") == "deny"
    assert decision(f"git commit -F - <<EOF\n`{danger}`\nEOF") == "deny"

    # A heredoc fed to an interpreter IS executed, so its body stays in scope. Stripping
    # these would turn the quoting style into a way around the gate.
    assert decision(f"bash <<'EOF'\n{danger}\nEOF") == "deny"
    assert decision(f"cat <<'EOF' | sh\n{danger}\nEOF") == "deny"
    # Piping a commit-message heredoc elsewhere is no longer a plain payload either.
    assert decision(f"git commit -F - <<'EOF' | bash\n{danger}\nEOF") == "deny"

    # The plain effect is still blocked, and so is one that merely follows a heredoc.
    assert decision(danger) == "deny"
    assert decision(f"git commit -F - <<'EOF'\nnotes\nEOF\n{danger}") == "deny"


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
    codex_publication = codex.run_feature(
        "block_dangerous_commands.py",
        {
            "cwd": str(root),
            "hook_event_name": "PreToolUse",
            "tool_name": "Bash",
            "tool_input": {"command": "git push origin main"},
        },
        [],
    )
    assert codex_publication.get("decision") != "block"
    assert codex_publication["hookSpecificOutput"].get("permissionDecision") != "deny"

    kimi = load_adapter("kimi")
    kimi_context = kimi.run_feature(
        "session_context.py",
        {"cwd": str(root), "hook_event_name": "SessionStart"},
        [],
    )
    assert "Ship a real checkout path." in kimi_context["message"]
    kimi_publication = kimi.run_feature(
        "block_dangerous_commands.py",
        {
            "cwd": str(root),
            "hook_event_name": "PreToolUse",
            "tool_name": "Bash",
            "tool_input": {"command": "git push origin main"},
        },
        [],
    )
    assert "protected branch push" in kimi_publication["message"]
    assert "hookSpecificOutput" not in kimi_publication

    grok = load_adapter("grok")
    allowed = grok.run_feature(
        "block_dangerous_commands.py",
        {
            "cwd": str(root),
            "hookEventName": "PreToolUse",
            "toolName": "Bash",
            "toolInput": {"command": "git push origin main"},
        },
        [],
    )
    assert allowed["decision"] == "allow"

    denied = grok.run_feature(
        "block_dangerous_commands.py",
        {
            "cwd": str(root),
            "hookEventName": "PreToolUse",
            "toolName": "Bash",
            "toolInput": {"command": "cast send 0x123 --value 1ether"},
        },
        [],
    )
    assert denied["decision"] == "deny"
