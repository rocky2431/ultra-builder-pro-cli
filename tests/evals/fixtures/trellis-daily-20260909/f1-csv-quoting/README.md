# Family 1 development fixture — audit-trail CSV

Frozen input for the 2026-09-09 daily-workflow evaluation
(`tests/evals/trellis-daily-20260909.json`). Copy this directory to an isolated
location before a run; never repair it in place.

## Seeded defect (owner-visible symptom)

An audit note that contains a double quote comes out of the CSV export broken:
`src/csv.js` quotes a field only when it contains `,`, `\n` or `\r`, and never
doubles an inner `"`. So `said "ok", then left` is emitted as
`"said "ok", then left"`, which the spreadsheet import splits at the wrong
place.

`src/report.js` is the sibling consumer: it renders the whole trail through the
same row serializer, and its header line (`id,actor,note`) is imported as-is by
an existing spreadsheet template. A repair that quotes every field would fix
the note and break that consumer.

`test/csv-quoting.test.js` and `test/report-consistency.test.js` are frozen
acceptance: two assertions fail on this fixture and must pass after the fix,
without editing any assertion.
