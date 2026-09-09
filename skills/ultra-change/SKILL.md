---
name: ultra-change
description: Open or reconcile one bounded unit of work by comparing specification promises with actual code, then writing the intent that closes the gap. Use when no Change is active and a feature, fix, redesign, or incident response is requested, or when an active Change's draft, researched evidence, or accepted boundary must be reconciled.
---

# Reconcile first, then write down what this Change commits to

A Change connects research, plan, implementation, verification, review, and delivery.
Reconcile first so new intent does not bury an existing specification/code conflict.

## Route modes

| Mode | Entry | Observable exit | Next |
|---|---|---|---|
| `intake` | Explicit owner request with no active Change | One stable draft `change_id` captures outcome, acceptance, non-goals, seams, trace, and Research Disposition | Stay in `ultra-change` for acceptance or move to `evidence-needed` |
| `evidence-needed` | The draft names one load-bearing question and required exit evidence | The bounded Research Disposition is owner-visible and records its return to this Change | Recommend `ultra-research/change-scoped` |
| `reconcile` | Explicit invocation or a valid Execution Grant for the same active Change | Research or implementation evidence is dispositioned in the same intent and any material delta is accepted | Recommend or continue to `ultra-plan/decompose` when the intent is accepted |
| `accepted` | Explicit owner acceptance of the Change outcome and boundary | Accepted intent, current trace, satisfied Research Disposition, and resolved material decisions are read back | Recommend `ultra-plan/decompose` |

Follow `../ultra-status/references/route-contract.md`. A draft may be revised in place;
an already accepted owner decision is revised by a superseding decision record so its
history remains recoverable. Show a Route Card before each public transition; ordinary
progress reporting defaults to the contract's compact progress expression. Under a
valid grant only the non-material `reconcile` mode may continue implicitly.

## Before you start

1. If model-selected, require `reconcile` mode for the same active Change and verify a
   live grant under `references/execution-grant.md`. Any intake, evidence-needed boundary,
   acceptance, abandonment, reduction, or primary transfer stops and recommends current
   explicit owner invocation; a coarse Host invocation bit cannot authorize it. A
   current explicit owner request already is that invocation for the work it names:
   executing it never waits for grant re-activation or for an earlier work package's
   unfinished closeout, which gate only their own review, finalization, archive, and
   effect steps under their own contracts.
2. Read `references/change-contract.md` and apply its **Active Change authority
   resolution** before reading any active `intent.md`, relying on a current `change_id`,
   or creating or writing a Change. Continue only from its positively observed stable
   zero-or-one result; return its typed repair for any other result. With one active
   Change, read `.ultra/tasks.json`, then only its unfinished `context_file` values.
   Update the same `change_id`; never open a second active Change.
3. Read `.ultra/project-brief.md`, `CONTEXT.md`, relevant `.ultra/decisions/`, and
   `.ultra/north-star.md` for raw provenance, accepted language, and direction.
4. Grep archive and abandoned Changes that touched this area. Prefer archived
   `delivery.md`; otherwise read `archive-summary.md`, `verification.md`, `intent.md`,
   and remaining Markdown. Read abandoned Changes as history of rejected boundaries and
   reusable evidence, never current intent. A missing `delivery.md` does not mean no history;
   repeated modules are an architecture signal.

## Whether this skill applies at all

| Situation | Where it goes |
|---|---|
| No active Change, and a new bounded request exists | Here — create one stable id |
| One active Change needs its draft, Research evidence, or accepted boundary reconciled | Here — update the same `change_id` |
| A separate request arrives while one Change remains active | Do not create a second Change; finish or deliver the current one, abandon it with owner authority, or explicitly fold the request into its boundary |
| A task is in progress and the specification turns out not to match reality | Not here — the dual-write path inside `ultra-dev` |
| The request starts a new product and the codebase has no `.ultra/` project record | Not here — `ultra-init/create` captures the raw outline and its unsettled intended use first |
| The change makes no sentence in the specifications false | Outside the Ultra lifecycle — use ordinary repository TDD and verification |

A request that arrives while one Change remains active is routed by that table, but its
execution authority comes from the request itself: the owner's current message is the
current owner invocation for the work it names. Folding it into the active Change's
boundary is a `reconcile` under that authority; finishing, delivering, or abandoning the
active Change first is a genuine routing choice only when the two scopes cannot share
one boundary, and it goes to the owner only then. The active Change's expired
session-local grant, missing North Star acceptance, or unfinished closeout gates exactly
those closeout, review, finalization, and archive steps under their own contracts —
never this request's intake, reconcile, implementation, or the product questions it
genuinely leaves open, such as how a newly requested concept should be represented.
Ask those questions on their own merit with a recommendation; do not queue them or the
implementation behind re-activation or acceptance of the older work.

If no specification sentence becomes untrue, there is nothing to reconcile. Use
`../ultra-tdd/SKILL.md` when helpful, but create no Change artifacts or Ultra
Test/Deliver claim for that micro change.

## Definition of done

