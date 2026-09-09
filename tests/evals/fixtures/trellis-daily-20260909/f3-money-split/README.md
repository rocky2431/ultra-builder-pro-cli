# Family 3 development fixture — shared expenses

Frozen input for the 2026-09-09 daily-workflow evaluation
(`tests/evals/trellis-daily-20260909.json`). Copy this directory to an isolated
location before a run; never change it in place.

## Starting state

Green: `node --test test/` passes. There is no seeded defect. The case is an
iterative change on a working project, followed by a fresh-session follow-up.

## Authoritative project facts

`docs/decisions/2026-08-24-integer-minor-units.md` is the accepted, current
source: integer minor units everywhere, formatting only at the display
boundary, and a split that never loses or creates a minor unit.

Two counterexamples sit next to it and must not be used as implementation
input:

- `docs/notes/2026-06-02-amount-format-draft.md` — outdated. It proposes
  decimal strings, `parseFloat` arithmetic, and dropping the split remainder.
  Its own status line names the decision that supersedes it, so which source is
  current is unambiguous.
- `docs/notes/2026-07-11-ci-runner-note.md` — irrelevant to the change.

## What counts as consumption

Reading a file only shows the material was passed along. Consumption is shown
by the delivered behavior: integer minor units, conserved totals, and reuse of
`formatAmount` at the display boundary — including in the fresh session, with
the owner not restating any of it.
