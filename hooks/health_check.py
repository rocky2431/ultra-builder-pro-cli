#!/usr/bin/env python3
"""Advisory health check for an active Ultra workflow.

No memory, prompt, transcript, or generic host policy is inspected here.
"""

import json
import sqlite3
import sys
from pathlib import Path

TERMINAL = {"committed", "completed", "done", "cancelled"}
REQUIRED_TABLES = {"tasks", "events", "sessions", "schema_version"}


def main():
    try:
        raw = sys.stdin.read()
        data = json.loads(raw) if raw.strip() else {}
    except (json.JSONDecodeError, OSError) as exc:
        print(f"[health_check] invalid hook input: {exc}", file=sys.stderr)
        data = {}
    start = Path(data.get("cwd") or Path.cwd()).resolve()
    root = None
    state = None
    for candidate in (start, *start.parents):
        state_file = candidate / ".ultra" / "workflow-state.json"
        if state_file.is_file():
            try:
                value = json.loads(state_file.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                print(f"[health_check] cannot read {state_file}: {exc}", file=sys.stderr)
                value = None
            if isinstance(value, dict) and value.get("status") not in TERMINAL:
                root, state = candidate, value
            break
    if root is None or state is None:
        print(json.dumps({}))
        return
    issues = []
    db_path = root / ".ultra" / "state.db"
    if not db_path.is_file():
        issues.append(".ultra/state.db is missing")
    else:
        try:
            with sqlite3.connect(str(db_path), timeout=1) as conn:
                tables = {row[0] for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )}
            missing = sorted(REQUIRED_TABLES - tables)
            if missing:
                issues.append(f"state.db missing tables: {', '.join(missing)}")
        except sqlite3.Error as exc:
            issues.append(f"state.db unreadable: {exc}")
    if issues:
        print("[Ultra health] " + "; ".join(issues), file=sys.stderr)
    print(json.dumps({}))


if __name__ == "__main__":
    main()
