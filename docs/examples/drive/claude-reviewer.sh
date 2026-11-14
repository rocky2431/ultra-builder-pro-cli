#!/bin/sh
# Headless Claude Code reviewer for `ubp drive --reviewer`, run once at the milestone gate.
# The engine sets UBP_ROOT, UBP, UBP_DRIVE, UBP_MILESTONE and UBP_REVIEW (the review file to
# write), and puts its own `ubp` first on PATH.
# It runs with edits accepted and Bash allowed, without a sandbox: use it only on a
# repository you are willing to let an agent change. Copy it and adjust before use.
# Outward commands that cannot be undone are denied by Claude Code permission rules
# (--disallowedTools below). Ceiling: they match command prefixes, so they stop `git push`
# and compound forms (checked with claude -p on 2026-11-04) but not `git -C <dir> push`,
# `git -c k=v push` or a push made inside a script; a mid-command rule like `git * push *`
# would also deny every commit whose message says "push". The stronger guard is a work tree
# with no push remote; add the deploy and release CLIs your project uses to the list.
set -eu
# The reviewer's instructions are the Skill's own reference, read from the package or the
# repository this script sits in; set UBP_REVIEW_GUIDE when you copy the script elsewhere.
HERE=$(cd "$(dirname "$0")" && pwd)
GUIDE="${UBP_REVIEW_GUIDE:-$HERE/../../../skills/ultra/references/review.md}"
[ -r "$GUIDE" ] || { echo "review guide not found: $GUIDE (set UBP_REVIEW_GUIDE)" >&2; exit 2; }
cd "$UBP_ROOT"
PROMPT="# Mission: whole-branch review of milestone $UBP_MILESTONE

Workspace: $UBP_ROOT (a Git repository). Call this project's engine as \`eval \"\$UBP <args>\"\`
(a plain \`ubp\` may be another install). The milestone is $UBP_MILESTONE; your review file is
$UBP_REVIEW, and its first line is \`Reviewer: claude -p (${UBP_REVIEWER_MODEL:-opus}), fresh session\`.
Follow these instructions:

---

$(cat "$GUIDE")"
exec claude -p "$PROMPT" --model "${UBP_REVIEWER_MODEL:-opus}" --output-format json \
  --setting-sources project --strict-mcp-config --disable-slash-commands \
  --no-session-persistence --permission-mode acceptEdits \
  --allowedTools "Bash,Read,Edit,Write,Glob,Grep" \
  --disallowedTools "Bash(git push *)" "Bash(npm publish *)" "Bash(gh *)"
