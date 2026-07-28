---
name: ultra-think
description: Resolve a consequential product, architecture, or recovery question through evidence-first reasoning and adaptive user alignment. Use when a material decision cannot be derived safely from accepted intent and current evidence.
---

# Align without suppressing model judgment

Thinking is an optional reasoning capability, not a mandatory stage. Answer
self-contained questions directly. Use durable decision state only when a
project-bound choice must survive interruption or gate later work.

## Reason first

1. Define the actual decision or disputed claim and the constraints that can change
   its answer.
2. Inspect current authority, source, runtime, tests, and primary documentation before
   asking the user for facts.
3. Separate verified fact, evidence-backed inference, accepted intent, delegated
   implementation judgment, and unresolved owner choice.
4. Form credible alternatives only when alternatives materially help the decision.
   Evaluate them against the real constraints; do not impose a fixed option count,
   scoring system, or confidence percentage.
5. Stress-test the leading answer with its strongest counterexample, likely failure
   path, recovery, and load-bearing assumption.

## Interact adaptively

Read `references/decision-dialogue.md`. If the user already gave a clear decision,
normalize and use it without asking for confirmation. If the decision is reversible
and delegated by the accepted contract, decide it and explain the reasoning.

When owner authority is required, use the host's native question UI when available.
Ask the earliest dependent decision with a recommendation, decisive evidence, and the
effect of the answer. Keep cognitive load small; group only independent, simple facts.
Do not expose the hidden decision queue.

For durable project decisions, use `decision.thread_start`, `decision.open`, and the
appropriate resolve, delegate, defer, or supersede transition. Store normalized
decisions and artifact references, never transcripts or internal reasoning.
Call `decision.complete` when normalized state is settled and no artifact-bound
checkpoint is needed; completion is not another owner approval.

Prepare and confirm a checkpoint only when the decision changes a durable contract or
artifact and a checkpoint is needed for recovery. Do not add a ceremonial approval
gate to an already explicit user instruction or a reversible implementation detail.

## Return control

Return the conclusion, decisive evidence, material uncertainty, and affected
contracts. Re-read the invoking workflow or breadcrumb and recommend one of its
`allowed_transitions`; follow `required_transition` only when a hard invariant leaves
no alternative. Thinking does not implement code, mutate unrelated state, or invent a
canonical next action.
