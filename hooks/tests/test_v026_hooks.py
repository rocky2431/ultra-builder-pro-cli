import hashlib
import importlib.util
import json
import os
import re
import shutil
import socket
import subprocess
import sys
from pathlib import Path


HOOK_ROOT = Path(__file__).resolve().parents[1]
NORTH_STAR_VALIDATOR = (
    HOOK_ROOT.parent
    / "skills"
    / "ultra-research"
    / "scripts"
    / "validate_north_star.cjs"
)
HOOKS = [
    "session_context.py",
    "mid_workflow_recall.py",
    "compact_context.py",
    "post_edit_guard.py",
    "block_dangerous_commands.py",
]

TASK_CONTEXT_REPAIR = (
    "Restore `.ultra/contexts/task-1.md` from Git or owner-readable history as one "
    "stable ordinary regular UTF-8 file, keep the `.ultra/tasks.json` row unchanged, "
    "and retry the Hook event."
)


def load_adapter(name: str):
    file = HOOK_ROOT / "adapters" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(f"ultra_hook_adapter_{name}", file)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def load_common():
    file = HOOK_ROOT / "_common.py"
    spec = importlib.util.spec_from_file_location("ultra_hook_common", file)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def load_session_context():
    file = HOOK_ROOT / "session_context.py"
    spec = importlib.util.spec_from_file_location("ultra_session_context", file)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.path.insert(0, str(HOOK_ROOT))
    try:
        spec.loader.exec_module(module)
    finally:
        sys.path.remove(str(HOOK_ROOT))
    return module


def load_compact_context():
    file = HOOK_ROOT / "compact_context.py"
    spec = importlib.util.spec_from_file_location("ultra_compact_context", file)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.path.insert(0, str(HOOK_ROOT))
    try:
        spec.loader.exec_module(module)
    finally:
        sys.path.remove(str(HOOK_ROOT))
    return module


def write_fake_executable(file: Path, body: str) -> Path:
    file.write_text(f"#!{sys.executable}\n{body}\n", encoding="utf-8")
    file.chmod(0o755)
    return file


def malformed_accepted_validator_environment(tmp_path: Path) -> dict[str, str]:
    real_node = shutil.which("node")
    assert real_node is not None
    shim_dir = tmp_path / "malformed-validator-shim"
    shim_dir.mkdir()
    write_fake_executable(
        shim_dir / "node",
        "import json, subprocess, sys\n"
        "data = sys.stdin.buffer.read()\n"
        f"completed = subprocess.run([{real_node!r}, *sys.argv[1:]], input=data, "
        "stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)\n"
        "report = json.loads(completed.stdout)\n"
        "report['acceptance_binding'] = {\n"
        "  'content_sha256': report['input']['sha256'],\n"
        "}\n"
        "report['source_observations'] = []\n"
        "sys.stdout.write(json.dumps(report))\n"
        "sys.exit(0)",
    )
    return {"PATH": f"{shim_dir}{os.pathsep}{os.environ.get('PATH', '')}"}


def structurally_malformed_accepted_validator_environment(
    tmp_path: Path,
    mutation: str,
) -> dict[str, str]:
    real_node = shutil.which("node")
    assert real_node is not None
    shim_dir = tmp_path / f"malformed-structure-{mutation}"
    shim_dir.mkdir()
    write_fake_executable(
        shim_dir / "node",
        "import json, os, subprocess, sys\n"
        "data = sys.stdin.buffer.read()\n"
        f"completed = subprocess.run([{real_node!r}, *sys.argv[1:]], input=data, "
        "stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)\n"
        "report = json.loads(completed.stdout)\n"
        "mutation = os.environ['UBP_TEST_REPORT_MUTATION']\n"
        "if mutation == 'binding_only_invalid':\n"
        "  report['acceptance_binding'].pop('snapshot', None)\n"
        "elif mutation == 'source_observations_only_invalid':\n"
        "  report['source_observations'] = []\n"
        "elif mutation == 'missing_ids':\n"
        "  report.pop('ids', None)\n"
        "elif mutation == 'empty_fp':\n"
        "  report['ids']['FP'] = []\n"
        "elif mutation == 'unresolved_fp':\n"
        "  report['ids']['FP'] = ['FP-404']\n"
        "elif mutation == 'invalid_ns':\n"
        "  report['ids']['NS'] = ['NOT-NS']\n"
        "elif mutation == 'invalid_hc_type':\n"
        "  report['ids']['HC'] = 'HC-1'\n"
        "elif mutation == 'missing_section':\n"
        "  report['sections'].pop('Research Trace', None)\n"
        "elif mutation == 'extra_section':\n"
        "  report['sections']['Unexpected Projection'] = {'body_start': 0, 'body_end': 1}\n"
        "elif mutation == 'overlapping_spans':\n"
        "  report['sections']['Problem Reality']['body_start'] = "
        "report['sections']['Acceptance and Revision']['body_start']\n"
        "elif mutation == 'misordered_spans':\n"
        "  report['sections']['Problem Reality'], report['sections']['First-Principle Propositions'] = "
        "report['sections']['First-Principle Propositions'], report['sections']['Problem Reality']\n"
        "elif mutation == 'out_of_bounds_span':\n"
        "  report['sections']['Research Trace']['body_end'] = len(data) + 1\n"
        "else:\n"
        "  raise AssertionError(mutation)\n"
        "sys.stdout.write(json.dumps(report))\n"
        "sys.exit(completed.returncode)",
    )
    return {
        "PATH": f"{shim_dir}{os.pathsep}{os.environ.get('PATH', '')}",
        "UBP_TEST_REPORT_MUTATION": mutation,
    }


def run_hook(
    name: str,
    cwd: Path,
    payload: dict,
    env: dict | None = None,
    *,
    timeout: float | None = None,
):
    return subprocess.run(
        [sys.executable, str(HOOK_ROOT / name)],
        input=json.dumps({"cwd": str(cwd), **payload}),
        text=True,
        capture_output=True,
        cwd=cwd,
        env={**os.environ, **(env or {})},
        check=False,
        timeout=timeout,
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
            "type": "feature",
            "priority": "P0",
            "status": "in_progress",
            "dependencies": [],
            "context_file": ".ultra/contexts/task-1.md",
            "trace_to": ".ultra/specs/product.md#checkout",
        }],
    }), encoding="utf-8")
    (ultra / "contexts" / "task-1.md").write_text(
        "# Task 1\n\n> **Status**: in_progress\n\n## Acceptance Criteria\n\n- [ ] Public checkout returns 201.\n\n## Resume Note\n\nWrite the public-seam regression.\n\n## Completion\n\nPending.\n",
        encoding="utf-8",
    )
    return tmp_path


def write_v2_ledger(root: Path, tasks: list[dict]) -> None:
    (root / ".ultra" / "tasks.json").write_text(
        json.dumps({"$schema": "ultra-task-ledger-v2", "tasks": tasks}),
        encoding="utf-8",
    )


def write_typed_task_context(
    root: Path,
    task_id: str,
    *,
    legacy_status: str | None = None,
) -> Path:
    status = f"> **Status**: {legacy_status}\n\n" if legacy_status else ""
    file = root / ".ultra" / "contexts" / f"task-{task_id}.md"
    file.write_text(
        f"# Task {task_id}\n\n"
        f"{status}"
        "## Acceptance Criteria\n\n"
        "**Change Acceptance IDs**: [`AC-TYPED`]\n\n"
        "| ID | Criterion | Verification type | Required evidence |\n"
        "|---|---|---|---|\n"
        "| AC-COMMAND | Command behavior | `command` | exact command receipt |\n"
        "| AC-INSPECTION | Source behavior | `inspection` | source observation |\n"
        "| AC-OWNER | Owner decision | `owner-judgment` | durable owner disposition |\n"
        "| AC-EXTERNAL | Provider behavior | `external-observation` | provider run receipt |\n\n"
        "## Resume Note\n\n"
        "Continue from the typed acceptance table.\n",
        encoding="utf-8",
    )
    return file


def accepted_v2_north_star() -> str:
    return """# Project North Star

## Acceptance and Revision

- Schema: `north-star-v2`
- Status: `accepted`
- Revision: `r1`
- Owner acceptance source: `.ultra/decisions/D-1.md#owner-record`
- Acceptance time: `not-recorded`
- Supersedes: `none`

## Problem Reality

- Reality: Checkout work can drift from buyer value.
- Evidence: Current repository behavior.
- Unknowns: Production conversion remains unknown.

## First-Principle Propositions

### FP-1 — Preserve durable authority

- Proposition: Durable checkout intent must survive sessions.
- Evidence: Canonical project files.
- Causal consequence: A later Host can reconstruct the accepted boundary.
- Falsifier or revisit trigger: Continuation needs hidden chat context.
- Status: `accepted`

## Value Causal Chain

| Chain | First principle | Capability | Observable behavior | Outcome |
|---|---|---|---|---|
| VC-1 | `FP-1` | Canonical intent | Another Host resumes checkout work | `NS-01` |

## North Star Outcomes

### NS-01 — Recoverable checkout delivery

- Outcome: A buyer completes checkout through a recoverable workflow.
- Observation method: Run the public checkout acceptance.
- Baseline: Existing workflow.
- Target or expected change: Cross-session delivery remains aligned.
- Horizon: Current Change.
- Anti-metric: Do not optimize task count.

## Hard Constraints

### HC-1 — Owner authority remains explicit

- Protected value or threat: Owner control.
- Constraint: External effects require a live owner grant.
- Authority or evidence: Owner decision.
- Revisit condition: Owner changes the effect boundary.

## Explicit Exclusions

- No inferred external authorization.

## Uncertainties and Revisit Triggers

- Revisit after a failed continuation drill.

## Research Trace

- Project Brief: `project-brief.md`
- Research runs: `.ultra/research/R-1/99-synthesis.md`
- Sources and decisions: `.ultra/decisions/D-1.md`
"""


def git_blob_digest(data: bytes) -> str:
    header = f"blob {len(data)}\0".encode("utf-8")
    return hashlib.sha1(header + data).hexdigest()


def bind_accepted_v2(
    root: Path,
    text: str,
    *,
    decision_status: str = "accepted",
    decision_anchor: str = "Owner Record",
    content_digest: str | None = None,
    blob_digest: str | None = None,
    snapshot_text: str | None = None,
) -> None:
    ultra = root / ".ultra"
    data = text.encode("utf-8")
    decision = ultra / "decisions" / "D-1.md"
    snapshot = ultra / "research" / "R-1" / "north-star-v2-r1.accepted.md"
    decision.parent.mkdir(parents=True, exist_ok=True)
    snapshot.parent.mkdir(parents=True, exist_ok=True)
    (ultra / "north-star.md").write_bytes(data)
    snapshot.write_text(snapshot_text if snapshot_text is not None else text, encoding="utf-8")
    decision.write_text(
        "# Decision\n\n"
        f"> **Status**: {decision_status}\n\n"
        f"## {decision_anchor}\n\n"
        "- Conversation scope: this Hook fixture invocation.\n"
        "- Exact raw owner acceptance: \"accept this fixture\"\n"
        "- Agency boundary: the owner accepts the frame; the model owns final wording.\n"
        "- Time boundary: not-recorded because the fixture supplies no owner-authored time.\n"
        "- Revision boundary: this revision only; a future revision does not inherit acceptance.\n\n"
        "## Accepted Artifact Binding\n\n"
        "- North Star content SHA-256: `"
        f"{content_digest or hashlib.sha256(data).hexdigest()}`\n"
        "- North Star Git blob digest: `"
        f"{blob_digest or git_blob_digest(data)}`\n"
        "- Accepted snapshot: `.ultra/research/R-1/north-star-v2-r1.accepted.md`\n",
        encoding="utf-8",
    )


def replace_section_body(text: str, heading: str, body: str) -> str:
    expression = re.compile(
        rf"(^## {re.escape(heading)}\n\n).*?(?=\n## |\Z)",
        re.MULTILINE | re.DOTALL,
    )
    mutated, count = expression.subn(rf"\g<1>{body}", text, count=1)
    assert count == 1, heading
    return mutated


def javascript_north_star_validation(root: Path) -> dict:
    result = subprocess.run(
        ["node", str(NORTH_STAR_VALIDATOR), str(root / ".ultra" / "north-star.md")],
        text=True,
        capture_output=True,
        cwd=root,
        check=False,
    )
    assert result.stdout, result.stderr
    return {"returncode": result.returncode, "report": json.loads(result.stdout)}


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
    assert "Write the public-seam regression" in context

    recall = run_hook("mid_workflow_recall.py", root, {
        "hook_event_name": "PreToolUse",
        "tool_name": "Edit",
        "tool_input": {"file_path": "src/http.js"},
    })
    recall_context = json.loads(recall.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Public checkout returns 201." in recall_context
    assert "Ship a real checkout path" not in recall_context


def test_session_context_injects_accepted_v2_problem_principles_outcomes_and_constraints(tmp_path):
    root = make_project(tmp_path)
    bind_accepted_v2(root, accepted_v2_north_star())

    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
    assert session.returncode == 0, session.stderr
    context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Ultra accepted North Star v2" in context
    assert "Checkout work can drift from buyer value." in context
    assert "FP-1 — Preserve durable authority" in context
    assert "Durable checkout intent must survive sessions." in context
    assert "NS-01 — Recoverable checkout delivery" in context
    assert "A buyer completes checkout through a recoverable workflow." in context
    assert "HC-1 — Owner authority remains explicit" in context
    assert "External effects require a live owner grant." in context
    assert "Build a checkout helper." not in context
    assert "Public checkout returns 201." in context


def test_session_context_uses_brief_for_unresearched_v2_and_not_placeholder_text(tmp_path):
    root = make_project(tmp_path)
    template = (HOOK_ROOT.parent / ".ultra-template" / "north-star.md").read_text(encoding="utf-8")
    (root / ".ultra" / "north-star.md").write_text(template, encoding="utf-8")

    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
    context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Ultra project brief (Research not yet accepted)" in context
    assert "Build a checkout helper." in context
    assert "NEEDS RESEARCH" not in context


def test_session_context_live_repository_payload_contains_current_accepted_v2_trace():
    root = HOOK_ROOT.parent
    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
    assert session.returncode == 0, session.stderr
    context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Ultra accepted North Star v2" in context
    assert "an automatic coding workflow can lose the owner's purpose" in context
    assert "FP-1 — Durable authority must outlive model context" in context
    assert "FP-7 — Cognitive alignment precedes state synchronization" in context
    assert "NS-01 — Owner–Agent cognitive alignment" in context
    assert "HC-6 — Authorize every external effect separately" in context
    assert "HC-7 — Terminate review within three rounds" in context


def test_session_context_falls_back_for_draft_unknown_and_mixed_north_stars(tmp_path):
    root = make_project(tmp_path)
    north_star = root / ".ultra" / "north-star.md"
    brief_sentinel = "Build a checkout helper."
    accepted = accepted_v2_north_star()
    candidates = [
        accepted.replace("- Status: `accepted`", "- Status: `draft`"),
        accepted.replace(
            "## Problem Reality\n",
            "## Problem Reality\n\n## Problem Reality\n",
        ),
        f"{accepted}\n## One-line\nLegacy bypass.\n",
    ]
    for candidate in candidates:
        north_star.write_text(candidate, encoding="utf-8")
        canonical = javascript_north_star_validation(root)["report"]
        assert not (
            canonical["valid"] is True
            and canonical.get("status") == "accepted"
        )
        session = run_hook(
            "session_context.py", root, {"hook_event_name": "SessionStart"}
        )
        assert session.returncode == 0, session.stderr
        context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
        assert brief_sentinel in context
        assert "Ultra accepted North Star v2" not in context
        assert "Ultra legacy" not in context


def test_session_context_never_publishes_broken_accepted_binding(tmp_path):
    root = make_project(tmp_path)
    accepted = accepted_v2_north_star()
    broken_cases = [
        {"decision_status": "draft"},
        {"content_digest": "0" * 64},
        {"blob_digest": "0" * 40},
        {"snapshot_text": f"{accepted}\ncorrupt"},
        {"decision_anchor": "Different Owner Record"},
    ]
    for kwargs in broken_cases:
        bind_accepted_v2(root, accepted, **kwargs)
        session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
        assert session.returncode == 0, session.stderr
        context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
        assert "Ultra accepted North Star v2" not in context, kwargs
        assert "Build a checkout helper." in context, kwargs

    bind_accepted_v2(root, accepted)
    (root / ".ultra" / "decisions" / "D-1.md").unlink()
    missing_decision = run_hook(
        "session_context.py", root, {"hook_event_name": "SessionStart"}
    )
    missing_context = json.loads(missing_decision.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Ultra accepted North Star v2" not in missing_context
    assert "Build a checkout helper." in missing_context

    bind_accepted_v2(root, accepted)
    decision_file = root / ".ultra" / "decisions" / "D-1.md"
    decision_file.write_text(
        decision_file.read_text(encoding="utf-8").replace(
            "> **Status**: accepted",
            "> **Status**: accepted\n> **Status**: accepted",
        ),
        encoding="utf-8",
    )
    duplicate_status = run_hook(
        "session_context.py", root, {"hook_event_name": "SessionStart"}
    )
    duplicate_context = json.loads(duplicate_status.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Ultra accepted North Star v2" not in duplicate_context

    bind_accepted_v2(root, accepted)
    (root / ".ultra" / "north-star.md").write_text(
        accepted.replace("Checkout work can drift", "Tampered work can drift"),
        encoding="utf-8",
    )
    tampered = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
    tampered_context = json.loads(tampered.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Ultra accepted North Star v2" not in tampered_context

    for candidate in [
        accepted.replace("- Evidence: Canonical project files.\n", ""),
        accepted.replace(
            "- Proposition: Durable checkout intent must survive sessions.",
            "- Proposition: [NEEDS RESEARCH]",
        ),
    ]:
        bind_accepted_v2(root, candidate)
        session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
        context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
        assert "Ultra accepted North Star v2" not in context
        assert "Build a checkout helper." in context


def test_session_context_finds_the_canonical_validator_in_source_and_all_six_install_layouts(tmp_path):
    session_context = load_session_context()
    layouts = {
        "source": (tmp_path / "source" / "hooks", tmp_path / "source" / "skills"),
        "claude": (
            tmp_path / "claude" / "skills" / "ultra-builder-pro" / "hooks",
            tmp_path / "claude" / "skills" / "ultra-builder-pro" / "skills",
        ),
        "codex": (
            tmp_path / "codex" / "plugins" / "ultra-builder-pro" / "hooks",
            tmp_path / "codex" / "plugins" / "ultra-builder-pro" / "skills",
        ),
        "kimi": (
            tmp_path / "kimi" / "plugins" / "managed" / "ultra-builder-pro" / "hooks",
            tmp_path / "kimi" / "plugins" / "managed" / "ultra-builder-pro" / "skills",
        ),
        "grok": (
            tmp_path / "grok" / ".ubp" / "plugin-sources" / "ultra-builder-pro" / "hooks",
            tmp_path / "grok" / ".ubp" / "plugin-sources" / "ultra-builder-pro" / "skills",
        ),
        "zcode": (
            tmp_path / "zcode" / "cli" / "plugins" / "marketplaces" / "ultra-builder-pro" / "plugin" / "hooks",
            tmp_path / "zcode" / "cli" / "plugins" / "marketplaces" / "ultra-builder-pro" / "plugin" / "skills",
        ),
        "opencode": (
            tmp_path / "OpenCode config with spaces" / ".ultra-builder-pro" / "hooks",
            tmp_path / "OpenCode config with spaces" / "skills",
        ),
    }
    for name, (hook_root, skill_root) in layouts.items():
        hook_file = hook_root / "session_context.py"
        validator = skill_root / "ultra-research" / "scripts" / "validate_north_star.cjs"
        hook_file.parent.mkdir(parents=True, exist_ok=True)
        validator.parent.mkdir(parents=True, exist_ok=True)
        hook_file.write_text("# fixture\n", encoding="utf-8")
        validator.write_text("// fixture\n", encoding="utf-8")
        assert session_context.find_north_star_validator(hook_file) == validator.resolve(), name


def test_session_context_rejects_a_validator_symlink_escape(tmp_path):
    session_context = load_session_context()
    hook_file = tmp_path / "plugin" / "hooks" / "session_context.py"
    validator = tmp_path / "plugin" / "skills" / "ultra-research" / "scripts" / "validate_north_star.cjs"
    outside = tmp_path / "outside-validator.cjs"
    hook_file.parent.mkdir(parents=True)
    validator.parent.mkdir(parents=True)
    hook_file.write_text("# fixture\n", encoding="utf-8")
    outside.write_text("// outside\n", encoding="utf-8")
    validator.symlink_to(outside)
    assert session_context.find_north_star_validator(hook_file) is None


def test_session_context_never_publishes_accepted_when_node_is_unavailable(tmp_path):
    root = make_project(tmp_path)
    bind_accepted_v2(root, accepted_v2_north_star())
    session = run_hook(
        "session_context.py",
        root,
        {"hook_event_name": "SessionStart"},
        env={"PATH": ""},
    )
    assert session.returncode == 0, session.stderr
    context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Ultra accepted North Star v2" not in context
    assert "north_star_validator_node_missing" in context
    assert "Build a checkout helper." in context


def test_session_context_reports_invalid_utf8_and_uses_the_brief_fallback(tmp_path):
    root = make_project(tmp_path)
    (root / ".ultra" / "north-star.md").write_bytes(b"# North Star\n\xff\n")
    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
    assert session.returncode == 0, session.stderr
    context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Ultra accepted North Star v2" not in context
    assert "invalid_utf8" in context
    assert "Build a checkout helper." in context


def test_session_context_rejects_canonical_north_star_symlinks_without_consuming_the_target(tmp_path):
    root = make_project(tmp_path / "project")
    north_star = root / ".ultra" / "north-star.md"
    outside = tmp_path / "outside-north-star.md"
    outside.write_text(
        "# North Star\n\n## One-line\nOUTSIDE-SYMLINK-AUTHORITY\n",
        encoding="utf-8",
    )
    north_star.unlink()
    north_star.symlink_to(outside)

    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})

    assert session.returncode == 0, session.stderr
    context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "north_star_snapshot_symlink" in context
    assert "Build a checkout helper." in context
    assert "OUTSIDE-SYMLINK-AUTHORITY" not in context


def test_session_context_rejects_an_oversized_north_star_before_publication(tmp_path):
    root = make_project(tmp_path)
    north_star = root / ".ultra" / "north-star.md"
    sentinel = b"OVERSIZED-NORTH-STAR-END"
    north_star.write_bytes(
        b"# North Star\n\n## One-line\n"
        + (b"x" * (8 * 1024 * 1024))
        + sentinel
        + b"\n"
    )

    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})

    assert session.returncode == 0, session.stderr
    context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "north_star_snapshot_oversize" in context
    assert "Build a checkout helper." in context
    assert sentinel.decode("ascii") not in context
    assert len(context.encode("utf-8")) < 32 * 1024


