# Change Contract and profile

Create one contract before planning. Keep every field specific enough to verify and
stable enough to survive a fresh session.

The directory id is globally unique across active, archive, and abandoned Changes and
matches `[A-Za-z0-9][A-Za-z0-9._-]*`. It is the stable `change_id`; moving the directory
never changes it.

## Active Change authority resolution

Every Skill that selects a current `change_id`, reads active intent, or creates a new
Change must first use native host filesystem checks to apply this instruction contract.
It is not a parser, registry, or persisted state.
A positively observed absent `.ultra` is the existing uninitialized condition:
`ultra-status` may recommend `ultra-init`, while writers write nothing. This known
absence is distinct from an unavailable observation. Otherwise:

1. Require `.ultra`, `.ultra/changes`, and `.ultra/changes/active` to be a stable chain
   of ordinary non-symlink directories with the same no-follow identities before and
   after selection.
2. Stable-list every active-root entry without following symlinks. Only `.gitkeep`,
   when it is an ordinary regular non-symlink file, may be ignored. A `.gitkeep` of any
   other type is malformed, is never a Change directory, and returns a typed diagnostic
   with repair before any candidate intent is read. Every other non-directory or symlink
   entry returns a typed diagnostic with a reachable repair before any intent read.
3. A positively observed stable empty root, with or without that sole marker, means no
   active Change. Active authority exists only when exactly one ordinary non-symlink
   Change directory remains. More than one returns a typed conflict and repair; select
   none of them.
4. Require the selected directory's own `intent.md` to be a stable regular non-symlink
   file opened with no-follow behavior. Capture one bounded snapshot, then recheck the
   directory chain, active-root entries, selected directory, and intent identity before
   consuming its contents.
5. On any unavailable observation or changed identity, stop with a typed diagnostic and
   reachable retry or repair. Do not read any intent, route from it, write any workflow
   artifact, or create a new Change. Only a positively observed stable zero-directory
   result permits `ultra-change` to create one.

## Exact `intent.md` structure

```markdown
# Change <id>: <title>

> **Status**: draft | accepted
> **Profile**: quick | standard | major | incident
> **Profile rationale**: <why the smallest selected profile covers the blast radius>
> **Risk flags**: <applicable flags, or none>

## Outcome
<one externally observable result>

## Acceptance
| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|

## Non-goals
- <explicit boundary>

## Public Seams
- <entry point or output>

## Reconciliation
### Promised and Missing
### Built and Unpromised
### Contradictory

## Research Disposition
- Disposition: none | bounded | required
- Question: <the exact load-bearing unknown, or none>
- Selected lenses: <reference ids, or none>
- Existing evidence: <repository-relative paths and claims>
- Required exit evidence: <what must exist or be resolved before planning>
- Rationale: <why this is sufficient for this Change boundary>

## North Star Trace
- First principles: <FP-<n> ids and the causal premise>
- Serves: <NS-<n> ids and the causal contribution>
- Touches: <HC-<n> ids, or none>
- Evidence: <repository-relative paths and claims>
- North Star revision: <accepted Revision field from `.ultra/north-star.md`>
- North Star digest: <output of `git hash-object .ultra/north-star.md`>
- Contradictions or refinements: <none, or the owner disposition still required>

## Execution Grant

- Grant: `session-local` (default) | `durable work-package` <grant-id>
- Allowed workflows: <subset of research, plan, dev, test, deliver-reconcile>
- Agent topology: <single-Agent default, or the owner-selected providers, counts, and write scopes>
- Allowed local effects: <exact authorized local writes, tests, and bounded verification>
- Budgets and expiry: <time, cost, tool, provider, delegation, review-round ceilings and expiry>
- Mandatory reviews: <plan, task, and aggregate Change requirements>
- Stop conditions: <named semantic, evidence, recovery, and budget stops>
- Invalidation: <conditions that end the grant and return control to the owner>
- Never granted: <new Change, baseline checkpoint, finalization/archive, external effects, cross-family provider calls>
- Activation: <session-local: a current-session owner utterance approving this grant and the current task ledger; durable: stable verification of the recorded grant — stored text alone is inactive>

## Planning Posture
<EXPAND | SELECTIVE | HOLD | REDUCE, rationale, and owner confirmation>
<!-- Scope for this Change only. Not the commitment classification: REDUCE here
     means "plan less work now", while a REDUCTION in a Change Log means "a
     promise the specification already made no longer holds". -->


## Recovery
<reversal or recovery path and its verification>

## Unresolved Decisions
- <stable id, summary, blocking state, owner>
```

