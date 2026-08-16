#!/usr/bin/env python3
"""Inject the accepted North Star or its pre-Research fallback plus task acceptance."""

import hashlib
import json
import re
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Any

from _common import (
    RESUME_NAVIGATION_LIMITATION,
    current_task_selection,
    emit_context,
    find_north_star_validator,
    markdown_section,
    project_root,
    read_payload,
    read_stable_project_file_snapshot,
    render_task_diagnostics,
    task_sections,
)


NORTH_STAR_SESSIONSTART_BYTE_CEILING = 32 * 1024
NORTH_STAR_SNAPSHOT_MAX_BYTES = 8 * 1024 * 1024
PROJECT_BRIEF_SNAPSHOT_MAX_BYTES = 8 * 1024 * 1024
NORTH_STAR_VALIDATOR_TIMEOUT_SECONDS = 10.0
NORTH_STAR_VALIDATOR_MAX_OUTPUT_BYTES = 256 * 1024
ACCEPTED_NORTH_STAR_SECTIONS = (
    "Acceptance and Revision",
    "Problem Reality",
    "First-Principle Propositions",
    "Value Causal Chain",
    "North Star Outcomes",
    "Hard Constraints",
    "Explicit Exclusions",
    "Uncertainties and Revisit Triggers",
    "Research Trace",
)
ACCEPTED_ID_SECTIONS = {
    "FP": "First-Principle Propositions",
    "NS": "North Star Outcomes",
    "HC": "Hard Constraints",
}


def settled_section(text: str) -> str:
    """Return an explicitly populated section, not a packaged unresolved marker."""
    if (
        not text
        or "[NEEDS CLARIFICATION]" in text
        or "[NEEDS RESEARCH" in text
        or "not yet defined" in text.lower()
    ):
        return ""
    return text.strip()


def _validator_failure(code: str, message: str, north_star_file: Path) -> dict[str, Any]:
    return {
        "$schema": "ultra-north-star-validation-v1",
        "path": str(north_star_file.absolute()),
        "kind": "unknown",
        "status": None,
        "classification": "unknown",
        "valid": False,
        "ids": {"FP": [], "NS": [], "HC": []},
        "sections": {},
        "input": None,
        "diagnostics": [{
            "code": code,
            "severity": "error",
            "message": message,
            "location": None,
        }],
    }


def _accepted_report_has_structural_projection(
    report: dict[str, Any],
    north_star_bytes: bytes,
) -> bool:
    """Validate the accepted report's exact byte projection, not its semantics."""
    ids = report.get("ids")
    sections = report.get("sections")
    if (
        not isinstance(ids, dict)
        or set(ids) != set(ACCEPTED_ID_SECTIONS)
        or not isinstance(sections, dict)
        or set(sections) != set(ACCEPTED_NORTH_STAR_SECTIONS)
    ):
        return False

    section_bodies: dict[str, str] = {}
    previous_end = 0
    for heading in ACCEPTED_NORTH_STAR_SECTIONS:
        span = sections.get(heading)
        if not isinstance(span, dict) or set(span) != {"body_start", "body_end"}:
            return False
        start = span.get("body_start")
        end = span.get("body_end")
        if (
            not isinstance(start, int)
            or isinstance(start, bool)
            or not isinstance(end, int)
            or isinstance(end, bool)
            or start < previous_end
            or end <= start
            or end > len(north_star_bytes)
        ):
            return False
        try:
            section_bodies[heading] = north_star_bytes[start:end].decode("utf-8")
        except UnicodeDecodeError:
            return False
        previous_end = end

    for kind, heading in ACCEPTED_ID_SECTIONS.items():
        projected_ids = ids.get(kind)
        if not isinstance(projected_ids, list) or not projected_ids:
            return False
        resolved_ids = re.findall(
            rf"^### ({kind}-[A-Za-z0-9][A-Za-z0-9._-]*)\b[^\n]*$",
            section_bodies[heading],
            re.MULTILINE,
        )
        if projected_ids != resolved_ids or len(projected_ids) != len(set(projected_ids)):
            return False
    return True


