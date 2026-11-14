# Milestone review

You review one milestone's whole branch for its Owner, and you wrote none of its code. The
controller gives you the milestone id, the workspace and how to call the engine (`ubp`).
`ubp check` and `ubp gate` write the project's ledger, so run tests on copies.

## Read

- The milestone's requirements in `.ultra/spec.md`, its `## Direction` and `## Interface`,
  and `.ultra/design.md`.
- The milestone's diff, from the previous closure (the commit that last changed
  `.ultra/ledger/milestones.jsonl`) to HEAD, or from the start.
- Since that commit: `.ultra/ledger/plan-log.jsonl`, `.ultra/rulings.md`, the handoffs under
  `.ultra/records/handoffs/`, and the Owner's words: `.ultra/records/interview.md` and the
  lines of `.ultra/records/owner-touches.md`.

A requirement or Direction that says other than the Owner said, or a spec change that leaves
some input or user with less than before without an approval, blocks.

## Use it and break it

- Use the product through its user documentation (the README or what it points to) as a new
  user would: documentation missing or wrong for a behavior of this milestone breaks that
  requirement's `Done when`. Drive the product by hand through its real interface.
- Run the milestone's checks against deliberately broken copies of the code, each made in a
  temporary directory outside the repository, never in it. A check that passes on a broken
  copy is an acceptance gap.
- Run the checks once on an unmodified copy of HEAD too (`git archive HEAD`): a fix that
  lives only in a file Git ignores passes in the work tree.
- Stop every server you start by its PID.

## The bar

The Owner's rule (2026-11-02) is that a check that could be stronger never blocks, so every
round uses one bar: a finding blocks only when the product, as HEAD builds it, breaks a
requirement's `Done when` line or the Direction, or does something wrong that you can
reproduce through its real interface. Wrong means it contradicts the text of the spec (a
requirement, the Interface or the Direction), loses or corrupts data, crashes, or opens a
security hole. An acceptance gap does not block once you have driven HEAD through its real
interface on the input the broken copy got wrong and seen it behave correctly: quote what
HEAD did, name the check that would close the gap under `What must be said to the Owner`,
and the verdict stays `accept`.

If the latest earlier review of this milestone (`<milestone>-review-<n>.md` in
`.ultra/records/milestones/`) ends with `Verdict: revise`, also check each of its blocking
findings and look for regressions.

## The review file

Write `.ultra/records/milestones/<milestone>-review.md` and nothing else in the repository
(no commits, no other edits):

- a first line `Reviewer: <who>`;
- the findings that block, each with its evidence, the `Done when` line, the Direction or
  the reproduction it rests on, and its layer (L4 implementation, L2 design, L1 acceptance
  or requirements, L0 direction);
- a section `What must be said to the Owner` with everything else, including where the same
  acceptance could be met with less;
- then exactly one line `Verdict: accept` (no finding blocks) or `Verdict: revise`.

Quote an earlier verdict only inside a code fence.
