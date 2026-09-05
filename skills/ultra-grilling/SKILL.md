---
name: ultra-grilling
description: Turn caller-named missing owner decisions into confirmed answers, one question per turn and each carrying a recommendation; ask only what current evidence leaves genuinely open. Use when Init needs a raw brief field, Research needs an owner decision, or Change and Plan need an explicit boundary or acceptance criterion.
---

# Turn a vague ask into a decision list the owner has explicitly confirmed

No-one knows exactly what they want at the start. This prevents the misalignment
that surfaces at the end, when both sides believed they had agreed and the
finished work proves otherwise. It serves Goal 1, Intent Fidelity. Questions are
the owner's scarcest input: this loop spends them only where evidence shows a
decision is genuinely still missing.

## Before you start

1. Reread what the owner said in the current request, verbatim.
2. Read `.ultra/project-brief.md`, `.ultra/north-star.md`, and `CONTEXT.md` where they
   exist. Raw intake is reusable input; accepted wording must not be re-asked.
3. Look up every fact you can reach on your own: repository files, Git history,
   installed dependencies, tool output.
4. Carry forward every answer the owner already gave explicitly — in this
   request, earlier in the conversation, or in recorded authority. An explicit
   owner answer already counts as answered: never restate it for confirmation,
   re-ask it, or re-confirm an acceptance of a candidate the owner already
   accepted as displayed.

Facts are yours to find, decisions are the owner's to make. A question they could
have answered by reading the repository spends the one input only they can give;
a question they have already answered teaches them that answering does not stick.

## Definition of done

- Every field the caller named as required is either answered in the owner's own
  words or explicitly deferred with the reason recorded. "Every branch of the
  tree" is not something you can check against a file; the caller's field list is.
- Every interaction is triggered by evidence: a restatement only where the
  owner's words are ambiguous or the record lacks their explicit answer, a
  reframe only where the triggers in `references/reframing.md` are met, and a
  re-confirmation only for an answer that was inferred or came from someone
  other than the owner. Nothing in this loop is asked unconditionally.
- Each recorded answer traces to the owner's explicit words or acceptance — an
  actual owner answer, never something that sounded like agreement and never
  your own inference.
- The caller owns the final artifact and receives a decision list it can write: one
  line per decision, each with the options rejected and why.

## Reuse, clarify, then ask

**Reuse.** Start from the answers the owner already gave explicitly and from
accepted authority, and treat them as settled input. Do not play their own words
back to them as a question. Restate for confirmation only the part where two
readings of the same words would produce materially different work, and ask
which reading they mean.

**Clarify.** Ask a clarifying question only when the evidence shows a material
gap: a required field has no answer on record, the words support two materially
different builds, or the request cannot be satisfied as worded. A concrete,
bounded deliverable proceeds as given — never broaden a simple deliverable into
a grander product by default, and never quietly shrink it either. When the
reframing triggers in `references/reframing.md` are met, offer the reframe as a
hypothesis about their intent and treat a correction as the better outcome: "no,
it really is just the briefing" is a constraint you did not have a minute ago.
An owner who has rejected a proposed reframing has confirmed their frame; record
that and stop re-offering cosmetic reinterpretations.

**Then ask** only what remains open; the caller sets the semantic depth, so Init stops at the raw outline and leaves baseline questions to Research.

## One question per turn

Ask through the host's native question surface, one unresolved choice at a time,
and wait for the answer. Several questions at once gets the easy one answered and
the load-bearing one skipped.

Every question carries your recommended answer and what would change it. A
question without a recommendation hands your own work back to the owner.

Order questions so that answering one unlocks the next. Ask the framing questions
before the detail questions — a detail settled inside the wrong frame has to be
asked again.

**Framing questions** come first, but only while the frame itself is genuinely
open. Select only prompts from `references/reframing.md` that can change the
current frame; they refuse the owner's framing on purpose, which is how they
surface what the request left out. Stop once the owner confirms the frame or
further prompts cannot distinguish a materially different build; a question
count never decides that. A request whose frame is already confirmed or clearly
bounded skips framing questions entirely.

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
until each still-unresolved material decision is confirmed explicitly, and start
no implementation on an inferred consensus. A decision the owner already
answered explicitly stays closed; an inference — yours or another agent's — is
never an owner answer.

Acceptance of a candidate a caller composed — a synthesized North Star, a
proposed boundary — is the owner responding to that candidate as displayed:
plain-language acceptance, a revision, or a rejection, with no magic keyword and
no second approval. Reuse a real acceptance of the same unchanged candidate
wherever it is recorded. The raw request, an instruction to build, permission to
use a workflow, an unavailable question channel, and your own reasoning that the
candidate merely restates the owner's words are neither question nor answer for
this decision: when that acceptance is missing, hand back the draft or the last
genuinely accepted revision, name the open candidate decision once in plain
language, and let the caller continue the work its own authority already covers.
A rejected or revised candidate never inherits an earlier acceptance.

## How the loop ends

Every ending hands back the same result: decisions written one per line, each with
the options rejected and the reason they lost. The caller alone chooses the canonical
destination; Grilling never promotes an answer into project authority by itself.

- **Resolved** — every required field answered or explicitly deferred.
- **Stalled** — the evidence shows that another in-scope question cannot produce a new
  decision without unavailable owner input or a newly framed choice. Hand back the open
  fields, the attempted distinctions, and what each one blocks; do not infer this from
  a turn count.
- **Unavailable** — the host cannot ask, or the owner stopped answering. Hand back the
  last confirmed state, every unanswered field named; an unavailable channel or an
  unanswered question is itself never an owner answer.

A loop with no exit traps the owner as much as you: re-asking what they cannot
currently answer costs more than deferring it. Deferral is a recorded outcome,
not a failure. Where the host has no structured question surface, ask one plain
question per turn instead.

## References

- `references/reframing.md` — read before the first question: when a reframe is
  triggered and when it is not, how it fails, the framing prompts, and what
  counts as an answer.
- `../ultra-think/references/autonomy-boundary.md` — read when an answer removes
  something the specification already promised, or otherwise crosses C5.
