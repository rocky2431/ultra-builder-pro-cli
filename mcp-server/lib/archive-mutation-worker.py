#!/usr/bin/env python3
"""Perform bounded archive mutations relative to inherited directory fds."""

import base64
import json
import os
import stat
import sys


MAX_REQUEST_BYTES = 16 * 1024 * 1024
MAX_DATA_BYTES = 8 * 1024 * 1024
MAX_BASENAME_BYTES = 255
ARCHIVE_FILES = frozenset((
    ".archive-intent.json",
    ".archive-rebind.json",
    "archive-summary.md",
))

OPERATION_FIELDS = {
    "mkdir_dir": frozenset((
        "operation", "directory_fd", "directory_identity", "name",
    )),
    "write_atomic": frozenset((
        "operation", "directory_fd", "directory_identity", "name",
        "temp_name", "replace", "data_base64",
    )),
    "write_rebind_atomic": frozenset((
        "operation", "directory_fd", "directory_identity", "name",
        "temp_name", "replace", "data_base64",
    )),
    "unlink_regular": frozenset((
        "operation", "directory_fd", "directory_identity", "name",
        "allow_missing",
    )),
    "rename_dir": frozenset((
        "operation", "source_parent_fd", "destination_parent_fd",
        "guard_parent_fd", "source_parent_identity",
        "destination_parent_identity", "guard_parent_identity",
        "source_parent_name", "destination_parent_name", "source_name",
        "destination_name", "source_identity",
    )),
}


class MutationError(Exception):
    code = "ARCHIVE_PATH_UNSAFE"


class ProtocolError(MutationError):
    code = "ARCHIVE_MUTATION_INVALID"


class RuntimePrerequisiteError(MutationError):
    code = "ARCHIVE_RUNTIME_UNAVAILABLE"


def identity(value):
    return {
        "dev": str(value.st_dev),
        "ino": str(value.st_ino),
        "mode": str(value.st_mode),
    }


def require_identity_shape(value, label):
    if (
        not isinstance(value, dict)
        or set(value) != {"dev", "ino", "mode"}
        or any(
            not isinstance(value[field], str) or not value[field].isdigit()
            for field in ("dev", "ino", "mode")
        )
    ):
        raise ProtocolError(f"{label} has an invalid identity")


def require_identity(actual, expected, label):
    if identity(actual) != expected:
        raise MutationError(f"{label} changed identity")


def require_fd(value, label):
    if isinstance(value, bool) or not isinstance(value, int) or value < 3 or value > 5:
        raise ProtocolError(f"{label} is outside the inherited descriptor boundary")


def require_basename(value, label):
    if (
        not isinstance(value, str)
        or not value
        or value in (".", "..")
        or "/" in value
        or "\\" in value
        or "\x00" in value
        or len(os.fsencode(value)) > MAX_BASENAME_BYTES
    ):
        raise ProtocolError(f"{label} must be one bounded basename")


def require_platform_support():
    if os.name != "posix":
        raise RuntimePrerequisiteError("archive mutations require a POSIX Python runtime")
    required_dir_fd = (os.open, os.stat, os.rename, os.unlink, os.mkdir)
    if any(operation not in os.supports_dir_fd for operation in required_dir_fd):
        raise RuntimePrerequisiteError(
            "Python dir_fd operations required by archive mutations are unavailable"
        )
    if os.stat not in os.supports_follow_symlinks or not hasattr(os, "O_NOFOLLOW"):
        raise RuntimePrerequisiteError(
            "Python no-follow filesystem operations required by archive mutations are unavailable"
        )


