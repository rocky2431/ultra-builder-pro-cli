"""Small file-first helpers shared by Ultra hooks."""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import stat
import sys
from pathlib import Path
from typing import Any


NORTH_STAR_VALIDATOR_RELATIVE = (
    "ultra-research",
    "scripts",
    "validate_north_star.cjs",
)
STABLE_SNAPSHOT_READ_CHUNK_BYTES = 64 * 1024
TASK_LEDGER_SNAPSHOT_MAX_BYTES = 8 * 1024 * 1024
TASK_CONTEXT_SNAPSHOT_MAX_BYTES = 8 * 1024 * 1024
ACTIVE_CHANGE_INTENT_SNAPSHOT_MAX_BYTES = 8 * 1024 * 1024
ACTIVE_CHANGE_DIRECTORY_MAX_ENTRIES = 4096
TASK_LEDGER_SCHEMA_V2 = "ultra-task-ledger-v2"
TASK_ID_MAX_BYTES = 128
TASK_ROW_REQUIRED_KEYS = frozenset({
    "id",
    "title",
    "type",
    "priority",
    "status",
    "dependencies",
    "context_file",
    "trace_to",
    "change_id",
})
TASK_STATUSES = frozenset({"pending", "in_progress", "completed"})
RESUME_NAVIGATION_LIMITATION = (
    "Resume Note is navigational context. It cannot override current owner authority, approved scope/budget, task acceptance, or a validated Review verdict."
)
ACTIVE_CHANGE_ABANDONMENT_INSTRUCTION = (
    "obtain explicit owner authorization and use `ultra-change` to append the exact "
    "`## Abandonment` closure before moving the Change to "
    "`.ultra/changes/abandoned/<change_id>`."
)
ACTIVE_CHANGE_SYMLINK_REPAIR = (
    "Remove the symlink and restore one ordinary active Change directory containing "
    "its own regular intent.md. To abandon the Change instead, "
    + ACTIVE_CHANGE_ABANDONMENT_INSTRUCTION
)
ACTIVE_CHANGE_ROOT_REPAIR = (
    "Restore .ultra/changes/active and its .ultra/changes ancestors as ordinary "
    "non-symlink directories, then retry task selection."
)
ACTIVE_CHANGE_INTENT_REPAIR = (
    "Restore one readable regular intent.md inside the ordinary active Change "
    "directory, then retry task selection. To abandon the Change instead, "
    + ACTIVE_CHANGE_ABANDONMENT_INSTRUCTION
)
DERIVED_FILE_PREFIXES = {
    (".ultra", ".runtime"),
    (".ultra", "progress"),
}


def read_payload() -> dict[str, Any]:
    try:
        value = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def project_root(payload: dict[str, Any]) -> Path | None:
    candidate = payload.get("cwd") or payload.get("workspace_root") or os.getcwd()
    path = Path(str(candidate)).resolve()
    if path.is_file():
        path = path.parent
    for current in (path, *path.parents):
        if (current / ".ultra").is_dir():
            return current
    return None


def _path_is_within(file: Path, directory: Path) -> bool:
    try:
        file.relative_to(directory)
        return True
    except ValueError:
        return False


def find_north_star_validator(hook_file: Path) -> Path | None:
    """Resolve only the source/nested-plugin or OpenCode managed skill layouts."""
    try:
        hook_path = hook_file.resolve(strict=True)
    except (OSError, RuntimeError):
        return None
    hook_root = hook_path.parent
    skill_roots = [hook_root.parent / "skills"]
    if hook_root.parent.name == ".ultra-builder-pro":
        # OpenCode keeps hooks in its bundle while managed Skills live one parent up.
        skill_roots.append(hook_root.parent.parent / "skills")
    for skill_root in skill_roots:
        candidate = skill_root.joinpath(*NORTH_STAR_VALIDATOR_RELATIVE)
        try:
            skill_root_real = skill_root.resolve(strict=True)
            candidate_real = candidate.resolve(strict=True)
        except (OSError, RuntimeError):
            continue
        expected = skill_root_real.joinpath(*NORTH_STAR_VALIDATOR_RELATIVE)
        if (
            candidate_real == expected
            and _path_is_within(candidate_real, skill_root_real)
            and candidate_real.is_file()
        ):
            return candidate_real
    return None


class _SnapshotInvariantError(Exception):
    def __init__(self, kind: str):
        super().__init__(kind)
        self.kind = kind


def _directory_identity(value: os.stat_result) -> tuple[int, int, int]:
    return value.st_dev, value.st_ino, stat.S_IFMT(value.st_mode)


def _file_identity(value: os.stat_result) -> tuple[int, int, int, int, int, int]:
    return (
        value.st_dev,
        value.st_ino,
        value.st_mode,
        value.st_size,
        value.st_mtime_ns,
        value.st_ctime_ns,
    )


def _open_stable_directory_chain(
    root: Path,
    components: tuple[str, ...],
    flags: int,
) -> tuple[list[int], list[tuple[int, int, int]]]:
    descriptors: list[int] = []
    identities: list[tuple[int, int, int]] = []
    try:
        path_stat = os.stat(root, follow_symlinks=False)
        if stat.S_ISLNK(path_stat.st_mode):
            raise _SnapshotInvariantError("symlink")
        if not stat.S_ISDIR(path_stat.st_mode):
            raise _SnapshotInvariantError("not_regular")
        descriptor = os.open(root, flags)
        descriptors.append(descriptor)
        descriptor_stat = os.fstat(descriptor)
        if _directory_identity(path_stat) != _directory_identity(descriptor_stat):
            raise _SnapshotInvariantError("changed")
        identities.append(_directory_identity(descriptor_stat))

        for component in components:
            path_stat = os.stat(component, dir_fd=descriptor, follow_symlinks=False)
            if stat.S_ISLNK(path_stat.st_mode):
                raise _SnapshotInvariantError("symlink")
            if not stat.S_ISDIR(path_stat.st_mode):
                raise _SnapshotInvariantError("not_regular")
            descriptor = os.open(component, flags, dir_fd=descriptor)
            descriptors.append(descriptor)
            descriptor_stat = os.fstat(descriptor)
            if _directory_identity(path_stat) != _directory_identity(descriptor_stat):
                raise _SnapshotInvariantError("changed")
            identities.append(_directory_identity(descriptor_stat))
        return descriptors, identities
    except Exception:
        for descriptor in reversed(descriptors):
            os.close(descriptor)
        raise


def _directory_entries_snapshot(
    descriptor: int,
    *,
    max_entries: int,
) -> list[dict[str, Any]]:
    entries = []
    with os.scandir(descriptor) as iterator:
        directory_entries = []
        for entry in iterator:
            if len(directory_entries) == max_entries:
                raise _SnapshotInvariantError("oversize")
            directory_entries.append(entry)
        for entry in directory_entries:
            observed = entry.stat(follow_symlinks=False)
            entries.append({
                "name": entry.name,
                "identity": _file_identity(observed),
                "mode": observed.st_mode,
            })
    return sorted(entries, key=lambda entry: entry["name"])


