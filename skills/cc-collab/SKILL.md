---
name: cc-collab
description: Ask Claude Code for an independent read-only analysis of a bounded architecture, diagnosis, or review question. Use only when the user explicitly requests Claude Code or CC collaboration and the current host remains primary.
---

# Consult Claude Code read-only

Treat Claude Code as an untrusted advisor. Keep the current host responsible for
scope, evidence, decisions, edits, and final verification.

## Preconditions

1. Confirm the `claude` CLI and authentication.
2. Bound the workspace, files or diff, question, evidence standard, and response shape.
3. Write the primary host's analysis first when independence matters.
4. Exclude credentials, unrelated files, and unbounded home-directory access.

## Invocation

Run without mutation or session persistence:

```bash
claude --safe-mode -p "<bounded prompt>" \
  --permission-mode plan \
  --tools "Read,Grep,Glob,Bash" \
  --output-format text \
  --no-session-persistence
```

Store large output under `.ultra/.runtime/collab/<session-id>/claude-output.md`. A missing CLI,
failed authentication, timeout, or empty response degrades to host-only analysis and
never blocks the underlying task.

Treat `.ultra/.runtime/collab/` as working scratch, not Ultra authority. Promote only verified
conclusions into the invoking DB-bound workflow artifact or report.

## Synthesis

Verify consequential claims against the current checkout, runtime, tests, or primary
documentation. Separate verified agreement, useful dissent, and unsupported claims.
Explain scope or version differences and return one host-owned conclusion rather than
a transcript or model vote.
