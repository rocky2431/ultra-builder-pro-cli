#!/usr/bin/env python3
"""Inject current Ultra workflow/change context without persistent memory."""

import json
import sqlite3
import sys
from pathlib import Path


TERMINAL_WORKFLOW = {"committed", "completed", "done", "cancelled"}
PROVIDER_FIELDS = {
    "provider", "project", "reference", "revision", "indexed_head", "status",
}


def payload() -> dict:
    try:
        value = json.loads(sys.stdin.read() or "{}")
        return value if isinstance(value, dict) else {}
    except json.JSONDecodeError as exc:
        print(f"[workflow_context] invalid hook input: {exc}", file=sys.stderr)
        return {}


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


def read_workflow(root: Path):
    state_file = root / ".ultra" / "workflow-state.json"
    if not state_file.is_file():
        return None
    try:
        state = json.loads(state_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"[workflow_context] cannot read {state_file}: {exc}", file=sys.stderr)
        return None
    if isinstance(state, dict) and state.get("status") not in TERMINAL_WORKFLOW:
        return state
    return None


def safe_json(raw, fallback):
    try:
        value = json.loads(raw)
        return value
    except (TypeError, json.JSONDecodeError):
        return fallback


def provider_metadata(raw) -> dict:
    refs = safe_json(raw, {})
    if not isinstance(refs, dict):
        return {}
    clean = {}
    for kind, ref in refs.items():
        if kind not in {"memory", "code_graph"} or not isinstance(ref, dict):
            continue
        clean[kind] = {key: ref[key] for key in PROVIDER_FIELDS if key in ref}
    return clean


def read_changes(root: Path):
    db_path = root / ".ultra" / "state.db"
    if not db_path.is_file():
        return []
    try:
        with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=1) as conn:
            exists = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='changes'"
            ).fetchone()
            if not exists:
                return []
            rows = conn.execute(
                """SELECT id, title, kind, status, intent, docs_impact_json,
                          provider_refs_json, artifact_root
                   FROM changes WHERE status IN ('active', 'blocked', 'ready')
                   ORDER BY updated_at DESC"""
            ).fetchall()
    except sqlite3.Error as exc:
        print(f"[workflow_context] cannot inspect {db_path}: {exc}", file=sys.stderr)
        return []
    return [
        {
            "id": row[0], "title": row[1], "kind": row[2], "status": row[3],
            "intent": row[4], "docs_impact": safe_json(row[5], {}),
            "providers": provider_metadata(row[6]), "artifact_root": row[7],
        }
        for row in rows
    ]


def context_text(root: Path, workflow, changes) -> str:
    lines = []
    if workflow:
        lines.extend([
            "[Ultra active workflow]",
            f"Project: {root}",
            f"Command: {workflow.get('command', 'unknown')}",
            f"Task: {workflow.get('task_id', workflow.get('task', 'unknown'))}",
            f"Step: {workflow.get('step', 'unknown')}",
            f"Status: {workflow.get('status', 'active')}",
        ])
    if changes:
        change = changes[0]
        lines.extend([
            "[Ultra continuous change]",
            f"Project: {root}",
            f"Change: {change['id']} ({change['kind']}, {change['status']})",
            f"Title: {change['title']}",
            f"Intent: {change['intent']}",
            "Docs impact: " + json.dumps(change["docs_impact"], ensure_ascii=False, sort_keys=True),
            f"Context manifest: {change['artifact_root']}/context-manifest.json",
            "External providers (metadata references only): "
            + json.dumps(change["providers"], ensure_ascii=False, sort_keys=True),
        ])
        if len(changes) > 1:
            lines.append(f"Active change count: {len(changes)}; resolve scope with change.list before mutation.")
    if not workflow and not changes:
        lines.extend([
            "[Ultra baseline]",
            f"Project: {root}",
            "No active continuous change. Start daily work with the ultra-change workflow.",
        ])
    lines.append("Authority: .ultra/state.db; generated JSON/Markdown are projections or artifacts.")
    return "\n".join(lines)


def main() -> None:
    data = payload()
    root = find_root(Path(data.get("cwd") or Path.cwd()).resolve())
    if root is None:
        print(json.dumps({}))
        return
    workflow = read_workflow(root)
    changes = read_changes(root)
    context = context_text(root, workflow, changes)
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": context,
    }}))


if __name__ == "__main__":
    main()
