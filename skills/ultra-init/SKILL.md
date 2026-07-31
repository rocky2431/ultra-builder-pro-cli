---
name: ultra-init
description: Establish a project's Ultra authority as files — the owner's one-line goal, hard constraints, the three specification skeletons, an empty task ledger, and Git. Use when a repository has no `.ultra` directory yet, or has a partial one left by an interrupted setup, whether the codebase is new or already carries years of history.
---

# Build the skeleton the rest of the workflow writes into

Initialization creates the repository-local authority and nothing else.
It does not perform research, accept a product baseline, choose a Change, or
start another capability — recommend the next one and stop; do not invoke it.

The dividing line against research is **authorization versus claim**. What the
owner authorizes comes out of their head and evidence cannot overturn it. What
research collects is a claim about the outside world, which evidence can confirm
or refute. A technology choice is a claim, so it is not initialization's business
— and a new project has no configuration files to read anyway.

## Before you start

1. Read `.ultra/tasks.json` if it exists, along with the `context_file` of any
   task it names — a partial `.ultra/` means an earlier attempt stopped midway.
2. Read `CONTEXT.md` at the repository root for vocabulary already settled.
3. Establish the route's facts from the filesystem, not by asking.

## Definition of done

- `.ultra/north-star.md` carries the owner's one-line goal in their own words.
- Every file listed under **What gets written** exists; you read each one back
  after writing and stopped at the first one missing.
- `.git` exists and holds at least one commit.
- Nothing is invented: what is unknown says `[NEEDS CLARIFICATION]`.

## Which route

Check the filesystem in this order and take the first match:

| Check | Route | What changes |
|---|---|---|
| `docs/` holds two or more non-README `.md` files, or `docs/adr/` or `doc/` exists | Follow the existing convention | Write no `.ultra/specs/`; point `trace_to` at the documents already there |
| A language configuration file exists and the row above did not match | Brownfield | Write everything; record what a code scan shows in `architecture.md` and `discovery.md`, marked as observed and unverified |
| Neither | Greenfield | Write everything |

Brownfield writes no separate baseline document — that is one more fixed file and
a second authority for facts the specifications already hold.

## Draw out the intent

Follow `../ultra-grilling/SKILL.md`. It is a loop, not a questionnaire, because
the owner cannot state what they want up front. Start from what they already said
when invoking you, restate it for confirmation, and ask only about what is
genuinely missing. Five things come out of it:

| What you draw out | Where it lands |
|---|---|
| What you want to build, in one sentence, their words | `north-star.md`, `## One-line` |
| What counts as success | `north-star.md` |
| What must never happen | `north-star.md`, `## Hard Constraints` |
| Who uses it, and how they cope today | `discovery.md`, marked as the owner's statement |
| **What you already know you are unsure about** | `discovery.md` — research's priority queue |

When the first domain terms appear, follow `../ultra-domain-modeling/SKILL.md`
and create `CONTEXT.md` at the repository root.

## What gets written

```text
.ultra/north-star.md                                ## One-line, ## Hard Constraints
.ultra/specs/{product,architecture,discovery}.md    ## Observed, ## Decisions, ## Unknowns
.ultra/tasks.json                                   {"tasks": []}
.ultra/contexts/  .ultra/decisions/  .ultra/evidence/
CONTEXT.md                                          repository root, once a term is settled
```

Append `.ultra/progress/`, `.ultra/reviews/` and `.ultra/.runtime/` to
`.gitignore`. Those headings are exact — hooks and later skills read them by
name. Every section left unfilled carries `[NEEDS CLARIFICATION]`, and which of
those you resolve now has a checkable rule: **what can be read out of repository
files, you fill; what needs investigation, research fills.**

Git is not a preference. Reconciliation reads `git log` and `git diff`, staleness
detection compares against `HEAD`, archiving is a `git mv`, and rollback is Git.
If `.git` is absent, run `git init` and make the initial commit without asking.

## When the owner decides

Only the five things above, and only through the grilling loop. Replacing
authority that already exists and looks healthy is the owner's call, never a
convenience on the way to a clean start — preserve it and report what you found.

Where the host cannot ask at all, leave the one-line goal empty and say plainly
that it is empty, that goal injection will therefore be empty, and that the next
skill asks again. Do not infer it from the directory name.

## References

- `../ultra-grilling/SKILL.md` — the loop; read it before the first question.
- `../ultra-domain-modeling/SKILL.md` — read when the first term needs writing.
- `../ultra-think/references/autonomy-boundary.md` — read before touching
  authority that already exists.
