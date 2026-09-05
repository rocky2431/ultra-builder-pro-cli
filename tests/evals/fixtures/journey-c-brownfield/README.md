# Journey C brownfield fixture — recipe log

Frozen input for the 2026-09-05 owner-journey evaluation
(`docs/evals/owner-journey-eval-2026-09-05.md`). Copy this directory to an
isolated location before a run; never repair it in place.

## Seeded defect (owner-visible symptom)

Filtering by month counts the next month's first day as part of the selected
month. Root cause: `src/filter.js` compares `time <= end` where `end` is the
*exclusive* first instant of the next month, so an item dated exactly at that
instant is included. `src/export.js` consumes the same function, so the export
inherits the wrong boundary.

`test/month-filter.test.js` and `test/export-markdown.test.js` are frozen
acceptance: they fail on this fixture and must pass after the fix, without
editing the assertions.
