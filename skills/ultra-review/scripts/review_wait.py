#!/usr/bin/env python3
"""Wait for and validate Ultra review v2 artifacts.

Usage:
    python3 review_wait.py <session_path> agents <artifact-stem> [<artifact-stem> ...]
    python3 review_wait.py <session_path> summary

The agents mode validates the exact named JSON files. The summary mode validates the
two-axis verdict contract. Timeout and poll intervals can be shortened in tests with
UBP_REVIEW_WAIT_TIMEOUT and UBP_REVIEW_WAIT_POLL.
"""

import json
import os
import re
import sys
import time
from pathlib import Path

FINDINGS_SCHEMA = "ultra-review-findings-v2"
SUMMARY_SCHEMA = "ultra-review-summary-v2"
AXES = {"spec_fidelity", "engineering_standards"}
SEVERITIES = {"P0", "P1", "P2", "P3"}
AXIS_VERDICTS = {"PASS", "FAIL", "INCOMPLETE"}
OVERALL_VERDICTS = {"APPROVE", "REQUEST_CHANGES", "INCOMPLETE"}
REVIEW_MODES = {"task", "change", "plan"}
SELECTION_STATUSES = {"selected", "skipped"}
ARTIFACT_STEM = re.compile(r"^[a-z][a-z0-9-]*$")
FINDING_FIELDS = {
    "id", "axis", "severity", "category", "title", "file", "line", "trigger",
    "impact", "evidence", "suggestion",
}


def env_seconds(name: str, default: float) -> float:
    try:
        value = float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


DEFAULT_TIMEOUT = env_seconds("UBP_REVIEW_WAIT_TIMEOUT", 300.0)
POLL_INTERVAL = env_seconds("UBP_REVIEW_WAIT_POLL", 2.0)


def read_json(path: Path):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        return None, f"unreadable JSON: {error}"
    if not isinstance(data, dict):
        return None, "top-level value must be an object"
    return data, None


def nonempty_string(value) -> bool:
    return isinstance(value, str) and bool(value.strip())


def validate_finding(finding, artifact_axis: str, seen_ids):
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
    if not isinstance(finding.get("line"), int) or finding["line"] < 1:
        return "finding line must be a positive integer"
    line_end = finding.get("line_end")
    if line_end is not None and (not isinstance(line_end, int) or line_end < finding["line"]):
        return "finding line_end must be at or after line"
    return None


def validate_specialist(data):
    if data.get("$schema") != FINDINGS_SCHEMA:
        return f"$schema must be {FINDINGS_SCHEMA}"
    if not nonempty_string(data.get("agent")):
        return "agent must be a non-empty string"
    axis = data.get("axis")
    if axis not in AXES:
        return "axis must be spec_fidelity or engineering_standards"
    for field in ["session", "timestamp"]:
        if not nonempty_string(data.get(field)):
            return f"{field} must be a non-empty string"
    scope = data.get("scope")
    if not isinstance(scope, dict):
        return "scope must be an object"
    for field in ["head", "range"]:
        if not nonempty_string(scope.get(field)):
            return f"scope.{field} must be a non-empty string"
    if not isinstance(scope.get("files_analyzed"), list) or not all(
        nonempty_string(item) for item in scope["files_analyzed"]
    ):
        return "scope.files_analyzed must be a string array"
    if not isinstance(scope.get("diff_only"), bool):
        return "scope.diff_only must be boolean"
    if data.get("status") != "complete":
        return "status must be complete"
    findings = data.get("findings")
    if not isinstance(findings, list):
        return "findings must be an array"
    seen_ids = set()
    for finding in findings:
        error = validate_finding(finding, axis, seen_ids)
        if error:
            return error
    for field in ["positive_observations", "limitations"]:
        if not isinstance(data.get(field), list):
            return f"{field} must be an array"
    return None


def evaluate_artifacts(session_path: Path, expected):
    done = []
    missing = []
    invalid = []
    errors = {}
    for stem in expected:
        path = session_path / f"{stem}.json"
        if not path.exists():
            missing.append(stem)
            continue
        data, error = read_json(path)
        if error is None:
            error = validate_specialist(data)
        if error:
            invalid.append(stem)
            errors[stem] = error
        else:
            done.append(stem)
    return done, missing, invalid, errors


