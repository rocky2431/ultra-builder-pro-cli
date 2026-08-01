---
name: ultra-think
description: Stress-test one consequential product, architecture, recovery, or scope decision and preserve the accepted result when it must outlive the session. Use when another skill needs adversarial reasoning, or when fog of war is too large and unclear to decompose safely.
---

# Turn one consequential uncertainty into an evidence-backed decision

Thinking sharpens a decision; it does not perform the implementation that follows.
Persist only decisions that are hard to reverse, look surprising without context, and
arose from a real trade-off. All three criteria must hold.

## Before you start

1. Read `.ultra/tasks.json` and the current task's `context_file` and `## Resume Note`.
2. Read `CONTEXT.md`, relevant `.ultra/decisions/`, the active Change and its evidence.
3. State the one decision and the assumptions capable of changing its answer.

## Definition of done

- Claims are labelled Fact, Inference or Speculation and cite their evidence.
- The leading answer survived all four adversarial checks below.
- The conclusion includes Confidence %, Key Assumptions and What would change my mind.
- A qualifying durable decision is written once; a local reversible judgment is not.

## Run the adversarial protocol

1. **Steel Man**: build the strongest case for the option you expect to reject.
2. **Pre-Mortem**: assume the choice failed six months later and name the three most
   plausible causes.
3. **Sensitivity**: identify the assumption whose failure would reverse the answer.
4. **Second-Order**: describe the new constraints or failure modes created six to
   twelve months later.

Give the owner one recommendation with the decisive evidence and what changes under
each viable answer. Reuse an answer already explicit in the request.

## Use decision tickets for fog of war

When the work does not fit one session *and* the path itself remains unclear, map one
question instead of manufacturing implementation tasks. Write a decision ticket with
`status: open`; resolve one at a time until no unresolved ticket prevents planning.
Each answer should make the remaining fog of war smaller.

## Write durable decisions

Use `.ultra/decisions/<id>.md`: question, status, options and real trade-offs, accepted
decision, owner, date, evidence, consequences, What would change my mind, and
`supersedes` when applicable. An accepted file is append-only history: overturn it by
writing a new decision that supersedes it.

## When the owner decides

Only the owner accepts a durable decision or a REDUCTION. Reversible implementation
details stay with the model. If the host cannot ask, keep `status: open`, record the
missing answer and stop at that safe point.

## References

- `references/autonomy-boundary.md` — read before changing accepted authority.
- `references/interaction-boundary.md` — read when the host-facing decision needs one
  carefully framed question.
