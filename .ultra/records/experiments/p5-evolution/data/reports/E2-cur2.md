N-search is done: `C-search` is green and `ubp node done N-search` passed. The eight earlier checks stayed green and the tree is clean.

**Commits** (on `main` in `/tmp/evo/E2-cur2`, nothing pushed or installed)
- `e912abd` feat(search): find links by their target (REQ-search)
- `28f3d3f` docs(ultra): hand off N-search and record its rulings
- `9abd81d` chore(ultra): record N-search evidence and completion. These are the ledger lines the engine wrote; I did not edit the ledger by hand.

**Checks**
- **Red baseline:** `ubp check C-search` on the committed tree before the change failed, exit 1.
- **After the change, on the clean committed tree:**
  - `ubp check C-search` printed `C-search: pass (exit-0)`, exit 0.
  - `ubp check C-create C-redirect C-count C-persist C-journey-m1 C-expire C-journey-m2 C-delete` printed eight `pass (exit-0)` lines, exit 0.
  - `ubp node done N-search` printed `node N-search: pass`, exit 0.
- **Direct test run:** all 29 tests in `test/*.test.cjs` pass.

**What changed** (`src/server.cjs` only; `store.cjs` is untouched)
- **Matching:** `GET /api/links?q=<text>` and `GET /?q=<text>` go through one `listing(text)` function that filters newest first. A link matches when its `url` contains the text, compared case-insensitively with `toLowerCase()` and plain `includes`, so there are no wildcards.
- **Page:** it gains a `GET /` search form with an escaped `q` field, and says `没有链接的原始链接包含“…”。` when a search finds nothing.
- **Query parsing:** the old `split('?')` cut a `q` containing a raw `?`, as in `?q=a?b`, so the query is now split at the first `?` only. One side effect: `/?created=abc?x` now reads `created` as `abc?x`, where it used to read `abc`. The service never builds such an address.

**Rulings** (three L2 lines in `.ultra/rulings.md`)
- **Matching rules:** the first `q` wins, there is no trimming, no normalization of percent-encoding or Unicode, and expired links are searchable.
- **Filter placement:** the filter lives in `server.cjs`, and the query is split at the first `?`.
- **Page details:** the form sits between the notice and the list, there is no clear-search link, and the no-match wording is as above.

Nothing was escalated; no requirement was changed or narrowed.

**By-hand probe against the real server** (scratch directory outside the repository)
- **Results:** it ran about 45 assertions on literal wildcards, regex characters, `+` versus `%20`, a lone `%`, a raw `?`, a second `q`, non-ASCII case, an expired link, escaping, and the `?q=` on the redirect, DELETE and POST routes.
- **First run:** two assertions failed because my expectations were wrong, not the server. I confirmed the actual values and fixed the expectations before the passing run.
- **Cleanup:** the servers were stopped by PID, and `ps` showed no process left. The probe script and data are in `/tmp/probe-search`.

**Unverified or left open**
- **Browser:** not run in a real browser; the form and layout were read from the response only.
- **Case folding:** it is the simple `toLowerCase()`, so `İ` lowercases to `i` plus a combining dot and a search for `i` also finds it; I verified this in Node.
- **Check coverage:** `C-search` pins only the basic cases, and the odd inputs above are covered only by my hand probe. This is listed in the handoff as something a later check could pin.
- **Ledger:** the ledger commit also contains the controller's 18:01 baseline lines, which were already uncommitted before I started; the commit message says so.

Handoff: `/tmp/evo/E2-cur2/.ultra/records/handoffs/N-search.md`
