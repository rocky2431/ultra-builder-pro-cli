#!/usr/bin/env python3
"""Wait for and validate Ultra review artifacts.

Usage:
    python3 review_wait.py <session_path> packet --packet-digest <sha256>
    python3 review_wait.py <session_path> agents --packet-digest <sha256> <artifact-stem> [<artifact-stem> ...]
    python3 review_wait.py <session_path> summary --packet-digest <sha256>
    python3 review_wait.py <session_path> summary --packet-digest <sha256> --summary-snapshot-digest <sha256>

New sessions require admitted v4. Add ``--legacy-v4`` immediately after the packet
digest only when reading an immutable pre-admission v4 session, or ``--legacy-v3`` for
an immutable historical v3 session; neither flag writes or upgrades artifacts.

The agents mode validates the exact named JSON files. The summary mode validates the
two-axis verdict contract. Timeout and poll intervals can be shortened in tests with
UBP_REVIEW_WAIT_TIMEOUT and UBP_REVIEW_WAIT_POLL.
"""

import hashlib
import json
import os
import re
import selectors
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path, PurePosixPath

FINDINGS_SCHEMA = "ultra-review-findings-v4"
SUMMARY_SCHEMA = "ultra-review-summary-v4"
LEGACY_FINDINGS_SCHEMA = "ultra-review-findings-v3"
LEGACY_SUMMARY_SCHEMA = "ultra-review-summary-v3"
ADMISSION_SCHEMA_V1 = "ultra-review-admission-v1"
ADMISSION_SCHEMA_V2 = "ultra-review-admission-v2"
ADMISSION_CONTRACT_V1 = "ultra-review-admission-required-v1"
ADMISSION_CONTRACT_V2 = "ultra-review-admission-required-v2"
STRICT_ADMISSION_CONTRACTS = {ADMISSION_CONTRACT_V1, ADMISSION_CONTRACT_V2}
AXES = {"spec_fidelity", "engineering_standards"}
SEVERITIES = {"P0", "P1", "P2", "P3"}
AXIS_VERDICTS = {"PASS", "FAIL", "INCOMPLETE"}
OVERALL_VERDICTS = {"APPROVE", "REQUEST_CHANGES", "INCOMPLETE"}
REVIEW_MODES = {"task", "change", "plan"}
EXECUTION_MODES = {"isolated", "sequential-shared-context"}
SELECTION_STATUSES = {"selected", "skipped"}
REVIEW_WORKERS = {
    "review-spec",
    "review-code",
    "review-tests",
    "review-errors",
    "review-design",
    "review-comments",
}
CANONICAL_WORKERS = (
    ("review-spec", "spec_fidelity", "skills/ultra-review/references/spec.md"),
    ("review-code", "engineering_standards", "skills/ultra-review/references/code.md"),
    ("review-tests", "engineering_standards", "skills/ultra-review/references/tests.md"),
    ("review-errors", "engineering_standards", "skills/ultra-review/references/errors.md"),
    ("review-design", "engineering_standards", "skills/ultra-review/references/design.md"),
    ("review-comments", "engineering_standards", "skills/ultra-review/references/comments.md"),
)
CANONICAL_WORKER_BY_AGENT = {
    agent: {"axis": axis, "lens": lens, "order": order}
    for order, (agent, axis, lens) in enumerate(CANONICAL_WORKERS)
}
PACKET_REQUIRED_FIELDS = {
    "$schema",
    "session",
    "mode",
    "created_at",
    "head",
    "range",
    "change_id",
    "task_ids",
    "acceptance",
    "public_seams",
    "north_star_trace",
    "context_files",
    "workers",
    "diff_files",
    "output_directory",
}
TRACE_FIELDS = {
    "path",
    "first_principles",
    "serves",
    "touches",
    "north_star_revision",
    "north_star_digest",
}
CONTEXT_FIELDS = {"path", "sha256"}
WORKER_FIELDS = {"agent", "axis", "lens", "output"}
REVIEW_HISTORY_FIELDS = {
    "parent_summary_ref",
    "parent_summary_digest",
    "unresolved_blocking_ids",
}
FOREIGN_REVIEW_SESSION = re.compile(
    r"\.ultra/reviews/([A-Za-z0-9][A-Za-z0-9._-]*)/"
)
ARTIFACT_STEM = re.compile(r"^[a-z][a-z0-9-]*$")
FINDING_FIELDS = {
    "id", "axis", "severity", "category", "title", "file", "line", "trigger",
    "impact", "evidence", "suggestion",
}
MAX_JSON_BYTES = 8 * 1024 * 1024
READ_CHUNK_BYTES = 64 * 1024
MAX_VALIDATOR_REPORT_BYTES = 1024 * 1024
VALIDATOR_TIMEOUT_SECONDS = 5
ADMISSION_FIELDS = {
    "$schema",
    "version",
    "session",
    "packet_digest",
    "head",
    "observations",
    "north_star_report",
    "subject_digest",
}
ADMISSION_OBSERVATION_FIELDS_V1 = {"role", "path", "sha256"}
ADMISSION_OBSERVATION_FIELDS_V2 = {"role", "path", "sha256", "byte_length"}
PACKET_SUBJECT_OBSERVATION_FIELDS = {"role", "path", "sha256", "byte_length"}
NORTH_STAR_REPORT_RECEIPT_FIELDS = {
    "schema",
    "sha256",
    "input_sha256",
    "input_byte_length",
    "source_observations",
}
NORTH_STAR_SOURCE_OBSERVATION_FIELDS = {"role", "path", "sha256", "byte_length"}


def env_seconds(name: str, default: float) -> float:
    try:
        value = float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


DEFAULT_TIMEOUT = env_seconds("UBP_REVIEW_WAIT_TIMEOUT", 300.0)
POLL_INTERVAL = env_seconds("UBP_REVIEW_WAIT_POLL", 2.0)


def decode_json_bytes(data_bytes: bytes, label: str):
    try:
        data = json.loads(data_bytes.decode("utf-8"))
    except UnicodeDecodeError as error:
        return None, f"{label} is unreadable UTF-8 JSON: {error}"
    except json.JSONDecodeError as error:
        return None, f"{label} is unreadable JSON: {error}"
    if not isinstance(data, dict):
        return None, f"{label} top-level value must be an object"
    return data, None


def _stat_identity(value):
    return (
        value.st_dev,
        value.st_ino,
        value.st_mode,
        value.st_size,
        value.st_mtime_ns,
        value.st_ctime_ns,
    )


def _component_identity(value):
    return (value.st_dev, value.st_ino, value.st_mode)


def _verify_fresh_repo_walk(
    root: Path,
    segments,
    directory_identities,
    file_identity,
    label: str,
):
    """Rewalk from the current root and reject any swapped path component."""
    directory_flags = os.O_RDONLY
    directory_flags |= getattr(os, "O_DIRECTORY", 0)
    directory_flags |= getattr(os, "O_NOFOLLOW", 0)
    descriptors = []
    try:
        root_path = os.stat(root, follow_symlinks=False)
        descriptor = os.open(root, directory_flags)
        descriptors.append(descriptor)
        root_fd = os.fstat(descriptor)
        if (
            _component_identity(root_path) != directory_identities[0]
            or _component_identity(root_fd) != directory_identities[0]
        ):
            return f"{label} repository root changed after its stable byte snapshot"

        for index, segment in enumerate(segments[:-1], start=1):
            component = os.stat(segment, dir_fd=descriptor, follow_symlinks=False)
            if stat.S_ISLNK(component.st_mode) or not stat.S_ISDIR(component.st_mode):
                return f"{label} path component changed after its stable byte snapshot"
            next_descriptor = os.open(segment, directory_flags, dir_fd=descriptor)
            descriptors.append(next_descriptor)
            opened = os.fstat(next_descriptor)
            if (
                _component_identity(component) != directory_identities[index]
                or _component_identity(opened) != directory_identities[index]
            ):
                return (
                    f"{label} path component {'/'.join(segments[:index])} changed "
                    "after its stable byte snapshot"
                )
            descriptor = next_descriptor

        current_file = os.stat(
            segments[-1],
            dir_fd=descriptor,
            follow_symlinks=False,
        )
        if (
            not stat.S_ISREG(current_file.st_mode)
            or _stat_identity(current_file) != file_identity
        ):
            return f"{label} changed after its stable byte snapshot"
    except (FileNotFoundError, NotADirectoryError):
        return f"{label} path changed after its stable byte snapshot"
    except OSError as error:
        return f"{label} fresh path identity cannot be verified: {error}"
    finally:
        for descriptor in reversed(descriptors):
            os.close(descriptor)
    return None


def stable_read_repo_bytes(
    repo_root: Path,
    repo_path: str,
    label: str,
    max_bytes: int = MAX_JSON_BYTES,
):
    """Read one bounded file through a no-symlink repository descriptor walk."""
    normalized, path_error = validate_repo_path(repo_path, repo_root, label)
    if path_error:
        return None, path_error, False
    segments = normalized.split("/")
    directory_flags = os.O_RDONLY
    directory_flags |= getattr(os, "O_DIRECTORY", 0)
    directory_flags |= getattr(os, "O_NOFOLLOW", 0)
    file_flags = os.O_RDONLY
    file_flags |= getattr(os, "O_NONBLOCK", 0)
    file_flags |= getattr(os, "O_NOFOLLOW", 0)
    directory_descriptors = []
    descriptor = None
    directory_identities = []
    try:
        root = repo_root.resolve(strict=True)
        root_path = os.stat(root, follow_symlinks=False)
        directory_descriptor = os.open(root, directory_flags)
        directory_descriptors.append(directory_descriptor)
        root_fd = os.fstat(directory_descriptor)
        if _component_identity(root_path) != _component_identity(root_fd):
            return None, f"{label} repository root changed before its stable byte snapshot", False
        directory_identities.append(_component_identity(root_fd))
        for segment in segments[:-1]:
            component = os.stat(
                segment,
                dir_fd=directory_descriptor,
                follow_symlinks=False,
            )
            if stat.S_ISLNK(component.st_mode):
                return None, f"{label} path components must not be symlinks", False
            if not stat.S_ISDIR(component.st_mode):
                return None, f"{label} path component is not a directory", False
            next_descriptor = os.open(
                segment,
                directory_flags,
                dir_fd=directory_descriptor,
            )
            directory_descriptors.append(next_descriptor)
            opened_component = os.fstat(next_descriptor)
            if _component_identity(component) != _component_identity(opened_component):
                return None, (
                    f"{label} path component changed before its stable byte snapshot"
                ), False
            directory_identities.append(_component_identity(opened_component))
            directory_descriptor = next_descriptor

        filename = segments[-1]
        before_path = os.stat(
            filename,
            dir_fd=directory_descriptor,
            follow_symlinks=False,
        )
        if stat.S_ISLNK(before_path.st_mode):
            return None, (
                f"{label} must be a stable repository-contained regular file, not a symlink"
            ), False
        if not stat.S_ISREG(before_path.st_mode):
            return None, f"{label} must be a stable repository-contained regular file", False
        if before_path.st_size > max_bytes:
            return None, f"{label} exceeds the {max_bytes}-byte artifact limit", False

        descriptor = os.open(filename, file_flags, dir_fd=directory_descriptor)
        before_fd = os.fstat(descriptor)
        if not stat.S_ISREG(before_fd.st_mode):
            return None, f"{label} must be a stable repository-contained regular file", False
        if _stat_identity(before_path) != _stat_identity(before_fd):
            return None, f"{label} changed before its stable byte snapshot could be read", False

        chunks = []
        observed = 0
        while True:
            chunk = os.read(descriptor, min(READ_CHUNK_BYTES, max_bytes + 1 - observed))
            if not chunk:
                break
            chunks.append(chunk)
            observed += len(chunk)
            if observed > max_bytes:
                return None, f"{label} exceeds the {max_bytes}-byte artifact limit", False
        after_fd = os.fstat(descriptor)
        after_path = os.stat(
            filename,
            dir_fd=directory_descriptor,
            follow_symlinks=False,
        )
    except FileNotFoundError:
        return None, f"{label} is missing", True
    except OSError as error:
        return None, f"{label} cannot be read as a stable regular file: {error}", False
    finally:
        if descriptor is not None:
            os.close(descriptor)
        for directory_descriptor in reversed(directory_descriptors):
            os.close(directory_descriptor)

    if (
        _stat_identity(before_fd) != _stat_identity(after_fd)
        or _stat_identity(after_fd) != _stat_identity(after_path)
    ):
        return None, f"{label} changed while its stable byte snapshot was read", False

    data_bytes = b"".join(chunks)
    if len(data_bytes) != after_fd.st_size:
        return None, f"{label} size changed while its stable byte snapshot was read", False
    rewalk_error = _verify_fresh_repo_walk(
        root,
        segments,
        directory_identities,
        _stat_identity(after_fd),
        label,
    )
    if rewalk_error:
        return None, rewalk_error, False
    return {
        "bytes": data_bytes,
        "sha256": hashlib.sha256(data_bytes).hexdigest(),
        "identity": _stat_identity(after_fd),
        "component_identities": tuple(directory_identities),
        "path": normalized,
    }, None, False


