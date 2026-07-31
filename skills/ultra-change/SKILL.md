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

Take the buckets to the owner. This is confirmed rather than assumed, because a
disposition can quietly be a REDUCTION.

## Write the intent

Follow `../ultra-grilling/SKILL.md` to settle the boundary — one question at a
time, each with your recommendation. New domain terms go through
`../ultra-domain-modeling/SKILL.md`.

When the work is too large *and* the path itself is unclear, follow
`../ultra-think/SKILL.md` for a decision ticket instead of forcing a task
breakdown. What comes out is a question whose answer is a decision, not an
implementation slice.

Output is `.ultra/changes/active/<id>/intent.md`, the specification patches
reconciliation justified, possibly a `.ultra/decisions/<id>.md`, and any
vocabulary update. Recommend `ultra-research` for a real evidence gap or
`ultra-plan` once the contract is evidenced enough; do not invoke either.

## When the owner decides

Every non-empty bucket, the Change boundary, and anything reconciliation turns up
that shrinks a prior commitment. A change that makes no specification sentence
false needs no permission at all.

## References

- `../ultra-grilling/SKILL.md` — the loop for settling the boundary.
- `../ultra-think/references/autonomy-boundary.md` — read before dispositioning a
  bucket in a way that removes something already promised.
