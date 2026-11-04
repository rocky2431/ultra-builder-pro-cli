#!/bin/sh
# Headless Claude Code reviewer for `ubp drive --reviewer`, run once at the milestone gate.
# The engine sets UBP_ROOT, UBP, UBP_DRIVE, UBP_MILESTONE and UBP_REVIEW (the review file to
# write), and puts its own `ubp` first on PATH.
# It runs with edits accepted and Bash allowed, without a sandbox: use it only on a
# repository you are willing to let an agent change. Copy it and adjust before use.
# Outward commands that cannot be undone are denied by Claude Code permission rules
# (--disallowedTools below). Ceiling: they match command prefixes, so they stop `git push`,
# `git -C <dir> push` and compound forms (checked with claude -p on 2026-11-04) but not a push
# made inside a script. The stronger guard is a work tree with no push remote; add the
# deploy and release CLIs your project uses to the list.
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

The Owner's rule is that a check that could be stronger never blocks. So a finding blocks only
when the product, as HEAD builds it, breaks a requirement's \`Done when\` line or the
Direction, or does something wrong that you can reproduce through its real interface. Wrong
means it contradicts the text of the spec (a requirement, the Interface or the Direction),
loses or corrupts data, crashes, or opens a security hole. An acceptance gap does not block
once you have driven HEAD through its real interface on the input the broken copy got wrong
and seen it behave correctly: quote what HEAD did, name the check that would close the gap
under \"What must be said to the Owner\", and keep the verdict accept. If the latest earlier
review of this milestone in .ultra/records/milestones/ (\`$UBP_MILESTONE-review-<n>.md\`) ends
with \`Verdict: revise\`, also check each of its blocking findings and look for regressions.
Quote an earlier verdict only inside a code fence.

Write $UBP_REVIEW and nothing else in the repository (no commits, no other edits): a first
line \`Reviewer: claude -p (${UBP_REVIEWER_MODEL:-opus}), fresh session\`, then the findings
that block (each with its evidence, the \`Done when\` line, Direction or reproduction it rests
on, and the layer it belongs to: L4 implementation, L2 design, L1 acceptance or requirements,
L0 direction), then a section \"What must be said to the Owner\" with everything else, then
exactly one line \`Verdict: accept\` (no finding blocks) or \`Verdict: revise\`. Stop every
server you start by its PID."
exec claude -p "$PROMPT" --model "${UBP_REVIEWER_MODEL:-opus}" --output-format json \
  --setting-sources project --strict-mcp-config --disable-slash-commands \
  --no-session-persistence --permission-mode acceptEdits \
  --allowedTools "Bash,Read,Edit,Write,Glob,Grep" \
  --disallowedTools "Bash(git push *)" "Bash(git * push *)" "Bash(npm publish *)" "Bash(gh *)"
