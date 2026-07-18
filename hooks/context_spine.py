#!/usr/bin/env python3
"""Read and render the compact DB-derived Ultra Context Spine breadcrumb."""

import json
import hashlib
import sqlite3
import subprocess
from pathlib import Path


ACTIVE_CHANGE_STATUSES = ("active", "blocked", "ready")
TERMINAL_TASK_STATUSES = ("completed", "expanded")
CONTEXT_COLUMNS = {
    "role", "gate", "next_action", "readiness", "blockers_json",
    "context_json", "manifest_path", "manifest_hash", "git_head", "task_id",
}
ADVISORY_CONTEXT_CODES = {
    "CONTEXT_FILE_BUDGET_EXCEEDED",
    "CONTEXT_TOKEN_BUDGET_EXCEEDED",
    "EXECUTION_CONTEXT_BUDGET_EXCEEDED",
    "EXECUTION_CONTEXT_BUDGET_ADVISORY",
}


def find_root(start: Path):
    for root in (start, *start.parents):
        ultra = root / ".ultra"
        if (
            (ultra / "state.db").is_file()
            or (ultra / "workflow-state.json").is_file()
            or (ultra / "changes" / "active").is_dir()
        ):
            return root
    return None


def safe_json(raw, fallback):
    if not isinstance(raw, str) or not raw.strip():
        return fallback
    try:
        value = json.loads(raw)
        return value
    except json.JSONDecodeError:
        return fallback


def git_head(root: Path):
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
        timeout=2,
    )
    return result.stdout.strip() if result.returncode == 0 else None


def git_branch(root: Path):
    result = subprocess.run(
        ["git", "branch", "--show-current"],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
        timeout=2,
    )
    return (result.stdout.strip() or None) if result.returncode == 0 else None


def baseline_health(conn, root: Path):
    columns = {row[1] for row in conn.execute("PRAGMA table_info(baselines)")}
    optional = [
        name for name in (
            "repository_branch", "worktree_state", "worktree_accepted", "gaps_json"
        ) if name in columns
    ]
    row = conn.execute(
        f"""SELECT id, mode, status, repository_revision, spec_refs_json{''.join(f', {name}' for name in optional)}
            FROM baselines WHERE status != 'superseded'
            ORDER BY updated_at DESC, rowid DESC LIMIT 1"""
    ).fetchone()
    if row is None:
        return {"status": "fail", "blockers": ["BASELINE_MISSING"], "warnings": [], "baseline": None}
    baseline = dict(row)
    blockers = []
    warnings = []
    if baseline["status"] != "ready":
        blockers.append(f"BASELINE_NOT_READY:{baseline['status']}")
    elif baseline["mode"] == "migrated":
        blockers.append("BASELINE_MIGRATION_REVIEW_REQUIRED")
    else:
        if "gaps_json" not in columns:
            blockers.append("BASELINE_SCHEMA_MIGRATION_REQUIRED")
        for gap in safe_json(baseline.get("gaps_json"), []):
            if (
                isinstance(gap, dict)
                and gap.get("status") == "open"
                and gap.get("blocking") is True
            ):
                blockers.append(f"BASELINE_GAP_BLOCKING:{gap.get('id', 'unknown')}")
        if baseline.get("worktree_state") == "dirty" and not baseline.get("worktree_accepted"):
            blockers.append("BASELINE_DIRTY_WORKTREE_NOT_ACCEPTED")
        branch = git_branch(root)
        if baseline.get("repository_branch") and branch and baseline["repository_branch"] != branch:
            blockers.append("BASELINE_BRANCH_STALE")
        for spec in safe_json(baseline.get("spec_refs_json"), []):
            ref = spec.get("path") if isinstance(spec, dict) else None
            expected = spec.get("digest") if isinstance(spec, dict) else None
            if not isinstance(ref, str) or not ref or Path(ref).is_absolute():
                blockers.append(f"BASELINE_SPEC_INVALID:{ref}")
                continue
            candidate = (root / ref).resolve()
            try:
                candidate.relative_to(root.resolve())
            except ValueError:
                blockers.append(f"BASELINE_SPEC_INVALID:{ref}")
                continue
            if not candidate.is_file():
                blockers.append(f"BASELINE_SPEC_MISSING:{ref}")
                continue
            digest = hashlib.sha256(candidate.read_bytes()).hexdigest()
            if not expected or digest != expected:
                blockers.append(f"BASELINE_SPEC_STALE:{ref}")
        head = git_head(root)
        revision = baseline.get("repository_revision")
        if head and revision and not str(revision).startswith("workspace:") and head != revision:
            blockers.append("BASELINE_HEAD_STALE")
    baseline.pop("spec_refs_json", None)
    baseline.pop("gaps_json", None)
    return {
        "status": "fail" if blockers else "pass",
        "blockers": blockers,
        "warnings": warnings,
        "baseline": baseline,
    }


