---
name: gemini-collab
description: Ask Gemini CLI for an explicitly requested, read-only second opinion on a bounded review, diagnosis, architecture, or comparison question.
---

# Gemini Collaboration

Claude Code remains primary and owns scope, evidence, edits, verification, and the final answer.
Gemini is an untrusted read-only advisor. Use this skill only when the user explicitly requests a
Gemini perspective.

## Preconditions

1. Confirm `gemini --version` and authentication.
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

Create a session directory under `.ultra/collab/`, then use Gemini's plan approval mode:

```bash
SESSION_PATH=".ultra/collab/$(date +%Y%m%d-%H%M%S)-gemini-<mode>"
mkdir -p "${SESSION_PATH}"
gemini --approval-mode plan \
  --output-format text \
  -p "<bounded prompt>" \
  > "${SESSION_PATH}/gemini-output.md" \
  2> "${SESSION_PATH}/gemini-error.log"
```

Do not use auto-edit, YOLO, or permission bypass.

## Synthesis

1. Read the output only after the process exits and the file is non-empty.
2. Verify consequential claims against the current checkout, tests, runtime, or primary docs.
3. Separate agreement, useful dissent, and unsupported assertions.
4. Return one Claude Code-owned conclusion; do not paste an unreviewed advisor transcript.

If Gemini is missing, unauthenticated, times out, or returns empty output, report the degraded path
and continue with primary evidence. Never block the user's task solely on advisor failure.