def test_session_context_rejects_a_snapshot_from_a_replaced_repository_root(
    tmp_path,
    monkeypatch,
):
    root = make_project(tmp_path / "project")
    detached_root = tmp_path / "detached-project"
    session_context = load_session_context()
    common = sys.modules["_common"]
    original_read = common.os.read
    replaced = False

    def replace_root_after_first_read(descriptor, size):
        nonlocal replaced
        chunk = original_read(descriptor, size)
        if not replaced:
            root.rename(detached_root)
            replacement_ultra = root / ".ultra"
            replacement_ultra.mkdir(parents=True)
            (replacement_ultra / "north-star.md").write_text(
                "# North Star\n\n## One-line\nREPLACEMENT-ROOT-AUTHORITY\n",
                encoding="utf-8",
            )
            replaced = True
        return chunk

    monkeypatch.setattr(common.os, "read", replace_root_after_first_read)

    snapshot, failure = session_context.read_north_star_snapshot(
        root,
        root / ".ultra" / "north-star.md",
    )

    assert snapshot is None
    assert failure["diagnostics"][0]["code"] == "north_star_snapshot_changed"


def test_session_context_rejects_unstable_project_brief_fallbacks_with_typed_repair(tmp_path):
    contexts = {}

    symlink_root = make_project(tmp_path / "symlink-project")
    (symlink_root / ".ultra" / "north-star.md").write_text(
        "# North Star\n\n## Project Direction\n[NEEDS CLARIFICATION]\n",
        encoding="utf-8",
    )
    outside = tmp_path / "outside-project-brief.md"
    outside.write_text(
        "# Project Brief\n\n## One-line\nOUTSIDE-BRIEF-AUTHORITY\n",
        encoding="utf-8",
    )
    brief = symlink_root / ".ultra" / "project-brief.md"
    brief.unlink()
    brief.symlink_to(outside)
    symlink_session = run_hook(
        "session_context.py",
        symlink_root,
        {"hook_event_name": "SessionStart"},
    )
    contexts["symlink"] = json.loads(symlink_session.stdout)["hookSpecificOutput"]["additionalContext"]

    oversize_root = make_project(tmp_path / "oversize-project")
    (oversize_root / ".ultra" / "north-star.md").write_text(
        "# North Star\n\n## Project Direction\n[NEEDS CLARIFICATION]\n",
        encoding="utf-8",
    )
    (oversize_root / ".ultra" / "project-brief.md").write_bytes(
        b"# Project Brief\n\n## One-line\nOVERSIZED-BRIEF-AUTHORITY\n\n## Appendix\n"
        + (b"x" * (8 * 1024 * 1024))
    )
    oversize_session = run_hook(
        "session_context.py",
        oversize_root,
        {"hook_event_name": "SessionStart"},
    )
    contexts["oversize"] = json.loads(oversize_session.stdout)["hookSpecificOutput"]["additionalContext"]

    assert {
        "symlink": (
            "project_brief_snapshot_symlink" in contexts["symlink"]
            and "OUTSIDE-BRIEF-AUTHORITY" not in contexts["symlink"]
        ),
        "oversize": (
            "project_brief_snapshot_oversize" in contexts["oversize"]
            and "OVERSIZED-BRIEF-AUTHORITY" not in contexts["oversize"]
        ),
    } == {"symlink": True, "oversize": True}


