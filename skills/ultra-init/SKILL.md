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
- For a new skeleton, a structurally complete North Star v2 with status `unresearched`
  and the three specification skeletons exist. Init does not populate `FP-*`, `NS-*`,
  or `HC-*`; recovery preserves any populated authority, and Init does not create
  `CONTEXT.md`.
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
The script stages and reads back only missing files from `assets/project-template`,
validates the staged North Star from its raw bytes, and then publishes a complete new
`.ultra/` by atomic rename. Partial recovery publishes each staged file atomically
without clobbering a concurrent or existing path. A validation or publication failure
removes a published path only while its current stable identity and digest still match
this invocation's recorded publication. A workspace edit is preserved and returns the
typed retryable `initialization_snapshot_changed` diagnostic. Init binds every preserved
file to one nonblocking, no-follow descriptor/path identity and SHA-256 digest, then
rechecks all of them before staging, before publication, and before success. It likewise
captures every staged digest before publication and compares it with a stable target
snapshot before success. Each file publication takes fresh no-symlink parent-chain and
resolved-root identity snapshots before and after the effect; detectable directory drift
stops publication. A failed snapshot `lstat`, `open`, `fstat`, or `read` with no observed
identity, type, size, or digest change instead returns the typed retryable
`initialization_snapshot_io_error`; its sanitized `operation`, symbolic `errno`, and
actionable permission, descriptor-limit, or storage recovery remain in the
`ultra-init-error-v1` result. The North Star compatibility diagnostic remains
`preserved_north_star_changed`. A malformed packaged placeholder stops before publication
with an `ultra-init-error-v1` payload whose `code` is `north_star_template_invalid` and
whose `diagnostics` preserve the canonical validator entries, including
`invalid_unresearched_placeholder` for an exact-byte mismatch.

This recovery contract assumes a cooperative local workspace. It detects observable
path-identity or byte drift and preserves the current bytes for retry; it does not claim
that Node filesystem calls can defeat a malicious operating-system-level replacement.
Init also binds the root identity of its staging directory. Cleanup recursively removes
that path only after a fresh no-symlink root rewalk proves the same device and inode. If
the path was replaced, Init leaves it untouched and returns the retryable typed
`initialization_cleanup_conflict` diagnostic with the owned identity and manual recovery
instruction. If a typed initialization failure is already pending, that primary
diagnostic remains the top-level `ultra-init-error-v1` result and the cleanup diagnostic
is retained under `cleanup_conflict`, including its identity-bound manual recovery.
On success every existing file stayed byte-identical and every new file matches its
packaged digest.

```text
.ultra/project-brief.md                            raw intake and initial outline
.ultra/north-star.md                               unresearched Research-owned placeholder
.ultra/specs/{product,architecture,discovery}.md  empty specification skeletons
.ultra/specs/research-distillate.md                empty Research synthesis skeleton
.ultra/{tasks.json,test-report.json}               empty or not-yet-run ledgers
.ultra/{contexts,decisions,evidence,research}/
.ultra/changes/{active,archive,abandoned}/
```

The script reports `created_unresearched` for a new placeholder. For a preserved file it
reports exactly `preserved_unresearched`, `preserved_accepted`, `preserved_legacy`, or
`preserved_unknown`; unknown or malformed content is never described as authority. For
a legacy `north-star.md` containing the actual v0.26 headings or the older `## One-line`
form, keep that file byte-identical.
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