def _next_action(change, task, tasks, role, readiness, stored, state_changed, blockers=None):
    if readiness != "ready":
        if any(str(item).startswith("BASELINE_") for item in (blockers or [])):
            return "Complete or refresh the Ultra project baseline through ultra-init."
        return "Resolve the context readiness blockers, then recompile change.context."
    if not state_changed and isinstance(stored, str) and stored.strip():
        return stored.strip()
    if change["status"] == "ready":
        return f"Run ultra-deliver for change {change['id']}."
    if change["status"] == "blocked":
        return f"Resolve the blockers for change {change['id']}, then recompile context."
    if task and task["status"] == "pending":
        return f"Start task {task['id']} through ultra-dev."
    if task and task["status"] == "in_progress":
        if role == "check":
            return f"Run the exact verification command for task {task['id']}."
        if role == "review":
            return (
                "Complete independent spec-fidelity and engineering-standards "
                f"review for task {task['id']}."
            )
        return f"Continue the approved vertical slice for task {task['id']}."
    if tasks and all(row["status"] in TERMINAL_TASK_STATUSES for row in tasks):
        return f"Run ultra-test for change {change['id']}."
    pending = next((row for row in tasks if row["status"] == "pending"), None)
    if pending:
        return f"Compile implement context for task {pending['id']}."
    return f"Create the first fresh-context tracer-bullet task for change {change['id']}."


def _route(change, task, tasks, readiness, blockers=None):
    if readiness != "ready" or change["status"] == "blocked":
        return "ultra-change"
    if change["status"] == "ready":
        return "ultra-deliver"
    if task and task["status"] in ("pending", "in_progress"):
        return "ultra-dev"
    if tasks and all(row["status"] in TERMINAL_TASK_STATUSES for row in tasks):
        return "ultra-test"
    return "ultra-change"