def test_session_context_accepted_legacy_and_fallback_use_one_caller_owned_snapshot(tmp_path):
    real_node = shutil.which("node")
    assert real_node is not None
    shim_dir = tmp_path / "node-shim"
    shim_dir.mkdir()
    write_fake_executable(
        shim_dir / "node",
        "import os, pathlib, subprocess, sys\n"
        "data = sys.stdin.buffer.read()\n"
        "canonical = pathlib.Path(sys.argv[-1])\n"
        "canonical.write_bytes(os.environ['UBP_TEST_REPLACEMENT'].encode('utf-8'))\n"
        f"completed = subprocess.run([{real_node!r}, *sys.argv[1:]], input=data, "
        "stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)\n"
        "sys.stdout.buffer.write(completed.stdout)\n"
        "sys.stderr.buffer.write(completed.stderr)\n"
        "sys.exit(completed.returncode)",
    )
    path_value = f"{shim_dir}{os.pathsep}{os.environ.get('PATH', '')}"
    replacement = "# North Star\n\n## One-line\nMUTATED-DISK-AUTHORITY\n"

    accepted_root = make_project(tmp_path / "accepted")
    accepted_text = accepted_v2_north_star().replace(
        "Durable checkout intent must survive sessions.",
        "ORIGINAL-ACCEPTED-SNAPSHOT must survive sessions.",
    )
    bind_accepted_v2(accepted_root, accepted_text)
    accepted = run_hook(
        "session_context.py",
        accepted_root,
        {"hook_event_name": "SessionStart"},
        env={"PATH": path_value, "UBP_TEST_REPLACEMENT": replacement},
    )
    accepted_context = json.loads(accepted.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Ultra accepted North Star v2" in accepted_context
    assert "ORIGINAL-ACCEPTED-SNAPSHOT" in accepted_context
    assert "MUTATED-DISK-AUTHORITY" not in accepted_context

    legacy_root = make_project(tmp_path / "legacy")
    (legacy_root / ".ultra" / "north-star.md").write_text(
        "# North Star\n\n## One-line\nORIGINAL-LEGACY-SNAPSHOT\n",
        encoding="utf-8",
    )
    legacy = run_hook(
        "session_context.py",
        legacy_root,
        {"hook_event_name": "SessionStart"},
        env={"PATH": path_value, "UBP_TEST_REPLACEMENT": replacement},
    )
    legacy_context = json.loads(legacy.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Ultra legacy project intent" in legacy_context
    assert "ORIGINAL-LEGACY-SNAPSHOT" in legacy_context
    assert "MUTATED-DISK-AUTHORITY" not in legacy_context

    fallback_root = make_project(tmp_path / "fallback")
    (fallback_root / ".ultra" / "north-star.md").write_text(
        "# North Star\n\n## Project Direction\n[NEEDS CLARIFICATION]\n",
        encoding="utf-8",
    )
    fallback = run_hook(
        "session_context.py",
        fallback_root,
        {"hook_event_name": "SessionStart"},
        env={"PATH": path_value, "UBP_TEST_REPLACEMENT": replacement},
    )
    fallback_context = json.loads(fallback.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Ultra project brief" in fallback_context
    assert "Build a checkout helper." in fallback_context
    assert "MUTATED-DISK-AUTHORITY" not in fallback_context


def test_session_context_uses_validator_section_spans_not_fenced_heading_examples(tmp_path):
    root = make_project(tmp_path)
    accepted = accepted_v2_north_star().replace(
        "## Problem Reality",
        "```markdown\n## Problem Reality\n\nFENCED-FAKE-REALITY\n```\n\n"
        "## Problem Reality",
        1,
    ).replace(
        "- Reality: Checkout work can drift from buyer value.",
        "- Reality: Checkout work can drift from buyer value.\n\n"
        "```text\nHC-404 [NEEDS RESEARCH: illustrative fenced example]\n```",
        1,
    )
    bind_accepted_v2(root, accepted)

    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})

    assert session.returncode == 0, session.stderr
    context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Ultra accepted North Star v2" in context
    assert "Checkout work can drift from buyer value." in context
    assert "FENCED-FAKE-REALITY" not in context


def test_session_context_validator_bridge_returns_typed_recoverable_failures(tmp_path):
    session_context = load_session_context()
    root = make_project(tmp_path / "project")
    bind_accepted_v2(root, accepted_v2_north_star())
    north_star = root / ".ultra" / "north-star.md"
    validator = NORTH_STAR_VALIDATOR

    timeout_node = write_fake_executable(
        tmp_path / "timeout-node",
        "import threading\nthreading.Event().wait()",
    )
    invalid_json_node = write_fake_executable(
        tmp_path / "invalid-json-node",
        "print('not-json')",
    )
    oversized_node = write_fake_executable(
        tmp_path / "oversized-node",
        "import sys\nsys.stdout.write('x' * 300000)",
    )
    receipt_mismatch_node = write_fake_executable(
        tmp_path / "receipt-mismatch-node",
        "import json, os, sys\n"
        "data = sys.stdin.buffer.read()\n"
        "canonical = os.path.abspath(sys.argv[-1])\n"
        "print(json.dumps({\n"
        "  '$schema': 'ultra-north-star-validation-v1',\n"
        "  'path': canonical,\n"
        "  'valid': False,\n"
        "  'sections': {},\n"
        "  'diagnostics': [],\n"
        "  'input': {\n"
        "    'path': canonical,\n"
        "    'byte_length': len(data),\n"
        "    'sha256': '0' * 64,\n"
        "  },\n"
        "}))\n"
        "sys.exit(1)",
    )
    cases = [
        (
            session_context.run_north_star_validator(
                root,
                north_star,
                north_star.read_bytes(),
                validator=validator,
                node_binary=timeout_node,
                timeout_seconds=1,
            ),
            "north_star_validator_timeout",
        ),
        (
            session_context.run_north_star_validator(
                root,
                north_star,
                north_star.read_bytes(),
                validator=validator,
                node_binary=invalid_json_node,
                timeout_seconds=10,
            ),
            "north_star_validator_invalid_json",
        ),
        (
            session_context.run_north_star_validator(
                root,
                north_star,
                north_star.read_bytes(),
                validator=validator,
                node_binary=oversized_node,
                timeout_seconds=10,
            ),
            "north_star_validator_output_too_large",
        ),
        (
            session_context.run_north_star_validator(
                root,
                north_star,
                north_star.read_bytes(),
                validator=validator,
                node_binary=receipt_mismatch_node,
                timeout_seconds=10,
            ),
            "north_star_validator_input_mismatch",
        ),
        (
            session_context.run_north_star_validator(
                root,
                north_star,
                north_star.read_bytes(),
                validator=tmp_path / "missing-validator.cjs",
            ),
            "north_star_validator_missing",
        ),
    ]
    for report, code in cases:
        assert report["valid"] is False
        assert report["diagnostics"][0]["code"] == code


def test_session_context_rejects_under_ceiling_malformed_accepted_validator_report(tmp_path):
    root = make_project(tmp_path / "project")
    bind_accepted_v2(root, accepted_v2_north_star())

    session = run_hook(
        "session_context.py",
        root,
        {"hook_event_name": "SessionStart"},
        env=malformed_accepted_validator_environment(tmp_path),
    )

    assert session.returncode == 0, session.stderr
    context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "north_star_validator_invalid_report" in context
    assert "Ultra accepted North Star v2" not in context
    assert "Build a checkout helper." in context


def test_session_context_rejects_oversized_malformed_accepted_validator_report_without_crashing(
    tmp_path,
):
    root = make_project(tmp_path / "project")
    sentinel = "MALFORMED-OVERSIZED-ACCEPTED-END"
    oversized = accepted_v2_north_star().replace(
        "Durable checkout intent must survive sessions.",
        f"{'x' * 1_200_000}{sentinel}",
    )
    bind_accepted_v2(root, oversized)

    session = run_hook(
        "session_context.py",
        root,
        {"hook_event_name": "SessionStart"},
        env=malformed_accepted_validator_environment(tmp_path),
    )

    assert session.returncode == 0, session.stderr
    context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "north_star_validator_invalid_report" in context
    assert "Ultra accepted North Star v2" not in context
    assert sentinel not in context
    assert "Build a checkout helper." in context


ACCEPTED_REPORT_STRUCTURE_MUTATIONS = (
    "binding_only_invalid",
    "source_observations_only_invalid",
    "missing_ids",
    "empty_fp",
    "unresolved_fp",
    "invalid_ns",
    "invalid_hc_type",
    "missing_section",
    "extra_section",
    "overlapping_spans",
    "misordered_spans",
    "out_of_bounds_span",
)


def assert_session_context_rejects_structurally_malformed_accepted_report(
    tmp_path: Path,
    north_star: str,
) -> None:
    for mutation in ACCEPTED_REPORT_STRUCTURE_MUTATIONS:
        case_root = tmp_path / mutation
        root = make_project(case_root / "project")
        bind_accepted_v2(root, north_star)

        session = run_hook(
            "session_context.py",
            root,
            {"hook_event_name": "SessionStart"},
            env=structurally_malformed_accepted_validator_environment(
                case_root,
                mutation,
            ),
        )

        assert session.returncode == 0, (mutation, session.stderr)
        context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
        assert "north_star_validator_invalid_report" in context, mutation
        assert "Ultra accepted North Star v2" not in context, mutation
        assert "Ultra accepted North Star v2 requires direct read" not in context, mutation
        assert "Build a checkout helper." in context, mutation


def test_session_context_rejects_under_ceiling_accepted_report_with_invalid_projection(
    tmp_path,
):
    assert_session_context_rejects_structurally_malformed_accepted_report(
        tmp_path,
        accepted_v2_north_star(),
    )


def test_session_context_rejects_reference_only_accepted_report_with_invalid_projection(
    tmp_path,
):
    oversized = accepted_v2_north_star().replace(
        "Durable checkout intent must survive sessions.",
        f"{'x' * 1_200_000}REFERENCE-ONLY-INVALID-PROJECTION",
    )
    assert_session_context_rejects_structurally_malformed_accepted_report(
        tmp_path,
        oversized,
    )


def test_session_context_enforces_one_combined_validator_output_budget(tmp_path):
    session_context = load_session_context()
    root = make_project(tmp_path / "project")
    bind_accepted_v2(root, accepted_v2_north_star())
    north_star = root / ".ultra" / "north-star.md"
    combined_output_node = write_fake_executable(
        tmp_path / "combined-output-node",
        "import json, os, sys\n"
        "report = {\n"
        "  '$schema': 'ultra-north-star-validation-v1',\n"
        "  'path': os.path.abspath(sys.argv[-1]),\n"
        "  'valid': False,\n"
        "  'diagnostics': [],\n"
        "}\n"
        "stdout = json.dumps(report)\n"
        "sys.stdout.write(stdout + (' ' * (700 - len(stdout))))\n"
        "sys.stderr.write('e' * 700)\n"
        "sys.exit(1)",
    )

    report = session_context.run_north_star_validator(
        root,
        north_star,
        north_star.read_bytes(),
        validator=NORTH_STAR_VALIDATOR,
        node_binary=combined_output_node,
        max_output_bytes=1024,
    )

    assert report["valid"] is False
    assert report["diagnostics"][0]["code"] == "north_star_validator_output_too_large"


def test_session_context_terminates_validator_when_streaming_output_crosses_the_limit(tmp_path):
    session_context = load_session_context()
    root = make_project(tmp_path / "project")
    bind_accepted_v2(root, accepted_v2_north_star())
    north_star = root / ".ultra" / "north-star.md"
    completion_marker = tmp_path / "validator-completed"
    streaming_node = write_fake_executable(
        tmp_path / "streaming-node",
        "import pathlib, sys, time\n"
        "sys.stdout.write('x' * 300000)\n"
        "sys.stdout.flush()\n"
        "time.sleep(1)\n"
        f"pathlib.Path({str(completion_marker)!r}).write_text('completed')",
    )

    report = session_context.run_north_star_validator(
        root,
        north_star,
        north_star.read_bytes(),
        validator=NORTH_STAR_VALIDATOR,
        node_binary=streaming_node,
        timeout_seconds=2,
        max_output_bytes=1024,
    )

    assert report["valid"] is False
    assert report["diagnostics"][0]["code"] == "north_star_validator_output_too_large"
    assert not completion_marker.exists()


def test_session_context_matches_javascript_for_every_accepted_section_and_causal_row(tmp_path):
    root = make_project(tmp_path)
    accepted = accepted_v2_north_star()
    mutations = [
        (f"empty {heading}", replace_section_body(accepted, heading, ""))
        for heading in (
            "Acceptance and Revision",
            "Problem Reality",
            "First-Principle Propositions",
            "Value Causal Chain",
            "North Star Outcomes",
            "Hard Constraints",
            "Explicit Exclusions",
            "Uncertainties and Revisit Triggers",
            "Research Trace",
        )
    ]
    mutations.extend([
        (
            "four-cell header",
            accepted.replace(
                "| Chain | First principle | Capability | Observable behavior | Outcome |",
                "| Chain | First principle | Capability | Outcome |",
            ),
        ),
        (
            "four-cell separator",
            accepted.replace(
                "|---|---|---|---|---|",
                "|---|---|---|---|",
            ),
        ),
        (
            "four-cell data row",
            accepted.replace(
                "| VC-1 | `FP-1` | Canonical intent | Another Host resumes checkout work | `NS-01` |",
                "| VC-1 | `FP-1` | Canonical intent | `NS-01` |",
            ),
        ),
        (
            "six-cell data row",
            accepted.replace(
                "| VC-1 | `FP-1` | Canonical intent | Another Host resumes checkout work | `NS-01` |",
                "| VC-1 | `FP-1` | Canonical intent | Extra | Another Host resumes checkout work | `NS-01` |",
            ),
        ),
        (
            "malformed row beside valid row",
            accepted.replace(
                "| VC-1 | `FP-1` | Canonical intent | Another Host resumes checkout work | `NS-01` |",
                "| VC-1 | `FP-1` | Canonical intent | Another Host resumes checkout work | `NS-01` |\n"
                "| VC-2 | `FP-1` | malformed | `NS-01` |",
            ),
        ),
    ])

    for label, candidate in mutations:
        bind_accepted_v2(root, candidate)
        javascript = javascript_north_star_validation(root)
        assert javascript["returncode"] == 1, (label, javascript["report"])
        assert javascript["report"]["valid"] is False, label

        session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
        assert session.returncode == 0, (label, session.stderr)
        context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
        assert "Ultra accepted North Star v2" not in context, label
        assert "Build a checkout helper." in context, label
        if javascript["report"].get("classification") == "accepted":
            assert "publication binding is invalid" in context, label


def test_session_context_references_oversized_accepted_v2_without_semantic_truncation(tmp_path):
    root = make_project(tmp_path)
    sentinel = "END-OF-ONE-POINT-TWO-MEGABYTE-NORTH-STAR"
    oversized = accepted_v2_north_star().replace(
        "Durable checkout intent must survive sessions.",
        f"{'x' * 1_200_000}{sentinel}",
    )
    selected = "\n\n".join(
        f"{heading}:\n{load_common().markdown_section(oversized, heading)}"
        for heading in (
            "Problem Reality",
            "First-Principle Propositions",
            "North Star Outcomes",
            "Hard Constraints",
        )
    )
    selected_bytes = len(selected.encode("utf-8"))
    bind_accepted_v2(root, oversized)

    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
    assert session.returncode == 0, session.stderr
    context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Ultra accepted North Star v2 requires direct read" in context
    assert "Path: `.ultra/north-star.md`" in context
    assert "Revision: `r1`" in context
    assert "Status: `accepted`" in context
    assert f"{selected_bytes} UTF-8 bytes" in context
    assert "32768-byte SessionStart ceiling" in context
    assert "semantic truncation is forbidden" in context
    assert sentinel not in context
    assert len(context.encode("utf-8")) < 32768


def test_session_context_reference_only_output_binds_the_immutable_snapshot_after_path_replacement(
    tmp_path,
):
    real_node = shutil.which("node")
    assert real_node is not None
    root = make_project(tmp_path / "project")
    sentinel = "END-OF-REPLACED-OVERSIZED-NORTH-STAR"
    oversized = accepted_v2_north_star().replace(
        "Durable checkout intent must survive sessions.",
        f"{'x' * 1_200_000}{sentinel}",
    )
    validated_bytes = oversized.encode("utf-8")
    bind_accepted_v2(root, oversized)

    shim_dir = tmp_path / "node-shim"
    shim_dir.mkdir()
    replacement = "# North Star\n\n## One-line\nREPLACED-CANONICAL-PATH\n"
    write_fake_executable(
        shim_dir / "node",
        "import os, pathlib, subprocess, sys\n"
        "data = sys.stdin.buffer.read()\n"
        f"completed = subprocess.run([{real_node!r}, *sys.argv[1:]], input=data, "
        "stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)\n"
        "pathlib.Path(sys.argv[-1]).write_bytes("
        "os.environ['UBP_TEST_REPLACEMENT'].encode('utf-8'))\n"
        "sys.stdout.buffer.write(completed.stdout)\n"
        "sys.stderr.buffer.write(completed.stderr)\n"
        "sys.exit(completed.returncode)",
    )
    path_value = f"{shim_dir}{os.pathsep}{os.environ.get('PATH', '')}"

    session = run_hook(
        "session_context.py",
        root,
        {"hook_event_name": "SessionStart"},
        env={"PATH": path_value, "UBP_TEST_REPLACEMENT": replacement},
    )

    assert session.returncode == 0, session.stderr
    assert (root / ".ultra" / "north-star.md").read_text(encoding="utf-8") == replacement
    context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Ultra accepted North Star v2 requires direct read" in context
    assert (
        "Immutable accepted snapshot: "
        "`.ultra/research/R-1/north-star-v2-r1.accepted.md`"
    ) in context
    assert f"Validated North Star SHA-256: `{hashlib.sha256(validated_bytes).hexdigest()}`" in context
    assert f"Validated North Star byte length: `{len(validated_bytes)}`" in context
    assert "Do not treat different bytes as accepted authority." in context
    assert sentinel not in context
    assert "REPLACED-CANONICAL-PATH" not in context


def test_philosophy_contract_tracks_v2_and_both_legacy_session_fallbacks():
    philosophy = (HOOK_ROOT.parent / "docs" / "PHILOSOPHY.md").read_text(encoding="utf-8")
    assert "## Problem Reality" in philosophy
    assert "## First-Principle Propositions" in philosophy
    assert "## North Star Outcomes" in philosophy
    assert "Status: `accepted`" in philosophy
    assert "v0.26" in philosophy
    assert "## One-line" in philosophy
    assert "32 KiB" in philosophy
    assert "reference-only" in philosophy
    assert "immutable accepted snapshot" in philosophy
    assert "exact validated SHA-256 and byte length" in philosophy
    assert "rejects different bytes as authority" in philosophy
    assert "semantic truncation" in philosophy
    assert "bounded 8 MiB regular-file snapshot" in philosophy
    assert "freshly reopened" in philosophy
    assert "typed repair note" in philosophy


def test_shared_task_reader_classifies_v2_and_both_legacy_ledger_roots(tmp_path):
    common = load_common()
    root = make_project(tmp_path)
    task = json.loads((root / ".ultra" / "tasks.json").read_text(encoding="utf-8"))["tasks"][0]
    cases = (
        ({"$schema": "ultra-task-ledger-v2", "tasks": [task]}, "v2"),
        ({"tasks": [task]}, "legacy_object"),
        ([task], "legacy_array"),
    )

    for payload, classification in cases:
        (root / ".ultra" / "tasks.json").write_text(
            json.dumps(payload),
            encoding="utf-8",
        )
        ledger = common.read_task_ledger(root)
        assert ledger["classification"] == classification
        assert [item["id"] for item in ledger["tasks"]] == ["1"]
        diagnostic_codes = {item["code"] for item in ledger["diagnostics"]}
        assert ("legacy_task_ledger_root" in diagnostic_codes) is classification.startswith(
            "legacy_"
        )


def test_task_reader_accepts_only_documented_legacy_row_compatibility(tmp_path):
    root = make_project(tmp_path)
    ledger_file = root / ".ultra" / "tasks.json"
    task = json.loads(ledger_file.read_text(encoding="utf-8"))["tasks"][0]

    task_with_complexity = {**task, "complexity": 3}
    write_v2_ledger(root, [task_with_complexity])
    v2 = load_common().read_task_ledger(root)
    assert v2["classification"] == "v2"
    assert [item["id"] for item in v2["tasks"]] == ["1"]
    assert "legacy_task_complexity" in {item["code"] for item in v2["diagnostics"]}

    legacy_task = dict(task)
    legacy_task.pop("change_id")
    legacy_task["change_ref"] = ".ultra/changes/active/C-01/intent.md"
    ledger_file.write_text(json.dumps({"tasks": [legacy_task]}), encoding="utf-8")
    legacy = load_common().read_task_ledger(root)
    assert legacy["classification"] == "legacy_object"
    assert [item["id"] for item in legacy["tasks"]] == ["1"]
    assert {item["code"] for item in legacy["diagnostics"]} >= {
        "legacy_task_ledger_root",
        "legacy_task_change_ref",
    }


def test_malformed_v2_task_row_invalidates_the_whole_selection_with_typed_diagnostic(
    tmp_path,
):
    mutations = {}

    def mutate(name, change):
        mutations[name] = change

    mutate("non_object", lambda task: "not-an-object")
    mutate("missing_key", lambda task: {key: value for key, value in task.items() if key != "title"})
    mutate("wrong_type", lambda task: {**task, "title": 42})
    mutate("invalid_status", lambda task: {**task, "status": "complete"})
    mutate("unknown_key", lambda task: {**task, "semantic_score": 100})
    mutate("bad_dependencies_type", lambda task: {**task, "dependencies": "1"})
    mutate("bad_dependency_id", lambda task: {**task, "dependencies": ["../dep"]})
    mutate("bad_task_id", lambda task: {**task, "id": "bad/id"})
    mutate("bad_context_path", lambda task: {**task, "context_file": "../../outside.md"})
    mutate("bad_trace_path", lambda task: {**task, "trace_to": "../outside.md#checkout"})
    mutate("bad_change_id", lambda task: {**task, "change_id": "bad/id"})

    for name, change in mutations.items():
        root = make_project(tmp_path / name)
        ledger_file = root / ".ultra" / "tasks.json"
        task = json.loads(ledger_file.read_text(encoding="utf-8"))["tasks"][0]
        safe_pending = {
            **task,
            "id": "safe-pending",
            "title": "Must not be salvaged from a malformed ledger",
            "status": "pending",
            "context_file": ".ultra/contexts/task-safe-pending.md",
        }
        write_typed_task_context(root, "safe-pending")
        write_v2_ledger(root, [change(dict(task)), safe_pending])

        report = load_common().read_task_ledger(root)
        assert report["classification"] == "invalid", name
        assert report["tasks"] == [], name
        assert "task_ledger_row_invalid" in {
            item["code"] for item in report["diagnostics"]
        }, name

        session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
        assert session.returncode == 0, (name, session.stderr)
        context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
        assert "`task_ledger_row_invalid`" in context, name
        assert "Current task" not in context, name
        assert "AC-OWNER" not in context, name


def test_v2_typed_acceptance_is_injected_without_inventing_a_second_status_writer(tmp_path):
    root = make_project(tmp_path)
    ledger = json.loads((root / ".ultra" / "tasks.json").read_text(encoding="utf-8"))
    task = ledger["tasks"][0]
    write_v2_ledger(root, [task])
    context_file = write_typed_task_context(root, "1")
    context_before = context_file.read_bytes()
    ledger_before = (root / ".ultra" / "tasks.json").read_bytes()

    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
    recall = run_hook(
        "mid_workflow_recall.py",
        root,
        {"hook_event_name": "PreToolUse", "tool_name": "Edit"},
    )
    compact = run_hook("compact_context.py", root, {"hook_event_name": "PreCompact"})
    changed = root / "tests" / "typed-acceptance.test.js"
    changed.parent.mkdir()
    changed.write_text("// typed acceptance remains canonical elsewhere\n", encoding="utf-8")
    post_edit = run_hook(
        "post_edit_guard.py",
        root,
        {
            "hook_event_name": "PostToolUse",
            "tool_name": "Edit",
            "tool_input": {"file_path": str(changed)},
        },
    )

    assert session.returncode == recall.returncode == compact.returncode == post_edit.returncode == 0
    session_context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    recall_context = json.loads(recall.stdout)["hookSpecificOutput"]["additionalContext"]
    snapshot = (root / ".ultra" / ".runtime" / "compact-snapshot.md").read_text(encoding="utf-8")
    for output in (session_context, recall_context, snapshot):
        assert "| ID | Criterion | Verification type | Required evidence |" in output
        assert "`command`" in output
        assert "`inspection`" in output
        assert "`owner-judgment`" in output
        assert "`external-observation`" in output
        assert "`legacy_context_status`" not in output
    assert "Continue from the typed acceptance table." in session_context
    assert "Continue from the typed acceptance table." in snapshot

    progress = json.loads((root / ".ultra" / "progress" / "1.json").read_text(encoding="utf-8"))
    assert set(progress["evidence"]) == {
        "tests_written", "tests_passed", "persistence_real", "feature_flags_audit",
        "vertical_slice", "spec_trace",
    }
    assert "acceptance" not in progress
    assert "verification_type" not in progress
    assert context_file.read_bytes() == context_before
    assert (root / ".ultra" / "tasks.json").read_bytes() == ledger_before


def test_legacy_context_status_is_always_diagnostic_and_mismatch_never_blocks_context(
    tmp_path,
):
    for observed_status, expect_mismatch in (
        ("in_progress", False),
        ("completed", True),
    ):
        root = make_project(tmp_path / observed_status)
        ledger = json.loads((root / ".ultra" / "tasks.json").read_text(encoding="utf-8"))
        write_v2_ledger(root, ledger["tasks"])
        write_typed_task_context(root, "1", legacy_status=observed_status)

        session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
        recall = run_hook(
            "mid_workflow_recall.py",
            root,
            {"hook_event_name": "PreToolUse", "tool_name": "Edit"},
        )
        compact = run_hook("compact_context.py", root, {"hook_event_name": "PreCompact"})

        assert session.returncode == recall.returncode == compact.returncode == 0
        outputs = (
            json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"],
            json.loads(recall.stdout)["hookSpecificOutput"]["additionalContext"],
            (root / ".ultra" / ".runtime" / "compact-snapshot.md").read_text(encoding="utf-8"),
        )
        for output in outputs:
            assert "`legacy_context_status`" in output
            assert ("`legacy_context_status_mismatch`" in output) is expect_mismatch
            assert "AC-OWNER" in output
        assert "Continue from the typed acceptance table." in outputs[2]


def test_legacy_checklist_is_injected_without_guessing_a_verification_type(tmp_path):
    root = make_project(tmp_path)
    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})

    assert session.returncode == 0, session.stderr
    context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    task_context = context.split("Current task 1 acceptance:\n", 1)[1]
    assert "- [ ] Public checkout returns 201." in task_context
    assert "Verification type" not in task_context
    assert "`command`" not in task_context
    assert "`legacy_context_status`" in task_context


