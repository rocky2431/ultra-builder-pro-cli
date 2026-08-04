---
name: ultra-dev
description: Carry one planned task from a written implementation plan through red-green development to recorded evidence and a task-level review. Use when a task in the ledger is ready to execute, was interrupted partway, or has to be picked up in a fresh session or on another host.
---

# Take one task from plan to recorded evidence

The model owns code reasoning and edits; repository files own the resumable contract.

## Before you start

1. Resolve exactly one active `change_id`; more than one is a repository conflict. Read
   `.ultra/tasks.json`, choose one matching `in_progress` or dependency-ready task, then read
   its full `context_file`, especially `## Resume Note`.
2. Read `CONTEXT.md` for vocabulary, and the `.ultra/decisions/` entries the task
   context names.
3. Read `.ultra/north-star.md` and the task's acceptance criteria. If you cannot
   state that acceptance in one sentence, you are not ready to start.

When this task starts from an observed error, failing check or unexpected behavior,
read `references/debugging.md` and establish the earliest incorrect state before editing.

## Definition of done

- All six evidence dimensions answer the checkable rules below.
- `tasks.json` and context status agree after write/read-back.
- The task still names the active `change_id`; historical unfinished work stays out.
- The context file carries a Completion entry and a rewritten Resume Note.
- A task-level review has run and its blocking findings are resolved.

## Write the implementation plan before the code

Fill in the task context's Implementation section as prose a person can read:
which modules change, how the interfaces move, which seam the tests will use.
Confirm that, then write code. Deciding the design while typing implementation
buries the design decisions in the details.

## Develop through red then green

Follow `../ultra-tdd/SKILL.md`, writing tests only on the seams the plan already
confirmed, one slice at a time. Do no refactoring here — `ultra-review` owns it,
because what is worth restructuring only becomes visible after several slices.

## Converge on the task-scoped acceptance set

Development ends when the task's acceptance commands pass, not when the code looks
finished. Resolve the context's **Change Acceptance IDs** against the active `intent.md`
for `<change_id>`
and use each named row's executable `Verification`. Commands under the context's
Acceptance Criteria may add task-local checks; they do not replace the Change mapping.

Run one baseline before repairing anything. Track the best-ever passing set of mapped
IDs and task-local commands, the total repair rounds, and consecutive rounds that add
nothing to that set. The loop has three explicit exits:

| Exit | Condition | Action |
|---|---|---|
| Converged | Every mapped Change verification and task-local command exits zero | Close out below |
| Stalled | Two consecutive repair rounds add no new item to the best-ever passing set, or three repair rounds finish without convergence | Stop; report the remaining criteria and what each repair tried |
| Unreachable | A command did not start because its executable, fixture, service or declared environment prerequisite is unavailable | Stop that criterion; report the missing prerequisite and its repair path |

A nonzero exit normally means a failing criterion, not an unreachable one; inspect its
output. A regression never shrinks the best-ever set, and the total round limit stops
oscillation where different criteria alternate between pass and fail.

## Answer the six evidence dimensions

Each has a rule you can check against the work rather than assert:

| Dimension | Answered when |
|---|---|
| `tests_written` | This diff adds or changes at least one assertion — touching a test file is not enough |
| `tests_passed` | The last test run exited zero and covered the files this diff touched |
| `persistence_real` | On any path that stores data, the test uses real storage or a container |
| `feature_flags_audit` | No flag on this change's execution path defaults to off, including flags this task did not add but now depends on |
| `vertical_slice` | One test's execution path runs from the entry point through to persistence |
| `spec_trace` | The anchor the task's `trace_to` names exists in the specification |

Record one canonical `.ultra/evidence/<task-id>/evidence.json` with
`$schema: "ultra-task-evidence-v1"`, `task_id`, `git_head`, `commands`, the six-key
`dimensions` object, `artifacts`, `limitations`, and `timestamp`. Raw logs and cited
files stay beside it; no second summary restates the same evidence. Each command has
`command`, `exit_code`, and `evidence_ref`. Each dimension has `status` (`satisfied`,
`gap`, or `not_applicable`), `evidence_refs`, and a non-empty `rationale`. Evidence is a
sensor, not a gate: a gap is reported and handed over, never used to block the work — a
gate that can be escaped by damaging the work gets escaped by damaging the work.

## When implementation and the specification disagree

This is the one backward edge in the whole workflow. Classify before touching the
specification, and classify by outcome rather than reason: does every commitment
the specification already made still hold afterwards? If even one no longer holds
it is a REDUCTION — stop and ask the owner, however good the argument. Log the
classification in the context file's Change Log.

## Close out

Write the status to both places and read both back. Add the Completion entry and
rewrite the Resume Note to say where the next session picks up. Then run the
task-level review through `../ultra-review/SKILL.md`, resolve blocking findings, and refresh
the evidence they touched.

Report the changed paths, the seam, the exact checks run, the review result, the
evidence gaps and the residual risk. Recommend the next capability from what the
files now say; do not invoke it.

## When the owner decides

Any REDUCTION, and each external effect separately.
At most one authorized local task commit happens here; push, tag, publish and
deploy each need their own authorization. An interrupted task leaves its worktree
as it stands and says so in the Resume Note instead of tidying it away.

## References

- `../ultra-tdd/SKILL.md` — read before the first test, for the seam and mock boundary.
- `../ultra-think/references/autonomy-boundary.md` — read when spec and code disagree.
- `../ultra-review/SKILL.md` — read when implementation evidence is ready for review.
- `references/debugging.md` — read for a reproduced failure before selecting a repair.
