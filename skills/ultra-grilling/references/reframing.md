# Reframing: recovering the role from the form

An owner fluent in their own domain still describes a **form** when what they
want is a **role**. They are not being vague; they are naming the nearest thing
they can picture. Taken at face value, that name produces a specification that is
internally consistent and builds the wrong product.

## When to reframe

Most first asks qualify. Any one of these is enough:

- the request names an artifact — an app, a dashboard, a bot, a script — rather
  than an outcome;
- the request names a solution whose problem has not been stated;
- the request would be satisfied by something far smaller, or is impossible as
  worded;
- two readings of the request would lead to materially different builds;
- the request describes what a competitor has, rather than what the owner needs.

## How to put it

State what you believe they want, name the gap against the words they used, and
end on a question:

> You said a daily briefing app. What you described is a personal chief of staff
> — the briefing is one of its outputs, not the thing itself. Have I got that
> right?

Rules that keep this honest:

- **One reframe at a time.** Two competing reinterpretations in one turn is a
  quiz, and the owner will pick the one that sounds more flattering.
- **Offer it, never assert it.** A reframe is a hypothesis about their intent,
  and they are the only authority on it.
- **A correction is the better outcome.** "No, it really is just the briefing" is
  a constraint you did not have a minute ago. Record it as a decision.
- **Never reframe toward what is easier to build.** If your reinterpretation
  happens to shrink the work, say that out loud and let the owner weigh it.
- **Stop after two rejected reframes.** A third is no longer listening. Take the
  owner's framing as given and move to the framing questions below.

## Framing questions

These refuse the owner's framing on purpose, which is how they surface what the
request left out. Ask at most five, and stop early once the frame stops moving.

| Question | What it recovers |
|---|---|
| What do you do today, without this? | The real job, with the proposed form stripped off |
| What would make you say this was a waste of effort? | Success via its negative — people picture failure far more concretely than they picture success |
| What must never happen, even if it would work better? | The hard constraints they were never going to volunteer |
| If it could only do one thing and you would still use it, which? | Core against periphery, before scope has a chance to spread |
| Whose situation gets worse when this exists? | Stakeholders, and the constraints attached to them |

Two of these are worth their place for a specific reason. Asking for success
directly gets an aspiration; asking what would make it a waste gets a threshold.
Asking who is made worse off surfaces the constraints an owner never thinks to
state, because to them they are simply how the world is.

## What counts as an answer

An answer counts once it is specific enough to **rule something out**.

| Not yet an answer | An answer |
|---|---|
| "It should be fast" | "The list renders before they finish typing" |
| "It should be secure" | "A support agent must never see a full card number" |
| "Keep costs reasonable" | "Under fifty dollars a month in API spend" |

When an answer rules nothing out, do not re-ask the same question louder. Ask
what would have to be true for the owner to **reject** a candidate solution — the
rejection criterion is the constraint, stated from the other side.