def test_ledger_status_does_not_resurrect_a_completed_task_from_legacy_context(tmp_path):
    root = make_project(tmp_path)
    ultra = root / ".ultra"
    original = json.loads((ultra / "tasks.json").read_text(encoding="utf-8"))["tasks"][0]
    original["status"] = "completed"
    next_task = {
        **original,
        "id": "next",
        "title": "Next task",
        "status": "pending",
        "dependencies": ["1"],
        "context_file": ".ultra/contexts/task-next.md",
    }
    write_v2_ledger(root, [original, next_task])
    write_typed_task_context(root, "next")

    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})

    assert session.returncode == 0, session.stderr
    context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    # A completed task never revives, and its pending successor is only a
    # frontier candidate until an owner invocation activates it.
    assert "Current task" not in context
    assert "Public checkout returns 201." not in context
    assert "`legacy_context_status`" not in context


def test_v2_ledger_multiple_writers_and_invalid_graphs_are_task_silent(
    tmp_path,
):
    multiple_root = make_project(tmp_path / "multiple")
    base = json.loads(
        (multiple_root / ".ultra" / "tasks.json").read_text(encoding="utf-8")
    )["tasks"][0]
    second = {
        **base,
        "id": "second",
        "context_file": ".ultra/contexts/task-second.md",
    }
    write_v2_ledger(multiple_root, [base, second])
    write_typed_task_context(multiple_root, "1")
    write_typed_task_context(multiple_root, "second")

    multiple_session = run_hook(
        "session_context.py",
        multiple_root,
        {"hook_event_name": "SessionStart"},
    )
    multiple_context = json.loads(multiple_session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Current task" not in multiple_context
    assert "`task_in_progress_ambiguous`" in multiple_context
    assert "`1`, `second`" in multiple_context
    multiple_recall = run_hook(
        "mid_workflow_recall.py",
        multiple_root,
        {"hook_event_name": "PreToolUse", "tool_name": "Edit"},
    )
    assert "`task_in_progress_ambiguous`" in multiple_recall.stdout
    assert "`1`, `second`" in multiple_recall.stdout

    frontier_root = make_project(tmp_path / "frontier")
    frontier_base = json.loads(
        (frontier_root / ".ultra" / "tasks.json").read_text(encoding="utf-8")
    )["tasks"][0]
    blocked = {
        **frontier_base,
        "id": "blocked",
        "status": "pending",
        "dependencies": ["missing"],
        "context_file": ".ultra/contexts/task-blocked.md",
    }
    ready = {
        **frontier_base,
        "id": "ready",
        "status": "pending",
        "dependencies": [],
        "context_file": ".ultra/contexts/task-ready.md",
    }
    write_v2_ledger(frontier_root, [blocked, ready])
    write_typed_task_context(frontier_root, "blocked")
    write_typed_task_context(frontier_root, "ready")

    frontier_session = run_hook(
        "session_context.py",
        frontier_root,
        {"hook_event_name": "SessionStart"},
    )
    frontier_context = json.loads(frontier_session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Current task" not in frontier_context
    assert "AC-OWNER" not in frontier_context
    assert "`task_ledger_dependency_missing`" in frontier_context
    assert "missing task `missing`" in frontier_context


def test_task_ledger_symlink_is_not_consumed_as_status_authority(tmp_path):
    root = make_project(tmp_path / "project")
    ledger_file = root / ".ultra" / "tasks.json"
    outside = tmp_path / "outside-tasks.json"
    outside.write_text(ledger_file.read_text(encoding="utf-8"), encoding="utf-8")
    ledger_file.unlink()
    ledger_file.symlink_to(outside)

    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})

    assert session.returncode == 0, session.stderr
    context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Current task" not in context
    assert "Public checkout returns 201." not in context


def test_post_edit_rejects_a_traversal_task_id_without_writing_outside_progress(tmp_path):
    root = make_project(tmp_path / "project")
    ledger_file = root / ".ultra" / "tasks.json"
    ledger = json.loads(ledger_file.read_text(encoding="utf-8"))
    ledger["tasks"][0]["id"] = "../../../escaped"
    ledger["tasks"].append({
        "id": "safe-pending",
        "change_id": "C-01",
        "title": "Must not replace the unsafe active writer",
        "type": "feature",
        "priority": "P0",
        "status": "pending",
        "dependencies": [],
        "context_file": ".ultra/contexts/task-safe-pending.md",
        "trace_to": ".ultra/specs/product.md#checkout",
    })
    ledger_file.write_text(json.dumps(ledger), encoding="utf-8")
    write_typed_task_context(root, "safe-pending")
    changed = root / "src" / "checkout.js"
    changed.parent.mkdir()
    changed.write_text("export const checkout = true;\n", encoding="utf-8")

    result = run_hook(
        "post_edit_guard.py",
        root,
        {
            "hook_event_name": "PostToolUse",
            "tool_name": "Edit",
            "tool_input": {"file_path": str(changed)},
        },
    )

    assert result.returncode == 0, result.stderr
    assert not (tmp_path / "escaped.json").exists()
    assert not (root / ".ultra" / "progress").exists()


def test_post_edit_never_follows_a_progress_parent_symlink(tmp_path):
    root = make_project(tmp_path / "project")
    outside = tmp_path / "outside-progress"
    outside.mkdir()
    (root / ".ultra" / "progress").symlink_to(outside, target_is_directory=True)
    changed = root / "src" / "checkout.js"
    changed.parent.mkdir()
    changed.write_text("export const checkout = true;\n", encoding="utf-8")

    result = run_hook(
        "post_edit_guard.py",
        root,
        {
            "hook_event_name": "PostToolUse",
            "tool_name": "Edit",
            "tool_input": {"file_path": str(changed)},
        },
    )

    assert result.returncode == 0, result.stderr
    assert list(outside.iterdir()) == []
    assert "`progress_snapshot_symlink`" in result.stdout


def test_compact_snapshot_never_reads_or_writes_through_a_runtime_symlink(tmp_path):
    root = make_project(tmp_path / "project")
    outside = tmp_path / "outside-runtime"
    outside.mkdir()
    sentinel = "OUTSIDE-COMPACT-SNAPSHOT-SENTINEL"
    outside_snapshot = outside / "compact-snapshot.md"
    outside_snapshot.write_text(sentinel, encoding="utf-8")
    (root / ".ultra" / ".runtime").symlink_to(outside, target_is_directory=True)

    restored = run_hook(
        "compact_context.py",
        root,
        {"hook_event_name": "PostCompact"},
    )
    assert restored.returncode == 0, restored.stderr
    assert sentinel not in restored.stdout
    assert "`compact_snapshot_read_symlink`" in restored.stdout

    outside_snapshot.unlink()
    saved = run_hook(
        "compact_context.py",
        root,
        {"hook_event_name": "PreCompact"},
    )
    assert saved.returncode == 0, saved.stderr
    assert not outside_snapshot.exists()
    assert "`compact_snapshot_write_symlink`" in saved.stdout


def test_compact_git_missing_retains_task_recovery_and_exits_zero(tmp_path):
    root = make_project(tmp_path)

    result = run_hook(
        "compact_context.py",
        root,
        {"hook_event_name": "PreCompact"},
        env={"PATH": ""},
    )

    assert result.returncode == 0, result.stderr
    snapshot = (root / ".ultra" / ".runtime" / "compact-snapshot.md").read_text(
        encoding="utf-8"
    )
    for output in (result.stdout, snapshot):
        assert "`compact_git_missing`" in output
    assert "Public checkout returns 201." in snapshot
    assert "Write the public-seam regression." in snapshot


def test_compact_git_timeout_is_bounded_and_retains_task_recovery(tmp_path):
    root = make_project(tmp_path / "project")
    shim = tmp_path / "shim"
    shim.mkdir()
    git_pid = tmp_path / "timeout-git.pid"
    completion_marker = tmp_path / "timeout-git-completed"
    write_fake_executable(
        shim / "git",
        "import os, pathlib, sys, time\n"
        "if sys.argv[1:] == ['rev-parse', 'HEAD']:\n"
        f"    pathlib.Path({str(git_pid)!r}).write_text(str(os.getpid()))\n"
        "    time.sleep(6)\n"
        f"    pathlib.Path({str(completion_marker)!r}).write_text('completed')\n"
        "elif sys.argv[1:] == ['status', '--short']:\n"
        "    print(' M deterministic-timeout-sentinel')",
    )

    result = run_hook(
        "compact_context.py",
        root,
        {"hook_event_name": "PreCompact"},
        env={"PATH": f"{shim}{os.pathsep}{os.environ.get('PATH', '')}"},
        timeout=8.0,
    )

    assert result.returncode == 0, result.stderr
    snapshot = (root / ".ultra" / ".runtime" / "compact-snapshot.md").read_text(
        encoding="utf-8"
    )
    for output in (result.stdout, snapshot):
        assert "`compact_git_timeout`" in output
    assert "Public checkout returns 201." in snapshot
    assert "Write the public-seam regression." in snapshot
    assert "deterministic-timeout-sentinel" in snapshot
    assert git_pid.is_file()
    process_id = int(git_pid.read_text(encoding="utf-8"))
    try:
        os.kill(process_id, 0)
    except ProcessLookupError:
        pass
    else:
        raise AssertionError("timed-out Git process was not terminated and reaped")
    assert not completion_marker.exists()


def test_compact_git_combined_output_is_bounded_and_process_is_reaped(tmp_path):
    root = make_project(tmp_path / "project")
    shim = tmp_path / "shim"
    shim.mkdir()
    git_pid = tmp_path / "oversize-git.pid"
    completion_marker = tmp_path / "oversize-git-completed"
    write_fake_executable(
        shim / "git",
        "import os, pathlib, sys, time\n"
        "if sys.argv[1:] == ['rev-parse', 'HEAD']:\n"
        f"    pathlib.Path({str(git_pid)!r}).write_text(str(os.getpid()))\n"
        "    sys.stdout.write('o' * 180000)\n"
        "    sys.stdout.flush()\n"
        "    sys.stderr.write('e' * 180000)\n"
        "    sys.stderr.flush()\n"
        "    time.sleep(2)\n"
        f"    pathlib.Path({str(completion_marker)!r}).write_text('completed')\n"
        "elif sys.argv[1:] == ['status', '--short']:\n"
        "    print(' M bounded-output-sentinel')",
    )

    result = run_hook(
        "compact_context.py",
        root,
        {"hook_event_name": "PreCompact"},
        env={"PATH": f"{shim}{os.pathsep}{os.environ.get('PATH', '')}"},
        timeout=5.0,
    )

    assert result.returncode == 0, result.stderr
    snapshot = (root / ".ultra" / ".runtime" / "compact-snapshot.md").read_text(
        encoding="utf-8"
    )
    repair = (
        "Retry PreCompact after reducing Git command output below the 262144-byte "
        "combined stdout/stderr ceiling; canonical task Acceptance Criteria and the "
        "navigational Resume Note remain recoverable."
    )
    for output in (result.stdout, snapshot):
        assert "`compact_git_output_too_large`" in output
        assert f"Repair: {repair}" in output
    assert "Public checkout returns 201." in snapshot
    assert "Write the public-seam regression." in snapshot
    assert "bounded-output-sentinel" in snapshot
    assert git_pid.is_file()
    process_id = int(git_pid.read_text(encoding="utf-8"))
    try:
        os.kill(process_id, 0)
    except ProcessLookupError:
        pass
    else:
        raise AssertionError("oversize Git process was not terminated and reaped")
    assert not completion_marker.exists()


def test_compact_git_os_error_is_typed_without_crashing_main(tmp_path, monkeypatch):
    root = make_project(tmp_path)
    compact = load_compact_context()
    emitted = []

    def fail_git(*_args, **_kwargs):
        raise OSError("simulated git execution failure")

    monkeypatch.setattr(compact.subprocess, "Popen", fail_git)
    monkeypatch.setattr(
        compact,
        "read_payload",
        lambda: {"cwd": str(root), "hook_event_name": "PreCompact"},
    )
    monkeypatch.setattr(compact, "project_root", lambda _payload: root)
    monkeypatch.setattr(compact, "emit_context", lambda event, text: emitted.append((event, text)))

    assert compact.main() == 0
    snapshot = (root / ".ultra" / ".runtime" / "compact-snapshot.md").read_text(
        encoding="utf-8"
    )
    assert emitted
    assert "`compact_git_execution_error`" in emitted[0][1]
    assert "`compact_git_execution_error`" in snapshot
    assert "Public checkout returns 201." in snapshot
    assert "Write the public-seam regression." in snapshot


def test_post_edit_progress_fifo_and_oversize_inputs_fail_bounded_without_replacement(tmp_path):
    fifo_root = make_project(tmp_path / "fifo-project")
    fifo_progress = fifo_root / ".ultra" / "progress"
    fifo_progress.mkdir()
    fifo_file = fifo_progress / "1.json"
    os.mkfifo(fifo_file)
    changed = fifo_root / "src" / "checkout.js"
    changed.parent.mkdir()
    changed.write_text("export const checkout = true;\n", encoding="utf-8")

    fifo_result = run_hook(
        "post_edit_guard.py",
        fifo_root,
        {
            "hook_event_name": "PostToolUse",
            "tool_name": "Edit",
            "tool_input": {"file_path": str(changed)},
        },
        timeout=1.0,
    )
    assert fifo_result.returncode == 0, fifo_result.stderr
    assert fifo_file.is_fifo()
    assert "`progress_snapshot_not_regular`" in fifo_result.stdout

    oversize_root = make_project(tmp_path / "oversize-project")
    oversize_progress = oversize_root / ".ultra" / "progress"
    oversize_progress.mkdir()
    oversize_file = oversize_progress / "1.json"
    oversize_bytes = b"{" + (b"x" * (1024 * 1024)) + b"}"
    oversize_file.write_bytes(oversize_bytes)
    changed = oversize_root / "src" / "checkout.js"
    changed.parent.mkdir()
    changed.write_text("export const checkout = true;\n", encoding="utf-8")

    oversize_result = run_hook(
        "post_edit_guard.py",
        oversize_root,
        {
            "hook_event_name": "PostToolUse",
            "tool_name": "Edit",
            "tool_input": {"file_path": str(changed)},
        },
    )
    assert oversize_result.returncode == 0, oversize_result.stderr
    assert oversize_file.read_bytes() == oversize_bytes
    assert "`progress_snapshot_oversize`" in oversize_result.stdout


def test_post_edit_trace_fifo_and_oversize_sources_are_bounded_missing_observations(tmp_path):
    fifo_root = make_project(tmp_path / "fifo-project")
    fifo_trace = fifo_root / ".ultra" / "specs" / "product.md"
    fifo_trace.unlink()
    os.mkfifo(fifo_trace)
    changed = fifo_root / "src" / "checkout.js"
    changed.parent.mkdir()
    changed.write_text("export const checkout = true;\n", encoding="utf-8")

    fifo_result = run_hook(
        "post_edit_guard.py",
        fifo_root,
        {
            "hook_event_name": "PostToolUse",
            "tool_name": "Edit",
            "tool_input": {"file_path": str(changed)},
        },
        timeout=1.0,
    )
    assert fifo_result.returncode == 0, fifo_result.stderr
    fifo_progress = json.loads(
        (fifo_root / ".ultra" / "progress" / "1.json").read_text(encoding="utf-8")
    )
    assert fifo_progress["evidence"]["spec_trace"] == "missing"
    assert "`trace_source_snapshot_not_regular`" in fifo_result.stdout
    assert (
        "Still non-observed: tests_written, tests_passed, persistence_real, "
        "feature_flags_audit, vertical_slice, spec_trace."
    ) in fifo_result.stdout

    oversize_root = make_project(tmp_path / "oversize-project")
    oversize_trace = oversize_root / ".ultra" / "specs" / "product.md"
    oversize_trace.write_bytes(
        b"# Product\n\n" + (b"x" * (8 * 1024 * 1024)) + b"\n## Checkout\n"
    )
    changed = oversize_root / "src" / "checkout.js"
    changed.parent.mkdir()
    changed.write_text("export const checkout = true;\n", encoding="utf-8")

    oversize_result = run_hook(
        "post_edit_guard.py",
        oversize_root,
        {
            "hook_event_name": "PostToolUse",
            "tool_name": "Edit",
            "tool_input": {"file_path": str(changed)},
        },
    )
    assert oversize_result.returncode == 0, oversize_result.stderr
    oversize_progress = json.loads(
        (oversize_root / ".ultra" / "progress" / "1.json").read_text(encoding="utf-8")
    )
    assert oversize_progress["evidence"]["spec_trace"] == "missing"
    assert "`trace_source_snapshot_oversize`" in oversize_result.stdout
    assert (
        "Still non-observed: tests_written, tests_passed, persistence_real, "
        "feature_flags_audit, vertical_slice, spec_trace."
    ) in oversize_result.stdout


