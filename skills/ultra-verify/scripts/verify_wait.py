#!/usr/bin/env python3
"""Wait for one named advisor output file to become non-empty and stable."""

import argparse
import json
import re
import sys
import time
from pathlib import Path

POLL_INTERVAL = 3
DEFAULT_TIMEOUT = 1200
SAFE_ADVISOR = re.compile(r"^[a-zA-Z0-9_-]+$")


def _file_size(path: Path) -> int:
    try:
        return path.stat().st_size
    except (FileNotFoundError, OSError):
        return -1


def _safe_output(value: str) -> Path:
    result = Path(value)
    if result.is_absolute() or len(result.parts) != 1 or result.name in {"", ".", ".."}:
        raise argparse.ArgumentTypeError("--output must be one file name inside the session directory")
    return result


def _arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("session_path", type=Path)
    parser.add_argument("--advisor", default="advisor")
    parser.add_argument("--output", type=_safe_output, default=Path("advisor-output.md"))
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    args = parser.parse_args()
    if not SAFE_ADVISOR.fullmatch(args.advisor):
        parser.error("--advisor must use letters, numbers, underscore, or hyphen")
    if args.timeout < 0:
        parser.error("--timeout must be non-negative")
    if not args.session_path.is_dir():
        parser.error(f"session directory not found: {args.session_path}")
    return args


def _status(session_path: Path, advisor: str, output_name: Path) -> dict:
    output = session_path / output_name
    if _file_size(output) > 0:
        return {"name": advisor, "status": "complete", "file": str(output)}
    return {"name": advisor, "status": "pending", "file": None}


def _timeout_status(session_path: Path, advisor: str, output_name: Path) -> dict:
    output = session_path / output_name
    error = session_path / f"{advisor}-error.log"
    output_size = _file_size(output)
    if output_size > 0:
        return {"name": advisor, "status": "complete", "file": str(output)}
    if _file_size(error) > 0:
        return {"name": advisor, "status": "failed", "file": str(error)}
    if output_size == 0:
        return {"name": advisor, "status": "empty", "file": str(output)}
    return {"name": advisor, "status": "pending", "file": None}


def main() -> None:
    args = _arguments()
    output = args.session_path / args.output
    deadline = time.monotonic() + args.timeout
    previous_size = _file_size(output)
    while time.monotonic() < deadline:
        current_size = _file_size(output)
        advisor = _status(args.session_path, args.advisor, args.output)
        if advisor["status"] == "complete" and current_size == previous_size:
            elapsed = int(args.timeout - (deadline - time.monotonic()))
            print(json.dumps({
                "status": "complete", "advisor": advisor, "elapsed_seconds": elapsed,
            }))
            return
        state = "stabilizing" if advisor["status"] == "complete" else "waiting"
        remaining = max(0, int(deadline - time.monotonic()))
        sys.stderr.write(f"\r  [0/1] {args.advisor}:{state} ({remaining}s remaining)  ")
        sys.stderr.flush()
        previous_size = current_size
        time.sleep(POLL_INTERVAL)

    advisor = _timeout_status(args.session_path, args.advisor, args.output)
    print(json.dumps({
        "status": "timeout", "advisor": advisor, "elapsed_seconds": args.timeout,
    }))


if __name__ == "__main__":
    main()