def read_breadcrumb(root: Path):
    db_path = root / ".ultra" / "state.db"
    if not db_path.is_file():
        return None
    with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=1) as conn:
        conn.row_factory = sqlite3.Row
        tables = {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        if not {"baselines", "changes", "tasks", "context_snapshots"}.issubset(tables):
            return None
        baseline = baseline_health(conn, root)
        change = conn.execute(
            """SELECT id, status FROM changes
               WHERE status IN ('active', 'blocked', 'ready')
               ORDER BY updated_at DESC LIMIT 1"""
        ).fetchone()
        if change is None:
            current = baseline["baseline"]
            if baseline["status"] == "pass":
                next_action = "Start daily work with ultra-change."
                route = "ultra-change"
                readiness = "ready"
            else:
                next_action = "Initialize or complete project baseline adoption through ultra-init."
                route = "ultra-init"
                readiness = "blocked"
            return {
                "change_id": None,
                "task_id": None,
                "role": "plan",
                "gate": "alignment",
                "readiness": readiness,
                "blockers": baseline["blockers"],
                "warnings": baseline["warnings"],
                "next_action": next_action,
                "recommended_workflow": route,
                "context_manifest_path": None,
                "context_manifest_hash": None,
                "git_head": git_head(root),
                "baseline": current,
            }
        tasks = list(conn.execute(
            "SELECT id, status, session_id FROM tasks WHERE change_id = ? ORDER BY created_at ASC",
            (change["id"],),
        ))
        columns = {
            row[1] for row in conn.execute("PRAGMA table_info(context_snapshots)")
        }
        snapshot = None
        if CONTEXT_COLUMNS.issubset(columns):
            snapshot = conn.execute(
                """SELECT task_id, git_head, manifest_path, manifest_hash, role, gate,
                          next_action, readiness, blockers_json, context_json
                   FROM context_snapshots WHERE change_id = ?
                   ORDER BY created_at DESC, rowid DESC LIMIT 1""",
                (change["id"],),
            ).fetchone()

    task_id = snapshot["task_id"] if snapshot else None
    if not task_id:
        active = next((row for row in tasks if row["status"] == "in_progress"), None)
        pending = next((row for row in tasks if row["status"] == "pending"), None)
        task_id = (active or pending)["id"] if (active or pending) else None
    task = next((row for row in tasks if row["id"] == task_id), None)
    context = safe_json(snapshot["context_json"], {}) if snapshot else {}
    role = snapshot["role"] if snapshot else "plan"
    gate = snapshot["gate"] if snapshot else "alignment"
    current_head = git_head(root)
    head_stale = bool(
        snapshot and snapshot["git_head"] and current_head
        and snapshot["git_head"] != current_head
    )
    snapshot_missing = snapshot is None
    legacy_context = bool(
        snapshot and (
            not isinstance(context.get("resume"), dict)
            or not isinstance(context.get("context"), dict)
            or not isinstance(context.get("readiness"), dict)
            or "baseline" not in context
        )
    )
    stored_status = context.get("resume", {}).get("task_status")
    current_status = task["status"] if task else None
    state_changed = stored_status is not None and stored_status != current_status
    stored_action = snapshot["next_action"] if snapshot else None
    blockers = []
    warnings = list(dict.fromkeys([*baseline["blockers"], *baseline["warnings"]]))
    if snapshot_missing:
        blockers.append("CONTEXT_NOT_COMPILED")
    else:
        if legacy_context:
            blockers.append("CONTEXT_SNAPSHOT_UPGRADE_REQUIRED")
        if head_stale:
            blockers.append("CONTEXT_HEAD_STALE")
        if state_changed:
            blockers.append("CONTEXT_TASK_STATE_STALE")
        for blocker in safe_json(snapshot["blockers_json"], []):
            if blocker in ADVISORY_CONTEXT_CODES or str(blocker).startswith("BASELINE_"):
                if blocker not in warnings:
                    warnings.append(blocker)
            elif blocker not in blockers:
                blockers.append(blocker)
        for warning in context.get("readiness", {}).get("warnings", []):
            if warning not in warnings:
                warnings.append(warning)
    readiness = "blocked" if blockers else snapshot["readiness"]
    if snapshot_missing:
        next_action = f"Compile change.context for change {change['id']} before continuing."
    elif legacy_context:
        next_action = "Recompile change.context to upgrade this legacy context snapshot."
    elif head_stale:
        next_action = "Git HEAD changed after context compilation; recompile change.context."
    elif state_changed:
        next_action = "Task state changed after context compilation; recompile change.context."
    else:
        next_action = _next_action(
            change, task, tasks, role, readiness, stored_action, False, blockers
        )
    return {
        "change_id": change["id"],
        "change_status": change["status"],
        "task_id": task["id"] if task else None,
        "task_status": task["status"] if task else None,
        "session_id": task["session_id"] if task else None,
        "role": role,
        "gate": gate,
        "readiness": readiness,
        "blockers": blockers,
        "warnings": warnings,
        "next_action": next_action,
        "recommended_workflow": _route(change, task, tasks, readiness, blockers),
        "context_manifest_path": snapshot["manifest_path"] if snapshot else None,
        "context_manifest_hash": snapshot["manifest_hash"] if snapshot else None,
        "git_head": current_head,
        "baseline": baseline["baseline"],
    }


def render_breadcrumb(root: Path, breadcrumb: dict) -> str:
    task = breadcrumb.get("task_id") or "none"
    task_status = breadcrumb.get("task_status") or "none"
    baseline = breadcrumb.get("baseline") or {}
    if breadcrumb.get("change_id"):
        lines = [
            "[Ultra context spine]",
            f"Project: {root}",
            f"Baseline: {baseline.get('id', 'unknown')} ({baseline.get('mode', 'unknown')}/{baseline.get('status', 'unknown')})",
            f"Change: {breadcrumb['change_id']} ({breadcrumb.get('change_status', 'active')})",
            f"Task: {task} ({task_status})",
            f"Role: {breadcrumb.get('role', 'plan')}",
            f"Gate: {breadcrumb.get('gate', 'alignment')}",
            f"Readiness: {breadcrumb.get('readiness', 'ready')}",
        ]
    else:
        lines = [
            "[Ultra baseline]",
            f"Project: {root}",
            f"Baseline: {baseline.get('id', 'missing')} ({baseline.get('mode', 'unknown')}/{baseline.get('status', 'missing')})",
            f"Readiness: {breadcrumb.get('readiness', 'blocked')}",
        ]
    if breadcrumb.get("blockers"):
        lines.append("Blockers: " + ", ".join(breadcrumb["blockers"]))
    if breadcrumb.get("warnings"):
        lines.append("Warnings: " + ", ".join(breadcrumb["warnings"]))
    lines.extend([
        f"Next: {breadcrumb.get('next_action', 'Inspect Ultra status.')}",
        f"Route: {breadcrumb.get('recommended_workflow', 'ultra-change')}",
    ])
    if breadcrumb.get("context_manifest_path"):
        digest = breadcrumb.get("context_manifest_hash") or "unknown"
        lines.append(f"Context: {breadcrumb['context_manifest_path']} sha256={digest}")
    lines.append("Authority: .ultra/state.db; JSON/Markdown remain projections or evidence artifacts.")
    return "\n".join(lines)
