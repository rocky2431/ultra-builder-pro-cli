#!/usr/bin/env python3
"""ZCode wire adapter for Ultra's five file-first lifecycle hooks."""

from __future__ import annotations

import copy
import json
import os
import re
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
PATCH_FILE_RE = re.compile(r"^\*\*\* (?:Add|Update|Delete) File: (.+?)\s*$", re.MULTILINE)
PATCH_MOVE_RE = re.compile(r"^\*\*\* Move to: (.+?)\s*$", re.MULTILINE)


def normalize_input(payload: dict[str, Any]) -> dict[str, Any]:
    """Translate ZCode's camelCase hook wire names to the shared contract."""
    normalized = copy.deepcopy(payload)
    aliases = {
        "hookEventName": "hook_event_name",
        "sessionId": "session_id",
        "toolName": "tool_name",
        "toolInput": "tool_input",
        "toolResult": "tool_output",
        "toolResponse": "tool_output",
        "workspaceRoot": "workspace_root",
    }
    for source, target in aliases.items():
        if source in normalized and target not in normalized:
            normalized[target] = normalized[source]
    if "cwd" not in normalized and isinstance(normalized.get("workspace_root"), str):
        normalized["cwd"] = normalized["workspace_root"]
    return normalized


def _patch_paths(tool_input: Any) -> list[str]:
    if not isinstance(tool_input, dict):
        return []
    patch = tool_input.get("command") or tool_input.get("patch") or ""
    if not isinstance(patch, str):
        return []
    paths: list[str] = []
    for match in [*PATCH_FILE_RE.findall(patch), *PATCH_MOVE_RE.findall(patch)]:
        candidate = match.strip()
        if candidate and candidate not in paths:
            paths.append(candidate)
    return paths


def normalize_inputs(payload: dict[str, Any]) -> list[dict[str, Any]]:
    normalized = normalize_input(payload)
    if normalized.get("tool_name") != "ApplyPatch":
        return [normalized]
    paths = _patch_paths(normalized.get("tool_input"))
    if not paths:
        normalized["tool_name"] = "Edit"
        return [normalized]
    results: list[dict[str, Any]] = []
    for file_path in paths:
        item = copy.deepcopy(normalized)
        item["tool_name"] = "Edit"
        tool_input = item.get("tool_input")
        item["tool_input"] = dict(tool_input) if isinstance(tool_input, dict) else {}
        item["tool_input"]["file_path"] = file_path
        results.append(item)
    return results


def _parse_output(stdout: str) -> dict[str, Any]:
    text = stdout.strip()
    if not text:
        return {}
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return {"systemMessage": f"Ultra hook returned non-JSON output: {text[:500]}"}
    return value if isinstance(value, dict) else {}


def adapt_output(output: dict[str, Any], event: str) -> dict[str, Any]:
    """Project shared output onto ZCode's strict event-specific schema."""
    if not isinstance(output, dict):
        return {}
    specific = output.get("hookSpecificOutput")
    specific = specific if isinstance(specific, dict) else {}
    context = specific.get("additionalContext") or output.get("additionalContext")

    if event == "PreToolUse":
        decision = specific.get("permissionDecision")
        if decision in {"allow", "ask", "deny"}:
            projected: dict[str, Any] = {
                "hookEventName": "PreToolUse",
                "permissionDecision": decision,
            }
            reason = specific.get("permissionDecisionReason") or output.get("reason")
            if reason:
                projected["permissionDecisionReason"] = str(reason)
            if context:
                projected["additionalContext"] = str(context)
            return {"hookSpecificOutput": projected}
        if output.get("decision") == "block":
            reason = str(output.get("reason") or "Ultra blocked this tool call")
            return {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            }
        return {}

    if event in {
        "SessionStart", "UserPromptSubmit", "PostToolUse",
        "PostToolUseFailure", "Stop",
    } and context:
        return {
            "hookSpecificOutput": {
                "hookEventName": event,
                "additionalContext": str(context),
            }
        }
    return {}


def _merge_outputs(outputs: list[dict[str, Any]], event: str) -> dict[str, Any]:
    if not outputs:
        return {}
    for output in outputs:
        specific = output.get("hookSpecificOutput")
        if isinstance(specific, dict) and specific.get("permissionDecision") == "deny":
            return output
    contexts = []
    for output in outputs:
        specific = output.get("hookSpecificOutput")
        if isinstance(specific, dict) and specific.get("additionalContext"):
            contexts.append(str(specific["additionalContext"]))
    if contexts:
        return {
            "hookSpecificOutput": {
                "hookEventName": event,
                "additionalContext": "\n\n".join(contexts),
            }
        }
    return outputs[-1]


def run_feature(feature: str, payload: dict[str, Any], feature_args: list[str]) -> dict[str, Any]:
    if feature not in ALLOWED_FEATURES or Path(feature).name != feature:
        return {"systemMessage": f"Ultra hook adapter refused unknown feature: {feature}"}
    script = HOOK_ROOT / feature
    if not script.is_file():
        return {"systemMessage": f"Ultra hook feature is missing: {feature}"}

    event = str(payload.get("hookEventName") or payload.get("hook_event_name") or "")
    normalized_items = normalize_inputs(payload)
    env = os.environ.copy()
    env["UBP_HOOK_RUNTIME"] = "zcode"
    plugin_data = env.get("ZCODE_PLUGIN_DATA") or env.get("CLAUDE_PLUGIN_DATA")
    if plugin_data:
        env["UBP_HOOK_DATA"] = plugin_data
    cwd = normalized_items[0].get("cwd") if normalized_items else None
    run_cwd = str(cwd) if isinstance(cwd, str) and Path(cwd).is_dir() else os.getcwd()

    outputs: list[dict[str, Any]] = []
    for normalized in normalized_items:
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
            outputs.append({
                "systemMessage": (
                    f"Ultra hook {feature} failed with exit {proc.returncode}: "
                    f"{proc.stderr.strip()[:500]}"
                )
            })
            continue
        outputs.append(adapt_output(_parse_output(proc.stdout), event))
    return _merge_outputs(outputs, event)


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"systemMessage": "Ultra ZCode hook adapter requires a feature name"}))
        return 0
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        if not isinstance(payload, dict):
            payload = {}
    except json.JSONDecodeError as exc:
        print(json.dumps({"systemMessage": f"Ultra hook input parse error: {exc}"}))
        return 0
    try:
        output = run_feature(sys.argv[1], payload, sys.argv[2:])
    except subprocess.TimeoutExpired:
        output = {"systemMessage": f"Ultra hook {sys.argv[1]} timed out"}
    except Exception as exc:
        output = {"systemMessage": f"Ultra hook adapter error in {sys.argv[1]}: {exc}"}
    # ZCode's hook wire schema is strict. Its official contract explicitly accepts an
    # empty stdout stream as a successful no-op, so do not serialize an empty object.
    if output:
        print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