def validate_request(request):
    if not isinstance(request, dict):
        raise ProtocolError("archive mutation request must be an object")
    operation = request.get("operation")
    expected = OPERATION_FIELDS.get(operation)
    if expected is None or set(request) != expected:
        raise ProtocolError("archive mutation operation or fields are not allowlisted")

    for field in (name for name in expected if name.endswith("_fd")):
        require_fd(request[field], field)
    for field in (name for name in expected if name.endswith("_identity")):
        require_identity_shape(request[field], field)
    for field in (
        name for name in expected
        if name == "name" or name.endswith("_name")
    ):
        require_basename(request[field], field)

    if operation == "mkdir_dir" and request["name"] != "archive":
        raise ProtocolError("archive mkdir can create only the archive root")
    if operation in ("write_atomic", "unlink_regular") and request["name"] not in ARCHIVE_FILES:
        raise ProtocolError("archive file mutation target is not allowlisted")
    if operation in ("write_atomic", "write_rebind_atomic"):
        if type(request["replace"]) is not bool:
            raise ProtocolError("replace must be a boolean")
        if request["temp_name"] == request["name"]:
            raise ProtocolError("archive publication temp name must be distinct")
        encoded = request["data_base64"]
        if not isinstance(encoded, str):
            raise ProtocolError("archive publication data must be base64 text")
        try:
            data = base64.b64decode(encoded, validate=True)
        except (ValueError, TypeError) as error:
            raise ProtocolError("archive publication data is invalid base64") from error
        if len(data) > MAX_DATA_BYTES:
            raise ProtocolError("archive publication data exceeds the protocol limit")
        request["_data"] = data
    if operation == "unlink_regular" and type(request["allow_missing"]) is not bool:
        raise ProtocolError("allow_missing must be a boolean")
    if operation == "rename_dir":
        parent_names = {
            request["source_parent_name"],
            request["destination_parent_name"],
        }
        if parent_names != {"active", "archive"}:
            raise ProtocolError("archive transition parents must be active and archive")
    return operation


def require_directory_fd(fd, expected, label):
    current = os.fstat(fd)
    if not stat.S_ISDIR(current.st_mode):
        raise MutationError(f"{label} is not a directory")
    require_identity(current, expected, label)


def lstat_at(fd, name):
    try:
        return os.stat(name, dir_fd=fd, follow_symlinks=False)
    except FileNotFoundError:
        return None


def require_canonical_directory(fd, name, expected, label):
    current = lstat_at(fd, name)
    if current is None or not stat.S_ISDIR(current.st_mode):
        raise MutationError(f"{label} is missing or unsafe")
    require_identity(current, expected, label)


def write_all(fd, data):
    offset = 0
    while offset < len(data):
        written = os.write(fd, data[offset:])
        if written <= 0:
            raise MutationError("short archive publication write")
        offset += written


def write_atomic(request):
    fd = request["directory_fd"]
    expected = request["directory_identity"]
    name = request["name"]
    temp_name = request["temp_name"]
    replace = request["replace"]
    require_directory_fd(fd, expected, "archive write directory")
    current = lstat_at(fd, name)
    if current is not None:
        if not replace or not stat.S_ISREG(current.st_mode):
            raise MutationError("archive publication target is not safely replaceable")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
    temp_fd = None
    published = False
    try:
        temp_fd = os.open(temp_name, flags, 0o600, dir_fd=fd)
        write_all(temp_fd, request["_data"])
        os.fsync(temp_fd)
        os.close(temp_fd)
        temp_fd = None
        require_directory_fd(fd, expected, "archive write directory")
        os.rename(temp_name, name, src_dir_fd=fd, dst_dir_fd=fd)
        published = True
        require_directory_fd(fd, expected, "archive write directory")
        final = lstat_at(fd, name)
        if final is None or not stat.S_ISREG(final.st_mode):
            raise MutationError("archive publication did not produce a regular file")
    finally:
        if temp_fd is not None:
            os.close(temp_fd)
        if not published:
            try:
                os.unlink(temp_name, dir_fd=fd)
            except FileNotFoundError:
                pass


