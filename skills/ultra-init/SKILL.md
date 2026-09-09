---
name: ultra-init
description: Start a new app, tool, or script the codebase does not have yet. Use whenever someone asks for one from a rough need, however small or obvious the request looks — enter here first, then decide inside whether their stated need is already enough to build from or which material answers come first, keep the owner's own words, create the project's file skeleton and raw Project Brief, and hand back to ordinary implementation. Also use it to restore that project record when it is partial, uncertain, or unreadable, preserving accepted authority byte-for-byte. Not for a clear bounded change to existing code, and it performs no product research.
---

# Settle the purpose first, then capture only the initial project outline

Initialization exists so that what gets built is what the owner actually wanted: it
settles the few purposes that would otherwise be guessed, records that intake in the
owner's own words, and establishes the places later authority will use. It
does not validate the problem, establish a North Star, build a product or architecture
baseline, settle domain language, choose a Change, or start another public workflow.

## Route modes

| Mode | Entry | Observable exit | Next |
|---|---|---|---|
| `create` | Explicit owner invocation when `.ultra/` is absent | Missing skeleton files and raw Project Brief are published and read back; Git exists | Recommend `ultra-research` in `baseline` mode |
| `recover` | Explicit owner invocation when the skeleton is partial or uncertain | Missing files are restored, preserved authority is byte-identical, and every unresolved repair is named | Recommend `ultra-research` in `baseline` mode when the brief is usable; otherwise resume `ultra-init/recover` |

Follow `../ultra-status/references/route-contract.md`. Derive a Route Card before the
first write and at the exit or any repair stop. Init never continues into Research on
its own, and its `Position` reports observed files rather than semantic progress.

## Whether this skill applies at all

| Situation | Where it goes |
|---|---|
| Someone asks for a new app, tool, or script this codebase does not have yet | Here — `create`, and settle the purpose first if it would change what you build |
| The skeleton is partial, uncertain, or unreadable | Here — `recover` it |
| An ordinary bounded change in an existing codebase, already clear enough to reproduce and verify | Not here — ordinary repository investigation, TDD, and verification create no `.ultra/` |
| A one-off snippet or throwaway command nobody comes back to | Not here — write it, run it, hand it over, and create no `.ultra/` |

Whether the stated need is already enough to build from is this Skill's decision, not a
precondition for reaching it. Enter on the plain request, look at what the request and
the repository already answer, and then either ask the few answers that would change what
you build or record what was already given and continue. A broad complaint is a need, not
a settled purpose; presuming one is how the wrong product gets built.

An input source, import method or storage choice does not settle that purpose. When the
request only names material to organize, ask what the owner needs to accomplish with it
before the first write, including skeleton creation. Do not substitute your own likely
use case. This Skill's definition of done covers intake only: return to the calling
agent, which still owns the requested product outcome. Once purpose and scope are clear,
the caller continues the already requested ordinary implementation; an Init exit alone
is never the final answer to a request for a working product.

A coarse Host discovery bit never authorizes this route. A model-selected entry is valid
only when the owner's current request asks for that work, and that request is itself the
owner entry for it — the route needs no separate confirmation. An installation, a
historical file, or a skeleton observed on disk is never that request: report the
observation and stop.

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

Ask only enough to distinguish materially different outlines. Ask before building, not
after: an answer that would change what you build — who it is for, what it must make
possible later, which result counts as working — is worth one question now, and an
unstated purpose is not a detail that implementation can settle on the owner's behalf.
Where this project's own files live, which language and shape to use, and the rest of its
internal design are inside the boundary in
`../ultra-think/references/autonomy-boundary.md` — decide and proceed. What stays the
owner's is their own material: which existing real source of their data to use, an input
you cannot observe anywhere, and any access, integration, or write outside this project.
Record an unknown source or missing material as unknown and ask for it once; it is never
assumed and never turned into permission you were not given. Facts the repository can
answer are never questions. Do not name the owner's main difficulty for them.

If an answer would define a problem, actor evidence, desired outcome, success measure,
product strategy, accepted constraint, domain term, requirement, or architecture, record
it as an input or open question and stop drilling. Research owns that maturation and must
not re-ask an answer unless evidence conflicts with it.

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

Say what that recommendation is for: `ultra-research/baseline` decides the consequential
product commitments the brief left open, and when the settled outline is already small
enough to build and verify directly, the owner's current request governs whether that
baseline or the ordinary verified work comes next. Neither Init nor its recommendation
turns a raw outline into an accepted North Star.

## References

- `../ultra-grilling/SKILL.md` — read before the first missing brief field.
- `references/brownfield-adoption.md` — read when maintained behavior already exists.
- `../ultra-status/references/route-contract.md` — owner-visible route, checkpoint, and recovery output.
- `../ultra-think/references/autonomy-boundary.md` — read before replacing authority or
  reaching outside this project for the owner's own material.
