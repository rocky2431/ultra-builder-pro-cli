"""Read-only canonical project and state-path resolution for Ultra hooks."""

import json
import os
import sqlite3
import subprocess
from pathlib import Path


class RuntimePathError(RuntimeError):
    """Ultra runtime paths are invalid or have competing authorities."""

STATE_TOMBSTONE_MARKER = "MIGRATED_TO_RUNTIME.json"
STATE_TOMBSTONE_KIND = "ultra-state-migration-tombstone"


def _absolute(path: Path) -> Path:
    expanded = path.expanduser()
    return expanded if expanded.is_absolute() else Path.cwd() / expanded


def _assert_root(root: Path, *, explicit: bool) -> Path:
    absolute = _absolute(root)
    try:
        stat = absolute.lstat()
    except FileNotFoundError as error:
        raise RuntimePathError(f"UBP_ROOT_DIR does not exist: {absolute}") from error
    if (explicit and absolute.is_symlink()) or not absolute.is_dir():
        raise RuntimePathError(
            f"UBP_ROOT_DIR must be a real directory, not a symlink or special entry: {absolute}"
        )
    return absolute.resolve()


def _assert_directory(path: Path, label: str, *, allow_runtime_link_to: Path | None = None) -> None:
    try:
        path.lstat()
    except FileNotFoundError:
        return
    if path.is_symlink():
        if allow_runtime_link_to is not None:
            try:
                if (
                    path.resolve(strict=True) == allow_runtime_link_to.parent.resolve(strict=True)
                    and (path / "state.db").resolve(strict=True)
                    == allow_runtime_link_to.resolve(strict=True)
                ):
                    return
            except FileNotFoundError:
                pass
        raise RuntimePathError(f"{label} may not be a symlink: {path}")
    if not path.is_dir():
        raise RuntimePathError(f"{label} must be a directory: {path}")


def _is_managed_legacy_tombstone(main: Path) -> bool:
    try:
        stat = main.lstat()
    except FileNotFoundError:
        return False
    if main.is_symlink():
        return False
    marker = main / STATE_TOMBSTONE_MARKER if main.is_dir() else main
    try:
        if main.is_dir():
            if [entry.name for entry in main.iterdir()] != [STATE_TOMBSTONE_MARKER]:
                return False
        elif not main.is_file():
            return False
        marker_stat = marker.lstat()
        if marker.is_symlink() or not marker_stat.st_mode:
            return False
        payload = json.loads(marker.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, ValueError, json.JSONDecodeError):
        return False
    canonical = (main.parent / str(payload.get("canonical_state_db", ""))).resolve()
    expected = (main.parent / ".runtime" / "state.db").resolve()
    return (
        payload.get("version") == 1
        and payload.get("kind") == STATE_TOMBSTONE_KIND
        and marker.is_file()
        and canonical == expected
    )


def _assert_state_set(
    main: Path, label: str, *, allow_managed_tombstone: bool = False
) -> None:
    present: dict[str, bool] = {}
    for suffix in ("", "-wal", "-shm"):
        candidate = Path(f"{main}{suffix}")
        try:
            candidate.lstat()
        except FileNotFoundError:
            present[suffix] = False
            continue
        tombstone = (
            suffix == ""
            and allow_managed_tombstone
            and _is_managed_legacy_tombstone(candidate)
        )
        if not tombstone and (candidate.is_symlink() or not candidate.is_file()):
            raise RuntimePathError(
                f"{label} state entry must be a regular file and may not be a symlink: {candidate}"
            )
        present[suffix] = not tombstone
    if not present[""] and (present["-wal"] or present["-shm"]):
        raise RuntimePathError(f"{label} SQLite sidecar exists without state.db authority")


def _physical_state_paths(root: Path) -> tuple[Path, Path]:
    resolved = root.resolve()
    return (
        resolved / ".ultra" / ".runtime" / "state.db",
        resolved / ".ultra" / "state.db",
    )


def _same_physical_authority(left: Path, right: Path) -> bool:
    if left == right:
        return True
    try:
        return left.resolve(strict=True) == right.resolve(strict=True)
    except FileNotFoundError:
        return False


