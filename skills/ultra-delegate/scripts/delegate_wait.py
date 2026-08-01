#!/usr/bin/env python3
"""Wait for one delegated result to become non-empty and stable."""

from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path


RESULT_SCHEMA = "ultra-delegation-result-v1"
STATUSES = {"finished", "blocked", "failed"}
CHECK_STATUSES = {"passed", "failed", "not_run"}


def nonempty(value) -> bool:
    return isinstance(value, str) and bool(value.strip())


def validate_result(payload: dict) -> None:
    if not isinstance(payload, dict):
        raise ValueError("result must be a JSON object")
    if payload.get("$schema") != RESULT_SCHEMA:
        raise ValueError(f"result $schema must be {RESULT_SCHEMA}")
    if payload.get("status") not in STATUSES:
        raise ValueError("result status must be finished, blocked, or failed")
    if not nonempty(payload.get("summary")):
        raise ValueError("result summary must be non-empty")
    for field in ("changed_files", "checks", "evidence", "questions", "residual_risks"):
        if not isinstance(payload.get(field), list):
            raise ValueError(f"result {field} must be an array")
    for field in ("changed_files", "evidence", "questions", "residual_risks"):
        if not all(nonempty(item) for item in payload[field]):
            raise ValueError(f"result {field} must contain non-empty strings")
    for check in payload["checks"]:
        if not isinstance(check, dict) or not nonempty(check.get("command")):
            raise ValueError("result checks require a command")
        if check.get("status") not in CHECK_STATUSES:
            raise ValueError("result check status is invalid")
    if payload["status"] == "blocked" and not payload["questions"]:
        raise ValueError("blocked result requires a question")
    for field in ("delegation_id", "host", "base_head", "final_head", "started_at", "finished_at"):
        if not nonempty(payload.get(field)):
            raise ValueError(f"result {field} must be non-empty")
    for field in ("instruction_digest", "permission_digest", "output_schema_digest"):
        if not isinstance(payload.get(field), str) or not re.fullmatch(r"[0-9a-f]{64}", payload[field]):
            raise ValueError(f"result {field} must be a SHA-256 digest")
    if not isinstance(payload.get("read_only"), bool):
        raise ValueError("result read_only must be a boolean")
    if payload.get("exit_code") is not None and not isinstance(payload["exit_code"], int):
        raise ValueError("result exit_code must be an integer or null")


def wait_for_result(path: Path, interval: float, timeout: float) -> dict:
    deadline = time.monotonic() + timeout
    previous_size = -1
    stable_reads = 0
    while time.monotonic() < deadline:
        size = path.stat().st_size if path.exists() else 0
        if size > 0 and size == previous_size:
            stable_reads += 1
            if stable_reads >= 1:
                payload = json.loads(path.read_text(encoding="utf-8"))
                validate_result(payload)
                return payload
        else:
            stable_reads = 0
        previous_size = size
        time.sleep(interval)
    raise TimeoutError(f"result did not stabilize within {timeout:g}s: {path}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("result", type=Path)
    parser.add_argument("--interval", type=float, default=1.0)
    parser.add_argument("--timeout", type=float, default=1800.0)
    args = parser.parse_args()
    print(json.dumps(wait_for_result(args.result, args.interval, args.timeout)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