def test_all_task_context_hooks_publish_each_legacy_migration_diagnostic(tmp_path):
    root = make_project(tmp_path)
    ledger_file = root / ".ultra" / "tasks.json"
    ledger = json.loads(ledger_file.read_text(encoding="utf-8"))
    ledger["tasks"][0]["complexity"] = 7
    ledger_file.write_text(json.dumps(ledger), encoding="utf-8")
    context_file = root / ".ultra" / "contexts" / "task-1.md"
    context_file.write_text(
        context_file.read_text(encoding="utf-8").replace(
            "> **Status**: in_progress",
            "> **Status**: in_progress | **Priority**: P0 | **Complexity**: 7",
        ),
        encoding="utf-8",
    )

    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
    recall = run_hook(
        "mid_workflow_recall.py",
        root,
        {"hook_event_name": "PreToolUse", "tool_name": "Edit"},
    )
    compact = run_hook("compact_context.py", root, {"hook_event_name": "PreCompact"})

    assert session.returncode == recall.returncode == compact.returncode == 0
    outputs = (
        json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"],
        json.loads(recall.stdout)["hookSpecificOutput"]["additionalContext"],
        (root / ".ultra" / ".runtime" / "compact-snapshot.md").read_text(encoding="utf-8"),
    )
    expected_codes = {
        "legacy_task_ledger_root",
        "legacy_task_complexity",
        "legacy_context_status",
        "legacy_context_complexity",
    }
    for output in outputs:
        for code in expected_codes:
            assert f"`{code}`" in output
        assert "Public checkout returns 201." in output
    assert "Write the public-seam regression." in outputs[2]


def test_all_task_hooks_reject_unavailable_or_unstable_context_before_task_publication_or_progress(
    tmp_path,
):
    cases = {
        "missing": "task_context_snapshot_missing",
        "symlink": "task_context_snapshot_symlink",
        "ancestor-symlink": "task_context_snapshot_symlink",
        "oversize": "task_context_snapshot_oversize",
        "replacement": "task_context_snapshot_changed",
        "read-error": "task_context_snapshot_read_error",
        "invalid-utf8": "task_context_invalid_utf8",
    }
    if hasattr(os, "mkfifo"):
        cases["fifo"] = "task_context_snapshot_not_regular"
    if hasattr(socket, "AF_UNIX"):
        cases["socket"] = "task_context_snapshot_not_regular"

    hook_calls = (
        ("session_context.py", {"hook_event_name": "SessionStart"}),
        (
            "mid_workflow_recall.py",
            {"hook_event_name": "PreToolUse", "tool_name": "Edit"},
        ),
        ("compact_context.py", {"hook_event_name": "PreCompact"}),
        (
            "post_edit_guard.py",
            {
                "hook_event_name": "PostToolUse",
                "tool_name": "Edit",
                "tool_input": {"file_path": ""},
            },
        ),
    )

    def emitted_context(result):
        if not result.stdout:
            return ""
        return json.loads(result.stdout)["hookSpecificOutput"]["additionalContext"]

    observations = {}
    for case, expected_code in cases.items():
        root = make_project(tmp_path / case)
        ledger_file = root / ".ultra" / "tasks.json"
        ledger = json.loads(ledger_file.read_text(encoding="utf-8"))
        write_v2_ledger(root, ledger["tasks"])
        ledger_before = ledger_file.read_bytes()
        context_file = root / ".ultra" / "contexts" / "task-1.md"
        context_before = context_file.read_bytes()
        changed = root / "src" / "checkout.js"
        changed.parent.mkdir()
        changed.write_text("export const checkout = true;\n", encoding="utf-8")

        replacement_source = root / ".ultra" / "contexts" / "task-1-replacement.md"
        replacement_shim = root / "replacement-shim"
        case_env = None
        if case == "missing":
            context_file.unlink()
        elif case == "symlink":
            context_file.unlink()
            outside = root / "outside-context.md"
            outside.write_text(
                "# Task 1\n\n## Acceptance Criteria\n\nSYMLINK-CONTEXT-SENTINEL\n",
                encoding="utf-8",
            )
            context_file.symlink_to(outside)
        elif case == "ancestor-symlink":
            contexts = context_file.parent
            ordinary_contexts = contexts.with_name("contexts-ordinary")
            contexts.rename(ordinary_contexts)
            contexts.symlink_to(ordinary_contexts.name, target_is_directory=True)
        elif case == "fifo":
            context_file.unlink()
            os.mkfifo(context_file)
        elif case == "socket":
            context_file.unlink()
            endpoint = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            previous_directory = Path.cwd()
            try:
                os.chdir(context_file.parent)
                endpoint.bind(context_file.name)
            finally:
                os.chdir(previous_directory)
                endpoint.close()
        elif case == "oversize":
            context_file.write_bytes(
                b"OVERSIZE-CONTEXT-SENTINEL\n" + b"x" * (8 * 1024 * 1024)
            )
        elif case == "invalid-utf8":
            context_file.write_bytes(b"\xffINVALID-UTF8-CONTEXT-SENTINEL\n")
        elif case == "replacement":
            replacement_shim.mkdir()
            (replacement_shim / "sitecustomize.py").write_text(
                "import os\n"
                "_original_open = os.open\n"
                "_replaced = False\n"
                "def _replace_during_open(path, flags, mode=0o777, *, dir_fd=None):\n"
                "    global _replaced\n"
                "    descriptor = _original_open(path, flags, mode, dir_fd=dir_fd)\n"
                "    target = os.environ.get('UBP_TEST_CONTEXT_REPLACEMENT_TARGET')\n"
                "    source = os.environ.get('UBP_TEST_CONTEXT_REPLACEMENT_SOURCE')\n"
                "    if (not _replaced and target and source and "
                "os.fspath(path) == os.path.basename(target)):\n"
                "        _replaced = True\n"
                "        os.replace(source, target)\n"
                "    return descriptor\n"
                "os.open = _replace_during_open\n",
                encoding="utf-8",
            )
            case_env = {
                "PYTHONPATH": (
                    f"{replacement_shim}{os.pathsep}"
                    f"{os.environ.get('PYTHONPATH', '')}"
                ),
                "UBP_TEST_CONTEXT_REPLACEMENT_TARGET": str(context_file),
                "UBP_TEST_CONTEXT_REPLACEMENT_SOURCE": str(replacement_source),
            }
        elif case == "read-error":
            read_error_shim = root / "read-error-shim"
            read_error_shim.mkdir()
            (read_error_shim / "sitecustomize.py").write_text(
                "import errno, os\n"
                "_original_open = os.open\n"
                "def _deny_context_read(path, flags, mode=0o777, *, dir_fd=None):\n"
                "    target = os.environ.get('UBP_TEST_CONTEXT_READ_ERROR_TARGET')\n"
                "    if (target and dir_fd is not None and "
                "os.fspath(path) == os.path.basename(target)):\n"
                "        raise PermissionError(errno.EACCES, 'injected EACCES', target)\n"
                "    return _original_open(path, flags, mode, dir_fd=dir_fd)\n"
                "os.open = _deny_context_read\n",
                encoding="utf-8",
            )
            case_env = {
                "PYTHONPATH": (
                    f"{read_error_shim}{os.pathsep}"
                    f"{os.environ.get('PYTHONPATH', '')}"
                ),
                "UBP_TEST_CONTEXT_READ_ERROR_TARGET": str(context_file),
            }

        case_outputs = []
        for hook_name, payload in hook_calls:
            hook_payload = json.loads(json.dumps(payload))
            if hook_name == "post_edit_guard.py":
                hook_payload["tool_input"]["file_path"] = str(changed)
            if case == "replacement":
                context_file.write_text(
                    "# Task 1\n\n## Acceptance Criteria\n\n"
                    "ORIGINAL-CONTEXT-SENTINEL\n\n## Resume Note\n\n"
                    "ORIGINAL-RESUME-SENTINEL\n",
                    encoding="utf-8",
                )
                replacement_source.write_text(
                    "# Task 1\n\n## Acceptance Criteria\n\n"
                    "REPLACEMENT-CONTEXT-SENTINEL\n\n## Resume Note\n\n"
                    "REPLACEMENT-RESUME-SENTINEL\n",
                    encoding="utf-8",
                )
            result = run_hook(
                hook_name,
                root,
                hook_payload,
                case_env,
                timeout=10,
            )
            assert result.returncode == 0, (case, hook_name, result.stderr)
            case_outputs.append((hook_name, emitted_context(result)))

        compact_snapshot = (
            root / ".ultra" / ".runtime" / "compact-snapshot.md"
        ).read_text(encoding="utf-8")
        observations[case] = {
            hook_name: output for hook_name, output in case_outputs
        }
        observations[case]["compact-snapshot"] = compact_snapshot

        for hook_name, output in case_outputs:
            assert f"`{expected_code}`" in output, (case, hook_name, output)
            assert f"Repair: {TASK_CONTEXT_REPAIR}" in output, (
                case,
                hook_name,
                output,
            )
        assert f"`{expected_code}`" in compact_snapshot, case
        assert f"Repair: {TASK_CONTEXT_REPAIR}" in compact_snapshot, case
        for output in (*[value for _, value in case_outputs], compact_snapshot):
            assert "Public checkout returns 201." not in output, case
            assert "Write the public-seam regression." not in output, case
            assert "ORIGINAL-CONTEXT-SENTINEL" not in output, case
            assert "ORIGINAL-RESUME-SENTINEL" not in output, case
            assert "REPLACEMENT-CONTEXT-SENTINEL" not in output, case
            assert "REPLACEMENT-RESUME-SENTINEL" not in output, case
            assert "SYMLINK-CONTEXT-SENTINEL" not in output, case
            assert "OVERSIZE-CONTEXT-SENTINEL" not in output, case
            assert "INVALID-UTF8-CONTEXT-SENTINEL" not in output, case
            if case == "read-error":
                assert "injected EACCES" in output, (case, output)
        assert ledger_file.read_bytes() == ledger_before, case
        if case in {"ancestor-symlink", "read-error"}:
            assert context_file.read_bytes() == context_before, case
        assert not (root / ".ultra" / "progress").exists(), case

    assert set(observations) == set(cases)


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
        "type": "feature",
        "priority": "P0",
        "status": "in_progress",
        "dependencies": [],
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
        "type": "feature",
        "priority": "P0",
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
    # C-01 has no `in_progress` row left: the pending frontier is not active.
    assert "Current task" not in context
    assert "CONFLICTING-LEGACY-SENTINEL" not in context
    assert "Public checkout returns 201." not in context


def test_hooks_do_not_activate_a_dependency_ready_frontier_task(tmp_path):
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
        "type": "feature",
        "priority": "P0",
        "status": "pending",
        "dependencies": [],
        "context_file": ".ultra/contexts/task-dep.md",
        "trace_to": ".ultra/specs/product.md#checkout",
    })
    write_v2_ledger(root, ledger["tasks"])
    (ultra / "contexts" / "task-dep.md").write_text(
        "# Dependency\n\n> **Status**: pending\n\n"
        "## Acceptance Criteria\n\n- [ ] DEPENDENCY-READY-SENTINEL\n\n"
        "## Resume Note\n\nRun the frontier task next.\n",
        encoding="utf-8",
    )
    changed = root / "docs" / "V027-HARNESS-LOOP-INCIDENT-REMEDIATION.zh-CN.md"
    changed.parent.mkdir()
    changed.write_text("# Incident document\n", encoding="utf-8")

    selection = load_common().current_task_selection(root)
    assert selection["task"] is None
    assert selection["diagnostics"] == []

    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
    recall = run_hook(
        "mid_workflow_recall.py",
        root,
        {"hook_event_name": "PreToolUse", "tool_name": "Edit"},
    )
    compact = run_hook("compact_context.py", root, {"hook_event_name": "PreCompact"})
    post_edit = run_hook(
        "post_edit_guard.py",
        root,
        {
            "hook_event_name": "PostToolUse",
            "tool_name": "Edit",
            "tool_input": {"file_path": str(changed)},
        },
    )
    assert session.returncode == recall.returncode == compact.returncode == post_edit.returncode == 0

    session_context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Current task" not in session_context
    assert "DEPENDENCY-READY-SENTINEL" not in session_context
    assert "Run the frontier task next." not in session_context
    assert recall.stdout == ""
    snapshot = (ultra / ".runtime" / "compact-snapshot.md").read_text(encoding="utf-8")
    assert "Task: none" in snapshot
    assert "DEPENDENCY-READY-SENTINEL" not in snapshot
    assert post_edit.stdout == ""
    assert not (ultra / "progress").exists()


def test_hooks_stay_task_silent_when_multiple_tasks_claim_in_progress(tmp_path):
    root = make_project(tmp_path)
    ultra = root / ".ultra"
    (ultra / "contexts" / "task-1.md").write_text(
        "# Task 1\n\n> **Status**: in_progress\n\n"
        "## Acceptance Criteria\n\n- [ ] PRIMARY-STARTED-WORK-SENTINEL\n\n"
        "## Resume Note\n\n"
        "The public-seam regression exists in tests/task-1-started.test.js; continue "
        "from its observed failure.\n\n"
        "## Completion\n\nPending.\n",
        encoding="utf-8",
    )
    started = root / "tests"
    started.mkdir()
    (started / "task-1-started.test.js").write_text(
        "throw new Error('task 1 red');\n",
        encoding="utf-8",
    )
    ledger_file = ultra / "tasks.json"
    ledger = json.loads(ledger_file.read_text(encoding="utf-8"))
    ledger["tasks"].append({
        "id": "also-running",
        "change_id": "C-01",
        "title": "Conflicting writer",
        "type": "feature",
        "priority": "P0",
        "status": "in_progress",
        "dependencies": [],
        "context_file": ".ultra/contexts/task-also-running.md",
        "trace_to": ".ultra/specs/product.md#checkout",
    })
    ledger_file.write_text(json.dumps(ledger), encoding="utf-8")
    (ultra / "contexts" / "task-also-running.md").write_text(
        "# Conflicting writer\n\n> **Status**: in_progress\n\n"
        "## Acceptance Criteria\n\n- [ ] CONFLICTING-WRITER-SENTINEL\n\n"
        "## Resume Note\n\n"
        "The partial implementation exists in src/also-running-started.js; preserve "
        "it before resuming this exact task.\n",
        encoding="utf-8",
    )
    partial = root / "src"
    partial.mkdir()
    (partial / "also-running-started.js").write_text(
        "export const alsoRunning = true;\n",
        encoding="utf-8",
    )

    expected_repair = (
        "Inspect each named task's canonical context and Resume Note together with "
        "current Git/worktree evidence before changing any ledger row. Do not demote "
        "an `in_progress` task merely to restore unique selection. A conflicting row "
        "may return to `pending` only through an explicit owner/Plan correction that "
        "establishes the task never started. If multiple tasks contain real partial "
        "work, keep every such row `in_progress`; Hooks stay task-silent and "
        "progress-silent. Recover by explicitly owner-invoking `ultra-dev` for one "
        "exact task id, or obtain owner-authorized `ultra-plan` reconciliation that "
        "preserves each task's work, using a separate worktree when needed. Completing "
        "any task still requires final review, canonical v2 evidence, context "
        "publication, ledger write, and readback; then retry task selection."
    )

    selection = load_common().current_task_selection(root)
    matching = [
        diagnostic
        for diagnostic in selection["diagnostics"]
        if diagnostic.get("code") == "task_in_progress_ambiguous"
    ]
    assert selection["task"] is None
    assert len(matching) == 1
    assert matching[0]["task_ids"] == ["1", "also-running"]
    assert matching[0]["repair"] == expected_repair

    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
    recall = run_hook(
        "mid_workflow_recall.py",
        root,
        {"hook_event_name": "PreToolUse", "tool_name": "Edit"},
    )
    compact = run_hook("compact_context.py", root, {"hook_event_name": "PreCompact"})
    changed = root / "src" / "checkout.js"
    changed.parent.mkdir(exist_ok=True)
    changed.write_text("export const checkout = true;\n", encoding="utf-8")
    post_edit = run_hook(
        "post_edit_guard.py",
        root,
        {
            "hook_event_name": "PostToolUse",
            "tool_name": "Edit",
            "tool_input": {"file_path": str(changed)},
        },
    )

    assert session.returncode == recall.returncode == compact.returncode == 0
    assert post_edit.returncode == 0
    outputs = (
        json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"],
        json.loads(recall.stdout)["hookSpecificOutput"]["additionalContext"],
        compact.stdout
        + (ultra / ".runtime" / "compact-snapshot.md").read_text(encoding="utf-8"),
        json.loads(post_edit.stdout)["hookSpecificOutput"]["additionalContext"],
    )
    for output in outputs:
        assert "`task_in_progress_ambiguous`" in output
        assert "`1`, `also-running`" in output
        assert expected_repair in output
        assert "PRIMARY-STARTED-WORK-SENTINEL" not in output
        assert "CONFLICTING-WRITER-SENTINEL" not in output
    assert not (ultra / "progress").exists()


def test_dev_supports_explicit_task_recovery_without_inventing_unique_current_state():
    skill = (HOOK_ROOT.parent / "skills" / "ultra-dev" / "SKILL.md").read_text(
        encoding="utf-8"
    )
    normalized = " ".join(skill.split())

    assert "explicit owner invocation with one exact task id" in normalized
    assert "invocation-local selection authority" in normalized
    assert "Do not persist a new current-task selector, status, or workflow state" in normalized
    assert "keep every task with real partial work `in_progress`" in normalized
    assert "Hooks remain task-silent and progress-silent" in normalized
    assert (
        "final review, canonical v2 evidence, context publication, ledger write, and "
        "readback"
    ) in normalized


