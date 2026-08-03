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
2. Read `CONTEXT.md` at the repository root for vocabulary already settled, and
   `.ultra/decisions/` for any entries preserved by a partial setup.
3. Establish the route's facts from the filesystem, not by asking.

## Definition of done

- `.ultra/north-star.md` carries the owner's one-line goal in their own words.
- Every `## Hard Constraints` entry has a stable `HC-<n>` id and can veto a
  concrete technical decision. "Should be usable" vetoes nothing and is not yet a
  constraint; "first paint under two seconds" is. Same bar for the success
  metric: a threshold, not an aspiration. See
  `../ultra-grilling/references/reframing.md` for what counts as an answer.
- Every file listed under **What gets written** exists; you read each one back
  after writing and stopped at the first one missing.
- `.git` exists. Any initial commit is a separately authorized delivery effect.
- Nothing is invented: what is unknown says `[NEEDS CLARIFICATION]`.

## Which route

Check the filesystem in this order and take the first match:

| Check | Route | What changes |
|---|---|---|
| `docs/` holds two or more non-README `.md` files, or `docs/adr/` or `doc/` exists | Documented brownfield | Write everything; cite maintained documents as evidence and preserve their repository paths in `trace_to` when they remain authoritative |
| A language configuration file exists and the row above did not match | Brownfield | Write everything; record what a code scan shows in `architecture.md` and `discovery.md`, marked as observed and unverified |
| Neither | Greenfield | Write everything |

For either brownfield route, read `references/brownfield-adoption.md`. Existing docs
are evidence or an explicitly retained authority; they never justify omitting the
canonical specification skeleton that downstream workflows require.

## Draw out the intent

Follow `../ultra-grilling/SKILL.md`. It is a loop, not a questionnaire, because
the owner cannot state what they want up front. Start from what they already said
when invoking you, restate it for confirmation, and ask only about what is
genuinely missing. Five things come out of it:

| What you draw out | Where it lands |
|---|---|
| What you want to build, in one sentence, their words | `north-star.md`, `## One-line` |
| What counts as success | `specs/product.md`, behavioral requirements and acceptance |
| What must never happen | `north-star.md`, `## Hard Constraints`, one `HC-<n>` per line |
| Who uses it, and how they cope today | `discovery.md`, marked as the owner's statement |
| **What you already know you are unsure about** | `discovery.md` — research's priority queue |

When the first domain terms appear, follow `../ultra-domain-modeling/SKILL.md`
and create `CONTEXT.md` at the repository root.

## What gets written

Resolve this loaded Skill's directory, then run
`node <ultra-init-skill-dir>/scripts/init_project.cjs --project <repository-root>`. The script copies
only missing files from `assets/project-template`, preserves every existing authority
file byte-for-byte, and reads the resulting skeleton back. Then fill its semantic
placeholders from verified facts and owner decisions.

```text
.ultra/north-star.md                                ## One-line, ## Hard Constraints
.ultra/specs/{product,architecture,discovery}.md    ## Observed, ## Decisions, ## Unknowns
.ultra/tasks.json                                   {"tasks": []}
.ultra/test-report.json                             not-yet-run report with git_commit
.ultra/{contexts,decisions,evidence,research}/ and changes/{active,archive,abandoned}/
CONTEXT.md                                          repository root, once a term is settled
```

The copied `.ultra/.gitignore` excludes `.runtime/`, `progress/`, and `reviews/`
without editing the owner's root ignore file. Those paths are exact — hooks and later
skills read them by name. Every section left unfilled carries
`[NEEDS CLARIFICATION]`, and which of those you resolve now has a checkable rule:
**what can be read out of repository files, you fill; what needs investigation,
research fills.**

Git is not a preference. Reconciliation reads `git log` and `git diff`, staleness
detection compares against `HEAD`, archiving is a `git mv`, and rollback is Git.
If `.git` is absent, run `git init`. Report the uncommitted initialized files and ask
for commit authority only if the owner wants that separate effect now.

## When the owner decides

Only the five things above, and only through the grilling loop. Replacing
authority that already exists and looks healthy is the owner's call, never a
convenience on the way to a clean start — preserve it and report what you found.

Where the host cannot ask at all, leave the one-line goal empty and say plainly
that it is empty. Do not infer it from the directory name. An empty one-line goal
is a **blocking** state, not a note: goal injection, boundary read-back and a
Change's touched-constraints field all read from it, so planning and development
must not start until it is filled. Say that too, and recommend rerunning this
skill on a host that can ask.

## References

- `../ultra-grilling/SKILL.md` — the loop; read it before the first question.
- `../ultra-domain-modeling/SKILL.md` — read when the first term needs writing.
- `references/brownfield-adoption.md` — read for either existing-code route.
- `../ultra-think/references/autonomy-boundary.md` — read before touching
  authority that already exists.
