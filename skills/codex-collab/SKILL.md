---
name: codex-collab
description: Ask Codex CLI for an explicitly requested, read-only second opinion on a bounded review, diagnosis, architecture, or comparison question.
---

# Codex Collaboration

Claude Code remains primary and owns scope, evidence, edits, verification, and the final answer.
Codex is an untrusted read-only advisor. Use this skill only when the user explicitly requests a
Codex perspective; do not invoke it as a routine substitute for native review or subagents.

## Preconditions

1. Confirm `codex --version` and authentication.
2. Fix the workspace, files or diff range, question, evidence standard, and expected response shape.
3. Write the primary analysis first when independence matters.
4. Never send secrets, unrelated files, or an unbounded home directory.

## Modes

- `review`: findings against an exact diff or file set.
- `understand`: a bounded architecture or flow question.
- `opinion`: one decision with named constraints and alternatives.
- `compare`: independent answers to the same question.
- `free`: another tightly scoped read-only prompt.

## Safe invocation

Create a session directory under `.ultra/collab/`, then run Codex without workspace-write or
danger-full-access:

```bash
SESSION_PATH=".ultra/collab/$(date +%Y%m%d-%H%M%S)-codex-<mode>"
mkdir -p "${SESSION_PATH}"
codex exec -s read-only \
  -o "${SESSION_PATH}/codex-output.md" \
  "<bounded prompt>" \
  2> "${SESSION_PATH}/codex-error.log"
```

Do not enable write-capable automation or permission bypass. This skill has no dependency on
another Codex plugin or slash command.

## Synthesis

1. Read the output only after the process exits and the file is non-empty.
2. Verify consequential claims against the current checkout, tests, runtime, or primary docs.
3. Separate agreement, useful dissent, and unsupported assertions.
4. Return one Claude Code-owned conclusion; do not paste an unreviewed advisor transcript.

If Codex is missing, unauthenticated, times out, or returns empty output, report the degraded path
and continue with primary evidence. Never block the user's task solely on advisor failure.
