#!/usr/bin/env python3
"""Kimi Code wire adapter for Ultra Builder Pro lifecycle hooks.

Kimi 0.26 uses snake_case JSON input compatible with the workflow hooks, but
its output contract accepts only ``message`` plus an optional structured deny.
This adapter preserves explicit projection denials and optional Stop decisions, converts foreign context
fields into Kimi messages, and fails open with diagnostic evidence.
"""

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
    "active_task_context.py",
    "health_check.py",
    "pre_stop_check.py",
    "subagent_tracker.py",
    "workflow_checkpoint.py",
    "workflow_context.py",
    "workflow_resume.py",
}


def normalize_input(payload: dict[str, Any]) -> dict[str, Any]:
    """Add only the legacy aliases required by the shared workflow hooks."""
    normalized = copy.deepcopy(payload)
    agent_name = normalized.get("agent_name")
    if isinstance(agent_name, str) and agent_name:
        normalized.setdefault("agent_id", agent_name)
        normalized.setdefault("agent_type", agent_name)
    if normalized.get("tool_response") is not None and normalized.get("tool_output") is None:
        normalized["tool_output"] = normalized["tool_response"]
    return normalized


def _text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def adapt_output(output: dict[str, Any], event: str) -> dict[str, Any]:
    """Convert one legacy hook result to Kimi's exact structured schema."""
    if not isinstance(output, dict):
        return {}
    specific = output.get("hookSpecificOutput")
    specific = specific if isinstance(specific, dict) else {}

    decision = specific.get("permissionDecision")
    blocked = output.get("decision") == "block" or decision == "deny"
    reason = (
        _text(specific.get("permissionDecisionReason"))
        or _text(output.get("reason"))
        or f"Ultra {event} gate blocked continuation"
    )
    if blocked:
        return {
            "hookSpecificOutput": {
                "message": reason,
                "permissionDecision": "deny",
                "permissionDecisionReason": reason,
            }
        }

    context = (
        _text(specific.get("additionalContext"))
        or _text(output.get("additionalContext"))
        or _text(output.get("systemMessage"))
        or _text(specific.get("message"))
        or _text(output.get("message"))
    )
    advisory = _text(specific.get("permissionDecisionReason")) if decision == "ask" else ""
    message = "\n\n".join(part for part in [advisory, context] if part)
    return {"message": message} if message else {}


def _parse_output(stdout: str) -> dict[str, Any]:
    text = stdout.strip()
    if not text:
        return {}
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return {"message": f"Ultra hook returned non-JSON output: {text[:500]}"}
    return value if isinstance(value, dict) else {}


def run_feature(feature: str, payload: dict[str, Any], feature_args: list[str]) -> dict[str, Any]:
    if feature not in ALLOWED_FEATURES or Path(feature).name != feature:
        return {"message": f"Ultra hook adapter refused unknown feature: {feature}"}
    script = HOOK_ROOT / feature
    if not script.is_file():
        return {"message": f"Ultra hook feature is missing: {feature}"}

    event = str(payload.get("hook_event_name") or "")
    normalized = normalize_input(payload)
    if feature == "workflow_resume.py" and event == "PostCompact":
        normalized["hook_event_name"] = "SessionStart"
        normalized["source"] = "compact"

    env = os.environ.copy()
    env["UBP_HOOK_RUNTIME"] = "kimi"
    plugin_data = env.get("PLUGIN_DATA") or env.get("KIMI_PLUGIN_ROOT")
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
        return {
            "message": (
                f"Ultra hook {feature} failed with exit {proc.returncode}: "
                f"{proc.stderr.strip()[:500]}"
            )
        }
    return adapt_output(_parse_output(proc.stdout), event)


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"message": "Ultra Kimi hook adapter requires a feature name"}))
        return 0
    feature = sys.argv[1]
    feature_args = sys.argv[2:]
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        if not isinstance(payload, dict):
            payload = {}
    except json.JSONDecodeError as exc:
        print(json.dumps({"message": f"Ultra hook input parse error: {exc}"}))
        return 0
    try:
        output = run_feature(feature, payload, feature_args)
    except subprocess.TimeoutExpired:
        output = {"message": f"Ultra hook {feature} timed out"}
    except Exception as exc:  # Kimi hooks are fail-open at this adapter boundary.
        output = {"message": f"Ultra hook adapter error in {feature}: {exc}"}
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
