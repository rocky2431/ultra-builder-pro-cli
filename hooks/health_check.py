#!/usr/bin/env python3
"""Fast, read-only Ultra runtime health inspection at session start."""

import json
import sqlite3
import sys
from pathlib import Path


REQUIRED_TABLES = {
    "tasks", "events", "sessions", "schema_version", "migration_history",
    "telemetry", "specs_refs", "circuit_breaker", "changes", "artifacts",
    "context_snapshots", "spec_learning_candidates", "trace_links", "incidents", "projection_jobs",
    "event_consumers",
}


def hook_input() -> dict:
    try:
        value = json.loads(sys.stdin.read() or "{}")
        return value if isinstance(value, dict) else {}
    except json.JSONDecodeError as exc:
        print(f"[health_check] invalid hook input: {exc}", file=sys.stderr)
        return {}


def find_root(start: Path):
    for candidate in (start, *start.parents):
        ultra = candidate / ".ultra"
        if (
            (ultra / "state.db").is_file()
            or (ultra / "workflow-state.json").is_file()
            or (ultra / "changes" / "active").is_dir()
        ):
            return candidate
    return None


def inspect(root: Path) -> dict:
    db_path = root / ".ultra" / "state.db"
    report = {"status": "healthy", "project": str(root), "checks": {}}
    issues = []
    if not db_path.is_file():
        report["checks"]["state_db"] = {"status": "fail", "reason": "missing"}
        report["status"] = "degraded"
        return report

    try:
        uri = f"file:{db_path}?mode=ro"
        with sqlite3.connect(uri, uri=True, timeout=1) as conn:
            quick = conn.execute("PRAGMA quick_check").fetchone()[0]
            tables = {
                row[0] for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )
            }
            missing = sorted(REQUIRED_TABLES - tables)
            report["checks"]["state_db"] = {
                "status": "pass" if quick == "ok" and not missing else "fail",
                "integrity": quick,
                "missing_tables": missing,
            }
            if quick != "ok" or missing:
                issues.append("state_db")
            if missing:
                report["status"] = "degraded"
                return report

            incidents = [
                {"id": row[0], "code": row[1], "severity": row[2], "retryable": bool(row[3])}
                for row in conn.execute(
                    """SELECT id, code, severity, retryable FROM incidents
                       WHERE status = 'open' ORDER BY last_seen_at DESC LIMIT 20"""
                )
            ]
            report["checks"]["incidents"] = {
                "status": "pass" if not incidents else "fail",
                "open": incidents,
            }
            if incidents:
                issues.append("incidents")

            pending = conn.execute(
                "SELECT COUNT(*) FROM projection_jobs WHERE status = 'pending'"
            ).fetchone()[0]
            running = conn.execute(
                "SELECT COUNT(*) FROM projection_jobs WHERE status = 'running'"
            ).fetchone()[0]
            failed = conn.execute(
                "SELECT COUNT(*) FROM projection_jobs WHERE status = 'failed'"
            ).fetchone()[0]
            event_cursor = conn.execute(
                "SELECT COALESCE(MAX(id), 0) FROM events"
            ).fetchone()[0]
            projected_cursor = conn.execute(
                """SELECT COALESCE(MAX(event_cursor), 0) FROM projection_jobs
                   WHERE status = 'completed'"""
            ).fetchone()[0]
            projection_ok = (
                pending == 0 and running == 0 and failed == 0
                and event_cursor <= projected_cursor
            )
            report["checks"]["projections"] = {
                "status": "pass" if projection_ok else "fail",
                "pending": pending,
                "running": running,
                "failed": failed,
                "event_cursor": event_cursor,
                "projected_cursor": projected_cursor,
            }
            if not projection_ok:
                issues.append("projections")

            orphan = conn.execute(
                "SELECT COUNT(*) FROM sessions WHERE status = 'orphan'"
            ).fetchone()[0]
            report["checks"]["sessions"] = {
                "status": "pass" if orphan == 0 else "fail", "orphan": orphan,
            }
            if orphan:
                issues.append("sessions")

            missing_artifacts = []
            for change_id, artifact_root in conn.execute(
                """SELECT id, artifact_root FROM changes
                   WHERE status IN ('active', 'blocked', 'ready')"""
            ):
                if artifact_root and not (root / artifact_root).exists():
                    missing_artifacts.append(change_id)
            report["checks"]["change_artifacts"] = {
                "status": "pass" if not missing_artifacts else "fail",
                "missing": missing_artifacts,
            }
            if missing_artifacts:
                issues.append("change_artifacts")
    except sqlite3.Error as exc:
        report["checks"]["state_db"] = {"status": "fail", "reason": str(exc)}
        issues.append("state_db")

    if issues:
        report["status"] = "degraded"
    return report


def main() -> None:
    data = hook_input()
    start = Path(data.get("cwd") or Path.cwd()).resolve()
    root = find_root(start)
    if root is None:
        print(json.dumps({}))
        return
    report = inspect(root)
    if report["status"] != "healthy":
        print("[Ultra health] " + json.dumps(report, ensure_ascii=False, sort_keys=True), file=sys.stderr)
    print(json.dumps({}))


if __name__ == "__main__":
    main()