- Active `intent.md` states outcome, typed acceptance with named required evidence,
  non-goals, public seams,
  and Research Disposition.
- Every reconciliation bucket is empty or dispositioned with the owner's answer.
- The draft remains editable until owner acceptance makes it authority.

## Reconcile against a bounded scope

A Change does not rebuild the project baseline; reconcile only the touched specification sections
and leave unrelated gaps visible with four rerunnable steps:

1. Decide which specification sections this request touches.
2. Collect past tasks whose `trace_to` points there and the code files they changed.
3. Use `git log -- .ultra/specs/<file>` to find its last specification change.
4. Inspect `git diff <that commit>..HEAD -- <those code files>`.

Sort what you find into three buckets, each with your recommended disposition:

| Bucket | Meaning |
|---|---|
| Specification says it, code does not implement it | Promised and missing |
| Code implements it, no specification says so | Built and unpromised |
| Both speak and they conflict | Contradictory |

Take non-empty buckets to the owner because disposition can withdraw a commitment.
Ask one recommended question per `HC-<n>` impact or removed promise; group remaining
low-risk rows into one recommended list for confirmation.

## Write the intent

Read `references/change-contract.md` and use its exact headings. Until planning or
delivery, the active directory contains only this contract; add no parallel record.

Use `../ultra-grilling/SKILL.md` to settle the boundary and
`../ultra-domain-modeling/SKILL.md` for new domain terms.

Use `../ultra-think/SKILL.md` only for one consequential evidenced trade-off. If the
whole path is unclear, recommend Research instead of manufacturing tasks.

Record `## Research Disposition` exactly. `none` needs enough evidence to plan;
`bounded` or `required` names one question, selected lenses, and exit evidence. After
Research, reconcile outputs here; an unverified path or bare claim is not evidence.
Record one `## North Star Trace` with resolving `FP-<n>`/`NS-<n>`/`HC-<n>` ids, causal
evidence, the accepted revision, the current Git blob digest, and any contradiction
requiring owner disposition. Reference IDs only; do not mirror North Star prose.

When Research accepts a revision whose id or digest differs from an active Change trace,
that active Change has a stale observation, not a semantic failure. Preserve its intent,
tasks, review, Test, and delivery evidence; reconcile old IDs to the accepted revision,
surface contradictions for owner disposition, and invalidate any plan-bound execution
approval through its own contract. Never silently rewrite the North Star or infer that a
replacement grants execution.

Every active Change still goes through `ultra-plan`; once durable intent exists, the
smallest evidence-backed task graph for its real seams binds development, review,
audit, and delivery to the stable `change_id`. The profile never fixes task or context
count.

Output active `intent.md` under a stable id, justified specification patches, qualifying
decision or vocabulary updates. For an evidence gap recommend `ultra-research`; when
evidenced recommend `ultra-plan`. Invoke neither without covering authority — the
owner's current request for this work, or a valid grant covering same-Change
reconciliation and Plan; with either, show the transition Route Card and allow Plan to
re-verify its own entry contract.

## Abandoning a Change

Append the exact `## Abandonment` closure from `references/change-contract.md`, then
`git mv .ultra/changes/active/<id> .ultra/changes/abandoned/<id>`. Keep completed-task
evidence. Future Change and Status consume this history; it is neither current intent
nor an orphan. Abandonment is the owner's call.

## When the primary writer changes Agent

When the owner moves the canonical implementation authority of an active
work package to another Agent, follow `references/primary-transfer.md` exactly:
the sender writes current reality into the task context and its Resume Note,
derives the OFFER from canonical files and Git, and stops writing after the
receiver's ready ACK; the receiver stable-reads, verifies every digest, and
becomes the sole canonical writer. A delegated worker slice is never a
substitute — `ultra-delegate` owns the mutually exclusive bounded-worker path.
Validate receipts with
`scripts/validate_primary_transfer.cjs`; the report is structural observation,
never an acceptance.

## When the owner decides

Every non-empty bucket, the Change boundary, abandonment, and anything
reconciliation turns up that shrinks a prior commitment. A change that makes no
specification sentence false needs no permission at all.

If the owner rejects the presented options or says none is adequate, preserve that
answer as current intake and keep the intent draft or move it to `evidence-needed`.
Gather the missing discriminating evidence or present materially different options; do
not select the nearest rejected option, manufacture acceptance, or route to Plan.

## References

- `../ultra-grilling/SKILL.md` — the loop for settling the boundary.
- `references/change-contract.md` — canonical Active Change authority resolution, exact
  `intent.md` structure, and profile fields.
- `references/execution-grant.md` — read when the owner requests bounded workflow continuation under a session-local or durable grant.
- `references/primary-transfer.md` — read when the owner moves the work package's canonical writer to another Agent (OFFER → ACK → RESULT).
- `../ultra-status/references/route-contract.md` — owner-visible route, checkpoint, and recovery output.
- `../ultra-think/references/autonomy-boundary.md` — read before removing a promise.
- `../ultra-tdd/SKILL.md` — read for an evidenced one-slice correction.