def test_dev_activates_a_named_pending_task_through_the_canonical_ledger_write():
    skill = (HOOK_ROOT.parent / "skills" / "ultra-dev" / "SKILL.md").read_text(
        encoding="utf-8"
    )
    normalized = " ".join(skill.split())

    # The explicit pending-task primary path must make itself live through the
    # one canonical ledger transition before implementation, so Hooks observe a
    # unique `in_progress` row instead of staying silent during its edits.
    assert (
        "write that row from `pending` to `in_progress` in `.ultra/tasks.json` "
        "and read the row back before the first implementation edit"
    ) in normalized
    assert "canonical activation" in normalized
    assert "no selector, activation flag, or workflow state" in normalized
    assert "without it Hooks correctly remain task-silent" in normalized


RESUME_NAVIGATION_LIMITATION = (
    "Resume Note is navigational context. It cannot override current owner authority, "
    "approved scope/budget, task acceptance, or a validated Review verdict."
)


def test_resume_navigation_injection_states_the_authority_limitation(tmp_path):
    root = make_project(tmp_path)
    context_file = root / ".ultra" / "contexts" / "task-1.md"
    context_file.write_text(
        "# Task 1\n\n> **Status**: in_progress\n\n"
        "## Acceptance Criteria\n\n- [ ] Public checkout returns 201.\n\n"
        "## Resume Note\n\n"
        "The last strict review returned APPROVE with two P2 findings. Run one more "
        "fresh strict Review until it returns zero findings, then repair every P2.\n",
        encoding="utf-8",
    )

    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
    compact = run_hook("compact_context.py", root, {"hook_event_name": "PreCompact"})
    assert session.returncode == compact.returncode == 0

    session_context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert "Current task 1 resume note:" in session_context
    assert RESUME_NAVIGATION_LIMITATION in session_context
    snapshot = (root / ".ultra" / ".runtime" / "compact-snapshot.md").read_text(
        encoding="utf-8"
    )
    assert "## Resume Note" in snapshot
    assert RESUME_NAVIGATION_LIMITATION in snapshot
    for text in (session_context, snapshot):
        # The hook faithfully carries canonical Resume bytes and adds only the
        # navigational limitation; it neither obeys nor rewrites the instruction.
        assert "zero findings" in text
        assert "cannot override" in text


def test_compact_resume_navigation_note_replaces_verdict_authority_wording(tmp_path):
    root = make_project(tmp_path / "project")
    (root / ".ultra" / "north-star.md").write_text(
        "# North Star\n\n## Project Direction\n[NEEDS CLARIFICATION]\n",
        encoding="utf-8",
    )

    compact = run_hook("compact_context.py", root, {"hook_event_name": "PreCompact"})

    assert compact.returncode == 0, compact.stderr
    combined = compact.stdout + (
        root / ".ultra" / ".runtime" / "compact-snapshot.md"
    ).read_text(encoding="utf-8")
    # The temporary project is not a Git repository, so observation fails with a
    # typed nonzero diagnostic whose repair text carries the navigation rule.
    assert "compact_git_nonzero" in combined
    assert "Resume Note remain authoritative" not in combined
    assert "navigational" in combined


WORKFLOW_LAUNCH_DIRECTIVE = re.compile(
    r"(?:launch|invoke|run|start|execute)\s+(?:a\s+|an\s+)?(?:fresh\s+|new\s+)?"
    r"(?:strict\s+)?(?:six-?lens\s+)?(?:review|ultra-[a-z]+)",
    re.IGNORECASE,
)


def test_review_route_is_absent_from_every_hook_output(tmp_path):
    scenarios = {}

    idle_root = make_project(tmp_path / "unique-in-progress")
    scenarios["unique-in-progress"] = idle_root

    frontier_root = make_project(tmp_path / "pending-frontier")
    ledger = json.loads(
        (frontier_root / ".ultra" / "tasks.json").read_text(encoding="utf-8")
    )
    ledger["tasks"][0]["status"] = "pending"
    (frontier_root / ".ultra" / "tasks.json").write_text(
        json.dumps(ledger), encoding="utf-8"
    )
    scenarios["pending-frontier"] = frontier_root

    ambiguous_root = make_project(tmp_path / "ambiguous")
    ambiguous_ledger = json.loads(
        (ambiguous_root / ".ultra" / "tasks.json").read_text(encoding="utf-8")
    )
    second = {
        **ambiguous_ledger["tasks"][0],
        "id": "second",
        "context_file": ".ultra/contexts/task-second.md",
    }
    (ambiguous_root / ".ultra" / "contexts" / "task-second.md").write_text(
        "# Task second\n\n## Acceptance Criteria\n\n- [ ] SECOND-SENTINEL\n",
        encoding="utf-8",
    )
    (ambiguous_root / ".ultra" / "tasks.json").write_text(
        json.dumps({"$schema": "ultra-task-ledger-v2", "tasks": [
            ambiguous_ledger["tasks"][0], second,
        ]}),
        encoding="utf-8",
    )
    scenarios["ambiguous"] = ambiguous_root

    broken_root = make_project(tmp_path / "unreadable-ledger")
    (broken_root / ".ultra" / "tasks.json").write_text("{", encoding="utf-8")
    scenarios["unreadable-ledger"] = broken_root

    for label, root in scenarios.items():
        changed = root / "src" / "checkout.js"
        changed.parent.mkdir(exist_ok=True)
        changed.write_text("export const checkout = true;\n", encoding="utf-8")
        outputs = []
        for name, payload in (
            ("session_context.py", {"hook_event_name": "SessionStart"}),
            (
                "mid_workflow_recall.py",
                {"hook_event_name": "PreToolUse", "tool_name": "Edit"},
            ),
            ("compact_context.py", {"hook_event_name": "PreCompact"}),
            (
                "post_edit_guard.py",
                {
                    "hook_event_name": "PostToolUse",
                    "tool_name": "Edit",
                    "tool_input": {"file_path": str(changed)},
                },
            ),
            (
                "block_dangerous_commands.py",
                {
                    "hook_event_name": "PreToolUse",
                    "tool_name": "Bash",
                    "tool_input": {"command": "node --test tests/"},
                },
            ),
        ):
            result = run_hook(name, root, payload)
            assert result.returncode == 0, (label, name, result.stderr)
            combined = result.stdout
            snapshot = root / ".ultra" / ".runtime" / "compact-snapshot.md"
            if name == "compact_context.py" and snapshot.exists():
                combined += snapshot.read_text(encoding="utf-8")
            outputs.append((name, combined))

        for name, combined in outputs:
            assert "ultra-review" not in combined, (label, name)
            assert not WORKFLOW_LAUNCH_DIRECTIVE.search(combined), (label, name)


def test_trusted_exact_invocation_is_invocation_local_and_writes_no_selector(tmp_path):
    common = load_common()
    root = make_project(tmp_path)
    ledger_file = root / ".ultra" / "tasks.json"
    ledger = json.loads(ledger_file.read_text(encoding="utf-8"))
    ledger["tasks"][0]["status"] = "completed"
    ledger["tasks"][0]["dependencies"] = []
    ledger["tasks"].append({
        **ledger["tasks"][0],
        "id": "frontier",
        "status": "pending",
        "dependencies": ["1"],
        "context_file": ".ultra/contexts/task-frontier.md",
    })
    ledger_file.write_text(
        json.dumps({"$schema": "ultra-task-ledger-v2", "tasks": ledger["tasks"]}),
        encoding="utf-8",
    )
    (root / ".ultra" / "contexts" / "task-frontier.md").write_text(
        "# Task frontier\n\n## Acceptance Criteria\n\n- [ ] FRONTIER-SENTINEL\n",
        encoding="utf-8",
    )
    ledger_before = ledger_file.read_bytes()
    contexts_before = sorted(
        (root / ".ultra" / "contexts").rglob("*"),
        key=lambda item: str(item),
    )

    default_selection = common.current_task_selection(root)
    assert default_selection["task"] is None

    invoked = common.current_task_selection(root, trusted_task_id="frontier")
    assert invoked["task"] is not None
    assert invoked["task"]["id"] == "frontier"

    # The invocation is not persisted: a plain selection and the filesystem
    # show no activation state afterwards.
    after = common.current_task_selection(root)
    assert after["task"] is None
    assert ledger_file.read_bytes() == ledger_before
    contexts_after = sorted(
        (root / ".ultra" / "contexts").rglob("*"),
        key=lambda item: str(item),
    )
    assert [str(item) for item in contexts_after] == [
        str(item) for item in contexts_before
    ]
    assert not (root / ".ultra" / "progress").exists()

    # Trusted invocation cannot bypass ledger authority: unknown task ids,
    # blocked dependents, and completed rows stay typed and silent.
    unknown = common.current_task_selection(root, trusted_task_id="missing")
    assert unknown["task"] is None
    assert any(
        diagnostic.get("code", "").startswith("task_invocation_")
        for diagnostic in unknown["diagnostics"]
    )
    blocked = common.current_task_selection(root, trusted_task_id="1")
    assert blocked["task"] is None
    assert any(
        diagnostic.get("code") == "task_invocation_not_activatable"
        for diagnostic in blocked["diagnostics"]
    )


def test_trusted_exact_invocation_takes_precedence_over_in_progress_rows(tmp_path):
    common = load_common()

    # Probe A: task `1` is the unique in_progress row while `second` is a
    # dependency-ready pending task. Requesting `second` must select `second`,
    # never silently fall through to the unique in_progress row.
    probe_a = make_project(tmp_path / "probe-a")
    probe_a_ledger = json.loads(
        (probe_a / ".ultra" / "tasks.json").read_text(encoding="utf-8")
    )["tasks"]
    second = {
        **probe_a_ledger[0],
        "id": "second",
        "status": "pending",
        "dependencies": [],
        "context_file": ".ultra/contexts/task-second.md",
    }
    (probe_a / ".ultra" / "contexts" / "task-second.md").write_text(
        "# Task second\n\n## Acceptance Criteria\n\n- [ ] PROBE-A-SENTINEL\n",
        encoding="utf-8",
    )
    write_v2_ledger(probe_a, [probe_a_ledger[0], second])
    selection_a = common.current_task_selection(probe_a, trusted_task_id="second")
    assert selection_a["task"] is not None
    assert selection_a["task"]["id"] == "second"
    assert not any(
        diagnostic.get("code") == "task_invocation_unknown"
        for diagnostic in selection_a["diagnostics"]
    )

    # Probe B: two rows claim in_progress while the trusted invocation names
    # one of them exactly. The invocation-local id resolves the ambiguity; the
    # selection never returns null with `task_in_progress_ambiguous`.
    probe_b = make_project(tmp_path / "probe-b")
    probe_b_ledger = json.loads(
        (probe_b / ".ultra" / "tasks.json").read_text(encoding="utf-8")
    )["tasks"]
    also_running = {
        **probe_b_ledger[0],
        "id": "second",
        "context_file": ".ultra/contexts/task-second.md",
    }
    (probe_b / ".ultra" / "contexts" / "task-second.md").write_text(
        "# Task second\n\n## Acceptance Criteria\n\n- [ ] PROBE-B-SENTINEL\n",
        encoding="utf-8",
    )
    write_v2_ledger(probe_b, [probe_b_ledger[0], also_running])
    selection_b = common.current_task_selection(probe_b, trusted_task_id="second")
    assert selection_b["task"] is not None
    assert selection_b["task"]["id"] == "second"
    assert not any(
        diagnostic.get("code") == "task_in_progress_ambiguous"
        for diagnostic in selection_b["diagnostics"]
    )
    ledger_bytes = (probe_b / ".ultra" / "tasks.json").read_bytes()
    followup = common.current_task_selection(probe_b)
    assert followup["task"] is None
    assert any(
        diagnostic.get("code") == "task_in_progress_ambiguous"
        for diagnostic in followup["diagnostics"]
    )
    assert (probe_b / ".ultra" / "tasks.json").read_bytes() == ledger_bytes


def test_hooks_stay_task_silent_for_an_invalid_active_change_id(tmp_path, monkeypatch):
    root = make_project(tmp_path)
    ultra = root / ".ultra"
    valid = ultra / "changes" / "active" / "C-01"
    invalid = ultra / "changes" / "active" / "bad id"
    valid.rename(invalid)
    ledger_file = ultra / "tasks.json"
    ledger = json.loads(ledger_file.read_text(encoding="utf-8"))
    ledger["tasks"][0]["change_id"] = "bad id"
    ledger_file.write_text(json.dumps(ledger), encoding="utf-8")

    common = load_common()
    original_reader = common.read_stable_project_file_snapshot
    intent_reads = []

    def count_intent_reads(project, relative, **kwargs):
        if kwargs.get("code_prefix") == "active_change_intent":
            intent_reads.append(str(relative))
        return original_reader(project, relative, **kwargs)

    monkeypatch.setattr(common, "read_stable_project_file_snapshot", count_intent_reads)
    selection = common.current_task_selection(root)
    matching = [
        diagnostic
        for diagnostic in selection["diagnostics"]
        if diagnostic.get("code") == "active_change_id_invalid"
    ]

    session = run_hook("session_context.py", root, {"hook_event_name": "SessionStart"})
    context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
    assert selection["task"] is None
    assert len(matching) == 1
    assert matching[0]["repair"] == (
        "Rename the active Change and its ledger change_id references to one matching "
        "normalized identifier, then retry task selection."
    )
    assert intent_reads == []
    assert "Ship a real checkout path." in context
    assert "Public checkout returns 201." not in context


def test_task_hooks_reject_symlinked_active_change_surfaces_with_typed_repair(tmp_path):
    for surface, expected_code in (
        ("directory", "active_change_directory_symlink"),
        ("intent", "active_change_intent_symlink"),
    ):
        root = make_project(tmp_path / surface)
        ultra = root / ".ultra"
        active_change = ultra / "changes" / "active" / "C-01"
        abandoned_change = ultra / "changes" / "abandoned" / "C-01"
        abandoned_change.parent.mkdir(parents=True)
        if surface == "directory":
            active_change.rename(abandoned_change)
            active_change.symlink_to(abandoned_change, target_is_directory=True)
        else:
            abandoned_change.mkdir()
            active_intent = active_change / "intent.md"
            abandoned_intent = abandoned_change / "intent.md"
            active_intent.rename(abandoned_intent)
            active_intent.symlink_to(abandoned_intent)

        common = load_common()
        selection = common.current_task_selection(root)
        matching = [
            diagnostic
            for diagnostic in selection["diagnostics"]
            if diagnostic.get("code") == expected_code
        ]
        assert selection["task"] is None
        assert len(matching) == 1
        assert matching[0]["repair"] == (
            "Remove the symlink and restore one ordinary active Change directory "
            "containing its own regular intent.md. To abandon the Change instead, obtain "
            "explicit owner authorization and use `ultra-change` to append the exact "
            "`## Abandonment` closure before moving the Change to "
            "`.ultra/changes/abandoned/<change_id>`."
        )

        session = run_hook(
            "session_context.py",
            root,
            {"hook_event_name": "SessionStart"},
        )
        recall = run_hook(
            "mid_workflow_recall.py",
            root,
            {"hook_event_name": "PreToolUse", "tool_name": "Edit"},
        )
        compact = run_hook(
            "compact_context.py",
            root,
            {"hook_event_name": "PreCompact"},
        )
        changed = root / "src" / "checkout.js"
        changed.parent.mkdir()
        changed.write_text("export const checkout = true;\n", encoding="utf-8")
        post_edit = run_hook(
            "post_edit_guard.py",
            root,
            {
                "hook_event_name": "PostToolUse",
                "tool_name": "Edit",
                "tool_input": {"file_path": str(changed)},
            },
        )

        assert session.returncode == recall.returncode == compact.returncode == 0
        assert post_edit.returncode == 0
        session_context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
        recall_context = json.loads(recall.stdout)["hookSpecificOutput"]["additionalContext"]
        compact_context = (
            ultra / ".runtime" / "compact-snapshot.md"
        ).read_text(encoding="utf-8")
        for output in (session_context, recall_context, compact_context):
            assert f"`{expected_code}`" in output
            assert "Public checkout returns 201." not in output
            assert "Write the public-seam regression." not in output
        assert f"`{expected_code}`" in post_edit.stdout
        assert "Public checkout returns 201." not in post_edit.stdout
        assert "Write the public-seam regression." not in post_edit.stdout
        assert not (ultra / "progress").exists()


