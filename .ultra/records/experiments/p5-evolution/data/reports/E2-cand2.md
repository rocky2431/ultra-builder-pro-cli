Node N-search is done: `C-search` is green, the eight regression checks stay green, and `ubp node done N-search` passed. Nothing was escalated. All work is in `/tmp/evo/E2-cand2` on `main`, the tree is clean, and no server is left running.

## Commits
| Hash | Subject |
|---|---|
| `2eb1a4b` | feat(search): find links by their target (REQ-search) |
| `c496be4` | docs(ultra): hand off N-search and record its rulings |
| `1e2d227` | chore(ultra): record N-search evidence and completion |

The last commit also contains nine ledger lines that were already uncommitted when I started (the controller's 18:03Z setup runs). I committed them unchanged.

## Checks
- **`C-search`:** red before the change (exit 1), `pass (exit-0)` after, 2 tests.
- **Regression set:** `C-create C-redirect C-count C-persist C-journey-m1 C-expire C-journey-m2 C-delete` each printed `pass (exit-0)`, command exit 0.
- **`ubp node done N-search`:** printed `node N-search: pass`, exit 0.
- **Evidence:** every ledger record for these runs has `dirty=false`.

## What changed
- **`src/store.cjs`:** a new `search(text)`, the tenth export. It is the one place that decides what matches, and both the API and the page call it.
- **`src/server.cjs`:** `GET /api/links?q=` and `GET /?q=` use `search`. The page gets a GET search form (field `q`, shows the text again escaped) and says `没有匹配的链接。` when nothing matches.
- **Handoff and rulings:** `/tmp/evo/E2-cand2/.ultra/records/handoffs/N-search.md` and four L2 lines appended to `/tmp/evo/E2-cand2/.ultra/rulings.md`.

## Two things the checks would not have caught
1. **Query parsing.** The old `split('?')` dropped everything after a second `?`, so `?q=a?b` would have searched for `a`. It now cuts at the first `?` and reads `q` with `URLSearchParams`. As a side effect, `/?created=<code>?x` is now ignored instead of reading `<code>`; only a hand-written URL can do this.
2. **Case handling.** With `toLowerCase`, `ΟΔΥΣ`, the first letters of a stored `ΟΔΥΣΣΕΑΣ` link, did not find that link, because Greek Σ lowers to `σ` or `ς` by position. I confirmed this with a run and switched both sides to `toUpperCase`. The price: `ß` matches `SS`, and a dotless `ı` matches `I`/`i`. Accented text typed in different Unicode forms (NFC vs NFD) does not match, because matching is literal.

## Hand probes
A probe script drove the real server with 15 awkward links and about 60 queries, then restarted it on the same file. The last run had 321 assertions, all passing.
- **Consistency:** the API and the page returned the same links for every query, before and after the restart.
- **Awkward input:** wildcards, `% ? # & = +`, bad percent escapes, whitespace-only text, non-ASCII, HTML characters and a 10000-character value all behaved.
- **Existing requirements:** a search never writes the file or counts a click. Expired, deleted, form-created and clicked links all behave correctly in search.
- **Two probe mistakes:** two failures were wrong expectations in my probe, not code bugs (`(` and `()` against `alert(1)`).

## What no check pins (also listed in the handoff)
- Literal handling of special characters, `+` against `%2B`, the first of several `q`, whitespace-only `q`, non-ASCII and Greek case, escaping of the echoed `q`, the no-match message, and results after a restart.
- Node's own limits: a request line over about 16 KiB gets `431` before the handler runs, raw non-ASCII bytes in the request line get `400`, and `HEAD` is not served (as before).
- Not run in a real browser.
- Creating a link goes back to the full list; the search text is not carried through (ruled L2).
- Decision for the Owner: whitespace-only `q` is a literal search for spaces, which follows "matched literally" but may surprise someone who pastes a trailing space.
