#!/bin/sh
# Headless Claude Code reviewer for `ubp drive --reviewer`, run once at the milestone gate.
# The engine sets UBP_ROOT, UBP, UBP_DRIVE, UBP_MILESTONE and UBP_REVIEW (the review file to
# write), and puts its own `ubp` first on PATH.
# It runs with edits accepted and Bash allowed, without a sandbox: use it only on a
# repository you are willing to let an agent change. Copy it and adjust before use.
set -eu
cd "$UBP_ROOT"
PROMPT="# Mission: whole-branch review of milestone $UBP_MILESTONE

Workspace: $UBP_ROOT (a Git repository). You wrote none of this milestone's code. If you
need this project's engine, call it as \`eval \"\$UBP <args>\"\` (a plain \`ubp\` may be another
install); \`ubp check\` and \`ubp gate\` write the ledger, so prefer running tests on a copy.

Read: the milestone's requirements in .ultra/spec.md (the Direction and Interface sections
too), the milestone's diff (from the commit that last changed .ultra/ledger/milestones.jsonl
to HEAD), .ultra/ledger/plan-log.jsonl and .ultra/rulings.md since that commit, and the
handoffs under .ultra/records/handoffs/. Then drive the product by hand through its real
interface, and run the milestone's checks against deliberately broken copies of the code: make
each copy in a temporary directory outside the repository, never in it. A check that passes on
a broken copy is an acceptance gap. Run the checks once on an unmodified copy of HEAD too
(\`git archive HEAD\`): a fix that lives only in a file Git ignores passes in the work tree.

The bar for revise: the product, as HEAD builds it, breaks a requirement's \`Done when\` line
or the Direction, or does something wrong that you can reproduce through its real interface.
An acceptance gap where HEAD behaves correctly does not block: describe it, with the check
that would close it, under \"What must be said to the Owner\", and keep the verdict accept. If
.ultra/records/milestones/ holds an earlier review of this milestone
(\`$UBP_MILESTONE-review-<n>.md\`), start from the latest one: check each of its revise findings
and look for regressions. Only those decide your verdict; anything new you find, a defect
included, goes under \"What must be said to the Owner\".

Write $UBP_REVIEW and nothing else in the repository (no commits, no other edits): a first
line \`Reviewer: claude -p (${UBP_REVIEWER_MODEL:-opus}), fresh session\`, then the findings
(each with its evidence and the layer it belongs to: L4 implementation, L2 design, L1
acceptance or requirements, L0 direction), then a section \"What must be said to the Owner\",
then exactly one line \`Verdict: accept\` or \`Verdict: revise\`. Stop every server you start by
its PID."
exec claude -p "$PROMPT" --model "${UBP_REVIEWER_MODEL:-opus}" --output-format json \
  --setting-sources project --strict-mcp-config --disable-slash-commands \
  --no-session-persistence --permission-mode acceptEdits \
  --allowedTools "Bash,Read,Edit,Write,Glob,Grep"
