#!/usr/bin/env python3
"""Codex wire adapter for Ultra Builder Pro hooks.

Codex and Claude Code share the JSON-on-stdin command-hook shape, but differ
at three important boundaries:

- Codex emits ``apply_patch`` with the patch text in ``tool_input.command``;
  legacy Ultra edit hooks expect one ``Edit`` event per ``file_path``.
- Codex rejects ``permissionDecision: ask`` in PreToolUse output. Ultra warning
  decisions therefore become advisory ``systemMessage`` values.
- Each event has a strict output schema. This adapter removes foreign fields
  while preserving real deny/block decisions and additional context.

The adapter executes only allowlisted sibling hook modules. It is both a CLI
entrypoint used by ``hooks/hooks.json`` and an importable normalization layer
for tests.
"""

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
    "active_task_context.py",
    "health_check.py",
    "pre_stop_check.py",
    "subagent_tracker.py",
    "workflow_checkpoint.py",
    "workflow_context.py",
    "workflow_resume.py",
}
UNIVERSAL_OUTPUT_FIELDS = {"continue", "stopReason", "suppressOutput", "systemMessage"}
PATCH_FILE_RE = re.compile(r"^\*\*\* (?:Add|Update|Delete) File: (.+?)\s*$", re.MULTILINE)
PATCH_MOVE_RE = re.compile(r"^\*\*\* Move to: (.+?)\s*$", re.MULTILINE)


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
    """Return legacy-compatible input(s) for one Codex hook payload."""
    normalized = copy.deepcopy(payload)
    if normalized.get("tool_response") is not None and normalized.get("tool_output") is None:
        normalized["tool_output"] = normalized["tool_response"]

    if normalized.get("tool_name") != "apply_patch":
        return [normalized]

    paths = _patch_paths(normalized.get("tool_input"))
    if not paths:
        normalized["tool_name"] = "Edit"
        tool_input = normalized.get("tool_input")
        normalized["tool_input"] = dict(tool_input) if isinstance(tool_input, dict) else {}
        normalized["tool_input"].setdefault("file_path", "")
        return [normalized]

    outputs: list[dict[str, Any]] = []
    for file_path in paths:
        item = copy.deepcopy(normalized)
        item["tool_name"] = "Edit"
        tool_input = item.get("tool_input")
        item["tool_input"] = dict(tool_input) if isinstance(tool_input, dict) else {}
        item["tool_input"]["file_path"] = file_path
        outputs.append(item)
    return outputs


def _universal(output: dict[str, Any]) -> dict[str, Any]:
    return {key: output[key] for key in UNIVERSAL_OUTPUT_FIELDS if key in output}


def adapt_output(output: dict[str, Any], event: str) -> dict[str, Any]:
    """Convert a legacy hook result to the strict Codex event output schema."""
    if not isinstance(output, dict):
        return {}
    result = _universal(output)
    hook_specific = output.get("hookSpecificOutput")
    hook_specific = dict(hook_specific) if isinstance(hook_specific, dict) else None

    if event == "PreToolUse":
        if hook_specific:
            decision = hook_specific.get("permissionDecision")
            reason = hook_specific.get("permissionDecisionReason")
            if decision == "ask":
                if reason:
                    result["systemMessage"] = str(reason)
                additional = hook_specific.get("additionalContext")
                if additional:
                    result["systemMessage"] = "\n".join(
                        part for part in [result.get("systemMessage"), str(additional)] if part
                    )
                return result
            allowed = {
                "hookEventName": "PreToolUse",
                **{key: value for key, value in hook_specific.items() if key in {
                    "permissionDecision", "permissionDecisionReason", "updatedInput", "additionalContext"
                }},
            }
            result["hookSpecificOutput"] = allowed
        if output.get("decision") in {"block"}:
            result["decision"] = "block"
            if output.get("reason"):
                result["reason"] = output["reason"]
        return result

    if event == "PermissionRequest":
        if hook_specific and hook_specific.get("permissionDecision") in {"allow", "deny"}:
            result["hookSpecificOutput"] = {
                "hookEventName": "PermissionRequest",
                "decision": {
                    "behavior": hook_specific["permissionDecision"],
                    "message": hook_specific.get("permissionDecisionReason"),
                },
            }
        return result

    if event == "PostToolUse":
        if output.get("decision") == "block":
            result["decision"] = "block"
            result["reason"] = str(output.get("reason") or "Ultra post-edit gate blocked continuation")
        if hook_specific and hook_specific.get("additionalContext"):
            result["hookSpecificOutput"] = {
                "hookEventName": "PostToolUse",
                "additionalContext": hook_specific["additionalContext"],
            }
        return result

    if event == "SessionStart":
        if hook_specific and hook_specific.get("additionalContext"):
            result["hookSpecificOutput"] = {
                "hookEventName": "SessionStart",
                "additionalContext": hook_specific["additionalContext"],
            }
        return result

    if event == "SubagentStart":
        if hook_specific and hook_specific.get("additionalContext"):
            result["hookSpecificOutput"] = {
                "hookEventName": "SubagentStart",
                "additionalContext": hook_specific["additionalContext"],
            }
        return result

    if event == "UserPromptSubmit":
        if output.get("decision") == "block":
            result["decision"] = "block"
            result["reason"] = str(output.get("reason") or "Ultra prompt gate blocked submission")
        if hook_specific and hook_specific.get("additionalContext"):
            result["hookSpecificOutput"] = {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": hook_specific["additionalContext"],
            }
        return result

    if event == "Stop":
        if output.get("decision") == "block":
            result["decision"] = "block"
            result["reason"] = str(output.get("reason") or "Ultra completion gate blocked stop")
        return result

    if event in {"PreCompact", "PostCompact", "SubagentStop"}:
        extra = output.get("additionalContext")
        if not extra and hook_specific:
            extra = hook_specific.get("additionalContext")
        if extra:
            result["systemMessage"] = str(extra)
        return result

    return result