def wait_for_agents(session_path: Path, expected, timeout: float) -> bool:
    deadline = time.monotonic() + timeout
    while True:
        done, missing, invalid, errors = evaluate_artifacts(session_path, expected)
        if len(done) == len(expected):
            print(json.dumps({
                "status": "complete",
                "artifacts_done": done,
                "artifacts_missing": [],
                "artifacts_invalid": [],
                "errors": {},
                "count": len(done),
            }, sort_keys=True))
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


def validate_summary(data):
    if data.get("$schema") != SUMMARY_SCHEMA:
        return f"$schema must be {SUMMARY_SCHEMA}"
    if data.get("mode") not in REVIEW_MODES:
        return "mode must be task, change, or plan"
    for field in ["session", "change_id", "head", "context_digest"]:
        if not nonempty_string(data.get(field)):
            return f"{field} must be a non-empty string"
    if data.get("worktree_digest") is not None and not nonempty_string(data.get("worktree_digest")):
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
        if not isinstance(refs, list) or not refs or not all(nonempty_string(ref) for ref in refs):
            return f"{axis}.evidence_refs must be a non-empty string array"
    workers = data.get("workers")
    if not isinstance(workers, dict):
        return "workers must be an object"
    for field in ["completed", "failed", "skipped"]:
        values = workers.get(field)
        if not isinstance(values, list) or not all(nonempty_string(item) for item in values):
            return f"workers.{field} must be a string array"
        if len(values) != len(set(values)):
            return f"workers.{field} must not contain duplicates"
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
    if selected != set(workers["completed"]) | set(workers["failed"]):
        return "selected workers must equal completed and failed workers"
    if skipped != set(workers["skipped"]):
        return "skipped worker selection must match workers.skipped"
    if "review-spec" not in selected or "review-spec" not in set(workers["completed"]):
        return "review-spec must be selected and completed"
    findings = data.get("findings")
    if not isinstance(findings, list):
        return "findings must be an array"
    seen_ids = set()
    for finding in findings:
        axis = finding.get("axis") if isinstance(finding, dict) else None
        if axis not in AXES:
            return "summary finding has invalid axis"
        error = validate_finding(finding, axis, seen_ids)
        if error:
            return error
    for field in ["positive_observations", "limitations"]:
        if not isinstance(data.get(field), list):
            return f"{field} must be an array"
    expected = expected_overall_verdict(data)
    if data["verdict"] != expected:
        return f"verdict {data['verdict']} conflicts with evidence; expected {expected}"
    return None


def wait_for_summary(session_path: Path, timeout: float) -> bool:
    summary_path = session_path / "SUMMARY.json"
    deadline = time.monotonic() + timeout
    last_error = "SUMMARY.json is missing"
    while True:
        if summary_path.exists():
            data, error = read_json(summary_path)
            if error is None:
                error = validate_summary(data)
            if error is None:
                counts = {severity: 0 for severity in sorted(SEVERITIES)}
                for finding in data["findings"]:
                    counts[finding["severity"]] += 1
                print(
                    f"Review complete: {data['verdict']} "
                    f"(P0:{counts['P0']} P1:{counts['P1']} P2:{counts['P2']} "
                    f"P3:{counts['P3']} total:{len(data['findings'])})"
                )
                return True
            last_error = error
        if time.monotonic() >= deadline:
            print(json.dumps({"status": "incomplete", "error": last_error}, sort_keys=True))
            return False
        time.sleep(min(POLL_INTERVAL, max(0.0, deadline - time.monotonic())))


def main():
    if len(sys.argv) < 3:
        print(__doc__, file=sys.stderr)
        sys.exit(2)

    session_path = Path(sys.argv[1])
    mode = sys.argv[2]
    if not session_path.is_dir():
        print(f"Error: session directory not found: {session_path}", file=sys.stderr)
        sys.exit(2)

    if mode == "agents":
        expected = sys.argv[3:]
        if not expected or len(expected) != len(set(expected)) or not all(
            ARTIFACT_STEM.fullmatch(stem) for stem in expected
        ):
            print("Error: agents mode requires unique safe artifact stems", file=sys.stderr)
            sys.exit(2)
        ok = wait_for_agents(session_path, expected, DEFAULT_TIMEOUT)
    elif mode == "summary":
        if len(sys.argv) != 3:
            print("Error: summary mode accepts no additional arguments", file=sys.stderr)
            sys.exit(2)
        ok = wait_for_summary(session_path, DEFAULT_TIMEOUT)
    else:
        print(f"Error: unknown mode '{mode}'. Use 'agents' or 'summary'.", file=sys.stderr)
        sys.exit(2)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