def stable_read_repo_json(repo_root: Path, repo_path: str, label: str):
    snapshot, error, missing = stable_read_repo_bytes(repo_root, repo_path, label)
    if error:
        return None, snapshot, error, missing
    data, error = decode_json_bytes(snapshot["bytes"], label)
    return data, snapshot, error, False


def nonempty_string(value) -> bool:
    return isinstance(value, str) and bool(value.strip())


def digest_string(value) -> bool:
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def git_blob_digest_string(value) -> bool:
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{40}", value) is not None


def timestamp_string(value) -> bool:
    if not isinstance(value, str) or re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})",
        value,
    ) is None:
        return False
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00" if value.endswith("Z") else value)
    except ValueError:
        return False
    return parsed.tzinfo is not None


def canonical_repo_root(session_path: Path):
    resolved_session = session_path.resolve()
    if (
        resolved_session.parent.name != "reviews"
        or resolved_session.parent.parent.name != ".ultra"
    ):
        return None, (
            "session path must resolve to the canonical repository location "
            "<repo>/.ultra/reviews/<session>"
        )
    return resolved_session.parent.parent.parent, None


def validate_repo_path(value, repo_root: Path, field: str, allow_fragment=False):
    if not nonempty_string(value):
        return None, f"{field} must be a non-empty normalized repository-relative path"

    path_value = value
    if allow_fragment:
        if value.count("#") != 1:
            return None, f"{field} must contain one non-empty fragment"
        path_value, fragment = value.split("#", 1)
        if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", fragment) is None:
            return None, f"{field} has an invalid fragment"
    elif "#" in value:
        return None, f"{field} must not contain a fragment"

    if (
        "\\" in path_value
        or "\x00" in path_value
        or path_value.startswith("/")
        or re.match(r"^[A-Za-z]:", path_value)
    ):
        return None, f"{field} must be a normalized repository-relative POSIX path"
    segments = path_value.split("/")
    if any(segment in {"", ".", ".."} for segment in segments):
        return None, f"{field} must not contain empty, dot, or parent path segments"
    if PurePosixPath(path_value).as_posix() != path_value:
        return None, f"{field} must be normalized"

    try:
        resolved_root = repo_root.resolve()
        resolved_target = (resolved_root / Path(*segments)).resolve(strict=False)
    except (OSError, RuntimeError) as error:
        return None, f"{field} cannot be resolved safely: {error}"
    try:
        resolved_target.relative_to(resolved_root)
    except ValueError:
        return None, f"{field} escapes the repository root"

    # Path.resolve(strict=False) stopped raising on symlink loops in Python
    # 3.13, so a looping or later-swapped component can survive resolution
    # while the stable-read descriptor walks would still refuse it. Refuse
    # statable symlink or non-directory components here too; components that
    # merely do not exist yet stay valid at validation time.
    probe = resolved_root
    for segment in segments[:-1]:
        probe = probe / segment
        try:
            component_stat = os.stat(probe, follow_symlinks=False)
        except FileNotFoundError:
            continue
        except NotADirectoryError:
            return None, f"{field} must traverse ordinary directories"
        if stat.S_ISLNK(component_stat.st_mode) or not stat.S_ISDIR(component_stat.st_mode):
            return None, f"{field} must traverse ordinary non-symlink directories"
    return path_value, None


def validate_string_array(value, field: str, require_nonempty=False):
    if not isinstance(value, list) or not all(nonempty_string(item) for item in value):
        return f"{field} must be a string array"
    if require_nonempty and not value:
        return f"{field} must not be empty"
    if len(value) != len(set(value)):
        return f"{field} must not contain duplicates"
    return None


def canonical_context_digest(context_files) -> str:
    if len(context_files) == 1:
        return context_files[0]["sha256"]
    canonical = sorted(
        (
            {"path": item["path"], "sha256": item["sha256"]}
            for item in context_files
        ),
        key=lambda item: item["path"].encode("utf-8"),
    )
    payload = json.dumps(
        canonical,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _trace_arrays(value):
    if not isinstance(value, dict):
        return None
    result = {}
    patterns = {
        "first_principles": r"FP-[A-Za-z0-9][A-Za-z0-9._-]*",
        "serves": r"NS-[A-Za-z0-9][A-Za-z0-9._-]*",
        "touches": r"HC-[A-Za-z0-9][A-Za-z0-9._-]*",
    }
    for field, pattern in patterns.items():
        values = value.get(field)
        if not isinstance(values, list) or not all(
            isinstance(item, str) and re.fullmatch(pattern, item) for item in values
        ) or len(values) != len(set(values)):
            return None
        result[field] = values
    return result


def _terminate_and_reap(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=0.25)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
    else:
        process.wait()


def _bounded_process_output(argv, input_bytes: bytes, timeout: float, max_output_bytes: int):
    try:
        process = subprocess.Popen(
            argv,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,
        )
    except OSError as error:
        return None, None, None, f"canonical North Star validator could not run: {error}"

    selector = selectors.DefaultSelector()
    buffers = {"stdout": bytearray(), "stderr": bytearray()}
    input_view = memoryview(input_bytes)
    input_offset = 0
    combined_output = 0
    failure = None
    returncode = None

    def stop_watching(stream):
        try:
            selector.unregister(stream)
        except (KeyError, ValueError):
            pass
        try:
            stream.close()
        except OSError:
            pass

    try:
        for stream, role, events in [
            (process.stdout, "stdout", selectors.EVENT_READ),
            (process.stderr, "stderr", selectors.EVENT_READ),
            (process.stdin, "stdin", selectors.EVENT_WRITE),
        ]:
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, events, role)
        if not input_bytes:
            stop_watching(process.stdin)

        deadline = time.monotonic() + timeout
        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                failure = "canonical North Star validator timed out"
                break
            events = selector.select(min(0.05, remaining))
            for key, _mask in events:
                stream = key.fileobj
                role = key.data
                if role == "stdin":
                    try:
                        written = os.write(
                            stream.fileno(),
                            input_view[input_offset:input_offset + READ_CHUNK_BYTES],
                        )
                    except BlockingIOError:
                        continue
                    except BrokenPipeError:
                        stop_watching(stream)
                        continue
                    input_offset += written
                    if input_offset == len(input_view):
                        stop_watching(stream)
                    continue

                try:
                    chunk = os.read(stream.fileno(), READ_CHUNK_BYTES)
                except BlockingIOError:
                    continue
                if not chunk:
                    stop_watching(stream)
                    continue
                combined_output += len(chunk)
                if combined_output > max_output_bytes:
                    failure = (
                        "canonical North Star validator output exceeded its bounded "
                        "combined report limit"
                    )
                    break
                buffers[role].extend(chunk)
            if failure:
                break

        if failure:
            _terminate_and_reap(process)
        else:
            remaining = max(0.0, deadline - time.monotonic())
            try:
                returncode = process.wait(timeout=remaining)
            except subprocess.TimeoutExpired:
                failure = "canonical North Star validator timed out"
                _terminate_and_reap(process)
    finally:
        selector.close()
        for stream in (process.stdin, process.stdout, process.stderr):
            if stream is not None and not stream.closed:
                try:
                    stream.close()
                except OSError:
                    pass
        if process.poll() is None:
            _terminate_and_reap(process)

    return returncode, bytes(buffers["stdout"]), bytes(buffers["stderr"]), failure


def validate_north_star_snapshot(repo_root: Path, snapshot):
    node = shutil.which("node")
    if node is None:
        return None, "canonical North Star validation requires the installed node runtime"
    validator = (
        Path(__file__).resolve().parents[2]
        / "ultra-research"
        / "scripts"
        / "validate_north_star.cjs"
    )
    if not validator.is_file():
        return None, f"canonical North Star validator is missing: {validator}"
    canonical_path = repo_root.resolve() / ".ultra" / "north-star.md"
    returncode, stdout, stderr, process_error = _bounded_process_output(
        [node, str(validator), "--stdin", "--path", str(canonical_path)],
        snapshot["bytes"],
        VALIDATOR_TIMEOUT_SECONDS,
        MAX_VALIDATOR_REPORT_BYTES,
    )
    if process_error:
        return None, process_error
    report, report_error = decode_json_bytes(
        stdout,
        "canonical North Star validator report",
    )
    if report_error:
        detail = stderr.decode("utf-8", errors="replace").strip()
        return None, f"{report_error}{': ' + detail if detail else ''}"
    input_receipt = report.get("input")
    expected_input = {
        "path": str(canonical_path),
        "byte_length": len(snapshot["bytes"]),
        "sha256": snapshot["sha256"],
    }
    if input_receipt != expected_input:
        return None, (
            "canonical North Star validator report is not bound to the exact stdin "
            "snapshot bytes and canonical path"
        )
    binding = report.get("acceptance_binding")
    source_observations = report.get("source_observations")
    expected_sources = None
    if isinstance(binding, dict):
        source = binding.get("source")
        accepted_snapshot = binding.get("snapshot")
        if isinstance(source, str) and "#" in source and isinstance(accepted_snapshot, str):
            expected_sources = [
                ("decision", source.split("#", 1)[0]),
                ("snapshot", accepted_snapshot),
            ]
    if expected_sources is None or not isinstance(source_observations, list):
        return None, "canonical North Star validator report lacks exact source observations"
    observed_sources = []
    for index, observation in enumerate(source_observations):
        if (
            not isinstance(observation, dict)
            or set(observation) != NORTH_STAR_SOURCE_OBSERVATION_FIELDS
            or observation.get("role") not in {"decision", "snapshot"}
            or not digest_string(observation.get("sha256"))
            or not isinstance(observation.get("byte_length"), int)
            or isinstance(observation.get("byte_length"), bool)
            or observation["byte_length"] < 0
        ):
            return None, (
                "canonical North Star validator report has an invalid "
                f"source_observations[{index}] receipt"
            )
        normalized, path_error = validate_repo_path(
            observation.get("path"),
            repo_root,
            f"canonical North Star validator source_observations[{index}].path",
        )
        if path_error:
            return None, path_error
        observed_sources.append((observation["role"], normalized))
    if observed_sources != expected_sources:
        return None, (
            "canonical North Star validator report source observations do not exactly "
            "match its decision and accepted snapshot binding"
        )
    if returncode != 0 or report.get("valid") is not True:
        codes = [
            item.get("code")
            for item in report.get("diagnostics", [])
            if isinstance(item, dict) and nonempty_string(item.get("code"))
        ]
        return None, (
            "canonical North Star validator rejected the current snapshot"
            + (f": {', '.join(codes)}" if codes else "")
        )
    return {
        "data": report,
        "sha256": hashlib.sha256(stdout).hexdigest(),
    }, None