def read_stable_project_directory_snapshot(
    root: Path,
    relative_directory: Path | str,
    *,
    max_entries: int,
    code_prefix: str,
    label: str,
) -> tuple[list[dict[str, Any]] | None, dict[str, str] | None]:
    """Observe one bounded ordinary directory through two no-symlink dirfd walks."""
    relative = Path(relative_directory)
    canonical = root.absolute() / relative

    def failure(kind: str, message: str | None = None):
        messages = {
            "missing": f"{label} is missing.",
            "symlink": f"{label} and its ancestors must not be symlinks.",
            "not_regular": f"{label} and its ancestors must be ordinary directories.",
            "oversize": f"{label} exceeds the {max_entries}-entry snapshot limit.",
            "changed": f"{label} changed during its stable directory snapshot; retry.",
            "read_error": f"{label} could not be scanned as a stable ordinary directory.",
        }
        return None, {
            "code": f"{code_prefix}_{kind}",
            "message": message or messages[kind],
            "path": str(canonical),
        }

    if (
        relative.is_absolute()
        or not relative.parts
        or any(part in {"", ".", ".."} for part in relative.parts)
    ):
        return failure(
            "read_error",
            f"{label} must be a normalized repository-relative path.",
        )
    try:
        root_real = root.resolve(strict=True)
    except (OSError, RuntimeError) as error:
        return failure("read_error", f"{label} repository root is unavailable: {error}")
    canonical = root_real.joinpath(*relative.parts)
    directory_flags = (
        os.O_RDONLY
        | getattr(os, "O_DIRECTORY", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )
    all_descriptors: list[int] = []
    snapshot_started = False
    fresh_rewalk_started = False
    try:
        initial_descriptors, initial_identities = _open_stable_directory_chain(
            root_real,
            relative.parts,
            directory_flags,
        )
        all_descriptors.extend(initial_descriptors)
        snapshot_started = True
        entries = _directory_entries_snapshot(
            initial_descriptors[-1],
            max_entries=max_entries,
        )

        fresh_rewalk_started = True
        fresh_descriptors, fresh_identities = _open_stable_directory_chain(
            root_real,
            relative.parts,
            directory_flags,
        )
        all_descriptors.extend(fresh_descriptors)
        if fresh_identities != initial_identities:
            raise _SnapshotInvariantError("changed")
        fresh_entries = _directory_entries_snapshot(
            fresh_descriptors[-1],
            max_entries=max_entries,
        )
        if fresh_entries != entries:
            raise _SnapshotInvariantError("changed")
        return entries, None
    except FileNotFoundError:
        return failure("changed" if snapshot_started else "missing")
    except _SnapshotInvariantError as error:
        return failure("changed" if fresh_rewalk_started else error.kind)
    except OSError as error:
        if fresh_rewalk_started:
            return failure("changed")
        return failure(
            "read_error",
            f"{label} could not be scanned as a stable ordinary directory: {error}",
        )
    finally:
        for descriptor in reversed(all_descriptors):
            os.close(descriptor)


def read_stable_project_file_snapshot(
    root: Path,
    relative_file: Path | str,
    *,
    max_bytes: int,
    code_prefix: str,
    label: str,
) -> tuple[dict[str, Any] | None, dict[str, str] | None]:
    """Read one bounded regular file and verify a fresh canonical-root rewalk."""
    relative = Path(relative_file)
    canonical = root.absolute() / relative

    def failure(kind: str, message: str | None = None):
        messages = {
            "missing": f"{label} is missing.",
            "symlink": f"{label} path components and file must not be symlinks.",
            "not_regular": f"{label} must be a regular file beneath ordinary directories.",
            "oversize": f"{label} exceeds the {max_bytes}-byte snapshot limit.",
            "changed": f"{label} or its canonical path changed; retry SessionStart.",
            "read_error": f"{label} could not be read as a stable regular file.",
        }
        return None, {
            "code": f"{code_prefix}_{kind}",
            "message": message or messages[kind],
            "path": str(canonical),
        }

    if (
        relative.is_absolute()
        or not relative.parts
        or any(part in {"", ".", ".."} for part in relative.parts)
    ):
        return failure(
            "read_error",
            f"{label} must be a normalized repository-relative path.",
        )
    try:
        root_real = root.resolve(strict=True)
    except (OSError, RuntimeError) as error:
        return failure("read_error", f"{label} repository root is unavailable: {error}")
    canonical = root_real.joinpath(*relative.parts)
    directory_parts = relative.parts[:-1]
    file_name = relative.parts[-1]
    directory_flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)
    file_flags = os.O_RDONLY | getattr(os, "O_NONBLOCK", 0) | getattr(os, "O_NOFOLLOW", 0)
    all_descriptors: list[int] = []
    snapshot_started = False
    fresh_rewalk_started = False

    try:
        initial_descriptors, initial_directory_identities = _open_stable_directory_chain(
            root_real,
            directory_parts,
            directory_flags,
        )
        all_descriptors.extend(initial_descriptors)
        parent_descriptor = initial_descriptors[-1]
        before_path = os.stat(file_name, dir_fd=parent_descriptor, follow_symlinks=False)
        if stat.S_ISLNK(before_path.st_mode):
            raise _SnapshotInvariantError("symlink")
        if not stat.S_ISREG(before_path.st_mode):
            raise _SnapshotInvariantError("not_regular")
        if before_path.st_size > max_bytes:
            raise _SnapshotInvariantError("oversize")

        file_descriptor = os.open(file_name, file_flags, dir_fd=parent_descriptor)
        all_descriptors.append(file_descriptor)
        before_fd = os.fstat(file_descriptor)
        if not stat.S_ISREG(before_fd.st_mode):
            raise _SnapshotInvariantError("not_regular")
        if _file_identity(before_path) != _file_identity(before_fd):
            raise _SnapshotInvariantError("changed")
        snapshot_started = True

        chunks: list[bytes] = []
        observed = 0
        while True:
            chunk = os.read(
                file_descriptor,
                min(STABLE_SNAPSHOT_READ_CHUNK_BYTES, max_bytes + 1 - observed),
            )
            if not chunk:
                break
            chunks.append(chunk)
            observed += len(chunk)
            if observed > max_bytes:
                raise _SnapshotInvariantError("oversize")

        after_fd = os.fstat(file_descriptor)
        after_path = os.stat(file_name, dir_fd=parent_descriptor, follow_symlinks=False)
        if not (
            _file_identity(before_fd)
            == _file_identity(after_fd)
            == _file_identity(after_path)
        ):
            raise _SnapshotInvariantError("changed")
        for index, component in enumerate(directory_parts):
            path_identity = _directory_identity(os.stat(
                component,
                dir_fd=initial_descriptors[index],
                follow_symlinks=False,
            ))
            descriptor_identity = _directory_identity(os.fstat(initial_descriptors[index + 1]))
            if not path_identity == descriptor_identity == initial_directory_identities[index + 1]:
                raise _SnapshotInvariantError("changed")

        fresh_rewalk_started = True
        fresh_descriptors, fresh_directory_identities = _open_stable_directory_chain(
            root_real,
            directory_parts,
            directory_flags,
        )
        all_descriptors.extend(fresh_descriptors)
        if fresh_directory_identities != initial_directory_identities:
            raise _SnapshotInvariantError("changed")
        fresh_parent_descriptor = fresh_descriptors[-1]
        fresh_path = os.stat(file_name, dir_fd=fresh_parent_descriptor, follow_symlinks=False)
        if not stat.S_ISREG(fresh_path.st_mode):
            raise _SnapshotInvariantError("changed")
        fresh_file_descriptor = os.open(file_name, file_flags, dir_fd=fresh_parent_descriptor)
        all_descriptors.append(fresh_file_descriptor)
        fresh_fd = os.fstat(fresh_file_descriptor)
        if not (
            stat.S_ISREG(fresh_fd.st_mode)
            and _file_identity(fresh_path)
            == _file_identity(fresh_fd)
            == _file_identity(after_fd)
        ):
            raise _SnapshotInvariantError("changed")

        data = b"".join(chunks)
        if len(data) != after_fd.st_size:
            raise _SnapshotInvariantError("changed")
        return {
            "bytes": data,
            "byte_length": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            "path": str(canonical),
        }, None
    except FileNotFoundError:
        return failure("changed" if snapshot_started else "missing")
    except _SnapshotInvariantError as error:
        return failure("changed" if fresh_rewalk_started else error.kind)
    except OSError as error:
        if fresh_rewalk_started:
            return failure("changed")
        return failure("read_error", f"{label} could not be read as a stable regular file: {error}")
    finally:
        for descriptor in reversed(all_descriptors):
            os.close(descriptor)


