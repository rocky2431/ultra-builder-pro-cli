---
name: ultra-change
description: Open or reconcile one bounded unit of work by comparing specification promises with actual code, then writing the intent that closes the gap. Use when no Change is active and a feature, fix, redesign, or incident response is requested, or when an active Change's draft, researched evidence, or accepted boundary must be reconciled.
---

# Reconcile first, then write down what this Change commits to

A Change connects research, plan, implementation, verification, review, and delivery.
Reconcile first so new intent does not bury an existing specification/code conflict.

## Before you start

1. List `.ultra/changes/active/`; more than one `intent.md` is a conflict, not a choice.
   One directory name is the stable `change_id`. Read `.ultra/tasks.json`, then only its
   unfinished `context_file` values. Update the same `change_id`; never open a second active Change.
2. Read `.ultra/project-brief.md`, `CONTEXT.md`, relevant `.ultra/decisions/`, and
   `.ultra/north-star.md` for raw provenance, accepted language, and direction.
3. Grep archive and abandoned Changes that touched this area. Prefer archived
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
| The change makes no sentence in the specifications false | Outside the Ultra lifecycle — use ordinary repository TDD and verification |

If no specification sentence becomes untrue, there is nothing to reconcile. Use
`../ultra-tdd/SKILL.md` when helpful, but create no Change artifacts or Ultra
Test/Deliver claim for that micro change.

## Definition of done

- Active `intent.md` states outcome, executable acceptance, non-goals, public seams,
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

A quick active Change still goes through one-task `ultra-plan`; once durable intent
exists, that minimal task is what binds development, evidence, audit, and delivery to
the stable `change_id`.

Output active `intent.md` under a stable id, justified specification patches, qualifying
decision or vocabulary updates. For an evidence gap recommend `ultra-research`; when
evidenced recommend `ultra-plan`. Invoke neither.

## Abandoning a Change

Append the exact `## Abandonment` closure from `references/change-contract.md`, then
`git mv .ultra/changes/active/<id> .ultra/changes/abandoned/<id>`. Keep completed-task
evidence. Future Change and Status consume this history; it is neither current intent
nor an orphan. Abandonment is the owner's call.

## When the owner decides

Every non-empty bucket, the Change boundary, abandonment, and anything
reconciliation turns up that shrinks a prior commitment. A change that makes no
specification sentence false needs no permission at all.

## References

- `../ultra-grilling/SKILL.md` — the loop for settling the boundary.
- `references/change-contract.md` — exact `intent.md` structure and profile fields.
- `../ultra-think/references/autonomy-boundary.md` — read before removing a promise.
- `../ultra-tdd/SKILL.md` — read for an evidenced one-slice correction.
