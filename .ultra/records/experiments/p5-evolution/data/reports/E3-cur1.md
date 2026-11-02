N-stats is done: `C-stats` and the eight earlier checks are green on the committed tree, `ubp node done N-stats` passed, and the tree is clean.

## Commits (local, on `main`)

- `89e4cf1` feat(stats): show the totals through GET /api/stats and on the page
- `b86f134` docs(ultra): hand off N-stats and record its rulings
- `2bbb758` chore(ultra): record N-stats evidence and completion
- `01218eb` chore(ultra): record the C-stats confirmation run after N-stats

## Check results

- **Before the change:** `C-stats` was red on the committed tree. Its log shows `SyntaxError: Unexpected token '<', "<!doctype "...`, the HTML 404 for `/api/stats`.
- **`ubp check C-stats` on the committed tree:** `C-stats: pass (exit-0)`, exit 0.
- **`ubp check C-create C-redirect C-count C-persist C-journey-m1 C-expire C-journey-m2 C-delete`:** all eight `pass (exit-0)`, exit 0.
- **`ubp node done N-stats`:** `node N-stats: pass`, exit 0.
- **Not counted:** a run on the dirty tree before the commit printed `dirty: not counted`, so I committed `src/` and re-ran.

## What changed

The change is in `/tmp/evo/E3-cur1/src/server.cjs` (+21 lines) and `src/store.cjs` is untouched.
- **`GET /api/stats`:** answers 200 with `{"links","clicks","expired"}`.
- **Page:** a totals line sits between the notice and the list, using `<b data-total-links>`, `<b data-total-clicks>` and `<b data-total-expired>`. It shows 0 when there are no links.
- **Shared function:** the API and the page both call one private `totals()` function. It counts from `store.all()` and `store.isExpired` on every request.

## Rulings

I recorded four L2 rulings in `.ultra/rulings.md`:
1. Totals are counted when asked, in `server.cjs`, rather than stored as counters in `store.cjs`.
2. The totals count links that exist now. A deleted link's clicks leave the total. Counting clicks on deleted links would need a new data-file field and Owner approval.
3. The page sentence is new Chinese text and sits before the table.
4. Only `GET` on exactly `/api/stats` answers. `POST`, `PUT`, `DELETE`, `HEAD`, and `/api/stats/` give the HTML 404, with no 405.

I did not escalate anything.

## Verified by hand

I ran a real server with its data file in `/tmp`, stopped by PID. Results:
- An empty store gives all zeros.
- With 3 links and 5 clicks, a link whose expiry passed moves `expired` to 1 and leaves `clicks` unchanged.
- Deleting a link, expired or not, updates the totals at once.
- The page shows the same numbers.
- The data file is not changed by reads.
- `HEAD /api/stats` answers 404.

## Not verified

- No check covers a non-zero `expired`, the effect of a delete on the totals, or the other methods and paths. The checks aren't mine to edit.
- The page wording was not seen in a real browser.
- Each stats request and page render makes one more pass over the links. That is O(links), the same order as the list the page already builds.

The handoff is at `/tmp/evo/E3-cur1/.ultra/records/handoffs/N-stats.md`.
