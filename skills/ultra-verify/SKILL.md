---
name: ultra-verify
description: Run independent two-model verification with the current host as primary and one installed read-only advisor, then verify and synthesize both evidence sets. Use only when the user explicitly requests cross-model verification.
---

# Run independent cross-model verification

Keep the current host responsible for scope, evidence, edits, verification, and the
final answer. Use one installed collaboration companion that invokes a different CLI;
never recurse into the current host or treat advisor output as authority.

## Modes

- `decision`: one consequential architecture or product choice;
- `diagnose`: independent root-cause hypotheses;
- `audit`: evidence-backed findings over a bounded scope;
- `estimate`: an estimate with explicit assumptions and uncertainty.

## Workflow

1. Define the workspace, question, evidence standard, and response shape. Confirm the
   selected advisor CLI and authentication. Exclude secrets and unrelated files.
2. Create `.ultra/collab/<session-id>/` and write the current host's independent,
   evidence-backed analysis to `host-analysis.md` before reading advisor output.
3. Follow the installed collaboration companion's read-only invocation contract. Give
   the advisor the same bounded question and evidence, without the primary conclusion
   when independence matters. Store its result as `advisor-output.md` and diagnostics
   as `advisor-error.log`.
4. Run `scripts/verify_wait.py <session-path> --advisor advisor --output
   advisor-output.md` from this skill directory. Use a yielded shell session and poll
   in bounded intervals; do not hold one blocking tool call longer than one minute.
5. Read advisor output only after the waiter reports a complete, non-empty file.
6. Verify consequential claims against the current checkout, tests, runtime, or
   primary documentation. Explain scope, version, evidence, and assumption differences
   before resolving disagreement.
7. Write `metadata.json` and `synthesis.md`, then return one host-owned conclusion.

Read `references/cross-verify-modes.md` for mode-specific evidence and
`references/evidence-status.md` when the synthesis needs an evidence status. Model agreement
never overrides failing tests or authoritative runtime evidence.

Advisor failure degrades to the primary analysis with a single-source warning. It
never blocks the user's underlying task.