Use `[NEEDS CLARIFICATION]` for missing semantic content. Do not silently omit a
heading, and do not add another file that restates the same contract.

## Contract fields

- `outcome`: one externally observable result.
- `acceptance`: stable ids, one criterion each, one verification type, and exact
  required evidence. The supported types are `command`, `inspection`,
  `owner-judgment`, and `external-observation`. When one outcome needs more than one
  authority, split it into independent criteria with unique IDs and keep one
  verification type per criterion. A row must not carry multiple verification types.
- `non_goals`: explicit boundaries that prevent accidental scope growth.
- `public_seams`: entry points or outputs through which acceptance is observed.
- `recovery`: a bounded reversal or recovery strategy and its verification.
- `unresolved_decisions`: stable ids, summary, blocking state, and owner when known.

Resolve every blocking decision before planning. Keep non-blocking uncertainty visible
in the task and verification contracts.

`North Star Trace` is the Change-level semantic trace. `First principles`, `Serves`, and
`Touches` ids must resolve in `.ultra/north-star.md`; `Evidence` explains the causal
claim rather than merely naming the file. Revision and digest are freshness observations.
A mismatch returns the intent to reconciliation and never mechanically declares
alignment or contradiction. Preserve historical evidence while reconciliation maps old
IDs, records contradictions, and obtains any material owner disposition.

Every Change records an `Execution Grant`; `session-local` is the default and a
durable grant requires an exact owner record. The exact mode behavior,
activation, and durable-verification rules live in `execution-grant.md`. The
grant bounds native model continuation; it is not persisted route authority.

## Why verification has to name its authority

Acceptance is only auditable when the observation and its authority are explicit:

- `command` records the exact command, working directory, exit status, and retained raw
  output reference;
- `inspection` cites the exact file, revision or digest, and the observed fact;
- `owner-judgment` cites the durable owner disposition without replacing it with a
  machine proxy; only the owner can supply its semantic result;
- `external-observation` records the provider or environment, run identity, observation
  time, and retained raw result.

Development, Review, Test, and Deliver may verify that the required evidence exists,
is fresh, and is bound to the criterion. They must not turn a command exit code, regex,
digest, or schema result into a semantic verdict for an inspection, owner judgment, or
external observation. Missing or stale evidence returns a typed gap to the responsible
model or owner; it never silently deletes the criterion or manufactures acceptance.
A validator owns exact structure, identity, and provenance only; validator success is
never a semantic pass.

## Profile

- `quick`: a bounded low-risk change with no material risk flags and no research dependency.
- `standard`: a bounded change with ordinary integration risk.
- `major`: a broad or consequential change with material contract, migration,
  authorization, security, multi-module, external-integration, or release impact.
- `incident`: urgent diagnosis and recovery with a reproducible symptom. Baseline
  break-glass still requires a recorded approver and recovery contract.

Record a profile rationale and every applicable risk flag. Select the smallest profile
whose guarantees cover the real blast radius; never use profile labels to prescribe a
task count, file count, review effort, or estimate.

## Research Disposition

The `Disposition` value is exactly `none | bounded | required`. Use `none` with a
rationale when accepted evidence is sufficient. Use `bounded` for one already-framed
question whose smallest sufficient lenses are known; it skips Wayfinding. Use `required`
when several load-bearing claims or the evidence path itself remain unclear, so Research
may Wayfind before selecting lenses. Both name the exact question, selected or candidate
Research lenses, existing evidence, and required exit evidence.
The host model evaluates whether the named evidence exists and supports the claim; do
not add a `research_complete` bit, score, or workflow state. Planning waits while the
recorded exit evidence is unsatisfied.

## Exact abandonment closure

Before moving an owner-abandoned Change, append this exact structure to `intent.md`:

```markdown
## Abandonment
- Date:
- Owner decision:
- Reason:
- Reusable evidence:
- Recovery or successor:
```
