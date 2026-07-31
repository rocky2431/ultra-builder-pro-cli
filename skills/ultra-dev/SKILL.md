---
name: ultra-dev
description: Carry one planned task from a written implementation plan through red-green development to recorded evidence and a task-level review. Use when a task in the ledger is ready to execute, was interrupted partway, or has to be picked up in a fresh session or on another host.
---

# Take one task from plan to recorded evidence

The model owns the code reasoning and the edits. The repository owns the task
contract, the evidence, and everything needed to resume.

## Before you start

1. Read `.ultra/tasks.json` and pick the task; read its `context_file` end to
   end, above all the closing `## Resume Note` — that line says where to pick up.
2. Read `CONTEXT.md` for vocabulary, and the `.ultra/decisions/` entries the task
   context names.
3. Read `.ultra/north-star.md` and the task's acceptance criteria. If you cannot
   state that acceptance in one sentence, you are not ready to start.

## Definition of done

- All six evidence dimensions are answered for this task, each against the
  checkable rule below rather than an impression.
- `tasks.json` and the context file's header state the same status, each written
  and then read back — a one-sided write breaks resume on another host.
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

## Answer the six evidence dimensions

Each has a rule you can check against the work rather than assert:

| Dimension | Answered when |
|---|---|
| `tests_written` | This diff changes a test file |
| `tests_passed` | The last test run exited zero and covered the files this diff touched |
| `persistence_real` | On any path that stores data, the test uses real storage or a container |
| `feature_flags_audit` | No flag this task added defaults to off |
| `vertical_slice` | One test's execution path runs from the entry point through to persistence |
| `spec_trace` | The anchor the task's `trace_to` names exists in the specification |

Record them under the task's evidence directory. They are a sensor, not a gate: a
gap is reported and handed over, never used to block the work — a gate that can be
escaped by damaging the work gets escaped by damaging the work.

## When implementation and the specification disagree

This is the one backward edge in the whole workflow. Classify before touching the
specification, and classify by outcome rather than reason: does every commitment
the specification already made still hold afterwards? If even one no longer holds
it is a REDUCTION — stop and ask the owner, however good the argument. Log the
classification in the context file's Change Log.

## Close out

Write the status to both places and read both back. Add the Completion entry and
rewrite the Resume Note to say where the next session picks up. Then run the
task-level review through `ultra-review`, resolve blocking findings, and refresh
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

- `../ultra-tdd/SKILL.md` — read before the first test, for the seam and the mock
  boundary.
- `../ultra-think/references/autonomy-boundary.md` — read the moment the
  specification and the implementation disagree.
