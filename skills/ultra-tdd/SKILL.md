---
name: ultra-tdd
description: Drive one slice of behavior through red then green — a failing test on a confirmed seam, then the smallest code that passes it. Use when another skill is about to write or change behavior and needs the feedback loop that proves the code actually runs, including a small change that goes straight to implementation.
---

# Write one failing test on a seam, then just enough code to pass it

Without feedback from code that actually ran, the work is blind flying. This is
the loop that supplies it, and it serves Goal 3, Production-Ready.

## Before you start

1. When called from a planned Change, resolve the unique active `change_id` and read the
   matching current task context for the seams already confirmed during planning. For a
   micro edit outside the Ultra lifecycle, no active task context is required; use the
   accepted request, maintained specification, and an existing repository seam, and
   create no Ultra task or delivery claim.
2. Run the repository's existing test command once, unchanged, to see what
   passing currently looks like. Read `references/test-execution.md` before recording
   that run or any red/green evidence.
3. Read `CONTEXT.md` for vocabulary — test names carry the domain words.

## Definition of done

- One slice is complete: one seam, one test, one minimal implementation.
- The test was observed failing before the implementation existed, and observed
  passing after. Both runs are real command output.
- The test reads as a specification of behavior through a public interface, and
  survives replacing the implementation underneath it.

## Seams, and what a good test on one looks like

A seam is a place where behavior can change without editing at that place — the
module interface. Tests live on seams and never reach for internals. Prefer a
seam that already exists, take the highest one that works, and one is the ideal
number. Verify behavior through that public interface: a name like "user can
checkout with a valid cart" shows at a glance what capability exists, and one
logical assertion per test keeps it readable.

## Red, then green

Write the failing test first and run it, so that red is observed rather than
assumed. Then write the smallest code that turns it green. Predict no later
tests and add no speculative capability. Then take the next slice.

Refactoring is not part of this loop; `ultra-review` owns it, because the
restructuring worth doing only becomes visible after three or four slices.

## Three patterns that produce tests worth deleting

| Pattern | How you recognize it |
|---|---|
| Implementation-coupled | Mocks an internal collaborator, tests a private method, asserts on call counts or ordering, or reaches past the interface into the database. The check: behavior is unchanged after restructuring, yet the test breaks. |
| Tautological | Recomputes the expected value the same way the implementation does, so it can never fail. Expected values come from an independent source — a known literal, a hand-worked example, the specification. |
| All tests first | Writing every test before any implementation tests imagined behavior. It captures shape rather than user-visible behavior, is insensitive to real change, and freezes the test structure before the implementation is understood. Take one test, one implementation, and repeat. |

## Mock only at the system boundary

External APIs, time and randomness, sometimes the filesystem. Prefer a real test
library over mocking the database. Your own classes, modules and internal
collaborators stay real.

Design for that boundary: inject dependencies, and give each external operation
its own named function rather than one generic fetcher — mocking then needs no
conditional logic, and which endpoints a test touches stays visible. When a real
dependency is the right answer, copy
`references/templates/testcontainer-postgres.ts` or
`references/templates/testcontainer-postgres.py`, and
`references/templates/vertical-slice.ts` for a path that runs end to end.

## When the owner decides

Weakening an assertion, skipping a relevant test, or adjusting an expected value
to obtain green output crosses the C5 boundary — stop and surface it. A test that
is genuinely wrong about the specification is a specification question, so it
goes to the owner as one.

## References

- `../ultra-think/references/autonomy-boundary.md` — read before replacing a real
  dependency with a fake, or when a test stands between the work and green.
- `references/templates/README.md` — read when choosing which enabling template
  fits the dependency you need to make real.
- `references/test-execution.md` — exact command, failure and result evidence contract.