def test_task_hooks_reject_unsafe_active_ancestors_and_broken_intents(tmp_path):
    cases = (
        ("ultra-symlink", "active_change_root_symlink"),
        ("changes-symlink", "active_change_root_symlink"),
        ("active-symlink", "active_change_root_symlink"),
        ("missing-intent", "active_change_intent_missing"),
        ("fifo-intent", "active_change_intent_not_regular"),
    )
    for case, expected_code in cases:
        root = make_project(tmp_path / case)
        ultra = root / ".ultra"
        if case == "ultra-symlink":
            ordinary = root / ".ultra-ordinary"
            ultra.rename(ordinary)
            ultra.symlink_to(ordinary.name, target_is_directory=True)
        elif case == "changes-symlink":
            changes = ultra / "changes"
            ordinary = ultra / "changes-ordinary"
            changes.rename(ordinary)
            changes.symlink_to(ordinary.name, target_is_directory=True)
        elif case == "active-symlink":
            active = ultra / "changes" / "active"
            ordinary = ultra / "changes" / "active-ordinary"
            active.rename(ordinary)
            active.symlink_to(ordinary.name, target_is_directory=True)
        elif case == "missing-intent":
            (ultra / "changes" / "active" / "C-01" / "intent.md").unlink()
        elif case == "fifo-intent":
            intent = ultra / "changes" / "active" / "C-01" / "intent.md"
            intent.unlink()
            os.mkfifo(intent)

        selection = load_common().current_task_selection(root)
        matching = [
            diagnostic
            for diagnostic in selection["diagnostics"]
            if diagnostic.get("code") == expected_code
        ]
        assert selection["task"] is None, case
        assert len(matching) == 1, case
        assert matching[0].get("repair"), case

        session = run_hook(
            "session_context.py",
            root,
            {"hook_event_name": "SessionStart"},
        )
        recall = run_hook(
            "mid_workflow_recall.py",
            root,
            {"hook_event_name": "PreToolUse", "tool_name": "Edit"},
        )
        compact = run_hook(
            "compact_context.py",
            root,
            {"hook_event_name": "PreCompact"},
        )
        changed = root / "src" / "checkout.js"
        changed.parent.mkdir()
        changed.write_text("export const checkout = true;\n", encoding="utf-8")
        post_edit = run_hook(
            "post_edit_guard.py",
            root,
            {
                "hook_event_name": "PostToolUse",
                "tool_name": "Edit",
                "tool_input": {"file_path": str(changed)},
            },
        )

        assert session.returncode == recall.returncode == compact.returncode == 0, case
        assert post_edit.returncode == 0, case
        session_context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
        recall_context = json.loads(recall.stdout)["hookSpecificOutput"]["additionalContext"]
        snapshot_file = ultra / ".runtime" / "compact-snapshot.md"
        compact_context = compact.stdout
        if snapshot_file.is_file():
            compact_context += snapshot_file.read_text(encoding="utf-8")
        for output in (session_context, recall_context, compact_context, post_edit.stdout):
            assert f"`{expected_code}`" in output, (case, output)
            assert "Public checkout returns 201." not in output, case
            assert "Write the public-seam regression." not in output, case
        assert not (ultra / "progress").exists(), case


def test_active_change_unreadable_intent_keeps_task_selection_recoverable(tmp_path, monkeypatch):
    root = make_project(tmp_path)
    common = load_common()
    original_reader = common.read_stable_project_file_snapshot

    def unreadable_intent(project, relative, **kwargs):
        if kwargs.get("code_prefix") == "active_change_intent":
            return None, {
                "code": "active_change_intent_read_error",
                "message": "Active Change intent could not be read.",
                "path": str(project / relative),
            }
        return original_reader(project, relative, **kwargs)

    monkeypatch.setattr(common, "read_stable_project_file_snapshot", unreadable_intent)

    selection = common.current_task_selection(root)

    assert selection["task"] is None
    matching = [
        diagnostic
        for diagnostic in selection["diagnostics"]
        if diagnostic.get("code") == "active_change_intent_read_error"
    ]
    assert len(matching) == 1
    assert matching[0].get("repair")


def test_active_change_directory_snapshot_revalidates_after_scan(tmp_path, monkeypatch):
    root = make_project(tmp_path)
    common = load_common()
    original_snapshot = common._directory_entries_snapshot
    calls = 0

    def mutate_after_initial_scan(descriptor, *, max_entries):
        nonlocal calls
        calls += 1
        entries = original_snapshot(descriptor, max_entries=max_entries)
        if calls == 1:
            changed = root / ".ultra" / "changes" / "active" / "C-02"
            changed.mkdir()
            (changed / "intent.md").write_text("# Change C-02\n", encoding="utf-8")
        return entries

    monkeypatch.setattr(common, "_directory_entries_snapshot", mutate_after_initial_scan)

    selection = common.current_task_selection(root)

    assert selection["task"] is None
    matching = [
        diagnostic
        for diagnostic in selection["diagnostics"]
        if diagnostic.get("code") == "active_change_root_changed"
    ]
    assert len(matching) == 1
    assert matching[0].get("repair")


def test_directory_entries_snapshot_uses_bounded_fd_iteration(monkeypatch):
    common = load_common()
    ceiling = 3

    class FakeStat:
        def __init__(self, index):
            self.st_dev = 7
            self.st_ino = index
            self.st_mode = 0o100644
            self.st_size = index
            self.st_mtime_ns = 100 + index
            self.st_ctime_ns = 200 + index

    class FakeEntry:
        def __init__(self, index, name=None):
            self.index = index
            self.name = name or f"entry-{index}"

        def stat(self, *, follow_symlinks):
            assert follow_symlinks is False
            return FakeStat(self.index)

    class FakeScandir:
        def __init__(self, entries):
            self.entries = iter(entries)
            self.consumed = 0

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def __iter__(self):
            return self

        def __next__(self):
            entry = next(self.entries)
            self.consumed += 1
            return entry

    iterator = FakeScandir(FakeEntry(index) for index in range(1, 1_000_001))

    def reject_unbounded_listdir(*_args, **_kwargs):
        raise AssertionError("directory snapshots must not call os.listdir")

    monkeypatch.setattr(common.os, "listdir", reject_unbounded_listdir)
    monkeypatch.setattr(common.os, "scandir", lambda descriptor: iterator)

    try:
        common._directory_entries_snapshot(17, max_entries=ceiling)
    except common._SnapshotInvariantError as error:
        assert error.kind == "oversize"
    else:
        raise AssertionError("an iterator above the entry ceiling must be rejected")

    assert iterator.consumed == ceiling + 1

    finite_iterator = FakeScandir((
        FakeEntry(2, "zeta"),
        FakeEntry(1, "alpha"),
    ))
    monkeypatch.setattr(common.os, "scandir", lambda descriptor: finite_iterator)

    assert common._directory_entries_snapshot(17, max_entries=ceiling) == [
        {
            "name": "alpha",
            "identity": (7, 1, 0o100644, 1, 101, 201),
            "mode": 0o100644,
        },
        {
            "name": "zeta",
            "identity": (7, 2, 0o100644, 2, 102, 202),
            "mode": 0o100644,
        },
    ]
    assert finite_iterator.consumed == 2


def test_project_relative_paths_and_ledger_traces_reject_host_specific_forms(tmp_path):
    common = load_common()
    invalid_paths = {
        "nul": ".ultra/specs/\0product.md",
        "backslash": r"..\outside.md",
        "drive-relative": "C:outside.md",
        "unc-like": "//server/share/product.md",
        "absolute": "/tmp/product.md",
        "traversal": ".ultra/specs/../product.md",
        "empty-segment": ".ultra//specs/product.md",
        "dot-segment": ".ultra/./specs/product.md",
        "trailing-empty": ".ultra/specs/product.md/",
    }
    helper_accepted = []
    ledger_accepted = []
    ledger_problems = {}
    expected_problems = ["invalid_trace_to"]
    expected_repair = (
        "Repair task ledger row 0 by resolving these exact problems: "
        "invalid_trace_to; then retry task selection."
    )
    expected_rendered = (
        "- `task_ledger_row_invalid`: Task ledger row 0 has an invalid mechanical "
        "shape; repair the row before task selection.\n"
        f"  Repair: {expected_repair}"
    )

    for case, invalid_path in invalid_paths.items():
        if common.project_relative_path(invalid_path, ultra_default=True) is not None:
            helper_accepted.append(case)

        root = make_project(tmp_path / case)
        task = json.loads(
            (root / ".ultra" / "tasks.json").read_text(encoding="utf-8")
        )["tasks"][0]
        task["trace_to"] = f"{invalid_path}#checkout"
        write_v2_ledger(root, [task])
        report = common.read_task_ledger(root)
        if report["classification"] != "invalid":
            ledger_accepted.append(case)
        matching = [
            diagnostic
            for diagnostic in report["diagnostics"]
            if diagnostic.get("code") == "task_ledger_row_invalid"
        ]
        ledger_problems[case] = matching[0].get("problems", []) if matching else []

        session = run_hook(
            "session_context.py",
            root,
            {"hook_event_name": "SessionStart"},
        )
        recall = run_hook(
            "mid_workflow_recall.py",
            root,
            {"hook_event_name": "PreToolUse", "tool_name": "Edit"},
        )
        compact = run_hook(
            "compact_context.py",
            root,
            {"hook_event_name": "PreCompact"},
        )
        changed = root / "src" / "checkout.js"
        changed.parent.mkdir()
        changed.write_text("export const checkout = true;\n", encoding="utf-8")
        post_edit = run_hook(
            "post_edit_guard.py",
            root,
            {
                "hook_event_name": "PostToolUse",
                "tool_name": "Edit",
                "tool_input": {"file_path": str(changed)},
            },
        )

        assert len(matching) == 1, case
        assert matching[0]["problems"] == expected_problems, case
        assert matching[0].get("repair") == expected_repair, case
        assert session.returncode == recall.returncode == compact.returncode == 0, case
        assert post_edit.returncode == 0, case
        compact_context = (
            root / ".ultra" / ".runtime" / "compact-snapshot.md"
        ).read_text(encoding="utf-8")
        if compact.stdout:
            compact_context += json.loads(compact.stdout)["hookSpecificOutput"][
                "additionalContext"
            ]
        outputs = (
            json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"],
            json.loads(recall.stdout)["hookSpecificOutput"]["additionalContext"],
            compact_context,
            json.loads(post_edit.stdout)["hookSpecificOutput"]["additionalContext"],
        )
        for output in outputs:
            assert expected_rendered in output, case
            assert "Public checkout returns 201." not in output, case
            assert "Write the public-seam regression." not in output, case
        assert not (root / ".ultra" / "progress").exists(), case

    assert helper_accepted == []
    assert ledger_accepted == []
    assert ledger_problems == {
        case: expected_problems for case in invalid_paths
    }


def test_task_hooks_reject_every_malformed_active_entry_before_intent_reads(
    tmp_path,
):
    entry_kinds = ["file"]
    if hasattr(os, "mkfifo"):
        entry_kinds.append("fifo")
    if hasattr(socket, "AF_UNIX"):
        entry_kinds.append("socket")
    entry_kinds.extend(("symlink", "directory"))
    observations = {}
    expected = {}

    def emitted_context(result):
        if not result.stdout:
            return ""
        return json.loads(result.stdout)["hookSpecificOutput"]["additionalContext"]

    for entry_kind in entry_kinds:
        placements = ["replacement", "sibling"]
        if entry_kind in {"fifo", "socket"}:
            placements.append("packaged-marker")
        elif entry_kind in {"symlink", "directory"}:
            placements = ["packaged-marker"]
        for placement in placements:
            case = f"{placement}-{entry_kind}"
            root = make_project(tmp_path / case)
            ultra = root / ".ultra"
            ledger = json.loads((ultra / "tasks.json").read_text(encoding="utf-8"))
            write_v2_ledger(root, ledger["tasks"])
            active = ultra / "changes" / "active"
            entry_name = {
                "replacement": "C-01",
                "sibling": "stray",
                "packaged-marker": ".gitkeep",
            }[placement]
            entry = active / entry_name
            if placement == "replacement":
                shutil.rmtree(entry)
            if entry_kind == "fifo":
                os.mkfifo(entry)
            elif entry_kind == "socket":
                endpoint = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                previous_directory = Path.cwd()
                try:
                    os.chdir(active)
                    endpoint.bind(entry_name)
                finally:
                    os.chdir(previous_directory)
                    endpoint.close()
            elif entry_kind == "symlink":
                entry.symlink_to("C-01", target_is_directory=True)
            elif entry_kind == "directory":
                entry.mkdir()
            else:
                entry.write_text("MALFORMED-ACTIVE-ENTRY\n", encoding="utf-8")

            common = load_common()
            original_reader = common.read_stable_project_file_snapshot
            intent_reads = []

            def count_intent_reads(project, relative, **kwargs):
                if kwargs.get("code_prefix") == "active_change_intent":
                    intent_reads.append(str(relative))
                return original_reader(project, relative, **kwargs)

            common.read_stable_project_file_snapshot = count_intent_reads
            selection = common.current_task_selection(root)
            expected_code = (
                "active_change_marker_not_regular"
                if placement == "packaged-marker"
                else "active_change_entry_not_directory"
            )
            matching = [
                diagnostic
                for diagnostic in selection["diagnostics"]
                if diagnostic.get("code") == expected_code
            ]

            session = run_hook(
                "session_context.py",
                root,
                {"hook_event_name": "SessionStart"},
            )
            recall = run_hook(
                "mid_workflow_recall.py",
                root,
                {"hook_event_name": "PreToolUse", "tool_name": "Edit"},
            )
            compact = run_hook(
                "compact_context.py",
                root,
                {"hook_event_name": "PreCompact"},
            )
            changed = root / "src" / "checkout.js"
            changed.parent.mkdir()
            changed.write_text("export const checkout = true;\n", encoding="utf-8")
            post_edit = run_hook(
                "post_edit_guard.py",
                root,
                {
                    "hook_event_name": "PostToolUse",
                    "tool_name": "Edit",
                    "tool_input": {"file_path": str(changed)},
                },
            )
            outputs = [
                emitted_context(session),
                emitted_context(recall),
                emitted_context(compact)
                + (ultra / ".runtime" / "compact-snapshot.md").read_text(
                    encoding="utf-8"
                ),
                emitted_context(post_edit),
            ]
            if placement == "packaged-marker":
                repair = (
                    "Remove malformed .ultra/changes/active/.gitkeep or replace it with "
                    "an ordinary regular non-symlink file, then retry task selection."
                )
                diagnostic = {
                    "code": expected_code,
                    "message": (
                        "Active Change marker `.gitkeep` must be an ordinary regular "
                        "non-symlink file."
                    ),
                    "path": str(entry),
                    "repair": repair,
                }
            else:
                repair = (
                    f"Remove or move `{entry_name}` out of .ultra/changes/active if it is "
                    "stray, or restore it as one ordinary active Change directory containing "
                    "its own regular intent.md; then retry task selection."
                )
                diagnostic = {
                    "code": expected_code,
                    "message": (
                        f"Active Change entry `{entry_name}` must be an ordinary directory."
                    ),
                    "path": str(entry),
                    "repair": repair,
                }
            observations[case] = {
                "task_id": (
                    selection["task"].get("id") if selection["task"] else None
                ),
                "diagnostics": matching,
                "intent_read_count": len(intent_reads),
                "returncodes": [
                    session.returncode,
                    recall.returncode,
                    compact.returncode,
                    post_edit.returncode,
                ],
                "repair_rendered": [
                    f"`{expected_code}`" in output
                    and f"Repair: {repair}" in output
                    for output in outputs
                ],
                "task_body_leaked": any(
                    "Public checkout returns 201." in output
                    or "Write the public-seam regression." in output
                    for output in outputs
                ),
                "progress_exists": (ultra / "progress").exists(),
            }
            expected[case] = {
                "task_id": None,
                "diagnostics": [diagnostic],
                "intent_read_count": 0,
                "returncodes": [0, 0, 0, 0],
                "repair_rendered": [True, True, True, True],
                "task_body_leaked": False,
                "progress_exists": False,
            }

    assert observations == expected


def test_stable_ambiguous_active_root_is_reported_before_any_intent_body_read(
    tmp_path,
    monkeypatch,
):
    root = make_project(tmp_path)
    active = root / ".ultra" / "changes" / "active"
    expected_change_ids = [f"C-{index:02d}" for index in range(64)]
    (active / "C-01").rename(active / "C-00")
    for change_id in expected_change_ids[1:]:
        change = active / change_id
        change.mkdir()
        (change / "intent.md").write_text(
            f"# Change {change_id}\n\nINTENT-BODY-SENTINEL\n",
            encoding="utf-8",
        )

    common = load_common()
    original_reader = common.read_stable_project_file_snapshot
    intent_reads = []

    def count_intent_reads(project, relative, **kwargs):
        if kwargs.get("code_prefix") == "active_change_intent":
            intent_reads.append(str(relative))
        return original_reader(project, relative, **kwargs)

    monkeypatch.setattr(common, "read_stable_project_file_snapshot", count_intent_reads)

    selection = common.current_task_selection(root)
    matching = [
        diagnostic
        for diagnostic in selection["diagnostics"]
        if diagnostic.get("code") == "active_change_ambiguous"
    ]

    assert selection["task"] is None
    assert len(matching) == 1
    assert matching[0]["change_ids"] == expected_change_ids
    rendered_candidates = ", ".join(f"`{change_id}`" for change_id in expected_change_ids)
    assert matching[0]["repair"] == (
        "Bootstrap recovery: do not invoke a current-Change workflow while authority is "
        "ambiguous. Stable-list and explicitly choose one of these candidate ids to keep "
        f"active in this worktree: {rendered_candidates}. For every other named candidate, "
        "use native filesystem and Git tools to preserve unfinished work in an independent "
        "worktree; if an already-durable delivery closure proves it complete, move it to "
        "`.ultra/changes/archive/<change_id>`; or obtain explicit owner authorization, append "
        "the exact `## Abandonment` closure to that candidate's own `intent.md`, and move it "
        "to `.ultra/changes/abandoned/<change_id>`. Stable-list the active root again; only "
        "after exactly the chosen candidate remains may a current-Change workflow run and "
        "task selection be retried."
    )
    assert "`ultra-deliver`" not in matching[0]["repair"]
    assert "`ultra-change`" not in matching[0]["repair"]
    assert intent_reads == []


