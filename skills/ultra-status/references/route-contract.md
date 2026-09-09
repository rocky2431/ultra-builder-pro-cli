# Route Contract

This reference defines the owner-visible navigation surface shared by every public
Ultra Skill. A Route Card is a derived observation from canonical project files, Git,
and the current run. It is not workflow authority, a stage marker, or permission to
continue.

## Route Card

Show a `UBP Route Card` at entry, at a material checkpoint, when pausing or
blocked, at the observable exit, and before moving to another public Skill. The default
rendering of that card is the compact progress expression below; the full field set is
reserved for the moments listed there. Keep an unchanged field short, but never omit an
unresolved decision or unfinished obligation.

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

### Compact progress expression

The default owner-visible rendering of the card is five lines built from current
evidence:

| Line | Derived from | Rule |
|---|---|---|
| `Goal` | `Why` + `Outcome` | The outcome this route is trying to produce, in one sentence |
| `Verified result` | `Position` + `Reality` | Only what current evidence verifies; a completion claim names the evidence that verifies it |
| `Gap` | `Exit condition` + `Not done` | What still separates this run from its exit |
| `Next action` | `Next` | The smallest covered continuation; a planned item is a future action, never a result |
| `Owner decision needed` | `Decision needed` | One material decision, or `none`; do not invent one to fill the line |

The compact expression is a rendering of the Route Card, not a second schema, state
center, or mandatory UI format: every line is derived from the card, which is itself
derived from canonical files, Git, and the current run. A transport return, task count,
structural validation, or reused old evidence is never a `Verified result`; an unknown
stays visibly unknown and is never displayed as success.

The compact form is the default at entry, during ordinary progress, at an ordinary exit
of the current mode, and across transitions covered by the accepted boundary — including
an ordinary Status answer, which is itself the entry and exit of a read-only route.
Show the full card — not the compact form — at a material checkpoint, when pausing or
blocked, and whenever the owner asks for route, grant, or authority detail; that detail
stays one explicit question away instead of being volunteered every turn.

Compaction never hides substance: an unresolved decision, a material boundary change, or
missing authorization stays visible in `Owner decision needed`, `Gap`, and
`Verified result`, and the related fields expand whenever the five lines cannot carry
them truthfully. A real failure or unknown is reported as fact, never as success, and an
ordinary failed check inside an already authorized repair boundary updates
`Verified result` and `Gap` without manufacturing a new owner decision.

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

A current explicit owner request that itself names the change or effect is the Owner's
current decision for that delta: proceed under it and do not re-ask confirmation of
what was just requested. The checkpoint still applies to any delta the request does not
name — silently reducing an existing promise, widening effects, or re-scoping untouched
work still returns to the owner.

Naming, internal design, ordinary technical choices, task decomposition, covered local
edits and tests, and non-material evidence reconciliation remain model-owned inside the
accepted boundary. Do not ask for confirmation when `Decision needed` is `none`.

Deciding how something works stays model-owned; deciding that it destroys what someone
already has does not. When such a choice would overwrite, truncate, delete, or replace
existing bytes or state — this run's own write, or the behavior the delivered code will
perform for its users — take the non-destructive form of the same choice and keep going:
create exclusively, write a separate target, or refuse the collision and report it. That
default needs no question, and an effect the owner already authorized for exactly this
data stays authorized. Only when no non-destructive form can deliver the named outcome
is the destruction a material trade-off, surfaced as one question with a recommendation.

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

Discovery is not authority, and withheld discovery is not a guard. Two Hosts expose no
routing bit at all, so a public route is discoverable to the model wherever the Owner
could reach it in one request — including a route whose modes are all `explicit-entry`.
Loading such a Skill only lets it check its own entry: it proceeds when the Owner's
current request names that work, and otherwise reports what it observed and stops. The
bit stays off only where the product requires the Owner to name the route explicitly —
read-only Status diagnosis and Delegate's owner-authorized worker topology — and on a
Host without the bit those two routes rest on the same in-Skill check.

A current explicit owner request is Owner entry for the work it names even when an
active Change, an expired grant, or an unfinished closeout exists: those are older
obligations of the older work, reported in `Not done` and gated only at their own
steps — never preconditions for executing the current request.

### Open closeout obligations

That branch is executable, not a promise. An absent or unaccepted North Star, a trace
with no accepted revision to resolve against, an expired grant, and an unfinished formal
review are open closeout obligations. Each gates exactly the step that produces it — an
acceptance or completion claim, task closeout, finalization, archive, or an external
effect — and otherwise stays visible in `Not done` and `Gap` while the decomposition,
implementation, and verification the current request covers proceed. Implementing a
decision the owner already stated explicitly is that covered work; a strategic choice
this run composed is an open decision and is surfaced as one, never as settled input.
Carrying an obligation openly is the honest branch: fabricating an acceptance, marking a
draft accepted, or recording a provisional workflow state to get past it is not.

Two things are not open obligations. Work that would breach a constraint the owner has
actually accepted, or reduce a promise the specifications already made, is the material
checkpoint above: reconcile it with the owner before the conflicting step. And durable
authorization is never inferred from files — a recorded grant, an old task, an archived
Change, or a stored quote is inactive data until the owner's current message or the
grant contract's own verification makes it live.

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
