# Route Contract

This reference defines the owner-visible navigation surface shared by every public
Ultra Skill. A Route Card is a derived observation from canonical project files, Git,
and the current run. It is not workflow authority, a stage marker, or permission to
continue.

## Route Card

Show a compact `UBP Route Card` at entry, at a material checkpoint, when pausing or
blocked, at the observable exit, and before moving to another public Skill. Keep an
unchanged field short, but never omit an unresolved decision or unfinished obligation.

| Field | Meaning |
|---|---|
| `Route` | The current public Skill, or `idle` when no workflow is active |
| `Mode` | One mode declared by that Skill |
| `Why` | The current problem or evidence gap |
| `Outcome` | The owner-visible result this route is trying to produce |
| `Accepted boundary` | Accepted scope, exclusions, and authority that cover this run |
| `Position` | Artifact-derived navigation such as selected reports or remaining tasks |
| `Exit condition` | Observable evidence or owner decision that ends this mode |
| `Delta` | Material facts changed since the prior card |
| `Reality` | Live path, verification state, fakes, limitations, and unknowns |
| `Decision needed` | One material owner decision, or `none` |
| `Next` | The smallest covered continuation or one recommended public route |
| `Not done` | Obligations left at a pause or exit |

`Position` may report exact mechanical observations such as selected lenses with
reports, dependency-ready tasks, or an ACP session waiting for permission. Never turn a
count, validator result, finding total, or transport event into semantic progress or a
numeric completion score.

## Material checkpoints

Stop and obtain the Owner's current decision before any of these changes or effects:

1. a new or reduced North Star, specification, or Change commitment;
2. a material delta to an active Change outcome, acceptance, non-goal, or public seam;
3. evidence that materially changes the feasible direction or product boundary;
4. wider Execution Grant scope, effects, budget, expiry, or Agent/provider topology;
5. transfer of the canonical writer;
6. unresolved P0/P1, risk acceptance, or the same root cause surviving three failed fixes;
7. finalization, archive, commit, push, tag, publication, deployment, real installation,
   credentials, provider spend, or another external or irreversible effect.

Naming, internal design, ordinary technical choices, task decomposition, covered local
edits and tests, and non-material evidence reconciliation remain model-owned inside the
accepted boundary. Do not ask for confirmation when `Decision needed` is `none`.

## Continuation

Public modes belong to one of three invocation classes; model-only disciplines form a
fourth class:

| Invocation class | Owner entry | Model continuation |
|---|---:|---:|
| `explicit-entry` | yes | no |
| `grant-continuable` | yes | only under a valid Execution Grant covering that mode |
| `router` | yes | no; the Owner invokes read-only diagnosis explicitly |
| `model-discipline` | no | only as an internal method of a covered workflow |

Host metadata is only a coarse discovery bit. Before continuing, the Skill itself must
verify its selected mode, the same active `change_id`, the valid Execution Grant,
allowed local effects, stop conditions, and any material checkpoint. A coarse Host bit
never permits an explicit-entry mode. Without a covering grant, stop with a Route Card
and recommend the exact explicit route; never invoke another public Skill merely because
its files appear ready.

Within an accepted Change and valid grant, show the Route Card before each public Skill
transition and continue without a confirmation question only when the next mode and all
effects are covered. A material checkpoint still pauses. `Next` is either `continue:
<route>/<mode>` when covered or `recommend: <route>/<mode>` when owner invocation is
required.

Execution events such as tool calls, plans, usage, permission requests, worker output,
ACP updates, and process termination are transport observations. They may populate
`Position`, `Delta`, or `Reality`; they never decide acceptance, task completion, or the
next semantic route.

## Recovery and degraded diagnosis

On a fresh session or Host, reconstruct the card from the accepted North Star, Project
Brief, active Change authority, task ledger and matching contexts, decisions, evidence,
Git, and current installation/runtime observations. Read the closing `## Resume Note`
for only the current work package. Do not rerun completed Research or create a route
ledger to remember where the conversation stopped.

If authority is absent, ambiguous, stale, malformed, or temporarily unreadable, stop
semantic writes but keep read-only diagnosis reachable. Report the exact fact that
prevents a normal route and the cheapest safe repair, retry, cancel, abandon, or fresh
session path. Never describe a blocked route as an endless in-progress workflow.

Owner revisions remain recoverable: edit a draft in place, supersede an accepted
decision with a new owner record, and preserve Git/history. Status may summarize that
history on request, but no event log becomes a second source of truth.

When context pressure threatens reliable continuation, finish the nearest safe write,
refresh the canonical context's Resume Note, show a final card, and recommend a fresh
session. Context size is an observation, not a hard semantic gate.