def markdown_section(text: str, heading: str) -> str:
    pattern = re.compile(
        rf"^##\s+{re.escape(heading)}\s*$\n(?P<body>.*?)(?=^##\s+|\Z)",
        re.MULTILINE | re.DOTALL | re.IGNORECASE,
    )
    match = pattern.search(text)
    return match.group("body").strip() if match else ""


def _validate_task_row(
    row: Any,
    index: int,
    classification: str,
    ledger_path: str,
) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    if not isinstance(row, dict):
        return None, [{
            "code": "task_ledger_row_invalid",
            "message": f"Task ledger row {index} must be a JSON object.",
            "path": ledger_path,
            "row_index": index,
            "problems": ["row_not_object"],
            "repair": (
                f"Repair task ledger row {index} by resolving these exact problems: "
                "row_not_object; then retry task selection."
            ),
        }]

    keys = set(row)
    legacy_root = classification in {"legacy_object", "legacy_array"}
    uses_change_ref = legacy_root and "change_id" not in keys and "change_ref" in keys
    required = set(TASK_ROW_REQUIRED_KEYS)
    if uses_change_ref:
        required.remove("change_id")
        required.add("change_ref")
    optional = {"complexity"}
    if legacy_root:
        optional.add("change_ref")
    problems = []
    missing = sorted(required - keys)
    unknown = sorted(keys - required - optional)
    if missing:
        problems.append(f"missing_keys:{','.join(missing)}")
    if unknown:
        problems.append(f"unknown_keys:{','.join(unknown)}")

    task_id = row.get("id")
    if normalized_task_id(task_id) is None:
        problems.append("invalid_id")
    for field in ("title", "type", "priority"):
        value = row.get(field)
        if not isinstance(value, str) or not value or value.strip() != value:
            problems.append(f"invalid_{field}")
    if row.get("status") not in TASK_STATUSES:
        problems.append("invalid_status")

    dependencies = row.get("dependencies")
    if not isinstance(dependencies, list):
        problems.append("invalid_dependencies_type")
    elif any(normalized_task_id(dependency) is None for dependency in dependencies):
        problems.append("invalid_dependency_id")

    context_value = row.get("context_file")
    context_relative = (
        project_relative_path(context_value, ultra_default=True)
        if isinstance(context_value, str)
        else None
    )
    expected_context = (
        Path(".ultra") / "contexts" / f"task-{task_id}.md"
        if normalized_task_id(task_id) is not None
        else None
    )
    if context_relative is None or context_relative != expected_context:
        problems.append("invalid_context_file")

    trace = row.get("trace_to")
    if not isinstance(trace, str) or trace.count("#") != 1:
        problems.append("invalid_trace_to")
    else:
        trace_path, anchor = trace.split("#", 1)
        if (
            project_relative_path(trace_path, ultra_default=True) is None
            or re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", anchor) is None
        ):
            problems.append("invalid_trace_to")

    if "change_id" in row and normalized_task_id(row.get("change_id")) is None:
        problems.append("invalid_change_id")
    if "change_ref" in row and legacy_task_change_id(row) is None:
        problems.append("invalid_change_ref")
    if "complexity" in row and (
        not isinstance(row.get("complexity"), int)
        or isinstance(row.get("complexity"), bool)
    ):
        problems.append("invalid_legacy_complexity")

    if problems:
        return None, [{
            "code": "task_ledger_row_invalid",
            "message": (
                f"Task ledger row {index} has an invalid mechanical shape; repair the "
                "row before task selection."
            ),
            "path": ledger_path,
            "row_index": index,
            "task_id": task_id if isinstance(task_id, str) else None,
            "problems": problems,
            "repair": (
                f"Repair task ledger row {index} by resolving these exact problems: "
                f"{', '.join(problems)}; then retry task selection."
            ),
        }]

    diagnostics = []
    if "complexity" in row:
        diagnostics.append({
            "code": "legacy_task_complexity",
            "message": (
                f"Task `{task_id}` contains legacy `complexity`; it remains readable but "
                "does not choose task scope, quality, duration, or completion."
            ),
            "path": ledger_path,
            "row_index": index,
            "task_id": task_id,
            "observed_complexity": row["complexity"],
        })
    if "change_ref" in row:
        diagnostics.append({
            "code": "legacy_task_change_ref",
            "message": (
                f"Task `{task_id}` contains legacy `change_ref`; a present `change_id` "
                "wins, otherwise the active-path reference is compatibility-only."
            ),
            "path": ledger_path,
            "row_index": index,
            "task_id": task_id,
        })
    return row, diagnostics


def _task_graph_change_id(task: dict[str, Any]) -> str | None:
    value = task.get("change_id")
    if isinstance(value, str):
        return value
    return legacy_task_change_id(task)


def _canonical_dependency_cycle(nodes: list[str]) -> tuple[str, ...]:
    first = min(range(len(nodes)), key=nodes.__getitem__)
    canonical = tuple(nodes[first:] + nodes[:first])
    return (*canonical, canonical[0])