def _is_task_authority_link(
    runtime: Path, candidate: Path, physical_runtime: Path, runtime_state: Path
) -> bool:
    try:
        parts = candidate.relative_to(runtime).parts
    except ValueError:
        return False
    if (
        len(parts) != 4
        or parts[0] != "worktrees"
        or not parts[1]
        or len(parts[1]) > 128
        or not parts[1][0].isalnum()
        or any(not (char.isalnum() or char in "._-") for char in parts[1])
        or parts[2:] != (".ultra", ".runtime")
    ):
        return False
    try:
        return (
            candidate.resolve(strict=True) == physical_runtime
            and (candidate / "state.db").resolve(strict=True)
            == runtime_state.resolve(strict=True)
        )
    except FileNotFoundError:
        return False


def _has_git_metadata(root: Path) -> bool:
    for candidate in (root, *root.parents):
        if (candidate / ".git").exists() or (candidate / ".git").is_symlink():
            return True
    return False


def _registered_worktrees(root: Path) -> set[Path]:
    probe = subprocess.run(
        ["git", "rev-parse", "--is-inside-work-tree"],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
    )
    if probe.returncode != 0 or probe.stdout.strip() != "true":
        detail = (probe.stderr or probe.stdout or "unknown Git probe failure").strip()
        if not _has_git_metadata(root) and "not a git repository" in detail.lower():
            return set()
        raise RuntimePathError(f"cannot classify Git worktree authority: {detail}")
    result = subprocess.run(
        ["git", "worktree", "list", "--porcelain"],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "unknown Git probe failure").strip()
        raise RuntimePathError(f"cannot inspect registered Git worktrees: {detail}")
    registered: set[Path] = set()
    for line in result.stdout.splitlines():
        if line.startswith("worktree "):
            registered.add(Path(line.removeprefix("worktree ")).resolve())
    return registered


def _assert_registered_worktree_boundary(
    runtime: Path, candidate: Path, physical_runtime: Path
) -> None:
    sid = candidate.name
    if (
        not sid
        or len(sid) > 128
        or not sid[0].isalnum()
        or any(not (char.isalnum() or char in "._-") for char in sid)
    ):
        raise RuntimePathError(f"registered worktree has an unsafe session id: {candidate}")
    authority_link = candidate / ".ultra" / ".runtime"
    if (
        not authority_link.is_symlink()
        or not _is_task_authority_link(
            runtime, authority_link, physical_runtime, runtime / "state.db"
        )
    ):
        raise RuntimePathError(
            "registered worktree must contain the exact central Ultra "
            f"authority link: {authority_link}"
        )


def _assert_runtime_tree(root: Path, runtime: Path) -> None:
    try:
        runtime.lstat()
    except FileNotFoundError:
        return
    try:
        physical_runtime = runtime.resolve(strict=True)
    except FileNotFoundError as error:
        raise RuntimePathError(
            f"canonical runtime root cannot be resolved: {runtime}"
        ) from error
    pending = list(runtime.iterdir())
    runtime_state = runtime / "state.db"
    registered: set[Path] | None = None
    while pending:
        candidate = pending.pop()
        try:
            candidate.lstat()
        except FileNotFoundError:
            continue
        if candidate.is_symlink():
            if _is_task_authority_link(
                runtime, candidate, physical_runtime, runtime_state
            ):
                continue
            raise RuntimePathError(
                f"canonical runtime entry may not be a symlink: {candidate}"
            )
        if not candidate.is_dir() and not candidate.is_file():
            raise RuntimePathError(
                "canonical runtime entry must be a regular file or real "
                f"directory: {candidate}"
            )
        try:
            physical_candidate = candidate.resolve(strict=True)
            physical_candidate.relative_to(physical_runtime)
        except (FileNotFoundError, ValueError) as error:
            raise RuntimePathError(
                f"canonical runtime entry escapes its physical root: {candidate}"
            ) from error
        try:
            relative_parts = candidate.relative_to(runtime).parts
        except ValueError:
            relative_parts = ()
        if (
            candidate.is_dir()
            and len(relative_parts) == 2
            and relative_parts[0] == "worktrees"
        ):
            if registered is None:
                registered = _registered_worktrees(root)
            if physical_candidate in registered:
                _assert_registered_worktree_boundary(
                    runtime, candidate, physical_runtime
                )
                continue
        if candidate.is_dir():
            pending.extend(candidate.iterdir())


def _project_root_from_state_db(configured: Path) -> Path:
    if (
        configured.name == "state.db"
        and configured.parent.name == ".runtime"
        and configured.parent.parent.name == ".ultra"
    ):
        return configured.parent.parent.parent
    raise RuntimePathError(
        f"configured DB is not a canonical project runtime authority: {configured}"
    )


