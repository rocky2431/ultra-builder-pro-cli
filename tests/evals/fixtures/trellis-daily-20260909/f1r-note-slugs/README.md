# Family 1 reserved fixture — note slugs

Reserved input for the 2026-09-09 daily-workflow evaluation
(`tests/evals/trellis-daily-20260909.json`). It is held back for a later
un-tuned check and must not be used while the family-1 development case is
being diagnosed or repaired. Copy this directory to an isolated location before
a run; never repair it in place.

## Seeded defect (owner-visible symptom)

A note whose title has no ASCII letters gets an empty slug, so every such note
is written to the same file: `src/slug.js` treats every non-`[a-z0-9]`
character as a separator and then strips the leading and trailing separators.

`src/filenames.js` is the sibling consumer: it stores each note as
`<slug>.md`, so the empty slug turns into a filename collision.

`test/slug.test.js` and `test/filenames.test.js` are frozen acceptance: three
assertions fail on this fixture and must pass after the fix, without editing
any assertion. The ASCII-slug assertion pins existing behavior, so a repair
that changes existing slugs is not acceptable.