def _validate_task_graph(
    tasks: list[dict[str, Any]],
    ledger_path: str,
) -> list[dict[str, Any]]:
    """Validate exact task identity and dependency edges without judging task meaning."""
    diagnostics: list[dict[str, Any]] = []
    indexes_by_id: dict[str, list[int]] = {}
    for index, task in enumerate(tasks):
        task_id = task["id"]
        indexes_by_id.setdefault(task_id, []).append(index)

    for task_id, row_indexes in indexes_by_id.items():
        if len(row_indexes) > 1:
            diagnostics.append({
                "code": "task_ledger_duplicate_id",
                "message": (
                    f"Task id `{task_id}` appears in rows "
                    f"{', '.join(str(index) for index in row_indexes)}; global task "
                    "identity and Status are ambiguous."
                ),
                "path": ledger_path,
                "task_id": task_id,
                "row_indexes": row_indexes,
                "repair": (
                    f"Keep exactly one row for task id `{task_id}`; reconcile its status "
                    "and history, then retry task selection."
                ),
            })

    unique_tasks = {
        task_id: tasks[row_indexes[0]]
        for task_id, row_indexes in indexes_by_id.items()
        if len(row_indexes) == 1
    }
    graph: dict[str, list[str]] = {task_id: [] for task_id in unique_tasks}
    for row_index, task in enumerate(tasks):
        task_id = task["id"]
        dependencies = task["dependencies"]
        dependency_indexes: dict[str, list[int]] = {}
        for dependency_index, dependency_id in enumerate(dependencies):
            dependency_indexes.setdefault(dependency_id, []).append(dependency_index)
        for dependency_id, positions in dependency_indexes.items():
            if len(positions) > 1:
                diagnostics.append({
                    "code": "task_ledger_duplicate_dependency",
                    "message": (
                        f"Task `{task_id}` repeats dependency `{dependency_id}` at "
                        f"positions {', '.join(str(position) for position in positions)}."
                    ),
                    "path": ledger_path,
                    "row_index": row_index,
                    "task_id": task_id,
                    "dependency_id": dependency_id,
                    "dependency_indexes": positions,
                    "repair": f"Keep dependency `{dependency_id}` once in task `{task_id}`.",
                })

        if task_id not in unique_tasks:
            continue
        task_change_id = _task_graph_change_id(task)
        for dependency_id in dependency_indexes:
            if dependency_id == task_id:
                diagnostics.append({
                    "code": "task_ledger_dependency_self",
                    "message": f"Task `{task_id}` depends on itself.",
                    "path": ledger_path,
                    "row_index": row_index,
                    "task_id": task_id,
                    "dependency_id": dependency_id,
                    "repair": f"Remove self-dependency `{dependency_id}` from task `{task_id}`.",
                })
                continue
            dependency_rows = indexes_by_id.get(dependency_id)
            if dependency_rows is None:
                diagnostics.append({
                    "code": "task_ledger_dependency_missing",
                    "message": (
                        f"Task `{task_id}` depends on missing task `{dependency_id}` in "
                        f"Change `{task_change_id}`."
                    ),
                    "path": ledger_path,
                    "row_index": row_index,
                    "task_id": task_id,
                    "change_id": task_change_id,
                    "dependency_id": dependency_id,
                    "repair": (
                        f"Add the missing task row `{dependency_id}` to Change "
                        f"`{task_change_id}`, or remove the stale dependency from task "
                        f"`{task_id}`."
                    ),
                })
                continue
            if len(dependency_rows) != 1:
                continue
            dependency = unique_tasks[dependency_id]
            dependency_change_id = _task_graph_change_id(dependency)
            if dependency_change_id != task_change_id:
                diagnostics.append({
                    "code": "task_ledger_dependency_cross_change",
                    "message": (
                        f"Task `{task_id}` in Change `{task_change_id}` depends on task "
                        f"`{dependency_id}` in Change `{dependency_change_id}`."
                    ),
                    "path": ledger_path,
                    "row_index": row_index,
                    "task_id": task_id,
                    "change_id": task_change_id,
                    "dependency_id": dependency_id,
                    "dependency_change_id": dependency_change_id,
                    "repair": (
                        f"Move dependency `{dependency_id}` into Change `{task_change_id}`, "
                        f"or remove that cross-Change edge from task `{task_id}`."
                    ),
                })
                continue
            graph[task_id].append(dependency_id)

    state = {task_id: 0 for task_id in graph}
    cycles: set[tuple[str, ...]] = set()

    for task_id in graph:
        if state[task_id] != 0:
            continue
        state[task_id] = 1
        path = [task_id]
        path_indexes = {task_id: 0}
        frames = [(task_id, 0)]
        while frames:
            current, dependency_index = frames[-1]
            dependencies = graph[current]
            if dependency_index >= len(dependencies):
                frames.pop()
                path.pop()
                path_indexes.pop(current)
                state[current] = 2
                continue
            dependency_id = dependencies[dependency_index]
            frames[-1] = (current, dependency_index + 1)
            if state[dependency_id] == 0:
                state[dependency_id] = 1
                path_indexes[dependency_id] = len(path)
                path.append(dependency_id)
                frames.append((dependency_id, 0))
            elif state[dependency_id] == 1:
                cycle_nodes = path[path_indexes[dependency_id]:]
                cycles.add(_canonical_dependency_cycle(cycle_nodes))

    for cycle in sorted(cycles):
        chain = " -> ".join(cycle)
        diagnostics.append({
            "code": "task_ledger_dependency_cycle",
            "message": f"Task dependency cycle detected: `{chain}`.",
            "path": ledger_path,
            "task_ids": list(cycle),
            "repair": (
                f"Break the dependency cycle `{chain}` by removing at least one stale edge."
            ),
        })
    return diagnostics


def _task_ledger_snapshot_repair(code: str) -> str:
    if code == "task_ledger_snapshot_missing":
        return (
            "Restore `.ultra/tasks.json` as an ordinary regular file containing the "
            "canonical task ledger, then retry task selection."
        )
    if code == "task_ledger_snapshot_symlink":
        return (
            "Remove the symlink and restore `.ultra/tasks.json` as an ordinary "
            "non-symlink regular file inside the repository, then retry task selection."
        )
    if code == "task_ledger_snapshot_not_regular":
        return (
            "Replace `.ultra/tasks.json` with an ordinary non-symlink regular file "
            "containing the canonical task ledger, then retry task selection."
        )
    if code == "task_ledger_snapshot_oversize":
        return (
            f"Reduce `.ultra/tasks.json` below the {TASK_LEDGER_SNAPSHOT_MAX_BYTES}-byte "
            "snapshot ceiling without discarding task history, then retry task selection."
        )
    if code == "task_ledger_snapshot_changed":
        return (
            "Retry task selection after `.ultra/tasks.json` writes settle; if instability "
            "persists, restore one ordinary regular ledger file."
        )
    return (
        "Repair read access to `.ultra/tasks.json` as one stable ordinary regular file "
        "inside the repository, then retry task selection."
    )


def read_task_ledger(root: Path) -> dict[str, Any]:
    """Read and classify the bounded canonical ledger without judging task meaning."""
    snapshot, failure = read_stable_project_file_snapshot(
        root,
        Path(".ultra/tasks.json"),
        max_bytes=TASK_LEDGER_SNAPSHOT_MAX_BYTES,
        code_prefix="task_ledger_snapshot",
        label="Canonical task ledger",
    )
    if snapshot is None:
        diagnostics = []
        if failure is not None:
            diagnostic = dict(failure)
            diagnostic["repair"] = _task_ledger_snapshot_repair(diagnostic["code"])
            diagnostics.append(diagnostic)
        return {
            "classification": "unavailable",
            "tasks": [],
            "diagnostics": diagnostics,
        }
    try:
        text = snapshot["bytes"].decode("utf-8")
    except UnicodeDecodeError:
        return {
            "classification": "invalid",
            "tasks": [],
            "diagnostics": [{
                "code": "task_ledger_invalid_utf8",
                "message": "Canonical task ledger must be valid UTF-8 JSON.",
                "path": snapshot["path"],
                "repair": (
                    "Rewrite `.ultra/tasks.json` as valid UTF-8 without changing task "
                    "status or history, then retry task selection."
                ),
            }],
        }
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return {
            "classification": "invalid",
            "tasks": [],
            "diagnostics": [{
                "code": "task_ledger_invalid_json",
                "message": "Canonical task ledger must contain valid JSON.",
                "path": snapshot["path"],
                "repair": (
                    "Repair `.ultra/tasks.json` as valid JSON without changing task status "
                    "or history, then retry task selection."
                ),
            }],
        }

    classification = "invalid"
    tasks: Any = None
    if isinstance(value, dict) and value.get("$schema") == TASK_LEDGER_SCHEMA_V2:
        if set(value) == {"$schema", "tasks"}:
            classification = "v2"
            tasks = value.get("tasks")
    elif isinstance(value, dict) and "$schema" not in value:
        classification = "legacy_object"
        tasks = value.get("tasks")
    elif isinstance(value, list):
        classification = "legacy_array"
        tasks = value

    if not isinstance(tasks, list):
        return {
            "classification": "invalid",
            "tasks": [],
            "diagnostics": [{
                "code": "task_ledger_invalid_root",
                "message": (
                    "Canonical task ledger must be an exact ultra-task-ledger-v2 root, "
                    "a legacy {tasks} root, or a legacy top-level task array."
                ),
                "path": snapshot["path"],
                "repair": (
                    "Restore the exact `ultra-task-ledger-v2` root with only `$schema` and "
                    "a `tasks` array while preserving every task row and status, then retry "
                    "task selection."
                ),
            }],
        }
    diagnostics = []
    if classification in {"legacy_object", "legacy_array"}:
        diagnostics.append({
            "code": "legacy_task_ledger_root",
            "message": (
                f"Task ledger uses the `{classification}` compatibility root; migrate it "
                f"to the exact `{TASK_LEDGER_SCHEMA_V2}` root without changing task status."
            ),
            "path": snapshot["path"],
            "classification": classification,
        })
    validated_tasks = []
    malformed = False
    for index, row in enumerate(tasks):
        validated, row_diagnostics = _validate_task_row(
            row,
            index,
            classification,
            snapshot["path"],
        )
        diagnostics.extend(row_diagnostics)
        if validated is None:
            malformed = True
        else:
            validated_tasks.append(validated)
    graph_diagnostics = (
        _validate_task_graph(validated_tasks, snapshot["path"])
        if not malformed
        else []
    )
    diagnostics.extend(graph_diagnostics)
    invalid = malformed or bool(graph_diagnostics)
    return {
        "classification": "invalid" if invalid else classification,
        "tasks": [] if invalid else validated_tasks,
        "diagnostics": diagnostics,
    }