def test_task_hooks_report_missing_active_authority_with_exact_repair_and_no_progress(
    tmp_path,
):
    repair = (
        "Restore .ultra/changes/active and its .ultra/changes ancestors as ordinary "
        "non-symlink directories, then retry task selection."
    )
    for case in ("active-missing", "changes-missing"):
        root = make_project(tmp_path / case)
        ultra = root / ".ultra"
        missing = ultra / "changes" / "active"
        if case == "changes-missing":
            missing = missing.parent
        shutil.rmtree(missing)

        selection = load_common().current_task_selection(root)
        matching = [
            diagnostic
            for diagnostic in selection["diagnostics"]
            if diagnostic.get("code") == "active_change_root_missing"
        ]

        session = run_hook(
            "session_context.py",
            root,
            {"hook_event_name": "SessionStart"},
        )
        recall = run_hook(
            "mid_workflow_recall.py",
            root,
            {"hook_event_name": "PreToolUse", "tool_name": "Edit"},
        )
        compact = run_hook(
            "compact_context.py",
            root,
            {"hook_event_name": "PreCompact"},
        )
        changed = root / "src" / "checkout.js"
        changed.parent.mkdir()
        changed.write_text("export const checkout = true;\n", encoding="utf-8")
        post_edit = run_hook(
            "post_edit_guard.py",
            root,
            {
                "hook_event_name": "PostToolUse",
                "tool_name": "Edit",
                "tool_input": {"file_path": str(changed)},
            },
        )

        assert selection["task"] is None, case
        assert len(matching) == 1, case
        assert matching[0]["repair"] == repair, case
        assert session.returncode == recall.returncode == compact.returncode == 0, case
        assert post_edit.returncode == 0, case
        session_context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
        recall_context = json.loads(recall.stdout)["hookSpecificOutput"]["additionalContext"]
        compact_context = (
            ultra / ".runtime" / "compact-snapshot.md"
        ).read_text(encoding="utf-8")
        if compact.stdout:
            compact_context += json.loads(compact.stdout)["hookSpecificOutput"][
                "additionalContext"
            ]
        post_edit_context = json.loads(post_edit.stdout)["hookSpecificOutput"][
            "additionalContext"
        ]
        for output in (
            session_context,
            recall_context,
            compact_context,
            post_edit_context,
        ):
            assert "`active_change_root_missing`" in output, case
            assert f"Repair: {repair}" in output, case
            assert "Public checkout returns 201." not in output, case
            assert "Write the public-seam regression." not in output, case
        assert not (ultra / "progress").exists(), case


def test_present_empty_active_directory_and_regular_packaged_marker_remain_valid(tmp_path):
    for case in ("empty", "marker-only", "marker-with-active"):
        root = make_project(tmp_path / case)
        active = root / ".ultra" / "changes" / "active"
        if case != "marker-with-active":
            shutil.rmtree(active / "C-01")
        if case != "empty":
            (active / ".gitkeep").write_text("", encoding="utf-8")

        selection = load_common().current_task_selection(root)

        if case == "marker-with-active":
            assert selection["task"]["id"] == "1", case
        else:
            assert selection["task"] is None, case
        assert not any(
            str(diagnostic.get("code", "")).startswith("active_change_")
            for diagnostic in selection["diagnostics"]
        ), case


def test_task_ledger_failure_classes_render_exact_repair_in_every_hook(tmp_path):
    cases = {
        "snapshot-missing": (
            "task_ledger_snapshot_missing",
            (
                "Restore `.ultra/tasks.json` as an ordinary regular file containing the "
                "canonical task ledger, then retry task selection."
            ),
        ),
        "snapshot-symlink": (
            "task_ledger_snapshot_symlink",
            (
                "Remove the symlink and restore `.ultra/tasks.json` as an ordinary "
                "non-symlink regular file inside the repository, then retry task selection."
            ),
        ),
        "invalid-utf8": (
            "task_ledger_invalid_utf8",
            (
                "Rewrite `.ultra/tasks.json` as valid UTF-8 without changing task status "
                "or history, then retry task selection."
            ),
        ),
        "invalid-json": (
            "task_ledger_invalid_json",
            (
                "Repair `.ultra/tasks.json` as valid JSON without changing task status "
                "or history, then retry task selection."
            ),
        ),
        "invalid-root": (
            "task_ledger_invalid_root",
            (
                "Restore the exact `ultra-task-ledger-v2` root with only `$schema` and a "
                "`tasks` array while preserving every task row and status, then retry task "
                "selection."
            ),
        ),
    }

    for case, (expected_code, expected_repair) in cases.items():
        root = make_project(tmp_path / case)
        ultra = root / ".ultra"
        ledger_file = ultra / "tasks.json"
        if case == "snapshot-missing":
            ledger_file.unlink()
        elif case == "snapshot-symlink":
            outside = tmp_path / f"{case}-outside.json"
            ledger_file.rename(outside)
            ledger_file.symlink_to(outside)
        elif case == "invalid-utf8":
            ledger_file.write_bytes(b"\xff")
        elif case == "invalid-json":
            ledger_file.write_text("{", encoding="utf-8")
        elif case == "invalid-root":
            ledger_file.write_text(
                json.dumps({"$schema": "ultra-task-ledger-v2", "tasks": {}}),
                encoding="utf-8",
            )

        report = load_common().read_task_ledger(root)
        matching = [
            diagnostic
            for diagnostic in report["diagnostics"]
            if diagnostic.get("code") == expected_code
        ]
        session = run_hook(
            "session_context.py",
            root,
            {"hook_event_name": "SessionStart"},
        )
        recall = run_hook(
            "mid_workflow_recall.py",
            root,
            {"hook_event_name": "PreToolUse", "tool_name": "Edit"},
        )
        compact = run_hook(
            "compact_context.py",
            root,
            {"hook_event_name": "PreCompact"},
        )
        changed = root / "src" / "checkout.js"
        changed.parent.mkdir()
        changed.write_text("export const checkout = true;\n", encoding="utf-8")
        post_edit = run_hook(
            "post_edit_guard.py",
            root,
            {
                "hook_event_name": "PostToolUse",
                "tool_name": "Edit",
                "tool_input": {"file_path": str(changed)},
            },
        )

        assert report["tasks"] == [], case
        assert len(matching) == 1, case
        assert matching[0].get("repair") == expected_repair, case
        assert session.returncode == recall.returncode == compact.returncode == 0, case
        assert post_edit.returncode == 0, case
        compact_context = (
            ultra / ".runtime" / "compact-snapshot.md"
        ).read_text(encoding="utf-8")
        if compact.stdout:
            compact_context += json.loads(compact.stdout)["hookSpecificOutput"][
                "additionalContext"
            ]
        outputs = (
            json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"],
            json.loads(recall.stdout)["hookSpecificOutput"]["additionalContext"],
            compact_context,
            json.loads(post_edit.stdout)["hookSpecificOutput"]["additionalContext"],
        )
        for output in outputs:
            assert f"`{expected_code}`" in output, case
            assert f"Repair: {expected_repair}" in output, case
            assert "Public checkout returns 201." not in output, case
            assert "Write the public-seam regression." not in output, case
        assert not (ultra / "progress").exists(), case


def test_malformed_task_rows_render_exact_problem_tokens_and_repair_in_every_hook(
    tmp_path,
):
    cases = {
        "non-object": (
            "not-an-object",
            ["row_not_object"],
            "Task ledger row 0 must be a JSON object.",
        ),
        "shaped-row": (
            None,
            ["unknown_keys:semantic_score", "invalid_status"],
            (
                "Task ledger row 0 has an invalid mechanical shape; repair the row "
                "before task selection."
            ),
        ),
    }
    for case, (replacement, expected_problems, expected_message) in cases.items():
        root = make_project(tmp_path / case)
        ultra = root / ".ultra"
        task = json.loads((ultra / "tasks.json").read_text(encoding="utf-8"))["tasks"][0]
        malformed = replacement
        if case == "shaped-row":
            malformed = {**task, "status": "complete", "semantic_score": 100}
        write_v2_ledger(root, [malformed])
        expected_repair = (
            "Repair task ledger row 0 by resolving these exact problems: "
            f"{', '.join(expected_problems)}; then retry task selection."
        )
        expected_rendered = (
            f"- `task_ledger_row_invalid`: {expected_message}\n"
            f"  Repair: {expected_repair}"
        )

        report = load_common().read_task_ledger(root)
        matching = [
            diagnostic
            for diagnostic in report["diagnostics"]
            if diagnostic.get("code") == "task_ledger_row_invalid"
        ]
        session = run_hook(
            "session_context.py",
            root,
            {"hook_event_name": "SessionStart"},
        )
        recall = run_hook(
            "mid_workflow_recall.py",
            root,
            {"hook_event_name": "PreToolUse", "tool_name": "Edit"},
        )
        compact = run_hook(
            "compact_context.py",
            root,
            {"hook_event_name": "PreCompact"},
        )
        changed = root / "src" / "checkout.js"
        changed.parent.mkdir()
        changed.write_text("export const checkout = true;\n", encoding="utf-8")
        post_edit = run_hook(
            "post_edit_guard.py",
            root,
            {
                "hook_event_name": "PostToolUse",
                "tool_name": "Edit",
                "tool_input": {"file_path": str(changed)},
            },
        )

        assert report["classification"] == "invalid", case
        assert report["tasks"] == [], case
        assert len(matching) == 1, case
        assert matching[0]["problems"] == expected_problems, case
        assert matching[0].get("repair") == expected_repair, case
        assert session.returncode == recall.returncode == compact.returncode == 0, case
        assert post_edit.returncode == 0, case
        session_context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
        recall_context = json.loads(recall.stdout)["hookSpecificOutput"]["additionalContext"]
        compact_context = (
            ultra / ".runtime" / "compact-snapshot.md"
        ).read_text(encoding="utf-8")
        if compact.stdout:
            compact_context += json.loads(compact.stdout)["hookSpecificOutput"][
                "additionalContext"
            ]
        post_edit_context = json.loads(post_edit.stdout)["hookSpecificOutput"][
            "additionalContext"
        ]
        for output in (
            session_context,
            recall_context,
            compact_context,
            post_edit_context,
        ):
            assert expected_rendered in output, case
            assert "Public checkout returns 201." not in output, case
            assert "Write the public-seam regression." not in output, case
        assert not (ultra / "progress").exists(), case


def test_task_diagnostic_renderer_preserves_exact_nonempty_repair():
    rendered = load_common().render_task_diagnostics([{
        "code": "typed_failure",
        "message": "The observed surface is unavailable.",
        "repair": "Restore the ordinary authority file, then retry the Hook.",
    }])

    assert rendered == (
        "- `typed_failure`: The observed surface is unavailable.\n"
        "  Repair: Restore the ordinary authority file, then retry the Hook."
    )


def test_task_hooks_reject_every_invalid_ledger_graph_with_exact_repair(tmp_path):
    common = load_common()
    cases = {
        "duplicate-id": (
            "task_ledger_duplicate_id",
            "Keep exactly one row for task id `1`; reconcile its status and history, "
            "then retry task selection.",
        ),
        "missing-dependency": (
            "task_ledger_dependency_missing",
            "Add the missing task row `missing` to Change `C-01`, or remove the stale "
            "dependency from task `1`.",
        ),
        "self-dependency": (
            "task_ledger_dependency_self",
            "Remove self-dependency `1` from task `1`.",
        ),
        "cross-change": (
            "task_ledger_dependency_cross_change",
            "Move dependency `foreign` into Change `C-01`, or remove that cross-Change "
            "edge from task `1`.",
        ),
        "duplicate-dependency": (
            "task_ledger_duplicate_dependency",
            "Keep dependency `dep` once in task `1`.",
        ),
        "cycle": (
            "task_ledger_dependency_cycle",
            "Break the dependency cycle `1 -> 2 -> 1` by removing at least one stale edge.",
        ),
    }

    for case, (expected_code, expected_repair) in cases.items():
        root = make_project(tmp_path / case)
        ultra = root / ".ultra"
        ledger = json.loads((ultra / "tasks.json").read_text(encoding="utf-8"))
        current = ledger["tasks"][0]
        current["status"] = "pending"
        if case == "duplicate-id":
            duplicate = dict(current)
            duplicate["status"] = "completed"
            ledger["tasks"].append(duplicate)
        elif case == "missing-dependency":
            current["dependencies"] = ["missing"]
        elif case == "self-dependency":
            current["dependencies"] = ["1"]
        elif case == "cross-change":
            current["dependencies"] = ["foreign"]
            ledger["tasks"].append({
                "id": "foreign",
                "change_id": "C-02",
                "title": "Foreign dependency",
                "type": "feature",
                "priority": "P0",
                "status": "completed",
                "dependencies": [],
                "context_file": ".ultra/contexts/task-foreign.md",
                "trace_to": ".ultra/specs/product.md#checkout",
            })
        elif case == "duplicate-dependency":
            current["dependencies"] = ["dep", "dep"]
            ledger["tasks"].append({
                "id": "dep",
                "change_id": "C-01",
                "title": "Dependency",
                "type": "feature",
                "priority": "P0",
                "status": "completed",
                "dependencies": [],
                "context_file": ".ultra/contexts/task-dep.md",
                "trace_to": ".ultra/specs/product.md#checkout",
            })
        elif case == "cycle":
            current["dependencies"] = ["2"]
            ledger["tasks"].append({
                "id": "2",
                "change_id": "C-01",
                "title": "Cycle peer",
                "type": "feature",
                "priority": "P0",
                "status": "pending",
                "dependencies": ["1"],
                "context_file": ".ultra/contexts/task-2.md",
                "trace_to": ".ultra/specs/product.md#checkout",
            })
        write_v2_ledger(root, ledger["tasks"])

        report = common.read_task_ledger(root)
        selection = common.current_task_selection(root)
        matching = [
            diagnostic
            for diagnostic in report["diagnostics"]
            if diagnostic.get("code") == expected_code
        ]
        assert report["classification"] == "invalid", case
        assert report["tasks"] == [], case
        assert selection["task"] is None, case
        assert len(matching) == 1, case
        assert matching[0]["repair"] == expected_repair, case

        session = run_hook(
            "session_context.py",
            root,
            {"hook_event_name": "SessionStart"},
        )
        changed = root / "src" / "checkout.js"
        changed.parent.mkdir()
        changed.write_text("export const checkout = true;\n", encoding="utf-8")
        post_edit = run_hook(
            "post_edit_guard.py",
            root,
            {
                "hook_event_name": "PostToolUse",
                "tool_name": "Edit",
                "tool_input": {"file_path": str(changed)},
            },
        )
        context = json.loads(session.stdout)["hookSpecificOutput"]["additionalContext"]
        assert f"`{expected_code}`" in context, case
        assert f"Repair: {expected_repair}" in context, case
        assert "Public checkout returns 201." not in context, case
        assert f"`{expected_code}`" in post_edit.stdout, case
        assert f"Repair: {expected_repair}" in post_edit.stdout, case
        assert "Public checkout returns 201." not in post_edit.stdout, case
        assert not (ultra / "progress").exists(), case


def test_task_ledger_cycle_validation_is_bounded_beyond_python_recursion_depth(tmp_path):
    root = make_project(tmp_path)
    task_count = 1100
    tasks = []
    for index in range(task_count):
        task_id = f"task-{index:04d}"
        dependency_id = f"task-{(index + 1) % task_count:04d}"
        tasks.append({
            "id": task_id,
            "change_id": "C-01",
            "title": f"Graph task {index}",
            "type": "feature",
            "priority": "P0",
            "status": "pending",
            "dependencies": [dependency_id],
            "context_file": f".ultra/contexts/task-{task_id}.md",
            "trace_to": ".ultra/specs/product.md#checkout",
        })
    write_v2_ledger(root, tasks)

    report = load_common().read_task_ledger(root)

    assert report["classification"] == "invalid"
    assert report["tasks"] == []
    cycles = [
        diagnostic
        for diagnostic in report["diagnostics"]
        if diagnostic.get("code") == "task_ledger_dependency_cycle"
    ]
    assert len(cycles) == 1
    assert cycles[0]["task_ids"][0] == "task-0000"
    assert cycles[0]["task_ids"][-1] == "task-0000"


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
    for name in ("codex", "kimi", "grok", "zcode"):
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

    zcode = load_adapter("zcode")
    zcode_context = zcode.run_feature(
        "session_context.py",
        {"cwd": str(root), "hookEventName": "SessionStart"},
        [],
    )
    assert "Ship a real checkout path." in zcode_context["hookSpecificOutput"]["additionalContext"]
    zcode_denied = zcode.run_feature(
        "block_dangerous_commands.py",
        {
            "cwd": str(root),
            "hookEventName": "PreToolUse",
            "toolName": "Bash",
            "toolInput": {"command": "cast send 0x123 --value 1ether"},
        },
        [],
    )
    assert zcode_denied["hookSpecificOutput"]["permissionDecision"] == "deny"

    adapter_file = HOOK_ROOT / "adapters" / "zcode.py"
    harmless_wire = subprocess.run(
        [sys.executable, str(adapter_file), "block_dangerous_commands.py"],
        input=json.dumps({
            "cwd": str(root),
            "hookEventName": "PreToolUse",
            "toolName": "Bash",
            "toolInput": {
                "command": (
                    "python3 -c \"import json; print(json.load(open("
                    "'.ultra/test-report.json'))['passed'])\" && git status --short"
                ),
            },
        }),
        text=True,
        capture_output=True,
        cwd=root,
        check=False,
    )
    assert harmless_wire.returncode == 0, harmless_wire.stderr
    assert harmless_wire.stdout == ""
