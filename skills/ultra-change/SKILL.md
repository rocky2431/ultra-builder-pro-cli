---
name: ultra-change
description: Open one bounded unit of work by first reconciling what the specifications promise against what the code actually does, then writing the intent that closes the gap. Use when nothing is in flight and something new is being asked for — a feature, a fix, a redesign, or an incident response.
---

# Reconcile first, then write down what this Change commits to

A Change is the durable unit connecting research, plan, implementation,
verification, review and delivery. Reconciliation comes first because writing new
intent on top of specifications that already disagree with the code buries the
disagreement instead of resolving it.

## Before you start

1. Read `.ultra/tasks.json`, and the `context_file` of any task not yet finished.
2. Read `CONTEXT.md` for vocabulary and `.ultra/decisions/` for entries in scope.
3. Read `.ultra/north-star.md` — a Change that does not serve it is worth
   questioning out loud before it is written down.
4. Grep `.ultra/changes/archive/` for Changes that already touched this area. Read
   `delivery.md` when present; otherwise read `archive-summary.md`, `verification.md` and
   remaining owner-readable Markdown. A missing `delivery.md` does not mean no history;
   a module that keeps reappearing is an architecture signal.

## Whether this skill applies at all

| Situation | Where it goes |
|---|---|
| No pending or in-progress task, and something new is asked for | Here |
| A task is in progress and the specification turns out not to match reality | Not here — the dual-write path inside `ultra-dev` |
| The change makes no sentence in the specifications false | Neither — just make the change |

That third row is the checkable answer to "how small is too small to deserve a
Change file": if nothing the specifications say becomes untrue, there is nothing
to reconcile and nothing to record.

## Definition of done

- `.ultra/changes/active/<id>/intent.md` states the observable outcome, the
  executable acceptance, the non-goals, and the public seams touched.
- Each of the three reconciliation buckets is either empty or dispositioned, with
  the owner's answer recorded for every bucket that was not empty.
- The draft stays editable until then; the owner's acceptance is what turns it
  into authority.

## Reconcile against a bounded scope

A whole-repository diff is unusable, so derive the scope with four steps anyone
can rerun:

1. Decide which specification sections this request touches.
2. For each section, collect the past tasks whose `trace_to` points at it, and
   from those the set of code files they changed.
3. `git log -- .ultra/specs/<file>` gives the commit where that specification
   last changed.
4. `git diff <that commit>..HEAD -- <those code files>` is the reconciliation
   scope.

Sort what you find into three buckets, each with your recommended disposition:

| Bucket | Meaning |
|---|---|
| Specification says it, code does not implement it | Promised and missing |
| Code implements it, no specification says so | Built and unpromised |
| Both speak and they conflict | Contradictory |

Take the buckets to the owner — confirmed rather than assumed, because a
disposition can quietly withdraw a commitment. Sort by risk first and match the
asking to it: anything that touches a `HC-<n>` hard constraint or removes
something already promised goes one at a time with your recommendation; the
remaining low-risk rows go as a single list with a recommended disposition each,
for one confirmation. Twenty separate questions about rows that change nothing
spends the owner's attention where it was not needed, and trains them to approve
without reading.

## Write the intent

Read `references/change-contract.md` and use its exact `intent.md` headings. The active
Change directory contains only this accepted contract until planning or delivery adds
its defined artifacts; do not invent a parallel semantic record.

Follow `../ultra-grilling/SKILL.md` to settle the boundary — one question at a
time, each with your recommendation. New domain terms go through
`../ultra-domain-modeling/SKILL.md`.

When the work is too large *and* the path itself is unclear, follow
`../ultra-think/SKILL.md` for a decision ticket instead of forcing a task
breakdown. What comes out is a question whose answer is a decision, not an
implementation slice.

When reconciliation proves the request is a directly executable one-slice correction,
follow `../ultra-tdd/SKILL.md` at the confirmed public seam instead of manufacturing a
task graph merely to satisfy ceremony.

Output is `.ultra/changes/active/<id>/intent.md`, the specification patches
reconciliation justified, possibly a `.ultra/decisions/<id>.md`, and any
vocabulary update. Recommend `ultra-research` for a real evidence gap or
`ultra-plan` once the contract is evidenced enough; do not invoke either.

## Abandoning a Change

A Change that turns out to be the wrong thing to build exits by
`git mv .ultra/changes/active/<id> .ultra/changes/abandoned/<id>`, plus one line in
its `intent.md` saying why. Completed tasks keep their evidence; the work is
unlinked from the frontier, not deleted. This is the owner's call and a cheap one —
a Change kept alive to avoid admitting it was wrong poisons every later
reconciliation, which then measures the code against promises nobody intends to keep.

## When the owner decides

Every non-empty bucket, the Change boundary, abandonment, and anything
reconciliation turns up that shrinks a prior commitment. A change that makes no
specification sentence false needs no permission at all.

## References

- `../ultra-grilling/SKILL.md` — the loop for settling the boundary.
- `references/change-contract.md` — exact `intent.md` structure and profile fields.
- `../ultra-think/references/autonomy-boundary.md` — read before removing a promise.
- `../ultra-tdd/SKILL.md` — read for an evidenced one-slice correction.
