"""Gemini hook adapter — Phase 3.8 stub (documented downgrade).

Gemini has no public hook event surface as of Phase 3. The only injection
point is the session prompt (GEMINI.md) — effectively "prompt-guard only".

Responsibility (Phase 4 target):
  - render a condensed version of the Claude hooks' guidance into the
    Gemini extension's prompt context so the agent self-enforces the
    rules that hooks normally enforce at runtime.
  - specifically: include references to
    * post_edit_guard rules (SQL safety, test pairing)
    * block_dangerous_commands list (rm -rf, force-push, etc.)
    * pre_stop_check P0 gate (P0 review findings must resolve before stop)

What this adapter CANNOT do (until Gemini adds hook events):
  - block a tool call mid-execution — guidance only
  - write to session_journal (no stop event to trigger the write)
  - react to UserPromptSubmit

User expectation: on Gemini, hook-enforced invariants rely on the agent's
self-discipline informed by prompt context. Runtimes with real hooks
remain the gold standard.
"""

# Phase 4 implementation — document-level only; no code path.