def _assert_task_authority_binding(root: Path, configured: Path) -> None:
    try:
        authority_root = _project_root_from_state_db(configured).resolve(strict=True)
        canonical_db = authority_root / ".ultra" / ".runtime" / "state.db"
        if configured.resolve(strict=True) != canonical_db.resolve(strict=True):
            raise RuntimePathError("configured DB is not the canonical authority")
        task_root = root.resolve(strict=True)
        worktrees_root = (
            authority_root / ".ultra" / ".runtime" / "worktrees"
        ).resolve(strict=True)
        relative = task_root.relative_to(worktrees_root)
        if len(relative.parts) != 1:
            raise RuntimePathError("task root is not a direct managed worktree child")
        sid = relative.parts[0]
        if task_root not in _registered_worktrees(authority_root):
            raise RuntimePathError("task root is not a registered Git worktree")
        runtime_link = root / ".ultra" / ".runtime"
        if (
            not runtime_link.is_symlink()
            or runtime_link.resolve(strict=True) != canonical_db.parent.resolve(strict=True)
        ):
            raise RuntimePathError("task authority link does not resolve to the configured DB")
        uri = f"{configured.resolve(strict=True).as_uri()}?mode=ro"
        with sqlite3.connect(uri, uri=True) as connection:
            row = connection.execute(
                "SELECT worktree_path FROM sessions WHERE sid = ?", (sid,)
            ).fetchone()
        if row is None:
            raise RuntimePathError(f"authority has no session binding for {sid}")
        if Path(row[0]).resolve(strict=True) != task_root:
            raise RuntimePathError(f"session {sid} is bound to a different worktree")
    except (FileNotFoundError, ValueError, sqlite3.Error) as error:
        raise RuntimePathError(
            f"task root is not bound to the configured Ultra authority: {error}"
        ) from error


def validate_project_layout(
    root: Path, *, validate_runtime_tree: bool = False
) -> tuple[Path, Path, Path | None]:
    runtime, legacy = _physical_state_paths(root)
    configured_value = os.environ.get("UBP_DB_PATH", "").strip()
    configured = _absolute(Path(configured_value)) if configured_value else None
    if configured is not None:
        _assert_state_set(configured, "configured")
    _assert_directory(root / ".ultra", ".ultra")
    _assert_directory(
        root / ".ultra" / ".runtime",
        ".ultra/.runtime",
        allow_runtime_link_to=configured,
    )
    _assert_state_set(runtime, "runtime")
    _assert_state_set(legacy, "legacy", allow_managed_tombstone=True)
    if validate_runtime_tree:
        _assert_runtime_tree(root, root.resolve() / ".ultra" / ".runtime")
    return runtime, legacy, configured


def _assert_no_competing_state(root: Path) -> tuple[Path, Path]:
    runtime, legacy, configured = validate_project_layout(root)
    legacy_active = legacy.is_file() and not _is_managed_legacy_tombstone(legacy)
    if runtime.is_file() and legacy_active:
        raise RuntimePathError(
            "both legacy .ultra/state.db and runtime "
            ".ultra/.runtime/state.db exist; refusing to choose either authority"
        )
    if configured is not None:
        active = runtime if runtime.is_file() else (legacy if legacy_active else None)
        allowed = (
            _same_physical_authority(configured, active)
            if active is not None
            else configured == runtime
        )
        if not allowed:
            raise RuntimePathError(
                "UBP_DB_PATH does not name this project's canonical or "
                f"task-linked authority: {configured}"
            )
        if (root / ".ultra" / ".runtime").is_symlink():
            _assert_task_authority_binding(root, configured)
    return runtime, legacy


def state_db_path(root: Path) -> Path:
    """Return configured, runtime, or legacy state without mutating the project."""
    runtime, legacy = _assert_no_competing_state(root)
    configured = os.environ.get("UBP_DB_PATH", "").strip()
    if configured:
        return _absolute(Path(configured)).resolve()
    if runtime.is_file():
        return runtime
    if legacy.is_file() and not _is_managed_legacy_tombstone(legacy):
        return legacy
    return runtime


def find_project_root(start: Path) -> Path | None:
    """Resolve one project root without letting UBP_DB_PATH invent a root."""
    configured_root = os.environ.get("UBP_ROOT_DIR", "").strip()
    if configured_root:
        root = _assert_root(Path(configured_root), explicit=True)
        return root if state_db_path(root).is_file() else None

    current = _assert_root(start, explicit=False)
    for root in (current, *current.parents):
        runtime, legacy = _assert_no_competing_state(root)
        if runtime.is_file() or legacy.is_file():
            return root
    return None