def read_tasks(root: Path) -> list[dict[str, Any]]:
    return read_task_ledger(root)["tasks"]


def normalized_task_id(value: Any) -> str | None:
    """Return one filesystem-safe task-id component without rewriting its identity."""
    if (
        not isinstance(value, str)
        or re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", value) is None
        or len(value.encode("utf-8")) > TASK_ID_MAX_BYTES
    ):
        return None
    return value


def _active_change_root_repair(code: str) -> str:
    if code == "active_change_root_oversize":
        return (
            f"Move inactive entries out of .ultra/changes/active until it contains no "
            f"more than {ACTIVE_CHANGE_DIRECTORY_MAX_ENTRIES} entries, normally exactly "
            "one active Change, then retry task selection."
        )
    if code == "active_change_root_changed":
        return (
            "Retry task selection after active Change writes settle; if the surface "
            "remains unsafe, restore its ordinary directory chain first."
        )
    return ACTIVE_CHANGE_ROOT_REPAIR


def _active_change_intent_repair(code: str) -> str:
    if code == "active_change_intent_symlink":
        return ACTIVE_CHANGE_SYMLINK_REPAIR
    if code == "active_change_intent_oversize":
        return (
            f"Reduce intent.md below the {ACTIVE_CHANGE_INTENT_SNAPSHOT_MAX_BYTES}-byte "
            "snapshot ceiling, then retry task selection. To abandon the Change instead, "
            + ACTIVE_CHANGE_ABANDONMENT_INSTRUCTION
        )
    if code == "active_change_intent_changed":
        return (
            "Retry task selection after intent.md writes settle. To abandon the Change "
            "instead, " + ACTIVE_CHANGE_ABANDONMENT_INSTRUCTION
        )
    return ACTIVE_CHANGE_INTENT_REPAIR


def _active_change_selection(root: Path) -> dict[str, Any]:
    active_relative = Path(".ultra") / "changes" / "active"
    active = root / active_relative
    diagnostics = []
    entries, root_failure = read_stable_project_directory_snapshot(
        root,
        active_relative,
        max_entries=ACTIVE_CHANGE_DIRECTORY_MAX_ENTRIES,
        code_prefix="active_change_root",
        label="Active Change directory",
    )
    if root_failure is not None:
        diagnostic = dict(root_failure)
        diagnostic["repair"] = _active_change_root_repair(diagnostic["code"])
        diagnostics.append(diagnostic)
        return {"change_id": None, "diagnostics": diagnostics}
    assert entries is not None

    ordinary_change_entries = []
    for entry in entries:
        entry_name = entry["name"]
        entry_path = active / entry_name
        if entry_name == ".gitkeep":
            if stat.S_ISREG(entry["mode"]):
                continue
            diagnostics.append({
                "code": "active_change_marker_not_regular",
                "message": (
                    "Active Change marker `.gitkeep` must be an ordinary regular "
                    "non-symlink file."
                ),
                "path": str(entry_path),
                "repair": (
                    "Remove malformed .ultra/changes/active/.gitkeep or replace it with "
                    "an ordinary regular non-symlink file, then retry task selection."
                ),
            })
            continue
        if stat.S_ISLNK(entry["mode"]):
            diagnostics.append({
                "code": "active_change_directory_symlink",
                "message": (
                    f"Active Change entry `{entry_name}` is a symlink and cannot "
                    "establish current task authority."
                ),
                "path": str(entry_path),
                "repair": ACTIVE_CHANGE_SYMLINK_REPAIR,
            })
            continue
        if stat.S_ISDIR(entry["mode"]):
            if normalized_task_id(entry_name) is None:
                diagnostics.append({
                    "code": "active_change_id_invalid",
                    "message": (
                        f"Active Change directory `{entry_name}` is not one normalized "
                        "filesystem-safe identifier."
                    ),
                    "path": str(entry_path),
                    "repair": (
                        "Rename the active Change and its ledger change_id references to one "
                        "matching normalized identifier, then retry task selection."
                    ),
                })
                continue
            ordinary_change_entries.append(entry)
            continue
        diagnostics.append({
            "code": "active_change_entry_not_directory",
            "message": (
                f"Active Change entry `{entry_name}` must be an ordinary directory."
            ),
            "path": str(entry_path),
            "repair": (
                f"Remove or move `{entry_name}` out of .ultra/changes/active if it is "
                "stray, or restore it as one ordinary active Change directory containing "
                "its own regular intent.md; then retry task selection."
            ),
        })

    if len(ordinary_change_entries) > 1:
        change_ids = [entry["name"] for entry in ordinary_change_entries]
        rendered_change_ids = ", ".join(f"`{change_id}`" for change_id in change_ids)
        diagnostics.append({
            "code": "active_change_ambiguous",
            "message": (
                "More than one ordinary active Change exists; current task authority "
                "is ambiguous."
            ),
            "path": str(active),
            "repair": (
                "Bootstrap recovery: do not invoke a current-Change workflow while authority "
                "is ambiguous. Stable-list and explicitly choose one of these candidate ids "
                f"to keep active in this worktree: {rendered_change_ids}. For every other "
                "named candidate, use native filesystem and Git tools to preserve unfinished "
                "work in an independent worktree; if an already-durable delivery closure "
                "proves it complete, move it to `.ultra/changes/archive/<change_id>`; or "
                "obtain explicit owner authorization, append the exact `## Abandonment` "
                "closure to that candidate's own `intent.md`, and move it to "
                "`.ultra/changes/abandoned/<change_id>`. Stable-list the active root again; "
                "only after exactly the chosen candidate remains may a current-Change "
                "workflow run and task selection be retried."
            ),
            "change_ids": change_ids,
        })
    if diagnostics:
        return {"change_id": None, "diagnostics": diagnostics}

    change_ids = []
    intent_receipts = {}
    for entry in ordinary_change_entries:
        entry_name = entry["name"]
        entry_path = active / entry_name
        intent_relative = active_relative / entry_name / "intent.md"
        intent_snapshot, intent_failure = read_stable_project_file_snapshot(
            root,
            intent_relative,
            max_bytes=ACTIVE_CHANGE_INTENT_SNAPSHOT_MAX_BYTES,
            code_prefix="active_change_intent",
            label=f"Active Change `{entry_name}` intent.md",
        )
        if intent_failure is not None:
            diagnostic = dict(intent_failure)
            diagnostic["repair"] = _active_change_intent_repair(diagnostic["code"])
            diagnostics.append(diagnostic)
            continue
        assert intent_snapshot is not None
        change_ids.append(entry_name)
        intent_receipts[entry_name] = (
            intent_snapshot["sha256"],
            intent_snapshot["byte_length"],
        )

    fresh_entries, fresh_failure = read_stable_project_directory_snapshot(
        root,
        active_relative,
        max_entries=ACTIVE_CHANGE_DIRECTORY_MAX_ENTRIES,
        code_prefix="active_change_root",
        label="Active Change directory",
    )
    if fresh_failure is not None or fresh_entries != entries:
        diagnostics.append({
            "code": "active_change_root_changed",
            "message": (
                "Active Change directory authority changed during task selection; "
                "no task was selected."
            ),
            "path": str(active),
            "repair": _active_change_root_repair("active_change_root_changed"),
        })
    else:
        for change_id, receipt in intent_receipts.items():
            fresh_intent, fresh_intent_failure = read_stable_project_file_snapshot(
                root,
                active_relative / change_id / "intent.md",
                max_bytes=ACTIVE_CHANGE_INTENT_SNAPSHOT_MAX_BYTES,
                code_prefix="active_change_intent",
                label=f"Active Change `{change_id}` intent.md",
            )
            if fresh_intent_failure is not None:
                diagnostic = dict(fresh_intent_failure)
                diagnostic["repair"] = _active_change_intent_repair(diagnostic["code"])
                diagnostics.append(diagnostic)
                continue
            assert fresh_intent is not None
            if (fresh_intent["sha256"], fresh_intent["byte_length"]) != receipt:
                diagnostics.append({
                    "code": "active_change_intent_changed",
                    "message": (
                        f"Active Change `{change_id}` intent.md changed during task "
                        "selection; no task was selected."
                    ),
                    "path": fresh_intent["path"],
                    "repair": _active_change_intent_repair(
                        "active_change_intent_changed"
                    ),
                })

    if diagnostics:
        return {"change_id": None, "diagnostics": diagnostics}
    if len(change_ids) != 1:
        return {"change_id": None, "diagnostics": diagnostics}
    return {"change_id": change_ids[0], "diagnostics": diagnostics}


