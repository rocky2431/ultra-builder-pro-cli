#!/usr/bin/env python3
"""Thin bridge to the single bundled JavaScript Context Spine reader."""

import json
import os
import shutil
import subprocess
from pathlib import Path


class ContextSpineError(RuntimeError):
    """The canonical breadcrumb helper could not be executed or decoded."""


class Breadcrumb(dict):
    """Dictionary breadcrumb carrying its canonical rendered injection text."""

    def __init__(self, value: dict, rendered: str):
        super().__init__(value)
        self.rendered = rendered


def find_root(start: Path):
    for root in (start, *start.parents):
        if (root / ".ultra" / "state.db").is_file():
            return root
    return None


def _helper_path() -> Path:
    hook_root = Path(__file__).resolve().parent
    installed = hook_root.parent / "runtime" / "breadcrumb.cjs"
    if installed.is_file():
        return installed
    source = hook_root.parent / "mcp-server" / "breadcrumb.cjs"
    if source.is_file():
        return source
    raise ContextSpineError("bundled breadcrumb helper is missing")


def _node_binary() -> str:
    configured = os.environ.get("UBP_NODE")
    if configured:
        return configured
    discovered = shutil.which("node")
    if discovered:
        return discovered
    raise ContextSpineError("node executable is unavailable")


def read_breadcrumb(root: Path):
    try:
        result = subprocess.run(
            [_node_binary(), str(_helper_path()), str(root.resolve())],
            text=True,
            capture_output=True,
            check=False,
            timeout=5,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ContextSpineError(str(exc)) from exc
    if result.returncode != 0:
        detail = result.stderr.strip() or f"exit {result.returncode}"
        raise ContextSpineError(detail)
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise ContextSpineError(f"invalid breadcrumb response: {exc}") from exc
    if not isinstance(payload, dict):
        raise ContextSpineError("breadcrumb response must be an object")
    value = payload.get("breadcrumb")
    if value is None:
        return None
    rendered = payload.get("text")
    if not isinstance(value, dict) or not isinstance(rendered, str) or not rendered:
        raise ContextSpineError("breadcrumb response is missing canonical state or text")
    return Breadcrumb(value, rendered)


def render_breadcrumb(_root: Path, breadcrumb: dict) -> str:
    rendered = getattr(breadcrumb, "rendered", None)
    if not isinstance(rendered, str) or not rendered:
        raise ContextSpineError("breadcrumb was not produced by the canonical reader")
    return rendered