def current_git_head(repo_root: Path):
    try:
        completed = subprocess.run(
            ["git", "-C", str(repo_root), "rev-parse", "--verify", "HEAD"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=VALIDATOR_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return None, "current Git HEAD observation timed out"
    except OSError as error:
        return None, f"current Git HEAD cannot be observed: {error}"
    if completed.returncode != 0:
        detail = completed.stderr.decode("utf-8", errors="replace").strip()
        return None, "current Git HEAD cannot be observed" + (f": {detail}" if detail else "")
    try:
        head = completed.stdout.decode("ascii").strip()
    except UnicodeDecodeError:
        return None, "current Git HEAD is not ASCII"
    if not git_blob_digest_string(head):
        return None, f"current Git HEAD is not a lowercase 40-hex commit digest: {head!r}"
    return head, None


def acceptance_source_paths(packet):
    return sorted(
        {
            acceptance.partition(": ")[0].split("#", 1)[0]
            for acceptance in packet["acceptance"]
        },
        key=lambda value: value.encode("utf-8"),
    )


def trace_source_path(packet):
    return packet["north_star_trace"]["path"].split("#", 1)[0]


def validate_packet_subject_observations(packet, repo_root: Path):
    observations = packet.get("subject_observations")
    acceptance_paths = acceptance_source_paths(packet)
    expected_count = 1 + len(acceptance_paths) + 2
    if not isinstance(observations, list) or len(observations) != expected_count:
        return (
            "WORKER-PACKET.json subject_observations must be the exact ordered "
            "Change, acceptance-source, decision, and snapshot observation array"
        )

    expected_prefix = [
        ("change", trace_source_path(packet)),
        *(("acceptance_source", path) for path in acceptance_paths),
    ]
    expected_roles = [
        *(role for role, _path in expected_prefix),
        "decision",
        "snapshot",
    ]
    observed_roles_and_paths = []
    for index, observation in enumerate(observations):
        if (
            not isinstance(observation, dict)
            or set(observation) != PACKET_SUBJECT_OBSERVATION_FIELDS
        ):
            return (
                f"WORKER-PACKET.json subject_observations[{index}] must contain "
                "exactly role, path, sha256, and byte_length"
            )
        if observation.get("role") != expected_roles[index]:
            return (
                "WORKER-PACKET.json subject_observations must use exact ordered roles: "
                + ", ".join(expected_roles)
            )
        normalized, path_error = validate_repo_path(
            observation.get("path"),
            repo_root,
            f"WORKER-PACKET.json subject_observations[{index}].path",
        )
        if path_error:
            return path_error
        if not digest_string(observation.get("sha256")):
            return (
                f"WORKER-PACKET.json subject_observations[{index}].sha256 must be a "
                "lowercase SHA-256 digest"
            )
        byte_length = observation.get("byte_length")
        if (
            not isinstance(byte_length, int)
            or isinstance(byte_length, bool)
            or byte_length < 0
        ):
            return (
                f"WORKER-PACKET.json subject_observations[{index}].byte_length must "
                "be a non-negative integer"
            )
        observed_roles_and_paths.append((observation["role"], normalized))

    if observed_roles_and_paths[:len(expected_prefix)] != expected_prefix:
        return (
            "WORKER-PACKET.json subject_observations must bind the exact validated "
            "Change path and ordered acceptance sources"
        )
    return None


def canonical_admission_subject(value):
    return {
        "version": value["version"],
        "session": value["session"],
        "packet_digest": value["packet_digest"],
        "head": value["head"],
        "observations": value["observations"],
        "north_star_report": value["north_star_report"],
    }


def canonical_json_digest(value):
    payload = json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def validate_packet_admission(packet, repo_root: Path, packet_digest: str):
    observed_head, error = current_git_head(repo_root)
    if error:
        return None, error
    if observed_head != packet["head"]:
        return None, (
            f"WORKER-PACKET.json head does not match current Git HEAD {observed_head}; "
            "create a new review session for the current subject"
        )

    snapshots = {}

    def subject_snapshot(repo_path, label):
        if repo_path not in snapshots:
            snapshot, snapshot_error, _missing = stable_read_repo_bytes(
                repo_root,
                repo_path,
                label,
            )
            if snapshot_error:
                return None, snapshot_error
            snapshots[repo_path] = snapshot
        return snapshots[repo_path], None

    observations = []
    for index, context_file in enumerate(packet["context_files"]):
        snapshot, error = subject_snapshot(
            context_file["path"],
            f"WORKER-PACKET.json context_files[{index}] subject",
        )
        if error:
            return None, error
        observed = snapshot["sha256"]
        if observed != context_file["sha256"]:
            return None, (
                f"WORKER-PACKET.json context_files[{index}] subject bytes do not match "
                f"recorded sha256 {context_file['sha256']}; observed {observed}"
            )
        observations.append({
            "role": "context",
            "path": context_file["path"],
            "sha256": observed,
            "byte_length": len(snapshot["bytes"]),
        })

    north_star_path = ".ultra/north-star.md"
    north_star, error = subject_snapshot(
        north_star_path,
        "WORKER-PACKET.json canonical North Star subject",
    )
    if error:
        return None, error
    validated_report, error = validate_north_star_snapshot(repo_root, north_star)
    if error:
        return None, error
    report = validated_report["data"]
    if (
        report.get("$schema") != "ultra-north-star-validation-v1"
        or report.get("kind") != "north-star-v2"
        or report.get("status") != "accepted"
        or report.get("classification") != "accepted"
    ):
        return None, "canonical North Star validator report must describe an accepted v2 authority"

    trace = packet["north_star_trace"]
    if report.get("revision") != trace["north_star_revision"]:
        return None, (
            "north_star_trace.north_star_revision does not match the canonical "
            f"validator report; observed {report.get('revision')!r}"
        )
    binding = report.get("acceptance_binding")
    if not isinstance(binding, dict):
        return None, "canonical North Star validator report lacks acceptance binding evidence"
    if binding.get("git_blob_digest") != trace["north_star_digest"]:
        return None, (
            "north_star_trace.north_star_digest does not match the canonical validator "
            f"report; observed {binding.get('git_blob_digest')!r}"
        )
    if binding.get("content_sha256") != north_star["sha256"]:
        return None, "canonical North Star validator report is not bound to the stable input bytes"

    ids = report.get("ids")
    if not isinstance(ids, dict) or set(ids) != {"FP", "NS", "HC"}:
        return None, "canonical North Star validator report has an invalid ID inventory"
    for field, kind in [
        ("first_principles", "FP"),
        ("serves", "NS"),
        ("touches", "HC"),
    ]:
        available = ids.get(kind)
        if not isinstance(available, list) or not all(nonempty_string(item) for item in available):
            return None, f"canonical North Star validator report has invalid {kind} IDs"
        unresolved = [item for item in trace[field] if item not in set(available)]
        if unresolved:
            return None, (
                f"north_star_trace.{field} contains IDs unresolved by the canonical "
                f"validator report: {', '.join(unresolved)}"
            )

    observations.append({
        "role": "north_star",
        "path": north_star_path,
        "sha256": north_star["sha256"],
        "byte_length": len(north_star["bytes"]),
    })

    packet_subjects = packet["subject_observations"]
    canonical_sources = packet_subjects[-2:]
    if report.get("source_observations") != canonical_sources:
        return None, (
            "canonical North Star validator decision and snapshot observations do not "
            "match WORKER-PACKET.json subject_observations"
        )
    for index, expected_observation in enumerate(packet_subjects):
        source, error = subject_snapshot(
            expected_observation["path"],
            f"WORKER-PACKET.json subject_observations[{index}] subject",
        )
        if error:
            return None, error
        observed_length = len(source["bytes"])
        if (
            source["sha256"] != expected_observation["sha256"]
            or observed_length != expected_observation["byte_length"]
        ):
            return None, (
                f"WORKER-PACKET.json subject_observations[{index}] bytes do not match "
                f"recorded byte_length and sha256 for {expected_observation['path']}"
            )
        if expected_observation["role"] in {"change", "acceptance_source"}:
            observations.append(dict(expected_observation))

    final_head, error = current_git_head(repo_root)
    if error:
        return None, error
    if final_head != observed_head:
        return None, "current Git HEAD changed during packet admission; retry with a new session"
    for repo_path, expected in snapshots.items():
        current, snapshot_error, _missing = stable_read_repo_bytes(
            repo_root,
            repo_path,
            f"WORKER-PACKET.json admitted subject {repo_path}",
        )
        if snapshot_error:
            return None, snapshot_error
        if (
            current["bytes"] != expected["bytes"]
            or len(current["bytes"]) != len(expected["bytes"])
            or current["sha256"] != expected["sha256"]
        ):
            return None, (
                f"admitted subject {repo_path} bytes, byte length, or sha256 changed "
                "during packet admission"
            )

    report_receipt = {
        "schema": report["$schema"],
        "sha256": validated_report["sha256"],
        "input_sha256": north_star["sha256"],
        "input_byte_length": len(north_star["bytes"]),
        "source_observations": report["source_observations"],
    }
    admission = {
        "$schema": ADMISSION_SCHEMA_V2,
        "version": 2,
        "session": packet["session"],
        "packet_digest": packet_digest,
        "head": packet["head"],
        "observations": observations,
        "north_star_report": report_receipt,
    }
    admission["subject_digest"] = canonical_json_digest(
        canonical_admission_subject(admission)
    )
    return admission, None


def cleanup_admission_temporary(
    session_descriptor: int,
    temporary: str,
    publication_descriptor: int,
):
    """Remove only the temporary pathname that still names our open inode."""
    filename = os.path.basename(os.fspath(temporary))
    try:
        current = os.lstat(filename, dir_fd=session_descriptor)
        owned = os.fstat(publication_descriptor)
    except FileNotFoundError:
        return True, None
    except OSError as error:
        return False, error
    if (
        not stat.S_ISREG(current.st_mode)
        or _stat_identity(current) != _stat_identity(owned)
    ):
        return False, (
            "temporary pathname identity differs from the owned admission file; "
            "the replacement was retained for manual recovery"
        )
    try:
        os.unlink(filename, dir_fd=session_descriptor)
    except OSError as error:
        return False, error
    return True, None


def atomic_write_admission(session_path: Path, admission):
    target = session_path / "ADMISSION.json"
    payload = (json.dumps(admission, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    payload_digest = hashlib.sha256(payload).hexdigest()
    descriptor = None
    session_descriptor = None
    publication_descriptor = None
    temporary = None
    published = False
    publication = "created"
    result_digest = payload_digest
    durability_warnings = []
    temporary_cleanup_error = None
    try:
        session_flags = os.O_RDONLY
        session_flags |= getattr(os, "O_DIRECTORY", 0)
        session_flags |= getattr(os, "O_NOFOLLOW", 0)
        session_path_identity = os.stat(session_path, follow_symlinks=False)
        session_descriptor = os.open(session_path, session_flags)
        session_fd_identity = os.fstat(session_descriptor)
        if (
            not stat.S_ISDIR(session_path_identity.st_mode)
            or _component_identity(session_path_identity)
            != _component_identity(session_fd_identity)
        ):
            return None, {
                "code": "admission_publish_failed",
                "message": "review session changed before ADMISSION.json publication",
            }
        descriptor, temporary = tempfile.mkstemp(prefix=".ADMISSION.", dir=session_path)
        with os.fdopen(descriptor, "wb", closefd=True) as stream:
            descriptor = None
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        publication_flags = os.O_RDONLY
        publication_flags |= getattr(os, "O_NONBLOCK", 0)
        publication_flags |= getattr(os, "O_NOFOLLOW", 0)
        publication_descriptor = os.open(temporary, publication_flags)
        try:
            # A same-directory hard link is an atomic create-if-absent publication.
            # Unlike replace/rename, it can never overwrite an admitted session.
            os.link(temporary, target, follow_symlinks=False)
            published = True
            temporary_identity = _stat_identity(os.fstat(publication_descriptor))
            repo_root, root_error = canonical_repo_root(session_path)
            if root_error:
                return None, {
                    "code": "admission_publication_changed",
                    "message": (
                        "ADMISSION.json publication cannot be verified from the canonical "
                        f"session path: {root_error}"
                    ),
                }
            published_snapshot, published_error, _missing = stable_read_repo_bytes(
                repo_root,
                f".ultra/reviews/{session_path.resolve().name}/ADMISSION.json",
                "published ADMISSION.json",
            )
            if (
                published_error
                or published_snapshot["identity"] != temporary_identity
                or published_snapshot["bytes"] != payload
            ):
                detail = published_error or (
                    "the canonical receipt identity or bytes differ from the newly "
                    "published file"
                )
                return None, {
                    "code": "admission_publication_changed",
                    "message": (
                        "ADMISSION.json canonical session or receipt changed during its "
                        f"post-publication fresh rewalk: {detail}"
                    ),
                }
        except FileExistsError:
            repo_root, root_error = canonical_repo_root(session_path)
            if root_error:
                return None, {
                    "code": "admission_conflict",
                    "message": f"existing ADMISSION.json cannot be verified: {root_error}",
                }
            existing, existing_error, _missing = stable_read_repo_bytes(
                repo_root,
                f".ultra/reviews/{session_path.resolve().name}/ADMISSION.json",
                "existing ADMISSION.json",
            )
            if existing_error or existing["bytes"] != payload:
                detail = existing_error or "its bytes differ from the newly observed receipt"
                return None, {
                    "code": "admission_conflict",
                    "message": (
                        "ADMISSION.json is immutable once published and the existing "
                        f"receipt cannot be reused because {detail}; start a fresh review session"
                    ),
                }
            published = True
            publication = "existing"
            result_digest = existing["sha256"]
        except OSError as error:
            return None, {
                "code": "admission_publish_failed",
                "message": f"ADMISSION.json could not be published atomically: {error}",
            }

        removed, cleanup_error = cleanup_admission_temporary(
            session_descriptor,
            temporary,
            publication_descriptor,
        )
        if removed:
            temporary = None
        else:
            temporary_cleanup_error = cleanup_error

        try:
            os.fsync(session_descriptor)
        except OSError as error:
            durability_warnings.append({
                "code": "admission_directory_fsync_failed",
                "message": (
                    "ADMISSION.json is published and usable, but directory durability "
                    f"could not be confirmed: {error}"
                ),
            })
    except OSError as error:
        if published:
            if not any(
                warning["code"] == "admission_directory_fsync_failed"
                for warning in durability_warnings
            ):
                durability_warnings.append({
                    "code": "admission_directory_fsync_failed",
                    "message": (
                        "ADMISSION.json is published and usable, but directory durability "
                        f"could not be confirmed: {error}"
                    ),
                })
        else:
            return None, {
                "code": "admission_publish_failed",
                "message": f"ADMISSION.json could not be published atomically: {error}",
            }
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if (
            temporary is not None
            and session_descriptor is not None
            and publication_descriptor is not None
        ):
            removed, cleanup_error = cleanup_admission_temporary(
                session_descriptor,
                temporary,
                publication_descriptor,
            )
            if removed:
                temporary = None
                temporary_cleanup_error = None
            else:
                temporary_cleanup_error = cleanup_error
        if publication_descriptor is not None:
            os.close(publication_descriptor)
        if session_descriptor is not None:
            os.close(session_descriptor)
    if temporary is not None and temporary_cleanup_error is not None:
        durability_warnings.append({
            "code": "admission_temp_cleanup_failed",
            "message": (
                "ADMISSION.json is published and usable, but its temporary pathname "
                f"could not be removed: {temporary_cleanup_error}"
            ),
        })
    result = {
        "digest": result_digest,
        "publication": publication,
    }
    if len(durability_warnings) == 1:
        result["durability_warning"] = durability_warnings[0]
    elif durability_warnings:
        result["durability_warning"] = {
            "code": "admission_multiple_durability_warnings",
            "message": (
                "ADMISSION.json is published and usable, but multiple durability "
                "operations remain unresolved"
            ),
            "warnings": durability_warnings,
        }
    return result, None


def validate_admission_receipt(receipt, packet):
    if not isinstance(receipt, dict) or set(receipt) != ADMISSION_FIELDS:
        return "ADMISSION.json must contain exactly the strict admission receipt fields"
    contract = packet["data"].get("admission_contract")
    if contract == ADMISSION_CONTRACT_V1:
        expected_schema = ADMISSION_SCHEMA_V1
        expected_version = 1
        observation_fields = ADMISSION_OBSERVATION_FIELDS_V1
    elif contract == ADMISSION_CONTRACT_V2:
        expected_schema = ADMISSION_SCHEMA_V2
        expected_version = 2
        observation_fields = ADMISSION_OBSERVATION_FIELDS_V2
    else:
        return "ADMISSION.json requires a recognized strict packet admission_contract"
    if (
        receipt.get("$schema") != expected_schema
        or receipt.get("version") != expected_version
    ):
        return (
            f"ADMISSION.json must use {expected_schema} version {expected_version} "
            "for its packet admission_contract"
        )
    if receipt.get("session") != packet["data"]["session"]:
        return "ADMISSION.json session does not match WORKER-PACKET.json"
    if receipt.get("packet_digest") != packet["digest"]:
        return "ADMISSION.json packet_digest does not match WORKER-PACKET.json"
    if receipt.get("head") != packet["data"]["head"]:
        return "ADMISSION.json head does not match WORKER-PACKET.json"
    if not digest_string(receipt.get("subject_digest")):
        return "ADMISSION.json subject_digest must be a lowercase SHA-256 digest"

    observations = receipt.get("observations")
    if not isinstance(observations, list):
        return "ADMISSION.json observations must be an array"
    for index, observation in enumerate(observations):
        if not isinstance(observation, dict) or set(observation) != observation_fields:
            return f"ADMISSION.json observations[{index}] has invalid fields"
        if observation.get("role") not in {
            "context", "north_star", "change", "acceptance_source",
        }:
            return f"ADMISSION.json observations[{index}] has an invalid role"
        _, path_error = validate_repo_path(
            observation.get("path"),
            packet["repo_root"],
            f"ADMISSION.json observations[{index}].path",
        )
        if path_error:
            return path_error
        if not digest_string(observation.get("sha256")):
            return f"ADMISSION.json observations[{index}].sha256 is invalid"
        if expected_version == 2:
            byte_length = observation.get("byte_length")
            if (
                not isinstance(byte_length, int)
                or isinstance(byte_length, bool)
                or byte_length < 0
            ):
                return f"ADMISSION.json observations[{index}].byte_length is invalid"

    subject_projection = (
        packet["data"]["subject_observations"][:-2]
        if expected_version == 2
        else [
            {
                "role": "change",
                "path": f".ultra/changes/active/{packet['data']['change_id']}/intent.md",
            },
            *(
                {"role": "acceptance_source", "path": path}
                for path in acceptance_source_paths(packet["data"])
            ),
        ]
    )
    expected_roles_and_paths = [
        *(('context', item["path"]) for item in packet["data"]["context_files"]),
        ("north_star", ".ultra/north-star.md"),
        *((item["role"], item["path"]) for item in subject_projection),
    ]
    observed_roles_and_paths = [
        (item["role"], item["path"]) for item in observations
    ]
    if observed_roles_and_paths != expected_roles_and_paths:
        return "ADMISSION.json observations are not the exact packet-derived subject projection"
    for index, context_file in enumerate(packet["data"]["context_files"]):
        if observations[index]["sha256"] != context_file["sha256"]:
            return "ADMISSION.json context observation does not match WORKER-PACKET.json"
    if expected_version == 2:
        subject_offset = len(packet["data"]["context_files"]) + 1
        if observations[subject_offset:] != subject_projection:
            return (
                "ADMISSION.json Change and acceptance observations do not exactly "
                "match WORKER-PACKET.json subject_observations"
            )

    report_receipt = receipt.get("north_star_report")
    if (
        not isinstance(report_receipt, dict)
        or set(report_receipt) != NORTH_STAR_REPORT_RECEIPT_FIELDS
        or report_receipt.get("schema") != "ultra-north-star-validation-v1"
        or not digest_string(report_receipt.get("sha256"))
        or not digest_string(report_receipt.get("input_sha256"))
        or not isinstance(report_receipt.get("input_byte_length"), int)
        or isinstance(report_receipt.get("input_byte_length"), bool)
        or report_receipt["input_byte_length"] < 0
    ):
        return "ADMISSION.json north_star_report receipt is invalid"
    source_observations = report_receipt.get("source_observations")
    if not isinstance(source_observations, list) or len(source_observations) != 2:
        return "ADMISSION.json north_star_report source observations are invalid"
    observed_source_roles = []
    for index, observation in enumerate(source_observations):
        if (
            not isinstance(observation, dict)
            or set(observation) != NORTH_STAR_SOURCE_OBSERVATION_FIELDS
            or observation.get("role") not in {"decision", "snapshot"}
            or not digest_string(observation.get("sha256"))
            or not isinstance(observation.get("byte_length"), int)
            or isinstance(observation.get("byte_length"), bool)
            or observation["byte_length"] < 0
        ):
            return (
                "ADMISSION.json north_star_report "
                f"source_observations[{index}] is invalid"
            )
        _, path_error = validate_repo_path(
            observation.get("path"),
            packet["repo_root"],
            f"ADMISSION.json north_star_report source_observations[{index}].path",
        )
        if path_error:
            return path_error
        observed_source_roles.append(observation["role"])
    if observed_source_roles != ["decision", "snapshot"]:
        return (
            "ADMISSION.json north_star_report source observations must be the exact "
            "decision then snapshot pair"
        )
    if (
        expected_version == 2
        and source_observations != packet["data"]["subject_observations"][-2:]
    ):
        return (
            "ADMISSION.json canonical report decision and snapshot observations do not "
            "exactly match WORKER-PACKET.json subject_observations"
        )
    north_star_observation = next(
        item for item in observations if item["role"] == "north_star"
    )
    if report_receipt["input_sha256"] != north_star_observation["sha256"]:
        return "ADMISSION.json canonical report input does not match its North Star observation"
    expected_subject_digest = canonical_json_digest(canonical_admission_subject(receipt))
    if receipt["subject_digest"] != expected_subject_digest:
        return "ADMISSION.json subject_digest does not match its exact admission observations"
    return None


def load_admission_receipt(session_path: Path, packet):
    admission_repo_path = (
        f".ultra/reviews/{packet['data']['session']}/ADMISSION.json"
    )
    receipt, snapshot, error, _missing = stable_read_repo_json(
        packet["repo_root"],
        admission_repo_path,
        "ADMISSION.json",
    )
    if error:
        return None, error
    error = validate_admission_receipt(receipt, packet)
    if error:
        return None, error
    return {"data": receipt, "digest": snapshot["sha256"]}, None


def _foreign_review_references(value, own_session: str):
    """Collect every foreign review-session path carried anywhere in a value."""
    found = []
    if isinstance(value, str):
        for match in FOREIGN_REVIEW_SESSION.finditer(value):
            if match.group(1) != own_session:
                found.append(match.group(0))
    elif isinstance(value, dict):
        for key, item in value.items():
            found.extend(_foreign_review_references(key, own_session))
            found.extend(_foreign_review_references(item, own_session))
    elif isinstance(value, list):
        for item in value:
            found.extend(_foreign_review_references(item, own_session))
    return found


def validate_packet_review_history(packet, repo_root: Path) -> str | None:
    """Bound packet review history to one fully validated direct parent.

    The only foreign review path allowed anywhere in a task delta packet is the
    exact `review_history.parent_summary_ref` field; an initial packet carries
    no foreign review reference at all. Admission then observes the parent
    SUMMARY as a bounded stable repository regular file, requires its exact
    recorded digest, requires the parent to bind the same mode, change, and
    tasks as the current packet, and accepts only still-unresolved current
    P0/P1 blocker ids that exist in that parent. Transitive summary chains and
    full-history replays stay out of new packets; the archive under
    `.ultra/reviews/**` is read only for a dedicated incident or owner audit.
    """
    own_session = packet.get("session")
    history = packet.get("review_history")
    if history is not None and (
        not isinstance(history, dict) or set(history) != REVIEW_HISTORY_FIELDS
    ):
        return (
            "WORKER-PACKET.json review_history must be exactly one direct parent "
            "{parent_summary_ref, parent_summary_digest, unresolved_blocking_ids}"
        )
    references: list[str] = []
    if isinstance(packet, dict):
        for key, item in packet.items():
            if key == "review_history":
                continue
            references.extend(_foreign_review_references(key, own_session))
            references.extend(_foreign_review_references(item, own_session))
    if history is not None:
        reference = history.get("parent_summary_ref")
        if (
            not isinstance(reference, str)
            or not re.fullmatch(
                r"\.ultra/reviews/[A-Za-z0-9][A-Za-z0-9._-]*/SUMMARY\.json",
                reference,
            )
            or reference.split("/")[2] == own_session
        ):
            return (
                "WORKER-PACKET.json review_history.parent_summary_ref must name "
                "exactly one prior session's SUMMARY.json"
            )
        if not digest_string(history.get("parent_summary_digest")):
            return (
                "WORKER-PACKET.json review_history.parent_summary_digest must be a "
                "lowercase SHA-256 digest"
            )
        blocking_ids = history.get("unresolved_blocking_ids")
        if (
            not isinstance(blocking_ids, list)
            or not all(nonempty_string(item) for item in blocking_ids)
        ):
            return (
                "WORKER-PACKET.json review_history.unresolved_blocking_ids must be "
                "an array of finding-id strings"
            )
    if references:
        return (
            "WORKER-PACKET.json may reference a foreign review session only through "
            "review_history.parent_summary_ref; observed outside that field: "
            + ", ".join(sorted(set(references)))
        )
    if history is None:
        return None

    parent_snapshot, parent_error, _missing = stable_read_repo_bytes(
        repo_root,
        history["parent_summary_ref"],
        "review_history parent SUMMARY",
    )
    if parent_error:
        return (
            "WORKER-PACKET.json review_history parent summary could not be observed "
            f"as a stable repository regular file: {parent_error}"
        )
    if parent_snapshot["sha256"] != history["parent_summary_digest"]:
        return (
            "WORKER-PACKET.json review_history.parent_summary_digest does not match "
            "the observed parent SUMMARY bytes"
        )
    try:
        parent = json.loads(parent_snapshot["bytes"].decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        return (
            "WORKER-PACKET.json review_history parent SUMMARY is invalid UTF-8 "
            f"JSON: {error}"
        )
    if not isinstance(parent, dict) or parent.get("$schema") != "ultra-review-summary-v4":
        return (
            "WORKER-PACKET.json review_history parent SUMMARY must be an "
            "ultra-review-summary-v4 object"
        )
    for field, current in (
        ("mode", packet.get("mode")),
        ("change_id", packet.get("change_id")),
        ("task_ids", packet.get("task_ids")),
    ):
        if parent.get(field) != current:
            return (
                "WORKER-PACKET.json review_history parent SUMMARY "
                f"{field} does not match the current packet"
            )
    findings = parent.get("findings")
    if not isinstance(findings, list):
        return (
            "WORKER-PACKET.json review_history parent SUMMARY carries no findings "
            "array to resolve blocking ids against"
        )
    severity_by_id: dict[str, str] = {}
    for finding in findings:
        if isinstance(finding, dict) and nonempty_string(finding.get("id")):
            severity_by_id[finding["id"]] = finding.get("severity")
    blocking_ids = history["unresolved_blocking_ids"]
    if len(blocking_ids) != len(set(blocking_ids)):
        return (
            "WORKER-PACKET.json review_history.unresolved_blocking_ids must not "
            "repeat a finding id"
        )
    for blocking_id in blocking_ids:
        severity = severity_by_id.get(blocking_id)
        if severity is None:
            return (
                "WORKER-PACKET.json review_history.unresolved_blocking_ids names "
                f"`{blocking_id}`, which is not a finding of the parent SUMMARY"
            )
        if severity not in {"P0", "P1"}:
            return (
                "WORKER-PACKET.json review_history.unresolved_blocking_ids names "
                f"`{blocking_id}`, whose parent severity `{severity}` is not a "
                "current P0/P1 blocker"
            )
    return None


def load_worker_packet(
    session_path: Path,
    expected_packet_digest: str,
    admit_subjects=False,
    require_admission=False,
    legacy_v4=False,
):
    repo_root, root_error = canonical_repo_root(session_path)
    if root_error:
        return None, f"WORKER-PACKET.json {root_error}"
    session_name = session_path.resolve().name
    packet_repo_path = f".ultra/reviews/{session_name}/WORKER-PACKET.json"
    packet_snapshot, packet_error, _missing = stable_read_repo_bytes(
        repo_root,
        packet_repo_path,
        "WORKER-PACKET.json",
    )
    if packet_error:
        return None, packet_error
    packet_bytes = packet_snapshot["bytes"]
    actual_digest = packet_snapshot["sha256"]
    if actual_digest != expected_packet_digest:
        return None, (
            "WORKER-PACKET.json bytes do not match expected immutable packet digest "
            f"{expected_packet_digest}; observed {actual_digest}"
        )
    try:
        packet = json.loads(packet_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        return None, f"WORKER-PACKET.json is invalid UTF-8 JSON: {error}"
    if not isinstance(packet, dict):
        return None, "WORKER-PACKET.json top-level value must be an object"
    missing_fields = sorted(PACKET_REQUIRED_FIELDS - set(packet))
    if missing_fields:
        return None, (
            "WORKER-PACKET.json missing required fields: " + ", ".join(missing_fields)
        )
    if packet.get("$schema") != "ultra-review-worker-packet-v1":
        return None, "WORKER-PACKET.json must use ultra-review-worker-packet-v1"
    admission_contract = packet.get("admission_contract")
    if admit_subjects:
        if admission_contract != ADMISSION_CONTRACT_V2:
            return None, (
                "WORKER-PACKET.json admission_contract must be "
                f"{ADMISSION_CONTRACT_V2} for new strict v4 admission"
            )
    elif require_admission and admission_contract not in STRICT_ADMISSION_CONTRACTS:
        return None, (
            "WORKER-PACKET.json admission_contract must declare retained strict v1 "
            "or current strict v2 for strict v4 consumption"
        )
    elif legacy_v4 and admission_contract in STRICT_ADMISSION_CONTRACTS:
        return None, (
            "WORKER-PACKET.json declares a strict admission_contract and "
            "cannot be consumed with --legacy-v4"
        )
    for field in ["session", "head", "range", "change_id", "output_directory"]:
        if not nonempty_string(packet.get(field)):
            return None, f"WORKER-PACKET.json {field} must be a non-empty string"
    if (
        not ARTIFACT_STEM.fullmatch(packet["session"])
        or packet["session"] != session_path.resolve().name
    ):
        return None, (
            "WORKER-PACKET.json session must be a safe stem matching the canonical "
            "session directory"
        )
    if not timestamp_string(packet.get("created_at")):
        return None, "WORKER-PACKET.json created_at must be an RFC 3339 timestamp"
    if not git_blob_digest_string(packet.get("head")):
        return None, "WORKER-PACKET.json head must be a lowercase 40-hex Git commit digest"
    if packet.get("mode") not in REVIEW_MODES:
        return None, "WORKER-PACKET.json mode must be task, change, or plan"
    for field, require_nonempty in [
        ("task_ids", packet["mode"] == "task"),
        ("acceptance", True),
        ("public_seams", True),
    ]:
        array_error = validate_string_array(
            packet.get(field),
            f"WORKER-PACKET.json {field}",
            require_nonempty,
        )
        if array_error:
            return None, array_error
    for index, acceptance in enumerate(packet["acceptance"]):
        source, separator, literal = acceptance.partition(": ")
        if not separator or not literal:
            return None, (
                f"WORKER-PACKET.json acceptance[{index}] must be "
                "<repository-path>#<heading>: <captured owner-readable claim>"
            )
        _, path_error = validate_repo_path(
            source,
            repo_root,
            f"WORKER-PACKET.json acceptance[{index}] source",
            allow_fragment=True,
        )
        if path_error:
            return None, path_error

    output_directory, path_error = validate_repo_path(
        packet["output_directory"],
        repo_root,
        "WORKER-PACKET.json output_directory",
    )
    if path_error:
        return None, path_error
    canonical_output = f".ultra/reviews/{packet['session']}"
    if output_directory != canonical_output:
        return None, (
            "WORKER-PACKET.json output_directory must equal the canonical session path "
            f"{canonical_output}"
        )

    trace_data = packet.get("north_star_trace")
    if not isinstance(trace_data, dict) or set(trace_data) != TRACE_FIELDS:
        return None, (
            "WORKER-PACKET.json north_star_trace must contain exactly path, "
            "first_principles, serves, touches, north_star_revision, and "
            "north_star_digest"
        )
    trace = _trace_arrays(packet.get("north_star_trace"))
    if trace is None:
        return None, "WORKER-PACKET.json north_star_trace arrays are invalid"
    _, path_error = validate_repo_path(
        trace_data.get("path"),
        repo_root,
        "WORKER-PACKET.json north_star_trace.path",
        allow_fragment=True,
    )
    if path_error:
        return None, path_error
    trace_source, fragment = trace_data["path"].split("#", 1)
    parts = trace_source.split("/")
    if (
        fragment != "north-star-trace"
        or len(parts) != 5
        or parts[:2] != [".ultra", "changes"]
        or parts[2] not in {"active", "archive", "abandoned"}
        or parts[3] != packet["change_id"]
        or parts[4] != "intent.md"
    ):
        return None, (
            "north_star_trace.path must bind change_id to "
            ".ultra/changes/<active|archive|abandoned>/<change_id>/intent.md"
            "#north-star-trace"
        )
    if not nonempty_string(trace_data.get("north_star_revision")):
        return None, (
            "WORKER-PACKET.json north_star_trace.north_star_revision must be a "
            "non-empty string"
        )
    if not git_blob_digest_string(trace_data.get("north_star_digest")):
        return None, (
            "WORKER-PACKET.json north_star_trace.north_star_digest must be a "
            "lowercase 40-hex Git blob digest"
        )
    if admission_contract == ADMISSION_CONTRACT_V2:
        subject_observation_error = validate_packet_subject_observations(packet, repo_root)
        if subject_observation_error:
            return None, subject_observation_error

    context_files = packet.get("context_files")
    if not isinstance(context_files, list):
        return None, "WORKER-PACKET.json context_files must be an array"
    seen_context_paths = set()
    for index, context_file in enumerate(context_files):
        if not isinstance(context_file, dict) or set(context_file) != CONTEXT_FIELDS:
            return None, (
                f"WORKER-PACKET.json context_files[{index}] must contain exactly "
                "path and sha256"
            )
        context_path, path_error = validate_repo_path(
            context_file.get("path"),
            repo_root,
            f"WORKER-PACKET.json context_files[{index}].path",
        )
        if path_error:
            return None, path_error
        if context_path in seen_context_paths:
            return None, "WORKER-PACKET.json context_files paths must be unique"
        seen_context_paths.add(context_path)
        if not digest_string(context_file.get("sha256")):
            return None, (
                f"WORKER-PACKET.json context_files[{index}].sha256 must be a "
                "lowercase SHA-256 digest"
            )
    if packet["mode"] == "task":
        expected_context_paths = [
            f".ultra/contexts/task-{task_id}.md" for task_id in packet["task_ids"]
        ]
        observed_context_paths = [item["path"] for item in context_files]
        if observed_context_paths != expected_context_paths:
            return None, (
                "task-mode context_files paths must exactly follow ordered task_ids: "
                + ", ".join(expected_context_paths)
            )

    diff_files = packet.get("diff_files")
    if not isinstance(diff_files, list) or not diff_files:
        return None, "WORKER-PACKET.json diff_files must be a non-empty path array"
    normalized_diff_files = []
    for index, diff_file in enumerate(diff_files):
        normalized_path, path_error = validate_repo_path(
            diff_file,
            repo_root,
            f"WORKER-PACKET.json diff_files[{index}]",
        )
        if path_error:
            return None, path_error
        normalized_diff_files.append(normalized_path)
    if len(normalized_diff_files) != len(set(normalized_diff_files)):
        return None, "WORKER-PACKET.json diff_files must not contain duplicates"

    history_error = validate_packet_review_history(packet, repo_root)
    if history_error:
        return None, history_error

    workers = packet.get("workers")
    if not isinstance(workers, list) or not workers:
        return None, "WORKER-PACKET.json workers must be a non-empty array"
    by_stem = {}
    by_agent = {}
    ordered = []
    previous_order = -1
    for index, worker in enumerate(workers):
        if not isinstance(worker, dict) or set(worker) != WORKER_FIELDS:
            return None, (
                f"WORKER-PACKET.json workers[{index}] must contain exactly agent, "
                "axis, lens, and output"
            )
        agent = worker.get("agent")
        axis = worker.get("axis")
        lens = worker.get("lens")
        output = worker.get("output")
        if agent not in REVIEW_WORKERS or agent in by_agent:
            return None, f"WORKER-PACKET.json has invalid or duplicate worker agent: {agent}"
        canonical = CANONICAL_WORKER_BY_AGENT[agent]
        if axis != canonical["axis"]:
            return None, (
                f"WORKER-PACKET.json worker {agent} axis must use canonical value "
                f"{canonical['axis']}"
            )
        if lens != canonical["lens"]:
            return None, (
                f"WORKER-PACKET.json worker {agent} lens must use canonical path "
                f"{canonical['lens']}"
            )
        _, path_error = validate_repo_path(
            lens,
            repo_root,
            f"WORKER-PACKET.json worker {agent} lens",
        )
        if path_error:
            return None, path_error
        output_path, path_error = validate_repo_path(
            output,
            repo_root,
            f"WORKER-PACKET.json worker {agent} output",
        )
        if path_error:
            return None, path_error
        canonical_worker_output = f"{output_directory}/{agent}.json"
        if output_path != canonical_worker_output:
            return None, (
                f"WORKER-PACKET.json worker {agent} output must equal canonical path "
                f"{canonical_worker_output}"
            )
        if canonical["order"] <= previous_order:
            return None, "WORKER-PACKET.json workers must use canonical roster order"
        previous_order = canonical["order"]
        output_name = PurePosixPath(output_path).name
        output_stem = PurePosixPath(output_path).stem
        if output_stem in by_stem:
            return None, f"WORKER-PACKET.json repeats output stem: {output_stem}"
        normalized = {
            "agent": agent,
            "axis": axis,
            "lens": lens,
            "output": output_path,
            "stem": output_stem,
            "filename": output_name,
        }
        by_stem[output_stem] = normalized
        by_agent[agent] = normalized
        ordered.append(normalized)
    if "review-spec" not in by_agent:
        return None, (
            "WORKER-PACKET.json workers must include canonical review-spec for the "
            "permanent specification axis"
        )
    admission = None
    if admit_subjects:
        admission, subject_error = validate_packet_admission(
            packet,
            repo_root,
            actual_digest,
        )
        if subject_error:
            return None, f"WORKER-PACKET.json subject validation failed: {subject_error}"
    loaded = {
        "data": packet,
        "digest": actual_digest,
        "trace": {field: set(values) for field, values in trace.items()},
        "repo_root": repo_root,
        "diff_scope": set(normalized_diff_files),
        "context_digest": canonical_context_digest(context_files),
        "admission": admission,
        "workers": ordered,
        "by_stem": by_stem,
        "by_agent": by_agent,
    }
    if require_admission:
        receipt, receipt_error = load_admission_receipt(session_path, loaded)
        if receipt_error:
            return None, (
                "strict v4 packet consumption requires a valid ADMISSION.json receipt "
                f"from packet mode: {receipt_error}"
            )
        loaded["admission_receipt"] = receipt
    return loaded, None


def reload_worker_packet(
    session_path: Path,
    expected_packet_digest: str,
    admit_subjects=False,
    require_admission=False,
    legacy_v4=False,
):
    return load_worker_packet(
        session_path,
        expected_packet_digest,
        admit_subjects,
        require_admission,
        legacy_v4,
    )


def packet_admission_binding(packet):
    receipt = packet.get("admission_receipt") if packet is not None else None
    if receipt is None:
        return None
    return {
        "admission_digest": receipt["digest"],
        "subject_digest": receipt["data"]["subject_digest"],
    }


def validate_artifact_admission_binding(data, packet, label: str):
    expected = packet_admission_binding(packet)
    if expected is None:
        return None
    for field in ("admission_digest", "subject_digest"):
        if not digest_string(data.get(field)):
            return f"{label} {field} must be the lowercase SHA-256 from ADMISSION.json"
        if data[field] != expected[field]:
            return f"{label} {field} must exactly match ADMISSION.json"
    return None


def validate_pinned_admission(packet, expected):
    if expected is None:
        return None
    if packet_admission_binding(packet) != expected:
        return (
            "ADMISSION.json receipt changed during polling; the strict review session "
            "is INCOMPLETE and must be restarted as a fresh session"
        )
    return None


def validate_north_star_trace(value, allowed=None):
    if not isinstance(value, dict) or set(value) != {"first_principles", "serves", "touches"}:
        return "finding north_star_trace must contain exactly first_principles, serves, and touches"
    patterns = {
        "first_principles": r"FP-[A-Za-z0-9][A-Za-z0-9._-]*",
        "serves": r"NS-[A-Za-z0-9][A-Za-z0-9._-]*",
        "touches": r"HC-[A-Za-z0-9][A-Za-z0-9._-]*",
    }
    for field, pattern in patterns.items():
        values = value.get(field)
        if not isinstance(values, list) or not all(
            isinstance(item, str) and re.fullmatch(pattern, item) for item in values
        ):
            return f"finding north_star_trace.{field} must be an array of resolving {pattern[:2]} IDs"
        if len(values) != len(set(values)):
            return f"finding north_star_trace.{field} must not contain duplicates"
        if allowed is not None:
            outside = [item for item in values if item not in allowed[field]]
            if outside:
                return (
                    f"finding north_star_trace.{field} contains IDs outside the immutable "
                    f"Worker Packet: {', '.join(outside)}"
                )
    return None


def validate_finding(
    finding,
    artifact_axis: str,
    seen_ids,
    findings_schema: str,
    allowed_trace=None,
    allowed_files=None,
    repo_root=None,
):
    if not isinstance(finding, dict):
        return "finding must be an object"
    missing = sorted(FINDING_FIELDS - set(finding))
    if missing:
        return f"finding missing fields: {', '.join(missing)}"
    if not nonempty_string(finding.get("id")):
        return "finding id must be a non-empty string"
    if finding["id"] in seen_ids:
        return f"duplicate finding id: {finding['id']}"
    seen_ids.add(finding["id"])
    if finding.get("axis") != artifact_axis:
        return "finding axis must match artifact axis"
    if finding.get("severity") not in SEVERITIES:
        return "finding severity must be P0, P1, P2, or P3"
    for field in ["category", "title", "file", "trigger", "impact", "evidence", "suggestion"]:
        if not nonempty_string(finding.get(field)):
            return f"finding {field} must be a non-empty string"
    if repo_root is not None:
        finding_file, path_error = validate_repo_path(
            finding["file"],
            repo_root,
            "finding file",
        )
        if path_error:
            return path_error
        if finding_file not in allowed_files:
            return "finding file must be within the immutable Worker Packet diff scope"
    if not isinstance(finding.get("line"), int) or finding["line"] < 1:
        return "finding line must be a positive integer"
    line_end = finding.get("line_end")
    if line_end is not None and (not isinstance(line_end, int) or line_end < finding["line"]):
        return "finding line_end must be at or after line"
    if findings_schema == FINDINGS_SCHEMA:
        if "north_star_trace" not in finding:
            return "finding missing fields: north_star_trace"
        trace_error = validate_north_star_trace(
            finding.get("north_star_trace"),
            allowed_trace,
        )
        if trace_error:
            return trace_error
    return None


def validate_specialist(
    data,
    expected_packet_digest: str,
    findings_schema: str,
    expected_worker=None,
    packet=None,
):
    if data.get("$schema") != findings_schema:
        return f"$schema must be {findings_schema}"
    if not nonempty_string(data.get("agent")):
        return "agent must be a non-empty string"
    if expected_worker is not None and data.get("agent") != expected_worker["agent"]:
        return f"agent must match packet roster worker {expected_worker['agent']}"
    if not digest_string(data.get("packet_digest")):
        return "packet_digest must be a lowercase SHA-256 digest"
    if data["packet_digest"] != expected_packet_digest:
        return f"packet_digest does not match expected immutable packet {expected_packet_digest}"
    admission_error = validate_artifact_admission_binding(
        data,
        packet,
        "specialist artifact",
    )
    if admission_error:
        return admission_error
    axis = data.get("axis")
    if axis not in AXES:
        return "axis must be spec_fidelity or engineering_standards"
    if expected_worker is not None and axis != expected_worker["axis"]:
        return f"axis must match packet roster axis {expected_worker['axis']}"
    if not nonempty_string(data.get("session")):
        return "session must be a non-empty string"
    if findings_schema == FINDINGS_SCHEMA:
        if not timestamp_string(data.get("timestamp")):
            return "timestamp must be an RFC 3339 timestamp"
    elif not nonempty_string(data.get("timestamp")):
        return "timestamp must be a non-empty string"
    if packet is not None and data.get("session") != packet["data"]["session"]:
        return "session must match WORKER-PACKET.json"
    scope = data.get("scope")
    if not isinstance(scope, dict):
        return "scope must be an object"
    for field in ["head", "range"]:
        if not nonempty_string(scope.get(field)):
            return f"scope.{field} must be a non-empty string"
        if packet is not None and scope.get(field) != packet["data"][field]:
            return f"scope.{field} must match WORKER-PACKET.json"
    if not isinstance(scope.get("files_analyzed"), list) or not all(
        nonempty_string(item) for item in scope["files_analyzed"]
    ):
        return "scope.files_analyzed must be a string array"
    if packet is not None:
        normalized_analyzed = []
        for index, analyzed_file in enumerate(scope["files_analyzed"]):
            normalized_path, path_error = validate_repo_path(
                analyzed_file,
                packet["repo_root"],
                f"scope.files_analyzed[{index}]",
            )
            if path_error:
                return path_error
            normalized_analyzed.append(normalized_path)
        if len(normalized_analyzed) != len(set(normalized_analyzed)):
            return "scope.files_analyzed must not contain duplicates"
        outside_scope = [
            item for item in normalized_analyzed if item not in packet["diff_scope"]
        ]
        if outside_scope:
            return (
                "scope.files_analyzed must stay within the immutable Worker Packet "
                "diff scope: " + ", ".join(outside_scope)
            )
        if scope.get("diff_only") is not True:
            return "scope.diff_only must be true for packet-bound v4 artifacts"
    elif not isinstance(scope.get("diff_only"), bool):
        return "scope.diff_only must be boolean"
    if data.get("status") != "complete":
        return "status must be complete"
    findings = data.get("findings")
    if not isinstance(findings, list):
        return "findings must be an array"
    seen_ids = set()
    for finding in findings:
        error = validate_finding(
            finding,
            axis,
            seen_ids,
            findings_schema,
            packet["trace"] if packet is not None else None,
            packet["diff_scope"] if packet is not None else None,
            packet["repo_root"] if packet is not None else None,
        )
        if error:
            return error
    for field in ["positive_observations", "limitations"]:
        if not isinstance(data.get(field), list):
            return f"{field} must be an array"
    coverage_refs = data.get("coverage_refs")
    if not isinstance(coverage_refs, list) or not all(
        nonempty_string(item) for item in coverage_refs
    ):
        return "coverage_refs must be a string array"
    if not findings and not coverage_refs and not data["limitations"]:
        return "zero findings require coverage_refs or an explicit limitation"
    return None


def evaluate_artifacts(
    session_path: Path,
    expected,
    expected_packet_digest: str,
    findings_schema: str,
    packet=None,
):
    done = []
    missing = []
    invalid = []
    errors = {}
    digests = {}
    if packet is None:
        repo_root, root_error = canonical_repo_root(session_path)
        if root_error:
            return [], [], list(expected), {"session": root_error}, {}
    else:
        repo_root = packet["repo_root"]
    for stem in expected:
        expected_worker = packet["by_stem"].get(stem) if packet is not None else None
        if packet is not None and expected_worker is None:
            invalid.append(stem)
            errors[stem] = "requested artifact stem is absent from WORKER-PACKET.json roster"
            continue
        repo_path = (
            expected_worker["output"]
            if expected_worker is not None
            else f".ultra/reviews/{session_path.resolve().name}/{stem}.json"
        )
        data, snapshot, error, is_missing = stable_read_repo_json(
            repo_root,
            repo_path,
            f"specialist artifact {stem}",
        )
        if is_missing:
            missing.append(stem)
            continue
        if error is None:
            error = validate_specialist(
                data,
                expected_packet_digest,
                findings_schema,
                expected_worker,
                packet,
            )
        if error:
            invalid.append(stem)
            errors[stem] = error
        else:
            done.append(stem)
            digests[stem] = snapshot["sha256"]
    return done, missing, invalid, errors, digests


def wait_for_agents(
    session_path: Path,
    expected,
    expected_packet_digest: str,
    findings_schema: str,
    timeout: float,
    require_admission: bool,
    legacy_v4: bool = False,
) -> bool:
    packet = None
    if findings_schema == FINDINGS_SCHEMA:
        packet, packet_error = reload_worker_packet(
            session_path,
            expected_packet_digest,
            require_admission=require_admission,
            legacy_v4=legacy_v4,
        )
        if packet_error:
            print(json.dumps({
                "status": "incomplete",
                "artifacts_done": [],
                "artifacts_missing": [],
                "artifacts_invalid": list(expected),
                "errors": {"WORKER-PACKET": packet_error},
                "count": 0,
            }, sort_keys=True))
            return False
    pinned_admission = packet_admission_binding(packet)
    deadline = time.monotonic() + timeout
    while True:
        current_packet = packet
        if packet is not None:
            current_packet, packet_error = reload_worker_packet(
                session_path,
                expected_packet_digest,
                require_admission=require_admission,
                legacy_v4=legacy_v4,
            )
            if packet_error:
                print(json.dumps({
                    "status": "incomplete",
                    "artifacts_done": [],
                    "artifacts_missing": [],
                    "artifacts_invalid": list(expected),
                    "errors": {"WORKER-PACKET": packet_error},
                    "count": 0,
                }, sort_keys=True))
                return False
            admission_error = validate_pinned_admission(
                current_packet,
                pinned_admission,
            )
            if admission_error:
                print(json.dumps({
                    "status": "incomplete",
                    "artifacts_done": [],
                    "artifacts_missing": [],
                    "artifacts_invalid": list(expected),
                    "errors": {"ADMISSION": admission_error},
                    "count": 0,
                }, sort_keys=True))
                return False
        done, missing, invalid, errors, digests = evaluate_artifacts(
            session_path,
            expected,
            expected_packet_digest,
            findings_schema,
            current_packet,
        )
        if len(done) == len(expected):
            if packet is not None:
                final_packet, packet_error = reload_worker_packet(
                    session_path,
                    expected_packet_digest,
                    require_admission=require_admission,
                    legacy_v4=legacy_v4,
                )
                if packet_error:
                    print(json.dumps({
                        "status": "incomplete",
                        "artifacts_done": [],
                        "artifacts_missing": [],
                        "artifacts_invalid": list(expected),
                        "errors": {"WORKER-PACKET": packet_error},
                        "count": 0,
                    }, sort_keys=True))
                    return False
                admission_error = validate_pinned_admission(
                    final_packet,
                    pinned_admission,
                )
                if admission_error:
                    print(json.dumps({
                        "status": "incomplete",
                        "artifacts_done": [],
                        "artifacts_missing": [],
                        "artifacts_invalid": list(expected),
                        "errors": {"ADMISSION": admission_error},
                        "count": 0,
                    }, sort_keys=True))
                    return False
            output = {
                "status": "complete",
                "artifacts_done": done,
                "artifact_digests": digests,
                "artifacts_missing": [],
                "artifacts_invalid": [],
                "errors": {},
                "count": len(done),
            }
            if pinned_admission is not None:
                output.update(pinned_admission)
            print(json.dumps(output, sort_keys=True))
            return True
        if time.monotonic() >= deadline:
            print(json.dumps({
                "status": "incomplete",
                "artifacts_done": done,
                "artifacts_missing": missing,
                "artifacts_invalid": invalid,
                "errors": errors,
                "count": len(done),
            }, sort_keys=True))
            return False
        time.sleep(min(POLL_INTERVAL, max(0.0, deadline - time.monotonic())))


def expected_overall_verdict(data) -> str:
    verdicts = {data["axes"][axis]["verdict"] for axis in AXES}
    severities = {finding["severity"] for finding in data["findings"]}
    if "INCOMPLETE" in verdicts:
        return "INCOMPLETE"
    if "FAIL" in verdicts or severities.intersection({"P0", "P1"}):
        return "REQUEST_CHANGES"
    return "APPROVE"


def load_completed_specialists(
    session_path: Path,
    packet,
    completed,
    expected_packet_digest: str,
):
    union = []
    refs_by_axis = {axis: [] for axis in AXES}
    for worker in packet["workers"]:
        if worker["agent"] not in completed:
            continue
        data, _snapshot, error, is_missing = stable_read_repo_json(
            packet["repo_root"],
            worker["output"],
            f"completed specialist {worker['agent']}",
        )
        if is_missing:
            error = "artifact is missing"
        if error is None:
            error = validate_specialist(
                data,
                expected_packet_digest,
                FINDINGS_SCHEMA,
                worker,
                packet,
            )
        if error:
            return None, None, (
                f"completed specialist {worker['agent']} is invalid: {error}"
            )
        refs_by_axis[worker["axis"]].append(worker["filename"])
        union.extend(data["findings"])
    return union, refs_by_axis, None


def expected_axis_verdict(axis, union, packet, failed) -> str:
    selected = [worker for worker in packet["workers"] if worker["axis"] == axis]
    if not selected or any(worker["agent"] in failed for worker in selected):
        return "INCOMPLETE"
    severities = {
        finding["severity"] for finding in union if finding.get("axis") == axis
    }
    return "FAIL" if severities.intersection({"P0", "P1"}) else "PASS"


def validate_summary(
    data,
    expected_packet_digest: str,
    summary_schema: str,
    findings_schema: str,
    session_path=None,
    packet=None,
):
    if data.get("$schema") != summary_schema:
        return f"$schema must be {summary_schema}"
    if data.get("mode") not in REVIEW_MODES:
        return "mode must be task, change, or plan"
    if data.get("execution_mode") not in EXECUTION_MODES:
        return "execution_mode must be isolated or sequential-shared-context"
    for field in ["session", "change_id", "head"]:
        if not nonempty_string(data.get(field)):
            return f"{field} must be a non-empty string"
    if not digest_string(data.get("packet_digest")):
        return "packet_digest must be a lowercase SHA-256 digest"
    if data["packet_digest"] != expected_packet_digest:
        return f"packet_digest does not match expected immutable packet {expected_packet_digest}"
    admission_error = validate_artifact_admission_binding(data, packet, "SUMMARY.json")
    if admission_error:
        return admission_error
    if packet is not None:
        packet_data = packet["data"]
        exact_fields = ["mode", "session", "change_id", "task_ids", "head"]
        for field in exact_fields:
            if data.get(field) != packet_data.get(field):
                return f"summary {field} must match WORKER-PACKET.json"
    if summary_schema == SUMMARY_SCHEMA:
        if "worktree_digest" not in data or data.get("worktree_digest") is not None:
            return (
                "worktree_digest must be present and null until an exact worktree "
                "observation is bound by the immutable Worker Packet"
            )
        if not digest_string(data.get("context_digest")):
            return "context_digest must be a lowercase SHA-256 digest"
        if packet is not None and data["context_digest"] != packet["context_digest"]:
            return (
                "context_digest must equal the immutable Worker Packet context digest "
                f"{packet['context_digest']}"
            )
    else:
        if not nonempty_string(data.get("context_digest")):
            return "context_digest must be a non-empty string"
        if data.get("worktree_digest") is not None and not nonempty_string(
            data.get("worktree_digest")
        ):
            return "worktree_digest must be null or a non-empty string"
    task_ids = data.get("task_ids")
    if not isinstance(task_ids, list) or not all(nonempty_string(item) for item in task_ids):
        return "task_ids must be a string array"
    if data.get("status") != "complete":
        return "status must be complete"
    if data.get("verdict") not in OVERALL_VERDICTS:
        return "invalid overall verdict"
    axes = data.get("axes")
    if not isinstance(axes, dict) or set(axes) != AXES:
        return "axes must contain exactly spec_fidelity and engineering_standards"
    for axis in AXES:
        item = axes[axis]
        if not isinstance(item, dict) or item.get("verdict") not in AXIS_VERDICTS:
            return f"invalid {axis} verdict"
        refs = item.get("evidence_refs")
        if not isinstance(refs, list) or not all(nonempty_string(ref) for ref in refs):
            return f"{axis}.evidence_refs must be a string array"
        if packet is None and not refs:
            return f"{axis}.evidence_refs must be non-empty for legacy summaries"
    workers = data.get("workers")
    if not isinstance(workers, dict):
        return "workers must be an object"
    for field in ["completed", "failed", "skipped"]:
        values = workers.get(field)
        if not isinstance(values, list) or not all(nonempty_string(item) for item in values):
            return f"workers.{field} must be a string array"
        if len(values) != len(set(values)):
            return f"workers.{field} must not contain duplicates"
    completed_set = set(workers["completed"])
    failed_set = set(workers["failed"])
    skipped_set = set(workers["skipped"])
    if completed_set & failed_set or completed_set & skipped_set or failed_set & skipped_set:
        return "workers completed, failed, and skipped sets must be disjoint"
    worker_selection = data.get("worker_selection")
    if not isinstance(worker_selection, list) or not worker_selection:
        return "worker_selection must be a non-empty array"
    selected = set()
    skipped = set()
    seen_workers = set()
    for item in worker_selection:
        if not isinstance(item, dict):
            return "worker_selection items must be objects"
        worker = item.get("worker")
        status = item.get("status")
        if not nonempty_string(worker) or status not in SELECTION_STATUSES:
            return "worker_selection requires worker and selected or skipped status"
        if worker in seen_workers:
            return f"duplicate worker selection: {worker}"
        if not nonempty_string(item.get("rationale")):
            return f"worker selection rationale is required: {worker}"
        seen_workers.add(worker)
        (selected if status == "selected" else skipped).add(worker)
    if selected != completed_set | failed_set:
        return "selected workers must equal completed and failed workers"
    if skipped != skipped_set:
        return "skipped worker selection must match workers.skipped"
    if seen_workers != REVIEW_WORKERS:
        missing = sorted(REVIEW_WORKERS - seen_workers)
        extra = sorted(seen_workers - REVIEW_WORKERS)
        return f"worker_selection must disposition the complete roster; missing={missing}, extra={extra}"
    if "review-spec" not in selected:
        return "review-spec must be selected"
    if packet is not None:
        packet_selected = {worker["agent"] for worker in packet["workers"]}
        if selected != packet_selected:
            return "selected worker roster must equal WORKER-PACKET.json workers"
        if skipped != REVIEW_WORKERS - packet_selected:
            return "skipped worker roster must equal workers absent from WORKER-PACKET.json"
    findings = data.get("findings")
    if not isinstance(findings, list):
        return "findings must be an array"
    seen_ids = set()
    for finding in findings:
        axis = finding.get("axis") if isinstance(finding, dict) else None
        if axis not in AXES:
            return "summary finding has invalid axis"
        error = validate_finding(
            finding,
            axis,
            seen_ids,
            findings_schema,
            packet["trace"] if packet is not None else None,
            packet["diff_scope"] if packet is not None else None,
            packet["repo_root"] if packet is not None else None,
        )
        if error:
            return error
    for field in ["positive_observations", "limitations"]:
        if not isinstance(data.get(field), list):
            return f"{field} must be an array"
    coverage_refs = data.get("coverage_refs")
    if not isinstance(coverage_refs, list) or not all(
        nonempty_string(item) for item in coverage_refs
    ):
        return "coverage_refs must be a string array"
    if not findings and not coverage_refs and not data["limitations"]:
        return "zero findings require coverage_refs or an explicit limitation"
    if packet is not None:
        if session_path is None:
            return "v4 summary validation requires the session path"
        union, refs_by_axis, specialist_error = load_completed_specialists(
            session_path,
            packet,
            set(workers["completed"]),
            expected_packet_digest,
        )
        if specialist_error:
            return specialist_error
        if findings != union:
            return (
                "SUMMARY findings must equal the complete ordered specialist finding "
                "union unchanged"
            )
        failed = set(workers["failed"])
        for axis in AXES:
            if axes[axis]["evidence_refs"] != refs_by_axis[axis]:
                return f"{axis}.evidence_refs must equal packet-ordered completed specialist outputs"
            axis_expected = expected_axis_verdict(axis, union, packet, failed)
            if axes[axis]["verdict"] != axis_expected:
                return (
                    f"{axis} verdict {axes[axis]['verdict']} conflicts with completed "
                    f"specialist evidence; expected {axis_expected}"
                )
    expected = expected_overall_verdict(data)
    if data["verdict"] != expected:
        return f"verdict {data['verdict']} conflicts with evidence; expected {expected}"
    return None


def wait_for_summary(
    session_path: Path,
    expected_packet_digest: str,
    summary_schema: str,
    findings_schema: str,
    timeout: float,
    summary_snapshot_bytes=None,
    expected_summary_digest=None,
    require_admission=True,
    legacy_v4=False,
) -> bool:
    packet = None
    if summary_schema == SUMMARY_SCHEMA:
        packet, packet_error = reload_worker_packet(
            session_path,
            expected_packet_digest,
            require_admission=require_admission,
            legacy_v4=legacy_v4,
        )
        if packet_error:
            print(json.dumps({"status": "incomplete", "error": packet_error}, sort_keys=True))
            return False
    pinned_admission = packet_admission_binding(packet)
    repo_root = packet["repo_root"] if packet is not None else canonical_repo_root(session_path)[0]
    summary_repo_path = f".ultra/reviews/{session_path.resolve().name}/SUMMARY.json"
    deadline = time.monotonic() + timeout
    last_error = "SUMMARY.json is missing"
    while True:
        current_packet = packet
        if packet is not None:
            current_packet, packet_error = reload_worker_packet(
                session_path,
                expected_packet_digest,
                require_admission=require_admission,
                legacy_v4=legacy_v4,
            )
            if packet_error:
                print(json.dumps({"status": "incomplete", "error": packet_error}, sort_keys=True))
                return False
            admission_error = validate_pinned_admission(
                current_packet,
                pinned_admission,
            )
            if admission_error:
                print(json.dumps({"status": "incomplete", "error": admission_error}, sort_keys=True))
                return False

        if summary_snapshot_bytes is not None:
            summary_digest = hashlib.sha256(summary_snapshot_bytes).hexdigest()
            if summary_digest != expected_summary_digest:
                error = (
                    "caller-owned SUMMARY snapshot bytes do not match "
                    f"--summary-snapshot-digest {expected_summary_digest}; observed "
                    f"{summary_digest}"
                )
                data = None
            else:
                data, error = decode_json_bytes(
                    summary_snapshot_bytes,
                    "caller-owned SUMMARY snapshot",
                )
            is_missing = False
        else:
            data, snapshot, error, is_missing = stable_read_repo_json(
                repo_root,
                summary_repo_path,
                "SUMMARY.json",
            )
            summary_digest = snapshot["sha256"] if snapshot is not None else None

        if error is None:
            error = validate_summary(
                data,
                expected_packet_digest,
                summary_schema,
                findings_schema,
                session_path,
                current_packet,
            )
        if error is None:
            if packet is not None:
                final_packet, packet_error = reload_worker_packet(
                    session_path,
                    expected_packet_digest,
                    require_admission=require_admission,
                    legacy_v4=legacy_v4,
                )
                if packet_error:
                    print(json.dumps({"status": "incomplete", "error": packet_error}, sort_keys=True))
                    return False
                admission_error = validate_pinned_admission(
                    final_packet,
                    pinned_admission,
                )
                if admission_error:
                    print(json.dumps({"status": "incomplete", "error": admission_error}, sort_keys=True))
                    return False
            counts = {severity: 0 for severity in sorted(SEVERITIES)}
            for finding in data["findings"]:
                counts[finding["severity"]] += 1
            output = {
                "status": "complete",
                "verdict": data["verdict"],
                "message": (
                    f"Review complete: {data['verdict']} "
                    f"(P0:{counts['P0']} P1:{counts['P1']} P2:{counts['P2']} "
                    f"P3:{counts['P3']} total:{len(data['findings'])})"
                ),
                "counts": {
                    **counts,
                    "total": len(data["findings"]),
                },
                "summary_digest": summary_digest,
            }
            if pinned_admission is not None:
                output.update(pinned_admission)
            print(json.dumps(output, sort_keys=True))
            return True
        if not is_missing:
            last_error = error
        if summary_snapshot_bytes is not None:
            print(json.dumps({"status": "incomplete", "error": last_error}, sort_keys=True))
            return False
        if time.monotonic() >= deadline:
            print(json.dumps({"status": "incomplete", "error": last_error}, sort_keys=True))
            return False
        time.sleep(min(POLL_INTERVAL, max(0.0, deadline - time.monotonic())))


def validate_packet_preflight(session_path: Path, expected_packet_digest: str) -> bool:
    packet, error = reload_worker_packet(
        session_path,
        expected_packet_digest,
    )
    if error:
        print(json.dumps({"status": "incomplete", "error": error}, sort_keys=True))
        return False
    admission_contract = packet["data"].get("admission_contract")
    if admission_contract == ADMISSION_CONTRACT_V1:
        retained, receipt_error = reload_worker_packet(
            session_path,
            expected_packet_digest,
            require_admission=True,
        )
        if receipt_error:
            print(json.dumps({
                "status": "incomplete",
                "error_code": "admission_v1_receipt_required",
                "error": (
                    "retained strict v1 is read-only and requires its exact existing "
                    "ADMISSION.json receipt; start a fresh strict v2 review session "
                    f"instead of creating or recreating it: {receipt_error}"
                ),
            }, sort_keys=True))
            return False
        binding = packet_admission_binding(retained)
        print(json.dumps({
            "status": "complete",
            "packet_digest": retained["digest"],
            "context_digest": retained["context_digest"],
            "subject_digest": binding["subject_digest"],
            "admission_digest": binding["admission_digest"],
            "publication": "existing",
        }, sort_keys=True))
        return True
    if admission_contract != ADMISSION_CONTRACT_V2:
        print(json.dumps({
            "status": "incomplete",
            "error_code": "admission_contract_required",
            "error": (
                "WORKER-PACKET.json admission_contract must be "
                f"{ADMISSION_CONTRACT_V2} for new strict v4 admission"
            ),
        }, sort_keys=True))
        return False

    admission_path = session_path / "ADMISSION.json"
    try:
        os.lstat(admission_path)
        admission_missing = False
    except FileNotFoundError:
        admission_missing = True
    except OSError as observation_error:
        print(json.dumps({
            "status": "incomplete",
            "error_code": "admission_receipt_observation_failed",
            "error": f"ADMISSION.json presence could not be observed safely: {observation_error}",
        }, sort_keys=True))
        return False
    if admission_missing:
        existing_outputs = []
        output_paths = [
            *(worker["output"] for worker in packet["workers"]),
            f".ultra/reviews/{packet['data']['session']}/SUMMARY.json",
        ]
        for output_path in output_paths:
            try:
                os.lstat(packet["repo_root"] / output_path)
                existing_outputs.append(output_path)
            except FileNotFoundError:
                continue
            except OSError as observation_error:
                print(json.dumps({
                    "status": "incomplete",
                    "error_code": "admission_output_observation_failed",
                    "error": (
                        f"review output presence could not be observed safely for "
                        f"{output_path}: {observation_error}"
                    ),
                }, sort_keys=True))
                return False
        if existing_outputs:
            print(json.dumps({
                "status": "incomplete",
                "error_code": "admission_receipt_missing_after_outputs",
                "error": (
                    "ADMISSION.json is missing after review output exists; the current "
                    "strict session is INCOMPLETE and requires a fresh review session: "
                    + ", ".join(existing_outputs)
                ),
            }, sort_keys=True))
            return False

    packet, error = reload_worker_packet(
        session_path,
        expected_packet_digest,
        admit_subjects=True,
    )
    if error:
        print(json.dumps({"status": "incomplete", "error": error}, sort_keys=True))
        return False
    publication, error = atomic_write_admission(
        session_path,
        packet["admission"],
    )
    if error:
        print(json.dumps({
            "status": "incomplete",
            "error_code": error["code"],
            "error": error["message"],
        }, sort_keys=True))
        return False
    output = {
        "status": "complete",
        "packet_digest": packet["digest"],
        "context_digest": packet["context_digest"],
        "subject_digest": packet["admission"]["subject_digest"],
        "admission_digest": publication["digest"],
        "publication": publication["publication"],
    }
    if "durability_warning" in publication:
        output["durability_warning"] = publication["durability_warning"]
    print(json.dumps(output, sort_keys=True))
    return True


def validate_legacy_packet_boundary(
    session_path: Path,
    expected_packet_digest: str,
    legacy_flag: str,
):
    repo_root, root_error = canonical_repo_root(session_path)
    if root_error:
        return f"WORKER-PACKET.json {root_error}"
    packet_repo_path = (
        f".ultra/reviews/{session_path.resolve().name}/WORKER-PACKET.json"
    )
    snapshot, error, missing = stable_read_repo_bytes(
        repo_root,
        packet_repo_path,
        "WORKER-PACKET.json",
    )
    if missing:
        return None
    if error:
        return error
    if snapshot["sha256"] != expected_packet_digest:
        return (
            "WORKER-PACKET.json bytes do not match expected immutable packet digest "
            f"{expected_packet_digest}; observed {snapshot['sha256']}"
        )
    packet, decode_error = decode_json_bytes(snapshot["bytes"], "WORKER-PACKET.json")
    if decode_error:
        return decode_error
    if "admission_contract" in packet:
        return (
            "WORKER-PACKET.json declares a strict admission_contract and cannot be "
            f"consumed with {legacy_flag}; retain and use its exact ADMISSION.json receipt"
        )
    return None


def main():
    if len(sys.argv) < 3:
        print(__doc__, file=sys.stderr)
        sys.exit(2)

    session_path = Path(sys.argv[1])
    mode = sys.argv[2]
    if not session_path.is_dir():
        print(f"Error: session directory not found: {session_path}", file=sys.stderr)
        sys.exit(2)

    if len(sys.argv) < 5 or sys.argv[3] != "--packet-digest" or not digest_string(sys.argv[4]):
        print("Error: --packet-digest requires the expected lowercase SHA-256 digest", file=sys.stderr)
        sys.exit(2)
    expected_packet_digest = sys.argv[4]
    arguments = sys.argv[5:]
    legacy_v3 = bool(arguments and arguments[0] == "--legacy-v3")
    legacy_v4 = bool(arguments and arguments[0] == "--legacy-v4")
    if legacy_v3 or legacy_v4:
        arguments = arguments[1:]
    findings_schema = LEGACY_FINDINGS_SCHEMA if legacy_v3 else FINDINGS_SCHEMA
    summary_schema = LEGACY_SUMMARY_SCHEMA if legacy_v3 else SUMMARY_SCHEMA
    require_admission = not legacy_v3 and not legacy_v4

    if mode in {"agents", "summary"} and (legacy_v3 or legacy_v4):
        legacy_flag = "--legacy-v3" if legacy_v3 else "--legacy-v4"
        legacy_error = validate_legacy_packet_boundary(
            session_path,
            expected_packet_digest,
            legacy_flag,
        )
        if legacy_error:
            print(json.dumps({"status": "incomplete", "error": legacy_error}, sort_keys=True))
            sys.exit(1)

    if mode == "packet":
        if legacy_v3 or legacy_v4 or arguments:
            print("Error: packet mode accepts only --packet-digest", file=sys.stderr)
            sys.exit(2)
        ok = validate_packet_preflight(session_path, expected_packet_digest)
    elif mode == "agents":
        expected = arguments
        if not expected or len(expected) != len(set(expected)) or not all(
            ARTIFACT_STEM.fullmatch(stem) for stem in expected
        ):
            print("Error: agents mode requires unique safe artifact stems", file=sys.stderr)
            sys.exit(2)
        ok = wait_for_agents(
            session_path,
            expected,
            expected_packet_digest,
            findings_schema,
            DEFAULT_TIMEOUT,
            require_admission,
            legacy_v4,
        )
    elif mode == "summary":
        summary_snapshot_bytes = None
        expected_summary_digest = None
        if arguments:
            if (
                legacy_v3
                or len(arguments) != 2
                or arguments[0] != "--summary-snapshot-digest"
                or not digest_string(arguments[1])
            ):
                print(
                    "Error: summary mode accepts optional --legacy-v3, --legacy-v4, or "
                    "--summary-snapshot-digest <sha256>",
                    file=sys.stderr,
                )
                sys.exit(2)
            expected_summary_digest = arguments[1]
            summary_snapshot_bytes = sys.stdin.buffer.read(MAX_JSON_BYTES + 1)
            if len(summary_snapshot_bytes) > MAX_JSON_BYTES:
                print(json.dumps({
                    "status": "incomplete",
                    "error": (
                        "caller-owned SUMMARY snapshot exceeds the "
                        f"{MAX_JSON_BYTES}-byte artifact limit"
                    ),
                }, sort_keys=True))
                sys.exit(1)
        ok = wait_for_summary(
            session_path,
            expected_packet_digest,
            summary_schema,
            findings_schema,
            DEFAULT_TIMEOUT,
            summary_snapshot_bytes,
            expected_summary_digest,
            require_admission,
            legacy_v4,
        )
    else:
        print(f"Error: unknown mode '{mode}'. Use 'packet', 'agents', or 'summary'.", file=sys.stderr)
        sys.exit(2)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