def active_change_id(root: Path) -> str | None:
    return _active_change_selection(root)["change_id"]


def legacy_task_change_id(task: dict[str, Any]) -> str | None:
    value = task.get("change_ref")
    if not isinstance(value, str):
        return None
    match = re.fullmatch(
        r"(?:\.ultra/)?changes/active/([A-Za-z0-9][A-Za-z0-9._-]*)/intent\.md",
        value,
    )
    return match.group(1) if match else None


def current_task_selection(root: Path, trusted_task_id: str | None = None) -> dict[str, Any]:
    """Select the one live task: the exact task id carried by one trusted
    invocation, or otherwise the unique `in_progress` ledger row.

    `trusted_task_id` is invocation-local. A caller may supply it only when the
    current owner-invoked public workflow or an authorized delegation argv
    explicitly carries that exact task id; it must mechanically match the ledger
    row of the active Change and is never persisted, cached, or written back as
    a selector. When supplied it is validated first and is the selection
    authority for this invocation, even when other rows claim `in_progress`;
    an invalid id returns its typed diagnostic and never silently selects
    another task. Resume Notes, progress records, directory order, the first
    `pending` row, compact snapshots, and historical reviews are never trusted
    invocations. A `pending` row is a frontier candidate only: this selection
    never auto-activates it without the explicit invocation-local id.
    """
    ledger = read_task_ledger(root)
    selection = {
        "task": None,
        "diagnostics": [
            dict(diagnostic)
            for diagnostic in ledger["diagnostics"]
            if isinstance(diagnostic, dict)
        ],
    }
    active_change = _active_change_selection(root)
    selection["diagnostics"].extend(active_change["diagnostics"])
    change_id = active_change["change_id"]
    if change_id is None:
        return selection
    tasks = [
        task for task in ledger["tasks"]
        if (
            task.get("change_id") == change_id
            or ("change_id" not in task and legacy_task_change_id(task) == change_id)
        )
    ]

    def selected(task: dict[str, Any]) -> dict[str, Any]:
        result = dict(task)
        result["_ultra_diagnostics"] = selection["diagnostics"]
        return result

    if trusted_task_id is not None:
        # The invocation-local exact id is the selection authority: validate it
        # first and never silently fall back to the unique or ambiguous
        # `in_progress` rows it overrides for this invocation.
        safe_tasks = [
            task for task in tasks
            if normalized_task_id(task.get("id")) is not None
            and _task_context_relative_path(task) is not None
        ]
        by_id = {task["id"]: task for task in safe_tasks}
        invoked_id = normalized_task_id(trusted_task_id)
        candidate = by_id.get(invoked_id) if invoked_id is not None else None
        if candidate is None:
            selection["diagnostics"].append({
                "code": "task_invocation_unknown",
                "message": (
                    f"Trusted invocation names task `{trusted_task_id}`, which is not a "
                    f"valid task of active Change `{change_id}`."
                ),
                "path": str(root / ".ultra" / "tasks.json"),
                "change_id": change_id,
                "task_id": trusted_task_id,
                "repair": (
                    "Invoke `ultra-dev` naming one exact task id that exists in the active "
                    "Change's ledger, or obtain owner-authorized `ultra-plan` "
                    "reconciliation; do not guess or persist a selector."
                ),
            })
            return selection
        status = candidate.get("status")
        if status == "completed":
            selection["diagnostics"].append({
                "code": "task_invocation_not_activatable",
                "message": (
                    f"Trusted invocation names task `{invoked_id}`, whose ledger row is "
                    "`completed`; a completed task never returns to active work without "
                    "the explicit Dev reopen."
                ),
                "path": str(root / ".ultra" / "tasks.json"),
                "change_id": change_id,
                "task_id": invoked_id,
                "repair": (
                    "Use `ultra-dev`'s explicit reopen path when current evidence "
                    "invalidates the completed row; never silently demote it."
                ),
            })
            return selection
        if status == "pending":
            dependencies = candidate.get("dependencies", [])
            ready = isinstance(dependencies, list) and all(
                isinstance(dependency, str)
                and dependency in by_id
                and by_id[dependency].get("status") == "completed"
                for dependency in dependencies
            )
            if not ready:
                selection["diagnostics"].append({
                    "code": "task_invocation_dependency_blocked",
                    "message": (
                        f"Trusted invocation names pending task `{invoked_id}`, whose "
                        "same-Change dependencies are not all completed."
                    ),
                    "path": str(root / ".ultra" / "tasks.json"),
                    "change_id": change_id,
                    "task_id": invoked_id,
                    "repair": (
                        "Invoke a dependency-ready task id, or obtain owner-authorized "
                        "`ultra-plan` dependency reconciliation first."
                    ),
                })
                return selection
        selection["task"] = selected(candidate)
        return selection

    in_progress = [task for task in tasks if task.get("status") == "in_progress"]
    if len(in_progress) == 1:
        candidate = in_progress[0]
        if (
            normalized_task_id(candidate.get("id")) is None
            or _task_context_relative_path(candidate) is None
        ):
            return selection
        selection["task"] = selected(candidate)
        return selection
    if len(in_progress) > 1:
        task_ids = [task["id"] for task in in_progress]
        rendered_ids = ", ".join(f"`{task_id}`" for task_id in task_ids)
        selection["diagnostics"].append({
            "code": "task_in_progress_ambiguous",
            "message": (
                f"More than one task in active Change `{change_id}` claims status "
                f"`in_progress`: {rendered_ids}. Selection authority is ambiguous."
            ),
            "path": str(root / ".ultra" / "tasks.json"),
            "change_id": change_id,
            "task_ids": task_ids,
            "repair": (
                "Inspect each named task's canonical context and Resume Note together with "
                "current Git/worktree evidence before changing any ledger row. Do not demote "
                "an `in_progress` task merely to restore unique selection. A conflicting row "
                "may return to `pending` only through an explicit owner/Plan correction that "
                "establishes the task never started. If multiple tasks contain real partial "
                "work, keep every such row `in_progress`; Hooks stay task-silent and "
                "progress-silent. Recover by explicitly owner-invoking `ultra-dev` for one "
                "exact task id, or obtain owner-authorized `ultra-plan` reconciliation that "
                "preserves each task's work, using a separate worktree when needed. Completing "
                "any task still requires final review, canonical v2 evidence, context "
                "publication, ledger write, and readback; then retry task selection."
            ),
        })
        return selection

    # No live task: `pending` rows stay frontier candidates. Hooks remain
    # task-silent and progress-silent until an owner invocation or the unique
    # `in_progress` row establishes live authority.
    return selection


