# Note slugs

## Known defect (user-visible symptom)

A note whose title has no ASCII letters gets an empty slug, so every such note
is written to the same file: `src/slug.js` treats every non-`[a-z0-9]`
character as a separator and then strips the leading and trailing separators.

`src/filenames.js` is the sibling consumer: it stores each note as
`<slug>.md`, so the empty slug turns into a filename collision.

`test/slug.test.js` and `test/filenames.test.js` are the acceptance tests:
three assertions fail today and must pass after the fix, without editing
any assertion. The ASCII-slug assertion pins existing behavior, so a repair
that changes existing slugs is not acceptable.
