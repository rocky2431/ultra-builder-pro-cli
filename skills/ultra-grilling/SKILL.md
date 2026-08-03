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

- Every field the caller named as required is either answered in the owner's own
  words or explicitly deferred with the reason recorded. "Every branch of the
  tree" is not something you can check against a file; the caller's field list is.
- The reframe below was put to the owner and either confirmed or corrected. It is
  never skipped because the original wording sounded clear.
- Each answer carries the owner's confirmation, rather than something that
  sounded like agreement.
- The calling skill holds a decision list it can write to a file: one line per
  decision, each with the options rejected and why.

## Extract, reframe, then ask

**Extract.** Restate what the owner already told you and ask them to confirm the
restatement. Ask only about what is genuinely missing. Re-asking something they
answered teaches them that answering does not stick.

**Reframe.** The owner describes a *form* when they want a *role*. Say what you
believe they actually want, name the gap against their wording, and end on a
question:

> You said a daily briefing app. What you described is a personal chief of staff
> — the briefing is one of its outputs, not the thing itself. Have I got that
> right?

This is what separates the loop from a questionnaire. A form accepted at face
value yields a specification that is internally consistent and builds the wrong
product. Offer the reframe, never assert it, and treat a correction as the better
outcome — "no, it really is just the briefing" is a constraint you did not have a
minute ago. Read `references/reframing.md` for when it applies and how it fails.

**Then ask** only what the confirmed reframe leaves open.

## One question per turn

Ask through the host's native question surface, one unresolved choice at a time,
and wait for the answer. Several questions at once gets the easy one answered and
the load-bearing one skipped.

Every question carries your recommended answer and what would change it. A
question without a recommendation hands your own work back to the owner.

Order questions so that answering one unlocks the next. Ask the framing questions
before the detail questions — a detail settled inside the wrong frame has to be
asked again.

**Framing questions** come first — at most five, from the table in
`references/reframing.md`. They refuse the owner's framing on purpose, which is
how they surface what the request left out. Stop early once the frame stops
moving.

**Detail questions** fill in the confirmed frame:

- What happens when this goes wrong, and how would we find out?
- Which of these options is cheaper to reverse?
- What are we deliberately not doing?
- What does done look like, concretely enough to check?

An answer counts once it is specific enough to **rule something out**. "It should
be fast" rules nothing out; "the list renders before they finish typing" does.
When an answer rules nothing out, ask what would have to be true for the owner to
*reject* a candidate solution.

Skip what you can derive, what does not change the work, and what they already
settled.

## When the owner decides

This whole skill is owner-facing, so the boundary is narrow: hold the loop open
until each decision is confirmed explicitly, and start no implementation on an
inferred consensus.

## How the loop ends

Every ending hands back the same artifact: the decisions written one per line,
each with the options rejected and the reason they lost. The caller chooses where
it lands — `north-star.md`, `discovery.md`, a Change intent, or a decision file.

- **Resolved** — every required field answered or explicitly deferred.
- **Stalled** — two consecutive turns add no newly confirmed decision. Hand back
  the open fields and what each one blocks.
- **Unavailable** — the host cannot ask, or the owner stopped answering. Hand back
  the last confirmed state, every unanswered field named.

A loop with no exit traps the owner as much as you: re-asking what they cannot
currently answer costs more than deferring it. Deferral is a recorded outcome,
not a failure. Where the host has no structured question surface, ask one plain
question per turn instead.

## References

- `references/reframing.md` — read before the first question: when to reframe,
  how it fails, the five framing questions, and what counts as an answer.
- `../ultra-think/references/autonomy-boundary.md` — read when an answer removes
  something the specification already promised, or otherwise crosses C5.
