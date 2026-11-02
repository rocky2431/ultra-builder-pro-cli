#!/bin/sh
# Headless Claude Code writer for `ubp drive --writer`. The engine sets UBP_ROOT, UBP_NODE,
# UBP_BRIEF, UBP_ATTEMPT, UBP_DRIVE and UBP, and puts its own `ubp` first on PATH.
# The writer sees the brief and the repository only, never the controller's conversation.
# It runs with edits accepted and Bash allowed, without a sandbox: use it only on a
# repository you are willing to let an agent change. Copy it and adjust before use.
set -eu
cd "$UBP_ROOT"
PROMPT="# Mission: node $UBP_NODE (attempt $UBP_ATTEMPT)

Workspace: $UBP_ROOT (a Git repository). You are the writer of one node. The brief below is
everything you are given; the current code is in the repository.

Call this project's engine as \`eval \"\$UBP <args>\"\` from the workspace (the current
directory is the project root), for example \`eval \"\$UBP check C-1\"\`; a plain \`ubp\` may be
another install. Below, \`ubp <args>\` means exactly that. Work test-first inside the node's
scope. Run the \`ubp check\` line of the brief's rules for this node's checks until they are
green; before \`ubp node done $UBP_NODE\`, also run \`ubp check\` (every stale check):
invariants and checks that were green before must stay green. Red checks of other nodes or of later milestones are expected; leave them alone.

Never edit .ultra/spec.md, .ultra/checks.json, .ultra/plan.json, .ultra/ledger/milestones.jsonl,
.ultra/ledger/approvals.jsonl, .ultra/ledger/plan-log.jsonl or any check's test file, and never
run \`ubp gate\`, \`ubp approve\` or \`ubp milestone close\`: if one of them looks wrong, stop and
say so in .ultra/records/handoffs/$UBP_NODE.md. Write that handoff and commit it with the
code. Commit inside this repository only (local commits); leave the work tree clean; install
nothing. Stop every server you start by its PID, never with a pattern-based kill, and keep
data files in a temp directory outside the repository. Finish with \`ubp node done $UBP_NODE\`.

---

$(cat "$UBP_BRIEF")"
exec claude -p "$PROMPT" --model "${UBP_WRITER_MODEL:-sonnet}" --output-format json \
  --setting-sources project --strict-mcp-config --disable-slash-commands \
  --no-session-persistence --permission-mode acceptEdits \
  --allowedTools "Bash,Read,Edit,Write,Glob,Grep"
