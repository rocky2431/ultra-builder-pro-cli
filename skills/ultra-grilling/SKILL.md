---
name: ultra-grilling
description: Interrogate an owner request until every branch of its decision tree is resolved, one question per turn, each carrying a recommended answer. Use when another skill needs the owner's intent specific enough to build from — a new project's north star, a Change boundary, or an ask whose acceptance criteria are still implicit.
---

# Turn a vague ask into a decision list the owner has explicitly confirmed

No-one knows exactly what they want at the start. This prevents the misalignment
that surfaces at the end, when both sides believed they had agreed and the
finished work proves otherwise. It serves Goal 1, Intent Fidelity.

## Before you start

1. Reread what the owner said in the current request, verbatim.
2. Read `.ultra/north-star.md` and `CONTEXT.md` where they exist. Established
   wording and vocabulary are decisions that were already made.
3. Look up every fact you can reach on your own: repository files, Git history,
   installed dependencies, tool output.

Facts are yours to find, decisions are the owner's to make. A question they could
have answered by reading the repository spends the one input only they can give.

## Definition of done

- Every branch reachable from the original ask is resolved, or deferred with the
  reason recorded.
- Each resolved branch carries the owner's confirmation in their own words,
  rather than something that sounded like agreement.
- The calling skill holds a decision list it can write to a file: one line per
  decision, each with the options rejected and why.

## Extract first, then ask

Restate what the owner already told you and ask them to confirm the restatement.
Ask only about what is genuinely missing. Re-asking something they answered
teaches them that answering does not stick.

## One question per turn

Ask through the host's native question surface, one unresolved choice at a time,
and wait for the answer. Several questions at once gets the easy one answered and
the load-bearing one skipped.

Every question carries your recommended answer and what would change it. A
question without a recommendation hands your own work back to the owner.

Order questions so that answering one unlocks the next, and prefer the ones whose
answer changes what gets built:

- What happens when this goes wrong, and how would we find out?
- Which of these options is cheaper to reverse?
- What are we deliberately not doing?
- What does done look like, concretely enough to check?

Skip what you can derive, what does not change the work, and what they already
settled.

## When the owner decides

This whole skill is owner-facing, so the boundary is narrow: hold the loop open
until each decision is confirmed explicitly, and start no implementation on an
inferred consensus.

Where the host cannot present a structured question, ask one plain question per
turn instead. Where it cannot ask at all, stop at the last confirmed decision,
record what remains open, and hand that back to the caller — neither guessing an
answer nor blocking the owner's next move.

## Hand back a list

Once the tree is walked, write the decisions out one per line, each with the
rejected options and the reason they lost. That list is the record. The caller
chooses where it lands: `north-star.md`, `discovery.md`, a Change intent, or a
decision file.

## References

- `.ultra/PHILOSOPHY.md` — read when an answer crosses the C5 autonomy boundary,
  above all when it removes something the specification already promised.
