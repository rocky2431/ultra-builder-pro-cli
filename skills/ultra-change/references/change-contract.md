# Change Contract and profile

Create one contract before planning. Keep every field specific enough to verify and
stable enough to survive a fresh session.

## Exact `intent.md` structure

```markdown
# Change <id>: <title>

> **Status**: draft | accepted
> **Profile**: quick | standard | major | incident

## Outcome
<one externally observable result>

## Acceptance
| ID | Criterion | Verification | Trace |
|---|---|---|---|

## Non-goals
- <explicit boundary>

## Public Seams
- <entry point or output>

## Reconciliation
### Promised and Missing
### Built and Unpromised
### Contradictory

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
- `acceptance`: stable ids, one criterion each, and a `Verification` that is an
  **executable command** — something with an exit code, not a description of an
  intention. `curl -sf localhost:3000/health` qualifies; "check that the endpoint
  responds" does not.
- `non_goals`: explicit boundaries that prevent accidental scope growth.
- `public_seams`: entry points or outputs through which acceptance is observed.
- `recovery`: a bounded reversal or recovery strategy and its verification.
- `unresolved_decisions`: stable ids, summary, blocking state, and owner when known.

Resolve every blocking decision before planning. Keep non-blocking uncertainty visible
in the task and verification contracts.

## Why verification has to be executable

A criterion whose verification cannot be run is not acceptance, it is a wish. Three
consumers downstream depend on it being runnable:

- task development can treat passing acceptance as an exit condition only when
  something can actually decide "passing";
- the review tests lens maps each acceptance claim to executable evidence, and can
  only report an honest gap when there is something to map onto;
- delivery cannot otherwise separate "shipped" from "believed shipped".

Writing the command is also the cheapest way to find out that a criterion is vague.
"The feature is wired up" resists a command until it becomes "this export has a
non-test importer", which is a `grep`.

Where a criterion is genuinely a judgement call — visual polish, wording, feel — it
does not belong in Acceptance at all. Record it as a taste decision for the owner and
keep Acceptance to what a machine can settle. Mixing the two is what makes an
acceptance set undecidable.

## Profile

- `quick`: one low-risk task, no material risk flags, and no research dependency.
- `standard`: a bounded change with multiple tasks or ordinary integration risk.
- `major`: a broad or consequential change with material contract, migration,
  authorization, security, multi-module, external-integration, or release impact.
- `incident`: urgent diagnosis and recovery with a reproducible symptom. Baseline
  break-glass still requires a recorded approver and recovery contract.

Record a profile rationale and every applicable risk flag. Select the smallest profile
whose guarantees cover the real blast radius; never use profile labels as estimates.

## Research disposition

Use `none` with a rationale when accepted evidence is sufficient. Use `bounded` or
`required` with a supported mode and the exact selected semantic steps when product,
behavior, architecture, deployment, or risk facts remain load-bearing. The recorded
selection is the planning gate.
