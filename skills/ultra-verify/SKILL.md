---
name: ultra-verify
description: Run independent two-model verification with the current host as primary and a read-only external advisor, then verify and synthesize both evidence sets. Use only when the user explicitly requests cross-model verification.
---

# Run independent cross-model verification

Claude Code writes the first analysis, verifies consequential claims, and owns the
final answer. Codex is an untrusted read-only advisor.

## Modes

- `decision`: one consequential architecture or product choice;
- `diagnose`: independent root-cause hypotheses;
- `audit`: evidence-backed findings over a bounded scope;
- `estimate`: an estimate with explicit assumptions and uncertainty.

## Workflow

1. Confirm the advisor CLI and authentication. Define the exact workspace, question,
   evidence standard, and response shape. Exclude secrets and unrelated files.
2. Create `.ultra/collab/<session-id>/` and write the primary host's evidence-backed
   analysis to `claude-analysis.md` before reading advisor output.
3. Launch Codex with the raw bounded question and evidence in a read-only sandbox. Do
   not include the primary conclusion when independence matters:

   ```bash
   codex exec -s read-only \
     -a never \
     --ephemeral \
     --ignore-user-config \
     --ignore-rules \
     -o "${SESSION_PATH}/codex-output.md" \
     "<bounded prompt>" \
     2> "${SESSION_PATH}/codex-error.log"
   ```
4. Run `scripts/verify_wait.py` resolved relative to this skill directory. Use a
   yielded or asynchronous shell session and poll at bounded intervals; do not hold a
   blocking tool call longer than one minute.
5. Read advisor output only after the waiter reports a complete, non-empty file.
6. Verify both analyses against the current checkout, tests, runtime, or primary
   documentation. Explain scope, version, evidence, and assumption differences before
   judging disagreement.
7. Write session metadata and a synthesis artifact, then return one host-owned
   conclusion.

Read `references/cross-verify-modes.md` for mode-specific evidence and
`references/confidence-system.md` when confidence language is useful. Model agreement
never overrides failing tests or authoritative runtime evidence.

Advisor failure degrades to the primary analysis with a single-source warning. It does
not block the user's underlying task.