def _parse_output(stdout: str) -> dict[str, Any]:
    text = stdout.strip()
    if not text:
        return {}
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return {"systemMessage": f"Ultra hook returned non-JSON output: {text[:500]}"}
    return value if isinstance(value, dict) else {}


def _merge_outputs(outputs: list[dict[str, Any]], event: str) -> dict[str, Any]:
    if not outputs:
        return {}
    if len(outputs) == 1:
        return outputs[0]

    messages = [str(item.get("systemMessage")) for item in outputs if item.get("systemMessage")]
    contexts: list[str] = []
    blocking: dict[str, Any] | None = None
    for item in outputs:
        if item.get("decision") == "block":
            blocking = item
            break
        specific = item.get("hookSpecificOutput")
        if isinstance(specific, dict) and specific.get("permissionDecision") == "deny":
            blocking = item
            break
        if isinstance(specific, dict) and specific.get("additionalContext"):
            contexts.append(str(specific["additionalContext"]))

    result = dict(blocking or {})
    if messages:
        result["systemMessage"] = "\n\n".join(messages)
    if contexts and not blocking and event in {"PostToolUse", "SessionStart", "SubagentStart", "UserPromptSubmit"}:
        result["hookSpecificOutput"] = {
            "hookEventName": event,
            "additionalContext": "\n\n".join(contexts),
        }
    return result


def run_feature(feature: str, payload: dict[str, Any], feature_args: list[str]) -> dict[str, Any]:
    if feature not in ALLOWED_FEATURES or Path(feature).name != feature:
        return {"systemMessage": f"Ultra hook adapter refused unknown feature: {feature}"}
    script = HOOK_ROOT / feature
    if not script.is_file():
        return {"systemMessage": f"Ultra hook feature is missing: {feature}"}

    event = str(payload.get("hook_event_name") or "")
    if feature == "workflow_resume.py" and event == "PostCompact":
        payload = dict(payload)
        payload["hook_event_name"] = "SessionStart"
        payload["source"] = "compact"

    env = os.environ.copy()
    env["UBP_HOOK_RUNTIME"] = "codex"
    plugin_data = env.get("PLUGIN_DATA") or env.get("CLAUDE_PLUGIN_DATA")
    if plugin_data:
        env["UBP_HOOK_DATA"] = plugin_data

    cwd = payload.get("cwd")
    run_cwd = str(cwd) if isinstance(cwd, str) and Path(cwd).is_dir() else os.getcwd()
    outputs: list[dict[str, Any]] = []
    for normalized in normalize_inputs(payload):
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
                "systemMessage": f"Ultra hook {feature} failed with exit {proc.returncode}: {proc.stderr.strip()[:500]}"
            })
            continue
        outputs.append(adapt_output(_parse_output(proc.stdout), event))
    return _merge_outputs(outputs, event)


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"systemMessage": "Ultra Codex hook adapter requires a feature name"}))
        return 0
    feature = sys.argv[1]
    feature_args = sys.argv[2:]
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        if not isinstance(payload, dict):
            payload = {}
    except json.JSONDecodeError as exc:
        print(json.dumps({"systemMessage": f"Ultra hook input parse error: {exc}"}))
        return 0
    try:
        output = run_feature(feature, payload, feature_args)
    except subprocess.TimeoutExpired:
        output = {"systemMessage": f"Ultra hook {feature} timed out"}
    except Exception as exc:  # adapter boundary must fail open with evidence
        output = {"systemMessage": f"Ultra hook adapter error in {feature}: {exc}"}
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