def current_task(root: Path) -> dict[str, Any] | None:
    return current_task_selection(root)["task"]


def project_relative_path(value: str, *, ultra_default: bool = False) -> Path | None:
    if (
        not value
        or "\0" in value
        or "\\" in value
        or value.startswith("/")
        or re.match(r"^[A-Za-z]:", value) is not None
    ):
        return None
    parts = value.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        return None
    relative = Path(*parts)
    ultra_shorthands = {"changes", "contexts", "decisions", "evidence", "progress", "reviews", "specs"}
    first = parts[0]
    if first == ".ultra":
        return relative
    if ultra_default and first in ultra_shorthands:
        return Path(".ultra") / relative
    return relative


def project_file(root: Path, value: str, *, ultra_default: bool = False) -> Path | None:
    relative = project_relative_path(value, ultra_default=ultra_default)
    if relative is None:
        return None
    candidate = (root / relative).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    return candidate


def context_path(root: Path, task: dict[str, Any]) -> Path | None:
    value = task.get("context_file")
    if not isinstance(value, str) or not value:
        return None
    return project_file(root, value, ultra_default=True)


def _task_context_relative_path(task: dict[str, Any]) -> Path | None:
    value = task.get("context_file")
    if not isinstance(value, str) or not value:
        return None
    return project_relative_path(value, ultra_default=True)


def _task_context_restore_repair(relative: Path | None) -> str:
    context = (
        f"`{relative.as_posix()}`"
        if relative is not None
        else "the task context recorded by the `.ultra/tasks.json` row"
    )
    return (
        f"Restore {context} from Git or owner-readable history as one stable ordinary "
        "regular UTF-8 file, keep the `.ultra/tasks.json` row unchanged, and retry the "
        "Hook event."
    )


def _legacy_context_field(text: str, field: str) -> str | None:
    first_section = re.search(r"^##\s+", text, re.MULTILINE)
    preamble = text[:first_section.start()] if first_section else text
    match = re.search(
        rf"\*\*{re.escape(field)}\*\*:\s*(?P<value>[^|\n]*)",
        preamble,
        re.MULTILINE,
    )
    if match is None:
        return None
    return match.group("value").strip().strip("`")


def task_sections(root: Path, task: dict[str, Any]) -> dict[str, Any]:
    relative = _task_context_relative_path(task)
    repair = _task_context_restore_repair(relative)
    inherited_diagnostics = task.get("_ultra_diagnostics")
    diagnostics: list[dict[str, Any]] = [
        dict(diagnostic)
        for diagnostic in inherited_diagnostics
        if isinstance(diagnostic, dict)
    ] if isinstance(inherited_diagnostics, list) else []
    text = ""
    context_available = False
    context_file = str((root.absolute() / relative) if relative else "")
    if relative is None:
        diagnostics.append({
            "code": "task_context_path_invalid",
            "message": "Task context_file must be a normalized repository-relative path.",
            "path": str(task.get("context_file") or ""),
            "repair": repair,
        })
    else:
        snapshot, failure = read_stable_project_file_snapshot(
            root,
            relative,
            max_bytes=TASK_CONTEXT_SNAPSHOT_MAX_BYTES,
            code_prefix="task_context_snapshot",
            label="Current task context",
        )
        if snapshot is None:
            if failure is not None:
                diagnostics.append({**failure, "repair": repair})
        else:
            context_file = snapshot["path"]
            try:
                text = snapshot["bytes"].decode("utf-8")
                context_available = True
            except UnicodeDecodeError:
                diagnostics.append({
                    "code": "task_context_invalid_utf8",
                    "message": "Current task context must be valid UTF-8 Markdown.",
                    "path": context_file,
                    "repair": repair,
                })

    legacy_status = _legacy_context_field(text, "Status")
    if legacy_status is not None:
        ledger_status = task.get("status")
        diagnostics.append({
            "code": "legacy_context_status",
            "message": (
                f"Task context records legacy Status `{legacy_status}`; "
                "`.ultra/tasks.json` remains the sole task-status authority."
            ),
            "path": context_file,
            "observed_status": legacy_status,
            "ledger_status": ledger_status,
        })
        if legacy_status != ledger_status:
            diagnostics.append({
                "code": "legacy_context_status_mismatch",
                "message": (
                    f"Legacy context Status `{legacy_status}` differs from ledger Status "
                    f"`{ledger_status}`; the ledger value wins and the context remains a "
                    "migration observation only."
                ),
                "path": context_file,
                "observed_status": legacy_status,
                "ledger_status": ledger_status,
            })
    legacy_complexity = _legacy_context_field(text, "Complexity")
    if legacy_complexity is not None:
        diagnostics.append({
            "code": "legacy_context_complexity",
            "message": (
                f"Task context records legacy Complexity `{legacy_complexity}`; it is a "
                "migration observation and never a scope, quality, or completion gate."
            ),
            "path": context_file,
            "observed_complexity": legacy_complexity,
        })
    return {
        "acceptance": markdown_section(text, "Acceptance Criteria"),
        "resume": markdown_section(text, "Resume Note"),
        "diagnostics": diagnostics,
        "context_available": context_available,
    }


def render_task_diagnostics(diagnostics: Any) -> str:
    if not isinstance(diagnostics, list):
        return ""
    lines = []
    for diagnostic in diagnostics:
        if not isinstance(diagnostic, dict):
            continue
        code = diagnostic.get("code")
        message = diagnostic.get("message")
        if isinstance(code, str) and code and isinstance(message, str) and message:
            lines.append(f"- `{code}`: {message}")
            repair = diagnostic.get("repair")
            if isinstance(repair, str) and repair.strip():
                lines.append(f"  Repair: {repair}")
    return "\n".join(lines)


def _normalized_derived_path(relative_file: Path | str) -> Path | None:
    relative = Path(relative_file)
    if (
        relative.is_absolute()
        or len(relative.parts) != 3
        or any(part in {"", ".", ".."} for part in relative.parts)
        or tuple(relative.parts[:2]) not in DERIVED_FILE_PREFIXES
    ):
        return None
    if relative.parts[:2] == (".ultra", "progress"):
        filename = relative.parts[2]
        if not filename.endswith(".json") or normalized_task_id(filename[:-5]) is None:
            return None
    elif relative.parts != (".ultra", ".runtime", "compact-snapshot.md"):
        return None
    return relative


def read_derived_project_file_snapshot(
    root: Path,
    relative_file: Path | str,
    *,
    max_bytes: int,
    code_prefix: str,
    label: str,
) -> tuple[dict[str, Any] | None, dict[str, str] | None]:
    relative = _normalized_derived_path(relative_file)
    if relative is None:
        return None, {
            "code": f"{code_prefix}_path_invalid",
            "message": f"{label} path is not an allowed normalized derived-artifact path.",
            "path": str(relative_file),
        }
    return read_stable_project_file_snapshot(
        root,
        relative,
        max_bytes=max_bytes,
        code_prefix=code_prefix,
        label=label,
    )


