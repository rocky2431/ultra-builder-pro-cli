---
name: ultra-think
description: Resolve a consequential product, architecture, or recovery question through evidence-first reasoning and adaptive user alignment. Use when a material decision cannot be derived safely from accepted intent and current evidence.
---

# Align without suppressing judgment

Thinking is optional. Answer self-contained questions directly. Persist only a
project-bound decision that must survive interruption or control later work.

## Reason and interact

1. Call `ultra.context` for the relevant project or Change scope.
2. Define the real decision and the constraints that can change its answer.
3. Inspect source, runtime, tests, accepted artifacts, and primary documentation
   before asking the owner for facts.
4. Separate verified fact, evidence-backed inference, accepted intent, delegated
   implementation judgment, and unresolved owner choice.
5. Stress-test the leading answer with its strongest failure path and recovery.

Read `references/decision-dialogue.md`. Reuse a clear decision already present in the
request. Decide reversible delegated implementation details yourself. When owner
authority is necessary, ask one dependent decision through the host-native question
surface with a recommendation, decisive evidence, and the effect of the answer.

## Persist only the normalized result

Use one `ultra.record` batch for `decision.thread_start`, `decision.open`, the
appropriate resolve/delegate/defer/supersede operation, the owning artifact mutation,
and `decision.complete` when they are all known. Store normalized decisions and
artifact references, never transcripts or internal reasoning.

A semantic rejection remains a mutable diagnostic. Correct the record or intentionally
abandon the draft; do not invent a new decision merely to satisfy a state machine.

Return the conclusion, decisive evidence, uncertainty, affected authority, and the
model's recommended next explicit capability. Thinking never performs unrelated
implementation or an external effect. Do not invoke the next capability automatically.