def _accepted_report_is_mechanically_bound(
    report: dict[str, Any],
    north_star_bytes: bytes,
    expected_digest: str,
) -> bool:
    """Check the exact accepted-publication fields without judging their meaning."""
    revision = report.get("revision")
    binding = report.get("acceptance_binding")
    observations = report.get("source_observations")
    if (
        report.get("kind") != "north-star-v2"
        or report.get("status") != "accepted"
        or report.get("classification") != "accepted"
        or not isinstance(revision, str)
        or not revision
        or revision.strip() != revision
        or revision == "none"
        or not isinstance(binding, dict)
        or set(binding) != {"source", "content_sha256", "git_blob_digest", "snapshot"}
        or not isinstance(observations, list)
        or len(observations) != 2
        or not _accepted_report_has_structural_projection(report, north_star_bytes)
    ):
        return False

    source = binding.get("source")
    snapshot = binding.get("snapshot")
    source_match = (
        re.fullmatch(
            r"(\.ultra/decisions/[A-Za-z0-9][A-Za-z0-9._-]*\.md)#[a-z0-9][a-z0-9-]*",
            source,
        )
        if isinstance(source, str)
        else None
    )
    snapshot_matches = (
        re.fullmatch(
            r"\.ultra/research/[A-Za-z0-9][A-Za-z0-9._-]*/"
            r"[A-Za-z0-9][A-Za-z0-9._-]*\.accepted\.md",
            snapshot,
        )
        if isinstance(snapshot, str)
        else None
    )
    expected_blob_digest = hashlib.sha1(
        f"blob {len(north_star_bytes)}\0".encode("utf-8") + north_star_bytes
    ).hexdigest()
    if (
        source_match is None
        or snapshot_matches is None
        or binding.get("content_sha256") != expected_digest
        or binding.get("git_blob_digest") != expected_blob_digest
    ):
        return False

    decision_observation, snapshot_observation = observations
    if (
        not isinstance(decision_observation, dict)
        or set(decision_observation) != {"role", "path", "sha256", "byte_length"}
        or decision_observation.get("role") != "decision"
        or decision_observation.get("path") != source_match.group(1)
        or not isinstance(decision_observation.get("sha256"), str)
        or re.fullmatch(r"[0-9a-f]{64}", decision_observation["sha256"]) is None
        or not isinstance(decision_observation.get("byte_length"), int)
        or isinstance(decision_observation.get("byte_length"), bool)
        or decision_observation["byte_length"] <= 0
        or not isinstance(snapshot_observation, dict)
        or set(snapshot_observation) != {"role", "path", "sha256", "byte_length"}
        or snapshot_observation.get("role") != "snapshot"
        or snapshot_observation.get("path") != snapshot
        or snapshot_observation.get("sha256") != expected_digest
        or snapshot_observation.get("byte_length") != len(north_star_bytes)
    ):
        return False
    return True