def read_derived_json(
    root: Path,
    relative_file: Path | str,
    *,
    max_bytes: int,
    code_prefix: str,
    label: str,
) -> tuple[dict[str, Any] | None, dict[str, str] | None]:
    snapshot, failure = read_derived_project_file_snapshot(
        root,
        relative_file,
        max_bytes=max_bytes,
        code_prefix=code_prefix,
        label=label,
    )
    if snapshot is None:
        return None, failure
    try:
        text = snapshot["bytes"].decode("utf-8")
    except UnicodeDecodeError:
        return None, {
            "code": f"{code_prefix}_invalid_utf8",
            "message": f"{label} must be valid UTF-8 JSON.",
            "path": snapshot["path"],
        }
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return None, {
            "code": f"{code_prefix}_invalid_json",
            "message": f"{label} contains invalid JSON and can be rebuilt.",
            "path": snapshot["path"],
        }
    if not isinstance(value, dict):
        return None, {
            "code": f"{code_prefix}_invalid_root",
            "message": f"{label} JSON root must be an object and can be rebuilt.",
            "path": snapshot["path"],
        }
    return value, None


def _open_or_create_stable_directory_chain(
    root: Path,
    components: tuple[str, ...],
    flags: int,
) -> tuple[list[int], list[tuple[int, int, int]]]:
    descriptors: list[int] = []
    identities: list[tuple[int, int, int]] = []
    try:
        root_stat = os.stat(root, follow_symlinks=False)
        if stat.S_ISLNK(root_stat.st_mode):
            raise _SnapshotInvariantError("symlink")
        if not stat.S_ISDIR(root_stat.st_mode):
            raise _SnapshotInvariantError("not_regular")
        descriptor = os.open(root, flags)
        descriptors.append(descriptor)
        descriptor_stat = os.fstat(descriptor)
        if _directory_identity(root_stat) != _directory_identity(descriptor_stat):
            raise _SnapshotInvariantError("changed")
        identities.append(_directory_identity(descriptor_stat))

        for component in components:
            try:
                path_stat = os.stat(component, dir_fd=descriptor, follow_symlinks=False)
            except FileNotFoundError:
                try:
                    os.mkdir(component, mode=0o700, dir_fd=descriptor)
                except FileExistsError:
                    pass
                path_stat = os.stat(component, dir_fd=descriptor, follow_symlinks=False)
            if stat.S_ISLNK(path_stat.st_mode):
                raise _SnapshotInvariantError("symlink")
            if not stat.S_ISDIR(path_stat.st_mode):
                raise _SnapshotInvariantError("not_regular")
            descriptor = os.open(component, flags, dir_fd=descriptor)
            descriptors.append(descriptor)
            descriptor_stat = os.fstat(descriptor)
            if _directory_identity(path_stat) != _directory_identity(descriptor_stat):
                raise _SnapshotInvariantError("changed")
            identities.append(_directory_identity(descriptor_stat))
        return descriptors, identities
    except Exception:
        for descriptor in reversed(descriptors):
            os.close(descriptor)
        raise


def write_derived_project_file_atomic(
    root: Path,
    relative_file: Path | str,
    data: bytes,
    *,
    max_bytes: int,
    code_prefix: str,
    label: str,
) -> dict[str, str] | None:
    """Atomically publish one bounded derived file without following a symlink."""
    relative = _normalized_derived_path(relative_file)
    canonical = root.absolute() / Path(relative_file)

    def failure(kind: str, message: str) -> dict[str, str]:
        return {
            "code": f"{code_prefix}_{kind}",
            "message": message,
            "path": str(canonical),
        }

    if relative is None:
        return failure(
            "path_invalid",
            f"{label} path is not an allowed normalized derived-artifact path.",
        )
    if len(data) > max_bytes:
        return failure("oversize", f"{label} exceeds the {max_bytes}-byte publication limit.")
    try:
        root_real = root.resolve(strict=True)
    except (OSError, RuntimeError) as error:
        return failure("read_error", f"{label} repository root is unavailable: {error}")
    canonical = root_real.joinpath(*relative.parts)
    directory_flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)
    file_flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    descriptors: list[int] = []
    temporary_descriptor: int | None = None
    temporary_name: str | None = None
    parent_descriptor: int | None = None
    try:
        descriptors, identities = _open_or_create_stable_directory_chain(
            root_real,
            relative.parts[:-1],
            directory_flags,
        )
        parent_descriptor = descriptors[-1]
        filename = relative.parts[-1]
        try:
            existing = os.stat(filename, dir_fd=parent_descriptor, follow_symlinks=False)
        except FileNotFoundError:
            existing = None
        if existing is not None:
            if stat.S_ISLNK(existing.st_mode):
                raise _SnapshotInvariantError("symlink")
            if not stat.S_ISREG(existing.st_mode):
                raise _SnapshotInvariantError("not_regular")

        temporary_name = f".{filename}.tmp-{os.getpid()}-{secrets.token_hex(8)}"
        temporary_descriptor = os.open(
            temporary_name,
            file_flags,
            0o600,
            dir_fd=parent_descriptor,
        )
        written = 0
        while written < len(data):
            written += os.write(temporary_descriptor, data[written:])
        os.fsync(temporary_descriptor)
        temporary_stat = os.fstat(temporary_descriptor)
        if not stat.S_ISREG(temporary_stat.st_mode) or temporary_stat.st_size != len(data):
            raise _SnapshotInvariantError("changed")
        os.close(temporary_descriptor)
        temporary_descriptor = None

        fresh_descriptors, fresh_identities = _open_stable_directory_chain(
            root_real,
            relative.parts[:-1],
            directory_flags,
        )
        descriptors.extend(fresh_descriptors)
        if fresh_identities != identities:
            raise _SnapshotInvariantError("changed")
        os.replace(
            temporary_name,
            filename,
            src_dir_fd=parent_descriptor,
            dst_dir_fd=parent_descriptor,
        )
        temporary_name = None
        os.fsync(parent_descriptor)
        return None
    except _SnapshotInvariantError as error:
        messages = {
            "symlink": f"{label} path and target must not contain symlinks.",
            "not_regular": f"{label} target must be a regular file beneath ordinary directories.",
            "changed": f"{label} path changed during publication; retry the Hook event.",
        }
        return failure(error.kind, messages[error.kind])
    except OSError as error:
        return failure("write_error", f"{label} could not be published safely: {error}")
    finally:
        if temporary_descriptor is not None:
            os.close(temporary_descriptor)
        if temporary_name is not None and parent_descriptor is not None:
            try:
                os.unlink(temporary_name, dir_fd=parent_descriptor)
            except OSError:
                pass
        for descriptor in reversed(descriptors):
            os.close(descriptor)


def emit_context(event: str, text: str) -> None:
    if not text.strip():
        return
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": event,
            "additionalContext": text.strip(),
        }
    }))


def write_json_atomic(
    root: Path,
    relative_file: Path | str,
    payload: dict[str, Any],
    *,
    max_bytes: int,
    code_prefix: str,
    label: str,
) -> dict[str, str] | None:
    data = f"{json.dumps(payload, indent=2)}\n".encode("utf-8")
    return write_derived_project_file_atomic(
        root,
        relative_file,
        data,
        max_bytes=max_bytes,
        code_prefix=code_prefix,
        label=label,
    )
