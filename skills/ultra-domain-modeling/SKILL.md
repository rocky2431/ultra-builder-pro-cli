---
name: ultra-domain-modeling
description: Settle the project's vocabulary into CONTEXT.md — one opinionated definition per term, the rejected wordings, the relationships between terms, and the ambiguities already resolved. Use when another skill changes the shared language, meaning a term gets coined, two words compete for one concept, or one word turns out to mean two things.
---

# Keep one file that fixes what each domain word means

This is how implementation reaches the earlier documents — not by better
retrieval, but by needing less of it. `CONTEXT.md` is a compressor, not an index.
What implementation lacks is rarely the content of the product specification; it
is the vocabulary, so that trace anchors, variable names, function names, and
test names all line up. It serves Goal 4, Cognitive Coherence.

## Before you start

1. Read `CONTEXT.md` at the repository root if it exists. Every skill reads it
   for vocabulary; this one is for the moments that *change* it.
2. Read the owner's current wording verbatim — their words are the raw material.
3. Check the code for the same concept: type names, table names, function names.

## Definition of done

- Every term settled in this exchange is in the file, written the moment it was
  settled rather than batched at the end.
- Each entry defines what the term *is* in one or two sentences, and lists the
  wordings that lost.
- The file still holds vocabulary only, carrying no implementation detail.

## The file

Create it at the repository root the first time a term is actually settled, not
before. This is the whole format:

```markdown
# {project name}

{One or two sentences: what this context is and why it exists.}

## Language

**Order**:
{One or two sentences. Define what it is, not what it does.}
_Avoid_: Purchase, Transaction

## Relationships

- One **Issue tracker** holds many **Issue**

## Flagged ambiguities

- "backlog" meant both the tool and the set of work — settled as **Issue tracker**
```

## Sharpen the language as it is spoken

When several words compete for one concept, pick the best one and send the rest
to `_Avoid_`. Keep only terms this project gives specific meaning to; general
programming concepts stay out.

- Name the conflict the moment it appears: the vocabulary defines cancellation
  as one thing, and this sentence uses it as another — which one is meant?
- Sharpen a vague word on the spot: "account" is either Customer or User.
- Pressure-test a boundary with a concrete scenario.
- Cross-check against the code: it cancels a whole Order, yet the description
  allows cancelling part of one — which is true?

## When the owner decides

A term's meaning is the owner's to settle; you supply the candidates, the
conflict you found, and your recommendation. Where the answer is a genuine
trade-off, hard to reverse, and would look strange to a reader without the
background, it belongs in a decision record instead of a vocabulary entry. All
three have to hold, or `decisions/` fills with a log. Create that directory on
the first record that qualifies.

## References

- `.ultra/PHILOSOPHY.md` — read when renaming a term already used in an accepted
  specification; renaming what the specification promised is a C5 boundary.