def read_north_star_snapshot(
    root: Path,
    north_star_file: Path,
    *,
    max_bytes: int = NORTH_STAR_SNAPSHOT_MAX_BYTES,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Adapt the shared file snapshot diagnostic to the canonical validator report."""
    try:
        relative = north_star_file.absolute().relative_to(root.absolute())
    except ValueError:
        return None, _validator_failure(
            "north_star_snapshot_read_error",
            "Canonical North Star path must remain within the repository root.",
            north_star_file,
        )
    snapshot, failure = read_stable_project_file_snapshot(
        root,
        relative,
        max_bytes=max_bytes,
        code_prefix="north_star_snapshot",
        label="Canonical North Star",
    )
    if failure is not None:
        return None, _validator_failure(
            failure["code"],
            failure["message"],
            north_star_file,
        )
    return snapshot, None


def read_project_brief_snapshot(
    root: Path,
    project_brief_file: Path,
    *,
    max_bytes: int = PROJECT_BRIEF_SNAPSHOT_MAX_BYTES,
) -> tuple[dict[str, Any] | None, dict[str, str] | None]:
    try:
        relative = project_brief_file.absolute().relative_to(root.absolute())
    except ValueError:
        return None, {
            "code": "project_brief_snapshot_read_error",
            "message": "Canonical Project Brief path must remain within the repository root.",
            "path": str(project_brief_file.absolute()),
        }
    return read_stable_project_file_snapshot(
        root,
        relative,
        max_bytes=max_bytes,
        code_prefix="project_brief_snapshot",
        label="Canonical Project Brief",
    )


def project_brief_text(
    snapshot: dict[str, Any] | None,
    failure: dict[str, str] | None,
) -> tuple[str, dict[str, str] | None]:
    if snapshot is None:
        return "", failure
    try:
        return snapshot["bytes"].decode("utf-8"), None
    except UnicodeDecodeError:
        return "", {
            "code": "project_brief_snapshot_invalid_utf8",
            "message": "Canonical Project Brief must be valid UTF-8.",
            "path": snapshot["path"],
        }


def project_brief_repair_note(failure: dict[str, str] | None) -> str:
    code = failure.get("code") if isinstance(failure, dict) else "project_brief_snapshot_read_error"
    return (
        f"Ultra Project Brief fallback is unavailable (`{code}`); no Project Brief bytes "
        "were published. Repair `.ultra/project-brief.md` as a stable UTF-8 regular file "
        "inside the repository, then retry SessionStart."
    )


def _terminate_and_reap(process: subprocess.Popen) -> None:
    """Stop one validator attempt and leave no live child behind."""
    if process.poll() is not None:
        return
    try:
        process.terminate()
    except OSError:
        pass
    try:
        process.wait(timeout=0.25)
        return
    except (OSError, subprocess.TimeoutExpired):
        pass
    try:
        process.kill()
        process.wait(timeout=0.25)
    except (OSError, subprocess.TimeoutExpired):
        pass


def _read_bounded_process_output(
    process: subprocess.Popen,
    timeout_seconds: float,
    max_output_bytes: int,
    input_bytes: bytes,
) -> tuple[bytes, bytes, str | None]:
    """Drain both pipes concurrently while retaining at most one combined byte budget."""
    buffers = {"stdout": bytearray(), "stderr": bytearray()}
    lock = threading.Lock()
    stop = threading.Event()
    changed = threading.Event()
    output_too_large = threading.Event()
    total_bytes = 0

    def drain(name: str, stream) -> None:
        nonlocal total_bytes
        try:
            while not stop.is_set():
                chunk = stream.read1(8192)
                if not chunk:
                    break
                with lock:
                    remaining = max(0, max_output_bytes - total_bytes)
                    retained = chunk[:remaining]
                    buffers[name].extend(retained)
                    total_bytes += len(retained)
                    if len(chunk) > remaining:
                        output_too_large.set()
                        stop.set()
                changed.set()
        except OSError:
            # Closing a pipe while terminating the child is an expected cleanup path.
            pass
        finally:
            changed.set()

    readers = [
        threading.Thread(target=drain, args=("stdout", process.stdout), daemon=True),
        threading.Thread(target=drain, args=("stderr", process.stderr), daemon=True),
    ]

    def feed_stdin() -> None:
        try:
            process.stdin.write(input_bytes)
            process.stdin.flush()
        except (BrokenPipeError, OSError):
            pass
        finally:
            try:
                process.stdin.close()
            except OSError:
                pass
            changed.set()

    writer = threading.Thread(target=feed_stdin, daemon=True)
    for reader in readers:
        reader.start()
    writer.start()

    deadline = time.monotonic() + timeout_seconds
    failure = None
    while process.poll() is None:
        if output_too_large.is_set():
            failure = "output_too_large"
            break
        remaining_time = deadline - time.monotonic()
        if remaining_time <= 0:
            failure = "timeout"
            break
        changed.wait(min(remaining_time, 0.05))
        changed.clear()

    if failure is not None:
        stop.set()
        _terminate_and_reap(process)
    else:
        process.wait()

    for reader in readers:
        reader.join(timeout=0.5)
    writer.join(timeout=0.5)
    if output_too_large.is_set():
        failure = "output_too_large"
    for stream in (process.stdin, process.stdout, process.stderr):
        try:
            stream.close()
        except OSError:
            pass
    return bytes(buffers["stdout"]), bytes(buffers["stderr"]), failure


def run_north_star_validator(
    root: Path,
    north_star_file: Path,
    north_star_bytes: bytes,
    *,
    validator: Path | None = None,
    node_binary: Path | str | None = None,
    timeout_seconds: float = NORTH_STAR_VALIDATOR_TIMEOUT_SECONDS,
    max_output_bytes: int = NORTH_STAR_VALIDATOR_MAX_OUTPUT_BYTES,
) -> dict[str, Any]:
    """Run the canonical JS validator; every bridge failure is typed and recoverable."""
    if validator is None:
        validator = find_north_star_validator(Path(__file__))
    if validator is None:
        return _validator_failure(
            "north_star_validator_missing",
            "Canonical North Star validator is unavailable in this managed layout.",
            north_star_file,
        )
    try:
        validator = Path(validator).resolve(strict=True)
    except (OSError, RuntimeError):
        return _validator_failure(
            "north_star_validator_missing",
            "Canonical North Star validator does not exist.",
            north_star_file,
        )
    if not validator.is_file():
        return _validator_failure(
            "north_star_validator_missing",
            "Canonical North Star validator is not a regular file.",
            north_star_file,
        )

    resolved_node = str(node_binary) if node_binary is not None else shutil.which("node")
    if not resolved_node:
        return _validator_failure(
            "north_star_validator_node_missing",
            "Node.js is unavailable, so accepted North Star publication cannot be verified.",
            north_star_file,
        )
    try:
        process = subprocess.Popen(
            [
                resolved_node,
                str(validator),
                "--stdin",
                "--path",
                str(north_star_file.absolute()),
            ],
            cwd=root,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            shell=False,
        )
    except OSError as error:
        return _validator_failure(
            "north_star_validator_execution_error",
            f"Canonical North Star validator could not execute: {error}",
            north_star_file,
        )

    stdout, _stderr, failure = _read_bounded_process_output(
        process,
        timeout_seconds,
        max_output_bytes,
        north_star_bytes,
    )
    if failure == "timeout":
        return _validator_failure(
            "north_star_validator_timeout",
            "Canonical North Star validation timed out; retry after checking Node.js and the installation.",
            north_star_file,
        )
    if failure == "output_too_large":
        return _validator_failure(
            "north_star_validator_output_too_large",
            "Canonical North Star validator exceeded its bounded output contract.",
            north_star_file,
        )
    try:
        output = stdout.decode("utf-8")
        report = json.loads(output)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return _validator_failure(
            "north_star_validator_invalid_json",
            "Canonical North Star validator returned invalid UTF-8 JSON.",
            north_star_file,
        )
    if (
        not isinstance(report, dict)
        or report.get("$schema") != "ultra-north-star-validation-v1"
        or not isinstance(report.get("valid"), bool)
        or not isinstance(report.get("diagnostics"), list)
        or not isinstance(report.get("sections"), dict)
        or process.returncode not in {0, 1}
        or (report["valid"] and process.returncode != 0)
        or (not report["valid"] and process.returncode != 1)
    ):
        return _validator_failure(
            "north_star_validator_invalid_report",
            "Canonical North Star validator returned an inconsistent report contract.",
            north_star_file,
        )
    expected_path = str(north_star_file.absolute())
    if report.get("path") != expected_path:
        return _validator_failure(
            "north_star_validator_path_mismatch",
            "Canonical North Star validator reported a different authority path.",
            north_star_file,
        )
    expected_digest = hashlib.sha256(north_star_bytes).hexdigest()
    receipt = report.get("input")
    if (
        not isinstance(receipt, dict)
        or receipt.get("path") != expected_path
        or receipt.get("byte_length") != len(north_star_bytes)
        or receipt.get("sha256") != expected_digest
    ):
        return _validator_failure(
            "north_star_validator_input_mismatch",
            "Canonical North Star validator did not bind its verdict to the supplied snapshot bytes.",
            north_star_file,
        )
    claims_accepted_publication = (
        report.get("valid") is True
        and (
            report.get("status") == "accepted"
            or report.get("classification") == "accepted"
        )
    )
    if claims_accepted_publication and not _accepted_report_is_mechanically_bound(
        report,
        north_star_bytes,
        expected_digest,
    ):
        return _validator_failure(
            "north_star_validator_invalid_report",
            "Canonical North Star validator returned an incomplete accepted-publication report.",
            north_star_file,
        )
    return report


def snapshot_section(
    snapshot: dict[str, Any] | None,
    validation: dict[str, Any],
    heading: str,
) -> str:
    """Slice one validator-identified section from the exact caller-owned bytes."""
    if snapshot is None:
        return ""
    sections = validation.get("sections")
    span = sections.get(heading) if isinstance(sections, dict) else None
    if not isinstance(span, dict):
        return ""
    start = span.get("body_start")
    end = span.get("body_end")
    data = snapshot["bytes"]
    if (
        not isinstance(start, int)
        or isinstance(start, bool)
        or not isinstance(end, int)
        or isinstance(end, bool)
        or start < 0
        or end < start
        or end > len(data)
    ):
        return ""
    try:
        return data[start:end].decode("utf-8").strip()
    except UnicodeDecodeError:
        return ""


def main() -> int:
    payload = read_payload()
    root = project_root(payload)  # Idle guard: no `.ultra/` means silent exit.
    if root is None:
        return 0
    ultra = root / ".ultra"
    north_star_file = ultra / "north-star.md"
    snapshot, snapshot_failure = read_north_star_snapshot(root, north_star_file)
    validation = (
        run_north_star_validator(root, north_star_file, snapshot["bytes"])
        if snapshot is not None
        else snapshot_failure
    )
    if validation is None:
        validation = _validator_failure(
            "north_star_snapshot_read_error",
            "Canonical North Star snapshot was unavailable.",
            north_star_file,
        )
    parts = []
    classification = validation.get("classification", "unknown")
    v2_sections = [
        (heading, snapshot_section(snapshot, validation, heading))
        for heading in (
            "Problem Reality",
            "First-Principle Propositions",
            "North Star Outcomes",
            "Hard Constraints",
        )
    ]
    accepted_publication = (
        validation.get("valid") is True
        and validation.get("kind") == "north-star-v2"
        and validation.get("status") == "accepted"
        and classification == "accepted"
        and all(body for _, body in v2_sections)
    )
    binding = validation.get("acceptance_binding")
    validated_input = validation.get("input")
    expected_digest = binding.get("content_sha256") if isinstance(binding, dict) else None
    current_digest = (
        snapshot["sha256"]
        if snapshot is not None
        else None
    )
    if accepted_publication and current_digest != expected_digest:
        accepted_publication = False
        validation = _validator_failure(
            "north_star_changed_during_validation",
            "North Star bytes changed after canonical validation; retry SessionStart.",
            north_star_file,
        )
    if accepted_publication:
        baseline = "\n\n".join(f"{heading}:\n{body}" for heading, body in v2_sections)
        baseline_bytes = len(baseline.encode("utf-8"))
        if baseline_bytes <= NORTH_STAR_SESSIONSTART_BYTE_CEILING:
            parts.append(f"Ultra accepted North Star v2:\n{baseline}")
        else:
            revision = validation.get("revision") or "unknown"
            status = validation.get("status") or "accepted"
            accepted_snapshot = binding["snapshot"]
            validated_sha256 = validated_input["sha256"]
            validated_byte_length = validated_input["byte_length"]
            parts.append(
                "Ultra accepted North Star v2 requires direct read:\n"
                "- Path: `.ultra/north-star.md`\n"
                f"- Immutable accepted snapshot: `{accepted_snapshot}`\n"
                f"- Revision: `{revision}`\n"
                f"- Status: `{status}`\n"
                f"- Validated North Star SHA-256: `{validated_sha256}`\n"
                f"- Validated North Star byte length: `{validated_byte_length}`\n"
                "- Read the immutable accepted snapshot and verify both values before "
                "using it. Do not treat different bytes as accepted authority.\n"
                f"- Reason: the complete selected canonical sections are {baseline_bytes} "
                f"UTF-8 bytes, exceeding the {NORTH_STAR_SESSIONSTART_BYTE_CEILING}-byte "
                "SessionStart ceiling; semantic truncation is forbidden."
            )
    else:
        diagnostics = validation.get("diagnostics")
        first_code = (
            diagnostics[0].get("code")
            if isinstance(diagnostics, list)
            and diagnostics
            and isinstance(diagnostics[0], dict)
            else None
        )
        if first_code and first_code.startswith("north_star_validator_"):
            parts.append(
                f"Ultra North Star validation is unavailable (`{first_code}`); accepted "
                "session authority was not published. Repair or retry the local validator; "
                "the project brief remains the recoverable fallback."
            )
        elif first_code in {"north_star_changed_during_validation", "north_star_snapshot_changed"}:
            parts.append(
                "Ultra North Star changed during validation; accepted session authority was "
                "not published. Retry SessionStart after writes settle."
            )
        elif classification == "accepted":
            parts.append(
                "Ultra North Star v2 publication binding is invalid; it is not accepted "
                "session authority. Repair `.ultra/north-star.md`, its owner decision, or "
                "its immutable accepted snapshot, then rerun Research validation."
            )
        elif validation.get("valid") is False and first_code:
            parts.append(
                f"Ultra North Star validation rejected the current artifact (`{first_code}`); "
                "accepted session authority was not published. Repair it through Research; "
                "the project brief remains the recoverable fallback."
            )
        direction = settled_section(snapshot_section(snapshot, validation, "Project Direction"))
        outcome = settled_section(snapshot_section(snapshot, validation, "North Star Outcome"))
        constraints = settled_section(snapshot_section(snapshot, validation, "Hard Constraints"))
        legacy_line = settled_section(snapshot_section(snapshot, validation, "One-line"))
        if validation.get("valid") is True and classification == "legacy" and direction and outcome and constraints:
            baseline = [f"Project Direction:\n{direction}"]
            baseline.append(f"North Star Outcome:\n{outcome}")
            baseline.append(f"Hard Constraints:\n{constraints}")
            baseline_text = "\n\n".join(baseline)
            parts.append(f"Ultra legacy v0.26 North Star:\n{baseline_text}")
        elif validation.get("valid") is True and classification == "legacy" and legacy_line:
            parts.append(f"Ultra legacy project intent:\n{legacy_line}")
        else:
            project_brief_file = ultra / "project-brief.md"
            brief_snapshot, brief_failure = read_project_brief_snapshot(
                root,
                project_brief_file,
            )
            project_brief, brief_failure = project_brief_text(
                brief_snapshot,
                brief_failure,
            )
            if brief_failure is not None:
                parts.append(project_brief_repair_note(brief_failure))
            else:
                brief_line = settled_section(markdown_section(project_brief, "One-line"))
                if brief_line:
                    parts.append(f"Ultra project brief (Research not yet accepted):\n{brief_line}")
    selection = current_task_selection(root)
    task = selection["task"]
    if task:
        sections = task_sections(root, task)
        acceptance = sections["acceptance"]
        if acceptance:
            parts.append(f"Current task {task.get('id')} acceptance:\n{acceptance}")
        resume = sections["resume"]
        if resume:
            parts.append(
                f"Current task {task.get('id')} resume note:\n{resume}\n\n"
                + RESUME_NAVIGATION_LIMITATION
            )
        diagnostics = render_task_diagnostics(sections["diagnostics"])
        if diagnostics:
            parts.append(f"Current task {task.get('id')} diagnostics:\n{diagnostics}")
    else:
        diagnostics = render_task_diagnostics(selection["diagnostics"])
        if diagnostics:
            parts.append(f"Task ledger diagnostics:\n{diagnostics}")
    emit_context("SessionStart", "\n\n".join(parts))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