def unlink_regular(request):
    fd = request["directory_fd"]
    expected = request["directory_identity"]
    require_directory_fd(fd, expected, "archive cleanup directory")
    current = lstat_at(fd, request["name"])
    if current is None:
        if request["allow_missing"]:
            return
        raise MutationError("archive cleanup target is missing")
    if not stat.S_ISREG(current.st_mode):
        raise MutationError("archive cleanup target is not a regular file")
    os.unlink(request["name"], dir_fd=fd)
    require_directory_fd(fd, expected, "archive cleanup directory")
    if lstat_at(fd, request["name"]) is not None:
        raise MutationError("archive cleanup target still exists")


def rename_dir(request):
    source_parent_fd = request["source_parent_fd"]
    destination_parent_fd = request["destination_parent_fd"]
    guard_parent_fd = request["guard_parent_fd"]
    require_directory_fd(
        source_parent_fd,
        request["source_parent_identity"],
        "archive source parent",
    )
    require_directory_fd(
        destination_parent_fd,
        request["destination_parent_identity"],
        "archive destination parent",
    )
    require_directory_fd(
        guard_parent_fd,
        request["guard_parent_identity"],
        "archive guard parent",
    )
    require_canonical_directory(
        guard_parent_fd,
        request["source_parent_name"],
        request["source_parent_identity"],
        "canonical archive source parent",
    )
    require_canonical_directory(
        guard_parent_fd,
        request["destination_parent_name"],
        request["destination_parent_identity"],
        "canonical archive destination parent",
    )
    source = lstat_at(source_parent_fd, request["source_name"])
    if source is None or not stat.S_ISDIR(source.st_mode):
        raise MutationError("archive source directory is missing or unsafe")
    require_identity(source, request["source_identity"], "archive source directory")
    if lstat_at(destination_parent_fd, request["destination_name"]) is not None:
        raise MutationError("archive destination already exists")
    os.rename(
        request["source_name"],
        request["destination_name"],
        src_dir_fd=source_parent_fd,
        dst_dir_fd=destination_parent_fd,
    )
    require_directory_fd(
        source_parent_fd,
        request["source_parent_identity"],
        "archive source parent",
    )
    require_directory_fd(
        destination_parent_fd,
        request["destination_parent_identity"],
        "archive destination parent",
    )
    if lstat_at(source_parent_fd, request["source_name"]) is not None:
        raise MutationError("archive source still exists after transition")
    destination = lstat_at(destination_parent_fd, request["destination_name"])
    if destination is None or not stat.S_ISDIR(destination.st_mode):
        raise MutationError("archive destination is missing after transition")
    require_identity(destination, request["source_identity"], "archive destination directory")


def mkdir_dir(request):
    fd = request["directory_fd"]
    expected = request["directory_identity"]
    require_directory_fd(fd, expected, "archive mkdir parent")
    current = lstat_at(fd, request["name"])
    if current is None:
        os.mkdir(request["name"], mode=0o700, dir_fd=fd)
        current = lstat_at(fd, request["name"])
    if current is None or not stat.S_ISDIR(current.st_mode):
        raise MutationError("archive directory cannot be created safely")
    require_directory_fd(fd, expected, "archive mkdir parent")


OPERATIONS = {
    "write_atomic": write_atomic,
    "write_rebind_atomic": write_atomic,
    "unlink_regular": unlink_regular,
    "rename_dir": rename_dir,
    "mkdir_dir": mkdir_dir,
}


def read_request():
    raw = sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1)
    if len(raw) > MAX_REQUEST_BYTES:
        raise ProtocolError("archive mutation request exceeds the protocol limit")
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ProtocolError("archive mutation request is not valid UTF-8 JSON") from error


def main():
    request = read_request()
    operation_name = validate_request(request)
    require_platform_support()
    OPERATIONS[operation_name](request)
    json.dump({"ok": True}, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # fail closed at the process boundary
        code = error.code if isinstance(error, MutationError) else "ARCHIVE_PATH_UNSAFE"
        json.dump(
            {
                "ok": False,
                "code": code,
                "error": type(error).__name__,
                "message": str(error),
            },
            sys.stderr,
        )
        sys.stderr.write("\n")
        sys.exit(3 if code == "ARCHIVE_RUNTIME_UNAVAILABLE" else 2)
