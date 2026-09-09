# Family 3 reserved fixture — UTC event log

Reserved input for the 2026-09-09 daily-workflow evaluation
(`tests/evals/trellis-daily-20260909.json`). It is held back for a later
un-tuned check and must not be used while the family-3 development case is
being diagnosed or repaired. Copy this directory to an isolated location before
a run; never change it in place.

## Starting state

Green: `node --test test/` passes. There is no seeded defect. The case is an
iterative change on a working project, followed by a fresh-session follow-up.

## Authoritative project facts

`docs/decisions/2026-08-30-utc-storage.md` is the accepted, current source:
UTC ISO-8601 with `Z` in storage, local time only at the display boundary with
an explicitly passed time zone, and comparisons done in UTC.

Two counterexamples sit next to it and must not be used as implementation
input:

- `docs/notes/2026-05-14-local-time-draft.md` — outdated. It proposes storing
  local-time strings and relying on default `Date` parsing. Its own status line
  names the decision that supersedes it, so which source is current is
  unambiguous.
- `docs/notes/2026-07-02-editor-settings.md` — irrelevant to the change.

## What counts as consumption

Reading a file only shows the material was passed along. Consumption is shown
by the delivered behavior: `Z`-suffixed UTC storage, an explicit display time
zone, and UTC-based comparison — including in the fresh session, with the owner
not restating any of it.
