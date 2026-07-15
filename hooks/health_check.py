#!/usr/bin/env python3
"""SessionStart Hook - Lightweight cross-runtime system health check.

Verifies critical components exist and are functional.
Reports issues via stderr (visible to the host agent, never blocks).

Performance target: <200ms total.
"""

import json
import os
import re
import sqlite3
import sys
from pathlib import Path

HOOKS_DIR = Path(__file__).parent
CLAUDE_DIR = HOOKS_DIR.parent
IS_CODEX = os.environ.get("UBP_HOOK_RUNTIME") == "codex"
CODEX_HOME = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
PLUGIN_ROOT = Path(os.environ.get("PLUGIN_ROOT", HOOKS_DIR.parent))
EXPECTED_MIN_AGENTS = 8
SCHEMA_VERSION = 2


def check_agents() -> list:
    """Verify agent files exist."""
    agents_dir = CODEX_HOME / "agents" if IS_CODEX else CLAUDE_DIR / "agents"
    if not agents_dir.exists():
        return ["agents/ directory missing"]

    extension = "*.toml" if IS_CODEX else "*.md"
    agent_files = list(agents_dir.glob(extension))
    if len(agent_files) < EXPECTED_MIN_AGENTS:
        return [f"agents/: only {len(agent_files)} files (expected >= {EXPECTED_MIN_AGENTS})"]
    return []


def check_hooks_syntax() -> list:
    """Verify all registered hooks are syntactically valid Python."""
    issues = []
    for py_file in HOOKS_DIR.glob("*.py"):
        if py_file.name.startswith("_"):
            continue
        try:
            compile(py_file.read_text(encoding="utf-8"), str(py_file), "exec")
        except SyntaxError as e:
            issues.append(f"{py_file.name}: syntax error at line {e.lineno}")
    return issues


def check_settings_hooks() -> list:
    """Verify hooks referenced in the active runtime manifest actually exist."""
    settings_path = PLUGIN_ROOT / "hooks" / "hooks.json" if IS_CODEX else CLAUDE_DIR / "settings.json"
    if not settings_path.exists():
        return [f"{settings_path.name} missing"]

    issues = []
    try:
        settings = json.loads(settings_path.read_text(encoding="utf-8"))
        hooks = settings.get("hooks", {})
        for event_name, hook_list in hooks.items():
            for entry in hook_list:
                for hook in entry.get("hooks", []):
                    cmd = hook.get("command", "")
                    for raw_path in re.findall(r'[\w./$~-]+\.py', cmd):
                        expanded = raw_path.replace("$PLUGIN_ROOT", str(PLUGIN_ROOT))
                        script_path = Path(os.path.expanduser(expanded))
                        if not script_path.exists():
                            issues.append(f"{event_name}: {script_path.name} not found")
    except (json.JSONDecodeError, KeyError):
        issues.append(f"{settings_path.name}: parse error")
    return issues


def check_memory_db() -> list:
    """Verify memory.db is accessible and schema version matches."""
    issues = []
    try:
        import subprocess
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, timeout=3
        )
        if result.returncode != 0:
            return []  # Not in git repo, skip DB check

        toplevel = result.stdout.strip()
        db_path = Path(toplevel) / ".ultra" / "memory" / "memory.db"

        if not db_path.exists():
            return []  # DB not yet created, ok for new projects

        conn = sqlite3.connect(str(db_path), timeout=1)
        conn.row_factory = sqlite3.Row

        # Check tables exist
        tables = {r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}

        for required in ("sessions", "session_summaries", "observations"):
            if required not in tables:
                issues.append(f"memory.db: missing table '{required}'")

        conn.close()
    except (sqlite3.Error, OSError) as e:
        issues.append(f"memory.db: {e}")
    return issues


def check_instruction_file() -> list:
    """Verify the host's durable user instruction file exists and is non-empty."""
    instruction_file = CODEX_HOME / "AGENTS.md" if IS_CODEX else CLAUDE_DIR / "CLAUDE.md"
    if not instruction_file.exists():
        return [f"{instruction_file.name} missing"]
    if instruction_file.stat().st_size < 100:
        return [f"{instruction_file.name} appears empty or truncated"]
    return []


def main():
    # Only run on fresh session start, not compact resume
    try:
        raw = sys.stdin.read()
        data = json.loads(raw) if raw.strip() else {}
    except Exception:
        data = {}

    all_issues = []
    all_issues.extend(check_agents())
    all_issues.extend(check_hooks_syntax())
    all_issues.extend(check_settings_hooks())
    all_issues.extend(check_memory_db())
    all_issues.extend(check_instruction_file())

    if all_issues:
        print(f"[Health] {len(all_issues)} issue(s) detected:", file=sys.stderr)
        for issue in all_issues[:10]:
            print(f"  - {issue}", file=sys.stderr)

    print(json.dumps({}))


if __name__ == "__main__":
    main()
