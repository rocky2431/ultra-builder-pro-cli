Gate record for M-P1 ("engine minimal core"), commit `fb8ec70` on branch `v6`. I made no changes to the work tree, and my scratch files under `/tmp` are deleted.

**fb8ec70 carries what I approved, plus two documentation-only sentences.**
- `fb8ec70`'s parent is `fe439b6`. It changes 18 files, the same 18 as the closure patch I reviewed (`p1-closure.patch`).
- 17 of the 18 files match that patch line for line: all 12 `engine/*.cjs` modules, `tests/engine-p1.test.cjs`, `tests/engine-boundaries.test.cjs`, `tests/package-smoke.test.cjs`, `bin/install.js` and `package.json`.
- The only difference is in `engine/FORMATS.md` (404 → 409 lines). Two places gain a sentence naming a limit, which is one of the two fixes I offered in the closure check:
  - At `:80-83`, the rule for mistyped requirement headings now says that headings without `REQ-`, such as `## Req-7`, `## REQ 8` or `## REQ_9`, are ordinary sections and are not counted. This covers my N2.
  - At `:204-207`, the rule that record times never go backwards now says it only holds within one ledger file. Comparisons across files, such as the plan-change count against closure times, can still be skewed. This covers my N1, and the text says P2 fixes it.
- Both protected hashes in `p1-protected.sha256` match the files in the commit (`engine/FORMATS.md` and `tests/engine-p1.test.cjs`).

**Test evidence.** I did not rerun the tests on `fb8ec70`. Its code and tests are identical to the version that passed 96 of 96 in my closure check, and the commit adds only documentation.

**Findings**
- None blocking.
- N1 (low-medium) is now documented as a known limit, not fixed in P1. I spot-checked P2 without reviewing it: `97482db:engine/ledger.cjs:12,155-160` keeps record times increasing across all four ledgers, not only within one file, which is the fix N1 needs.
- N3 (low; readability) is still open and does not block:
  - An error message is wrapped twice in `engine/formats.cjs:91-93`.
  - The table that maps signals to exit codes appears in two files.
  - `ubp check` computes the status twice.
  - `engine/project.cjs` re-exports `codeState`, but nothing imports it from there.
- N4 (design note; it can only add caution, never overstate progress) is still open: every committed file under `.ultra/` that the engine does not own counts as code. Committing a file under `.ultra/decisions/` therefore makes every check stale.

Verdict: accept
