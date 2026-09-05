#!/usr/bin/env python3
"""Create an isolated, metadata-only agent-delegation registry for wrapped runs.

Why: `agent-delegate run` writes its request receipt (request.json) BEFORE it
calls ACPX (agent_delegate.py:438-456), into `<receipt_root>/<stamp>-<id>/`
(agent_delegate.py:255-265). The installed global registry points receipt_root
at real-HOME state, which the evaluation sandbox profile deliberately denies.
The wrapper already supports AGENT_DELEGATION_CONFIG (agent_delegate.py:48-54):
an alternate registry path. This script copies the installed registry and
rewrites only receipt_root into the evaluation isolation directory, so the
ordinary `agent-delegate run --to zcode ...` path works under the sandbox
with the global registry untouched.

Safety: the installed registry is pure metadata (schema_version, acpx paths,
receipt_root, runtime pins, target argv/versions). This script refuses to
copy anything containing a secret-looking field name; it never reads,
prints, or rewrites credentials (those live in the separate ZCode shared
credential store, which is not involved here).

Usage:
  prepare-delegation-config.py --receipt-root DIR --out FILE [--source FILE]

Then:  export AGENT_DELEGATION_CONFIG=FILE
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import sys
import tempfile

SECRET_FIELD = re.compile(r"(?i)(token|secret|password|credential|api[-_]?key)")


def fail(message: str) -> "SystemExit":
    print(f"prepare-delegation-config: {message}", file=sys.stderr)
    return SystemExit(64)


def assert_metadata_only(value: object, trail: str = "") -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            name = str(key)
            if SECRET_FIELD.search(name):
                raise fail(f"refusing to copy secret-looking field '{trail}{name}'")
            assert_metadata_only(item, f"{trail}{name}.")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            assert_metadata_only(item, f"{trail}[{index}].")


def atomic_write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary_path = Path(temporary)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--source",
        default=os.environ.get(
            "AGENT_DELEGATION_CONFIG",
            str(Path.home() / ".config" / "agent-delegation" / "config.json"),
        ),
        help="installed registry to copy (default: $AGENT_DELEGATION_CONFIG or "
        "~/.config/agent-delegation/config.json)",
    )
    parser.add_argument(
        "--receipt-root",
        required=True,
        help="directory that will hold run receipts; created mode 0700, must be "
        "inside the evaluation isolation root (outside the sandbox deny root)",
    )
    parser.add_argument(
        "--out",
        required=True,
        help="where to write the isolated registry copy (mode 0600)",
    )
    args = parser.parse_args()

    source = Path(args.source).expanduser().resolve()
    receipt_root = Path(args.receipt_root).expanduser().resolve()
    out = Path(args.out).expanduser().resolve()

    try:
        registry = json.loads(source.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise fail(f"source registry not found: {source}")
    except json.JSONDecodeError as exc:
        raise fail(f"source registry is not valid JSON: {exc}")
    if not isinstance(registry, dict):
        raise fail("source registry must be a JSON object")
    if registry.get("schema_version") != 1:
        raise fail(f"unsupported schema_version {registry.get('schema_version')!r}")

    assert_metadata_only(registry)

    if not receipt_root.is_absolute():
        raise fail("--receipt-root must resolve to an absolute path")
    receipt_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(receipt_root, 0o700)

    isolated = dict(registry)
    isolated["receipt_root"] = str(receipt_root)
    atomic_write_json(out, isolated)

    reloaded = json.loads(out.read_text(encoding="utf-8"))
    if reloaded.get("receipt_root") != str(receipt_root):
        raise fail("written registry failed reload verification")
    if not Path(reloaded["receipt_root"]).is_absolute():
        raise fail("written receipt_root is not absolute")
    if reloaded.get("targets") != registry.get("targets"):
        raise fail("written registry diverged from source targets")
    if (out.stat().st_mode & 0o777) != 0o600:
        raise fail("written registry must be mode 0600")

    print(f"isolated registry written: {out}")
    print(f"receipt_root relocated:    {receipt_root}")
    print(f"export AGENT_DELEGATION_CONFIG={out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
