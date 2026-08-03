#!/usr/bin/env python3
"""Block a narrow set of externally destructive shell effects."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shlex
import subprocess

from _common import emit_context, project_root, read_payload


APPROVAL_VAR = "UBP_DANGEROUS_COMMAND_APPROVED"
APPROVAL_PREFIX = re.compile(rf"^\s*{APPROVAL_VAR}=\S*\s+")

HEREDOC = re.compile(
    r"<<-?\s*(['\"]?)(?P<tag>[A-Za-z_]\w*)\1(?P<rest>[^\n]*)\n(?P<body>.*?)^\s*(?P=tag)\s*$",
    re.DOTALL | re.MULTILINE,
)
# Commands whose heredoc is a payload rather than a script. Deliberately short: an
# unlisted sink keeps its body in scope, so the cost of an omission is a false positive,
# never a missed effect.
DATA_SINK = re.compile(r"\bgit\s+(?:commit|tag|notes)\b", re.IGNORECASE)
SEARCH_COMMANDS = {"egrep", "fgrep", "grep", "rg"}
SHELL_CONTROL = {";", ";;", "&", "&&", "|", "||", "(", ")", "\n"}


def strip_data_heredocs(command: str) -> str:
    """Drop heredoc bodies that are data for a known sink.

    Describing an effect inside a commit message is not performing it, and a message
    that mentions one used to be blocked as though it did.

    Bodies are kept whenever they might be executed: an interpreter reading a heredoc
    runs it, so stripping there would make quoting style a way around this gate. The
    body survives unless the delimiter is quoted, the segment introducing it is a
    listed data sink, and nothing on the heredoc's own line pipes it somewhere else.
    An unquoted delimiter performs parameter, command and arithmetic expansion before
    the sink receives the data, so its body remains executable shell input.
    """
    def resolve(match: re.Match) -> str:
        segment = re.split(r"\|\||&&|[;&|\n]", command[:match.start()])[-1]
        if (
            not match.group(1)
            or "|" in match.group("rest")
            or not DATA_SINK.search(segment)
        ):
            return match.group(0)
        tag = match.group("tag")
        return f"<<{tag}\n{tag}"

    return HEREDOC.sub(resolve, command)


def effect_of(command: str) -> str:
    """The command reduced to what it actually does.

    Strips an inline approval assignment, then any heredoc body that is data for a
    known sink. What remains is the effect: the part worth classifying and hashing.

    The digest must identify the *effect*, not the spelling of the retry. Without this,
    prepending the variable changes the command text, which changes the digest, which
    means the quoted digest is never the one that matches -- the repair path is a loop.

    The assigned value is discarded on purpose. Only the process environment authorizes,
    because the command string is composed by the model and honouring an inline value
    would let it approve itself.
    """
    return strip_data_heredocs(APPROVAL_PREFIX.sub("", command, count=1))


def is_inert_search(command: str) -> bool:
    """Return true when a search query is data, not executable shell input."""
    if any(marker in command for marker in ("$(", "<(", ">(", "`")):
        return False
    try:
        lexer = shlex.shlex(command, posix=True, punctuation_chars=";&|()\n")
        lexer.whitespace = " \t\r"
        lexer.whitespace_split = True
        lexer.commenters = ""
        tokens = list(lexer)
    except ValueError:
        return False
    if not tokens or any(token in SHELL_CONTROL for token in tokens):
        return False
    return os.path.basename(tokens[0]) in SEARCH_COMMANDS


def protected_push(command: str, root) -> bool:
    if not re.search(r"\bgit\s+push\b", command, re.IGNORECASE):
        return False
    if re.search(r"\b(?:main|master|production|prod)\b", command, re.IGNORECASE):
        return True
    result = subprocess.run(
        ["git", "branch", "--show-current"], cwd=root, text=True,
        capture_output=True, check=False, timeout=3,
    )
    return result.stdout.strip() in {"main", "master", "production", "prod"}


def destructive_protected_push(command: str, root) -> bool:
    """Detect history rewrites or deletion, not ordinary additive publication."""
    if not protected_push(command, root):
        return False
    match = re.search(r"\bgit\s+push\b", command, re.IGNORECASE)
    if match is None:
        return False
    segment = re.split(r"\|\||&&|[;&|\n]", command[match.end():], maxsplit=1)[0]
    force_or_delete = re.search(
        r"(?:^|\s)(?:-f|--force(?:-with-lease(?:=\S+)?|-if-includes)?|--delete)(?=\s|$)",
        segment,
        re.IGNORECASE,
    )
    forced_refspec = re.search(r"(?:^|\s)(?:\+\S+|:\S+)(?=\s|$)", segment)
    return force_or_delete is not None or forced_refspec is not None


def classify(command: str, root) -> str | None:
    if destructive_protected_push(command, root):
        return "protected branch history rewrite or deletion"
    if re.search(r"\b(?:drop\s+(?:table|database|schema)|truncate\s+(?:table\s+)?)\b", command, re.IGNORECASE):
        return "destructive database operation"
    if re.search(r"\b(?:cast\s+send|solana\s+transfer|bitcoin-cli\s+send|near\s+send|aptos\s+move\s+run)\b", command, re.IGNORECASE):
        return "funds or on-chain transaction"
    if re.search(
        r"\b(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET|PASSWORD)\s*=\s*['\"]?(?!\$|\$\{)[^\s'\"]{8,}",
        command,
        re.IGNORECASE,
    ):
        return "hard-coded credential"
    if re.search(r"\beval\s+['\"]?\$|\bexec\s*\([^)]*\binput\s*\(", command, re.IGNORECASE):
        return "user-controlled code execution"
    return None


def advisory(command: str, root) -> str | None:
    if protected_push(command, root):
        return (
            "Ultra observed a protected branch push. This portable hook cannot receive "
            "the host's trusted owner-approval receipt, so it does not replace the host's "
            "native authority flow. Proceed only after explicit owner authorization and "
            "verify the remote result."
        )
    if re.search(
        r"\b(?:alembic\s+upgrade|prisma\s+migrate|knex\s+migrate|sequelize\s+db:migrate|rails\s+db:migrate|manage\.py\s+migrate)\b",
        command,
        re.IGNORECASE,
    ):
        return (
            "Ultra observed a database migration command. Confirm the target environment, "
            "backup or rollback path, and owner authorization before any irreversible effect."
        )
    return None


def main() -> int:
    payload = read_payload()
    root = project_root(payload)  # Idle guard: no `.ultra/` means silent exit.
    if root is None:
        return 0
    tool_input = payload.get("tool_input")
    tool_input = tool_input if isinstance(tool_input, dict) else {}
    command = tool_input.get("command")
    if not isinstance(command, str) or not command.strip():
        return 0
    effect = effect_of(command)
    if is_inert_search(effect):
        return 0
    threat = classify(effect, root)
    if threat is None:
        note = advisory(effect, root)
        if note:
            emit_context("PreToolUse", note)
        return 0
    digest = hashlib.sha256(effect.encode()).hexdigest()
    if os.environ.get(APPROVAL_VAR) == digest:
        return 0
    reason = (
        f"Ultra blocked {threat}. Protected effect: the exact shell command, "
        f"digest {digest}. Authorization comes from the owner's environment, never from "
        f"the command text. Either run it yourself, or export "
        f"{APPROVAL_VAR}={digest} in the environment that launches the agent and ask "
        f"again. Prefixing the assignment onto this command does not authorize it."
    )
    print(json.dumps({
        "decision": "block",
        "reason": reason,
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        },
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
