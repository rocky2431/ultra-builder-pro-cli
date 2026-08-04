---
name: ultra-init
description: Create or recover Ultra's repository-local skeleton and raw Project Brief without performing product research. Use when `.ultra` is absent or partial in a new or existing codebase and later workflows need stable file paths, preserved authority, and Git.
---

# Create the skeleton and capture only the initial project outline

Initialization establishes places for later authority and records raw owner intake. It
does not validate the problem, establish a North Star, build a product or architecture
baseline, settle domain language, choose a Change, or start another public workflow.

## Before you start

1. If `.ultra/changes/active/` exists, resolve at most one active `change_id`. Read
   `.ultra/tasks.json` if it exists, plus the `context_file` and closing `## Resume Note`
   of unfinished tasks matching that id. Historical unfinished rows do not turn a
   partial skeleton into current work. A partial `.ultra/` is recovery work.
2. Read `.ultra/project-brief.md`, `.ultra/north-star.md`, `CONTEXT.md`, and relevant
   `.ultra/decisions/` when they exist. Preserve accepted authority byte-for-byte.
3. Establish the repository root, Git state, and whether meaningful code or maintained
   documentation exists from the filesystem. Do not ask the owner for those facts.

## Definition of done

- `.ultra/project-brief.md` contains raw owner intake: one line, a broad outline,
  explicit inputs already supplied, and open questions handed to Research.
- For a new skeleton, an empty North Star and the three specification skeletons exist.
  Recovery preserves any populated authority; Init does not fill semantic sections or
  create `CONTEXT.md`.
- Every packaged path was read back after copying, while every pre-existing file stayed
  byte-identical.
- `.git` exists. Commit, push, remote creation, and publication remain separate effects.

## Classify only for preservation

Use `references/brownfield-adoption.md` when source, runtime configuration, tests, or
maintained product documentation already exist. Classification changes what must be
preserved and what Research should inspect; it never authorizes Init to write observed
product behavior into a specification.

## Draw out the brief, then stop

Follow `../ultra-grilling/SKILL.md` with only these required fields:

| Raw intake | Project Brief section |
|---|---|
| What the owner wants to build, in one sentence and their words | `## One-line` |
| What it is, broadly for whom or what, intended result, broad boundary | `## Initial Outline` |
| Constraints, materials, and decisions the owner already volunteered | `## Explicit Inputs` |
| Questions already visible but requiring evidence or deeper decisions | `## Open Questions for Research` |

Ask only enough to distinguish materially different outlines. If an answer would define
a problem, actor evidence, desired outcome, success measure, product strategy, accepted
constraint, domain term, requirement, or architecture, record it as an input or open
question and stop drilling. Research owns that maturation and must not re-ask an answer
unless evidence conflicts with it.

## Write and recover the skeleton

Resolve this loaded Skill's directory, then run
`node <ultra-init-skill-dir>/scripts/init_project.cjs --project <repository-root>`.
The script copies only missing files from `assets/project-template`, preserves every
existing file, and reads the complete result back.

```text
.ultra/project-brief.md                            raw intake and initial outline
.ultra/north-star.md                               empty Research-owned steering contract
.ultra/specs/{product,architecture,discovery}.md  empty specification skeletons
.ultra/specs/research-distillate.md                empty Research synthesis skeleton
.ultra/{tasks.json,test-report.json}               empty or not-yet-run ledgers
.ultra/{contexts,decisions,evidence,research}/
.ultra/changes/{active,archive,abandoned}/
```

For a legacy `north-star.md` containing `## One-line`, keep that file byte-identical.
When the new Project Brief is still unresolved, copy the legacy one-line verbatim into
it and list legacy hard constraints under Explicit Inputs without assigning new IDs.
Research later proposes the accepted North Star; it never rewrites history silently.

Git supplies revision identity, history, comparison, archive moves, and rollback. Run
`git init` only when `.git` is absent, then report the uncommitted scaffold.

## When the owner decides

The owner confirms the one-line outline and any replacement of healthy authority. Where
the host cannot ask, leave unresolved fields explicit and recommend resuming Init on a
host that can; do not infer intent from the directory name. Recommend Research after a
usable brief exists, but do not invoke it.

## References

- `../ultra-grilling/SKILL.md` — read before the first missing brief field.
- `references/brownfield-adoption.md` — read when maintained behavior already exists.
- `../ultra-think/references/autonomy-boundary.md` — read before replacing authority.
