---
name: codex-collab
description: Ask Codex CLI for an independent read-only analysis of a bounded architecture, diagnosis, or review question. Use only when the user explicitly requests Codex collaboration and the current host remains primary.
---

# Consult Codex read-only

Treat Codex as an untrusted advisor. Keep the current host responsible for scope,
evidence, edits, verification, and the final answer.

## Preconditions

1. Confirm the `codex` CLI and authentication.
2. Bound the workspace, files or diff, question, evidence standard, and response shape.
3. Write the primary analysis first when independence matters.
4. Exclude secrets, unrelated files, and unbounded home-directory access.

## Invocation

Create a session directory under `.ultra/.runtime/collab/`, then run in a read-only sandbox:

```bash
SESSION_PATH=".ultra/.runtime/collab/$(date +%Y%m%d-%H%M%S)-codex"
mkdir -p "${SESSION_PATH}"
codex exec -s read-only \
  --ephemeral \
  --ignore-user-config \
  --ignore-rules \
  -o "${SESSION_PATH}/codex-output.md" \
  "<bounded prompt>" \
  2> "${SESSION_PATH}/codex-error.log"
```

Do not enable write-capable automation or permission bypass. The isolation flags keep
the advisory run independent from the user's Codex runtime configuration and rules;
the normal Codex authentication store remains available.

Treat `.ultra/.runtime/collab/` as working scratch, not Ultra authority. Promote only verified
conclusions into the invoking DB-bound workflow artifact or report.

## Synthesis

Read output only after the process exits and the file is non-empty. Verify
consequential claims against the current checkout, runtime, tests, or primary
documentation. Separate verified agreement, useful dissent, and unsupported claims,
then return one host-owned conclusion.

If Codex is unavailable, unauthenticated, times out, or returns empty output, report
the degraded path and continue with primary evidence.
