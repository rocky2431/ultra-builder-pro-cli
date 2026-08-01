#!/usr/bin/env python3
"""Grok Build wire adapter for Ultra observational lifecycle hooks."""

from __future__ import annotations

import copy
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


HOOK_ROOT = Path(__file__).resolve().parent.parent
ALLOWED_FEATURES = {
    "block_dangerous_commands.py",
    "compact_context.py",
    "mid_workflow_recall.py",
    "post_edit_guard.py",
    "session_context.py",
}


def normalize_input(payload: dict[str, Any]) -> dict[str, Any]:
    """Translate Grok's camelCase wire names into the shared hook contract."""
    normalized = copy.deepcopy(payload)
    aliases = {
        "hookEventName": "hook_event_name",
        "sessionId": "session_id",
        "toolName": "tool_name",
        "toolInput": "tool_input",
        "toolResult": "tool_output",
        "stopHookActive": "stop_hook_active",
        "agentId": "agent_id",
        "agentType": "agent_type",
        "workspaceRoot": "workspace_root",
    }
    for source, target in aliases.items():
        if source in normalized and target not in normalized:
            normalized[target] = normalized[source]
    return normalized


def _parse_output(stdout: str) -> dict[str, Any]:
    text = stdout.strip()
    if not text:
        return {}
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def adapt_output(output: dict[str, Any], event: str, reason: str | None) -> dict[str, Any]:
    """Return only output fields Grok actually consumes for this event."""
    if event == "PreToolUse":
        specific = output.get("hookSpecificOutput")
        specific = specific if isinstance(specific, dict) else {}
        if specific.get("permissionDecision") == "deny":
            return {
                "decision": "deny",
                "reason": str(
                    specific.get("permissionDecisionReason")
                    or "Ultra refused a direct write to a managed authority file"
                ),
            }
        return {"decision": "allow"}
    # Ultra Stop is advisory. Grok's session-end Stop is observe-only and must
    # never be confused with a genuine end_turn gate.
    if event == "Stop" and reason != "end_turn":
        return {}
    return {}


def run_feature(feature: str, payload: dict[str, Any], feature_args: list[str]) -> dict[str, Any]:
    if feature not in ALLOWED_FEATURES or Path(feature).name != feature:
        return {}
    script = HOOK_ROOT / feature
    if not script.is_file():
        return {}
    normalized = normalize_input(payload)
    env = os.environ.copy()
    env["UBP_HOOK_RUNTIME"] = "grok"
    plugin_data = env.get("GROK_PLUGIN_DATA") or env.get("CLAUDE_PLUGIN_DATA")
    if plugin_data:
        env["UBP_HOOK_DATA"] = plugin_data
    cwd = normalized.get("cwd")
    run_cwd = str(cwd) if isinstance(cwd, str) and Path(cwd).is_dir() else os.getcwd()
    proc = subprocess.run(
        [sys.executable, str(script), *feature_args],
        input=json.dumps(normalized),
        text=True,
        capture_output=True,
        cwd=run_cwd,
        env=env,
        timeout=30,
        check=False,
    )
    if proc.stderr:
        print(proc.stderr.rstrip(), file=sys.stderr)
    if proc.returncode != 0:
        return {}
    return adapt_output(
        _parse_output(proc.stdout),
        str(payload.get("hookEventName") or ""),
        str(payload.get("reason") or "") or None,
    )


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({}))
        return 0
    feature = sys.argv[1]
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        if not isinstance(payload, dict):
            payload = {}
    except json.JSONDecodeError as exc:
        print(f"[grok hook] invalid input: {exc}", file=sys.stderr)
        payload = {}
    try:
        output = run_feature(feature, payload, sys.argv[2:])
    except Exception as exc:
        print(f"[grok hook] {feature} failed open: {exc}", file=sys.stderr)
        output = {}
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
