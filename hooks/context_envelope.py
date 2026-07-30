#!/usr/bin/env python3
"""Thin read-only bridge to the bundled Ultra Context Envelope reader."""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from runtime_paths import RuntimePathError, find_project_root


class ContextEnvelopeError(RuntimeError):
    """The canonical Context Envelope helper could not be executed or decoded."""


class ContextEnvelope(dict):
    """Dictionary envelope carrying its canonical bounded injection text."""

    def __init__(self, value: dict, rendered: str):
        super().__init__(value)
        self.rendered = rendered


def find_root(start: Path):
    try:
        return find_project_root(start)
    except RuntimePathError as exc:
        raise ContextEnvelopeError(str(exc)) from exc


def find_root_for_hook(start: Path, hook_name: str):
    """Fail open at a hook boundary while preserving path-conflict evidence."""
    try:
        return find_root(start)
    except ContextEnvelopeError as exc:
        print(f"[{hook_name}] cannot resolve Ultra root: {exc}", file=sys.stderr)
        return None


def _helper_path() -> Path:
    hook_root = Path(__file__).resolve().parent
    installed = hook_root.parent / "runtime" / "hook-context.cjs"
    if installed.is_file():
        return installed
    source = hook_root.parent / "mcp-server" / "hook-context.cjs"
    if source.is_file():
        return source
    raise ContextEnvelopeError("bundled Context Envelope helper is missing")


def _node_binary() -> str:
    configured = os.environ.get("UBP_NODE")
    if configured:
        return configured
    discovered = shutil.which("node")
    if discovered:
        return discovered
    raise ContextEnvelopeError("node executable is unavailable")


def read_context_envelope(root: Path):
    try:
        result = subprocess.run(
            [_node_binary(), str(_helper_path()), str(root.resolve())],
            text=True,
            capture_output=True,
            check=False,
            timeout=5,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ContextEnvelopeError(str(exc)) from exc
    if result.returncode != 0:
        detail = result.stderr.strip() or f"exit {result.returncode}"
        raise ContextEnvelopeError(detail)
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise ContextEnvelopeError(f"invalid Context Envelope response: {exc}") from exc
    if not isinstance(payload, dict):
        raise ContextEnvelopeError("Context Envelope response must be an object")
    value = payload.get("context")
    if value is None:
        return None
    rendered = payload.get("text")
    if not isinstance(value, dict) or not isinstance(rendered, str) or not rendered:
        raise ContextEnvelopeError(
            "Context Envelope response is missing canonical state or text"
        )
    return ContextEnvelope(value, rendered)


def render_context_envelope(_root: Path, context: dict) -> str:
    rendered = getattr(context, "rendered", None)
    if not isinstance(rendered, str) or not rendered:
        raise ContextEnvelopeError(
            "Context Envelope was not produced by the canonical reader"
        )
    return rendered
