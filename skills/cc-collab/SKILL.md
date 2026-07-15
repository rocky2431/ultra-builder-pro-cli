---
name: cc-collab
description: "Use Claude Code as an explicitly requested, read-only advisor for bounded architecture, diagnosis, or review questions. The current host remains primary and verifies all claims."
argument-hint: "review|understand|opinion|compare|free [target]"
user-invocable: true
---

# Claude Code Collaboration

Use Claude Code only when the user explicitly requests a Claude/CC perspective. The current host
owns scope, evidence, decisions, edits, and final verification. Claude Code is an untrusted,
read-only advisor.

## Preconditions

1. Confirm `claude --version` and authentication.
2. Bound the workspace, files or diff, question, and expected response shape.
3. Write the primary host's independent analysis first when independence matters.
4. Do not pass credentials, unrelated files, or an unbounded home directory.

## Invocation

Run Claude Code without mutation or session persistence:

```bash
claude --safe-mode -p "<bounded prompt>" \
  --permission-mode plan \
  --tools "Read,Grep,Glob,Bash" \
  --output-format text \
  --no-session-persistence
```

Store large output under `.ultra/collab/<session-id>/claude-output.md`. A missing CLI, failed auth,
timeout, or empty response degrades to host-only analysis; it never blocks the task.

## Synthesis

- Verify consequential claims against the current checkout, runtime, tests, or primary docs.
- Separate agreement, useful dissent, and unsupported assertions.
- Explain scope or version mismatches before comparing conclusions.
- Return one host-owned conclusion, not a transcript or a model vote.
