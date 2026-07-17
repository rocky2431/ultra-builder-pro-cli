#!/usr/bin/env python3
"""File-based completion waiter for the Ultra Verify advisor.

Poll the session directory until the expected output is non-empty and stable, or until timeout.
The JSON result carries the operational status; timeout is not a process error.
"""

import json
import sys
import time
from pathlib import Path

POLL_INTERVAL = 3
DEFAULT_TIMEOUT = 1200
ADVISOR = "codex"
OUTPUT_FILE = "codex-output.md"


def _file_size(path: Path) -> int:
    try:
        return path.stat().st_size
    except (FileNotFoundError, OSError):
        return -1


def _check_output(session_path: Path) -> dict:
    output = session_path / OUTPUT_FILE
    if _file_size(output) > 0:
        return {"name": ADVISOR, "status": "complete", "file": str(output)}
    return {"name": ADVISOR, "status": "pending", "file": None}


def _timeout_status(session_path: Path) -> dict:
    output = session_path / OUTPUT_FILE
    error = session_path / f"{ADVISOR}-error.log"
    output_size = _file_size(output)
    if output_size > 0:
        return {"name": ADVISOR, "status": "complete", "file": str(output)}
    if _file_size(error) > 0:
        return {"name": ADVISOR, "status": "failed", "file": str(error)}
    if output_size == 0:
        return {"name": ADVISOR, "status": "empty", "file": str(output)}
    return {"name": ADVISOR, "status": "pending", "file": None}


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        sys.exit(2)

    session_path = Path(sys.argv[1])
    timeout = DEFAULT_TIMEOUT
    if "--timeout" in sys.argv:
        idx = sys.argv.index("--timeout")
        if idx + 1 >= len(sys.argv):
            print("Error: --timeout requires an integer", file=sys.stderr)
            sys.exit(2)
        try:
            timeout = int(sys.argv[idx + 1])
        except ValueError:
            print(f"Error: --timeout must be integer: {sys.argv[idx + 1]}", file=sys.stderr)
            sys.exit(2)
        if timeout < 0:
            print("Error: --timeout must be non-negative", file=sys.stderr)
            sys.exit(2)

    if not session_path.is_dir():
        print(f"Error: session directory not found: {session_path}", file=sys.stderr)
        sys.exit(2)

    deadline = time.monotonic() + timeout
    previous_size = _file_size(session_path / OUTPUT_FILE)
    while time.monotonic() < deadline:
        current_size = _file_size(session_path / OUTPUT_FILE)
        advisor = _check_output(session_path)
        stable = advisor["status"] == "complete" and current_size == previous_size
        if stable:
            elapsed = int(timeout - (deadline - time.monotonic()))
            print(json.dumps({"status": "complete", ADVISOR: advisor, "elapsed_seconds": elapsed}))
            return

        state = "stabilizing" if advisor["status"] == "complete" else "waiting"
        remaining = max(0, int(deadline - time.monotonic()))
        sys.stderr.write(f"\r  [0/1] {ADVISOR}:{state} ({remaining}s remaining)  ")
        sys.stderr.flush()
        previous_size = current_size
        time.sleep(POLL_INTERVAL)

    advisor = _timeout_status(session_path)
    print(json.dumps({"status": "timeout", ADVISOR: advisor, "elapsed_seconds": timeout}))


if __name__ == "__main__":
    main()
